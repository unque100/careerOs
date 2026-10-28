import { db } from 'hatchable';
import { respondToApiError } from 'lib/api-errors.js';
import { clean, logActivity, parseDate, consumeRateLimit } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];
const statuses=new Set(['interested','preparing','applied','recruiter_screening','assessment','technical_interview','hiring_manager','final_round','offer','accepted','rejected','withdrawn']);
async function handle(req,res){
 const user=String(req.user.id),b=req.body||{};
 const requestLimit=await consumeRateLimit(user,req.method==='GET'?'applications-read':'applications-write',req.method==='GET'?60:40,60);
 if(!requestLimit.allowed)return res.status(429).json({error:'Application tracker requests are rate-limited. Retry in '+requestLimit.retryAfterSeconds+' seconds.',retryAfterSeconds:requestLimit.retryAfterSeconds});
 if(req.method==='GET'){
  const r=await db.query('SELECT id,company,job_title,job_description_id,application_url,location,salary_min_inr,salary_max_inr,status,application_date,next_follow_up_at,resume_version,recruiter_contact,notes,created_at,updated_at FROM job_applications WHERE user_id=$1 ORDER BY CASE WHEN next_follow_up_at IS NULL THEN 1 ELSE 0 END,next_follow_up_at,updated_at DESC LIMIT 500',[user]);
  const stats=await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status NOT IN ('accepted','rejected','withdrawn'))::int AS active,count(*) FILTER(WHERE status IN ('offer','accepted'))::int AS offers,count(*) FILTER(WHERE status IN ('interested','preparing'))::int AS saved_preparing,count(*) FILTER(WHERE status='applied')::int AS applied,count(*) FILTER(WHERE status='assessment')::int AS assessments,count(*) FILTER(WHERE status IN ('recruiter_screening','technical_interview','hiring_manager','final_round'))::int AS interviews,count(*) FILTER(WHERE status='rejected')::int AS rejected,count(*) FILTER(WHERE status='withdrawn')::int AS withdrawn FROM job_applications WHERE user_id=$1",[user]);
  const [scheduled,taskLinks,mockLinks]=await Promise.all([
   db.query("SELECT ai.id,ai.application_id,ai.interview_session_id,ai.title,ai.scheduled_at,ai.format,ai.location_or_link,ai.reminder_at,ai.notes,ai.status FROM application_interviews ai WHERE ai.user_id=$1 ORDER BY ai.scheduled_at ASC",[user]),
   db.query("SELECT l.application_id,t.id AS task_id,t.roadmap_id,t.title,t.category,t.status,t.due_date,t.priority FROM application_roadmap_tasks l JOIN roadmap_tasks t ON t.id=l.task_id AND t.user_id=l.user_id WHERE l.user_id=$1 ORDER BY t.due_date NULLS LAST,t.id",[user]),
   db.query("SELECT l.application_id,s.id AS interview_session_id,s.title,s.interview_type,s.status,s.score,s.started_at,s.completed_at FROM application_interview_sessions l JOIN interview_sessions s ON s.id=l.interview_session_id AND s.user_id=l.user_id WHERE l.user_id=$1 ORDER BY s.started_at DESC",[user])
  ]);
  return res.json({applications:r.rows,stats:stats.rows[0],scheduledInterviews:scheduled.rows,linkedTasks:taskLinks.rows,linkedMockInterviews:mockLinks.rows});
 }
 if(req.method==='POST'&&b.action==='schedule-interview'){
  const applicationId=Number(b.applicationId),title=clean(b.title,180),scheduledAt=Date.parse(b.scheduledAt),format=['phone','video','onsite','other'].includes(b.format)?b.format:'video';
  if(!Number.isSafeInteger(applicationId)||applicationId<1||title.length<2||!Number.isFinite(scheduledAt))return res.status(400).json({error:'Choose an application, interview title and valid date/time.'});
  const app=await db.query('SELECT id,company,job_title FROM job_applications WHERE id=$1 AND user_id=$2',[applicationId,user]);
  if(!app.rows.length)return res.status(404).json({error:'Job application not found.'});
  const sessionId=b.interviewSessionId==null||b.interviewSessionId===''?null:Number(b.interviewSessionId);
  if(sessionId!==null){const own=await db.query('SELECT id FROM interview_sessions WHERE id=$1 AND user_id=$2',[sessionId,user]);if(!Number.isSafeInteger(sessionId)||!own.rows.length)return res.status(404).json({error:'Mock interview not found in your account.'})}
  const reminderMs=b.reminderAt?Date.parse(b.reminderAt):null;
  if(b.reminderAt&&!Number.isFinite(reminderMs))return res.status(400).json({error:'Choose a valid reminder date/time.'});
  if(reminderMs!==null&&reminderMs>scheduledAt)return res.status(400).json({error:'The reminder must be at or before the interview.'});
  const created=await db.query("INSERT INTO application_interviews(user_id,application_id,interview_session_id,title,scheduled_at,format,location_or_link,reminder_at,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,application_id,interview_session_id,title,scheduled_at,format,location_or_link,reminder_at,notes,status",[user,applicationId,sessionId,title,new Date(scheduledAt).toISOString(),format,clean(b.locationOrLink,600)||null,reminderMs===null?null:new Date(reminderMs).toISOString(),clean(b.notes,3000)||null]);
  if(sessionId!==null)await db.query('INSERT INTO application_interview_sessions(user_id,application_id,interview_session_id) VALUES($1,$2,$3) ON CONFLICT(application_id,interview_session_id) DO NOTHING',[user,applicationId,sessionId]);
  if(reminderMs!==null&&reminderMs>Date.now())await db.query("INSERT INTO career_reminders(user_id,title,description,category,due_at,related_type,related_id,email_enabled,browser_enabled) VALUES($1,$2,$3,'interview',$4,'application_interview',$5,true,true)",[user,'Interview reminder: '+title,app.rows[0].company+' · '+app.rows[0].job_title,new Date(reminderMs).toISOString(),String(created.rows[0].id)]);
  await db.query('UPDATE job_applications SET updated_at=now() WHERE id=$1 AND user_id=$2',[applicationId,user]);
  await logActivity(user,'application_interview_scheduled','application_interview',created.rows[0].id,{applicationId,scheduledAt:new Date(scheduledAt).toISOString(),format});
  return res.status(201).json({interview:created.rows[0]});
 }
 if(req.method==='POST'&&b.action==='update-scheduled-interview'){
  const interviewId=Number(b.interviewId),status=String(b.status||'scheduled');
  if(!Number.isSafeInteger(interviewId)||interviewId<1||!['scheduled','completed','cancelled'].includes(status))return res.status(400).json({error:'Choose a valid interview and status.'});
  const updated=await db.query('UPDATE application_interviews SET status=$3,notes=CASE WHEN $4::boolean THEN $5 ELSE notes END,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[interviewId,user,status,b.notes!==undefined,clean(b.notes,3000)||null]);
  if(!updated.rows.length)return res.status(404).json({error:'Scheduled interview not found.'});
  await logActivity(user,'application_interview_updated','application_interview',interviewId,{status});
  return res.json({interview:updated.rows[0]});
 }
 if(req.method==='POST'&&b.action==='delete-scheduled-interview'){
  const interviewId=Number(b.interviewId);
  const owned=await db.query('SELECT id FROM application_interviews WHERE id=$1 AND user_id=$2',[interviewId,user]);
  if(!owned.rows.length)return res.status(404).json({error:'Scheduled interview not found.'});
  await db.query("DELETE FROM career_reminders WHERE user_id=$1 AND related_type='application_interview' AND related_id=$2",[user,String(interviewId)]);
  const deleted=await db.query('DELETE FROM application_interviews WHERE id=$1 AND user_id=$2 RETURNING id',[interviewId,user]);
  if(!deleted.rows.length)return res.status(404).json({error:'Scheduled interview not found.'});
  return res.json({deleted:true});
 }
 if(req.method==='POST'&&b.action==='link-task'){
  const applicationId=Number(b.applicationId),taskId=Number(b.taskId);
  if(!Number.isSafeInteger(applicationId)||applicationId<1||!Number.isSafeInteger(taskId)||taskId<1)return res.status(400).json({error:'Choose an application and roadmap task.'});
  const [app,task]=await Promise.all([db.query('SELECT id FROM job_applications WHERE id=$1 AND user_id=$2',[applicationId,user]),db.query('SELECT id FROM roadmap_tasks WHERE id=$1 AND user_id=$2',[taskId,user])]);
  if(!app.rows.length||!task.rows.length)return res.status(404).json({error:'Application or roadmap task not found in your account.'});
  const linked=await db.query('INSERT INTO application_roadmap_tasks(user_id,application_id,task_id) VALUES($1,$2,$3) ON CONFLICT(application_id,task_id) DO NOTHING RETURNING id',[user,applicationId,taskId]);
  await logActivity(user,'application_task_linked','job_application',applicationId,{taskId});
  return res.json({linked:true,alreadyLinked:!linked.rows.length});
 }
 if(req.method==='POST'&&b.action==='unlink-task'){
  const deleted=await db.query('DELETE FROM application_roadmap_tasks WHERE user_id=$1 AND application_id=$2 AND task_id=$3 RETURNING id',[user,Number(b.applicationId),Number(b.taskId)]);
  return res.json({unlinked:!!deleted.rows.length});
 }
 if(req.method==='POST'&&b.action==='link-mock-interview'){
  const applicationId=Number(b.applicationId),sessionId=Number(b.interviewSessionId);
  if(!Number.isSafeInteger(applicationId)||applicationId<1||!Number.isSafeInteger(sessionId)||sessionId<1)return res.status(400).json({error:'Choose an application and mock interview.'});
  const [app,session]=await Promise.all([db.query('SELECT id FROM job_applications WHERE id=$1 AND user_id=$2',[applicationId,user]),db.query('SELECT id FROM interview_sessions WHERE id=$1 AND user_id=$2',[sessionId,user])]);
  if(!app.rows.length||!session.rows.length)return res.status(404).json({error:'Application or mock interview not found in your account.'});
  const linked=await db.query('INSERT INTO application_interview_sessions(user_id,application_id,interview_session_id) VALUES($1,$2,$3) ON CONFLICT(application_id,interview_session_id) DO NOTHING RETURNING id',[user,applicationId,sessionId]);
  await logActivity(user,'application_mock_interview_linked','job_application',applicationId,{interviewSessionId:sessionId});
  return res.json({linked:true,alreadyLinked:!linked.rows.length});
 }
 if(req.method==='POST'&&b.action==='unlink-mock-interview'){
  const deleted=await db.query('DELETE FROM application_interview_sessions WHERE user_id=$1 AND application_id=$2 AND interview_session_id=$3 RETURNING id',[user,Number(b.applicationId),Number(b.interviewSessionId)]);
  return res.json({unlinked:!!deleted.rows.length});
 }

 if(req.method==='POST'){
  const company=clean(b.company,160),title=clean(b.jobTitle,180),url=clean(b.applicationUrl,600);
  if(company.length<2||title.length<2)return res.status(400).json({error:'Company and job title are required.'});
  if(url){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error()}catch{return res.status(400).json({error:'Application URL must be valid http or https without embedded credentials.'})}}
  const status=statuses.has(b.status)?b.status:'interested';
  const min=b.salaryMinInr==null||b.salaryMinInr===''?null:Number(b.salaryMinInr),max=b.salaryMaxInr==null||b.salaryMaxInr===''?null:Number(b.salaryMaxInr);
  if((min!==null&&(!Number.isSafeInteger(min)||min<0))||(max!==null&&(!Number.isSafeInteger(max)||max<0))||(min!==null&&max!==null&&max<min))return res.status(400).json({error:'Salary range must use valid non-negative INR values, with maximum no less than minimum.'});
  const jd=b.jobDescriptionId==null||b.jobDescriptionId===''?null:Number(b.jobDescriptionId);
  if(jd!==null){const own=await db.query('SELECT id FROM job_descriptions WHERE id=$1 AND user_id=$2',[jd,user]);if(!own.rows.length)return res.status(404).json({error:'Saved job description not found.'})}
  const follow=b.nextFollowUpAt?Date.parse(b.nextFollowUpAt):null;
  if(b.nextFollowUpAt&&!Number.isFinite(follow))return res.status(400).json({error:'Invalid follow-up date/time.'});
  const applicationDate=b.applicationDate?parseDate(b.applicationDate):null;
  if(b.applicationDate&&!applicationDate)return res.status(400).json({error:'Application date must be a real calendar date in YYYY-MM-DD format.'});
  const sourceJobId=clean(b.sourceJobId,240)||null;
  const r=await db.query('INSERT INTO job_applications(user_id,company,job_title,job_description_id,application_url,source_job_id,location,salary_min_inr,salary_max_inr,status,application_date,next_follow_up_at,resume_version,recruiter_contact,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[user,company,title,jd,url||null,sourceJobId,clean(b.location,160)||null,min,max,status,applicationDate,follow===null?null:new Date(follow).toISOString(),clean(b.resumeVersion,100)||null,clean(b.recruiterContact,240)||null,clean(b.notes,3000)||null]);
  await logActivity(user,'job_application_created','job_application',r.rows[0].id,{status,company});
  return res.status(201).json({application:r.rows[0]});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid application ID required.'});
 const own=await db.query('SELECT id FROM job_applications WHERE id=$1 AND user_id=$2',[id,user]);
 if(!own.rows.length)return res.status(404).json({error:'Job application not found.'});
 if(req.method==='DELETE'){
  await db.query("DELETE FROM career_reminders WHERE user_id=$1 AND related_type='application_interview' AND related_id IN (SELECT ai.id::text FROM application_interviews ai WHERE ai.user_id=$1 AND ai.application_id=$2)",[user,id]);
  await db.query('DELETE FROM job_applications WHERE id=$1 AND user_id=$2',[id,user]);
  await logActivity(user,'job_application_deleted','job_application',id,{});return res.json({deleted:true})
 }
 const status=b.status===undefined?null:String(b.status);
 if(status&&!statuses.has(status))return res.status(400).json({error:'Unsupported application status.'});
 const url=b.applicationUrl===undefined?null:(b.applicationUrl?(()=>{try{const u=new URL(String(b.applicationUrl));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined}catch{return undefined}})():null);
  if(b.applicationUrl!==undefined&&url===undefined)return res.status(400).json({error:'Application URL must be valid http or https.'});
  const follow=b.nextFollowUpAt===undefined?undefined:(b.nextFollowUpAt?Date.parse(b.nextFollowUpAt):null);
  if(b.nextFollowUpAt!==undefined&&b.nextFollowUpAt&&!Number.isFinite(follow))return res.status(400).json({error:'Follow-up date/time must be valid.'});
  const applicationDate=b.applicationDate===undefined?undefined:(b.applicationDate?parseDate(b.applicationDate):null);
  if(b.applicationDate!==undefined&&b.applicationDate&&!applicationDate)return res.status(400).json({error:'Application date must be a real calendar date in YYYY-MM-DD format.'});
  const r=await db.query('UPDATE job_applications SET status=COALESCE($3,status),notes=CASE WHEN $4::boolean THEN $5 ELSE notes END,next_follow_up_at=CASE WHEN $6::boolean THEN $7::timestamptz ELSE next_follow_up_at END,application_date=CASE WHEN $8::boolean THEN $9::date ELSE application_date END,application_url=CASE WHEN $10::boolean THEN $11::text ELSE application_url END,resume_version=CASE WHEN $12::boolean THEN $13::text ELSE resume_version END,recruiter_contact=CASE WHEN $14::boolean THEN $15::text ELSE recruiter_contact END,updated_at=now(),last_activity_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[id,user,status,b.notes!==undefined,b.notes===undefined?null:clean(b.notes,3000),b.nextFollowUpAt!==undefined,follow===undefined?null:(follow===null?null:new Date(follow).toISOString()),b.applicationDate!==undefined,applicationDate===undefined?null:applicationDate,b.applicationUrl!==undefined,url||null,b.resumeVersion!==undefined,clean(b.resumeVersion,100)||null,b.recruiterContact!==undefined,clean(b.recruiterContact,240)||null]);
 await logActivity(user,'job_application_updated','job_application',id,{status:r.rows[0].status});
 return res.json({application:r.rows[0]});
}

export default async function(req,res){
 try{return await handle(req,res)}catch(error){return respondToApiError('api/applications.js',error,req,res)}
}