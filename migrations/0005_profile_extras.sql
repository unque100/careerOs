ALTER TABLE career_profiles
  ADD COLUMN IF NOT EXISTS profile_headline TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS github_url TEXT;

ALTER TABLE career_profiles
  DROP CONSTRAINT IF EXISTS career_profiles_career_stage_check;

ALTER TABLE career_profiles
  ADD CONSTRAINT career_profiles_career_stage_check
  CHECK (career_stage IN (
    'student','fresh_graduate','working_professional','job_seeker',
    'career_switcher','promotion_seeker','entrepreneur','founder'
  ));