-- Server and client errors, made queryable.
--
-- Until now an uncaught throw in a Server Component rendered as a bare
-- platform 500 ("This page couldn't load") and left nothing behind: no stack,
-- no route, nothing to grep. The only record lived in Vercel's runtime log,
-- which needs a token to read and ages out. This table is the durable copy.
--
-- Written from the error boundaries via /api/errors. Deliberately tolerant:
-- user_id is nullable because a layout can throw before a session resolves,
-- and the login page renders outside auth entirely.

create table if not exists public.error_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,

  -- 'server' = React error boundary caught a render/RSC throw.
  -- 'global' = root layout threw; global-error.tsx caught it.
  -- 'client' = a client component threw during render.
  source      text not null default 'server' check (source in ('server', 'global', 'client')),

  -- Next.js replaces the message with an opaque digest in production builds;
  -- it is the only handle that ties a UI report back to the Vercel log line.
  digest      text,
  message     text not null default '',
  stack       text,

  -- Where it happened, so a spike can be attributed to one route.
  pathname    text,
  user_agent  text,

  created_at  timestamptz not null default now()
);

-- The two queries this exists to answer: "what broke lately" and
-- "what keeps breaking on this route".
create index if not exists idx_error_log_recent on public.error_log(created_at desc);
create index if not exists idx_error_log_pathname on public.error_log(pathname, created_at desc);

alter table public.error_log enable row level security;

-- Writes arrive through the service-role client in /api/errors, which bypasses
-- RLS; no anon policy is granted, so the table can't be scraped or spammed
-- directly from a browser.
