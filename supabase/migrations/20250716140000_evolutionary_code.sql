-- Migration: Evolutionary Code Generation (Feature 2 — Enry Lab).
-- Stores 3-model fan-out runs, judge synthesis results, and similarity checks.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS evolution_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prompt            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'degenerate', 'all_failed', 'error')),
  candidates        JSONB NOT NULL DEFAULT '[]'::jsonb,
  hybrid_output     TEXT,
  trait_breakdown   JSONB,
  similarity_scores JSONB,
  hybrid_genuine    BOOLEAN,
  error             TEXT,
  run_time_ms       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evolution_runs_user_id
  ON evolution_runs (user_id);

CREATE INDEX IF NOT EXISTS idx_evolution_runs_status
  ON evolution_runs (user_id, status);

ALTER TABLE evolution_runs ENABLE ROW LEVEL SECURITY;
