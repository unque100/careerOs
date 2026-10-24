import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST'];
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const category=clean(req.query?.category,80);
  const params=[user],filter=category?' WHERE t.category=$2':'';
  if(category)params.push(category);
  const r=await db.query("SELECT t.id,t.slug,t.title,t.category,t.difficulty,t.description,t.resource_url,t.resource_source,t.resource_verified,t.estimated_minutes,COALESCE(p.status,'not_started') AS progress_status,COALESCE(p.time_spent_minutes,0) AS time_spent_minutes,p.notes,p.last_practiced_at FROM learning_topics t LEFT JOIN learning_progress p ON p.topic_slug=t.slug AND p.user_id=$1"+filter+" ORDER BY t.category,t.title",params);
  const stats=await db.query("SELECT count(*)::int AS started,count(*) FILTER(WHERE status='completed')::int AS completed,COALESCE(sum(time_spent_minutes),0)::int AS minutes FROM learning_progress WHERE user_id=$1",[user]);
  return res.json({topics:r.rows,stats:stats.rows[0]});
 }
 const b=req.body||{},slug=clean(b.topicSlug,120),status=String(b.status||'in_progress'),minutes=Number(b.timeSpentMinutes||0),notes=clean(b.notes,3000);
 if(!slug||!['not_started','in_progress','completed','needs_revision'].includes(status))return res.status(400).json({error:'Choose a topic and valid progress status.'});
 if(!Number.isInteger(minutes)||minutes<0||minutes>100000)return res.status(400).json({error:'Time spent must be non-negative minutes.'});
 const topic=await db.query('SELECT id FROM learning_topics WHERE slug=$1',[slug]);
 if(!topic.rows.length)return res.status(404).json({error:'Learning topic not found.'});
 const r=await db.query("INSERT INTO learning_progress(user_id,topic_id,topic_slug,status,notes,time_spent_minutes,last_practiced_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $4='not_started' THEN NULL ELSE now() END) ON CONFLICT(user_id,topic_slug) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,time_spent_minutes=learning_progress.time_spent_minutes+EXCLUDED.time_spent_minutes,last_practiced_at=CASE WHEN EXCLUDED.status='not_started' THEN learning_progress.last_practiced_at ELSE now() END,updated_at=now() RETURNING *",[user,topic.rows[0].id,slug,status,notes||null,minutes]);
 await logActivity(user,'learning_progress_updated','learning_topic',slug,{status,minutes});
 return res.json({progress:r.rows[0]});
}