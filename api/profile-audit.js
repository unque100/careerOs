import { db } from 'hatchable';

export const access = 'member';
export const methods = ['GET'];

export default async function(req,res) {
  const schema = await db.query("SELECT current_schema() AS schema");
  const rows = await db.query("SELECT id, user_id, full_name, target_role, onboarding_completed, created_at, updated_at FROM career_profiles ORDER BY updated_at DESC LIMIT 50");
  const counts = await db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE onboarding_completed)::int AS completed, max(updated_at) AS latest_update FROM career_profiles");
  return res.json({
    inspected_schema: schema.rows[0]?.schema || null,
    table: "career_profiles",
    counts: counts.rows[0],
    profiles: rows.rows.map(x => ({
      id: x.id,
      user_id_suffix: String(x.user_id || "").slice(-5),
      full_name: x.full_name,
      target_role: x.target_role,
      onboarding_completed: x.onboarding_completed,
      created_at: x.created_at,
      updated_at: x.updated_at
    }))
  });
}