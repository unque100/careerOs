-- Expand CareerOS interview modes and learning resources without replacing existing records.
ALTER TABLE interview_sessions DROP CONSTRAINT IF EXISTS interview_sessions_interview_type_check;
ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_interview_type_check
 CHECK (interview_type IN ('behavioral','technical','dsa','backend','nodejs','sql','lld','hld','system_design','role_specific','javascript','java','python','oop','dbms','os','networking','security','distributed_systems','performance'));

ALTER TABLE learning_topics ADD COLUMN IF NOT EXISTS prerequisites TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE learning_topics ADD COLUMN IF NOT EXISTS learning_path TEXT;
ALTER TABLE learning_topics ADD COLUMN IF NOT EXISTS lesson_content JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS quiz_score INTEGER;
ALTER TABLE learning_progress DROP CONSTRAINT IF EXISTS learning_progress_quiz_score_check;
ALTER TABLE learning_progress ADD CONSTRAINT learning_progress_quiz_score_check CHECK (quiz_score IS NULL OR (quiz_score BETWEEN 0 AND 100));

CREATE TABLE IF NOT EXISTS user_learning_resources (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  topic_slug TEXT NOT NULL,
  is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  watched BOOLEAN NOT NULL DEFAULT FALSE,
  watch_progress_seconds INTEGER NOT NULL DEFAULT 0 CHECK (watch_progress_seconds >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,resource_key)
);
CREATE INDEX IF NOT EXISTS user_learning_resources_user_idx ON user_learning_resources(user_id,updated_at DESC);

-- Learning topics are supplied through the server-defined curated catalog because the shared catalog table is protected by row-level security. Existing catalog and user progress are left untouched.