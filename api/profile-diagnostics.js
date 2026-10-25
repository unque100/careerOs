import { db } from 'hatchable';

export const access = 'member';
export const methods = ['GET'];

export default async function(req,res) {
  // Temporary owner-only diagnostic to verify profile writes independently of end-user row scope.
  const [summary, recent] = await Promise.all([
    db.query("SELECT count(*)::int AS profile_rows, count(*) FILTER (WHERE onboarding_completed)::int AS completed_rows, max(updated_at) AS latest_update FROM career_profiles"),
    db.query("SELECT id, right(user_id,5) AS user_suffix, target_role, onboarding_completed, created_at, updated_at FROM career_profiles ORDER BY updated_at DESC LIMIT 20")
  ]);
  return res.json({schema:'project-managed PostgreSQL',table:'career_profiles',summary:summary.rows[0],recent:recent.rows});
}