-- Schema + integration surface for the Freebuff features (Enemy Claims,
-- Confidence Casino, Receipts) built on top of Enry Learn's base. None of
-- these features are IMPLEMENTED here — this migration only adds the
-- columns/table/view they need so each can be built later without a further
-- schema change. See LEARN.md for the contract each piece documents.
--
-- Also lands the one piece of durable state Fog of War (a Map rendering
-- mode) reads: claim_activity, a derived view of per-claim last-touched time.

-- ── Enemy Claims ────────────────────────────────────────────────────────
-- A claim deliberately planted wrong, mixed into normal probe rotation so
-- catching it (rather than reflexively agreeing) becomes the test.
-- surfaceNextDue() in learn-ops.ts already selects any status='active' claim
-- regardless of this flag, so an enemy claim already round-trips through
-- probe() with zero further logic — is_enemy is carried through the select/
-- response (see the learn-ops.ts change shipped alongside this) so the
-- eventual feature can render/score it differently once surfaced.
-- enemy_caught_at records when the user correctly flagged it as wrong; null
-- means uncaught (still lurking, or not yet an enemy).
ALTER TABLE claims ADD COLUMN IF NOT EXISTS is_enemy         boolean NOT NULL DEFAULT false;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS enemy_caught_at  timestamptz;

-- ── Confidence Casino: durable running balance ──────────────────────────
-- Stakes and payouts themselves are claim_events (payload jsonb carries
-- stake_amount / payout — see LEARN.md, no columns for those on purpose).
-- The running BALANCE, though, must survive across sessions and devices, so
-- it can't live in a per-session resources row. One lightweight per-user row
-- instead. Kept deliberately separate from claims/claim_events so a balance
-- read never scans the event log.
CREATE TABLE IF NOT EXISTS user_learn_state (
  user_id        uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  casino_balance numeric NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()  -- maintained by app code, same no-trigger convention as claims
);

ALTER TABLE user_learn_state ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS (every write here is server-side), same posture
-- as claims / claim_events in migration 019.

-- ── Fog of War: claim_activity (derived view, not a table) ──────────────
-- Fog of War needs "how recently was this region of embedding space
-- touched." But the Map's 2D layout is recomputed live from embeddings on
-- every load (force-directed from cosine similarity) — no stable region id
-- persists between requests to hang a last-touched column off. Per-claim
-- activity, by contrast, is already fully derivable from columns that exist:
-- claims.created_at / last_probed_at and the max claim_events timestamp.
-- A view that aggregates them keeps zero new state in sync; the Map blends
-- each node's own freshness across nearby screen space to paint fog, so
-- per-claim granularity is enough. The "N days = cold" threshold is applied
-- at query time by the Map endpoint, never baked in here.
CREATE OR REPLACE VIEW claim_activity AS
SELECT
  c.id      AS claim_id,
  c.user_id AS user_id,
  GREATEST(
    c.created_at,
    COALESCE(c.last_probed_at, c.created_at),
    COALESCE((SELECT MAX(ce.created_at) FROM claim_events ce WHERE ce.claim_id = c.id), c.created_at)
  ) AS last_touched_at
FROM claims c;
-- The correlated MAX(claim_events.created_at) is served by migration 019's
-- idx_claim_events_claim_id (claim_id, created_at) — no new index required.
