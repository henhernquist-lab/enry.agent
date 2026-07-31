-- Per-user encrypted credentials for external services.
-- Stores IC login credentials (encrypted) and Google Classroom OAuth tokens
-- (refresh tokens) per user. Never exposes plaintext to the client.
CREATE TABLE IF NOT EXISTS user_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service           text NOT NULL CHECK (service IN ('infinite_campus', 'google_classroom')),
  -- For IC: encrypted username. For Classroom: OAuth refresh token (encrypted).
  credential_a      text,
  -- For IC only: encrypted password.
  credential_b      text,
  -- Human-readable label (e.g. the Google account email, or "IC").
  label             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service)
);

ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
