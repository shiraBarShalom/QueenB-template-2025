-- Queens Match schema
-- Run manually against your local DB, or via a setup script, to (re)create all tables.
-- Seed data lives in seed.sql (run after this file).

DROP TABLE IF EXISTS proposed_slots CASCADE;
DROP TABLE IF EXISTS meeting_requests CASCADE;
DROP TABLE IF EXISTS mentor_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Domain 1: Auth & Profiles
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  programming_languages TEXT,
  tech_stack TEXT,
  job_title VARCHAR(255),
  company VARCHAR(255),
  years_of_experience INTEGER,
  profile_picture_url TEXT,
  github_url TEXT,
  linkedin_url TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE mentor_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  background TEXT,
  advises_on TEXT, -- e.g. "mock interviews, career planning, company X"
  max_meetings INTEGER,
  meeting_duration_minutes INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Domain 2: Discovery & Requests
CREATE TABLE meeting_requests (
  id SERIAL PRIMARY KEY,
  mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_MENTOR',
  -- MVP status values (Domain 3 owns transitions after create):
  -- PENDING_MENTOR -> PENDING_MENTEE -> SCHEDULED
  -- also: CANCELLED
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Domain 3: Scheduling & Statuses
CREATE TABLE proposed_slots (
  id SERIAL PRIMARY KEY,
  meeting_request_id INTEGER NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  proposed_start_time TIMESTAMP NOT NULL,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
