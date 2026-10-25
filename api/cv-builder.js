import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';

export const access = 'user';
export const methods = ['GET','POST'];

const FIELDS = {
  fullName: 120, email: 180, phone: 60, headline: 180, location: 180,
  website: 400, linkedin: 400, github: 400, summary: 2400,
  skills: 2400, experience: 7000, projects: 6000, education: 1600,
  certifications: 1400, achievements: 3500
};
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
 return Array.from(new Set(String(s||'').toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g)||[]));
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
  const [profile,account,cv]=await Promise.all([
   db.query('SELECT * FROM career_profiles WHERE user_id=$1 LIMIT 1',[user]),
   Promise.resolve({email:req.user.email||'',name:req.user.name||''}),
   db.query('SELECT id,cv_data,raw_text,job_description,ats_report,created_at,updated_at FROM career_cvs WHERE user_id=$1 LIMIT 1',[user])
  ]);
  return res.json({profile:profile.rows[0]?{...profile.rows[0],current_role:profile.rows[0].current_job_role}:null,account,cv:cv.rows[0]||null,source:'CareerOS managed PostgreSQL'});
 }
 const b=req.body||{},action=txt(b.action,40);
 if(!['save-cv','ats-check'].includes(action))return res.status(400).json({error:'Choose save-cv or ats-check.'});
 const pr=await db.query('SELECT * FROM career_profiles WHERE user_id=$1 LIMIT 1',[user]);
 const profile=pr.rows[0]||null;
 const cv=normalizeCv(b.cvData,profile,{email:req.user.email,name:req.user.name});
 if(!cv.fullName.trim())return res.status(400).json({error:'Add your full name to your profile before creating a CV.'});
 if(!cv.headline.trim())return res.status(400).json({error:'Add a professional headline or target role before creating a CV.'});
 if(cv.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cv.email))return res.status(400).json({error:'Enter a valid email address.'});
 const rawText=buildText(cv),jobDescription=txt(b.jobDescription,16000);
 const report=action==='ats-check'?freeAtsCheck(cv,jobDescription,profile):null;
 const r=await db.query("INSERT INTO career_cvs(user_id,cv_data,raw_text,job_description,ats_report) VALUES($1,$2::jsonb,$3,$4,$5::jsonb) ON CONFLICT(user_id) DO UPDATE SET cv_data=EXCLUDED.cv_data,raw_text=EXCLUDED.raw_text,job_description=CASE WHEN EXCLUDED.job_description<>'' THEN EXCLUDED.job_description ELSE career_cvs.job_description END,ats_report=CASE WHEN EXCLUDED.ats_report IS NOT NULL THEN EXCLUDED.ats_report ELSE career_cvs.ats_report END,updated_at=now() RETURNING id,cv_data,raw_text,job_description,ats_report,created_at,updated_at",
 [user,JSON.stringify(cv),rawText,jobDescription,report?JSON.stringify(report):null]);
 try { await logActivity(user,action==='save-cv'?'cv_saved':'free_ats_checked','career_cv',r.rows[0].id,{score:report?.score??null,jobDescription:!!jobDescription}); }
 catch(e) { console.warn('CV saved but audit event failed:',String(e&&e.message||e).slice(0,160)); }
 return res.json({cv:r.rows[0],report,message:action==='save-cv'?'CV saved to your CareerOS account.':'Free ATS check complete. Review the suggestions before exporting.'});
}