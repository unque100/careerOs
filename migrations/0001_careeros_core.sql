CREATE TABLE career_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  full_name TEXT,
  career_stage TEXT NOT NULL DEFAULT 'working_professional' CHECK (career_stage IN ('student','fresh_graduate','working_professional','job_seeker','career_switcher','promotion_seeker')),
  current_job_role TEXT,
  experience_years NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (experience_years >= 0 AND experience_years <= 70),
  target_role TEXT,
  current_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  education TEXT,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_companies JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_location TEXT,
  work_preference TEXT NOT NULL DEFAULT 'flexible' CHECK (work_preference IN ('onsite','hybrid','remote','flexible')),
  salary_expectation_inr BIGINT,
  target_date DATE,
  weekly_hours INTEGER NOT NULL DEFAULT 5 CHECK (weekly_hours BETWEEN 1 AND 80),
  learning_style TEXT NOT NULL DEFAULT 'mixed' CHECK (learning_style IN ('reading','videos','practice','projects','mixed')),
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  challenge_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_profiles_target_role_idx ON career_profiles(target_role);

CREATE TABLE career_goals (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  goal_type TEXT NOT NULL DEFAULT 'career_growth' CHECK (goal_type IN ('career_growth','new_role','promotion','skill_building','interview_prep','career_switch','portfolio','other')),
  target_role TEXT,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_goals_user_status_idx ON career_goals(user_id,status,created_at DESC);

CREATE TABLE career_roadmaps (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id BIGINT REFERENCES career_goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  target_role TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','completed','archived')),
  generated_by TEXT NOT NULL DEFAULT 'manual' CHECK (generated_by IN ('manual','ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_roadmaps_user_idx ON career_roadmaps(user_id,status,created_at DESC);

CREATE TABLE roadmap_tasks (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  roadmap_id BIGINT NOT NULL REFERENCES career_roadmaps(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL DEFAULT 1 CHECK (week_number BETWEEN 1 AND 104),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'learning' CHECK (category IN ('learning','practice','project','application','interview','review','networking','other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  estimated_minutes INTEGER NOT NULL DEFAULT 30 CHECK (estimated_minutes BETWEEN 5 AND 1440),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','completed','skipped')),
  completion_criteria TEXT,
  actual_minutes INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX roadmap_tasks_user_status_idx ON roadmap_tasks(user_id,status,due_date);
CREATE INDEX roadmap_tasks_roadmap_idx ON roadmap_tasks(roadmap_id,week_number,id);

CREATE TABLE career_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  context_type TEXT NOT NULL DEFAULT 'career_coach' CHECK (context_type IN ('career_coach','resume','job_description','interview','roadmap','learning','other')),
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_conversations_user_idx ON career_conversations(user_id,archived,updated_at DESC);

CREATE TABLE career_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES career_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX career_messages_conversation_idx ON career_messages(conversation_id,created_at,id);

CREATE TABLE resume_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT,
  raw_text TEXT NOT NULL,
  parsed_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX resume_documents_user_idx ON resume_documents(user_id,updated_at DESC);

CREATE TABLE resume_analyses (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  resume_id BIGINT REFERENCES resume_documents(id) ON DELETE SET NULL,
  target_role TEXT,
  job_description TEXT,
  analysis JSONB NOT NULL,
  estimated_match_score INTEGER CHECK (estimated_match_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX resume_analyses_user_idx ON resume_analyses(user_id,created_at DESC);

CREATE TABLE job_descriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT,
  title TEXT NOT NULL,
  source_url TEXT,
  raw_text TEXT NOT NULL,
  extracted_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_descriptions_user_idx ON job_descriptions(user_id,created_at DESC);

CREATE TABLE skill_gap_analyses (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  job_description_id BIGINT REFERENCES job_descriptions(id) ON DELETE CASCADE,
  current_job_role TEXT,
  target_role TEXT,
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX skill_gap_user_idx ON skill_gap_analyses(user_id,created_at DESC);

CREATE TABLE interview_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  interview_type TEXT NOT NULL CHECK (interview_type IN ('behavioral','technical','dsa','backend','nodejs','sql','lld','hld','system_design','role_specific')),
  difficulty TEXT NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner','intermediate','advanced')),
  target_role TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  rubric JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX interview_sessions_user_idx ON interview_sessions(user_id,started_at DESC);

CREATE TABLE interview_turns (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id,turn_number)
);
CREATE INDEX interview_turns_session_idx ON interview_turns(session_id,turn_number);

CREATE TABLE learning_topics (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner','intermediate','advanced')),
  description TEXT NOT NULL,
  resource_url TEXT,
  resource_source TEXT,
  resource_verified BOOLEAN NOT NULL DEFAULT false,
  estimated_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX learning_topics_category_idx ON learning_topics(category,difficulty);

CREATE TABLE learning_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic_id BIGINT REFERENCES learning_topics(id) ON DELETE CASCADE,
  topic_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','needs_revision')),
  notes TEXT,
  time_spent_minutes INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,topic_slug)
);
CREATE INDEX learning_progress_user_status_idx ON learning_progress(user_id,status,updated_at DESC);

CREATE TABLE dsa_problems (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  statement TEXT NOT NULL,
  practice_url TEXT,
  source TEXT,
  source_verified BOOLEAN NOT NULL DEFAULT false,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX dsa_problems_topic_idx ON dsa_problems(topic,difficulty);

CREATE TABLE coding_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  problem_id BIGINT REFERENCES dsa_problems(id) ON DELETE SET NULL,
  problem_slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('attempted','solved','needs_revision','skipped')),
  language TEXT,
  approach_notes TEXT,
  time_complexity TEXT,
  space_complexity TEXT,
  actual_minutes INTEGER,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX coding_attempts_user_idx ON coding_attempts(user_id,attempted_at DESC);

CREATE TABLE job_applications (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_description_id BIGINT REFERENCES job_descriptions(id) ON DELETE SET NULL,
  application_url TEXT,
  location TEXT,
  salary_min_inr BIGINT,
  salary_max_inr BIGINT,
  status TEXT NOT NULL DEFAULT 'interested' CHECK (status IN ('interested','preparing','applied','recruiter_screening','assessment','technical_interview','hiring_manager','final_round','offer','accepted','rejected','withdrawn')),
  application_date DATE,
  next_follow_up_at TIMESTAMPTZ,
  resume_version TEXT,
  recruiter_contact TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_applications_user_status_idx ON job_applications(user_id,status,updated_at DESC);
CREATE INDEX job_applications_followup_idx ON job_applications(user_id,next_follow_up_at);

CREATE TABLE user_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  duration_minutes INTEGER,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_activity_user_idx ON user_activity(user_id,created_at DESC);

CREATE TABLE ai_usage_monthly (
  user_id TEXT NOT NULL,
  month_start DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,month_start)
);

CREATE TABLE subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL DEFAULT 'free' CHECK (plan_id IN ('free','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','cancelled','expired','pending')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  billing_provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);