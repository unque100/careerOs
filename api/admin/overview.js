import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET'];
export default async function(req,res){
 const [profiles,goals,roadmaps,resumes,applications,interviews,usage,subs]=await Promise.all([
  db.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE onboarding_completed)::int AS onboarded FROM career_profiles'),
  db.query('SELECT count(*)::int AS total FROM career_goals'),
  db.query('SELECT count(*)::int AS total FROM career_roadmaps'),
  db.query('SELECT count(*)::int AS total FROM resume_documents'),
  db.query('SELECT count(*)::int AS total FROM job_applications'),
  db.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE status=\'completed\')::int AS completed FROM interview_sessions'),
  db.query('SELECT COALESCE(sum(request_count),0)::int AS requests FROM ai_usage_monthly'),
  db.query("SELECT plan_id,count(*)::int AS users FROM subscriptions GROUP BY plan_id ORDER BY plan_id")
 ]);
 return res.json({users:profiles.rows[0],goals:goals.rows[0].total,roadmaps:roadmaps.rows[0].total,resumes:resumes.rows[0].total,applications:applications.rows[0].total,interviews:interviews.rows[0],aiRequests:usage.rows[0].requests,subscriptions:subs.rows,generatedAt:new Date().toISOString()});
}