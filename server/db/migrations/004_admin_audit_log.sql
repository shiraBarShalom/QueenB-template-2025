CREATE TABLE admin_actions (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_actions_actor_idx ON admin_actions (actor_id);
CREATE INDEX admin_actions_target_idx ON admin_actions (target_user_id);
CREATE INDEX admin_actions_created_idx ON admin_actions (created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mentorme_app') THEN
    GRANT SELECT, INSERT ON admin_actions TO mentorme_app;
    GRANT USAGE, SELECT ON SEQUENCE admin_actions_id_seq TO mentorme_app;
  END IF;
END
$$;
