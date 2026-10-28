-- Security and processing queue primitives. Existing career records are untouched.
CREATE TABLE IF NOT EXISTS user_rate_limits (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bucket, window_start)
);
CREATE INDEX IF NOT EXISTS user_rate_limits_window_idx
  ON user_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS ai_processing_consents (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('resume_analysis','resume_assistance','job_analysis','research_notes','career_chat_attachment')),
  consent_version TEXT NOT NULL DEFAULT 'careeros-ai-document-processing-v1',
  provider_label TEXT NOT NULL DEFAULT 'CareerOS configured AI provider',
  source_type TEXT NOT NULL,
  source_ref TEXT,
  character_count INTEGER NOT NULL DEFAULT 0 CHECK (character_count >= 0),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_processing_consents_user_date_idx
  ON ai_processing_consents(user_id, consented_at DESC);

CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('research_notes')),
  source_type TEXT NOT NULL CHECK (source_type IN ('url','topic','text','pdf','docx','markdown')),
  title TEXT,
  source_url TEXT,
  source_title TEXT,
  source_text TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  editable_notes TEXT NOT NULL DEFAULT '',
  consent_id BIGINT REFERENCES ai_processing_consents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  note_id BIGINT REFERENCES research_notes(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS document_processing_jobs_pending_idx
  ON document_processing_jobs(status, created_at) WHERE status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS document_processing_jobs_user_idx
  ON document_processing_jobs(user_id, created_at DESC);