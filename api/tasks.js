import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];
const cats=new Set(['learning','practice','project','application','interview','review','networking','other']);
const statuses=new Set(['todo','in_progress','completed','skipped']);
export default async function(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const roadmapId=b.roadmapId||req.query?.roadmapId;
  const params=[user],filter=roadmapId?' AND roadmap_id=$2':'';
  if(roadmapId)params.push(Number(roadmapId));
  const r=await db.query('SELECT id,roadmap_id,week_number,title,description,category,priority,estimated_minutes,due_date,status,completion_criteria,actual_minutes,completed_at,created_at FROM roadmap_tasks WHERE user_id=$1'+filter+' ORDER BY due_date NULLS LAST,week_number,id LIMIT 500',params);
  return res.json({tasks:r.rows});
 }
 if(req.method==='POST'){
  const roadmapId=Number(b.roadmapId),title=clean(b.title,180),mins=Math.max(5,Math.min(1440,Math.trunc(Number(b.estimatedMinutes)||30)));
  if(!Number.isSafeInteger(roadmapId)||roadmapId<1||title.length<2)return res.status(400).json({error:'Roadmap and task title are required.'});
  const road=await db.query('SELECT id FROM career_roadmaps WHERE id=$1 AND user_id=$2',[roadmapId,user]);
  if(!road.rows.length)return res.status(404).json({error:'Roadmap not found.'});
  const week=Math.max(1,Math.min(104,Math.trunc(Number(b.weekNumber)||1)));
  const r=await db.query('INSERT INTO roadmap_tasks(user_id,roadmap_id,week_number,title,description,category,priority,estimated_minutes,due_date,completion_criteria) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[user,roadmapId,week,title,clean(b.description,1200)||null,cats.has(b.category)?b.category:'learning',['low','medium','high'].includes(b.priority)?b.priority:'medium',mins,b.dueDate&&/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)?b.dueDate:null,clean(b.completionCriteria,500)||null]);
  await logActivity(user,'roadmap_task_created','roadmap_task',r.rows[0].id,{roadmapId});
  return res.status(201).json({task:r.rows[0]});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid task ID required.'});
 const own=await db.query('SELECT id FROM roadmap_tasks WHERE id=$1 AND user_id=$2',[id,user]);
 if(!own.rows.length)return res.status(404).json({error:'Task not found.'});
 if(req.method==='DELETE'){await db.query('DELETE FROM roadmap_tasks WHERE id=$1 AND user_id=$2',[id,user]);return res.json({deleted:true});}
 const status=b.status===undefined?null:String(b.status);
 if(status&&!statuses.has(status))return res.status(400).json({error:'Invalid task status.'});
 const actual=b.actualMinutes===undefined?null:Number(b.actualMinutes);
 if(actual!==null&&(!Number.isInteger(actual)||actual<0||actual>100000))return res.status(400).json({error:'Actual time must be a non-negative number of minutes.'});
 const r=await db.query("UPDATE roadmap_tasks SET status=COALESCE($3,status),actual_minutes=COALESCE($4,actual_minutes),completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,now()) WHEN $3 IS NOT NULL THEN NULL ELSE completed_at END,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *",[id,user,status,actual]);
 await logActivity(user,r.rows[0].status==='completed'?'roadmap_task_completed':'roadmap_task_updated','roadmap_task',id,{status:r.rows[0].status,actualMinutes:r.rows[0].actual_minutes});
 return res.json({task:r.rows[0]});
}