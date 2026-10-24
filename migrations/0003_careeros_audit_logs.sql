CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_time_idx ON audit_logs(actor_user_id,created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type,entity_id);