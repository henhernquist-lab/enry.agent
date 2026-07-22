import type { RecoveryStrategy, RecoveryRequest } from './types'

// ───────────────────────────────────────────────────────────────────
// Recovery Strategies — pluggable implementations of RecoveryStrategy.
//
// Each strategy knows how to build a continuation prompt and how to
// attempt recovery via the injected generator callback. New strategies
// register in the registry below — nothing else changes.
// ───────────────────────────────────────────────────────────────────

/**
 * ContinueLastResponse — the primary recovery strategy.
 *
 * When a stream is interrupted mid-generation, this strategy sends a
 * continuation prompt telling the model to pick up exactly where it
 * left off. The continuation prompt is injected as a follow-up user
 * message, and the original system prompt is preserved.
 *
 * The last partial text is included so the model knows what was already
 * sent and doesn't repeat it.
 */
export const continueLastResponse: RecoveryStrategy = {
  id: 'continue-last-response',
  label: 'Continue Last Response',
  priority: 1,
  enabled: true,

  buildContinuation(request: RecoveryRequest): string {
    const lastContent = request.partialContent
      ? `\n\nHere is what was already sent before the interruption:\n\n${request.partialContent.slice(-1000)}\n\n`
      : ''

    return [
      'CONTINUE EXACTLY WHERE YOU LEFT OFF.',
      '',
      'Your previous response was interrupted unexpectedly and part of it was lost.',
      'Continue from the exact point the interruption occurred.',
      '',
      'CRITICAL: Do NOT restart, summarize, or repeat any previous content.',
      'Do NOT say "I apologize" or acknowledge the interruption.',
      'Simply continue writing as if nothing happened — the reader will see your',
      'complete response seamlessly.',
      '',
      'Begin immediately with the next word that would have followed the interruption.',
    ].join('\n') + lastContent
  },

  async attempt(
    request: RecoveryRequest,
    generator: (messages: unknown[], system: string) => Promise<string>,
  ): Promise<string> {
    const continuationMsg = this.buildContinuation(request)

    // Append the continuation as a new user message
    const continuationMessage = { role: 'user', content: continuationMsg }
    const recoveryMessages = [...(request.messages as any[]), continuationMessage]

    return generator(recoveryMessages, request.system)
  },
}

/**
 * RetrySameProvider — retry the original request with the same model.
 *
 * This is a simple retry strategy that resends the same messages to
 * the same provider. It's used when the interruption is likely a
 * transient provider issue (timeout, network blip) rather than a
 * content/context issue.
 */
export const retrySameProvider: RecoveryStrategy = {
  id: 'retry-same-provider',
  label: 'Retry Same Provider',
  priority: 0, // Tried before ContinueLastResponse
  enabled: true,

  buildContinuation(request: RecoveryRequest): string {
    return [
      'Your previous response was interrupted unexpectedly.',
      'Please continue your response from where you left off or restart naturally.',
      'Do NOT apologize or acknowledge the interruption unless it is necessary for clarity.',
    ].join('\n')
  },

  async attempt(
    request: RecoveryRequest,
    generator: (messages: unknown[], system: string) => Promise<string>,
  ): Promise<string> {
    // If we have partial content, append a continue message
    const messages = [...(request.messages as any[])]
    if (request.partialContent) {
      messages.push({ role: 'user', content: this.buildContinuation(request) })
    }

    return generator(messages, request.system)
  },
}

// ── Strategy Registry ─────────────────────────────────────────────

/**
 * All available recovery strategies, sorted by priority (lowest first).
 * Add new strategies here — they automatically become available to the
 * RecoveryManager.
 */
export const ALL_STRATEGIES: RecoveryStrategy[] = [
  retrySameProvider,
  continueLastResponse,
]

/** Get enabled strategies sorted by priority. */
export function getEnabledStrategies(): RecoveryStrategy[] {
  return ALL_STRATEGIES
    .filter((s) => s.enabled)
    .sort((a, b) => a.priority - b.priority)
}

/** Get a strategy by ID. */
export function getStrategy(id: string): RecoveryStrategy | undefined {
  return ALL_STRATEGIES.find((s) => s.id === id)
}
