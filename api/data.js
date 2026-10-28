import { db } from 'hatchable';
import { respondToApiError } from 'lib/api-errors.js';
import { logActivity } from 'lib/career.js';
export const access = 'user';
export const methods = ['GET','DELETE'];
async function handle(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const [profile,goals,roadmaps,tasks,conversations,messages,resumes,resumeAnalyses,jobs,gaps,interviews,turns,learning,dsa,applications,activity,usage,subscription,careerCvs,researchNotes,researchNoteLinks,applicationInterviews,applicationTaskLinks,applicationInterviewLinks,savedJobs,codingSubmissions,reminders,aiProcessingConsents,documentProcessingJobs]=await Promise.all([
   db.query('SELECT * FROM career_profiles WHERE user_id=$1',[user]),
   db.query('SELECT * FROM career_goals WHERE user_id=$1',[user]),
   db.query('SELECT * FROM career_roadmaps WHERE user_id=$1',[user]),
   db.query('SELECT * FROM roadmap_tasks WHERE user_id=$1',[user]),
   db.query('SELECT * FROM career_conversations WHERE user_id=$1',[user]),
   db.query('SELECT * FROM career_messages WHERE user_id=$1',[user]),
   db.query('SELECT * FROM resume_documents WHERE user_id=$1',[user]),
   db.query('SELECT * FROM resume_analyses WHERE user_id=$1',[user]),
   db.query('SELECT * FROM job_descriptions WHERE user_id=$1',[user]),
   db.query('SELECT * FROM skill_gap_analyses WHERE user_id=$1',[user]),
   db.query('SELECT * FROM interview_sessions WHERE user_id=$1',[user]),
   db.query('SELECT * FROM interview_turns WHERE user_id=$1',[user]),
   db.query('SELECT * FROM learning_progress WHERE user_id=$1',[user]),
   db.query('SELECT * FROM coding_attempts WHERE user_id=$1',[user]),
   db.query('SELECT * FROM job_applications WHERE user_id=$1',[user]),
   db.query('SELECT * FROM user_activity WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5000',[user]),
   db.query('SELECT * FROM ai_usage_monthly WHERE user_id=$1',[user]),
   db.query('SELECT plan_id,status,starts_at,expires_at,billing_provider FROM subscriptions WHERE user_id=$1',[user]),
   db.query('SELECT * FROM career_cvs WHERE user_id=$1',[user]),
   db.query('SELECT * FROM research_notes WHERE user_id=$1',[user]),
   db.query('SELECT * FROM application_interviews WHERE user_id=$1',[user]),
   db.query('SELECT * FROM application_roadmap_tasks WHERE user_id=$1',[user]),
   db.query('SELECT * FROM application_interview_sessions WHERE user_id=$1',[user]),
   db.query('SELECT * FROM research_note_links WHERE user_id=$1',[user]),
   db.query('SELECT * FROM saved_jobs WHERE user_id=$1',[user]),
   db.query('SELECT * FROM coding_submissions WHERE user_id=$1',[user]),
   db.query('SELECT * FROM career_reminders WHERE user_id=$1',[user]),
   db.query('SELECT * FROM ai_processing_consents WHERE user_id=$1 ORDER BY consented_at DESC LIMIT 500',[user]),
   db.query('SELECT id,user_id,job_type,source_type,title,source_url,source_title,tags,editable_notes,consent_id,status,attempts,note_id,last_error,created_at,updated_at,claimed_at,completed_at FROM document_processing_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500',[user])
  ]);
  return res.json({exportedAt:new Date().toISOString(),format:'CareerOS account data JSON',notice:'This export contains personal career information. Keep it in a private location.',data:{profile:profile.rows,goals:goals.rows,roadmaps:roadmaps.rows,tasks:tasks.rows,conversations:conversations.rows,messages:messages.rows,resumes:resumes.rows,resumeAnalyses:resumeAnalyses.rows,jobDescriptions:jobs.rows,skillGapAnalyses:gaps.rows,interviews:interviews.rows,interviewTurns:turns.rows,learningProgress:learning.rows,codingAttempts:dsa.rows,jobApplications:applications.rows,activity:activity.rows,aiUsage:usage.rows,subscriptions:subscription.rows,careerCvs:careerCvs.rows,researchNotes:researchNotes.rows,researchNoteLinks:researchNoteLinks.rows,applicationInterviews:applicationInterviews.rows,applicationRoadmapTasks:applicationTaskLinks.rows,applicationInterviewSessions:applicationInterviewLinks.rows,savedJobs:savedJobs.rows,codingSubmissions:codingSubmissions.rows,reminders:reminders.rows,aiProcessingConsents:aiProcessingConsents.rows,documentProcessingJobs:documentProcessingJobs.rows}});
 }
 if(bConfirmation(req.body)!=='DELETE MY CAREER DATA')return res.status(400).json({error:'To permanently delete CareerOS data, send confirmation exactly: DELETE MY CAREER DATA.'});
 const statements=[
  {sql:'DELETE FROM resume_analyses WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM research_note_links WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM document_processing_jobs WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM ai_processing_consents WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM user_rate_limits WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM research_notes WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM career_reminders WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM saved_jobs WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM coding_submissions WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM application_interview_sessions WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM application_interviews WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM application_roadmap_tasks WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM career_cvs WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM skill_gap_analyses WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM career_conversations WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM resume_documents WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM job_descriptions WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM career_roadmaps WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM career_goals WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM interview_sessions WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM interview_turns WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM learning_progress WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM coding_attempts WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM job_applications WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM user_activity WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM ai_usage_monthly WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM subscriptions WHERE user_id=$1',params:[user]},
  {sql:'DELETE FROM career_profiles WHERE user_id=$1',params:[user]}
 ];
 await db.transaction(statements);
 return res.json({deleted:true,message:'Your CareerOS application data has been deleted. This does not delete the underlying platform authentication account; sign out and use the account provider’s account-management flow if you also need that account removed.'});
}
function bConfirmation(b){return b&&typeof b.confirmation==='string'?b.confirmation:''}

export default async function(req,res){
 try{return await handle(req,res)}catch(error){return respondToApiError('api/data.js',error,req,res)}
}