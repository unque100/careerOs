import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT','DELETE'];
export default async function(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const r=await db.query("SELECT id,title,source_name,LEFT(raw_text,160) AS preview,version_number,status,created_at,updated_at FROM resume_documents WHERE user_id=$1 AND (source_name IS NULL OR source_name NOT LIKE 'careeros-cv-version:%') ORDER BY updated_at DESC LIMIT 50",[user]);
  const a=await db.query('SELECT id,resume_id,target_role,estimated_match_score,created_at,analysis FROM resume_analyses WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',[user]);
  return res.json({resumes:r.rows,analyses:a.rows});
 }
 if(req.method==='POST'){
  const title=clean(b.title,160)||'My resume',raw=clean(b.rawText,30000),source=clean(b.sourceName,240);
  if(source.startsWith('careeros-cv-version:'))return res.status(400).json({error:'This source name is reserved for internal CV snapshots.'});
  if(raw.length<80)return res.status(400).json({error:'Paste at least 80 characters of resume text. Use the Job Description Analyzer to extract supported files locally, review the text, then submit the reviewed text.'});
  const r=await db.query('INSERT INTO resume_documents(user_id,title,source_name,raw_text,parsed_profile,version_number,status) VALUES($1,$2,$3,$4,$5::jsonb,1,\'ready\') RETURNING id,title,source_name,version_number,status,created_at,updated_at',[user,title,source||null,raw,'{}']);
  await logActivity(user,'resume_created','resume',r.rows[0].id,{characters:raw.length});
  return res.status(201).json({resume:r.rows[0],message:'Resume text saved securely to your account. You can run an analysis next.'});
 }
 const id=Number(b.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Valid resume ID required.'});
 const own=await db.query('SELECT id,source_name FROM resume_documents WHERE id=$1 AND user_id=$2',[id,user]);
 if(!own.rows.length)return res.status(404).json({error:'Resume not found.'});
 if(String(own.rows[0].source_name||'').startsWith('careeros-cv-version:'))return res.status(403).json({error:'Saved CV snapshots are read-only. Restore one through Resume Studio to make it current.'});
 if(req.method==='DELETE'){await db.query('DELETE FROM resume_analyses WHERE resume_id=$1 AND user_id=$2',[id,user]);await db.query('DELETE FROM resume_documents WHERE id=$1 AND user_id=$2',[id,user]);await logActivity(user,'resume_deleted','resume',id,{});return res.json({deleted:true});}
 const title=b.title===undefined?null:clean(b.title,160),raw=b.rawText===undefined?null:clean(b.rawText,30000);
 if(raw!==null&&raw.length<80)return res.status(400).json({error:'Resume text must contain at least 80 characters.'});
 if(raw!==null)await db.query('UPDATE resume_documents SET title=COALESCE($3,title),source_name=COALESCE($4,source_name),raw_text=$5,version_number=version_number+1,updated_at=now() WHERE id=$1 AND user_id=$2',[id,user,title,clean(b.sourceName,240)||null,raw]);
 else await db.query('UPDATE resume_documents SET title=COALESCE($3,title),updated_at=now() WHERE id=$1 AND user_id=$2',[id,user,title]);
 const r=await db.query('SELECT id,title,source_name,version_number,status,created_at,updated_at FROM resume_documents WHERE id=$1 AND user_id=$2',[id,user]);
 await logActivity(user,'resume_updated','resume',id,{version:r.rows[0].version_number});
 return res.json({resume:r.rows[0]});
}