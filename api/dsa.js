import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST'];
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const topic=clean(req.query?.topic,100),difficulty=clean(req.query?.difficulty,20);
  const params=[user];let filters=[];
  if(topic){params.push(topic);filters.push('p.topic=$'+params.length)}
  if(difficulty&&['easy','medium','hard'].includes(difficulty)){params.push(difficulty);filters.push('p.difficulty=$'+params.length)}
  const where=filters.length?' WHERE '+filters.join(' AND '):'';
  const problems=await db.query("SELECT p.id,p.slug,p.title,p.topic,p.difficulty,p.statement,p.practice_url,p.source,p.source_verified,p.tags,COALESCE((SELECT a.status FROM coding_attempts a WHERE a.problem_slug=p.slug AND a.user_id=$1 ORDER BY a.attempted_at DESC LIMIT 1),'not_started') AS attempt_status FROM dsa_problems p"+where+" ORDER BY CASE p.difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,p.topic,p.title LIMIT 250",params);
  const stats=await db.query("SELECT count(*)::int AS attempts,count(*) FILTER(WHERE status='solved')::int AS solved,count(DISTINCT problem_slug)::int AS problems_attempted FROM coding_attempts WHERE user_id=$1",[user]);
  return res.json({problems:problems.rows,stats:stats.rows[0],executionAvailable:false,disclaimer:'CareerOS does not execute submitted code in this release. Use the practice link when available and record your approach and complexity here.'});
 }
 const b=req.body||{},slug=clean(b.problemSlug,140),status=String(b.status||''),language=clean(b.language,60),notes=clean(b.approachNotes,5000),tc=clean(b.timeComplexity,80),sc=clean(b.spaceComplexity,80),mins=Number(b.actualMinutes||0);
 if(!slug||!['attempted','solved','needs_revision','skipped'].includes(status))return res.status(400).json({error:'Choose a problem and valid attempt status.'});
 if(!Number.isInteger(mins)||mins<0||mins>100000)return res.status(400).json({error:'Minutes must be a non-negative whole number.'});
 const p=await db.query('SELECT id FROM dsa_problems WHERE slug=$1',[slug]);
 if(!p.rows.length)return res.status(404).json({error:'Problem not found.'});
 const r=await db.query('INSERT INTO coding_attempts(user_id,problem_id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,problem_slug,status,language,approach_notes,time_complexity,space_complexity,actual_minutes,attempted_at',[user,p.rows[0].id,slug,status,language||null,notes||null,tc||null,sc||null,mins]);
 await logActivity(user,'dsa_attempt_saved','dsa_problem',slug,{status,language,minutes:mins});
 return res.status(201).json({attempt:r.rows[0]});
}