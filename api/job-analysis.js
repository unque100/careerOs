import { db } from 'hatchable';
import { generateCareerText } from 'lib/career-ai.js';
import { clean, safeJson, consumeAiQuota, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST'];
const ALLOWED_JOB_HOSTS=['linkedin.com','greenhouse.io','lever.co','workday.com','myworkdayjobs.com','ashbyhq.com','smartrecruiters.com','wellfound.com','indeed.com','naukri.com','ziprecruiter.com','jobs.lever.co','boards.greenhouse.io'];
function isAllowedJobHost(host){return ALLOWED_JOB_HOSTS.some(domain=>host===domain||host.endsWith('.'+domain));}
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const r=await db.query('SELECT id,company,title,source_url,LEFT(raw_text,180) AS preview,extracted_requirements,created_at FROM job_descriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[user]);
  const a=await db.query('SELECT id,job_description_id,current_job_role AS current_role,target_role,analysis,created_at FROM skill_gap_analyses WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[user]);
  return res.json({jobDescriptions:r.rows,analyses:a.rows});
 }
 const b=req.body||{},title=clean(b.title,180),company=clean(b.company,160),url=clean(b.sourceUrl,500),text=clean(b.jobDescription,16000);
 if(b.action==='fetch-url'){
  let parsed;try{parsed=new URL(url)}catch{return res.status(400).json({error:'Enter a valid public HTTPS job-posting URL.'})}
  const host=parsed.hostname.toLowerCase();
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||!isAllowedJobHost(host))return res.status(400).json({error:'For safety, URL import supports only approved public job-board hosts. Paste the job description if your site is not supported.'});
  try{
   const response=await Promise.race([fetch(parsed.toString(),{headers:{Accept:'text/html,text/plain;q=0.9','User-Agent':'CareerOS public job description importer'},redirect:'manual'}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('URL fetch timed out')),10000))]);
   if(response.status>=300&&response.status<400)return res.status(400).json({error:'This job site redirects the request. Open the posting and paste its description instead.'});
   if(!response.ok)return res.status(502).json({error:'The posting could not be fetched (HTTP '+response.status+'). Paste the visible job description instead.'});
   const type=String(response.headers.get('content-type')||'').toLowerCase();if(!type.includes('text/html')&&!type.includes('text/plain'))return res.status(415).json({error:'This URL does not return an HTML or text job posting.'});
   let page=await response.text();if(page.length>600000)page=page.slice(0,600000);
   let extracted=page.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;|&#34;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
   if(extracted.length<100)return res.status(422).json({error:'Not enough readable job text was found. The site may require sign-in or render text dynamically; paste the job description instead.'});
   const pageTitle=clean((page.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'',180);
   return res.json({sourceUrl:parsed.toString(),text:extracted.slice(0,16000),title:pageTitle,disclaimer:'Fetched from a public HTTPS page. Review the extracted text before analysis; some sites block automated fetching.'});
  }catch(e){console.warn('job URL fetch failed',String(e&&e.message||e).slice(0,160));return res.status(503).json({error:'Could not fetch this posting. The site may block automated access; paste the job description instead.'})}
 }
 if(title.length<2||text.length<100)return res.status(400).json({error:'Enter a job title and paste at least 100 characters of job description.'});
 if(url){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error()}catch{return res.status(400).json({error:'Source URL must be valid http or https.'})}}
 const [profileRow,cvRow]=await Promise.all([db.query('SELECT current_job_role AS current_role,target_role,current_skills,experience_years,weekly_hours,education,strengths,challenge_areas FROM career_profiles WHERE user_id=$1',[user]),db.query('SELECT raw_text,cv_data FROM career_cvs WHERE user_id=$1 LIMIT 1',[user])]);
 const profile=profileRow.rows[0]||null,resumeText=clean(b.resumeText,30000)||cvRow.rows[0]?.raw_text||'';
 const quota=await consumeAiQuota(user);
 if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
 const prompt=`Compare the job posting with the candidate's reviewed resume text AND saved profile. Return valid JSON with this structure: {"roleSummary":"...","seniority":"...","experienceRequirements":[{"requirement":"...","yearsOrLevel":"...","importance":"required|preferred"}],"requiredSkills":[{"skill":"...","importance":"required","evidenceFromDescription":"..."}],"preferredSkills":[{"skill":"...","importance":"preferred","evidenceFromDescription":"..."}],"keywords":[{"keyword":"...","importance":"required|preferred","evidenceStatus":"present_in_resume|profile_only|not_evidenced","resumeEvidence":"..."}],"responsibilities":["..."],"strengths":["..."],"alreadyDemonstrated":["..."],"missingFromResume":["..."],"likelySkillGaps":[{"skill":"...","reason":"...","confidence":"low|medium|high","needsCandidateConfirmation":true}],"skillsToImprove":["..."],"skillsWithInsufficientEvidence":["..."],"recommendedProjects":["..."],"resumeChanges":["..."],"interviewTopics":["..."],"practicePlan":[{"topic":"...","priority":"high|medium|low","estimatedMinutes":30}],"questionsToClarify":["..."]}. Distinguish a keyword not present in the resume from a genuine skill gap: a term supported by the profile but absent from resume text is profile_only, a term absent from both is not_evidenced, and absence alone must not be described as proof of inability. Any likely gap is a hypothesis with stated confidence and a question for the candidate to confirm. Do not assert an ability without evidence, invent experience or promise selection.
Candidate profile: ${JSON.stringify(profile)}
Candidate resume text: ${resumeText}
Job title: ${title}
Company: ${company}
Description:
${text}`;
 try{
  const result=await generateCareerText({model:'gpt-mini',purpose:'careeros-job-skill-gap',userId:user,system:'You are a career skill-gap analyst. Be specific, evidence-based and fair. Do not infer protected characteristics or claim access to private recruiter data.',prompt,maxTokens:3000});
  if(!result||!result.text)return res.status(502).json({error:'AI returned no analysis.',usage:quota});
  const analysis=safeJson(result.text,{summary:result.text,needsReview:true});
  const jd=await db.query('INSERT INTO job_descriptions(user_id,company,title,source_url,raw_text,extracted_requirements) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id,title,company,created_at',[user,company||null,title,url||null,text,JSON.stringify({requiredSkills:analysis.requiredSkills||[],preferredSkills:analysis.preferredSkills||[],experienceRequirements:analysis.experienceRequirements||[],keywords:analysis.keywords||[],interviewTopics:analysis.interviewTopics||[]})]);
  const gap=await db.query('INSERT INTO skill_gap_analyses(user_id,job_description_id,current_job_role,target_role,analysis) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,created_at',[user,jd.rows[0].id,profile?.current_role||null,title,JSON.stringify(analysis)]);
  await logActivity(user,'job_description_analyzed','job_description',jd.rows[0].id,{company,title});
  return res.status(201).json({jobDescription:jd.rows[0],skillGap:{...gap.rows[0],analysis},usage:quota,disclaimer:'This is an AI-assisted comparison of user-provided information, not a hiring decision.'});
 }catch(e){console.error('job analysis failed',String(e&&e.message||e).slice(0,180));return res.status(503).json({error:'Job description analysis is unavailable. Check AI provider setup and retry.',usage:quota});}
}