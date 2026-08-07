-- Golem HQ multi-agent architecture — Batch 1: the persistence spine.
--
-- Everything the orchestration layers write to. No execution logic lives here;
-- later batches (planner, dispatcher, builder adapter, validators, lease
-- enforcement) all read and write these tables.
--
-- NAMING NOTE: the blueprint calls layer 2 "builders", but this table also
-- holds layer-1 orchestrators and layer-3 validators, so it is `agents`.
-- Referencing columns follow it: tasks.assigned_agent, task_results.agent_id,
-- leases.owner_agent.
--
-- Builders are driven through the Cruise terminal in headless one-shot mode
-- (`gemini -p "..."`), not by puppeting an interactive TUI — so a run's whole
-- output is a single text blob, which is why task_results.output is plain text
-- rather than a structured transcript.

-- ── agents ────────────────────────────────────────────────────────────
-- All three layers in one table. Layer decides what a row means:
--   1 = orchestrator (planner / scheduler / coordinator)
--   2 = builder, driven by cli_command
--   3 = validator (typecheck / lint / test / security / perf / AI review)
create table if not exists public.agents (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  layer           smallint not null check (layer in (1, 2, 3)),

  -- Required for layer 2, meaningless for 1 and 3 — they're logic, not CLIs.
  cli_command     text,

  strengths       jsonb not null default '[]'::jsonb,
  speed_rating    smallint check (speed_rating between 1 and 5),
  cost_rating     smallint check (cost_rating between 1 and 5),
  reliability_pct smallint check (reliability_pct between 0 and 100),
  context_window  integer,

  enabled         boolean not null default true,

  -- Org-chart placement. Unused until the Batch 8 UI; here now so adding
  -- hierarchy later doesn't need a migration.
  parent_id       uuid references public.agents(id) on delete set null,

  created_at      timestamptz not null default now(),

  -- A layer-2 row without a command can't be dispatched to.
  constraint agents_layer2_needs_cli check (layer <> 2 or cli_command is not null)
);

create index if not exists idx_agents_layer on public.agents(layer, enabled);
create index if not exists idx_agents_parent on public.agents(parent_id);

-- ── missions ──────────────────────────────────────────────────────────
create table if not exists public.missions (
  id           uuid primary key default gen_random_uuid(),
  repo         text not null,
  goal         text not null,
  status       text not null default 'planning'
                 check (status in ('planning', 'running', 'awaiting_approval',
                                   'completed', 'failed', 'cancelled')),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_missions_repo on public.missions(repo, created_at desc);
create index if not exists idx_missions_status on public.missions(status, created_at desc);

-- Guardrail: one active mission per repo, enforced by the database rather than
-- by application code, so a race between two callers can't produce a second
-- active row. The three terminal statuses are excluded, so history accumulates
-- freely. Drop this index to allow concurrent missions per repo.
create unique index if not exists uniq_missions_one_active_per_repo
  on public.missions(repo)
  where status in ('planning', 'running', 'awaiting_approval');

-- ── tasks ─────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references public.missions(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  status         text not null default 'pending'
                   check (status in ('pending', 'assigned', 'running',
                                     'validating', 'complete', 'failed', 'blocked')),
  priority       text not null default 'medium'
                   check (priority in ('low', 'medium', 'high')),
  assigned_agent uuid references public.agents(id) on delete set null,

  -- Task ids this one waits on. A plain array rather than a join table: the
  -- scheduler reads a whole mission's graph at once, and the counts are small.
  depends_on     uuid[],

  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz
);

create index if not exists idx_tasks_mission on public.tasks(mission_id, created_at);
create index if not exists idx_tasks_status on public.tasks(status);

-- ── task_results ──────────────────────────────────────────────────────
create table if not exists public.task_results (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  agent_id    uuid references public.agents(id) on delete set null,
  output      text not null default '',
  success     boolean not null,
  error       text,
  duration_ms integer,
  created_at  timestamptz not null default now()
);

create index if not exists idx_task_results_task on public.task_results(task_id, created_at desc);

-- ── mission_events ────────────────────────────────────────────────────
-- Append-only. Every status change writes one; the live UI replays them.
-- Never updated or deleted, so the ordering is the mission's history.
create table if not exists public.mission_events (
  id         uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  task_id    uuid references public.tasks(id) on delete set null,
  ts         timestamptz not null default now(),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb
);

create index if not exists idx_mission_events_mission on public.mission_events(mission_id, ts);
create index if not exists idx_mission_events_task on public.mission_events(task_id, ts);

-- ── leases ────────────────────────────────────────────────────────────
-- Table only this batch. Enforcement (conflict detection, expiry sweeping)
-- arrives in Batch 6; nothing acquires or checks these yet.
create table if not exists public.leases (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  path_glob     text not null,
  lease_type    text not null check (lease_type in ('read', 'write', 'exclusive')),
  owner_agent   uuid references public.agents(id) on delete set null,
  acquired_at   timestamptz not null default now(),
  expires_at    timestamptz not null,
  released_at   timestamptz
);

-- Batch 6 asks "what unreleased leases overlap this path".
create index if not exists idx_leases_active on public.leases(task_id) where released_at is null;
create index if not exists idx_leases_expiry on public.leases(expires_at) where released_at is null;

-- ── RLS ───────────────────────────────────────────────────────────────
-- Same posture as cloud_terminal_sessions: written exclusively by the server
-- through the service-role client, which bypasses RLS. No anon policies are
-- granted, so none of this is reachable from a browser directly.
alter table public.agents         enable row level security;
alter table public.missions       enable row level security;
alter table public.tasks          enable row level security;
alter table public.task_results   enable row level security;
alter table public.mission_events enable row level security;
alter table public.leases         enable row level security;

-- ── Seed: the agent roster ────────────────────────────────────────────
-- Idempotent on name. Ratings are the blueprint's profiles; reliability_pct is
-- a starting estimate that later batches should overwrite from measured
-- task_results rather than trust.

-- Layer 1 — orchestrators. No CLI: these are logic, built in Batches 3-5.
insert into public.agents (name, layer, strengths, enabled) values
  ('Mission Planner', 1, '["decomposition","dependency-graphs","scoping"]'::jsonb, true),
  ('Scheduler',       1, '["prioritisation","parallelism","lease-arbitration"]'::jsonb, true),
  ('Coordinator',     1, '["progress-tracking","escalation","replanning"]'::jsonb, true)
on conflict (name) do nothing;

-- Layer 2 — builders, driven headlessly through the Cruise terminal.
insert into public.agents
  (name, layer, cli_command, strengths, speed_rating, cost_rating, reliability_pct, context_window, enabled) values
  ('Claude Code', 2, 'claude',
   '["multi-file-refactor","architecture","test-writing","long-context"]'::jsonb, 3, 4, 92, 200000, true),
  ('Codex CLI', 2, 'codex',
   '["algorithmic","single-file","competitive-programming"]'::jsonb, 4, 3, 85, 128000, true),
  -- --skip-trust: headless runs abort with exit 55 ("not running in a trusted
  -- directory") unless trust is granted interactively, which no unattended
  -- dispatch can do. See 20260807020000_gemini_skip_trust.sql.
  ('Gemini CLI', 2, 'gemini --skip-trust',
   '["large-context","research","documentation","multimodal"]'::jsonb, 4, 2, 84, 1000000, true),
  ('OpenHands', 2, 'openhands',
   '["autonomous-loops","environment-setup","debugging"]'::jsonb, 2, 2, 78, 128000, true),
  ('Crush CLI', 2, 'crush',
   '["fast-edits","boilerplate","scaffolding"]'::jsonb, 5, 1, 75, 64000, true)
on conflict (name) do nothing;

-- Disabled until its CLI syntax is documented — a row so the org chart and
-- hire flow can show it, but nothing will dispatch to it.
insert into public.agents
  (name, layer, cli_command, strengths, speed_rating, cost_rating, reliability_pct, context_window, enabled) values
  ('Freebuff', 2, 'freebuff', '["unknown"]'::jsonb, null, null, null, null, false)
on conflict (name) do nothing;

-- Layer 3 — validators. Execution logic lands in Batch 7; rows exist now so
-- the hire flow and org chart have real targets.
insert into public.agents (name, layer, strengths, enabled) values
  ('Type Checker',      3, '["tsc","type-safety"]'::jsonb, true),
  ('Linter',            3, '["eslint","style","dead-code"]'::jsonb, true),
  ('Test Runner',       3, '["playwright","regression"]'::jsonb, true),
  ('Security Scanner',  3, '["secrets","dependency-audit","injection"]'::jsonb, true),
  ('Performance Check', 3, '["bundle-size","runtime-profiling"]'::jsonb, true),
  ('AI Reviewer',       3, '["correctness","readability","intent-match"]'::jsonb, true)
on conflict (name) do nothing;
