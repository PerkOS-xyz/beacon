-- Enrollment state for tenants and the tables behind Stellar sign-in.

ALTER TABLE tenants
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'removed')),
  ADD COLUMN umami_user_id uuid UNIQUE,
  ADD COLUMN umami_password_enc text,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN removed_reason text;

-- One-time sign-in messages. A row is burned by setting used_at.
CREATE TABLE auth_challenges (
  nonce text PRIMARY KEY,
  stellar_account text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX auth_challenges_expires_at ON auth_challenges (expires_at);

-- Sessions are stored by the SHA-256 of the cookie value, never the value itself.
CREATE TABLE sessions (
  id_hash text PRIMARY KEY,
  stellar_account text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_stellar_account ON sessions (stellar_account);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO settings (key, value) VALUES ('enrollment_mode', 'open');

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text,
  details jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
