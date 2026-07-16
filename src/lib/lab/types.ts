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
