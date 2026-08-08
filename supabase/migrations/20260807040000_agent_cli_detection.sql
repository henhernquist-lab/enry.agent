-- Record whether an agent's CLI has actually been seen installed.
--
-- Every layer-2 row in `agents` is seed data: nothing had ever confirmed that
-- Codex, Crush, OpenHands or Freebuff exist on any machine. The dispatcher
-- would happily hand a task to an agent whose binary is not there, and the
-- failure would only surface as a shell "command not found" inside a
-- task_results blob.
--
-- detected_host is not decoration. Detection runs through the same backend
-- selection as the builder adapter, so a result describes ONE host — a CLI
-- present in the Codespace says nothing about the Fly Sprite. A row confirmed
-- on 'local' is still unconfirmed for 'sprite'.
--
-- Semantics:
--   detected_at null            -> never checked
--   detected_at set, path null  -> checked on that host, NOT installed
--   detected_at set, path set   -> confirmed installed there
alter table public.agents
  add column if not exists cli_path      text,
  add column if not exists cli_version   text,
  add column if not exists detected_at   timestamptz,
  add column if not exists detected_host text
    check (detected_host is null or detected_host in ('local', 'sprite'));

comment on column public.agents.cli_path is
  'Absolute path to the executable when last detected, null when checked and absent.';
comment on column public.agents.detected_host is
  'Which backend the detection ran against: local (Codespace node-pty) or sprite (Fly VM).';
