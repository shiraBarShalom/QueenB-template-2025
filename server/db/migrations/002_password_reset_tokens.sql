CREATE TABLE password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX password_reset_tokens_user_idx
  ON password_reset_tokens (user_id);
CREATE INDEX password_reset_tokens_expiry_idx
  ON password_reset_tokens (expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mentorme_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO mentorme_app;
    GRANT USAGE, SELECT ON SEQUENCE password_reset_tokens_id_seq TO mentorme_app;
  END IF;
END
$$;
