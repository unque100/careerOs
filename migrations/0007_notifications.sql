CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY,
  email_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  browser_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_summary_enabled BOOLEAN NOT NULL DEFAULT false,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  reminder_hour_local INTEGER NOT NULL DEFAULT 9 CHECK (reminder_hour_local BETWEEN 0 AND 23),
  last_email_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE career_reminders (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','job','roadmap','goal','dsa','system_design','interview','custom')),
  due_at TIMESTAMPTZ NOT NULL,
  related_type TEXT,
  related_id TEXT,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  browser_enabled BOOLEAN NOT NULL DEFAULT true,
  completed_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  browser_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_reminders_due_idx ON career_reminders(user_id, due_at) WHERE completed_at IS NULL;
CREATE TABLE career_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT,
  source_type TEXT,
  source_id TEXT,
  read_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, dedupe_key)
);
CREATE INDEX career_notifications_user_time_idx ON career_notifications(user_id, created_at DESC);
CREATE INDEX career_notifications_unread_idx ON career_notifications(user_id, read_at, created_at DESC);