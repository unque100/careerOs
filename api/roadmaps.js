import { ai, db } from 'hatchable';
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
  const target=clean(b.targetRole,160),title=clean(b.title,180)||('Career roadmap for '+(target||'your next step')),weeks=Math.max(1,Math.min(52,Math.trunc(Number(b.weeks||4)))),hours=Math.max(1,Math.min(80,Math.trunc(Number(b.weeklyHours||5))));
  if(!target)return res.status(400).json({error:'Target role is required.'});
  const profile=(await db.query('SELECT full_name,career_stage,current_job_role AS current_role,experience_years,target_role,current_skills,weekly_hours,learning_style,challenge_areas,target_date FROM career_profiles WHERE user_id=$1',[user])).rows[0];
  const starterTasks=()=>{
   const templates=[
    {title:'Review the core requirements for '+target,description:'Write down the key concepts and the evidence you already have.',category:'learning',priority:'high',estimatedMinutes:45,completionCriteria:'Create a checklist of the top five requirements.'},
    {title:'Practice one targeted problem',description:'Choose a problem or exercise related to the target role and record your approach.',category:'practice',priority:'high',estimatedMinutes:45,completionCriteria:'Record the approach and time/space complexity where relevant.'},
    {title:'Build or improve a small project artifact',description:'Create an implementation, diagram, write-up or portfolio evidence aligned to the target.',category:'project',priority:'medium',estimatedMinutes:60,completionCriteria:'Save a link or concise note describing the work.'},
    {title:'Review progress and identify the next gap',description:'Compare completed work with your target requirements; adjust the next week.',category:'review',priority:'medium',estimatedMinutes:30,completionCriteria:'Record one strength, one gap and one next action.'}
   ];
   return Array.from({length:weeks*2},(_,i)=>({...templates[i%templates.length],weekNumber:Math.floor(i/2)+1}));
  };
  let generated={summary:'A practical starter roadmap. Adjust it to match your role, availability and learning pace.',tasks:starterTasks()},by='manual',quota=null,aiFallback=false;
  if(b.useAI!==false){
   quota=await consumeAiQuota(user);
   if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
   try{
    const prompt='Create a realistic '+weeks+'-week career roadmap for a person aiming at '+target+'. Available time: '+hours+' hours per week. User profile: '+JSON.stringify(profile||{})+'. Return JSON only: {"summary":"short summary","tasks":[{"weekNumber":1,"title":"...","description":"...","category":"learning|practice|project|application|interview|review|networking|other","priority":"low|medium|high","estimatedMinutes":45,"completionCriteria":"..."}]}. Provide 2-4 tasks per week, split the available hours realistically, prioritize prerequisites, include review, and never guarantee job/interview outcomes.';
    const out=await ai.generateText({model:'gpt-mini',purpose:'careeros-roadmap',userId:user,system:'You are CareerOS, a practical career coach. Produce specific and achievable plans without guarantees or invented achievements.',prompt,maxTokens:2800});
    const parsed=safeJson(out&&out.text,{summary:generated.summary,tasks:[]});
    if(Array.isArray(parsed.tasks)&&parsed.tasks.length){
     generated={summary:clean(parsed.summary,3000)||generated.summary,tasks:parsed.tasks};
     by='ai';
    }else{aiFallback=true;}
   }catch(e){console.error('roadmap AI failed',String(e&&e.message||e).slice(0,180));aiFallback=true;}
  }
  const tasks=Array.isArray(generated.tasks)&&generated.tasks.length?generated.tasks.slice(0,Math.min(weeks*5,100)):starterTasks();
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
   await db.query('INSERT INTO roadmap_tasks(user_id,roadmap_id,week_number,title,description,category,priority,estimated_minutes,due_date,completion_criteria) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE + (($3 * 7)-1),$9)',
    [user,roadmap.rows[0].id,week,taskTitle,clean(t.description,1200)||null,category,priority,mins,clean(t.completionCriteria,500)||null]);
  }
  await logActivity(user,'roadmap_created','career_roadmap',roadmap.rows[0].id,{generatedBy:by,taskCount:tasks.length});
  const saved=await db.query('SELECT id,week_number,title,description,category,priority,estimated_minutes,due_date,status,completion_criteria FROM roadmap_tasks WHERE roadmap_id=$1 AND user_id=$2 ORDER BY week_number,id',[roadmap.rows[0].id,user]);
  return res.status(201).json({roadmap:roadmap.rows[0],tasks:saved.rows,usage:quota,message:by==='ai'?'AI roadmap generated and saved. Review and adjust it to match your schedule.':aiFallback?'AI was unavailable, so a practical starter roadmap was saved instead. You can edit the tasks and try AI generation later.':'Starter roadmap saved. Edit the tasks to make the plan specific to your schedule.'});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid roadmap ID required.'});
 const own=await db.query('SELECT id FROM career_roadmaps WHERE id=$1 AND user_id=$2',[id,user]);
 if(!own.rows.length)return res.status(404).json({error:'Roadmap not found.'});
 if(req.method==='DELETE'){await db.query('DELETE FROM career_roadmaps WHERE id=$1 AND user_id=$2',[id,user]);await logActivity(user,'roadmap_deleted','career_roadmap',id,{});return res.json({deleted:true});}
 const status=clean(b.status,30),title=b.title===undefined?null:clean(b.title,180),summary=b.summary===undefined?null:clean(b.summary,3000);
 if(status&&!['active','paused','completed','archived','draft'].includes(status))return res.status(400).json({error:'Invalid roadmap status.'});
 const r=await db.query('UPDATE career_roadmaps SET title=COALESCE($3,title),summary=COALESCE($4,summary),status=COALESCE($5,status),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[id,user,title,summary,status||null]);
 await logActivity(user,'roadmap_updated','career_roadmap',id,{status:r.rows[0].status});
 return res.json({roadmap:r.rows[0]});
}