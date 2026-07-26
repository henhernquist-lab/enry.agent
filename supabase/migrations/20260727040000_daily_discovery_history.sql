-- Track the daily discovery models selection so previously shown models don't immediately repeat.
-- One row per day; hf_ids stored as an Postgres array of Hugging Face repo ids.
CREATE TABLE IF NOT EXISTS daily_discovery_history (
  date DATE PRIMARY KEY,
  hf_ids TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index to quickly look up the most recent selections.
CREATE INDEX IF NOT EXISTS idx_daily_discovery_history_created_at
  ON daily_discovery_history (created_at DESC);
