-- Composio Connectors (v1): Gmail + Google Calendar as real chat tools via MCP.
-- No Gmail/Calendar OAuth token is ever stored here — Composio fully custodies
-- those; this table only tracks which toolkit a connection is for, its status,
-- and Composio's own opaque reference IDs, enough to render Settings UI and to
-- decide whether to attach that toolkit's tools to a chat call. Run this in the
-- Supabase SQL editor.

CREATE TABLE IF NOT EXISTS composio_connections (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  toolkit                        text NOT NULL CHECK (toolkit IN ('gmail','googlecalendar')),
  status                         text NOT NULL DEFAULT 'disconnected'
                                 CHECK (status IN ('disconnected','pending','connected','error')),
  -- Composio's own IDs. Opaque references, not credentials — safe to store.
  composio_auth_config_id        text,
  composio_connected_account_id  text,
  error                          text,
  connected_at                   timestamptz,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, toolkit)
);

ALTER TABLE composio_connections ENABLE ROW LEVEL SECURITY;
