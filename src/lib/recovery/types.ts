// ───────────────────────────────────────────────────────────────────
// Recovery System — shared types
//
// Architecture note: the recovery system is designed so new strategies
// plug in without modifying existing code. Implement RecoveryStrategy
// and register it with the strategy registry.
// ───────────────────────────────────────────────────────────────────

/** The 8 states every AI request moves through. */
export enum RecoveryState {
  Queued = 'queued',
  Preparing = 'preparing',
  Streaming = 'streaming',
  Interrupted = 'interrupted',
  Recovering = 'recovering',
  Recovered = 'recovered',
  Completed = 'completed',
  Failed = 'failed',
}

/** Valid state transitions — Queued → Preparing → Streaming → (Completed | Interrupted). */
export const VALID_TRANSITIONS: Record<RecoveryState, RecoveryState[]> = {
  [RecoveryState.Queued]: [RecoveryState.Preparing],
  [RecoveryState.Preparing]: [RecoveryState.Streaming, RecoveryState.Failed],
  [RecoveryState.Streaming]: [RecoveryState.Completed, RecoveryState.Interrupted, RecoveryState.Failed],
  [RecoveryState.Interrupted]: [RecoveryState.Recovering, RecoveryState.Failed],
  [RecoveryState.Recovering]: [RecoveryState.Recovering, RecoveryState.Recovered, RecoveryState.Failed],
  [RecoveryState.Recovered]: [RecoveryState.Completed, RecoveryState.Failed],
  [RecoveryState.Completed]: [],
  [RecoveryState.Failed]: [],
}

/** User-facing labels for each state. */
export const STATE_LABELS: Record<RecoveryState, string> = {
  [RecoveryState.Queued]: '',
  [RecoveryState.Preparing]: '',
  [RecoveryState.Streaming]: '',
  [RecoveryState.Interrupted]: 'Connection interrupted. Attempting recovery…',
  [RecoveryState.Recovering]: 'Recovering…',
  [RecoveryState.Recovered]: 'Recovered',
  [RecoveryState.Completed]: '',
  [RecoveryState.Failed]: 'Recovery unsuccessful.',
}

/** User-facing labels for retrying. Used in the recovery banner. */
export const RECOVERY_BANNER_LABELS: Partial<Record<RecoveryState, string>> = {
  [RecoveryState.Recovering]: 'Recovering…',
  [RecoveryState.Recovered]: 'Recovered',
  [RecoveryState.Failed]: 'Retrying…',
}

// ── Recovery Request ──────────────────────────────────────────────

export interface RecoveryRequest {
  /** The original model used. */
  model: string
  /** The full message array at time of interruption. */
  messages: unknown[]
  /** The last partial text content received. */
  partialContent: string
  /** The system prompt used. */
  system: string
  /** Any tool definitions used. */
  tools?: Record<string, unknown>
  /** The error that caused the interruption. */
  error: unknown
  /** The interruption reason (for diagnostics). */
  reason: InterruptionReason
}

export type InterruptionReason =
  | 'stream_closed'
  | 'provider_timeout'
  | 'network_error'
  | 'empty_stream'
  | 'partial_completion'
  | 'tool_call_no_resume'
  | 'unknown'

// ── Recovery Result ───────────────────────────────────────────────

export interface RecoveryResult {
  /** Whether recovery produced any output. */
  success: boolean
  /** The recovered text content. */
  content: string
  /** Which strategy was used. */
  strategy: string
  /** Natural-language explanation of what happened (for diagnostics). */
  explanation: string
}

// ── Recovery Strategy Interface ───────────────────────────────────

/**
 * A recovery strategy — the pluggable interface every strategy implements.
 * Future strategies (RetryDifferentProvider, FallbackChain, ResumeFromLastToken)
 * all implement this same interface and register in the strategy registry.
 */
export interface RecoveryStrategy {
  /** Unique identifier. */
  id: string
  /** Human-readable label for diagnostics. */
  label: string
  /** Priority — lower = tried first. */
  priority: number
  /** Whether this strategy is enabled. */
  enabled: boolean

  /**
   * Attempt recovery for the given request.
   * Returns the generated content text, or throws on failure.
   *
   * The `generator` parameter is a function that calls the AI model
   * with the given messages and system prompt, returning the text.
   * This is injected so strategies don't need to know about the
   * specific model client — they just call this callback.
   */
  attempt: (
    request: RecoveryRequest,
    generator: (messages: unknown[], system: string) => Promise<string>,
  ) => Promise<string>

  /**
   * Build a continuation prompt for this strategy.
   * Returns the message to append to the conversation.
   */
  buildContinuation: (request: RecoveryRequest) => string
}

// ── Recovery Config ───────────────────────────────────────────────

export interface RecoveryConfig {
  /** Maximum number of recovery attempts (default: 2). */
  maxRetries: number
  /** Delay between interruption detection and first recovery attempt (ms). */
  recoveryDelayMs: number
  /** Delay between successive recovery attempts (ms). */
  retryDelayMs: number
  /** Whether recovery should be attempted at all. */
  enabled: boolean
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRetries: 2,
  recoveryDelayMs: 800,
  retryDelayMs: 1500,
  enabled: true,
}

/** Classify the interruption from an error. */
export function classifyInterruption(error: unknown): InterruptionReason {
  const msg = String(
    (error instanceof Error ? error.message : '') || String(error).slice(0, 200),
  ).toLowerCase()

  if (msg.includes('timeout') || msg.includes('timed out')) return 'provider_timeout'
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('abort')) return 'network_error'
  if (msg.includes('empty') || msg.includes('no content')) return 'empty_stream'
  if (msg.includes('closed') || msg.includes('connection') || msg.includes('eof')) return 'stream_closed'
  if (msg.includes('tool') && (msg.includes('resume') || msg.includes('never'))) return 'tool_call_no_resume'
  if (msg.includes('partial') || msg.includes('incomplete')) return 'partial_completion'
  return 'unknown'
}

/** Check if the stream completed normally (not interrupted). */
export function isStreamComplete(
  content: string,
  finishReason?: string,
): boolean {
  if (finishReason === 'stop' || finishReason === 'tool_calls') return true
  if (finishReason === 'length') return false // truncated by max_tokens
  // If we have substantial content, it might be complete even without finishReason
  return content.length > 0 && finishReason === undefined
}
