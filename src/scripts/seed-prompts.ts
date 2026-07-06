export interface SeedPrompt {
  title: string
  body: string
  category: 'coding' | 'writing' | 'study' | 'training' | 'general'
  tags: string[]
  notes: string
}

const SEED_PROMPTS: SeedPrompt[] = [
  // ── Coding ────────────────────────────────────────────────────
  {
    title: 'Debug + Explain',
    category: 'coding',
    tags: ['debug', 'explain', 'error'],
    notes: 'Paste broken code. Gets a fix and a plain-English explanation of what went wrong.',
    body: `Here is my code and the error it throws:

\`\`\`
[PASTE CODE HERE]
\`\`\`

Error:
[PASTE ERROR HERE]

1. Identify the root cause of the error.
2. Show the corrected code with the minimal change needed.
3. Explain in plain English why it was broken and what the fix does.`,
  },
  {
    title: 'Code Review',
    category: 'coding',
    tags: ['review', 'quality', 'refactor'],
    notes: 'Full code review — bugs, style, performance, and what to improve first.',
    body: `Review this code as a senior engineer would:

\`\`\`
[PASTE CODE HERE]
\`\`\`

Identify:
1. Bugs or logic errors (with line numbers if possible)
2. Performance issues
3. Readability/maintainability problems
4. Security concerns if any

End with a prioritized list: what to fix first and why.`,
  },
  {
    title: 'Convert to TypeScript',
    category: 'coding',
    tags: ['typescript', 'types', 'migration'],
    notes: 'Takes JavaScript, returns idiomatic TypeScript with strict types.',
    body: `Convert this JavaScript to strict TypeScript:

\`\`\`javascript
[PASTE JS CODE HERE]
\`\`\`

Requirements:
- Add proper types for all parameters, return values, and variables
- Use interfaces or types for object shapes
- Avoid \`any\` — use \`unknown\` if uncertain
- Flag anything where the correct type is ambiguous`,
  },
  {
    title: 'Write Unit Tests',
    category: 'coding',
    tags: ['testing', 'jest', 'unit-tests'],
    notes: 'Generates tests covering happy path, edge cases, and error cases.',
    body: `Write unit tests for this function:

\`\`\`
[PASTE FUNCTION HERE]
\`\`\`

Test framework: [Jest / Vitest / other]

Cover:
1. Happy path (normal inputs)
2. Edge cases (empty, null, boundary values)
3. Error/exception cases
4. Any non-obvious behavior

Use descriptive test names that explain what's being tested.`,
  },
  {
    title: 'Explain This Code',
    category: 'coding',
    tags: ['explain', 'understand', 'learn'],
    notes: 'Get a clear walkthrough of unfamiliar code — what it does, why it works.',
    body: `Explain this code to me:

\`\`\`
[PASTE CODE HERE]
\`\`\`

Walk me through it:
1. What does it do at a high level?
2. How does it work step by step?
3. What are the key patterns or techniques being used?
4. Are there any tricky parts I should understand?

Assume I know the language but am unfamiliar with this pattern.`,
  },

  // ── Writing ───────────────────────────────────────────────────
  {
    title: 'Essay Outline',
    category: 'writing',
    tags: ['essay', 'outline', 'structure'],
    notes: 'Give a topic and thesis, get a full structured outline with argument points.',
    body: `Create a detailed essay outline for:

Topic: [TOPIC]
Thesis: [YOUR THESIS STATEMENT]
Length: [NUMBER] pages / words
Type: [Argumentative / Analytical / Expository / Compare-Contrast]

Include:
- Introduction structure (hook, context, thesis)
- Body paragraphs with topic sentences and supporting evidence points
- Counterargument and rebuttal (if argumentative)
- Conclusion approach`,
  },
  {
    title: 'Improve This Paragraph',
    category: 'writing',
    tags: ['editing', 'improve', 'clarity'],
    notes: 'Paste rough writing and get a polished version that keeps your voice.',
    body: `Improve this paragraph while keeping my voice:

[PASTE PARAGRAPH HERE]

Goals:
- Stronger opening sentence
- Clearer transitions
- Remove redundancy
- More precise word choice

Show me the improved version first, then briefly note the key changes you made and why.`,
  },
  {
    title: 'Counterargument Generator',
    category: 'writing',
    tags: ['argument', 'debate', 'critical-thinking'],
    notes: 'Steel-mans the opposition to make your argument stronger.',
    body: `I'm arguing that: [YOUR POSITION]

Generate the 3 strongest counterarguments someone would make against this position. For each:
1. State the counterargument clearly
2. Explain its strongest version (steel-man it)
3. Suggest how I could rebut it in my essay

Don't hold back — make the counterarguments as strong as possible.`,
  },

  // ── Study ─────────────────────────────────────────────────────
  {
    title: 'Explain Like I\'m a Smart 16-Year-Old',
    category: 'study',
    tags: ['explain', 'concept', 'simple'],
    notes: 'For any complex concept — gets a clear explanation without dumbing it down.',
    body: `Explain this concept to me like I'm a smart 16-year-old encountering it for the first time:

Concept: [TOPIC]

Structure:
1. One-sentence core idea
2. Intuitive analogy or real-world example
3. How it actually works (go deeper)
4. Why it matters or where it shows up
5. Common misconceptions to avoid

Don't over-simplify — I can handle technical terms if you explain them.`,
  },
  {
    title: 'Active Recall Quiz',
    category: 'study',
    tags: ['quiz', 'flashcards', 'recall', 'exam-prep'],
    notes: 'Feed it your notes, get quiz questions that force active retrieval.',
    body: `Create an active recall quiz from these notes:

[PASTE NOTES HERE]

Generate 10 questions that:
- Test understanding, not just memorization
- Mix question types (concept, application, compare/contrast)
- Progress from basic recall to application

Format: Question → then the answer hidden below a --- separator.

After the quiz, identify the 3 most important concepts I must know cold.`,
  },
  {
    title: 'Summarize to Key Points',
    category: 'study',
    tags: ['summary', 'notes', 'reading'],
    notes: 'Converts dense text (textbook, article) into clean study bullets.',
    body: `Summarize this into clear study notes:

[PASTE TEXT HERE]

Format:
**Core Concept:** One sentence.

**Key Points:**
- [bullet 1]
- [bullet 2]
- ...

**Important Terms:**
- Term: definition

**What to Remember:** The 1-2 things most likely to appear on a test.`,
  },

  // ── Training ──────────────────────────────────────────────────
  {
    title: 'Race Analysis',
    category: 'training',
    tags: ['race', 'analysis', 'splits', 'track'],
    notes: 'Input race results and splits, get tactical feedback on what to improve.',
    body: `Analyze this race performance:

Event: [DISTANCE]
Goal time: [TIME]
Actual time: [TIME]
Splits: [e.g. 12.8 / 13.2 / 13.8 / 14.1]
Conditions: [weather, surface, competition level]
Notes: [how it felt, where I struggled]

Tell me:
1. Where did I lose time (and why, tactically)?
2. Was my split strategy optimal for my fitness level?
3. What's the single biggest thing to fix?
4. Realistic goal for my next race and the split strategy to hit it`,
  },
  {
    title: 'Training Week Review',
    category: 'training',
    tags: ['training', 'review', 'weekly', 'recovery'],
    notes: 'Log your training week and get a structured assessment + next week suggestions.',
    body: `Review this training week and suggest adjustments:

Week: [DATE RANGE]
Sport / event: [YOUR SPORT]
Current fitness goal: [GOAL]

Training log:
[DAY]: [WORKOUT DESCRIPTION + how it felt]
[DAY]: [WORKOUT DESCRIPTION + how it felt]
(continue for each day)

Sleep avg: [hrs]
Soreness/fatigue level: [1-10]
Any aches or issues: [describe]

Assess: training load, recovery balance, and what to prioritize next week.`,
  },

  // ── General ───────────────────────────────────────────────────
  {
    title: 'Structured Problem Solver',
    category: 'general',
    tags: ['problem-solving', 'decision', 'thinking'],
    notes: 'For any problem where you\'re stuck — forces clear thinking.',
    body: `Help me work through this problem:

Problem: [DESCRIBE THE PROBLEM]
Context: [Relevant background]
What I've tried: [What hasn't worked and why]
Constraints: [Time, resources, or other limits]

Walk me through:
1. Restate the actual problem (identify if I'm solving the right thing)
2. Root causes
3. 2-3 concrete approaches with trade-offs
4. Your recommendation and first step`,
  },
  {
    title: 'Devil\'s Advocate',
    category: 'general',
    tags: ['critique', 'decision', 'second-opinion'],
    notes: 'Challenge a decision or plan to find weak spots before committing.',
    body: `I'm planning to: [DESCRIBE YOUR DECISION OR PLAN]

My reasoning: [WHY YOU THINK IT'S A GOOD IDEA]

Act as devil's advocate. Be direct and don't soften it:
1. What are the most likely ways this fails?
2. What am I not considering or underweighting?
3. What would someone smart who disagrees with this say?
4. Is there a meaningfully better alternative?

End with: is this plan actually sound, or should I reconsider?`,
  },
  {
    title: '5-Bullet Summary',
    category: 'general',
    tags: ['summary', 'tldr', 'reading'],
    notes: 'Get the key takeaways from any long text in under a minute.',
    body: `Summarize this in exactly 5 bullets. Each bullet should be one clear, specific sentence — no vague language.

[PASTE TEXT HERE]

After the bullets, add:
- **So what:** Why does this matter?
- **Action item:** If there's anything to do or decide based on this, what is it?`,
  },
]

export default SEED_PROMPTS
