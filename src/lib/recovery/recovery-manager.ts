import {
  type RecoveryConfig,
  type RecoveryRequest,
  type RecoveryResult,
  type InterruptionReason,
  type RecoveryStrategy,
  DEFAULT_RECOVERY_CONFIG,
  RecoveryState,
  classifyInterruption,
} from './types'
import { RequestStateMachine, type StateMachineSnapshot } from './state-machine'
import { getEnabledStrategies } from './strategies'
import { mergeRecoveryContent, hasDuplicateContent } from './stream-merger'

// ───────────────────────────────────────────────────────────────────
// RecoveryManager — the orchestrator.
//
// Usage:
//   const manager = new RecoveryManager()
//   manager.startRequest()
//
//   // ... stream begins ...
//   manager.markStreaming()
//
//   // If the stream fails:
//   if (error) {
//     const result = await manager.attemptRecovery({
//       model, messages, partialContent, system, tools, error
//     }, async (msgs, sys) => {
//       // call your model client here, return text
//     })
//   }
//
// Architecture: strategies are tried in priority order. Each gets
// up to maxRetries attempts. The manager tracks the state machine
// and prevents infinite retries.
// ───────────────────────────────────────────────────────────────────

export class RecoveryManager {
  private stateMachine: RequestStateMachine
  private config: RecoveryConfig
  private partialContent = ''
  private recoveryHistory: RecoveryResult[] = []
  private attemptedStrategies: Set<string> = new Set()

  constructor(config: Partial<RecoveryConfig> = {}) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config }
    this.stateMachine = new RequestStateMachine(this.config)
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Mark the request as started. */
  startRequest(): void {
    this.stateMachine.transition(RecoveryState.Preparing)
  }

  /** Mark the request as actively streaming. */
  markStreaming(): void {
    this.stateMachine.transition(RecoveryState.Streaming)
    this.partialContent = ''
  }

  /** Record partial content from the stream (called periodically during streaming). */
  recordPartial(content: string): void {
    this.partialContent = content
  }

  /** Mark the request as successfully completed. */
  markCompleted(): void {
    this.stateMachine.transition(RecoveryState.Completed)
  }

  /** Mark the request as failed (recovery was unsuccessful). */
  markFailed(): void {
    this.stateMachine.transition(RecoveryState.Failed)
  }

  /**
   * Attempt recovery after an interruption.
   *
   * @param request - The recovery request with context from the interrupted stream.
   * @param generator - A function that calls the AI model and returns text.
   *   Signature: (messages: unknown[], system: string) => Promise<string>
   * @returns The recovery result.
   */
  async attemptRecovery(
    request: Omit<RecoveryRequest, 'reason'>,
    generator: (messages: unknown[], system: string) => Promise<string>,
  ): Promise<RecoveryResult> {
    // Classify the interruption
    const reason = classifyInterruption(request.error)
    const fullRequest: RecoveryRequest = { ...request, reason }

    // Transition to interrupted
    try {
      this.stateMachine.transition(RecoveryState.Interrupted)
    } catch {
      // Already in interrupted state or recovery not possible
      return {
        success: false,
        content: '',
        strategy: 'none',
        explanation: 'Recovery already attempted or not available.',
      }
    }

    // Check if recovery is enabled
    if (!this.config.enabled) {
      this.markFailed()
      return {
        success: false,
        content: '',
        strategy: 'none',
        explanation: 'Recovery is disabled.',
      }
    }

    // Get available strategies
    const strategies = getEnabledStrategies()

    // Try each strategy in priority order
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      if (!this.stateMachine.canRecover()) {
        break
      }

      this.stateMachine.transition(RecoveryState.Recovering)

      // Pick the next strategy
      const strategy = this.pickNextStrategy(strategies)
      if (!strategy) {
        this.markFailed()
        return {
          success: false,
          content: '',
          strategy: 'none',
          explanation: 'No recovery strategies available.',
        }
      }

      this.attemptedStrategies.add(strategy.id)

      try {
        // Attempt the strategy
        const recoveryText = await strategy.attempt(fullRequest, generator)

        if (!recoveryText || recoveryText.trim().length === 0) {
          // Empty response — try next
          continue
        }

        // Check for duplicate content
        if (
          request.partialContent &&
          hasDuplicateContent(request.partialContent, recoveryText)
        ) {
          // The model repeated itself — try with a stronger continuation prompt
          continue
        }

        // Merge with partial content
        const merged = mergeRecoveryContent(request.partialContent, recoveryText)

        // Transition to recovered
        this.stateMachine.transition(RecoveryState.Recovered)

        const result: RecoveryResult = {
          success: true,
          content: merged,
          strategy: strategy.id,
          explanation: `Recovered using "${strategy.label}" after ${attempt + 1} attempt(s). Reason: ${reason}.`,
        }

        this.recoveryHistory.push(result)
        return result
      } catch (strategyError) {
        // This strategy failed — log and try next
        console.warn(
          `[recovery] Strategy "${strategy.id}" failed (attempt ${attempt + 1}):`,
          String(strategyError),
        )
      }

      // Wait before retrying (if not the last attempt)
      if (attempt < this.config.maxRetries - 1) {
        await delay(this.config.retryDelayMs)
      }
    }

    // All strategies exhausted
    this.markFailed()
    return {
      success: false,
      content: request.partialContent,
      strategy: 'none',
      explanation: 'All recovery strategies exhausted.',
    }
  }

  // ── Diagnostics ─────────────────────────────────────────────────

  /** Get the current state machine snapshot for diagnostics. */
  getSnapshot(): StateMachineSnapshot {
    return this.stateMachine.snapshot
  }

  /** Get the recovery history. */
  getRecoveryHistory(): RecoveryResult[] {
    return [...this.recoveryHistory]
  }

  /** Reset for a new request. */
  reset(): void {
    this.stateMachine.reset()
    this.partialContent = ''
    this.recoveryHistory = []
    this.attemptedStrategies.clear()
  }

  // ── Internal ────────────────────────────────────────────────────

  private pickNextStrategy(strategies: RecoveryStrategy[]): RecoveryStrategy | null {
    // First, try any strategy we haven't attempted yet
    const untried = strategies.filter((s) => !this.attemptedStrategies.has(s.id))
    if (untried.length > 0) return untried[0]

    // If all have been tried, cycle back through them
    // (each strategy might work on a retry if the issue was transient)
    const retryIndex = this.recoveryHistory.length % strategies.length
    return strategies[retryIndex] ?? null
  }
}

/** Utility: delay for a given number of milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
