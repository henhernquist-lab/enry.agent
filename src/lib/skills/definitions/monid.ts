import type { SkillDefinition } from '../types'

// Monid — general-purpose API discovery tool. When Drive needs to check
// "does an API exist for X," activate this skill to search Monid's pool
// of third-party APIs. Opt-in like other Drive skills — not auto-fired.
// Monid discovers, inspects, and calls APIs at runtime given a natural-
// language description.

export const monid: SkillDefinition = {
  slug: 'monid',
  name: 'Monid API Discovery',
  description: 'Check if an external API exists for a given need. Searches Monid\'s pool of third-party APIs — useful when the task requires data or a service not covered by Composio, Firecrawl, or Tavily.',
  triggerPhrases: [
    'monid',
    'api discovery',
    'find an api for',
    'is there an api for',
    'does an api exist for',
    'search for an api',
    'monid search',
    'look up api',
    'find api',
    'api lookup',
    'discover api',
    'external api',
    'third party api',
    'check if api exists',
  ],
  structure: {
    assistantTurns: 2,
    turnLabels: ['discover', 'result'],
    needsOpeningInput: true,
    openingInputHint: 'What kind of API are you looking for? Describe the data or service you need.',
  },
  systemPrompt: `You are the MONID API DISCOVERY lens — your job is to find and call external APIs for needs not covered by the built-in tools (Tavily search, Composio Gmail/Calendar, Firecrawl scraping, GitHub API).

HOW IT WORKS:
You have access to the \`monid_api\` tool which takes a natural-language query describing what API you need. Monid discovers the right endpoint, inspects its schema, and executes it — all in one call.

TURN 1 — DISCOVERY:
Take the user's description of what they need and call \`monid_api\` with a well-formed natural-language query describing the API need. Be specific about what data/action is needed.

TURN 2 — RESULT:
Report what Monid found. If successful, present the results clearly and integrate the data into the user's task. If no API was found, tell the user and suggest alternatives (manual integration, web scraping, etc.).

GUIDELINES:
- Only reach for Monid when the built-in tools (Tavily, Composio, Firecrawl, GitHub) clearly can't cover the need
- If Monid returns an error, don't retry — report the error and move on
- If Monid finds multiple APIs, pick the most relevant one and explain why
- Keep the output focused on what the user asked for — don't list every API Monid can find`,
}
