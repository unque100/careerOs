CREATE TABLE support_requests (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','account','billing','privacy','bug_report','feature_request')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','replied','closed','spam')),
  owner_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_requests_status_created_idx ON support_requests(status,created_at DESC);

CREATE TABLE support_rate_limits (
  email_hash TEXT PRIMARY KEY,
  last_submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_rate_limits_time_idx ON support_rate_limits(last_submitted_at);