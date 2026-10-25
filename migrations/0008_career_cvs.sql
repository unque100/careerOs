CREATE TABLE career_cvs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  cv_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_text TEXT NOT NULL DEFAULT '',
  job_description TEXT,
  ats_report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_cvs_updated_idx ON career_cvs(updated_at DESC);