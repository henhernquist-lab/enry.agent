-- Cross-tool synthesis layer: a single aggregation over the resources table.
-- Run this in the Supabase SQL editor.
--
-- synthesis_rollup returns one row per resource type for a user, with counts
-- bucketed into a recent window and the prior window of equal length (so the
-- synthesis layer can compute creation-rate deltas without a second query).

CREATE INDEX IF NOT EXISTS resources_user_type_created_idx
  ON resources (user_id, type, created_at DESC);

CREATE OR REPLACE FUNCTION synthesis_rollup(p_user_id uuid, p_days int DEFAULT 14)
RETURNS TABLE (
  type text,
  total_count bigint,
  recent_count bigint,
  first_created_at timestamptz,
  last_created_at timestamptz,
  recent_days_active bigint,
  prior_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.type,
    count(*),
    count(*) FILTER (WHERE r.created_at >= now() - make_interval(days => p_days)),
    min(r.created_at),
    max(r.created_at),
    count(DISTINCT date_trunc('day', r.created_at))
      FILTER (WHERE r.created_at >= now() - make_interval(days => p_days)),
    count(*) FILTER (
      WHERE r.created_at >= now() - make_interval(days => 2 * p_days)
        AND r.created_at <  now() - make_interval(days => p_days)
    )
  FROM resources r
  WHERE r.user_id = p_user_id
  GROUP BY r.type;
$$;
