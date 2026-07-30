-- skill_auto_triggers: per-user per-skill opt-in for automatic invocation.
-- When a user opts a skill into auto-trigger, future matching requests invoke
-- it without asking. The user can review/revert these in settings.
CREATE TABLE IF NOT EXISTS skill_auto_triggers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_slug  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, skill_slug)
);

-- RLS: users can only see/modify their own auto-triggers.
ALTER TABLE skill_auto_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_auto_triggers"
  ON skill_auto_triggers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_auto_triggers"
  ON skill_auto_triggers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_auto_triggers"
  ON skill_auto_triggers FOR DELETE
  USING (auth.uid() = user_id);
