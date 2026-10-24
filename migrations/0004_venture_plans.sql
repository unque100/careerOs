CREATE TABLE IF NOT EXISTS venture_plans (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL DEFAULT current_setting('hatchable.user_id'::text, true),
  title text NOT NULL,
  business_type text,
  stage text NOT NULL DEFAULT 'idea',
  brief text NOT NULL,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venture_plans_user_time_idx ON venture_plans(user_id, created_at DESC);