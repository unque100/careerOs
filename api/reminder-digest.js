import { db, email } from 'hatchable';

export const access = 'scheduler';
export const methods = ['POST'];

function escapeHtml(value) {
 return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeTimezone(value) {
 try { new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date());return value; }
 catch { return 'Asia/Kolkata'; }
}
export default async function(req,res) {
 const recipients=await db.query("SELECT u.id AS user_id,u.email,u.name,p.email_reminders_enabled,p.daily_summary_enabled,p.timezone,p.reminder_hour_local,((p.last_email_date IS NULL OR p.last_email_date < (now() AT TIME ZONE COALESCE(p.timezone,'Asia/Kolkata'))::date) AND extract(hour FROM (now() AT TIME ZONE COALESCE(p.timezone,'Asia/Kolkata')))::int>=p.reminder_hour_local) AS digest_due FROM notification_preferences p JOIN users u ON u.id=p.user_id WHERE (p.email_reminders_enabled=true OR p.daily_summary_enabled=true) AND (((p.last_email_date IS NULL OR p.last_email_date < (now() AT TIME ZONE COALESCE(p.timezone,'Asia/Kolkata'))::date) AND extract(hour FROM (now() AT TIME ZONE COALESCE(p.timezone,'Asia/Kolkata')))::int>=p.reminder_hour_local) OR (p.email_reminders_enabled=true AND EXISTS (SELECT 1 FROM career_reminders r WHERE r.user_id=p.user_id AND r.email_enabled=true AND r.completed_at IS NULL AND r.email_sent_at IS NULL AND r.due_at<=now()+interval '1 hour'))) ORDER BY p.updated_at ASC LIMIT 10");
 let sent=0,skipped=0,failed=0;
 for(const user of recipients.rows) {
  const tz=safeTimezone(user.timezone),dailyDue=!!user.digest_due;
  const todayResult=await db.query("SELECT (now() AT TIME ZONE $1)::date::text AS local_today,((now() AT TIME ZONE $1)::date+1)::text AS tomorrow",[tz]);
  const tomorrow=todayResult.rows[0].tomorrow;
  const [reminders,jobs,tasks,goals]=await Promise.all([
   user.email_reminders_enabled?db.query("SELECT id,title,description,due_at,category FROM career_reminders WHERE user_id=$1 AND email_enabled=true AND completed_at IS NULL AND email_sent_at IS NULL AND due_at<=now()+interval '1 hour' ORDER BY due_at ASC LIMIT 15",[user.user_id]):Promise.resolve({rows:[]}),
   dailyDue?db.query("SELECT id,company,job_title,next_follow_up_at,status FROM job_applications WHERE user_id=$1 AND next_follow_up_at IS NOT NULL AND next_follow_up_at<=now()+interval '24 hours' AND status NOT IN ('rejected','withdrawn','accepted') ORDER BY next_follow_up_at ASC LIMIT 10",[user.user_id]):Promise.resolve({rows:[]}),
   dailyDue?db.query("SELECT id,title,due_date,priority,status FROM roadmap_tasks WHERE user_id=$1 AND due_date IS NOT NULL AND due_date<=$2::date AND status IN ('todo','in_progress') ORDER BY due_date ASC LIMIT 10",[user.user_id,tomorrow]):Promise.resolve({rows:[]}),
   dailyDue?db.query("SELECT id,title,target_date FROM career_goals WHERE user_id=$1 AND target_date IS NOT NULL AND target_date<=$2::date AND status='active' ORDER BY target_date ASC LIMIT 8",[user.user_id,tomorrow]):Promise.resolve({rows:[]})
  ]);
  const items=[
   ...reminders.rows.map(x=>({type:'Reminder',title:x.title,when:new Date(x.due_at).toLocaleString('en-IN',{timeZone:tz}),detail:x.description||x.category.replaceAll('_',' '),reminderId:x.id})),
   ...jobs.rows.map(x=>({type:'Job follow-up',title:x.company+' · '+x.job_title,when:new Date(x.next_follow_up_at).toLocaleString('en-IN',{timeZone:tz}),detail:'Follow up on this application.'})),
   ...tasks.rows.map(x=>({type:'Roadmap task',title:x.title,when:x.due_date,detail:'Priority: '+x.priority+' · '+x.status.replaceAll('_',' ')})),
   ...goals.rows.map(x=>({type:'Career goal',title:x.title,when:x.target_date,detail:'Review progress against this goal.'}))
  ];
  if(items.length===0){skipped++;continue}
  const onlyDueReminders=reminders.rows.length>0&&!dailyDue&&jobs.rows.length===0&&tasks.rows.length===0&&goals.rows.length===0;
  const subject=(onlyDueReminders?'CareerOS reminder':'CareerOS tracker digest')+' · '+items.length+' item'+(items.length===1?'':'s');
  const textBody='Your CareerOS reminders\n\n'+items.map(x=>x.type+': '+x.title+'\nWhen: '+x.when+'\n'+x.detail).join('\n\n')+'\n\nOpen CareerOS: https://careeros-beg4.hatchable.site/?pane=notifications\nManage notification settings from Notification Center.';
  const htmlBody='<div style="font-family:Arial,sans-serif;background:#0b1324;color:#eaf0ff;padding:24px"><div style="max-width:640px;margin:auto"><p style="color:#8aa8ff;letter-spacing:2px;font-size:11px">CAREEROS · YOUR COMMAND LAYER</p><h1 style="font-size:24px">Your next steps are ready.</h1><p style="color:#b8c5dc">Here is the tracker activity and reminders due soon.</p><div style="background:#121e33;border:1px solid #2c3e5c;border-radius:14px;padding:16px">'+items.map(x=>'<div style="padding:12px 0;border-bottom:1px solid #27364e"><span style="color:#8fa7ff;font-size:11px">'+escapeHtml(x.type.toUpperCase())+'</span><h3 style="margin:6px 0;font-size:15px">'+escapeHtml(x.title)+'</h3><p style="margin:4px 0;color:#bdc9de;font-size:12px">When: '+escapeHtml(x.when)+'</p><p style="margin:4px 0;color:#a8b7d0;font-size:12px">'+escapeHtml(x.detail)+'</p></div>').join('')+'</div><p style="margin-top:20px"><a style="background:#7288f5;color:white;text-decoration:none;border-radius:9px;padding:12px 16px;display:inline-block;font-weight:bold" href="https://careeros-beg4.hatchable.site/?pane=notifications">Open Notification Center</a></p><p style="font-size:11px;color:#8493ae">You received this because email reminders or the daily summary are enabled in CareerOS. You can turn them off in Notification Center.</p></div></div>';
  try {
   await email.send({to:user.email,subject,text:textBody,html:htmlBody});
   if(dailyDue)await db.query("UPDATE notification_preferences SET last_email_date=(now() AT TIME ZONE COALESCE(timezone,'Asia/Kolkata'))::date,updated_at=now() WHERE user_id=$1",[user.user_id]);
   if(reminders.rows.length)await db.query("UPDATE career_reminders SET email_sent_at=now(),updated_at=now() WHERE user_id=$1 AND id=ANY($2::bigint[])",[user.user_id,reminders.rows.map(x=>x.id)]);
   for(const x of reminders.rows) {
    await db.query("INSERT INTO career_notifications(user_id,dedupe_key,kind,title,body,href,source_type,source_id,email_sent_at) VALUES($1,$2,'reminder',$3,$4,'https://careeros-beg4.hatchable.site/?pane=notifications','career_reminder',$5,now()) ON CONFLICT(user_id,dedupe_key) DO UPDATE SET email_sent_at=COALESCE(career_notifications.email_sent_at,now())",
      [user.user_id,'career-reminder:'+x.id+':'+new Date(x.due_at).toISOString(),x.title,x.description||'Your reminder is due.',String(x.id)]);
   }
   sent++;
  } catch(e) {
   failed++;
   console.warn('CareerOS reminder email failed for user',String(user.user_id).slice(0,24),String(e&&e.message||e).slice(0,160));
  }
 }
 return res.json({ok:true,checked:recipients.rows.length,sent,skipped,failed,recipientBatchLimit:10});
}