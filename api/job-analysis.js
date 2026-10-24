import { ai, db } from 'hatchable';
import { clean, safeJson, consumeAiQuota, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST'];
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const r=await db.query('SELECT id,company,title,source_url,LEFT(raw_text,180) AS preview,extracted_requirements,created_at FROM job_descriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[user]);
  const a=await db.query('SELECT id,job_description_id,current_job_role AS current_role,target_role,analysis,created_at FROM skill_gap_analyses WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[user]);
  return res.json({jobDescriptions:r.rows,analyses:a.rows});
 }
 const b=req.body||{},title=clean(b.title,180),company=clean(b.company,160),url=clean(b.sourceUrl,500),text=clean(b.jobDescription,16000);
 if(title.length<2||text.length<100)return res.status(400).json({error:'Enter a job title and paste at least 100 characters of job description.'});
 if(url){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error()}catch{return res.status(400).json({error:'Source URL must be valid http or https.'})}}
 const profile=(await db.query('SELECT current_job_role AS current_role,target_role,current_skills,experience_years,weekly_hours FROM career_profiles WHERE user_id=$1',[user])).rows[0]||null;
 const quota=await consumeAiQuota(user);
 if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
 const prompt=`Analyze the following job description against the candidate profile. Return JSON: {"roleSummary":"...","seniority":"...","requiredSkills":[{"skill":"...","importance":"required|preferred","evidenceFromDescription":"..."}],"responsibilities":["..."],"interviewTopics":["..."],"alreadyDemonstrated":["..."],"skillsToImprove":["..."],"skillsWithInsufficientEvidence":["..."],"recommendedProjects":["..."],"resumeChanges":["..."],"practicePlan":[{"topic":"...","priority":"high|medium|low","estimatedMinutes":30}],"questionsToClarify":["..."]}. Separate absent evidence from absent capability. Do not assert that a candidate has a skill unless profile evidence supports it. Do not promise interview selection.\nCandidate profile: ${JSON.stringify(profile)}\nJob title: ${title}\nCompany: ${company}\nDescription:\n${text}`;
 try{
  const result=await ai.generateText({model:'gpt-mini',purpose:'careeros-job-skill-gap',userId:user,system:'You are a career skill-gap analyst. Be specific, evidence-based and fair. Do not infer protected characteristics or claim access to private recruiter data.',prompt,maxTokens:2600});
  if(!result||!result.text)return res.status(502).json({error:'AI returned no analysis.',usage:quota});
  const analysis=safeJson(result.text,{summary:result.text,needsReview:true});
  const jd=await db.query('INSERT INTO job_descriptions(user_id,company,title,source_url,raw_text,extracted_requirements) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id,title,company,created_at',[user,company||null,title,url||null,text,JSON.stringify({requiredSkills:analysis.requiredSkills||[],interviewTopics:analysis.interviewTopics||[]})]);
  const gap=await db.query('INSERT INTO skill_gap_analyses(user_id,job_description_id,current_job_role,target_role,analysis) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,created_at',[user,jd.rows[0].id,profile?.current_role||null,title,JSON.stringify(analysis)]);
  await logActivity(user,'job_description_analyzed','job_description',jd.rows[0].id,{company,title});
  return res.status(201).json({jobDescription:jd.rows[0],skillGap:{...gap.rows[0],analysis},usage:quota,disclaimer:'This is an AI-assisted comparison of user-provided information, not a hiring decision.'});
 }catch(e){console.error('job analysis failed',String(e&&e.message||e).slice(0,180));return res.status(503).json({error:'Job description analysis is unavailable. Check AI provider setup and retry.',usage:quota});}
}