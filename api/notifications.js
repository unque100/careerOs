import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';

export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];

const CATEGORIES = new Set(['general','job','roadmap','goal','dsa','system_design','interview','custom']);
const STATUSES = new Set(['attempted','solved','needs_revision','skipped']);
function safeTimezone(value) {
  const tz=clean(value,80)||'Asia/Kolkata';
  try { new Intl.DateTimeFormat('en-US',{timeZone:tz}).format(new Date()); return tz; }
  catch { return ''; }
}
function validUrl(value) {
  if(!value)return null;
  try { const u=new URL(String(value)); return ['https:','http:'].includes(u.protocol)?u.href:null; }
  catch { return null; }
}
function dateIso(value) { const ms=Date.parse(value);return Number.isFinite(ms)?new Date(ms).toISOString():null; }
async function insertNotification(user,{dedupeKey,kind,title,body,href,sourceType,sourceId}) {
  const result = await db.query('INSERT INTO career_notifications(user_id,dedupe_key,kind,title,body,href,source_type,source_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,dedupe_key) DO NOTHING',
    [user,dedupeKey,kind,clean(title,180),clean(body,1200),validUrl(href),sourceType||null,sourceId==null?null:String(sourceId)]);
  return result;
}
async function syncTrackerNotifications(user) {
  const jobs=await db.query("SELECT id,company,job_title,next_follow_up_at,status FROM job_applications WHERE user_id=$1 AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= now()+interval '24 hours' AND status NOT IN ('rejected','withdrawn','accepted') ORDER BY next_follow_up_at ASC LIMIT 30",[user]);
  for(const x of jobs.rows) {
    const at=new Date(x.next_follow_up_at).toISOString();
    await insertNotification(user,{dedupeKey:'job-followup:'+x.id+':'+at,kind:'job_follow_up',title:'Job follow-up due',body:x.company+' · '+x.job_title+' — follow up on your application.',href:'https://careeros-beg4.hatchable.site/?pane=jobs',sourceType:'job_application',sourceId:x.id});
  }
  const scheduled=await db.query("SELECT ai.id,ai.application_id,ai.title,ai.scheduled_at,ai.reminder_at,ai.format,a.company,a.job_title FROM application_interviews ai JOIN job_applications a ON a.id=ai.application_id AND a.user_id=ai.user_id WHERE ai.user_id=$1 AND ai.status='scheduled' AND ai.scheduled_at>now() AND COALESCE(ai.reminder_at,ai.scheduled_at-interval '1 hour')<=now()+interval '24 hours' ORDER BY COALESCE(ai.reminder_at,ai.scheduled_at-interval '1 hour') LIMIT 50",[user]);
  for(const x of scheduled.rows) {
    const at=new Date(x.reminder_at||new Date(new Date(x.scheduled_at).getTime()-3600000)).toISOString();
    await insertNotification(user,{dedupeKey:'application-interview:'+x.id+':'+at,kind:'interview',title:'Upcoming job interview',body:x.company+' · '+x.job_title+' — '+x.title+' at '+new Date(x.scheduled_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})+'.',href:'https://careeros-beg4.hatchable.site/?pane=jobs',sourceType:'application_interview',sourceId:x.id});
  }
  const tasks=await db.query("SELECT id,title,category,due_date,status FROM roadmap_tasks WHERE user_id=$1 AND due_date IS NOT NULL AND due_date <= CURRENT_DATE+1 AND status IN ('todo','in_progress') ORDER BY due_date ASC LIMIT 40",[user]);
  for(const x of tasks.rows) {
    await insertNotification(user,{dedupeKey:'roadmap-task:'+x.id+':'+x.due_date,kind:'task_due',title:'Roadmap task due',body:x.title+' — '+x.category+' task due '+x.due_date+'.',href:'https://careeros-beg4.hatchable.site/?pane=roadmap',sourceType:'roadmap_task',sourceId:x.id});
  }
  const goals=await db.query("SELECT id,title,target_date FROM career_goals WHERE user_id=$1 AND target_date IS NOT NULL AND target_date <= CURRENT_DATE+3 AND status='active' ORDER BY target_date ASC LIMIT 25",[user]);
  for(const x of goals.rows) {
    await insertNotification(user,{dedupeKey:'career-goal:'+x.id+':'+x.target_date,kind:'goal_due',title:'Career goal deadline approaching',body:x.title+' — target date '+x.target_date+'.',href:'https://careeros-beg4.hatchable.site/?pane=goals',sourceType:'career_goal',sourceId:x.id});
  }
  const reminders=await db.query("SELECT id,title,description,due_at,category FROM career_reminders WHERE user_id=$1 AND completed_at IS NULL AND due_at <= now()+interval '24 hours' ORDER BY due_at ASC LIMIT 50",[user]);
  for(const x of reminders.rows) {
    const at=new Date(x.due_at).toISOString();
    await insertNotification(user,{dedupeKey:'career-reminder:'+x.id+':'+at,kind:'reminder',title:x.title,body:x.description||'Your '+x.category.replaceAll('_',' ')+' reminder is due.',href:'https://careeros-beg4.hatchable.site/?pane=notifications',sourceType:'career_reminder',sourceId:x.id});
  }
}
export default async function(req,res) {
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET') {
  await db.query('INSERT INTO notification_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[user]);
  await syncTrackerNotifications(user);
  const [prefs,notifications,reminders,counts,jobs,tasks]=await Promise.all([
   db.query('SELECT email_reminders_enabled,browser_notifications_enabled,daily_summary_enabled,timezone,reminder_hour_local,last_email_date FROM notification_preferences WHERE user_id=$1',[user]),
   db.query('SELECT id,kind,title,body,href,source_type,source_id,read_at,email_sent_at,created_at FROM career_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user]),
   db.query('SELECT id,title,description,category,due_at,related_type,related_id,email_enabled,browser_enabled,completed_at,email_sent_at,created_at FROM career_reminders WHERE user_id=$1 ORDER BY completed_at NULLS FIRST,due_at ASC LIMIT 100',[user]),
   db.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE read_at IS NULL)::int AS unread FROM career_notifications WHERE user_id=$1',[user]),
   db.query("SELECT count(*)::int AS followups_due FROM job_applications WHERE user_id=$1 AND next_follow_up_at IS NOT NULL AND next_follow_up_at<=now()+interval '7 days' AND status NOT IN ('rejected','withdrawn','accepted')",[user]),
   db.query("SELECT count(*)::int AS tasks_due FROM roadmap_tasks WHERE user_id=$1 AND due_date IS NOT NULL AND due_date<=CURRENT_DATE+7 AND status IN ('todo','in_progress')",[user])
  ]);
  return res.json({preferences:prefs.rows[0],notifications:notifications.rows,reminders:reminders.rows,counts:counts.rows[0],tracker:{followupsDue:Number(jobs.rows[0].followups_due||0),tasksDue:Number(tasks.rows[0].tasks_due||0)},delivery:{emailProvider:'CareerOS email service',browser:'Browser notifications require permission and the workspace to be open; standard background push delivery is not configured yet.'}});
 }
 const action=clean(b.action,40);
 if(req.method==='POST'&&action==='preferences') {
  const tz=safeTimezone(b.timezone);if(!tz)return res.status(400).json({error:'Choose a valid time zone.'});
  const hour=Number(b.reminderHourLocal);
  if(!Number.isInteger(hour)||hour<0||hour>23)return res.status(400).json({error:'Reminder hour must be between 0 and 23.'});
  const r=await db.query('INSERT INTO notification_preferences(user_id,email_reminders_enabled,browser_notifications_enabled,daily_summary_enabled,timezone,reminder_hour_local,updated_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(user_id) DO UPDATE SET email_reminders_enabled=EXCLUDED.email_reminders_enabled,browser_notifications_enabled=EXCLUDED.browser_notifications_enabled,daily_summary_enabled=EXCLUDED.daily_summary_enabled,timezone=EXCLUDED.timezone,reminder_hour_local=EXCLUDED.reminder_hour_local,updated_at=now() RETURNING email_reminders_enabled,browser_notifications_enabled,daily_summary_enabled,timezone,reminder_hour_local,last_email_date',
    [user,!!b.emailRemindersEnabled,!!b.browserNotificationsEnabled,!!b.dailySummaryEnabled,tz,hour]);
  await logActivity(user,'notification_preferences_updated','notification_preferences',user,{email:!!b.emailRemindersEnabled,browser:!!b.browserNotificationsEnabled,digest:!!b.dailySummaryEnabled});
  return res.json({preferences:r.rows[0],message:'Notification preferences saved.'});
 }
 if(req.method==='POST'&&action==='create-reminder') {
  const title=clean(b.title,180),description=clean(b.description,1200),dueAt=dateIso(b.dueAt);
  if(title.length<3)return res.status(400).json({error:'Reminder title must be at least 3 characters.'});
  if(!dueAt||Date.parse(dueAt)<Date.now()-60000)return res.status(400).json({error:'Choose a valid future reminder date and time.'});
  if(Date.parse(dueAt)>Date.now()+366*86400000)return res.status(400).json({error:'Reminder date must be within the next year.'});
  const category=CATEGORIES.has(b.category)?b.category:'custom';
  const r=await db.query('INSERT INTO career_reminders(user_id,title,description,category,due_at,related_type,related_id,email_enabled,browser_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,title,description,category,due_at,related_type,related_id,email_enabled,browser_enabled,completed_at,email_sent_at,created_at',
    [user,title,description||null,category,dueAt,clean(b.relatedType,80)||null,clean(b.relatedId,100)||null,b.emailEnabled!==false,b.browserEnabled!==false]);
  await logActivity(user,'career_reminder_created','career_reminder',r.rows[0].id,{category,dueAt});
  return res.status(201).json({reminder:r.rows[0],message:'Reminder created.'});
 }
 if(req.method==='POST'&&action==='mark-read') {
  const ids=Array.isArray(b.ids)?b.ids.map(Number).filter(n=>Number.isSafeInteger(n)&&n>0).slice(0,100):[];
  if(b.all===true)await db.query('UPDATE career_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1',[user]);
  else if(ids.length)await db.query('UPDATE career_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND id=ANY($2::bigint[])',[user,ids]);
  return res.json({markedRead:true});
 }
 if(req.method==='POST'&&action==='complete-reminder') {
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid reminder ID required.'});
  const r=await db.query('UPDATE career_reminders SET completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,completed_at',[id,user]);
  if(!r.rows.length)return res.status(404).json({error:'Reminder not found.'});
  await logActivity(user,'career_reminder_completed','career_reminder',id,{});
  return res.json({reminder:r.rows[0]});
 }
 if(req.method==='POST'&&action==='delete-reminder') {
  const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid reminder ID required.'});
  const r=await db.query('DELETE FROM career_reminders WHERE id=$1 AND user_id=$2 RETURNING id',[id,user]);
  if(!r.rows.length)return res.status(404).json({error:'Reminder not found.'});
  return res.json({deleted:true});
 }
 if(req.method==='POST'&&action==='save-attempt') {
  const slug=clean(b.problemSlug,180);
  if(!/^leetcode-[a-z0-9-]{1,160}$/.test(slug))return res.status(400).json({error:'Select a LeetCode problem.'});
  if(!STATUSES.has(b.status))return res.status(400).json({error:'Invalid attempt status.'});
  const minutes=Math.max(0,Math.min(100000,Math.floor(Number(b.actualMinutes)||0)));
  const r=await db.query('INSERT INTO coding_attempts(user_id,problem_id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes) VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8) RETURNING id,problem_slug,status,attempted_at',[user,slug,b.status,clean(b.language,60)||null,clean(b.approachNotes,5000)||null,clean(b.timeComplexity,80)||null,clean(b.spaceComplexity,80)||null,minutes]);
  await logActivity(user,'leetcode_attempt_saved','leetcode_problem',slug,{status:b.status,minutes});
  return res.status(201).json({attempt:r.rows[0]});
 }
 return res.status(400).json({error:'Unsupported notification action.'});
}