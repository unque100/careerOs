import { db } from 'hatchable';
import { generateCareerText } from 'lib/career-ai.js';
import { clean, safeJson, consumeAiQuota, logActivity } from 'lib/career.js';

export const access = 'user';
export const methods = ['GET','POST'];

const FIELDS = {
  fullName: 120, email: 180, phone: 60, headline: 180, location: 180,
  website: 400, linkedin: 400, github: 400, summary: 2400,
  skills: 2400, experience: 7000, projects: 6000, education: 1600,
  certifications: 1400, achievements: 3500, templateId: 40, accentColor: 24, fontStyle: 20
};
const TEMPLATE_IDS = new Set(['ats','minimal','developer','experienced','fresher','leadership']);
const ACCENT_COLORS = new Set(['navy','blue','teal','plum','charcoal']);
const FONT_STYLES = new Set(['classic','modern','serif']);
const STOP_WORDS = new Set(('about above after again all also and any are around as at be because been before being between both but by can could did do does doing down during each few for from further get got had has have having he her here hers him his how i if in into is it its itself just more most my no nor not of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours a an the using use used make made build built design develop developed create created work worked experience responsible responsibilities role skills skill team teams strong ability required requirements requirement preferred looking candidate engineer developer company job position year years').split(/\s+/));

function txt(value,max=2000){return clean(value,max)||''}
function normalizeCv(input,profile,account){
 const b=input&&typeof input==='object'?input:{};
 const p=profile||{};
 const fallback={
  fullName:p.full_name||account?.name||'',
  email:account?.email||'',
  phone:'',
  headline:p.profile_headline||p.current_job_role||p.target_role||'',
  location:p.preferred_location||'',
  website:p.website_url||'',
  linkedin:p.linkedin_url||'',
  github:p.github_url||'',
  summary:p.bio||'',
  skills:Array.isArray(p.current_skills)?p.current_skills.join(', '):'',
  experience:'',
  projects:'',
  education:p.education||'',
  certifications:Array.isArray(p.certifications)?p.certifications.join(', '):'',
  achievements:''
 };
 const out={};
 for(const [key,max] of Object.entries(FIELDS)){
  const value=b[key]===undefined||b[key]===null?fallback[key]:b[key];
  out[key]=txt(value,max);
 }
 out.templateId=TEMPLATE_IDS.has(out.templateId)?out.templateId:'ats';
 out.accentColor=ACCENT_COLORS.has(out.accentColor)?out.accentColor:'navy';
 out.fontStyle=FONT_STYLES.has(out.fontStyle)?out.fontStyle:'classic';
 return out;
}
function sections(cv){
 return [
  ['PROFESSIONAL SUMMARY',cv.summary],
  ['SKILLS',cv.skills],
  ['EXPERIENCE',cv.experience],
  ['PROJECTS',cv.projects],
  ['EDUCATION',cv.education],
  ['CERTIFICATIONS',cv.certifications],
  ['ACHIEVEMENTS',cv.achievements]
 ].filter(([,v])=>String(v||'').trim());
}
function buildText(cv){
 const out=[];
 if(cv.fullName)out.push(cv.fullName.toUpperCase());
 if(cv.headline)out.push(cv.headline);
 out.push([cv.email,cv.phone,cv.location,cv.website,cv.linkedin,cv.github].filter(Boolean).join(' | '));
 out.push('');
 for(const [heading,body] of sections(cv)){out.push(heading);out.push(body);out.push('')}
 return out.join('\n').trim();
}
function tokens(s){
 const matches=String(s||'').toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g)||[];
 return Array.from(new Set(matches.map(t=>t.replace(/^[.-]+|[.-]+$/g,'')).filter(t=>t.length>=3)));
}
function freeAtsCheck(cv,jobDescription,profile){
 const textBody=buildText(cv);
 const lower=textBody.toLowerCase();
 const jd=String(jobDescription||'').toLowerCase();
 const jdTokens=tokens(jd).filter(t=>!STOP_WORDS.has(t)&&!/^\d+$/.test(t));
 const profileSkills=Array.isArray(profile?.current_skills)?profile.current_skills.map(x=>String(x).toLowerCase()).filter(Boolean):[];
 const roleTokens=tokens([profile?.target_role,cv.headline].join(' ')).filter(t=>!STOP_WORDS.has(t));
 const sourceTokens=jdTokens.length?jdTokens:tokens(profileSkills.concat(roleTokens).join(' ')).filter(t=>!STOP_WORDS.has(t));
 const keywordCandidates=sourceTokens.filter((t,i,a)=>a.indexOf(t)===i).slice(0,80);
 const matched=keywordCandidates.filter(t=>lower.includes(t));
 const missing=keywordCandidates.filter(t=>!lower.includes(t));
 const checks=[
  {key:'contact',label:'Contact information',max:15,score:(cv.fullName?5:0)+(cv.email&&/@/.test(cv.email)?5:0)+(cv.phone?3:0)+((cv.linkedin||cv.github||cv.website)?2:0),tip:'Include your name, a professional email and at least one useful profile link.'},
  {key:'sections',label:'Recognizable CV sections',max:20,score:sections(cv).reduce((sum,x)=>sum+([ 'PROFESSIONAL SUMMARY','SKILLS','EXPERIENCE','PROJECTS','EDUCATION','CERTIFICATIONS','ACHIEVEMENTS'].includes(x[0])?([ 'PROFESSIONAL SUMMARY','SKILLS','EXPERIENCE','PROJECTS','EDUCATION','CERTIFICATIONS','ACHIEVEMENTS'].indexOf(x[0])<5?4:2):0),0),tip:'Use simple headings such as Summary, Skills, Experience, Projects and Education.'},
  {key:'keywords',label:'Target-role keywords',max:25,score:keywordCandidates.length?Math.round(25*matched.length/keywordCandidates.length):Math.min(25,Math.round(tokens(cv.skills).length/2)),tip:jd?'Add relevant job-description terms only where they truthfully describe your skills or experience.':'Add a job description for a more targeted keyword comparison.'},
  {key:'impact',label:'Evidence and measurable impact',max:15,score:Math.min(15,(textBody.match(/\b\d+(\.\d+)?\s*(%|x|k|m|ms|s|users|requests|days|hours|projects|services|million|billion)\b/gi)||[]).length*3)+(cv.achievements?3:0)>15?15:Math.min(15,(textBody.match(/\b\d+(\.\d+)?\s*(%|x|k|m|ms|s|users|requests|days|hours|projects|services|million|billion)\b/gi)||[]).length*3)+(cv.achievements?3:0),tip:'Where true, quantify outcomes, volume, latency, reliability, users or business impact.'},
  {key:'action',label:'Action-oriented bullets',max:15,score:Math.min(15,(textBody.match(/(^|\n)\s*[-•*]\s+/g)||[]).length*2+(['built','led','designed','improved','delivered','reduced','increased','automated','implemented','optimized','launched','owned'].filter(v=>lower.includes(v)).length>0?3:0)),tip:'Use concise bullets that start with an action verb and explain the result.'},
  {key:'length',label:'Readable length',max:10,score:textBody.length>=700&&textBody.length<=6000?10:textBody.length>=350&&textBody.length<=8500?7:textBody.length>=200?4:0,tip:'Aim for a focused one- or two-page CV. Keep the text selectable and the layout simple.'}
 ];
 // Scores are clamped to each category so malformed or empty input cannot inflate the result.
 for(const c of checks)c.score=Math.max(0,Math.min(c.max,Number(c.score)||0));
 const total=checks.reduce((sum,c)=>sum+c.score,0);
 const recommendations=checks.filter(c=>c.score<c.max).map(c=>({category:c.label,score:c.score,max:c.max,advice:c.tip}));
 if(missing.length)recommendations.unshift({category:'Missing target keywords',score:Math.max(0,keywordCandidates.length-missing.length),max:keywordCandidates.length,advice:'Review missing terms below. Add only terms supported by your real experience.'});
 if(!jd)recommendations.push({category:'Targeting',score:0,max:0,advice:'Paste a specific job description to compare your CV against that role.'});
 const sectionsPresent=sections(cv).map(x=>x[0]);
 return {
  score:total,maxScore:100,label:total>=85?'Strong structure':total>=70?'Good start':total>=50?'Needs improvement':'Needs more evidence',
  checks,sectionsPresent,matchedKeywords:matched.slice(0,30),missingKeywords:missing.slice(0,30),
  recommendations:recommendations.slice(0,12),
  wordCount:(textBody.match(/\b[\w+#.-]+\b/g)||[]).length,
  disclaimer:'Free checklist-based ATS estimate. It does not connect to employer ATS systems and cannot guarantee screening outcomes. Scores and keyword matches are heuristic; always verify suggestions and never add skills or achievements you do not have.'
 };
}
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const [profile,account,cv,versions]=await Promise.all([
   db.query('SELECT * FROM career_profiles WHERE user_id=$1 LIMIT 1',[user]),
   Promise.resolve({email:req.user.email||'',name:req.user.name||''}),
   db.query('SELECT id,cv_data,raw_text,job_description,ats_report,created_at,updated_at FROM career_cvs WHERE user_id=$1 LIMIT 1',[user]),
   db.query("SELECT id,title,source_name,parsed_profile,version_number,created_at FROM resume_documents WHERE user_id=$1 AND source_name LIKE 'careeros-cv-version:%' ORDER BY created_at DESC LIMIT 20",[user])
  ]);
  return res.json({profile:profile.rows[0]?{...profile.rows[0],current_role:profile.rows[0].current_job_role}:null,account:{...account,userIdSuffix:user.slice(-5)},databaseStatus:{database:'CareerOS managed PostgreSQL',table:'career_profiles',profileExists:!!profile.rows[0],profileId:profile.rows[0]?.id||null,verified:!!profile.rows[0],lastSavedAt:profile.rows[0]?.updated_at||profile.rows[0]?.created_at||null,userIdSuffix:user.slice(-5)},cv:cv.rows[0]||null,versions:versions.rows,source:'CareerOS managed PostgreSQL'});
 }
 const b=req.body||{},action=txt(b.action,40);
 const pr=await db.query('SELECT * FROM career_profiles WHERE user_id=$1 LIMIT 1',[user]);
 const profile=pr.rows[0]||null;
 if(action==='ai-assist'){
  const allowed=new Set(['summary','experience','skills','projects','achievements']);const section=txt(b.section,30);if(!allowed.has(section))return res.status(400).json({error:'Choose a supported resume section.'});
  const current=txt(b.currentText,7000);if(current.length<12)return res.status(400).json({error:'Add real details to the selected section first so the suggestion can stay factual.'});
  const jd=txt(b.jobDescription,12000);const profileContext={current_role:profile?.current_job_role,target_role:profile?.target_role,experience_years:profile?.experience_years,current_skills:profile?.current_skills,education:profile?.education};
  const quota=await consumeAiQuota(user);if(!quota.allowed)return res.status(429).json({error:'Monthly AI limit reached for your current plan.',usage:quota});
  try{const out=await generateCareerText({model:'gpt-mini',purpose:'careeros-resume-assistance',userId:user,system:'You are a factual resume editor. Never invent employers, dates, education, certifications, skills, responsibilities, metrics or achievements. Use only the candidate-provided source text and profile. Improve clarity, grammar, specificity and ATS readability. If evidence is insufficient, ask a concise question instead of adding facts.',prompt:'Improve the resume section: '+section+'. Return JSON only: {"suggestion":"revised text","changes":["..."],"needsUserEvidence":["..."]}. Preserve factual details and numbers exactly. Do not manufacture metrics. Profile context: '+JSON.stringify(profileContext)+'\nTarget job description if provided: '+jd+'\nCandidate source text: '+current,maxTokens:1200});return res.json({suggestion:safeJson(out.text,{suggestion:out.text,needsUserEvidence:['Verify every statement before applying.']}),model:out.model,usage:quota,disclaimer:'Review and verify every suggestion before applying it.'});}catch(e){console.error('resume assist failed',String(e&&e.message||e).slice(0,160));return res.status(503).json({error:'Resume suggestions are temporarily unavailable. Your current text is unchanged.'});}
 }
 if(action==='restore-version'){
  const versionId=Number(b.versionId);if(!Number.isSafeInteger(versionId)||versionId<1)return res.status(400).json({error:'Choose a valid saved CV version.'});
  const snap=await db.query("SELECT parsed_profile,version_number FROM resume_documents WHERE id=$1 AND user_id=$2 AND source_name LIKE 'careeros-cv-version:%'",[versionId,user]);if(!snap.rows.length)return res.status(404).json({error:'Saved CV version not found.'});
  const cv=normalizeCv(snap.rows[0].parsed_profile,profile,{email:req.user.email,name:req.user.name});const rawText=buildText(cv);
  const restored=await db.query("INSERT INTO career_cvs(user_id,cv_data,raw_text,job_description,ats_report) VALUES($1,$2::jsonb,$3,'',NULL) ON CONFLICT(user_id) DO UPDATE SET cv_data=EXCLUDED.cv_data,raw_text=EXCLUDED.raw_text,updated_at=now() RETURNING id,cv_data,raw_text,job_description,ats_report,created_at,updated_at",[user,JSON.stringify(cv),rawText]);
  await logActivity(user,'cv_version_restored','career_cv',restored.rows[0].id,{versionId});return res.json({cv:restored.rows[0],message:'Saved version restored. Review it before exporting.'});
 }
 if(!['save-cv','ats-check','create-version'].includes(action))return res.status(400).json({error:'Choose save-cv, ats-check, create-version, restore-version or ai-assist.'});
 const cv=normalizeCv(b.cvData,profile,{email:req.user.email,name:req.user.name});
 if(!cv.fullName.trim())return res.status(400).json({error:'Add your full name to your profile before creating a CV.'});
 if(!cv.headline.trim())return res.status(400).json({error:'Add a professional headline or target role before creating a CV.'});
 if(cv.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cv.email))return res.status(400).json({error:'Enter a valid email address.'});
 const rawText=buildText(cv),jobDescription=txt(b.jobDescription,16000);
 const report=action==='ats-check'?freeAtsCheck(cv,jobDescription,profile):null;
 const r=await db.query("INSERT INTO career_cvs(user_id,cv_data,raw_text,job_description,ats_report) VALUES($1,$2::jsonb,$3,$4,$5::jsonb) ON CONFLICT(user_id) DO UPDATE SET cv_data=EXCLUDED.cv_data,raw_text=EXCLUDED.raw_text,job_description=CASE WHEN EXCLUDED.job_description<>'' THEN EXCLUDED.job_description ELSE career_cvs.job_description END,ats_report=CASE WHEN EXCLUDED.ats_report IS NOT NULL THEN EXCLUDED.ats_report ELSE career_cvs.ats_report END,updated_at=now() RETURNING id,cv_data,raw_text,job_description,ats_report,created_at,updated_at",
 [user,JSON.stringify(cv),rawText,jobDescription,report?JSON.stringify(report):null]);
 let version=null;
 if(action==='create-version'){
  const last=await db.query("SELECT COALESCE(MAX(version_number),0)::int AS n FROM resume_documents WHERE user_id=$1 AND source_name LIKE 'careeros-cv-version:%'",[user]);const n=Number(last.rows[0]?.n||0)+1;
  const snap=await db.query("INSERT INTO resume_documents(user_id,title,source_name,raw_text,parsed_profile,version_number,status) VALUES($1,$2,$3,$4,$5::jsonb,$6,'ready') RETURNING id,title,version_number,created_at",[user,'CV v'+n+' · '+(cv.fullName||'Resume'),'careeros-cv-version:'+n,rawText,JSON.stringify(cv),n]);version=snap.rows[0];
 }
 try { await logActivity(user,action==='ats-check'?'free_ats_checked':action==='create-version'?'cv_version_created':'cv_saved','career_cv',r.rows[0].id,{score:report?.score??null,jobDescription:!!jobDescription,version:version?.version_number||null}); }
 catch(e) { console.warn('CV saved but audit event failed:',String(e&&e.message||e).slice(0,160)); }
 return res.json({cv:r.rows[0],report,version,message:action==='ats-check'?'Free ATS check complete. Review the suggestions before exporting.':version?'CV version '+version.version_number+' saved.':'CV saved to your CareerOS account.'});
}