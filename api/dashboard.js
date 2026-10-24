import { db, config } from 'hatchable';
export const access = 'user';
export const methods = ['GET'];
export default async function(req,res){
 const user=String(req.user.id);
 const [p,g,road,tasks,apps,interviews,learn,dsa,usage]=await Promise.all([
  db.query('SELECT full_name,career_stage,current_job_role AS current_role,experience_years,target_role,weekly_hours,target_date,onboarding_completed,challenge_areas FROM career_profiles WHERE user_id=$1',[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='active')::int AS active,count(*) FILTER(WHERE status='completed')::int AS completed FROM career_goals WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='active')::int AS active FROM career_roadmaps WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='completed')::int AS completed,count(*) FILTER(WHERE status='in_progress')::int AS in_progress FROM roadmap_tasks WHERE user_id=$1 AND (due_date IS NULL OR due_date<=CURRENT_DATE+14)",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status IN ('applied','recruiter_screening','assessment','technical_interview','hiring_manager','final_round'))::int AS active,count(*) FILTER(WHERE status='offer')::int AS offers FROM job_applications WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='completed')::int AS completed,avg(score) FILTER(WHERE score IS NOT NULL)::numeric(5,1) AS average_score FROM interview_sessions WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='completed')::int AS completed FROM learning_progress WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='solved')::int AS solved FROM coding_attempts WHERE user_id=$1",[user]),
  db.query('SELECT request_count FROM ai_usage_monthly WHERE user_id=$1 AND month_start=date_trunc(\'month\',CURRENT_DATE)::date',[user])
 ]);
 const profile=p.rows[0]||null;
 const due=await db.query("SELECT id,title,description,due_date,priority,estimated_minutes,status,category FROM roadmap_tasks WHERE user_id=$1 AND status IN ('todo','in_progress') AND (due_date IS NULL OR due_date<=CURRENT_DATE) ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,due_date NULLS LAST,id LIMIT 5",[user]);
 const dailyQuestion={category:'Behavioral',question:'Tell me about a challenging problem you solved. What was your role, what trade-offs did you consider, and how did you measure the result?',note:'Practice prompt; tailor the answer to a real experience.'};
 const limitRaw=await config.get('free_monthly_ai_limit');
 return res.json({profile,goals:g.rows[0],roadmaps:road.rows[0],tasks:tasks.rows[0],applications:apps.rows[0],interviews:interviews.rows[0],learning:learn.rows[0],dsa:dsa.rows[0],aiUsage:{used:Number(usage.rows[0]?.request_count||0),limit:Number(limitRaw??20),plan:'free'},todayTasks:due.rows,dailyQuestion,emptyState:!profile||!profile.onboarding_completed});
}