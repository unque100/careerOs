import { db } from 'hatchable';
import { generateCareerText } from 'lib/career-ai.js';
import { clean, safeJson, consumeAiQuota, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];
const categories=new Set(['learning','practice','project','application','interview','review','networking','other']);
const priorities=new Set(['low','medium','high']);
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const r=await db.query("SELECT r.id,r.goal_id,r.title,r.summary,r.target_role,r.start_date,r.target_date,r.status,r.generated_by,r.created_at,r.updated_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'weekNumber',t.week_number,'title',t.title,'description',t.description,'category',t.category,'priority',t.priority,'estimatedMinutes',t.estimated_minutes,'dueDate',t.due_date,'status',t.status,'completionCriteria',t.completion_criteria,'actualMinutes',t.actual_minutes,'completedAt',t.completed_at) ORDER BY t.week_number,t.id) FROM roadmap_tasks t WHERE t.roadmap_id=r.id AND t.user_id=r.user_id),'[]'::jsonb) AS tasks FROM career_roadmaps r WHERE r.user_id=$1 ORDER BY r.updated_at DESC LIMIT 30",[user]);
  return res.json({roadmaps:r.rows});
 }
 const b=req.body||{};
 if(req.method==='POST'){
  const target=clean(b.targetRole,160),title=clean(b.title,180)||('Career roadmap for '+(target||'your next step')),days=Math.max(7,Math.min(365,Math.trunc(Number(b.days)||Math.trunc(Number(b.weeks||4))*7))),weeks=Math.ceil(days/7),hours=Math.max(1,Math.min(80,Math.trunc(Number(b.weeklyHours||5))));
  if(!target)return res.status(400).json({error:'Target role is required.'});
  const profile=(await db.query('SELECT full_name,career_stage,current_job_role AS current_role,experience_years,target_role,current_skills,weekly_hours,learning_style,challenge_areas,target_date FROM career_profiles WHERE user_id=$1',[user])).rows[0];
  const starterTasks=()=>{
   const templates=[
    {title:'Study core requirements for '+target,description:'Review one prerequisite and write concise notes or flashcards.',category:'learning',priority:'high',estimatedMinutes:35,completionCriteria:'Explain the key idea in your own words.'},
    {title:'Solve a DSA problem',description:'Practice one problem, explain the approach, and record complexity and edge cases.',category:'practice',priority:'high',estimatedMinutes:45,completionCriteria:'Working solution plus time and space complexity.'},
    {title:'JavaScript / TypeScript deep dive',description:'Practice runtime behavior, async patterns, typing, errors, or testing relevant to the target role.',category:'learning',priority:'high',estimatedMinutes:35,completionCriteria:'Write a small example and explain its trade-offs.'},
    {title:'Review CS fundamentals',description:'Study operating systems, networking, databases, concurrency or transactions.',category:'learning',priority:'medium',estimatedMinutes:30,completionCriteria:'Answer three self-test questions.'},
    {title:'Low-level design practice',description:'Model classes, interfaces, SOLID boundaries and testable components for a small problem.',category:'practice',priority:'medium',estimatedMinutes:40,completionCriteria:'Draw the object model and explain one design trade-off.'},
    {title:'High-level system design',description:'Practice API design, data modeling, caching, queues, scaling and failure handling.',category:'practice',priority:'high',estimatedMinutes:45,completionCriteria:'Create a component diagram and explain bottlenecks.'},
    {title:'Project implementation',description:'Build or improve one small feature that demonstrates the target role skills.',category:'project',priority:'medium',estimatedMinutes:50,completionCriteria:'Commit or document a working increment.'},
    {title:'Mock interview and weekly review',description:'Answer an interview question aloud, review recent work and choose the next gap.',category:'interview',priority:'medium',estimatedMinutes:35,completionCriteria:'Record feedback, one strength and one improvement.'}
   ];
   return Array.from({length:days},(_,i)=>({...templates[i%templates.length],dayNumber:i+1,weekNumber:Math.floor(i/7)+1,dueDate:new Date(Date.now()+i*86400000).toISOString().slice(0,10)}));
  };
  let generated={summary:'A practical starter roadmap. Adjust it to match your role, availability and learning pace.',tasks:starterTasks()},by='manual',quota=null,aiFallback=false;
  if(b.useAI!==false){
   quota=await consumeAiQuota(user);
   if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
   try{
    const prompt='Create a realistic '+days+'-day career roadmap for a person aiming at '+target+'. Available time: '+hours+' hours per week. User profile: '+JSON.stringify(profile||{})+'. Return JSON only: {"summary":"short summary","tasks":[{"weekNumber":1,"title":"...","description":"...","category":"learning|practice|project|application|interview|review|networking|other","priority":"low|medium|high","estimatedMinutes":45,"completionCriteria":"..."}]}. Return one practical task per day for the first 90 days at most; for longer plans return a representative task schedule covering all phases. Include DSA, programming, CS fundamentals, LLD, HLD/system design, projects and mock interviews, split available hours realistically, and never guarantee outcomes.';
    const out=await generateCareerText({model:'gpt-mini',purpose:'careeros-roadmap',userId:user,system:'You are CareerOS, a practical career coach. Produce specific and achievable plans without guarantees or invented achievements.',prompt,maxTokens:2800});
    const parsed=safeJson(out&&out.text,{summary:generated.summary,tasks:[]});
    if(Array.isArray(parsed.tasks)&&parsed.tasks.length){
     generated={summary:clean(parsed.summary,3000)||generated.summary,tasks:parsed.tasks};
     by='ai';
    }else{aiFallback=true;}
   }catch(e){console.error('roadmap AI failed',String(e&&e.message||e).slice(0,180));aiFallback=true;}
  }
  const tasks=(Array.isArray(generated.tasks)&&generated.tasks.length?generated.tasks.slice(0,Math.min(days,365)):starterTasks()).map((t,i)=>({...t,dayNumber:Math.max(1,Math.min(days,Math.trunc(Number(t.dayNumber)||i+1))),dueDate:t.dueDate&&/^\\d{4}-\\d{2}-\\d{2}$/.test(t.dueDate)?t.dueDate:new Date(Date.now()+i*86400000).toISOString().slice(0,10)}));
  if(!tasks.length)generated.tasks=starterTasks();
  const goalId=b.goalId&&Number.isSafeInteger(Number(b.goalId))?Number(b.goalId):null;
  if(goalId!==null){const ownedGoal=await db.query('SELECT id FROM career_goals WHERE id=$1 AND user_id=$2',[goalId,user]);if(!ownedGoal.rows.length)return res.status(404).json({error:'Linked career goal not found in your account.'});}
  const roadmap=await db.query('INSERT INTO career_roadmaps(user_id,goal_id,title,summary,target_role,start_date,target_date,status,generated_by) VALUES($1,$2,$3,$4,$5,CURRENT_DATE,$6,\'active\',$7) RETURNING *',[user,goalId,title,clean(generated.summary,3000)||'Career roadmap',target,b.targetDate&&/^\d{4}-\d{2}-\d{2}$/.test(b.targetDate)?b.targetDate:null,by]);
  for(const t of tasks){
   const week=Math.max(1,Math.min(weeks,Math.trunc(Number(t.weekNumber)||1)));
   const taskTitle=clean(t.title,180);
   if(!taskTitle)continue;
   const mins=Math.max(5,Math.min(1440,Math.trunc(Number(t.estimatedMinutes)||45)));
   const category=categories.has(t.category)?t.category:'learning',priority=priorities.has(t.priority)?t.priority:'medium';
   await db.query('INSERT INTO roadmap_tasks(user_id,roadmap_id,week_number,title,description,category,priority,estimated_minutes,due_date,completion_criteria) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($10::date,CURRENT_DATE + (($3 * 7)-1)),$9)',
    [user,roadmap.rows[0].id,week,taskTitle,clean(t.description,1200)||null,category,priority,mins,clean(t.completionCriteria,500)||null,t.dueDate&&/^\\d{4}-\\d{2}-\\d{2}$/.test(t.dueDate)?t.dueDate:null]);
  }
  await logActivity(user,'roadmap_created','career_roadmap',roadmap.rows[0].id,{generatedBy:by,taskCount:tasks.length});
  const saved=await db.query('SELECT id,week_number,title,description,category,priority,estimated_minutes,due_date,status,completion_criteria FROM roadmap_tasks WHERE roadmap_id=$1 AND user_id=$2 ORDER BY week_number,id',[roadmap.rows[0].id,user]);
  return res.status(201).json({roadmap:roadmap.rows[0],tasks:saved.rows,usage:quota,message:by==='ai'?'AI roadmap generated and saved. Review and adjust it to match your schedule.':aiFallback?'AI was unavailable, so a practical starter roadmap was saved instead. You can edit the tasks and try AI generation later.':'Starter roadmap saved. Edit the tasks to make the plan specific to your schedule.'});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid roadmap ID required.'});
 const own=await db.query('SELECT id,title,target_role,summary,target_date FROM career_roadmaps WHERE id=$1 AND user_id=$2',[id,user]);
 if(!own.rows.length)return res.status(404).json({error:'Roadmap not found.'});
 if(req.method==='PUT'&&b.action==='regenerate_future'){
  const quota=await consumeAiQuota(user);if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
  const [profile,completed]=await Promise.all([db.query('SELECT career_stage,current_job_role AS current_role,experience_years,target_role,current_skills,weekly_hours,learning_style,challenge_areas FROM career_profiles WHERE user_id=$1',[user]),db.query("SELECT id,title,week_number,status FROM roadmap_tasks WHERE roadmap_id=$1 AND user_id=$2 AND status='completed' ORDER BY week_number,id",[id,user])]);
  try{
   const prompt='Regenerate only the remaining future tasks for this existing career roadmap. Target role: '+own.rows[0].target_role+'. Roadmap: '+own.rows[0].title+'. Existing completed tasks that MUST remain completed and unchanged: '+JSON.stringify(completed.rows)+'. Profile: '+JSON.stringify(profile.rows[0]||{})+'. Create '+Math.min(90,Math.max(7,Number(b.days)||30))+' days of practical tasks covering DSA, programming, CS fundamentals, LLD, HLD/system design, projects and mock interviews. Return JSON only: {"tasks":[{"dayNumber":1,"title":"...","description":"...","category":"learning|practice|project|application|interview|review|networking|other","priority":"low|medium|high","estimatedMinutes":45,"completionCriteria":"..."}]}. Do not repeat completed tasks.';
   const out=await generateCareerText({model:'gpt-mini',purpose:'careeros-roadmap-regenerate',userId:user,system:'You are a practical career coach. Return valid JSON, specific actions, no guarantees.',prompt,maxTokens:2800});
   const parsed=safeJson(out.text,{tasks:[]});if(!Array.isArray(parsed.tasks)||!parsed.tasks.length)return res.status(502).json({error:'The AI provider did not return a usable future plan. Existing tasks were preserved.'});
   const remaining=parsed.tasks.slice(0,90);
   const newTaskIds=[];for(let i=0;i<remaining.length;i++){const t=remaining[i],week=Math.max(1,Math.min(104,Math.ceil((Number(t.dayNumber)||i+1)/7))),taskTitle=clean(t.title,180);if(!taskTitle)continue;const due=new Date(Date.now()+i*86400000).toISOString().slice(0,10),mins=Math.max(5,Math.min(1440,Math.trunc(Number(t.estimatedMinutes)||45)));const inserted=await db.query('INSERT INTO roadmap_tasks(user_id,roadmap_id,week_number,title,description,category,priority,estimated_minutes,due_date,completion_criteria) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[user,id,week,taskTitle,clean(t.description,1200)||null,categories.has(t.category)?t.category:'learning',priorities.has(t.priority)?t.priority:'medium',mins,due,clean(t.completionCriteria,500)||null]);if(inserted.rows[0])newTaskIds.push(inserted.rows[0].id);}
   if(!newTaskIds.length)return res.status(502).json({error:'The AI plan contained no usable tasks. Existing tasks were preserved.'});
   await db.query("DELETE FROM roadmap_tasks WHERE roadmap_id=$1 AND user_id=$2 AND status<>'completed' AND NOT (id=ANY($3::bigint[]))",[id,user,newTaskIds]);
   await db.query('UPDATE career_roadmaps SET summary=$3,updated_at=now() WHERE id=$1 AND user_id=$2',[id,user,clean(own.rows[0].summary,2800)||'Future tasks regenerated; completed tasks preserved.']);
   await logActivity(user,'roadmap_future_regenerated','career_roadmap',id,{completedPreserved:completed.rows.length,newTasks:remaining.length});return res.json({regenerated:true,preservedCompleted:completed.rows.length,newTasks:remaining.length,usage:quota});
  }catch(e){console.error('roadmap future regeneration failed',String(e&&e.message||e).slice(0,160));return res.status(503).json({error:'Could not regenerate future tasks. Please retry; completed tasks were preserved.',usage:quota});}
 }
 if(req.method==='DELETE'){await db.query('DELETE FROM career_roadmaps WHERE id=$1 AND user_id=$2',[id,user]);await logActivity(user,'roadmap_deleted','career_roadmap',id,{});return res.json({deleted:true});}
 const status=clean(b.status,30),title=b.title===undefined?null:clean(b.title,180),summary=b.summary===undefined?null:clean(b.summary,3000);
 if(status&&!['active','paused','completed','archived','draft'].includes(status))return res.status(400).json({error:'Invalid roadmap status.'});
 const r=await db.query('UPDATE career_roadmaps SET title=COALESCE($3,title),summary=COALESCE($4,summary),status=COALESCE($5,status),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[id,user,title,summary,status||null]);
 await logActivity(user,'roadmap_updated','career_roadmap',id,{status:r.rows[0].status});
 return res.json({roadmap:r.rows[0]});
}