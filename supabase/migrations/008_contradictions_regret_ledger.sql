-- Migration 008: Contradiction Finder + Regret Ledger tables.
-- Run this in the Supabase SQL editor.

-- Contradiction Finder: stores pairs/clusters of entries where the user has
-- made claims that meaningfully contradict each other over time.
CREATE TABLE IF NOT EXISTS contradictions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- JSON array of {source_id: uuid, type: text, title: text, snippet: text}
  entries_referenced JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary           TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'dismissed', 'reflected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contradictions_user_id
  ON contradictions (user_id);
CREATE INDEX IF NOT EXISTS idx_contradictions_status
  ON contradictions (user_id, status);

ALTER TABLE contradictions ENABLE ROW LEVEL SECURITY;

-- Regret Ledger: entries for decisions the user is uncertain about, with
-- scheduled resurface dates for monthly reflection.
CREATE TABLE IF NOT EXISTS regret_entries (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  decision_text          TEXT NOT NULL,
  why_uncertain          TEXT NOT NULL,
  alternative_considered TEXT,
  worry                  TEXT,
  resurface_at           TIMESTAMPTZ NOT NULL,
  resurface_interval_days INTEGER NOT NULL DEFAULT 30,
  status                 TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'resolved')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regret_entries_user_id
  ON regret_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_regret_entries_resurface
  ON regret_entries (user_id, resurface_at)
  WHERE status = 'open';

ALTER TABLE regret_entries ENABLE ROW LEVEL SECURITY;

-- Regret reflections: one per resurface cycle per entry.
CREATE TABLE IF NOT EXISTS regret_reflections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id         UUID NOT NULL REFERENCES regret_entries(id) ON DELETE CASCADE,
  resurface_number INTEGER NOT NULL DEFAULT 1,
  outcome          TEXT NOT NULL
                     CHECK (outcome IN ('held_up', 'dissolved', 'morphed')),
  reflection_text  TEXT NOT NULL DEFAULT '',
  reflected_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regret_reflections_entry_id
  ON regret_reflections (entry_id);

ALTER TABLE regret_reflections ENABLE ROW LEVEL SECURITY;
