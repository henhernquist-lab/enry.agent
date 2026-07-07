# Daily Prompt Rotation Spec

> Reference for the cron route (`/api/automations/generate`) that produces the daily auto-generated prompt shown in the Daily Briefing panel.

---

## 1. Weekly Rotation Schedule

Seven days, five categories. Two categories repeat — coding and training — matching the volume of a student-athlete who builds.

| Day | Category | Rationale |
| :--- | :--- | :--- |
| **Monday** | `coding` | Start the week building. Fresh energy for the hardest cognitive work. |
| **Tuesday** | `study` | Academic focus early in the week when material is fresh and deadlines approach. |
| **Wednesday** | `writing` | Midweek creative break from code. Essays, arguments, clarity work. |
| **Thursday** | `training` | Midweek physical push. Practice/meet prep for weekend competition. |
| **Friday** | `coding` | End-of-week project push. Ship something before the weekend. |
| **Saturday** | `training` | Peak training day — competition, long sessions, race analysis. |
| **Sunday** | `general` | Reflection, planning, balance. Connect the dots across domains. |

**Fallback rule:** If the system cannot determine the current day, default to `general`.

---

## 2. Prompt Concepts Per Category

Each category has 3 concept archetypes. The generation model picks one (rotating or randomized) and fleshes it into a full prompt. Concepts are deliberately underspecified — the model fills in the concrete topic, constraints, and output format from context.

### Coding (Monday / Friday)

| # | Concept | What a good generated prompt should do |
| :--- | :--- | :--- |
| C1 | **Feature sprint** | Pick a concrete feature relevant to the user's current project (from recent chat context or repo). Define a specific deliverable and a 90-minute timebox. Require a working diff, not a plan. |
| C2 | **Bug hunt** | Present a hypothetical bug pattern common in the user's stack (race condition, memory leak in useEffect, N+1 query). Ask the user to find and fix the real version of that pattern in their own codebase. |
| C3 | **Code quality audit** | Select one file from recent edits. Ask the model to review it for the 3 most impactful improvements — not style nits, but real structural changes. Require before/after snippets. |

### Study (Tuesday)

| # | Concept | What a good generated prompt should do |
| :--- | :--- | :--- |
| S1 | **Concept bridge** | Pick a topic the user recently studied (from chat or profile). Generate a prompt that forces them to explain the concept in their own words, then apply it to a novel problem. |
| S2 | **Active recall drill** | Generate 10 quiz questions from the user's recent study material (or a general topic from their grade level). Progress from recall → understanding → application. Include answer keys. |
| S3 | **Test prep simulator** | Simulate a test question for a subject the user is taking. Include a time limit, point value, and a rubric for self-grading. Model the ambiguity of real exam questions — not clean textbook problems. |

### Writing (Wednesday)

| # | Concept | What a good generated prompt should do |
| :--- | :--- | :--- |
| W1 | **Argument pressure-test** | Present a claim the user likely holds (from profile or reading history). Ask them to write a 300-word defense of the opposite position, using the strongest available evidence. |
| W2 | **Style imitation exercise** | Pick a well-known writer's style (Orwell, Didion, PG). Give a short passage. Ask the user to rewrite a mundane paragraph in that style, then reflect on what they learned. |
| W3 | **Sentence-level surgery** | Provide a bloated paragraph (model-generated or from a real source). Ask the user to cut it by 40% without losing meaning. Every cut must be justified. |

### Training (Thursday / Saturday)

| # | Concept | What a good generated prompt should do |
| :--- | :--- | :--- |
| T1 | **Session architect** | Given the user's event and training phase (from profile), design a specific workout for today. Include warmup, main set with exact paces/reps/rest, cooldown, and the single physiological adaptation being targeted. |
| T2 | **Race autopsy** | If the user recently raced: a structured post-race analysis. Split-by-split breakdown, pacing curve assessment, what-if projections, and the one highest-leverage fix for next race. |
| T3 | **Recovery audit** | Ask the user to log sleep (hrs), soreness (1-10), nutrition quality (1-5), and stress (1-5) for the past 3 days. Generate a recovery score and flag the day most at risk of overtraining. Give one concrete adjustment. |

### General (Sunday)

| # | Concept | What a good generated prompt should do |
| :--- | :--- | :--- |
| G1 | **Weekly retro** | Structured reflection on the past week across all domains (coding, school, training). Three wins, one thing that slipped, one priority for next week. Force specificity — no "I worked hard." |
| G2 | **Cross-domain synthesis** | Ask the user to connect something they learned in one domain to another. (e.g., "What did you learn about pacing in your 400m that applies to how you approach a coding project?") |
| G3 | **Book/article deep dive** | If the user has been reading (from profile or reading list), generate a structured note-taking prompt for the current chapter. Claim extraction, evidence evaluation, personal connection, actionable takeaway. |

---

## 3. Few-Shot Example Prompts

These 5 fully-written prompts serve as direct examples the generation model can reference in its system prompt. Each matches the quality bar of the existing 20 seed prompts: specific role, specific constraints, specific output format, no fluff.

---

### Example 1 — Coding: "Ship Something by Friday"

```
You are a product-minded senior engineer. You have 90 minutes to ship one
concrete improvement to this project before the weekend.

Look at the files most recently edited (check git diff or the last PR).
Pick ONE thing — a small feature, a UX improvement, a performance fix —
that can be fully shipped (code + tested + committed) in 90 minutes.

Rules:
- State what you're building in one sentence before writing code.
- Reuse existing components and patterns. No new dependencies.
- After implementing, run `npx tsc --noEmit` and fix all type errors.
- Commit message must describe the user-facing change, not the implementation.

Output: the commit message, a 2-line summary of what changed, and a
one-line test I can run to verify it works.
```

**Why it works:** Timeboxed, concrete deliverable, forces reuse over novelty, verifiable output. Matches the builder persona's Friday energy.

---

### Example 2 — Writing: "Ruthless Cut Pass"

```
You are an editor who believes every sentence must earn its place.

Here is a paragraph I wrote this week:

[PASTE PARAGRAPH HERE]

Do three things:

1. Cut the paragraph by at least 30%. Delete words, phrases, and
   sentences that add no new information or emotional weight.
2. For every cut you made, write a one-line justification.
3. Rewrite the single weakest sentence from passive to active voice.

Rules:
- Do not add new ideas or change my meaning.
- Keep my voice. If I use short sentences, keep them short.
- Flag any cliché, hedge ("kind of," "sort of," "I think"), or
  deadwood phrase ("in order to," "due to the fact that").

Output: the original paragraph, the cut version, and your cut list
with justifications.
```

**Why it works:** Specific constraint (30%), requires justification for every cut (no lazy edits), preserves voice (models respect the student's style).

---

### Example 3 — Training: "Thursday Speed Session"

```
Design a track workout for a 400m sprinter 4 weeks out from their goal meet.

Athlete profile:
- PR: 54.0, target: sub-53
- Training 5x/week (2 track, 2 lift, 1 recovery)
- Weakness: last 100m fade (splits: 12.5 / 13.0 / 13.8 / 15.2)

Workout must include:

1. Warmup (8-10 min): activation drills + 2× flying 30m at 90%
2. Main set: exact reps, distances, rest intervals, and target times
   per rep in seconds.
3. Cooldown: one stretch or drill that specifically addresses
   the fade pattern.
4. Purpose: one sentence — what physiological adaptation this
   targets and why it matters at week 4.
5. Taper note: how this workout changes 2 weeks from now vs. today.

Do not include generic advice. Every rep must have a target time.
```

**Why it works:** Real athlete profile with specific data, exact output structure, addresses a concrete weakness. Not a "how to train" article — a specific prescription.

---

### Example 4 — Study: "Pre-Test Cram Converter"

```
I have a test on [SUBJECT] in 48 hours. Here are my notes:

[PASTE NOTES]

Convert this into a last-48-hours study plan. Do NOT summarize my notes —
I already have them.

1. Priority triage: which 3 topics will appear on the test (ranked by
   likelihood × point value)? What can I skip?
2. Active-recall questions: 15 questions I must be able to answer cold.
   Progress from definition → comparison → application.
3. One practice problem: a question in the format my teacher uses
   (show your work / short answer / essay). Include a rubric so I
   can grade myself.
4. The thing most students mix up: one confusion that, once resolved,
   makes everything click. Name it.
5. Tomorrow morning: what to review in 15 minutes before the test.

No paragraphs longer than 3 sentences. Every section must be
directly useful — no "make sure to get good sleep."
```

**Why it works:** Time pressure, triage first (not all content is equal), self-grading rubric, anti-fluff rule. Matches the student persona's Tuesday reality.

---

### Example 5 — General: "Sunday Stack Review"

```
Review your week across three stacks: mind, body, and build.

Answer each with one specific sentence. No "it was fine."

**Mind (school + reading):**
- One thing I learned this week that changed how I think:
- One thing I'm confused about and need to revisit:

**Body (training + recovery):**
- Best session this week (day, workout, why it clicked):
- Sleep average (hrs) and one thing that hurt my sleep:

**Build (coding + projects):**
- One thing I shipped:
- One thing I started but didn't finish — and whether it's worth
  finishing next week:

**Next week:**
- The one priority. If I only do one thing well next week, it's:

This is not a journal. Don't write paragraphs. One sentence per prompt.
The value is in the choosing — what you include reveals what matters.
```

**Why it works:** Cross-domain integration, forces specificity, timeboxed (one sentence each), ends with a single priority. Matches the Sunday reflection persona.

---

## 4. Generation Guidelines

When the cron route generates the daily prompt:

1. **Determine category** from the day-of-week table above.
2. **Pick a concept** from the category's concept list. Rotate sequentially across weeks so the user doesn't get the same concept two weeks in a row on the same day. (Week 1 Monday = C1, Week 2 Monday = C2, Week 3 Monday = C3, Week 4 Monday = C1.)
3. **Fill in specifics** using user profile data when available:
   - `training` prompts: pull event, PRs, training phase from `user-profile.ts`
   - `coding` prompts: reference recently touched files or active feature branches
   - `study` prompts: pull subjects and grade level from profile
   - `writing` prompts: use reading list or recent article history
   - `general` prompts: no profile data needed — work standalone
4. **Match the tone** of the few-shot examples: specific role, specific constraints, specific output format. No vague coaching language. No motivational quotes.
5. **Include the 5 few-shot examples** in the generation model's system prompt as reference. The model should match their structure: role assignment → concrete input placeholder → numbered output requirements → anti-fluff rules.

## 5. Anti-Patterns

Things the generation model must NOT produce:

- **Vague prompts:** "Reflect on your week and think about what went well." (Not actionable.)
- **Motivational fluff:** "You've got this! Believe in yourself!" (The user is here to work, not to be cheered.)
- **Content-free structure:** Prompts that are all scaffolding and no substance — a fancy outline with nothing to fill it.
- **One-size-fits-all advice:** "Make sure to get 8 hours of sleep." (The user knows this. Be specific to their data.)
- **Prompts longer than the user's likely response:** If the prompt is 500 words and the expected output is 3 sentences, the ratio is wrong.
