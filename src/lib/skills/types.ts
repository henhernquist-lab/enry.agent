// Chat skills — structured conversation modes the user invokes inside the main
// chat. A skill flips the LLM into a specialized behavior for a bounded,
// multi-turn interaction, then hands control back to normal chat when its
// structure completes (or the user exits early).
//
// Skills are STATELESS for now: each invocation is fresh, nothing persists
// between sessions. Adding a skill is meant to be a config addition (one file
// in ./definitions + one line in registry.ts), never architectural work — so
// everything a skill needs lives in this one declarative shape.

export interface SkillStructure {
  // Total number of ASSISTANT turns the skill runs for. The interaction ends
  // automatically after the assistant produces this many turns in skill mode.
  // (User turns in between are implied — e.g. Devil's Advocate is 3 assistant
  // turns: opening, counter, verdict, with the user rebutting/defending between.)
  assistantTurns: number
  // Human-facing labels for each assistant turn, indexed from 0. Drives the
  // phase indicator in the mode banner ("opening case" → "counter" → "verdict").
  turnLabels: string[]
  // If true, the skill needs the user to supply a topic/belief before the first
  // assistant turn. When invoked without one (e.g. bare `/skill devil-advocate`),
  // the UI arms the skill and waits for the user's next message as that input,
  // rather than immediately generating a turn.
  needsOpeningInput: boolean
  // The one-line prompt shown in the banner while waiting for needsOpeningInput.
  openingInputHint?: string
}

export interface SkillDefinition {
  slug: string
  name: string
  // One line, for UI (banner, palette, hints).
  description: string
  // Natural-language ways to invoke the skill. Matched (apostrophe- and
  // whitespace-insensitively) against the user's raw input by the router. The
  // FIRST phrase is treated as the canonical key term for topic extraction.
  triggerPhrases: string[]
  // The specialized behavior/persona. Fully replaces the default chat system
  // prompt while the skill is active. Should describe the whole turn structure
  // and reference "the current turn number" — the route injects which turn is
  // being generated so the same prompt drives every turn deterministically.
  systemPrompt: string
  structure: SkillStructure
}
