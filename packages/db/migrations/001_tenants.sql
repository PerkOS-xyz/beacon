-- A tenant is one project building on Stellar.
-- stellar_account is proven with a SEP-53 signed message at enrollment.
CREATE TABLE tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  stellar_account text NOT NULL UNIQUE,
  umami_team_id   uuid UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz
);
