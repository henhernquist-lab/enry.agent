-- Usage logging + alert dismissals for the Enry Engine usage dashboard.
--
-- usage_log is the canonical source of truth for tokens + cost + latency per
-- AI request across every mode (chat / drive / cruise / learn / lab). Request
-- counts can ALSO be derived from skill_invocations, but only this table
-- carries token/cost/latency — so the dashboard queries it first and falls
-- back to skill_invocations (request counts only) until this migration is
-- applied and the chat route's onFinish logging accumulates rows.
--
-- Same posture as every other table here: RLS enabled as defense-in-depth,
-- service-role client bypasses it, ownership is enforced in route handlers
-- via .eq('user_id', uid). user_id references profiles(id) — the dominant
-- FK convention (matches claims / evolution_runs / composio_connections).

CREATE TABLE IF NOT EXISTS usage_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model_id          text NOT NULL,
  provider          text NOT NULL DEFAULT '',
  mode              text NOT NULL DEFAULT 'chat'
                       CHECK (mode IN ('chat','drive','cruise','learn','lab')),
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens      integer NOT NULL DEFAULT 0,
  cost_usd          numeric(12,6) NOT NULL DEFAULT 0,
  latency_ms        integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'success'
                       CHECK (status IN ('success','error','timeout')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_log_user_created
  ON usage_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_user_mode
  ON usage_log (user_id, mode, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_user_model
  ON usage_log (user_id, model_id, created_at DESC);

ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

-- Dismissed usage alerts. One row per (user, alert_key) — its presence
-- suppresses re-surfacing that alert. alert_key is namespaced by source so
-- provider-quota alerts (future) can plug in without colliding, e.g.
-- "local:requests:75", "nvidia:tokens:90". UNIQUE constraint enables upsert
-- on dismissal.
CREATE TABLE IF NOT EXISTS usage_alert_dismissals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_key    text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_alert_dismissals_user
  ON usage_alert_dismissals (user_id);

ALTER TABLE usage_alert_dismissals ENABLE ROW LEVEL SECURITY;
