-- Case study progress is stored in learning_progress by topic slug; these tables add code history and saved external job records.
CREATE TABLE IF NOT EXISTS coding_submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  problem_slug TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  language TEXT NOT NULL,
  source_code TEXT NOT NULL,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('run','submit')),
  status TEXT NOT NULL,
  passed_count INTEGER NOT NULL DEFAULT 0 CHECK (passed_count >= 0),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  test_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  execution_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_runtime_seconds NUMERIC(8,3),
  max_memory_kb INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coding_submissions_user_idx ON coding_submissions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS coding_submissions_problem_idx ON coding_submissions(user_id,problem_slug,created_at DESC);

CREATE TABLE IF NOT EXISTS saved_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  external_job_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  source TEXT NOT NULL,
  job_url TEXT NOT NULL,
  location TEXT,
  description TEXT,
  salary TEXT,
  seniority TEXT,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,external_job_id)
);
CREATE INDEX IF NOT EXISTS saved_jobs_user_idx ON saved_jobs(user_id,created_at DESC);