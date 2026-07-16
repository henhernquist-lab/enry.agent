-- URGENT DATA-LOSS FIX: chat history has never persisted. Commit ececba2
-- (2026-07-03, "move chat history from localStorage to Supabase") pointed
-- src/lib/chat-history.ts and src/app/api/chats/* at Supabase tables `chats`
-- and `messages` and DELETED the working localStorage fallback in the same
-- commit — but the migration to create those tables was never written.
-- Confirmed live: every save has failed with PGRST205 "Could not find the
-- table 'public.chats' in the schema cache" for 13 days, silently (the GET
-- routes swallow the error and return an empty list; the POST route's error
-- was never surfaced anywhere the user would see it). No conversation has
-- been durably saved since that commit shipped.
--
-- Schema matches the columns the existing routes already read/write exactly
-- (src/app/api/chats/route.ts, src/app/api/chats/[id]/route.ts) — this is a
-- pure "create what the code already expects," no code changes needed.
-- Run this in the Supabase SQL editor immediately.

CREATE TABLE IF NOT EXISTS chats (
  id         text PRIMARY KEY,              -- client-generated, e.g. "c_<ts>_<rand>" (newConversationId())
  google_id  text NOT NULL,                 -- NextAuth session.user.id — ownership scoping
  title      text NOT NULL DEFAULT 'New chat',
  model      text NOT NULL DEFAULT 'deepseek-ai/deepseek-v4-pro',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chats_google_id_updated ON chats (google_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id      text NOT NULL REFERENCES chats(id) ON DELETE CASCADE,  -- DELETE /api/chats/[id] only
                                                                        -- deletes the chats row and
                                                                        -- relies on this cascade
  google_id    text NOT NULL,
  message_data jsonb NOT NULL,              -- the full UIMessage object, verbatim
  position     integer NOT NULL,            -- ordering within the chat
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_position ON messages (chat_id, position);

-- Same posture as every other table here: RLS enabled, server routes use the
-- service-role client which bypasses it — ownership is enforced in the route
-- handlers (google_id checks), not via RLS policies.
ALTER TABLE chats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
