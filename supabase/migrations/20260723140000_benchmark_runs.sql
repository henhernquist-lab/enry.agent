-- Model Intelligence: real benchmark runs, replacing filesystem storage.
--
-- The benchmark engine (src/lib/benchmark/runner.ts) already calls real
-- models and scores real responses — it just had nowhere durable to put
-- the results. Storage was file-based (.data/benchmarks/*.json under
-- process.cwd()), which doesn't persist on Vercel serverless at all.
--
-- One table for both "latest per model" and "history": latest is just the
-- newest completed row per model_id, queried at read time — no separate
-- rollup table to keep in sync. Same posture as every other table here:
-- RLS enabled, service-role client bypasses it, ownership enforced via
-- .eq('user_id', uid) in route handlers.
--
-- The `progress`/`heartbeat_at` columns exist because a full run can run
-- long (several suites x several real model calls each) and must survive
-- past the HTTP response on serverless — the run is scheduled via Next's
-- after() (bounded by maxDuration) rather than a fire-and-forget
-- continuation, and the client polls this row for live progress, the same
-- shape as cruise_scans + /api/cruise/live-steps.

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_id         text NOT NULL,
  status           text NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'running', 'completed', 'failed')),

  -- Live progress while running: {"suite": "coding", "caseId": "...", "completed": 4, "total": 32}
  -- Polled by the UI the same way cruise_scans.live_steps is polled.
  progress         jsonb NOT NULL DEFAULT '{}'::jsonb,
  heartbeat_at     timestamptz,        -- updated on each onProgress tick; staleness = probably dead

  -- Final results (null until status = 'completed'). Mirrors BenchmarkRun /
  -- ModelBenchmark shapes in src/lib/benchmark/types.ts exactly, so the
  -- storage layer can round-trip without reshaping.
  overall_score    integer,
  category_scores  jsonb,              -- Record<BenchmarkCategory, number>
  metrics          jsonb,              -- { avgLatencyMs, tokensPerSec, avgCostUsd, successRate, totalInputTokens, totalOutputTokens, totalCostUsd }
  suite_results    jsonb,              -- SuiteResult[] (includes per-case results, truncated response text)

  error            text,               -- set when status = 'failed'

  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Latest-completed-run-per-model lookups (GET /api/models/benchmarks).
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_user_model_created
  ON benchmark_runs (user_id, model_id, created_at DESC);

-- Find any run still (or stuck) "running" — used to detect stale/dead runs
-- via heartbeat_at, same pattern as cruise_scans' idx_..._heartbeat index.
CREATE INDEX IF NOT EXISTS idx_benchmark_runs_status_heartbeat
  ON benchmark_runs (status, heartbeat_at)
  WHERE status = 'running';

ALTER TABLE benchmark_runs ENABLE ROW LEVEL SECURITY;
