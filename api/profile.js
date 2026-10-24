import { db } from 'hatchable';
import { clean, logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','POST','PUT'];
const stages=new Set(['student','fresh_graduate','working_professional','job_seeker','career_switcher','promotion_seeker']);
const styles=new Set(['reading','videos','practice','projects','mixed']);
const prefs=new Set(['onsite','hybrid','remote','flexible']);
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const r=await db.query('SELECT * FROM career_profiles WHERE user_id=$1',[user]);
  const sub=await db.query("SELECT plan_id,status,expires_at FROM subscriptions WHERE user_id=$1 LIMIT 1",[user]);
  const profile=r.rows[0]?{...r.rows[0],current_role:r.rows[0].current_job_role}:null;
  return res.json({profile,subscription:sub.rows[0]||{plan_id:'free',status:'active',expires_at:null},account:{email:req.user.email,name:req.user.name||null}});
 }
 const b=req.body||{},fullName=clean(b.fullName,120),stage=stages.has(b.careerStage)?b.careerStage:'working_professional';
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
 const sql="INSERT INTO career_profiles(user_id,full_name,career_stage,current_job_role,experience_years,target_role,current_skills,education,certifications,target_companies,preferred_location,work_preference,salary_expectation_inr,target_date,weekly_hours,learning_style,strengths,challenge_areas,onboarding_completed) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,true) ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,career_stage=EXCLUDED.career_stage,current_job_role=EXCLUDED.current_job_role,experience_years=EXCLUDED.experience_years,target_role=EXCLUDED.target_role,current_skills=EXCLUDED.current_skills,education=EXCLUDED.education,certifications=EXCLUDED.certifications,target_companies=EXCLUDED.target_companies,preferred_location=EXCLUDED.preferred_location,work_preference=EXCLUDED.work_preference,salary_expectation_inr=EXCLUDED.salary_expectation_inr,target_date=EXCLUDED.target_date,weekly_hours=EXCLUDED.weekly_hours,learning_style=EXCLUDED.learning_style,strengths=EXCLUDED.strengths,challenge_areas=EXCLUDED.challenge_areas,onboarding_completed=true,updated_at=now() RETURNING *";
 const r=await db.query(sql,[user,fullName||null,stage,role||null,experience,target,JSON.stringify(skillList),clean(b.education,400)||null,JSON.stringify(certs),JSON.stringify(companies),clean(b.preferredLocation,160)||null,pref,salary,targetDate||null,weekly,style,JSON.stringify(strengths),JSON.stringify(challenges)]);
 await db.query("INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,'free','active') ON CONFLICT(user_id) DO NOTHING",[user]);
 await logActivity(user,'profile_saved','career_profile',r.rows[0].id,{careerStage:stage,targetRole:target});
 return res.json({profile:{...r.rows[0],current_role:r.rows[0].current_job_role},message:'Career profile saved. Your dashboard now reflects your goals and progress.'});
}