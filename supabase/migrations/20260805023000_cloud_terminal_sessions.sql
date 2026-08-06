-- Durable index of cloud terminal sessions.
--
-- sprite-manager.ts held sessions in a module-level Map. That works in the
-- Codespace (one long-lived process) and silently fails on Vercel, where the
-- POST that carries a keystroke can land on a different lambda than the one
-- that created the session: the lookup misses, writeInput returns false, and
-- the keystroke is dropped while xterm's local echo still paints it. That is
-- the "I type and nothing happens" bug.
--
-- This table holds just enough to rebuild a session on any instance. The
-- terminal itself lives on the Sprite, not here — reattaching via
-- WSS /sprites/{name}/exec/{sprite_session_id} replays server-side scrollback,
-- so no output needs to be persisted.

create table if not exists public.cloud_terminal_sessions (
  -- The opaque id handed to the browser and used in the route URLs.
  id                 text primary key,

  sprite_name        text not null,
  -- Sprites-side exec session id, captured from the session_info frame. Null
  -- until that frame arrives; a reattach without it falls back to a fresh exec.
  sprite_session_id  text,

  cols               integer not null default 80,
  rows               integer not null default 24,

  exited             boolean not null default false,

  created_at         timestamptz not null default now(),
  last_active_at     timestamptz not null default now()
);

-- The reaper sweeps by age.
create index if not exists idx_cloud_terminal_sessions_active
  on public.cloud_terminal_sessions(last_active_at desc);

alter table public.cloud_terminal_sessions enable row level security;

-- Written only by the server via the service-role client, which bypasses RLS.
-- No anon policy: a browser must never enumerate or mutate session rows, since
-- an id is enough to drive a shell.
