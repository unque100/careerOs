import { db } from 'hatchable';

export const access = 'admin';
export const methods = ['GET','DELETE'];

const QA_NAME = 'CareerOS Temporary Profile DB Check';
const QA_ROLE = '__careeros_tmp_db_check_v26__';

export default async function(req,res) {
  if (req.method === 'DELETE') {
    if (req.body?.confirm !== 'CLEANUP_CAREEROS_TEMP_PROFILE_CHECK') {
      return res.status(400).json({error:'Explicit cleanup confirmation required.'});
    }
    const removed = await db.query(
      'DELETE FROM career_profiles WHERE full_name=$1 AND target_role=$2 RETURNING id',
      [QA_NAME, QA_ROLE]
    );
    return res.json({cleanup:true,removedCount:removed.rows.length,recordIds:removed.rows.map(x=>x.id)});
  }
  const schema = await db.query('SELECT current_schema() AS schema');
  const counts = await db.query(
    'SELECT count(*)::int AS total, count(*) FILTER (WHERE onboarding_completed)::int AS completed, max(updated_at) AS latest_update FROM career_profiles'
  );
  const rows = await db.query(
    'SELECT id, user_id, full_name, target_role, onboarding_completed, created_at, updated_at FROM career_profiles ORDER BY updated_at DESC LIMIT 20'
  );
  return res.json({
    schema:schema.rows[0]?.schema||null,
    table:'career_profiles',
    counts:counts.rows[0],
    profiles:rows.rows.map(x=>({
      id:x.id,userIdSuffix:String(x.user_id||'').slice(-5),
      fullName:x.full_name,targetRole:x.target_role,
      onboardingCompleted:x.onboarding_completed,createdAt:x.created_at,updatedAt:x.updated_at
    })),
    qaCleanupAvailable:true
  });
}