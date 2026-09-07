ALTER TABLE users
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN disabled_at TIMESTAMPTZ,
  ADD COLUMN disabled_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('MENTEE', 'MENTOR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

INSERT INTO user_roles (user_id, role)
SELECT id, 'MENTEE' FROM users
ON CONFLICT DO NOTHING;

CREATE INDEX users_active_idx ON users (is_active);
CREATE INDEX user_roles_role_idx ON user_roles (role);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mentorme_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON user_roles TO mentorme_app;
  END IF;
END
$$;
