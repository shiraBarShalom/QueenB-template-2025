-- Version 001: secure accounts, shared profiles, mentor profiles, and sessions.
-- This migration is deliberately non-destructive and can upgrade the original schema.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE SEQUENCE IF NOT EXISTS users_id_seq;
ALTER SEQUENCE users_id_seq OWNED BY users.id;
SELECT SETVAL(
  'users_id_seq',
  COALESCE((SELECT MAX(id) FROM users), 0) + 1,
  FALSE
);
ALTER TABLE users ALTER COLUMN id SET DEFAULT NEXTVAL('users_id_seq');
UPDATE users SET id = NEXTVAL('users_id_seq') WHERE id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
  ) THEN
    EXECUTE 'UPDATE users SET display_name = COALESCE(display_name, username, email)';
    EXECUTE 'ALTER TABLE users ALTER COLUMN username DROP NOT NULL';
  ELSE
    UPDATE users SET display_name = COALESCE(display_name, email);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email IS NULL OR BTRIM(email) = '') THEN
    RAISE EXCEPTION 'Every existing user must have an email before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE password_hash IS NULL) THEN
    RAISE EXCEPTION 'Run npm run db:upgrade-passwords before db:migrate';
  END IF;
END
$$;

ALTER TABLE users ALTER COLUMN id SET NOT NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  background TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  job_title VARCHAR(255),
  company VARCHAR(255),
  years_of_experience INTEGER,
  programming_languages TEXT[] NOT NULL DEFAULT '{}',
  tech_stack TEXT[] NOT NULL DEFAULT '{}',
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_profiles_experience_nonnegative
    CHECK (years_of_experience IS NULL OR years_of_experience >= 0),
  CONSTRAINT user_profiles_linkedin_length
    CHECK (linkedin_url IS NULL OR LENGTH(linkedin_url) <= 2048),
  CONSTRAINT user_profiles_github_length
    CHECK (github_url IS NULL OR LENGTH(github_url) <= 2048)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'job_title'
  ) THEN
    INSERT INTO user_profiles (
      user_id,
      linkedin_url,
      github_url,
      job_title,
      company,
      years_of_experience,
      programming_languages,
      tech_stack
    )
    SELECT
      id,
      linkedin_url,
      github_url,
      job_title,
      company,
      years_of_experience,
      CASE
        WHEN programming_languages IS NULL OR BTRIM(programming_languages) = '' THEN '{}'
        ELSE STRING_TO_ARRAY(programming_languages, ',')
      END,
      CASE
        WHEN tech_stack IS NULL OR BTRIM(tech_stack) = '' THEN '{}'
        ELSE STRING_TO_ARRAY(tech_stack, ',')
      END
    FROM users
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO user_profiles (user_id)
    SELECT id FROM users
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS mentor_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  advice_topics TEXT[] NOT NULL DEFAULT '{}',
  max_meetings INTEGER,
  meeting_duration_minutes INTEGER,
  accepting_requests BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS advice_topics TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS accepting_requests BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentor_profiles' AND column_name = 'advises_on'
  ) THEN
    UPDATE mentor_profiles
    SET advice_topics = STRING_TO_ARRAY(advises_on, ',')
    WHERE CARDINALITY(advice_topics) = 0
      AND advises_on IS NOT NULL
      AND BTRIM(advises_on) <> '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentor_profiles' AND column_name = 'background'
  ) THEN
    UPDATE user_profiles AS profile
    SET background = mentor.background,
        updated_at = NOW()
    FROM mentor_profiles AS mentor
    WHERE profile.user_id = mentor.user_id
      AND profile.background IS NULL
      AND mentor.background IS NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mentor_profiles_max_meetings_positive'
  ) THEN
    ALTER TABLE mentor_profiles
      ADD CONSTRAINT mentor_profiles_max_meetings_positive
      CHECK (max_meetings IS NULL OR max_meetings > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mentor_profiles_duration_positive'
  ) THEN
    ALTER TABLE mentor_profiles
      ADD CONSTRAINT mentor_profiles_duration_positive
      CHECK (meeting_duration_minutes IS NULL OR meeting_duration_minutes > 0);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);
CREATE INDEX IF NOT EXISTS mentor_profiles_accepting_idx
  ON mentor_profiles (accepting_requests)
  WHERE accepting_requests = TRUE;

-- In the documented local setup, migrations run as mentorme_owner while the
-- web server connects as the restricted mentorme_app role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mentorme_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO mentorme_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mentorme_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mentorme_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mentorme_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mentorme_app';
  END IF;
END
$$;
