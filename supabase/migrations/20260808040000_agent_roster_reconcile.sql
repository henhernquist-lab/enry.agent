-- Reconcile the layer-2 roster with the CLIs that actually exist.
--
-- Batch 1 seeded the roster from a blueprint, not from a machine. Detection
-- (Batch 3.5) then confirmed what is really installed, and the two disagree:
-- Codex has never been present anywhere it was checked, while three CLIs in
-- daily use were not registered at all. A scheduler picking an agent whose
-- binary does not exist fails as a shell "command not found" buried inside a
-- task_results blob — far from the cause.

-- ── Codex: registered, never found ────────────────────────────────────
-- Disabled rather than deleted: the row carries its ratings and any history,
-- and listAgents(2, true) already filters on enabled, so nothing can dispatch
-- to it. Re-enable once `codex` is actually on PATH.
update public.agents
   set enabled = false
 where name = 'Codex CLI';

-- ── Newly registered builders ─────────────────────────────────────────
-- Ratings are starting estimates, deliberately conservative for the two that
-- have no track record here. reliability_pct is meant to be overwritten from
-- measured task_results once there are any — do not treat these as measured.
--
-- Idempotent on name, so re-running cannot duplicate or clobber later edits.
insert into public.agents
  (name, layer, cli_command, strengths, speed_rating, cost_rating, reliability_pct, context_window, enabled) values
  ('Crush CLI', 2, 'crush',
   '["fast-edits","boilerplate","scaffolding"]'::jsonb, 5, 1, 75, 64000, true),
  ('Hermes', 2, 'hermes',
   '["agentic-loops","tool-use","automation"]'::jsonb, 3, 2, 70, 128000, true),
  ('OpenCode', 2, 'opencode',
   '["multi-file-refactor","terminal-native","code-navigation"]'::jsonb, 4, 2, 75, 200000, true)
on conflict (name) do nothing;

-- Crush CLI was already seeded in Batch 1 with the same cli_command, so the
-- insert above no-ops for it; make sure it is enabled either way.
update public.agents
   set enabled = true
 where name in ('Crush CLI', 'Hermes', 'OpenCode');

-- ── Deliberately NOT registered ───────────────────────────────────────
-- coderabbit and kilo are installed on at least one machine but have never
-- been run, so there is no basis for a rating and no confirmation that their
-- headless flag is `-p`. Detection will still report them under "discovered,
-- not registered" until someone tries them and adds a row.
