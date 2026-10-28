-- CareerOS application relationships, scheduled interviews and personal research notes.
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS source_job_id TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS application_roadmap_tasks (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  application_id BIGINT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL REFERENCES roadmap_tasks(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(application_id,task_id)
);
CREATE INDEX IF NOT EXISTS application_roadmap_tasks_user_idx
  ON application_roadmap_tasks(user_id,application_id);

CREATE TABLE IF NOT EXISTS application_interview_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  application_id BIGINT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  interview_session_id BIGINT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(application_id,interview_session_id)
);
CREATE INDEX IF NOT EXISTS application_interview_sessions_user_idx
  ON application_interview_sessions(user_id,application_id);

CREATE TABLE IF NOT EXISTS application_interviews (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  application_id BIGINT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  interview_session_id BIGINT REFERENCES interview_sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  format TEXT NOT NULL DEFAULT 'video' CHECK (format IN ('phone','video','onsite','other')),
  location_or_link TEXT,
  reminder_at TIMESTAMPTZ,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_interviews_user_date_idx
  ON application_interviews(user_id,scheduled_at) WHERE status='scheduled';
CREATE INDEX IF NOT EXISTS application_interviews_application_idx
  ON application_interviews(user_id,application_id,scheduled_at);

CREATE TABLE IF NOT EXISTS research_notes (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('url','topic','text','pdf','docx','markdown')),
  source_url TEXT,
  source_title TEXT,
  source_excerpt TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  key_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  code_snippets JSONB NOT NULL DEFAULT '[]'::jsonb,
  interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  editable_notes TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_notes_user_updated_idx
  ON research_notes(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS research_notes_user_bookmark_idx
  ON research_notes(user_id,is_bookmarked,updated_at DESC);
CREATE INDEX IF NOT EXISTS research_notes_search_idx
  ON research_notes USING GIN (to_tsvector('english',title || ' ' || summary || ' ' || editable_notes));
CREATE INDEX IF NOT EXISTS research_notes_tags_idx
  ON research_notes USING GIN (tags);

CREATE TABLE IF NOT EXISTS research_note_links (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id BIGINT NOT NULL REFERENCES research_notes(id) ON DELETE CASCADE,
  learning_topic_slug TEXT,
  roadmap_task_id BIGINT REFERENCES roadmap_tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((learning_topic_slug IS NOT NULL) <> (roadmap_task_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS research_note_topic_link_unique
  ON research_note_links(user_id,note_id,learning_topic_slug) WHERE learning_topic_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS research_note_task_link_unique
  ON research_note_links(user_id,note_id,roadmap_task_id) WHERE roadmap_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS research_note_links_user_idx
  ON research_note_links(user_id,note_id);

-- Add private research/application records to the account-scoped data policy.