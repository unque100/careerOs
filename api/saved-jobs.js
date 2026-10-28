import { db } from 'hatchable';
import { logActivity } from 'lib/career.js';
export const access='user';
export const methods=['GET','POST','DELETE'];
function clean(value,max){return String(value==null?'':value).replace(/\u0000/g,'').trim().slice(0,max)}
function safeHttps(value){try{const u=new URL(String(value||''));return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
export default async function(req,res){
 const user=String(req.user.id),b=req.body||{};
 if(req.method==='GET'){
  const rows=await db.query('SELECT id,external_job_id,title,company,source,job_url,location,description,salary,seniority,skills,published_at,created_at FROM saved_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 300',[user]);
  return res.json({savedJobs:rows.rows,count:rows.rows.length});
 }
 const externalJobId=clean(b.externalJobId,240);
 if(!externalJobId)return res.status(400).json({error:'External job ID is required.'});
 if(req.method==='DELETE'){
  const r=await db.query('DELETE FROM saved_jobs WHERE user_id=$1 AND external_job_id=$2 RETURNING id',[user,externalJobId]);
  if(!r.rows.length)return res.status(404).json({error:'Saved job not found.'});
  await logActivity(user,'external_job_unsaved','saved_job',externalJobId,{});
  return res.json({removed:true});
 }
 const title=clean(b.title,180),company=clean(b.company,160),source=clean(b.source,80),url=safeHttps(b.jobUrl);
 if(title.length<2||company.length<1||!url)return res.status(400).json({error:'A real listing title, company and original HTTPS job link are required.'});
 const skills=Array.isArray(b.skills)?b.skills.slice(0,20).map(x=>clean(x,80)).filter(Boolean):[];
 const publishedAt=b.publishedAt&& !Number.isNaN(Date.parse(b.publishedAt))?new Date(b.publishedAt).toISOString():null;
 const row=await db.query('INSERT INTO saved_jobs(user_id,external_job_id,title,company,source,job_url,location,description,salary,seniority,skills,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) ON CONFLICT(user_id,external_job_id) DO UPDATE SET title=EXCLUDED.title,company=EXCLUDED.company,source=EXCLUDED.source,job_url=EXCLUDED.job_url,location=EXCLUDED.location,description=EXCLUDED.description,salary=EXCLUDED.salary,seniority=EXCLUDED.seniority,skills=EXCLUDED.skills,published_at=EXCLUDED.published_at RETURNING id,external_job_id,title,company,source,job_url,location,description,salary,seniority,skills,published_at,created_at',[user,externalJobId,title,company,source||'External publisher',url,clean(b.location,180)||null,clean(b.description,600)||null,clean(b.salary,100)||null,clean(b.seniority,120)||null,JSON.stringify(skills),publishedAt]);
 await logActivity(user,'external_job_saved','saved_job',externalJobId,{source,company,title});
 return res.status(201).json({savedJob:row.rows[0]});
}