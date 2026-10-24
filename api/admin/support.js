import { db, admin } from 'hatchable';
export const access = 'admin';
export const methods = ['GET','PUT'];
const allowed=new Set(['new','in_review','replied','closed','spam']);
async function audit(req,action,id,details){const p=await admin.profile(req);await db.query("INSERT INTO audit_logs(org_id,actor_user_id,actor_type,action,entity_type,entity_id,details) VALUES(NULL,$1,'admin',$2,'support_request',$3,$4::jsonb)",[String(p&&p.handle||'project-admin'),action,String(id),JSON.stringify(details)]);}
export default async function(req,res){
 if(req.method==='GET'){
  const r=await db.query('SELECT id,name,email,category,subject,message,status,owner_notes,created_at,updated_at FROM support_requests ORDER BY CASE status WHEN \'new\' THEN 0 WHEN \'in_review\' THEN 1 ELSE 2 END,created_at DESC LIMIT 300');
  return res.json({requests:r.rows});
 }
 const b=req.body||{},id=Number(b.id),status=String(b.status||''),notes=typeof b.ownerNotes==='string'?b.ownerNotes.trim().slice(0,3000):null;
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'A valid request ID is required.'});
 if(!allowed.has(status))return res.status(400).json({error:'Unsupported support status.'});
 const r=await db.query('UPDATE support_requests SET status=$2,owner_notes=COALESCE($3,owner_notes),updated_at=now() WHERE id=$1 RETURNING id,status,owner_notes,updated_at',[id,status,notes]);
 if(!r.rows.length)return res.status(404).json({error:'Support request not found.'});
 await audit(req,'support_request_updated',id,{status});
 return res.json({request:r.rows[0]});
}