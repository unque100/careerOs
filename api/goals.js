import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];
const types=new Set(['career_growth','new_role','promotion','skill_building','interview_prep','career_switch','portfolio','other']);
const statuses=new Set(['active','paused','completed','archived']);
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const r=await db.query('SELECT id,title,description,goal_type,target_role,target_date,status,created_at,updated_at FROM career_goals WHERE user_id=$1 ORDER BY CASE status WHEN \'active\' THEN 0 ELSE 1 END,created_at DESC',[user]);
  return res.json({goals:r.rows});
 }
 const b=req.body||{};
 if(req.method==='POST'){
  const title=clean(b.title,180),description=clean(b.description,2000),type=types.has(b.goalType)?b.goalType:'career_growth';
  if(title.length<3)return res.status(400).json({error:'Goal title must contain at least 3 characters.'});
  const date=b.targetDate==null||b.targetDate===''?null:b.targetDate;
  if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Target date must use YYYY-MM-DD.'});
  const r=await db.query('INSERT INTO career_goals(user_id,title,description,goal_type,target_role,target_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[user,title,description||null,type,clean(b.targetRole,160)||null,date]);
  await logActivity(user,'goal_created','career_goal',r.rows[0].id,{goalType:type});
  return res.status(201).json({goal:r.rows[0]});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid goal ID required.'});
 const current=await db.query('SELECT id FROM career_goals WHERE id=$1 AND user_id=$2',[id,user]);
 if(!current.rows.length)return res.status(404).json({error:'Goal not found.'});
 if(req.method==='DELETE'){await db.query('DELETE FROM career_goals WHERE id=$1 AND user_id=$2',[id,user]);await logActivity(user,'goal_deleted','career_goal',id,{});return res.json({deleted:true});}
 const title=b.title===undefined?null:clean(b.title,180),description=b.description===undefined?null:clean(b.description,2000),status=b.status===undefined?null:String(b.status),date=b.targetDate===undefined?undefined:(b.targetDate||null);
 if(status!==null&&!statuses.has(status))return res.status(400).json({error:'Unsupported goal status.'});
 if(date!==undefined&&date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Target date must use YYYY-MM-DD.'});
 const r=await db.query('UPDATE career_goals SET title=COALESCE($3,title),description=COALESCE($4,description),status=COALESCE($5,status),target_date=CASE WHEN $6::boolean THEN $7::date ELSE target_date END,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',[id,user,title,description,status,date!==undefined,date||null]);
 await logActivity(user,'goal_updated','career_goal',id,{status:r.rows[0].status});
 return res.json({goal:r.rows[0]});
}