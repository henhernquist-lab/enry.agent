-- Let the Gemini builder run unattended.
--
-- `gemini -p "..."` refuses to run in an untrusted directory and exits 55 with
-- "Gemini CLI is not running in a trusted directory". Trust can only be granted
-- interactively, which a dispatched builder can never do, so every Gemini task
-- failed the same way. Confirmed against the real adapter path — see Batch 2's
-- scripts/verify-adapter.mjs.
--
-- SECURITY NOTE: this bypasses the workspace-trust prompt, so a dispatched
-- Gemini run can use tools in whatever directory it lands in without a human
-- confirming that directory first. Deliberate and approved: builders are
-- dispatched onto the owner's own Sprite against the owner's own repos. Revert
-- by setting cli_command back to 'gemini', which re-arms the prompt and
-- re-breaks unattended runs.
--
-- The seed insert in 20260806030000_mission_spine.sql carries the same value
-- for fresh databases, but it is `on conflict (name) do nothing`, so an already
-- applied database keeps the old value until this runs. Targeted update rather
-- than a re-seed: a re-seed would either no-op for the same reason or clobber
-- ratings that later batches are meant to overwrite from measured results.
update public.agents
   set cli_command = 'gemini --skip-trust'
 where name = 'Gemini CLI'
   and cli_command = 'gemini';
