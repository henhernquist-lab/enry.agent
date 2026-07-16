import { supabase } from '@/lib/supabase'
import type { SkillFeedback, SkillInvocationRow, PromptRevisionRow, LabStats, EvolutionRunRow, OvernightIdeaRow, OvernightRunRow, OvernightIdeaStatus, OvernightRunStatus } from './types'

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

// ── Feature 2: Evolutionary Code Generation ──────────────────

export async function insertEvolutionRun(
  userId: string,
  prompt: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('evolution_runs')
    .insert({ user_id: userId, prompt, status: 'running' })
    .select('id')
    .single()

  if (error) {
    console.error('[lab/db] insertEvolutionRun failed:', error)
    return null
  }
  return data.id
}

export async function updateEvolutionRun(
  runId: string,
  data: Partial<Pick<EvolutionRunRow, 'status' | 'candidates' | 'hybrid_output' | 'trait_breakdown' | 'similarity_scores' | 'hybrid_genuine' | 'error' | 'run_time_ms'>>,
): Promise<void> {
  const { error } = await supabase
    .from('evolution_runs')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', runId)

  if (error) {
    console.error('[lab/db] updateEvolutionRun failed:', error)
  }
}

export async function getEvolutionRuns(
  userId: string,
  options?: { limit?: number },
): Promise<EvolutionRunRow[]> {
  let query = supabase
    .from('evolution_runs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query
  if (error) {
    console.error('[lab/db] getEvolutionRuns failed:', error)
    return []
  }
  return (data ?? []) as EvolutionRunRow[]
}

// ── Feature 3: Overnight Autonomous R&D ──────────────────

export async function insertOvernightIdea(
  userId: string,
  data: { title: string; description: string; scratch_repo_owner: string; scratch_repo_name: string },
): Promise<OvernightIdeaRow | null> {
  const { data: row, error } = await supabase
    .from('overnight_ideas')
    .insert({
      user_id: userId,
      title: data.title,
      description: data.description,
      scratch_repo_owner: data.scratch_repo_owner,
      scratch_repo_name: data.scratch_repo_name,
      status: 'queued',
    })
    .select('*')
    .single()

  if (error) {
    console.error('[lab/db] insertOvernightIdea failed:', error)
    return null
  }
  return row as OvernightIdeaRow
}

export async function getOvernightIdeas(
  userId: string,
  options?: { status?: OvernightIdeaStatus },
): Promise<OvernightIdeaRow[]> {
  let query = supabase
    .from('overnight_ideas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (options?.status) {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) {
    console.error('[lab/db] getOvernightIdeas failed:', error)
    return []
  }
  return (data ?? []) as OvernightIdeaRow[]
}

export async function updateOvernightIdea(
  ideaId: string,
  userId: string,
  data: Partial<Pick<OvernightIdeaRow, 'status' | 'latest_run_id' | 'verdict' | 'verdict_reasoning' | 'morning_note'>>,
): Promise<void> {
  const { error } = await supabase
    .from('overnight_ideas')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', ideaId)
    .eq('user_id', userId)

  if (error) {
    console.error('[lab/db] updateOvernightIdea failed:', error)
  }
}

export async function deleteOvernightIdea(ideaId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('overnight_ideas')
    .delete()
    .eq('id', ideaId)
    .eq('user_id', userId)

  if (error) {
    console.error('[lab/db] deleteOvernightIdea failed:', error)
  }
}

export async function insertOvernightRun(
  userId: string,
  data: { idea_id: string; scratch_repo_full: string; dispatch_token_hash: string },
): Promise<OvernightRunRow | null> {
  const { data: row, error } = await supabase
    .from('overnight_runs')
    .insert({
      user_id: userId,
      idea_id: data.idea_id,
      scratch_repo_full: data.scratch_repo_full,
      dispatch_token_hash: data.dispatch_token_hash,
      status: 'dispatched',
    })
    .select('*')
    .single()

  if (error) {
    console.error('[lab/db] insertOvernightRun failed:', error)
    return null
  }
  return row as OvernightRunRow
}

export async function getOvernightRuns(
  userId: string,
  options?: { ideaId?: string; status?: OvernightRunStatus; limit?: number },
): Promise<OvernightRunRow[]> {
  let query = supabase
    .from('overnight_runs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (options?.ideaId) query = query.eq('idea_id', options.ideaId)
  if (options?.status) query = query.eq('status', options.status)
  if (options?.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) {
    console.error('[lab/db] getOvernightRuns failed:', error)
    return []
  }
  return (data ?? []) as OvernightRunRow[]
}

export async function updateOvernightRun(
  runId: string,
  data: Partial<Pick<OvernightRunRow, 'status' | 'gh_run_id' | 'heartbeat_at' | 'result_summary' | 'result_detail' | 'error' | 'run_time_ms' | 'finished_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('overnight_runs')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', runId)

  if (error) {
    console.error('[lab/db] updateOvernightRun failed:', error)
  }
}

export async function getStaleOvernightRuns(): Promise<OvernightRunRow[]> {
  const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 min
  const { data, error } = await supabase
    .from('overnight_runs')
    .select('*')
    .eq('status', 'running')
    .lt('heartbeat_at', staleThreshold)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[lab/db] getStaleOvernightRuns failed:', error)
    return []
  }
  return (data ?? []) as OvernightRunRow[]
}
