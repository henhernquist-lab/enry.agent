-- Enry Lab: Overnight Autonomous R&D
-- Feature 3 — user-curated idea queue + disposable scratch-repo experiments.
-- Runs are dispatched to GitHub Actions on a dedicated scratch org.
-- Stale-run reclamation is handled by /api/cron/overnight-reclaim.

create table if not exists overnight_ideas (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  title           text not null,
  description     text not null default '',
  status          text not null default 'queued'
                    check (status in ('queued','running','completed','dead_end','error')),
  scratch_repo_owner text not null default '',
  scratch_repo_name  text not null default '',
  latest_run_id   uuid,
  verdict         text check (verdict in ('worth_pursuing','dead_end',null)),
  verdict_reasoning text,
  morning_note    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_overnight_ideas_user on overnight_ideas(user_id);
create index idx_overnight_ideas_status on overnight_ideas(user_id, status);

create table if not exists overnight_runs (
  id              uuid primary key default gen_random_uuid(),
  idea_id         uuid not null references overnight_ideas(id) on delete cascade,
  user_id         text not null,
  status          text not null default 'dispatched'
                    check (status in ('dispatched','running','completed','dead_end','failed','stale')),
  scratch_repo_full text not null default '',
  gh_run_id       bigint,
  dispatch_token_hash text not null default '',
  heartbeat_at    timestamptz,
  result_summary  text,
  result_detail   text,
  error           text,
  run_time_ms     bigint,
  dispatched_at   timestamptz not null default now(),
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_overnight_runs_idea on overnight_runs(idea_id);
create index idx_overnight_runs_user on overnight_runs(user_id);
create index idx_overnight_runs_status on overnight_runs(status);
create index idx_overnight_runs_heartbeat on overnight_runs(status, heartbeat_at)
  where status = 'running';
