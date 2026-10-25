import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT'];
const stages=new Set(['student','fresh_graduate','working_professional','job_seeker','career_switcher','promotion_seeker','entrepreneur','founder']);
const styles=new Set(['reading','videos','practice','projects','mixed']);
const prefs=new Set(['onsite','hybrid','remote','flexible']);
function parseHttpUrl(value){const raw=clean(value,400);if(!raw)return null;try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.href:undefined}catch{return undefined}}
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const r=await db.query('SELECT * FROM career_profiles WHERE user_id=$1',[user]);
  const sub=await db.query("SELECT plan_id,status,expires_at FROM subscriptions WHERE user_id=$1 LIMIT 1",[user]);
  const profile=r.rows[0]?{...r.rows[0],current_role:r.rows[0].current_job_role}:null;
  return res.json({profile,subscription:sub.rows[0]||{plan_id:'free',status:'active',expires_at:null},account:{email:req.user.email,name:req.user.name||null}});
 }
 const b=req.body||{},fullName=clean(b.fullName,120),stage=stages.has(b.careerStage)?b.careerStage:'working_professional';
 const headline=clean(b.profileHeadline,180),bio=clean(b.bio,1600),website=parseHttpUrl(b.websiteUrl),linkedin=parseHttpUrl(b.linkedinUrl),github=parseHttpUrl(b.githubUrl);
 if(website===undefined||linkedin===undefined||github===undefined)return res.status(400).json({error:'Website, LinkedIn and GitHub links must be valid http or https URLs.'});
 const experience=Number(b.experienceYears||0),weekly=Number(b.weeklyHours||5);
 if(!Number.isFinite(experience)||experience<0||experience>70)return res.status(400).json({error:'Experience must be between 0 and 70 years.'});
 if(!Number.isInteger(weekly)||weekly<1||weekly>80)return res.status(400).json({error:'Weekly learning hours must be between 1 and 80.'});
 const role=clean(b.currentRole,160),target=clean(b.targetRole,160);
 if(!target)return res.status(400).json({error:'Add your target role to personalize CareerOS.'});
 const targetDate=b.targetDate==null||b.targetDate===''?null:b.targetDate;
 if(targetDate&&!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))return res.status(400).json({error:'Target date must use YYYY-MM-DD.'});
 const skillList=Array.isArray(b.currentSkills)?b.currentSkills.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,80)).filter(Boolean).slice(0,50):[];
 const strengths=Array.isArray(b.strengths)?b.strengths.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,160)).filter(Boolean).slice(0,20):[];
 const challenges=Array.isArray(b.challengeAreas)?b.challengeAreas.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,160)).filter(Boolean).slice(0,20):[];
 const certs=Array.isArray(b.certifications)?b.certifications.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,160)).filter(Boolean).slice(0,30):[];
 const companies=Array.isArray(b.targetCompanies)?b.targetCompanies.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,120)).filter(Boolean).slice(0,30):[];
 const pref=prefs.has(b.workPreference)?b.workPreference:'flexible',style=styles.has(b.learningStyle)?b.learningStyle:'mixed';
 const salary=b.salaryExpectationInr==null||b.salaryExpectationInr===''?null:Number(b.salaryExpectationInr);
 if(salary!==null&&(!Number.isSafeInteger(salary)||salary<0||salary>1000000000))return res.status(400).json({error:'Salary expectation must be a valid non-negative INR amount.'});
 const sql="INSERT INTO career_profiles(user_id,full_name,profile_headline,bio,website_url,linkedin_url,github_url,career_stage,current_job_role,experience_years,target_role,current_skills,education,certifications,target_companies,preferred_location,work_preference,salary_expectation_inr,target_date,weekly_hours,learning_style,strengths,challenge_areas,onboarding_completed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,true) ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,profile_headline=EXCLUDED.profile_headline,bio=EXCLUDED.bio,website_url=EXCLUDED.website_url,linkedin_url=EXCLUDED.linkedin_url,github_url=EXCLUDED.github_url,career_stage=EXCLUDED.career_stage,current_job_role=EXCLUDED.current_job_role,experience_years=EXCLUDED.experience_years,target_role=EXCLUDED.target_role,current_skills=EXCLUDED.current_skills,education=EXCLUDED.education,certifications=EXCLUDED.certifications,target_companies=EXCLUDED.target_companies,preferred_location=EXCLUDED.preferred_location,work_preference=EXCLUDED.work_preference,salary_expectation_inr=EXCLUDED.salary_expectation_inr,target_date=EXCLUDED.target_date,weekly_hours=EXCLUDED.weekly_hours,learning_style=EXCLUDED.learning_style,strengths=EXCLUDED.strengths,challenge_areas=EXCLUDED.challenge_areas,onboarding_completed=true,updated_at=now() RETURNING *";
 const r=await db.query(sql,[user,fullName||null,headline||null,bio||null,website,linkedin,github,stage,role||null,experience,target,JSON.stringify(skillList),clean(b.education,400)||null,JSON.stringify(certs),JSON.stringify(companies),clean(b.preferredLocation,160)||null,pref,salary,targetDate||null,weekly,style,JSON.stringify(strengths),JSON.stringify(challenges)]);
 // The profile row is the primary save. Do not report a failed save if an ancillary subscription/audit write fails.
 try { await db.query("INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,'free','active') ON CONFLICT(user_id) DO NOTHING",[user]); }
 catch(e) { console.warn('Default subscription row was not created after profile save:',String(e&&e.message||e).slice(0,160)); }
 try { await logActivity(user,'profile_saved','career_profile',r.rows[0].id,{careerStage:stage,targetRole:target}); }
 catch(e) { console.warn('Profile audit event could not be recorded:',String(e&&e.message||e).slice(0,160)); }
 const saved=await db.query('SELECT * FROM career_profiles WHERE user_id=$1 LIMIT 1',[user]);
 const verified=saved.rows[0]||r.rows[0];
 return res.json({profile:{...verified,current_role:verified.current_job_role},saved:!!saved.rows[0],message:'Career profile saved to your account database.'});
}