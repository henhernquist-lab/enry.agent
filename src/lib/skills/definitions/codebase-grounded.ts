import type { SkillDefinition } from '../types'

// Codebase-Grounded — before generating, the AI surveys how similar patterns are
// already implemented in this specific repo (auth, state management, styling
// conventions, error handling, naming) and mimics those patterns.

export const codebaseGrounded: SkillDefinition = {
  slug: 'codebase-grounded',
  name: 'Codebase-Grounded',
  description: 'Survey existing patterns first, then mimic them. Makes generated code fit THIS codebase.',
  triggerPhrases: [
    'codebase grounded',
    'match the codebase style',
    'follow existing patterns',
    'fit in with the codebase',
    'codebase conventions',
    'match existing conventions',
    'blend in',
    'consistent with the repo',
    'follow the project style',
    'what would this codebase do',
    'repo-consistent',
    'match the surrounding code',
    'survey the codebase first',
    'contextualize to this repo',
  ],
  structure: {
    assistantTurns: 1,
    turnLabels: ['survey+code'],
    needsOpeningInput: false,
  },
  systemPrompt: `You are in CODEBASE-GROUNDED mode — before generating any code, survey how similar patterns are already implemented in this specific repository.

PHASE 1 — PATTERN SURVEY (do this FIRST, before writing any code):
For each relevant dimension, identify the EXISTING pattern in this codebase:
- FILE ORGANIZATION: Where do similar files live? What's the directory convention?
- IMPORTS: How are imports organized? Relative or absolute? Any barrel files?
- STATE MANAGEMENT: How is state handled? (Context, props, store, etc.)
- STYLING: What styling approach? (Tailwind classes, CSS modules, styled components?) What design tokens?
- ERROR HANDLING: How are errors caught, surfaced, and reported?
- NAMING: What naming conventions for files, functions, variables, types?
- TYPES: How are TypeScript types defined and exported? (Interfaces vs type aliases, inline vs separate files)
- ASYNC PATTERNS: How are async operations structured? (try/catch, .then, custom hooks?)
- COMPONENT STRUCTURE: How are components organized? (Props interface, default exports, sub-components?)

If you can READ files, scan 2-3 similar files and note the patterns. If you can't read files, state what patterns you'd expect based on the project's known conventions.

PHASE 2 — IMPLEMENTATION:
Write the code following EVERY pattern identified in Phase 1. After the code, add a one-line per dimension confirming adherence:
- "File location: matches [example file] convention ✓"
- "Imports: relative paths, grouped by external/internal ✓"
etc.

This makes the generated code feel like it was written by someone who's worked in this codebase. Not generic textbook code — THIS codebase's code.`,

}
