-- Give the builders write access, and make cli_command carry the whole
-- invocation up to the prompt.
--
-- ─── Why the shape of cli_command changes ─────────────────────────────
-- The adapter used to append a hardcoded `-p <prompt>`. That flag is not
-- universal. Confirmed empirically against every installed CLI:
--
--   claude    -p            gemini  -p
--   hermes    -z            opencode  run <message>   (its own -p is --password!)
--
-- So `opencode -p "<prompt>"` was passing the entire task description as a
-- basic-auth password. cli_command now ends immediately before the prompt and
-- the adapter appends only the quoted prompt.
--
-- ─── Why write flags at all ───────────────────────────────────────────
-- Every one of these CLIs is READ-ONLY by default in headless mode, and every
-- one exits 0 while refusing to write. Two batches of "successful" task_results
-- proved only that a process started. Each flag below was verified by asking
-- the CLI to create a PROOF.txt and checking the file appeared on disk.
--
-- SECURITY NOTE: this grants an unattended agent write access to whatever
-- directory it is pointed at. Deliberate and approved — builders run on the
-- owner's own machine against the owner's own checkouts. The adapter's new
-- worktree comparison is the counterweight: a run that changes nothing is now
-- recorded as a failure rather than a success. Revert by removing the flags,
-- which restores read-only and re-breaks unattended building.

update public.agents set cli_command = 'claude --permission-mode acceptEdits -p'
 where name = 'Claude Code' and cli_command in ('claude', 'claude -p');

update public.agents set cli_command = 'gemini --skip-trust --approval-mode auto_edit -p'
 where name = 'Gemini CLI' and cli_command in ('gemini', 'gemini --skip-trust');

update public.agents set cli_command = 'hermes --yolo --no-restore-cwd -z'
 where name = 'Hermes' and cli_command = 'hermes';

update public.agents set cli_command = 'opencode run --auto'
 where name = 'OpenCode' and cli_command = 'opencode';

-- Not installed here, so untested. From the Crush docs the headless form is
-- `crush run <prompt>` with -y to skip permission prompts. Recorded so the row
-- is right when the binary appears; detection still reports it ABSENT until then.
update public.agents set cli_command = 'crush run -y'
 where name = 'Crush CLI' and cli_command = 'crush';

-- ── OpenHands: disabled ───────────────────────────────────────────────
-- `openhands --headless --always-approve --exit-without-confirmation -t "..."`
-- exits 0 and writes nothing — same hollow success as the others, but no flag
-- combination tried made it produce edits. An enabled agent that provably
-- cannot do the work is exactly what the scheduler must not dispatch to.
-- Re-enable once a working headless invocation is confirmed.
update public.agents set enabled = false
 where name = 'OpenHands';
