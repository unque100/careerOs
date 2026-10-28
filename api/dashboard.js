import { db, config } from 'hatchable';
export const access='user';
export const methods=['GET'];
function n(v){return Number(v||0)}
export default async function(req,res){
 const user=String(req.user.id);
 const [profileR,goalsR,roadmapsR,tasksR,appsR,interviewsR,learningR,dsaR,usageR,savedR,cvR,upcomingR,notesR,appStatusR,subscriptionR]=await Promise.all([
  db.query('SELECT full_name,career_stage,current_job_role AS current_role,experience_years,target_role,weekly_hours,target_date,onboarding_completed,challenge_areas,current_skills,education,learning_style,preferred_location FROM career_profiles WHERE user_id=$1',[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='active')::int AS active,count(*) FILTER(WHERE status='completed')::int AS completed FROM career_goals WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='active')::int AS active FROM career_roadmaps WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='completed')::int AS completed,count(*) FILTER(WHERE status='in_progress')::int AS in_progress,count(*) FILTER(WHERE status IN ('todo','in_progress') AND due_date<CURRENT_DATE)::int AS overdue FROM roadmap_tasks WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status NOT IN ('accepted','rejected','withdrawn'))::int AS active,count(*) FILTER(WHERE status='offer')::int AS offers,count(*) FILTER(WHERE status='applied')::int AS applied,count(*) FILTER(WHERE status='assessment')::int AS assessments,count(*) FILTER(WHERE status IN ('recruiter_screening','technical_interview','hiring_manager','final_round'))::int AS interviews,count(*) FILTER(WHERE status='rejected')::int AS rejected,count(*) FILTER(WHERE status='withdrawn')::int AS withdrawn FROM job_applications WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='completed')::int AS completed,ROUND(AVG(score) FILTER(WHERE score IS NOT NULL),1) AS average_score FROM interview_sessions WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='completed')::int AS completed,COALESCE(SUM(time_spent_minutes),0)::int AS minutes FROM learning_progress WHERE user_id=$1",[user]),
  db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='solved')::int AS solved,count(DISTINCT problem_slug) FILTER(WHERE status='solved')::int AS unique_solved FROM coding_attempts WHERE user_id=$1",[user]),
  db.query("SELECT request_count FROM ai_usage_monthly WHERE user_id=$1 AND month_start=date_trunc('month',CURRENT_DATE)::date",[user]),
  db.query('SELECT count(*)::int AS total FROM saved_jobs WHERE user_id=$1',[user]),
  db.query("SELECT count(*)::int AS versions FROM resume_documents WHERE user_id=$1 AND source_name LIKE 'careeros-cv-version:%'",[user]),
  db.query("SELECT ai.id,ai.application_id,ai.title,ai.scheduled_at,ai.format,ai.location_or_link,a.company,a.job_title FROM application_interviews ai JOIN job_applications a ON a.id=ai.application_id AND a.user_id=ai.user_id WHERE ai.user_id=$1 AND ai.status='scheduled' AND ai.scheduled_at>=now() ORDER BY ai.scheduled_at LIMIT 6",[user]),
  db.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE is_bookmarked)::int AS bookmarked,count(*) FILTER(WHERE updated_at>=CURRENT_DATE::timestamptz)::int AS touched_today FROM research_notes WHERE user_id=$1',[user]),
  db.query("SELECT status,count(*)::int AS count FROM job_applications WHERE user_id=$1 GROUP BY status",[user]),
  db.query("SELECT plan_id FROM subscriptions WHERE user_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>now()) LIMIT 1",[user])
 ]);
 const profile=profileR.rows[0]||null,goals=goalsR.rows[0]||{},roadmaps=roadmapsR.rows[0]||{},tasks=tasksR.rows[0]||{},applications=appsR.rows[0]||{},interviews=interviewsR.rows[0]||{},learning=learningR.rows[0]||{},dsa=dsaR.rows[0]||{},notes=notesR.rows[0]||{};
 const fields=profile?[profile.full_name,profile.target_role,profile.current_role,n(profile.experience_years)>0,Array.isArray(profile.current_skills)&&profile.current_skills.length>0,profile.weekly_hours,profile.learning_style,profile.preferred_location,profile.education,profile.target_date,profile.onboarding_completed].filter(v=>v!==null&&v!==undefined&&v!==false&&v!=='').length:0;
 const profileCompletion=profile?Math.round(fields/11*100):0;
 const due=await db.query("SELECT id,roadmap_id,title,description,due_date,priority,estimated_minutes,status,category FROM roadmap_tasks WHERE user_id=$1 AND status IN ('todo','in_progress') AND due_date IS NOT NULL AND due_date<=CURRENT_DATE ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,due_date NULLS LAST,id LIMIT 6",[user]);
 const followups=await db.query("SELECT id,company,job_title,next_follow_up_at,status FROM job_applications WHERE user_id=$1 AND next_follow_up_at IS NOT NULL AND next_follow_up_at<=now()+interval '7 days' AND status NOT IN ('rejected','withdrawn','accepted') ORDER BY next_follow_up_at LIMIT 5",[user]);
 const latestResume=await db.query("SELECT id,title,version_number,created_at FROM resume_documents WHERE user_id=$1 AND source_name LIKE 'careeros-cv-version:%' ORDER BY created_at DESC LIMIT 5",[user]);
 const currentCv=await db.query('SELECT updated_at FROM career_cvs WHERE user_id=$1',[user]);
 const plan=String(subscriptionR.rows[0]?.plan_id||'free');
 const rawLimit=await config.get(plan==='pro'||plan==='enterprise'?'pro_monthly_ai_limit':'free_monthly_ai_limit');
 const aiUsage={used:n(usageR.rows[0]?.request_count),limit:n(rawLimit??((plan==='pro'||plan==='enterprise')?300:20)),plan};
 const appStatuses=Object.fromEntries(appStatusR.rows.map(x=>[x.status,n(x.count)]));
 const roadmapsActive=n(roadmaps.active);
 const taskTotal=n(tasks.total),taskCompleted=n(tasks.completed);
 const nextBestActions=[];
 if(!profile||!profile.onboarding_completed||profileCompletion<75)nextBestActions.push({priority:1,title:'Complete your career profile',reason:profile?'Your saved profile is '+profileCompletion+'% complete.':'Your career profile has not been saved yet.',pane:'profile'});
 if(followups.rows.length)nextBestActions.push({priority:2,title:'Follow up on a job application',reason:followups.rows[0].company+' · '+followups.rows[0].job_title+' has a follow-up due soon.',pane:'jobs',entityId:followups.rows[0].id});
 if(upcomingR.rows.length)nextBestActions.push({priority:3,title:'Prepare for your next interview',reason:upcomingR.rows[0].company+' · '+upcomingR.rows[0].job_title+' — '+new Date(upcomingR.rows[0].scheduled_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}),pane:'jobs',entityId:upcomingR.rows[0].application_id});
 if(due.rows.length)nextBestActions.push({priority:4,title:'Complete a roadmap task',reason:due.rows[0].title+' · '+due.rows[0].priority+' priority',pane:'roadmap',entityId:due.rows[0].id});
 if(!roadmapsActive)nextBestActions.push({priority:5,title:'Build a practical roadmap',reason:'No active roadmap is saved yet.',pane:'roadmap'});
 if(!n(cvR.rows[0]?.versions))nextBestActions.push({priority:6,title:'Save a resume version',reason:'No versioned resume is saved in your CareerOS account.',pane:'resume'});
 if(n(savedR.rows[0]?.total)>0)nextBestActions.push({priority:7,title:'Review your saved job opportunities',reason:n(savedR.rows[0].total)+' job(s) saved and not necessarily tracked as applications.',pane:'opportunities'});
 if(!nextBestActions.length)nextBestActions.push({priority:8,title:'Practice a mock interview',reason:'Your profile, roadmap and follow-ups look current. Strengthen your next interview answer.',pane:'interviews'});
 const dailyQuestion={category:'Behavioral',question:'Tell me about a challenging problem you solved. What was your role, what trade-offs did you consider, and how did you measure the result?',note:'Practice prompt; tailor the answer to a real experience.'};
 return res.json({
  profile,profileCompletion,goals,roadmaps,tasks,roadmapProgress:{total:taskTotal,completed:taskCompleted,percent:taskTotal?Math.round(taskCompleted/taskTotal*100):0},applications,applicationStatuses:appStatuses,
  interviews:{...interviews,upcoming:n(upcomingR.rows.length)},upcomingInterviews:upcomingR.rows,
  learning,dsa,savedJobs:{total:n(savedR.rows[0]?.total)},resumeVersions:{total:n(cvR.rows[0]?.versions),latest:latestResume.rows,cvUpdatedAt:currentCv.rows[0]?.updated_at||null},
  researchNotes:notes,aiUsage,todayTasks:due.rows,followUps:followups.rows,nextBestActions:nextBestActions.sort((a,b)=>a.priority-b.priority).slice(0,5),dailyQuestion,emptyState:!profile||!profile.onboarding_completed
 });
}