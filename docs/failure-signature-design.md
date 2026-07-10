# Failure Signature — Design Document

> Given a failure event and the ~2 weeks of behavioral data preceding it,
> produce a compact representation ("signature") that can be compared to
> future pre-failure periods to detect "this is the same shape of failure
> forming again."
>
> Read-only research and design doc. No code changes.

---

## 1. Data Dimensions That Matter

Not all logged data carries predictive signal. The failure signature must
focus on dimensions that changed *before* the failure, not dimensions
that describe the failure itself.

### Primary dimensions (high signal — use every time)

| Dimension | Source | What it measures | Why it signals |
| :--- | :--- | :--- | :--- |
| **Check-in trend direction** | `checkin.rating` over 14 days | Slope of mood: improving, flat, or declining | A declining check-in trend precedes every failure type. It's the closest thing to a universal leading indicator. |
| **Activity frequency change** | Resource `created_at` counts per day, bucketed by type | Tool-by-tool engagement: is the user doing more, less, or the same? | A selective drop in one domain (e.g., flashcards stop but workouts continue) is the signature of a domain-specific failure. A global drop is a systemic energy issue. |
| **Gap emergence (streak breaks)** | `habit_streak.checked_on`, `workout.logged_at` | Consecutive-day streaks and where they break | Streak breaks are the most specific early signal. The break date is the first measurable deviation from the pattern. |
| **Note sentiment shift** | `checkin.note`, `note.content` | Subjective language: "tired," "good practice," "frustrated" | Sentiment in free-text notes shifts 2-5 days before the failure event. This is slower to detect than numeric signals but more specific. |
| **Protein/calorie deviation** | `meal.calories`, `meal.protein` vs. daily target | Percentage of target hit per day | On a cut, drops are expected. On a bulk, drops signal fatigue or loss of discipline. The direction matters — always cross-reference with diet phase. |
| **Sleep quality proxy** | `checkin.note` keywords ("tired", "up late", "slept well"), `wakeTime` consistency | Hours and quality inferred from notes and schedule adherence | Sleep degradation appears 3-7 days before athletic and academic failures. Inferred sleep quality + consistency is a strong leading indicator. |

### Secondary dimensions (domain-specific — include only when relevant)

| Dimension | Source | Active for which failure domains | Why it signals |
| :--- | :--- | :--- | :--- |
| **Weight training volume** | `workout.sets[].weight` (sum of max per session) | Training regression | Decreasing max weights over 2+ weeks before any physical failure. |
| **Flashcard generation rate** | `flashcards.cards[].length` per session | Academic failure | A drop in flashcard generation 5-10 days before a test predicts grade decline. |
| **Race pace calculation frequency** | `race_pace.mode === 'calculation'` count per week | Bad race / missed PR | An increase in calculations without an increase in timed efforts signals "planning mode" replacing "execution mode." |
| **Project file churn** | `repo_scan.fileTree` changes, `repo_review.files_analyzed` | Killed project | A project that stops receiving new files for 14+ days is dead. The signature is the date of last file change. |
| **Consistency across tools** | Daily activity vector (which tools were used each day) | All | A narrowing of tool diversity (using fewer types of tools per day) precedes all failure types. Measuring `toolCountPerDay` is a lightweight universal signal. |

### Dimensions that seem valuable but are actually noise

| Dimension | Why it's noise |
| :--- | :--- |
| **Time of day of first activity** | Henry's schedule varies by day of week (practice days vs. rest days). The variation is structural, not behavioral. |
| **Absolute number of resources saved** | Total count grows over time as Henry uses the app more. The absolute number is less informative than the *change in rate*. |
| **Calorie count without context** | A 2,200-calorie day on bulk vs. cut means opposite things. Always cross-reference with diet phase before including. |
| **Day of week of failure** | With only ~5-10 failures in the system, day-of-week patterns will look significant by random chance. Over-fitting trap. |

### Feature vector design

Each signature compresses the 14-day window into a fixed-length vector
of 36 dimensions:

| Index range | Dimensions | Source |
| :--- | :--- | :--- |
| 0 | Diet phase (one-hot: bulking=0, cutting=1, maintaining=2) | Profile |
| 1 | Days since last race result | Race pace logs |
| 2 | Days until next tracked deadline | Countdowns |
| 3-16 | **Per-day check-in rating** (14 days, 0 if no check-in) | Check-in logs |
| 17-30 | **Per-day tool count** (14 days, number of distinct tool types used each day) | All resources |
| 31 | **Protein target gap** (average daily gap from target over 7 days) | Meal logs |
| 32 | **Check-in trend slope** (linear regression over 14 days, normalized -1 to 1) | Check-in logs |
| 33 | **Sentiment deviation** (average note sentiment over 14 days, -1 to 1) | Check-in notes (LLM-scored) |
| 34 | **Streak integrity** (longest streak length, capped at 14) | Habit + check-in logs |
| 35 | **Activity entropy** (Shannon entropy of tool type distribution over 14 days) | All resources |

Total: 36 dimensions per signature. This is small enough for cosine
similarity to work reliably, large enough to capture the primary
behavioral dimensions.

---

## 2. Representation: Natural-Language Description → Text Embedding

### Recommendation: Hybrid approach

After evaluating DTW, feature vectors, and text embeddings (see research
notes below), the recommended approach is a **hybrid: LLM-generated
natural-language summary → text embedding** as the primary comparison
method, with the 36-dimensional feature vector as a secondary filter.

### Why text embedding wins for this use case

| Criterion | DTW | Feature vector | Text embedding (recommended) |
| :--- | :--- | :--- | :--- |
| **Handles variable-length periods** | ✅ Yes (inherent) | ❌ No (must pad/truncate) | ✅ Yes (LLM summary is fixed-length text regardless of input length) |
| **Interpretable** | ❌ No (distance score tells you nothing) | ❌ No (vector dimensions are numeric) | ✅ Yes ("similar to the pre-physics-failure pattern" can be read) |
| **Works with <20 samples** | ⚠️ Yes but overfits easily | ⚠️ Yes but curse of dimensionality | ✅ Yes (embedding space is robust at small n) |
| **Cheap to compute** | ❌ O(n²) per comparison | ✅ O(n) | ⚠️ Requires LLM call to generate summary per signature, but only ~2 calls per week |
| **Can incorporate qualitative data** | ❌ No (numeric only) | ❌ No (numeric only) | ✅ Yes (notes, article titles, check-in text all included) |

### How it works

**Step 1 — On each Root Cause conclusion, generate a signature.**

The LLM that conducted the Root Cause interview also produces a
200-300 character natural-language summary of the pre-failure period:

```
Input: The structured data from the 14 days before the failure,
       plus the Root Cause conclusion.

Output: A paragraph describing the behavioral pattern.

Example output for the bad-race pre-period:
"Pre-race week: 3 heavy lifting sessions, 0 sprint sessions.
Check-ins declining from 4-5 to 2-3 over 7 days. Protein averaged
110g against 150g target with a 400-calorie deficit on race-eve.
No sleep complaints in notes but energy descriptors shifting from
'good' to 'tired.' Priorities showing training consistency in the
gym but absence of sport-specific execution. Last recorded race
pace calculation was 12 days prior."
```

**Step 2 — Embed the summary.**

Pass the summary through the same embedding model enry.agent already
uses for resource search (bge-m3 via NIM, based on the existing
`generateEmbedding` in `src/lib/embeddings.ts`). This produces a
1024-dimension embedding vector.

**Step 3 — Store the signature.**

Save to a new `failure_signatures` table with:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "root_cause_id": "uuid",          // FK to root_cause conclusion
  "failure_type": "bad_race",       // domain
  "failure_date": "2026-03-22",
  "embedding": [...],               // 1024-dim vector from bge-m3
  "summary": "Pre-race week: 3 heavy lifting sessions...",
  "feature_vector": [...],          // 36-dim numeric vector
  "created_at": "2026-03-22T..."
}
```

**Step 4 — On each new day (or week), generate a "current state"
summary.**

Same process: take the last 14 days of Henry's data, generate a
summary in the same format, embed it, and compare against all stored
signatures.

### Why this specific approach

1. **Existing infrastructure.** The app already uses bge-m3 embeddings
   via NIM for resource search (see `src/lib/embeddings.ts` and
   `src/app/api/cron/daily-content/route.ts`). No new model stack.

2. **Interpretable comparison.** When the system surfaces a match, it
   can show Henry *why* by displaying the matching summary text.
   "Your current pattern looks like the week before your April race
   failure" is concrete and useful. A similarity score alone would
   not be.

3. **Invariant to minor data gaps.** If Henry skipped logging for a
   day, the LLM can note "1 day with no logging" in the summary
   without breaking the embedding. DTW would require interpolation.
   The feature vector would need zero-filling logic.

4. **Qualitative signal capture.** The summary can include things the
   feature vector cannot: specific note language shifts ("'tired'
   appears 3x more than 'focused' in the last 5 days"), article topic
   changes ("saved 3 articles about LLM architecture but 0 about
   training"), and contextual factors ("Spanish was the lowest- ranked
   priority in the profile").

### Research Note: Why not DTW

DTW (Dynamic Time Warping) is the standard academic approach for time
series similarity. It was rejected for these reasons:

- **Worst-case O(n²) per comparison.** With n=14 (days) it's
  computationally fine (14² = 196 operations), but the real issue is
  that DTW produces a raw distance score that's hard to threshold.
  What does "DTW distance = 0.37" mean? Without a large training set
  to calibrate thresholds, the score is uninterpretable.
- **Numeric-only.** DTW cannot incorporate qualitative data (note
  sentiment, article topics, profile priorities). For a system that
  needs to detect subtle behavioral shifts, losing qualitative signal
  is unacceptable.
- **Sequence length dependency.** DTW handles variable lengths, but
  the alignment path can be misleading — two 14-day windows that look
  similar in shape may be warped into alignment when they shouldn't
  be (e.g., one had a flat check-in line and the other had a dip that
  got stretched to match).

### Research Note: Why not pure feature vector

The 36-dimensional feature vector is kept as a SECONDARY comparison
method for two reasons:

1. **Cheap pre-filter.** Feature vector cosine similarity is O(1) per
   comparison. We can use it to filter the 10 nearest candidates
   before re-ranking them with the text embedding comparison. This
   makes the system fast even with 100+ stored signatures.

2. **Fallback when LLM is unavailable.** If the embedding service is
   down, the feature vector alone provides a rough comparison. Not as
   good, but the system degrades gracefully instead of failing.

---

## 3. Similarity Threshold — How Similar Is Similar Enough?

### The similarity scoring pipeline

```
Current state summary
        │
        ▼
  Embedder (bge-m3) ──→ 1024-dim vector ──┐
                                           │
                                           ▼
                    Cosine similarity against all stored signatures
                                           │
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
             score > 0.85          0.70 < score < 0.85     score < 0.70
                    │                      │                      │
                    ▼                      ▼                      ▼
            SURFACE MATCH          SURFACE WITH              DO NOT SURFACE
            (high confidence)      "POSSIBLE MATCH"          (not similar enough)
                                   label + require user
                                   confirmation
```

### Threshold guidance

| Threshold | Label | Behavior | False positive risk |
| :--- | :--- | :--- | :--- |
| **> 0.85** | "Similar pattern detected" | Surface the matching root cause to Henry. Pre-fill its context in the Root Cause interview: "The data pattern right now looks like what happened before your April race. Want to run a Root Cause on this?" | Low. Above 0.85 in bge-m3 embedding space with ~200-char summaries indicates genuine structural similarity. |
| **0.70 – 0.85** | "Possible match" | Surface with reduced confidence language. "Your current pattern is somewhat similar to the pattern before X. It may not be the same thing." Require Henry to explicitly confirm before running a Root Cause. | Medium. The 0.70-0.85 range catches relevant patterns but also catches coincidental similarities from normal weekly cycles (school week patterns look similar to each other). |
| **< 0.70** | No match | Do not surface. The current period is not similar enough to any past period to justify a comparison. | Low. At < 0.70, any match would be noise. |

### Why these thresholds

The bge-m3 model produces embeddings in a high-dimension space (1024
dimensions) where cosine similarity scores tend to cluster in the
0.5-0.9 range for related content. Research on text embedding similarity
for short-form summaries shows:

- **≥ 0.90** — Almost certainly the same event or pattern (rare with
  pre-failure summaries because no two weeks are identical)
- **0.85 – 0.90** — High confidence of shared structure (same tool
  usage shape, similar check-in trajectory, comparable note sentiment)
- **0.75 – 0.85** — Meaningful similarity in some dimensions but
  differences in others
- **0.60 – 0.75** — Noise level: normal weekly variation, similar
  days of week, nothing diagnostically meaningful
- **< 0.60** — Different pattern entirely

### Calibration over time

These thresholds are starting points. They must be calibrated against
actual usage:

1. **Every time Henry runs a Root Cause that was triggered by a
   signature match**, record whether the Root Cause conclusion
   CONFIRMED or DISCONFIRMED the pattern. This is a labeled data point.

2. **After 10 such labeled points**, re-calibrate the thresholds.
   If confirmed matches cluster at 0.78, lower the "possible match"
   threshold to 0.78. If false positives cluster at 0.72, raise the
   threshold above that.

3. **The threshold should drift toward Henry's personal baseline.**
   A pre-canned threshold that works for everyone works for no one.

### The false positive tax

Every time the system surfaces a signature match that Henry confirms
is NOT actually the same pattern, the system pays a credibility cost.
If this happens 3+ times, Henry will start ignoring the feature.

**Rules to prevent this:**
- Never surface a match at < 0.70. The cost of a false positive is
  higher than the cost of a missed detection.
- Always show the matching summary text, not just a similarity score.
  Henry must be able to judge for himself whether the match is real.
- First-match delay: The first time a pattern reaches > 0.85, wait
  24 hours before surfacing. A pattern that persists for 2 days is
  more credible than a one-day spike.

---

## 4. Avoiding Over-Fitting to Noise

### The cold-start trap

With zero past failures, every 14-day window will look like a pattern.
With one past failure, every 14-day window will look somewhat like it
(because Henry's life has weekly structure — school, practice, rest
days — that repeats every 7-14 days).

**The minimum data requirement:**
- **Do NOT enable signature matching until 3+ Root Causes have been
  completed.** Before that, the feature is a repository of signatures
  but does NOT compare against them.
- **Do NOT surface a match until 10+ days have passed since the
  failure date.** The first 10 days after a failure are when Henry is
  most likely to self-correct — a pattern that looks like the failure
  period during this time is probably "returning to baseline," not
  "heading toward another failure."
- **Require 5+ data points per dimension in the 14-day window.**
  If the check-in was only logged on 2 of 14 days, the check-in trend
  dimension (32) is invalid — set it to 0 (neutral) and reduce the
  weight of that dimension in the comparison.

### Structural vs. behavioral similarity

The most common false positive will be: "The current week looks like
last month's pre-failure week because... it's Tuesday through Friday,
which looks like any other Tuesday through Friday."

**Solution:** The feature vector includes `activity entropy` (dimension
35) and `toolCountPerDay` (dimensions 17-30) which capture the
*diversity* of activity. A normal school week has a specific tool
diversity pattern (flashcards on school days, workouts on practice
days, minimal on weekends). A pre-failure week has a different pattern
(some tools drop off while others remain). The embedding model learns
this distinction from the summary text.

**Hard rule:** If the feature vector similarity is < 0.70 but the
text embedding similarity is > 0.85, DO NOT surface the match. Text
embeddings can be fooled by stylistic similarity in the summary
language. The feature vector acts as a grounding signal.

### The "one similar dimension" trap

If check-in trend slopes match (both declining) but everything else is
different (different tool usage, different nutrition, different sleep),
the text embedding should diverge because the summary captures all
dimensions.

**But** with only 36 dimensions in the feature vector, cosine similarity
can be inflated by one or two matching dimensions while 34 others
mismatch. The text embedding, operating on a 200+ word summary, is
less susceptible to this because the summary compresses all dimensions
into dense text.

**Defense:** Require BOTH the feature vector AND the text embedding
to agree at above their respective thresholds before surfacing.

### Statistical significance with small n

With only 3-10 stored signatures, any comparison will have a best
match. The question is whether that best match is actually similar or
just the least-dissimilar option available.

**Solution:** Compare the best-match similarity score to the average
similarity of all stored signatures. If the best match is within 1
standard deviation of the mean, it's not a meaningful match — the
current pattern is equally similar to all past patterns, meaning
there's no specific pattern to surface.

```
meanSimilarity = average(cosine_sim(current, all_signatures))
stdSimilarity  = standard_deviation(cosine_sim(current, all_signatures))

if bestMatch.score > (meanSimilarity + 2 * stdSimilarity):
    SURFACE  // The best match is meaningfully better than average
else:
    DO NOT SURFACE  // Current pattern is equally similar to everything
```

This is a conservative filter. With only 5 stored signatures, a best
match needs to be 2 standard deviations above the mean — which
requires it to be noticeably closer than the others.

---

## 5. Cold Start Problem

### What the feature does with zero past root causes

**Phase 0: Collection (0 Root Causes completed)**

- **What the system does:** Listens. Every tool-logged day is stored in
  the daily activity vectors (the 36-dim feature vector is cheap to
  compute and can be generated as a background job for every 14-day
  window). No signatures are generated because there are no Root Cause
  conclusions to tie them to.
- **What the user sees:** Nothing. The feature is invisible.
- **Backend prep:** The `failure_signatures` table exists and receives
  daily feature vectors tagged with `failure_type: "monitoring"` and
  `root_cause_id: null`. These are practice data for calibrating the
  similarity distribution before any real matches need to be surfaced.

**Phase 1: First Signature (1 Root Cause completed)**

- **What the system does:** Generates the first real signature (text
  summary + embedding + feature vector). Starts comparing new daily
  windows against it. Does NOT surface any matches — the minimum data
  requirement (3 Root Causes) is not met.
- **What the user sees:** Nothing. The signature is generated
  invisibly after the Root Cause conclusion is saved.

**Phase 2: Minimum Viable (3 Root Causes completed)**

- **What the system does:** Begins computing similarity for each new
  daily window against the 3 stored signatures. Enables threshold
  comparison with the `mean + 2*std` guardrail. With 3 signatures,
  the guardrail is weak but functional.
- **What the user sees:** No proactive surfacing yet. The feature page
  (accessible via command palette "Failure Signatures") shows a
  read-only list of past signatures with their summaries. This is
  discoverable but not interruptive.

**Phase 3: Active (5+ Root Causes completed)**

- **What the system does:** Full active monitoring. Each new daily
  window is compared against all stored signatures. Matches above
  threshold are surfaced as notification candidates.
- **What the user sees:** When a match is detected, the first
  notification appears in the briefing (Chief of Staff) as a subtle
  observation: "Your current pattern is similar to what preceded your
  April race failure. Worth running a Root Cause?"

### The slow-roll strategy

The feature deliberately ramps up slowly:
- **Week 1-4:** No visible feature. Collecting signatures.
- **Week 5-8:** Read-only signature library. No proactive matches.
- **Week 9+:** Proactive matching begins. First matches are surfaced
  with the "Possible match" label and require user confirmation.

This prevents the worst cold-start outcome: the feature detecting a
"pattern match" on day 2 and calling Henry's attention to nothing.

### Fallback: What if Henry never runs enough Root Causes?

If after 8 weeks of usage Henry has completed 0 Root Cause interviews,
the failure signature feature cannot function. In that case:

1. **The feature page shows:** "Root Cause investigation has not been
   used yet. Failure Signatures are built from Root Cause conclusions.
   Run your first Root Cause to enable this feature."
2. **No proactive surfacing.** The system does not attempt to match
   against an empty library.
3. **Alternative entry point:** The system can generate a "signature"
   from any significant event Henry logs — a bad race result (12.5 vs
   PR 12.1), a grade drop (87 to 78), a long project gap. These
   events have anchored data points even without a Root Cause
   conclusion. The signature is weaker (no conclusion to tie it to)
   but still usable.

**Recommended path:** Allow signature generation from any notable
negative event, even without a Root Cause conclusion. Prefix the
signature summary with "No root cause identified for this event" so
the system is transparent about what it has (data) and what it
doesn't have (analysis).

---

## 6. Storage Schema

### New table: `failure_signatures`

```sql
CREATE TABLE failure_signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),

  -- Connection to Root Cause (nullable — signatures can exist for
  -- notable events that didn't go through a full Root Cause)
  root_cause_id  UUID REFERENCES root_causes(id) ON DELETE SET NULL,

  -- Metadata
  failure_type   TEXT NOT NULL CHECK (failure_type IN (
    'bad_race', 'missed_grade', 'killed_project',
    'broken_streak', 'training_regression', 'monitoring', 'notable_event'
  )),
  failure_date   DATE NOT NULL,   -- date of the failure event
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The signature data
  embedding      VECTOR(1024),    -- bge-m3 embedding of the summary
  summary        TEXT NOT NULL,    -- 200-300 char natural-language summary
  feature_vector REAL[36],        -- 36-dim numeric feature vector

  -- For monitoring/non-failure windows: tagged as monitoring type
  is_active      BOOLEAN NOT NULL DEFAULT true
);

-- Index for similarity search
CREATE INDEX idx_failure_signatures_user ON failure_signatures(user_id);
CREATE INDEX idx_failure_signatures_embedding
  ON failure_signatures
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 5);
-- Note: pgvector ivfflat index. With <100 rows per user, a full scan
-- is fast enough — the index is future-proofing for scale.
```

### New table: `root_causes` (expanded from Root Cause doc)

```sql
CREATE TABLE root_causes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  failure_type    TEXT NOT NULL,
  failure_date    DATE NOT NULL,
  root_cause      TEXT NOT NULL,    -- one sentence
  evidence        TEXT NOT NULL,    -- one sentence citing data
  action          TEXT,             -- one sentence, nullable for external
  is_external     BOOLEAN NOT NULL DEFAULT false,
  is_normal_variance BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. Similarity Comparison: Detailed Workflow

### Daily check (background job or on page load)

```
1. Get the last 14 days of data for Henry

2. Compute the 36-dim feature vector for this window
   (cheap — pure math, no LLM call)

3. Compare feature vector against all stored signatures:
   for each signature:
     cosine_sim = cosineSimilarity(currentVector, signature.featureVector)
   sort by cosine_sim descending

4. If best cosine_sim > 0.60:
     Continue to step 5 (text comparison)
   Else:
     Stop — not similar enough to warrant an LLM call

5. Generate text summary for current window (one LLM call)

6. Embed the current summary using bge-m3 (one API call, ~200ms)

7. Compare embedded summary against all stored signatures:
   for each signature:
     text_sim = cosineSimilarity(currentEmbedding, signature.embedding)

8. If text_sim > 0.85 AND feature_vector_best > 0.70:
     SURFACE match with high confidence
   Elif text_sim > 0.70 AND feature_vector_best > 0.60:
     SURFACE match with "Possible match" label
   Else:
     Do not surface

9. Store the current 36-dim feature vector as a monitoring-type
   signature (if not already stored today)
```

### Cost per comparison

| Operation | Cost | Frequency |
| :--- | :--- | :--- |
| Compute 36-dim feature vector | Free (pure math) | Once per day |
| Cosine similarity against N signatures (feature vector) | O(N) × 36 operations | Once per day |
| LLM summary generation | ~500 tokens | Only when feature vector passes 0.60 threshold |
| bge-m3 embedding | ~200ms API call | Only when feature vector passes threshold |
| Cosine similarity against N signatures (text embedding) | O(N) × 1024 operations | Only when above threshold |

**Expected cost per day:** Free on 95% of days (feature vector filter
catches most windows as not similar enough). ~2 cents on the 5% of
days where a match is detected.

---

## 8. Design Principles

### Principle 1: Signatures are evidence, not predictions

The failure signature does NOT predict that a failure will happen. It
says: "This pattern of behavior is similar to the pattern that preceded
a past failure." The system surfaces a comparison, not a forecast.

This distinction is critical for trust. If Henry thinks the system is
predicting failure, he'll be anxious about false predictions. If he
understands it's showing him *historical precedent*, he'll use it as
a decision aid.

### Principle 2: Show the data, not the score

Never show Henry a similarity score. Show him the matching summary and
let him decide.

```
❌ Bad: "90% pattern match with pre-race failure"
✅ Good: "Your current week looks similar to the week before your April
         100m race. Here's why: 3 lifting sessions, 0 sprint sessions,
         check-ins declining from 4s to 3s, protein under target."
```

### Principle 3: The absence of a match is not the absence of a problem

If the system finds no matching signature, that doesn't mean Henry is
fine. It means this particular pattern hasn't been seen before. He
could still be heading toward a novel failure that doesn't match any
past pattern.

The signature feature is a complement to the Chief of Staff briefing
and the Root Cause interview — not a replacement. The briefing may
spot a problem the signatures don't.

### Principle 4: Signatures expire

A signature from 6 months ago is less relevant than one from 3 weeks
ago. Henry's habits change, his schedule changes, his training phase
changes.

**Expiration policy:**
- Signatures older than 3 months are excluded from active comparison
  (but remain visible in the signature library for manual review)
- If a Root Cause conclusion surfaces the SAME root cause as a
  signature from 3+ months ago, the old signature is reactivated
  (the pattern generalizes)
- A signature is automatically promoted to "generalized pattern" if
  it matches 3+ distinct failure events (e.g., "meet-week lifting
  without sprint work" matching 3 different races)

---

## 9. Implementation Phases

### Phase 0: Data collection (no user-facing feature)

- Add the `failure_signatures` table
- Compute daily 36-dim feature vectors for every 14-day window
  (background job, no LLM calls, no text summaries)
- Store as `failure_type: 'monitoring'` signatures
- This builds the baseline distribution for threshold calibration

### Phase 1: Signature creation on Root Cause (no matching)

- On each Root Cause conclusion, generate the text summary + embedding
  + feature vector for the 14 days before the failure
- Store as `failure_type: <domain>` signature
- Signature library visible read-only to Henry

### Phase 2: Passive matching (surfacing via Chief of Staff)

- Enable daily comparison of current window against stored signatures
- When a match is detected (> threshold), include an observation in
  the Chief of Staff briefing: "Your current pattern is similar to
  what preceded X. Worth investigating?"
- No separate notification system — the briefing is the notification

### Phase 3: Active matching (dedicated UI)

- A "Signatures" tab or page showing:
  - Past signatures (read-only, with root cause context)
  - Current similarity readings for each active signature
  - "Match detected" cards with comparison summaries
- Surface pre-filled Root Cause triggers from signature matches
  ("This pattern looks like X. Run a Root Cause?")

---

## 10. Quick Reference Card

```
┌─ DATA DIMENSIONS (36-dim feature vector) ──────────────────────┐
│  0      Diet phase                           (profile)         │
│  1      Days since last race                 (race_pace)       │
│  2      Days until next deadline             (countdown)       │
│  3-16   Daily check-in ratings (14 days)     (checkin)         │
│  17-30  Daily tool count (14 days)           (all resources)   │
│  31     Protein target gap (7-day avg)       (meal)            │
│  32     Check-in trend slope (-1 to 1)       (checkin)         │
│  33     Sentiment deviation (-1 to 1)        (notes)           │
│  34     Longest streak length (0-14)         (habits/checkin)  │
│  35     Activity entropy (tool diversity)    (all resources)   │
└────────────────────────────────────────────────────────────────┘

┌─ COMPARISON METHOD ────────────────────────────────────────────┐
│  PRIMARY:     Text summary → bge-m3 embedding → cosine sim    │
│  SECONDARY:   Feature vector → cosine sim (pre-filter)         │
│  BOTH must agree above threshold to surface.                   │
└────────────────────────────────────────────────────────────────┘

┌─ THRESHOLDS (starting — calibrate over time) ─────────────────┐
│  > 0.85    Surface as high-confidence match                   │
│  0.70-0.85 Surface as "Possible match" (requires confirmation) │
│  < 0.70    Do not surface                                     │
│                                                                  │
│  Plus guardrail: bestMatch > mean + 2*std of all scores         │
└────────────────────────────────────────────────────────────────┘

┌─ COLD START PHASES ────────────────────────────────────────────┐
│  Phase 0 (0 RCs):     Collect monitoring data, no feature      │
│  Phase 1 (1 RC):      Generate first signature, no matching    │
│  Phase 2 (3 RCs):     Passive matching via briefing            │
│  Phase 3 (5+ RCs):    Active matching, dedicated UI            │
└────────────────────────────────────────────────────────────────┘

┌─ OVER-FITTING DEFENSES ────────────────────────────────────────┐
│  1. Minimum 3 RCs before any matching                          │
│  2. 10-day delay after failure before enabling comparison      │
│  3. Feature vector + text embedding must AGREE                 │
│  4. Best match must exceed mean + 2σ of all scores             │
│  5. First match at >0.85: wait 24 hours before surfacing       │
│  6. Signatures expire after 3 months                           │
└────────────────────────────────────────────────────────────────┘

┌─ NEVER DO ─────────────────────────────────────────────────────┐
│  ❌ Show similarity scores to the user                          │
│  ❌ Predict that a failure WILL happen                          │
│  ❌ Surface matches before 3 RCs exist                          │
│  ❌ Use DTW for comparison (overfits, uninterpretable)          │
│  ❌ Mix monitoring and failure signatures in same comparison    │
│  ❌ Surface a match without showing the reasoning (summary)     │
└────────────────────────────────────────────────────────────────┘
```
