CREATE TABLE compiler_runs (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  language TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX compiler_runs_user_time_idx ON compiler_runs(user_id, created_at DESC);
CREATE INDEX compiler_runs_expiry_idx ON compiler_runs(expires_at);