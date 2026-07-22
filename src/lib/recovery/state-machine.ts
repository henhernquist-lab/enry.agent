import { RecoveryState, VALID_TRANSITIONS, type RecoveryConfig, DEFAULT_RECOVERY_CONFIG } from './types'

// ───────────────────────────────────────────────────────────────────
// RequestStateMachine — tracks every request through its lifecycle.
//
// States: Queued → Preparing → Streaming → (Completed | Interrupted)
// Interrupted → Recovering → (Recovered → Completed) | Failed
//
// Usage:
//   const sm = new RequestStateMachine()
//   sm.transition(RecoveryState.Streaming)  // throws if invalid
//   if (sm.state === RecoveryState.Interrupted) { ... }
// ───────────────────────────────────────────────────────────────────

export interface StateMachineSnapshot {
  state: RecoveryState
  history: RecoveryState[]
  retryCount: number
  maxRetries: number
  canRecover: boolean
  isTerminal: boolean
}

export class RequestStateMachine {
  private _state: RecoveryState
  private _history: RecoveryState[] = []
  private _retryCount = 0
  private _maxRetries: number
  private _interruptedAt: number | null = null

  constructor(config: Partial<RecoveryConfig> = {}) {
    this._state = RecoveryState.Queued
    this._maxRetries = config.maxRetries ?? DEFAULT_RECOVERY_CONFIG.maxRetries
    this._history.push(this._state)
  }

  /** Current state. */
  get state(): RecoveryState {
    return this._state
  }

  /** Get a readonly snapshot for diagnostics. */
  get snapshot(): StateMachineSnapshot {
    return {
      state: this._state,
      history: [...this._history],
      retryCount: this._retryCount,
      maxRetries: this._maxRetries,
      canRecover: this.canRecover(),
      isTerminal: this.isTerminal(),
    }
  }

  /** Transition to a new state. Throws if the transition is invalid. */
  transition(to: RecoveryState): void {
    const validTargets = VALID_TRANSITIONS[this._state]
    if (!validTargets.includes(to)) {
      // Allow self-transition for Recovering (retries)
      if (to === RecoveryState.Recovering && this._state === RecoveryState.Recovering) {
        this._retryCount++
        this._history.push(to)
        return
      }
      throw new Error(
        `Invalid state transition: ${this._state} → ${to}. ` +
        `Valid transitions: [${validTargets.join(', ')}]`,
      )
    }

    this._state = to
    this._history.push(to)

    if (to === RecoveryState.Interrupted) {
      this._interruptedAt = Date.now()
    }
    if (to === RecoveryState.Recovering) {
      this._retryCount++
    }
    if (to === RecoveryState.Recovered) {
      this._retryCount = 0
    }
  }

  /** Check if recovery can still be attempted. */
  canRecover(): boolean {
    return (
      this._retryCount < this._maxRetries &&
      (this._state === RecoveryState.Interrupted ||
        this._state === RecoveryState.Recovering)
    )
  }

  /** Check if the request is in a terminal state. */
  isTerminal(): boolean {
    return (
      this._state === RecoveryState.Completed ||
      this._state === RecoveryState.Failed ||
      (this._state === RecoveryState.Interrupted &&
        this._retryCount >= this._maxRetries)
    )
  }

  /** Time in ms since interruption (or 0 if never interrupted). */
  timeSinceInterruption(): number {
    if (!this._interruptedAt) return 0
    return Date.now() - this._interruptedAt
  }

  /** Reset the machine for a fresh request. */
  reset(): void {
    this._state = RecoveryState.Queued
    this._history = [this._state]
    this._retryCount = 0
    this._interruptedAt = null
  }
}
