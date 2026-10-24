import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];
const contexts=new Set(['career_coach','resume','job_description','interview','roadmap','learning','other']);
export default async function(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const r=await db.query("SELECT c.id,c.title,c.context_type,c.archived,c.created_at,c.updated_at,(SELECT count(*)::int FROM career_messages m WHERE m.conversation_id=c.id AND m.user_id=c.user_id) AS message_count FROM career_conversations c WHERE c.user_id=$1 ORDER BY c.archived ASC,c.updated_at DESC LIMIT 100",[user]);
  return res.json({conversations:r.rows});
 }
 if(req.method==='POST'){
  const title=clean(b.title,180)||'New conversation',context=contexts.has(b.contextType)?b.contextType:'career_coach';
  const r=await db.query('INSERT INTO career_conversations(user_id,title,context_type) VALUES($1,$2,$3) RETURNING id,title,context_type,archived,created_at,updated_at',[user,title,context]);
  await logActivity(user,'conversation_created','career_conversation',r.rows[0].id,{context});
  return res.status(201).json({conversation:r.rows[0]});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid conversation ID required.'});
 const owned=await db.query('SELECT id FROM career_conversations WHERE id=$1 AND user_id=$2',[id,user]);
 if(!owned.rows.length)return res.status(404).json({error:'Conversation not found.'});
 if(req.method==='DELETE'){await db.query('DELETE FROM career_conversations WHERE id=$1 AND user_id=$2',[id,user]);return res.json({deleted:true});}
 const title=b.title===undefined?null:clean(b.title,180),archived=b.archived===undefined?null:Boolean(b.archived);
 const r=await db.query('UPDATE career_conversations SET title=COALESCE($3,title),archived=COALESCE($4,archived),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,title,context_type,archived,updated_at',[id,user,title,archived]);
 return res.json({conversation:r.rows[0]});
}