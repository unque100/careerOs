import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];
const statuses=new Set(['interested','preparing','applied','recruiter_screening','assessment','technical_interview','hiring_manager','final_round','offer','accepted','rejected','withdrawn']);
export default async function(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const r=await db.query('SELECT id,company,job_title,job_description_id,application_url,location,salary_min_inr,salary_max_inr,status,application_date,next_follow_up_at,resume_version,recruiter_contact,notes,created_at,updated_at FROM job_applications WHERE user_id=$1 ORDER BY CASE WHEN next_follow_up_at IS NULL THEN 1 ELSE 0 END,next_follow_up_at,updated_at DESC LIMIT 500',[user]);
  const stats=await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status NOT IN ('accepted','rejected','withdrawn'))::int AS active,count(*) FILTER(WHERE status IN ('offer','accepted'))::int AS offers FROM job_applications WHERE user_id=$1",[user]);
  return res.json({applications:r.rows,stats:stats.rows[0]});
 }
 if(req.method==='POST'){
  const company=clean(b.company,160),title=clean(b.jobTitle,180),url=clean(b.applicationUrl,600);
  if(company.length<2||title.length<2)return res.status(400).json({error:'Company and job title are required.'});
  if(url){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error()}catch{return res.status(400).json({error:'Application URL must be valid http or https.'})}}
  const status=statuses.has(b.status)?b.status:'interested';
  const min=b.salaryMinInr==null||b.salaryMinInr===''?null:Number(b.salaryMinInr),max=b.salaryMaxInr==null||b.salaryMaxInr===''?null:Number(b.salaryMaxInr);
  if((min!==null&&(!Number.isSafeInteger(min)||min<0))||(max!==null&&(!Number.isSafeInteger(max)||max<0))||(min!==null&&max!==null&&max<min))return res.status(400).json({error:'Salary range must use valid non-negative INR values, with maximum no less than minimum.'});
  const jd=b.jobDescriptionId==null||b.jobDescriptionId===''?null:Number(b.jobDescriptionId);
  if(jd!==null){const own=await db.query('SELECT id FROM job_descriptions WHERE id=$1 AND user_id=$2',[jd,user]);if(!own.rows.length)return res.status(404).json({error:'Saved job description not found.'})}
  const follow=b.nextFollowUpAt||null;
  if(follow&&Number.isNaN(Date.parse(follow)))return res.status(400).json({error:'Invalid follow-up date.'});
  const r=await db.query('INSERT INTO job_applications(user_id,company,job_title,job_description_id,application_url,location,salary_min_inr,salary_max_inr,status,application_date,next_follow_up_at,resume_version,recruiter_contact,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',[user,company,title,jd,url||null,clean(b.location,160)||null,min,max,status,b.applicationDate||null,follow,clean(b.resumeVersion,100)||null,clean(b.recruiterContact,240)||null,clean(b.notes,3000)||null]);
  await logActivity(user,'job_application_created','job_application',r.rows[0].id,{status,company});
  return res.status(201).json({application:r.rows[0]});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid application ID required.'});
 const own=await db.query('SELECT id FROM job_applications WHERE id=$1 AND user_id=$2',[id,user]);
 if(!own.rows.length)return res.status(404).json({error:'Job application not found.'});
 if(req.method==='DELETE'){await db.query('DELETE FROM job_applications WHERE id=$1 AND user_id=$2',[id,user]);await logActivity(user,'job_application_deleted','job_application',id,{});return res.json({deleted:true})}
 const status=b.status===undefined?null:String(b.status);
 if(status&&!statuses.has(status))return res.status(400).json({error:'Unsupported application status.'});
 const r=await db.query('UPDATE job_applications SET status=COALESCE($3,status),notes=COALESCE($4,notes),next_follow_up_at=CASE WHEN $5::boolean THEN $6::timestamptz ELSE next_follow_up_at END,application_date=CASE WHEN $7::boolean THEN $8::date ELSE application_date END,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[id,user,status,b.notes===undefined?null:clean(b.notes,3000),b.nextFollowUpAt!==undefined,b.nextFollowUpAt||null,b.applicationDate!==undefined,b.applicationDate||null]);
 await logActivity(user,'job_application_updated','job_application',id,{status:r.rows[0].status});
 return res.json({application:r.rows[0]});
}