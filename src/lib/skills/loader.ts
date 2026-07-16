import { getSkill as getBaseSkill, SKILLS } from './registry'
import type { SkillDefinition } from './types'
import { getActivePromptOverride } from '@/lib/lab/db'

// Loads a skill, applying any active DB prompt override from Enry Lab.
// This is async because it may query Supabase for an approved revision.
// Use this in server-side API routes; keep using the sync getSkill in UI.
export async function getSkillWithOverride(
  userId: string | null,
  slug: string,
): Promise<SkillDefinition | undefined> {
  const base = getBaseSkill(slug)
  if (!base) return undefined

  if (!userId) return base

  const override = await getActivePromptOverride(userId, slug)
  if (override) {
    return {
      ...base,
      systemPrompt: override.proposed_prompt,
    }
  }

  return base
}

// Re-export the sync registry for UI and non-overridden lookups.
export { getBaseSkill, SKILLS }
