/** ─────────────────────────────────────────────────────────
 *  Prompt Library — Seed Data
 *  20 starter prompts for a 9th-grade student-athlete
 *  who builds AI apps, runs track, lifts, and reads.
 * ───────────────────────────────────────────────────────── */

export interface SeedPrompt {
  title: string
  body: string
  category: 'coding' | 'writing' | 'study' | 'training' | 'general'
  tags: string[]
  notes: string
}

const SEED_PROMPTS: SeedPrompt[] = [
  // ═══════════════════════════════════════════════════════
  //  CODING (5)
  // ═══════════════════════════════════════════════════════

  {
    title: 'Add a new feature (Claude Code template)',
    body: `You are a senior Next.js/TypeScript developer working inside this project.

Before writing any code:
1. List the 5 most relevant files by running \`find src -name '*.ts' -o -name '*.tsx' | head -30\` and reading the closest pages/components to this feature.
2. Read \`package.json\` and check existing patterns in neighboring files — reuse them.
3. Search for similar existing features to avoid duplicating effort.

Then implement {{FEATURE}}. Rules:
- No \`any\` types. Use the project's existing type and import conventions.
- If you need state, use the same state management pattern the rest of the app uses.
- Add a comment on any non-obvious logic.
- After implementation run \`npx tsc --noEmit\` and fix all type errors.`,
    category: 'coding',
    tags: ['next.js', 'typescript', 'feature', 'claude-code'],
    notes:
      'Use when starting a new feature in a Next.js app. Replace {{FEATURE}} with a short description like "a streak heatmap on the /resources page". The prompt makes the agent orient itself before writing code.',
  },

  {
    title: 'Deep code review — PR scrutiny',
    body: `You are a senior engineer doing a line-by-line code review. Be ruthless.

Here is the diff: {{DIFF}}

Check for:
1. **Bugs** — off-by-one, null ref, race condition, unhandled rejection.
2. **Type safety** — \`any\` casts, missing generics, incomplete unions.
3. **Logic errors** — trace one realistic input through the code. Does it produce the right output?
4. **Performance** — N+1 queries, unnecessary re-renders, large deps arrays, O(n²).
5. **Style drift** — does this match the surrounding code? Naming, imports, error handling.

For each issue state: severity (blocking | major | minor), exact line, why it's wrong, and how to fix it with a code sketch.

Skip praise. Only flag problems.`,
    category: 'coding',
    tags: ['code-review', 'typescript', 'quality'],
    notes:
      'Paste a diff into {{DIFF}}. Good for PR reviews or checking your own work before committing.',
  },

  {
    title: 'Debug — systematic root cause analysis',
    body: `I have a bug in {{FILE}}.

Bug: {{BUG}}

Walk through this step by step. Do NOT jump to a fix.

1. List the possible root causes ranked by likelihood.
2. Tell me the first thing to check (a log, a curl, a breakpoint) and wait for my answer.
3. After I report back, either confirm the root cause or move to the next candidate.
4. Only once confirmed, propose the minimal fix.
5. Before applying, say: "Check that nothing else depends on the old behavior."`,
    category: 'coding',
    tags: ['debugging', 'typescript', 'process'],
    notes:
      'Use when stuck on a bug. Replace {{FILE}} and {{BUG}}. The structured process prevents jumping to wrong fixes.',
  },

  {
    title: 'Refactor this component (no behavior change)',
    body: `Refactor {{FILE}} to improve maintainability without changing behavior.

Rules:
- Behavior must be identical. If I can't tell the difference, it's correct.
- Extract helpers or hooks when a function exceeds 40 lines or handles 3+ unrelated concerns.
- Remove dead code, unused imports, commented-out blocks.
- Extract magic numbers and strings to named constants.
- Sort imports: third-party first (alpha), then local (alpha by depth).

Output one section per change: old snippet → new snippet, plus a 2-line summary of what changed and why.`,
    category: 'coding',
    tags: ['refactor', 'typescript', 'cleanup', 'react'],
    notes:
      "Replace {{FILE}} with the path to a component that's grown messy. Run before adding a new feature to existing code.",
  },

  {
    title: 'Design an API endpoint',
    body: `Design an API endpoint for {{FEATURE}}.

Stack: Next.js App Router, TypeScript, Supabase, NextAuth.

First answer these before writing code:
1. Exact shape of request body / query params?
2. Exact shape of success response?
3. All error states (auth, validation, not found, server error)?
4. Does this need auth? What permission check?
5. What Supabase query will this run? Write it first.
6. GET, POST, PUT, PATCH, or DELETE? Does it follow REST for this resource?

Then write the full route handler matching the patterns in \`src/app/api/\`. Include validation, error handling, and proper HTTP codes.

End with a curl or fetch example showing how to call it.`,
    category: 'coding',
    tags: ['api-design', 'next.js', 'rest', 'typescript'],
    notes:
      'Use before writing a new API route. Replace {{FEATURE}} with what the endpoint should do. The upfront thinking prevents design mistakes.',
  },

  // ═══════════════════════════════════════════════════════
  //  WRITING (5)
  // ═══════════════════════════════════════════════════════

  {
    title: 'Ruthless essay editor',
    body: `You are a ruthless editor — Strunk & White meets a teacher who has seen one too many fluffy sentences.

Cut every word that doesn't earn its place in {{ESSAY}}.

Rules:
1. **Passive voice** — flag each instance and rewrite in active.
2. **Weak verbs** — find "is/are/was + [noun]" and replace with a strong verb.
3. **Deadwood to delete** — "in order to," "due to the fact that," "in today's society," "it is important to note that," "very," "really," "quite."
4. **Empty claims** — any sentence asserting without evidence ("This shows that...") — flag it and ask for the evidence.
5. **Sentence starts** — if three in a row start the same way, mark them.

Output: the edited essay with changes in **[bold brackets]** and a 3-line summary of the biggest structural weakness. Keep my voice — just cut the fat.`,
    category: 'writing',
    tags: ['essay', 'editing', 'clarity'],
    notes:
      'Paste an essay into {{ESSAY}}. Use before submitting any written assignment. Catches fluff that spellcheck misses.',
  },

  {
    title: 'Strengthen this argument',
    body: `Act as a debate coach. Do NOT rewrite my draft.

My argument: {{DRAFT}}

1. **Weakest link** — which claim is most likely to be challenged? Why?
2. **Evidence gap** — for each major claim, what kind of evidence would help (statistic, example, expert quote, precedent)?
3. **Counterargument** — what's the strongest objection to my position? How should I address it?
4. **Structure** — should I lead with my strongest point or build up to it?
5. **Audience** — who is {{AUDIENCE}}? Is the tone right for them?

Numbered list. If my argument is fundamentally flawed, say so directly.`,
    category: 'writing',
    tags: ['argument', 'persuasion', 'debate', 'structure'],
    notes:
      'Use for persuasive essays, debate prep, or applications. Replace {{DRAFT}} and {{AUDIENCE}}.',
  },

  {
    title: 'Personal essay / college app coach',
    body: `You have read 5,000+ personal essays. You can spot a cliché from the first sentence.

Read my draft: {{ESSAY}}

Answer without preamble or praise:

1. **Cliché check** — "overcoming adversity," "found my passion," "teamwork taught me" — name every cliché you see.
2. **Opening hook** — does the first sentence make me want to read the second?
3. **Show vs. tell** — count how many sentences tell a conclusion ("I learned responsibility") vs. show a scene that implies it ("I unlocked the weight room at 6 AM because only I had the key").
4. **Specificity** — could another student swap their name in and submit this? If yes, it's too generic. Point to the one detail only I could include.
5. **So what?** — after the last sentence, do I know something about who I am that I didn't know before?

If it's working, tell me what's strong so I don't cut it. If not, tell me where to restart.`,
    category: 'writing',
    tags: ['college-essay', 'personal-statement', 'admissions'],
    notes:
      'Use for personal statements and applications. Replace {{ESSAY}} with your draft. Calibrated to catch vague, generic writing.',
  },

  {
    title: 'Summarize and interrogate a text',
    body: `Read {{TEXT}} and produce three things:

**1. One-paragraph summary** (max 4 sentences): main claim, evidence, conclusion.

**2. Key quotes** (up to 3): pull the most important sentences. For each, explain in one sentence why it matters.

**3. Three questions** the text raises but does not answer. These should be genuine points of uncertainty, not gotchas.

Rules: Do not add outside knowledge. Stick to what the text says. If longer than 5,000 words, summarize the first 2,000 and note you only read the beginning.`,
    category: 'writing',
    tags: ['analysis', 'summary', 'reading', 'critical-thinking'],
    notes:
      'Use for articles, chapters, or papers you need to understand deeply. Paste text or a URL into {{TEXT}}. Works for school readings or research.',
  },

  {
    title: 'Cold email that gets a response',
    body: `Write a cold email from me to {{RECIPIENT}}.

Context: {{CONTEXT}} — why I'm reaching out.

Rules:
- Under 100 words. Fits in a preview pane.
- Sentence 1: who I am and why I'm writing. No "I hope this finds you well."
- Sentence 2: specific reason I chose them (their project, paper, or role).
- Sentence 3: a specific ask (15-min call, one question, advice on one thing).
- Sign-off: my name and a link to one relevant thing (GitHub, a project I built).
- Do not apologize. Do not say "I know you're busy."

Output plain text ready to copy-paste, plus a 1-line note on why this approach works for this recipient.`,
    category: 'writing',
    tags: ['email', 'networking', 'professional', 'outreach'],
    notes:
      "Use when reaching out to a mentor, engineer, or anyone you don't know. Replace {{RECIPIENT}} and {{CONTEXT}} with specifics.",
  },

  // ═══════════════════════════════════════════════════════
  //  STUDY (5)
  // ═══════════════════════════════════════════════════════

  {
    title: 'Turn notes into a study guide',
    body: `Convert my notes on {{SUBJECT}} into an active-recall study guide.

Notes: {{NOTES}}

Format:
## Key Concepts (up to 7)
Each: one-sentence definition + why it matters + how it connects to the next.

## Self-Test (10 questions)
Progress from "do I remember the term?" to "can I apply the concept?" Mark the 3 hardest with ★.

## Common Mistakes
What do students typically get wrong? What's the one confusion that, once resolved, makes everything click?

## Cheat Sheet (max 100 words)
A tight summary a beginner could read and understand 80% of the topic.

No definitions without an example. No fluff.`,
    category: 'study',
    tags: ['study-guide', 'notes', 'active-recall', 'test-prep'],
    notes:
      'Best for turning messy lecture notes into something studyable. Replace {{SUBJECT}} and {{NOTES}}.',
  },

  {
    title: 'Generate flashcards from material',
    body: `Create Anki-style flashcards from this material — one fact per card, no compound questions.

Material: {{MATERIAL}}

Rules:
- FRONT: a specific question or cloze deletion, not a vague topic.
- BACK: 1–3 sentences max.
- No "What is [term]?" with a dictionary answer. Instead ask "Why does [term] matter?" or "How is [term] different from [X]?"
- Create exactly {{COUNT}} cards grouped by subtopic.

Output (ready to paste into Anki):
## [Subtopic]
Q: [question]
A: [answer]`,
    category: 'study',
    tags: ['flashcards', 'anki', 'memorization', 'spaced-repetition'],
    notes:
      'Use when you need to memorize material. Replace {{MATERIAL}} and {{COUNT}} (e.g., 20).',
  },

  {
    title: 'Socratic tutor — quiz me on this',
    body: `I want to learn {{TOPIC}}. I have {{BACKGROUND}} knowledge of it.

Act as a Socratic tutor. Do NOT lecture.

1. Ask me one question about the most fundamental concept.
2. If I'm right, confirm briefly and ask a deeper follow-up.
3. If I'm wrong, ask a leading question that helps me see the mistake — don't tell me the answer.
4. If I'm stuck, give a one-sentence hint.
5. After 5 correct answers, summarize what I've shown I understand and move to the next subtopic.
6. After 3 wrong answers on the same concept, explain it in 2 paragraphs max and test me again with a different question.

Start with the first question now. No preamble.`,
    category: 'study',
    tags: ['tutoring', 'socratic', 'active-learning', 'quiz'],
    notes:
      'Use when you need deep understanding, not memorization. Best as a conversation — type or speak your answers. Replace {{TOPIC}} and {{BACKGROUND}} ("read the chapter" or "know the basics").',
  },

  {
    title: "Explain this like I'm 15",
    body: `Explain {{TOPIC}} as if I'm a 15-year-old seeing it for the first time.

Rules:
- Start with an analogy from sports, lifting, or video games.
- After the analogy, give the real explanation in plain language. Define every piece of jargon.
- Walk through one concrete example step by step.
- End with one sentence connecting this to something I've learned before.

Max 4 paragraphs. No math beyond 9th-grade level. If the topic needs prerequisites, list them first with one-sentence explanations.

Start with: "You know how..."`,
    category: 'study',
    tags: ['explanation', 'analogy', 'simplify', 'learning'],
    notes:
      "Use when stuck on a new concept in any subject. Replace {{TOPIC}} with the specific thing you're trying to understand.",
  },

  {
    title: 'Memory system for a list of facts',
    body: `I need to memorize this list for {{PURPOSE}}:

{{ITEMS}}

Create three memory systems:

1. **Story** — weave all items into one absurd, vivid, memorable story (max 5 sentences). The weirder the better.
2. **Memory palace** — assign each item to a spot in a place I know well (school, track, house). Explain why each goes there.
3. **Acronym or peg** — if story and palace don't fit, give me an acronym or number-rhyme peg list.

Plus: the 3 items most people mix up — give me a specific trick to keep them straight.`,
    category: 'study',
    tags: ['memory', 'mnemonic', 'memory-palace', 'study-hacks'],
    notes:
      'Use for ordered lists, timelines, vocab sets, or any discrete set of facts. Replace {{PURPOSE}} and {{ITEMS}}.',
  },

  // ═══════════════════════════════════════════════════════
  //  TRAINING (3)
  // ═══════════════════════════════════════════════════════

  {
    title: 'Design a track workout',
    body: `Design a track workout for {{EVENT_AND_GOAL}}.

Athlete context: {{CONTEXT}} — include your current PRs, training volume, and weeks until your next meet.

Workout must include:
- Warmup: activation drills, strides, pace-practice reps.
- Main set: exact distances, reps, rest intervals, and target pace per rep in seconds/100m.
- Cooldown: minimal but effective.
- Purpose: one sentence — what physiological adaptation this workout targets.
- Progression: how should this workout change over the weeks leading to your goal meet?

If you're within 3 weeks of your meet, add a tapering note.`,
    category: 'training',
    tags: ['track', 'workout', 'sprinting', 'pacing', 'training-plan'],
    notes:
      'Replace {{EVENT_AND_GOAL}} with something like "400m goal 54.0" and {{CONTEXT}} with your PRs, training frequency, and meet date in a single sentence.',
  },

  {
    title: 'Analyze my race splits',
    body: `Analyze these race splits:

{{RACE_DATA}}

(Include event, goal time, actual time, and split-by-split times in seconds.)

1. **Per-segment analysis** — for each split, was it too fast, too slow, or appropriate?
2. **Pacing curve** — describe the shape (positive, negative, even, crash-and-burn).
3. **What-if projection** — if the first half was X seconds slower and the second half Y seconds faster, what would the total have been? Show the math.
4. **One fix** — the single highest-leverage change for next race, with a specific workout to address it.
5. **Goal check** — is the goal time realistic given this pacing profile? If not, suggest a better target.`,
    category: 'training',
    tags: ['race-analysis', 'splits', 'pacing', 'track'],
    notes:
      'Use after a race. Replace {{RACE_DATA}} with a single block: "400m goal 54.0 actual 55.2 splits 13.0/12.5/14.2/15.5".',
  },

  {
    title: 'Plan nutrition around training',
    body: `I need a nutrition plan for {{PHASE_AND_EVENT}}.

My profile: {{PROFILE}} (age, gender, weight, constraints — everything in one sentence).

Give me:
1. Daily calorie target and macro split (g protein / g carbs / g fat). Show the math.
2. Meal timing around practice: what to eat 2–3 hours before, what within 30 minutes after, and why.
3. Hydration: how much water and what electrolytes during a 2-hour session.
4. Race day: specific meal and timing for a meet.
5. One thing most athletes at this distance neglect nutritionally.

Real food first. No supplement recommendations unless I ask.`,
    category: 'training',
    tags: ['nutrition', 'diet', 'sports-nutrition', 'recovery'],
    notes:
      'Replace {{PHASE_AND_EVENT}} with e.g., "off-season 400m training" and {{PROFILE}} with "15M 140lb 400m goal 54.0 no restrictions".',
  },

  // ═══════════════════════════════════════════════════════
  //  GENERAL (2)
  // ═══════════════════════════════════════════════════════

  {
    title: 'Build a weekly schedule for school + training + projects',
    body: `I need a weekly schedule that fits all of this:

{{COMMITMENTS}}

(List your classes, practice times, lift sessions, homework blocks, project time, and anything else fixed.)

Help me:
1. **Block it out** — arrange the fixed commitments first, then layer in the flexible ones.
2. **Energy matching** — put the hardest cognitive work (coding, math) near my best hours, and easier work (reading, review) near low-energy times.
3. **Recovery** — where do I need to protect sleep and rest? Flag any day where I'm overcommitted.
4. **Buffer** — where can I add 30-minute flex blocks for things that run long?
5. **One trade-off** — if something has to give, what's the lowest-impact thing to drop?

Output a simple text grid (Mon–Sun, AM/midday/PM/evening). No fancy formatting — I need something I can copy into a note.`,
    category: 'general',
    tags: ['productivity', 'scheduling', 'time-management', 'school'],
    notes:
      'Replace {{COMMITMENTS}} with your weekly obligations as bullet points. Use at the start of a season or semester to build a sustainable routine.',
  },

  {
    title: "Take serious notes on a book I'm reading",
    body: `I'm reading {{BOOK_AND_SECTION}}.

Extract and format the following:

## 1. One Big Idea (2 sentences max)
What is the single most important claim in this section?

## 2. Supporting Arguments (up to 3)
For each: the claim, the evidence the author provides, and whether the evidence holds up (strong / plausible / weak).

## 3. Connection to What I Know
Does this confirm, challenge, or extend something I already believe? Be specific — name the prior belief.

## 4. Actionable Takeaway
If I act on one thing from this section, what should it be? (Could be a change in how I train, code, study, or think.)

## 5. One Sentence I Want to Remember
Quote the sentence. Explain in your own words why it matters.

Keep each section to 1–4 lines. No padding.`,
    category: 'general',
    tags: ['reading', 'notes', 'books', 'learning', 'analysis'],
    notes:
      'Replace {{BOOK_AND_SECTION}} with e.g., "Atomic Habits by James Clear — chapter 4 on habit stacking". Designed to extract lasting value rather than just highlighting.',
  },
]

export default SEED_PROMPTS
