import { supabase } from '@/lib/supabase'
import type { SkillFeedback, SkillInvocationRow, PromptRevisionRow, LabStats } from './types'

export async function insertSkillInvocation(
  userId: string,
  data: Omit<SkillInvocationRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('skill_invocations')
    .insert({ ...data, user_id: userId })
    .select('id')
    .single()

  if (error) {
    console.error('[lab/db] insertSkillInvocation failed:', error)
    return null
  }
  return row.id
}

export async function updateSkillInvocationOutput(
  invocationId: string,
  outputText: string
): Promise<void> {
  const { error } = await supabase
    .from('skill_invocations')
    .update({ output_text: outputText })
    .eq('id', invocationId)

  if (error) {
    console.error('[lab/db] updateSkillInvocationOutput failed:', error)
  }
}

export async function setExplicitFeedback(
  invocationId: string,
  feedback: SkillFeedback
): Promise<void> {
  const { error } = await supabase
    .from('skill_invocations')
    .update({ explicit_feedback: feedback })
    .eq('id', invocationId)

  if (error) {
    console.error('[lab/db] setExplicitFeedback failed:', error)
  }
}

export async function getSkillInvocations(
  userId: string,
  options?: { skillSlug?: string; limit?: number; offset?: number }
): Promise<SkillInvocationRow[]> {
  let query = supabase
    .from('skill_invocations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (options?.skillSlug) {
    query = query.eq('skill_slug', options.skillSlug)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1)
  }

  const { data, error } = await query
  if (error) {
    console.error('[lab/db] getSkillInvocations failed:', error)
    return []
  }
  return data ?? []
}

export async function getActivePromptOverride(
  userId: string,
  skillSlug: string
): Promise<PromptRevisionRow | null> {
  const { data, error } = await supabase
    .from('skill_prompt_revisions')
    .select('*')
    .eq('user_id', userId)
    .eq('skill_slug', skillSlug)
    .eq('override_active', true)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[lab/db] getActivePromptOverride failed:', error)
    return null
  }
  return data
}

export async function getPromptRevisions(
  userId: string,
  options?: { status?: 'proposed' | 'approved' | 'rejected'; skillSlug?: string }
): Promise<PromptRevisionRow[]> {
  let query = supabase
    .from('skill_prompt_revisions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (options?.status) {
    query = query.eq('status', options.status)
  }
  if (options?.skillSlug) {
    query = query.eq('skill_slug', options.skillSlug)
  }

  const { data, error } = await query
  if (error) {
    console.error('[lab/db] getPromptRevisions failed:', error)
    return []
  }
  return data ?? []
}

export async function insertPromptRevision(
  userId: string,
  data: Omit<PromptRevisionRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<PromptRevisionRow | null> {
  const { data: row, error } = await supabase
    .from('skill_prompt_revisions')
    .insert({ ...data, user_id: userId })
    .select('*')
    .single()

  if (error) {
    console.error('[lab/db] insertPromptRevision failed:', error)
    return null
  }
  return row
}

export async function approvePromptRevision(
  userId: string,
  revisionId: string
): Promise<void> {
  // Deactivate any existing active revision for this skill first.
  const { data: revision } = await supabase
    .from('skill_prompt_revisions')
    .select('skill_slug')
    .eq('id', revisionId)
    .eq('user_id', userId)
    .single()

  if (revision?.skill_slug) {
    await supabase
      .from('skill_prompt_revisions')
      .update({ override_active: false })
      .eq('user_id', userId)
      .eq('skill_slug', revision.skill_slug)
      .eq('override_active', true)
  }

  const { error } = await supabase
    .from('skill_prompt_revisions')
    .update({ status: 'approved', override_active: true, reviewed_at: new Date().toISOString() })
    .eq('id', revisionId)
    .eq('user_id', userId)

  if (error) {
    console.error('[lab/db] approvePromptRevision failed:', error)
  }
}

export async function rejectPromptRevision(
  userId: string,
  revisionId: string
): Promise<void> {
  const { error } = await supabase
    .from('skill_prompt_revisions')
    .update({ status: 'rejected', override_active: false, reviewed_at: new Date().toISOString() })
    .eq('id', revisionId)
    .eq('user_id', userId)

  if (error) {
    console.error('[lab/db] rejectPromptRevision failed:', error)
  }
}

export async function getLabStats(userId: string): Promise<LabStats> {
  const { count: totalInvocations, error: totalError } = await supabase
    .from('skill_invocations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const { count: feedbackCount, error: feedbackError } = await supabase
    .from('skill_invocations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('explicit_feedback', 'is', null)

  const { count: helpfulCount, error: helpfulError } = await supabase
    .from('skill_invocations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('explicit_feedback', 'helpful')

  const { count: proposedCount, error: proposedError } = await supabase
    .from('skill_prompt_revisions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'proposed')

  const { count: approvedCount, error: approvedError } = await supabase
    .from('skill_prompt_revisions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'approved')

  if (totalError || feedbackError || helpfulError || proposedError || approvedError) {
    console.error('[lab/db] getLabStats errors:', { totalError, feedbackError, helpfulError, proposedError, approvedError })
  }

  const total = totalInvocations ?? 0
  const feedback = feedbackCount ?? 0
  const helpful = helpfulCount ?? 0

  return {
    totalInvocations: total,
    feedbackRate: total > 0 ? Math.round((feedback / total) * 100) : 0,
    helpfulRate: feedback > 0 ? Math.round((helpful / feedback) * 100) : 0,
    proposedRevisions: proposedCount ?? 0,
    approvedRevisions: approvedCount ?? 0,
  }
}
