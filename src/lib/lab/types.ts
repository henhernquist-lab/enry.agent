export type SkillFeedback = 'helpful' | 'missed' | 'corrected'

export type RevisionStatus = 'proposed' | 'approved' | 'rejected'

export interface SkillInvocationRow {
  id: string
  user_id: string
  skill_slug: string
  prompt_version: string
  input_topic: string
  output_text: string
  model_used: string | null
  effort_used: string | null
  mode: string | null
  source: string
  explicit_feedback: SkillFeedback | null
  implicit_score: number | null
  conversation_id: string | null
  follow_up_message_id?: string | null
  created_at: string
  updated_at: string
}

export interface PromptRevisionRow {
  id: string
  user_id: string
  skill_slug: string
  old_prompt: string
  proposed_prompt: string
  reasoning: string
  status: RevisionStatus
  override_active: boolean
  sample_invocation_ids: string[]
  win_rate_before: number | null
  estimated_win_rate_after: number | null
  proposed_at: string
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface LabStats {
  totalInvocations: number
  feedbackRate: number
  helpfulRate: number
  proposedRevisions: number
  approvedRevisions: number
}

// ── Feature 2: Evolutionary Code Generation ──────────────────

export type EvolutionRunStatus = 'running' | 'completed' | 'degenerate' | 'all_failed' | 'error'

export interface EvolutionCandidate {
  model: string
  model_label: string
  output: string
  status: 'ok' | 'timeout' | 'refused' | 'invalid_format' | 'empty' | 'error'
  error?: string
}

export interface EvolutionRunRow {
  id: string
  user_id: string
  prompt: string
  status: EvolutionRunStatus
  candidates: EvolutionCandidate[]
  hybrid_output: string | null
  trait_breakdown: Record<string, string> | null
  similarity_scores: Record<string, number> | null
  hybrid_genuine: boolean | null
  error: string | null
  run_time_ms: number | null
  created_at: string
  updated_at: string
}

// ── Feature 3: Overnight Autonomous R&D ──────────────────

export type OvernightIdeaStatus = 'queued' | 'running' | 'completed' | 'dead_end' | 'error'
export type OvernightRunStatus = 'dispatched' | 'running' | 'completed' | 'dead_end' | 'failed' | 'stale'

export interface OvernightIdeaRow {
  id: string
  user_id: string
  title: string
  description: string
  status: OvernightIdeaStatus
  scratch_repo_owner: string
  scratch_repo_name: string
  latest_run_id: string | null
  verdict: string | null
  verdict_reasoning: string | null
  morning_note: string | null
  created_at: string
  updated_at: string
}

export interface OvernightRunRow {
  id: string
  idea_id: string
  user_id: string
  status: OvernightRunStatus
  scratch_repo_full: string
  gh_run_id: number | null
  dispatch_token_hash: string
  heartbeat_at: string | null
  result_summary: string | null
  result_detail: string | null
  error: string | null
  run_time_ms: number | null
  dispatched_at: string
  finished_at: string | null
  created_at: string
  updated_at: string
}
