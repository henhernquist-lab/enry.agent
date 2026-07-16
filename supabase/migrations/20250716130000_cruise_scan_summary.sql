-- Migration: Add summary_text column to cruise_scans for human-readable scan summaries.
ALTER TABLE cruise_scans ADD COLUMN IF NOT EXISTS summary_text TEXT;
