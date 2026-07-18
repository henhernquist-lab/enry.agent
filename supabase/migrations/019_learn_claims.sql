-- Enry Learn — base schema. Learn's atomic unit is a CLAIM (one belief, with
-- provenance and a decay state), not a card or a deck. claim_events is the
-- append-only log every probe/answer/rating writes to — feature agents built
-- on top of this (Ambient Mode, Confidence Calibration, Explain-Back grading,
-- etc.) derive their behavior by reading it and adding new event_type values,
-- not by altering this schema. See LEARN.md for the full contract.

-- ── claims ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  content            text NOT NULL,             -- the claim itself: one atomic belief in prose, not a paragraph
  topic              text NOT NULL DEFAULT '',   -- free-text grouping label, e.g. "React hooks", "French Revolution"

  source_type        text NOT NULL DEFAULT 'manual'
                       CHECK (source_type IN ('chat', 'commit', 'import', 'manual', 'derived')),
  source_ref         text,                       -- pointer to origin: chat message id, commit sha, doc id.
                                                   -- No FK — origin tables vary by source_type, this is informational.

  embedding          vector(1024),               -- same pipeline as memories/contradictions: nv-embedqa-e5-v5
                                                   -- (src/lib/embeddings.ts), 'passage' mode when writing this row

  confidence_stated  real,                       -- 0.0-1.0, what the user SAID their confidence was at capture/last answer
  confidence_actual  real,                       -- 0.0-1.0, what claim_events performance actually implies — computed
                                                   -- by a feature, not user-entered. Null until something computes it.
                                                   -- (Confidence Calibration scoring logic itself is out of base scope.)

  strength           real NOT NULL DEFAULT 1.0,  -- 0.0-1.0 current retention estimate — output of computeStrength(),
                                                   -- never written by hand. Starts at 1.0 (freshly learned).
  half_life          real NOT NULL DEFAULT 24,   -- PER-CLAIM decay rate in hours (hours until strength halves absent
                                                   -- a probe) — not a global interval. computeStrength() reads this
                                                   -- column per-row, so different claims can decay at different rates.

  last_probed_at     timestamptz,
  next_probe_at      timestamptz,                -- when this claim is next due; null = not yet scheduled

  status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'shaky', 'retired', 'untrusted')),

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()  -- maintained by application code on every write,
                                                           -- same convention as resources/contradictions/regret_entries
                                                           -- elsewhere in this repo — no DB trigger.
);

CREATE INDEX IF NOT EXISTS idx_claims_user_id ON claims (user_id);
CREATE INDEX IF NOT EXISTS idx_claims_user_status ON claims (user_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_user_topic ON claims (user_id, topic);
-- The "what's due right now" query probe() runs — mirrors regret_entries'
-- resurface_at partial index elsewhere in this repo.
CREATE INDEX IF NOT EXISTS idx_claims_due
  ON claims (user_id, next_probe_at)
  WHERE status = 'active';

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
-- Service role (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS by default — every
-- write in this app goes through it server-side, same as every other table
-- here. No policy needed for that path; RLS is enabled as defense in depth.

-- ── claim_events ──────────────────────────────────────────────────────────
-- Append-only. Nothing in this app UPDATEs or DELETEs a row here except the
-- cascade from a deleted claim. This is the MAIN EXTENSION POINT for
-- everything built on top of Learn's base:
CREATE TABLE IF NOT EXISTS claim_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,

  -- Deliberately free text, NOT a CHECK-constrained enum — a new feature
  -- registers a new event_type by just writing one, no migration required.
  -- The base verbs (learn, probe) only ever write 'probe_asked' and
  -- 'answer_recorded'. See LEARN.md for the full registry of event_types
  -- as features add them, and the payload shape each one uses.
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_events_claim_id ON claim_events (claim_id, created_at);
CREATE INDEX IF NOT EXISTS idx_claim_events_type ON claim_events (event_type, created_at);

ALTER TABLE claim_events ENABLE ROW LEVEL SECURITY;
