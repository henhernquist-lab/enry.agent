# Style Extraction Methods — Ghost Mode

> Given a corpus of one person's writing from a specific 6-week window,
> characterize their writing style in a way an LLM can imitate.
>
> Read-only research and design doc. No code changes.

---

## 1. Measurable Features That Capture "Voice"

### The feature taxonomy

Writing voice lives at four levels. Each level has measurable features.
A style extraction that operates at only one level produces a flat,
caricatured imitation. A good extraction operates at all four.

### Level 1: Micro-rhythm (subconscious, hardest to fake)

These features are below conscious control. They're the linguistic
equivalent of a runner's gait — you might not know you do them, but
they're detectable across your writing.

| Feature | How to measure | Signal strength |
| :--- | :--- | :--- |
| **Sentence length distribution** | Compute sentence lengths across the corpus, plot the histogram. Not the average — the SHAPE. Does the distribution cluster around a tight range (14-18 words) or spread across 4 to 40? A single average loses the shape. | High. Sentence length distribution is one of the most stable per-author features across topics. |
| **Clause depth** | Average number of clauses per sentence. Simple (1 clause) vs. compound (2-3) vs. complex (3+). Teenage writers tend toward either very simple or very complex with run-on clauses. | Medium. Varies by topic — technical writing has different clause structure than journaling. |
| **Function word frequency** | "the," "and," "of," "to," "a," "in," "is," "that," "for," "it," "as," "was," "with," "but," "on." These are the Burrows Delta features — the most established authorship signal in stylometry. Henry's function word frequencies vs. population baseline is measurable. | Very high. Function word usage is topic-independent and highly stable per author. |
| **Punctuation density** | Commas per sentence, semicolons per 100 words, em-dash frequency, ellipsis frequency, exclamation mark frequency. A writer who uses em-dashes — like this — has a different voice than one who uses parentheticals (like this). | High. Punctuation habits are among the most consistent per-author signals. |
| **Capitalization patterns** | Frequency of ALL CAPS emphasis, frequency of capitalizing words that shouldn't be capitalized (typos vs. stylistic choice), frequency of lowercase sentence starts (common in informal writing). | Medium. Domain-dependent — chat is different from notes. |

### Level 2: Word choice (conscious but habitual)

These features are partly conscious but tend to settle into habits.

| Feature | How to measure | Signal strength |
| :--- | :--- | :--- |
| **Vocabulary richness (Type-Token Ratio)** | Unique words ÷ total words. A TTR of 0.6 means 60% of words are unique — higher is richer. But TTR is sensitive to corpus length (longer texts always have lower TTR). Use MATTR (Moving Average TTR) for a length-independent measure. | Medium. High variance by topic. Technical writing has narrower vocabulary than journaling. |
| **Hedging frequency** | "maybe," "perhaps," "probably," "kinda," "sort of," "a bit," "I think," "I guess," "I feel like." A writer who hedges constantly has a different voice than one who states things as fact. | High. Hedging is a stable personality marker. |
| **Intensifier frequency** | "very," "really," "extremely," "so," "totally," "literally," "actually," "honestly." Opposite of hedging — the writer who says "so good" vs. "good." | Medium. Correlated with age. Teenagers use more intensifiers. |
| **Contraction ratio** | "don't" vs. "do not," "can't" vs. "cannot," "I'm" vs. "I am." Contractions signal informality. The ratio is stable per author for a given register. | High. Contraction ratio is very consistent within the same register. |
| **Characteristic bigrams** | Two-word phrases the author uses more frequently than the population (e.g., "to be honest," "the thing is," "at the end of the day"). These are authorial tics. Detect by comparing bigram frequency in the corpus vs. a general baseline. | Very high. Characteristic bigrams are the most individually identifying feature. |

### Level 3: Structural habits (composition-level)

These features define how the author organizes their writing.

| Feature | How to measure | Signal strength |
| :--- | :--- | :--- |
| **Sentence opener distribution** | What part of speech starts the sentence? Pronoun ("I think"), conjunction ("But the thing is"), adverb ("Interestingly,"), preposition ("After practice"), gerund ("Running track..."). The distribution is highly author-specific. | High. Sentence openers are one of the most distinguishing features in forensic linguistics. |
| **Paragraph length** | Average paragraph length in sentences. A writer who writes single-sentence paragraphs vs. 5-sentence blocks has different pacing. | Medium. Varies by medium (chat vs. note vs. article). |
| **Topic introduction pattern** | How does the author introduce a new topic? With a question ("So here's the thing..."), a statement ("I was thinking about X"), a reference ("Remember that thing we talked about?"). | Medium. Good for distinguishing chat from notes. |
| **Narrative distance** | First person ("I did"), second person ("you know"), third person ("one would think"). First-person frequency is very stable per author. | High. First-person pronoun frequency is a stable authorial signature. |

### Level 4: Content signature (what they choose to write about)

This is not "how" they write — it's "what" they write about — but it's
critical for rendering a convincing persona.

| Feature | How to measure | Signal strength |
| :--- | :--- | :--- |
| **Topic distribution** | What topics appear in the corpus? Training, school, projects, food, people? The proportional mix — not just presence — is important. | High for persona realism. A persona that talks about training 80% of the time when the real corpus shows 40% training is wrong. |
| **Topic enthusiasm markers** | Does the author write longer sentences about training than about homework? Use sentence length per topic as a proxy for engagement. | Medium. Useful signal for what the persona should sound excited about. |
| **Self-reference patterns** | "I," "my," "me" vs. "we," "our," "us." A writer who frames things individually vs. collectively. | High. Stable per author across topics. |

### What NOT to extract

| Feature | Why it's noise |
| :--- | :--- |
| **Readability scores** (Flesch-Kincaid, etc.) | Designed for assessing text difficulty, not author identity. Two authors at the same readability level can have completely different voices. |
| **Spelling errors** | Too dependent on device, autocorrect, and alertness level. Not a stable signal. |
| **Time of writing** | Interesting for behavioral analysis, not for voice. The 3am vs. 3pm distinction says nothing about writing style. |

---

## 2. Programmatic Extraction vs. LLM Description

### Two approaches evaluated

| Approach | How it works | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **Programmatic** | Compute the 20+ metrics above using JavaScript/TypeScript in the backend. Output a structured JSON object with sentence length distribution, function word frequencies, hedging rate, etc. | - Deterministic, reproducible
- Cheap (pure math, no API calls)
- Not subject to LLM hallucination
- Easy to compare across windows | - Captures micro-rhythm well but misses structural habits
- No understanding of topic engagement or narrative distance
- Produces numbers that humans can't review for quality
- Requires manual thresholds |
| **LLM Description** | Pass the corpus to an LLM with a prompt asking it to describe Henry's writing style in natural-language prose. Output a paragraph describing his voice. | - Captures all 4 levels simultaneously
- Produces human-reviewable output
- Can note things no metric would catch ("his tone shifts when talking about food vs. training")
- Cheap to run (1000 tokens per window) | - Non-deterministic — same corpus produces different descriptions
- Subject to LLM bias (defaults to describing an "average" style)
- May miss micro-rhythm features the LLM doesn't notice
- Quality depends on the prompt |

### Recommendation: Hybrid (programmatic extraction → LLM enrichment)

**Step 1 — Programmatic extraction** (backend, free, deterministic)

Compute these metrics from the corpus:

```json
{
  "sentenceLength": {
    "mean":  13.4,
    "median": 12.0,
    "std":    7.2,
    "percentiles": [4, 7, 12, 18, 35],
    "distribution": [
      { "range": "1-5", "pct": 8 },
      { "range": "6-10", "pct": 22 },
      { "range": "11-15", "pct": 31 },
      { "range": "16-20", "pct": 20 },
      { "range": "21-30", "pct": 14 },
      { "range": "31+", "pct": 5 }
    ]
  },
  "sentenceOpeners": {
    "pronoun": { "pct": 51, "examples": ["I", "It", "You", "We", "That"] },
    "conjunction": { "pct": 18, "examples": ["But", "And", "So", "Or", "Because"] },
    "adverb": { "pct": 10, "examples": ["Honestly", "Probably", "Actually", "Just"] },
    "preposition": { "pct": 12, "examples": ["At", "After", "During", "Before", "In"] },
    "other": { "pct": 9, "examples": ["Running", "Trained", "Got", "Went"] }
  },
  "functionWords": {
    "i": 0.041, "the": 0.038, "and": 0.031, "to": 0.029, "a": 0.026,
    "of": 0.018, "was": 0.017, "it": 0.016, "my": 0.015, "that": 0.014
  },
  "hedging": {
    "frequency_per_1000_words": 12.3,
    "top_hedges": ["I think", "probably", "kinda", "maybe", "I guess"]
  },
  "intensifiers": {
    "frequency_per_1000_words": 18.7,
    "top_intensifiers": ["really", "so", "literally", "very", "actually"]
  },
  "punctuation": {
    "commas_per_100_words": 4.2,
    "em_dashes_per_1000_words": 1.1,
    "exclamation_per_1000_words": 3.4,
    "ellipses_per_1000_words": 0.8
  },
  "contraction_ratio": 0.87,
  "first_person_rate": 0.62,
  "topicMix": {
    "training": 0.35,
    "school": 0.28,
    "projects": 0.20,
    "food": 0.10,
    "other": 0.07
  },
  "topicEngagementDeltas": {
    "training": +0.8,
    "projects": +0.5,
    "school": -0.3,
    "food": -0.2
  },
  "corpus_stats": {
    "total_tokens": 3400,
    "total_samples": 47,
    "sample_types": ["checkin_notes", "quick_notes", "chat_messages", "article_notes"]
  }
}
```

**Step 2 — LLM enrichment** (1 cheap call per window)

Pass the programmatic metrics + the raw writing samples to an LLM
with this prompt:

```
You are a writing analyst. Given a corpus of writing samples and
programmatic style metrics, produce a 3-4 sentence description of
the author's writing voice. Focus on what the metrics don't capture:
rhythm, tone shifts, characteristic phrases, emotional range, and
anything that makes this voice distinct from an "average" writer.

Metrics:
{programmatic_metrics_json}

Writing samples:
{3-5 representative samples, carefully selected to span
the topic and emotional range of the corpus}

Rules:
- Describe what IS, not what ISN'T. "They write in short sentences"
  not "They don't write long sentences."
- If the voice has topic-dependent shifts, note them: "Their training
  notes are terse and factual. Their project notes are longer and more
  exploratory."
- Do not editorialize about quality. "The writing is good" or "poor"
  is irrelevant.
- Do not compare to a standard. "Above average" or "below average"
  is irrelevant.
- Be specific. Not "uses varied sentence length" but "sentences
  range from 4 to 35 words, clustering around 12 words, with the
  shortest sentences occurring in check-in notes."
- If the corpus is too small to draw reliable conclusions, say so.
  "This corpus has only 340 tokens — voice analysis is preliminary."
```

**Step 3 — Combine into the final voice description**

```json
{
  "voiceDescription": "Henry's writing from this window is direct and
   declarative. Sentences average 13 words but range from 4-word
   fragments in check-in notes to 35-word explorations in project
   notes. He writes in first person 62% of the time. His top hedges
   are 'I think' and 'probably' but both appear less often when he's
   writing about training — training notes are the most fact-assertive
   part of the corpus. He uses 'honestly' as a sentence opener 4x more
   often than the average writer, usually to preface a self-critical
   observation. Topic engagement delta shows longer sentences and
   fewer hedges when writing about projects and training, shorter
   sentences and more hedges when writing about school. Characteristic
   bigrams: 'to be fair,' 'the thing is,' 'I feel like,' 'honestly
   though.' The voice reads as someone who thinks fast, writes fast,
   and is still figuring out what they think while they write it.",

  "writingSamples": [
    "honestly just need to stop lifting the week before meets. legs
     were dead at the start.",
    "I think the architecture should be: the LLM generates the meal
     plan, but there's a validation layer that checks macros before
     returning it. that way the model can't give me a plan that
     doesn't hit protein target.",
    "physics is fine. kinematics makes sense when I think about it
     but the formulas won't stick. flashcards help but I still have
     to re-derive everything during the test."
  ]
}
```

### Why hybrid beats either approach alone

| Scenario | Programmatic only | LLM only | Hybrid |
| :--- | :--- | :--- | :--- |
| **Very small corpus (3 notes)** | Metrics are meaningless. | LLM can still describe what it sees, but may over-interpret. | Programmatic metrics are flagged as unreliable; LLM is told to be conservative. |
| **Conflicting signals** | Metrics show one thing, but the LLM sees another — no way to resolve. | LLM may miss the statistical pattern entirely. | Metrics ground the LLM in reality; LLM adds nuance. |
| **Drift detection** | Easy to compare metrics across windows (deterministic). | Hard to compare prose descriptions. | Metrics power the comparison; LLM provides the narrative. |
| **Cost** | Free. | ~$0.002 per window. | ~$0.002 per window (LLM call for enrichment only). |
| **Interpretability** | Hard for humans to read. | Easy for humans to review. | Metrics for machines, prose for humans. |

---

## 3. Few-Shot Count — How Many Samples Are Needed?

### The sample size question

Style imitation quality as a function of corpus size is non-linear.
The key thresholds:

| Corpus size | Quality | What you get |
| :--- | :--- | :--- |
| **0 samples** | Zero. | No voice extraction possible. The persona will speak in the LLM's default voice. |
| **1 sample** | Poor. | The LLM over-indexes on that single sample's topic and tone. If the only sample is about training, the persona will sound like it only thinks about training. |
| **3 samples** | Fair. | The LLM can detect the author's voice if the samples span different topics. A training note + a check-in + a project note gives enough contrast. |
| **5 samples** | Good. | The LLM can identify stable features: sentence length, hedging, punctuation habits. Voice is recognizable but may lack subtlety. |
| **10 samples** | Very good. | The LLM can detect characteristic bigrams, topic-dependent tone shifts, and emotional range. Voice is genuinely imitative. |
| **20+ samples** | Excellent. | The LLM has enough data to avoid caricature. The voice feels natural across multiple conversational turns. |
| **50+ samples** | Approaching limit. | Diminishing returns per additional sample beyond this point for LLM-based imitation. |

### The "3 samples rule" for minimum viable Ghost Mode

**Minimum viable corpus: 3 writing samples spanning at least 2 topics.**

If the window has < 3 writing samples, Ghost Mode should still work
but should display a disclaimer:

> "This window has limited writing data. Henry's voice reconstruction
> may be less accurate than usual."

### Sample selection strategy (not random)

When choosing which samples to include in the LLM enrichment prompt,
DO NOT pick randomly or chronologically. Use this selection heuristic:

1. **Pick the longest sample.** This shows sentence structure and
   paragraphing at its most developed.
2. **Pick the most emotionally charged sample.** The check-in with
   the most extreme rating (1 or 5) with a note. This captures
   emotional voice — how Henry writes when he cares most.
3. **Pick a domain-neutral sample.** A note about logistics or
   planning. This captures the "default" voice without topic skew.
4. **Pick a chat message** (if available). Chat voice is different
   from note voice — shorter, more conversational, more hedges.
5. **Pick a project-related sample.** This captures voice when Henry
   is in his element — most confident, most technical.

If only 3 samples exist, pick 1, 2, and 3. If 8 exist, pick 4 or 5
to get better topic coverage.

### The "one sample on repeat" failure

If the corpus has 1 sample that appears 8 times (e.g., Henry wrote
"tired" in 8 consecutive check-in notes), the system must de-duplicate
before counting. 8 identical "tired" notes count as 1 sample for
style extraction purposes.

**De-duplication rule:** Two samples are duplicates if their cosine
similarity exceeds 0.95 (using the same bge-m3 embedding model the
app already uses). In practice, check-in notes like "tired," "sleepy,"
and "exhausted" should be treated as separate samples (they're
different words with different style markers), but "tired" × 8 should
be treated as 1.

---

## 4. Handling a Sparse Corpus

### The problem

Henry writes. But he doesn't write the same amount in every window.
A 6-week window might contain:
- 45 check-in notes (most with a single-word note)
- 12 quick notes (ranging from 10 to 200 words)
- 8 article note summaries (but those are AI-generated, not Henry's words)
- 3 chat messages

The total Henry-authored word count could be as low as 400 words.

### Strategy 1: Flag sparsity honestly

If the corpus has fewer than 500 Henry-authored tokens, modify the
voice description to state: `"Limited writing data — voice is based
on {N} samples totaling {M} words. Style may be approximate."`

And more importantly: **reduce the voice description's specificity.**
Instead of describing Henry's voice in detail, just note the most
salient feature and leave the rest default:

> "Henry's writing samples from this window are too limited for
> detailed voice extraction. Based on the available samples, his
> check-in notes are short and factual (average 6 words). For a
> more accurate reconstruction, choose a window with more writing
> activity."

### Strategy 2: Include chat messages as writing samples

If the window overlaps with chat history with enry.agent, include
Henry's chat messages as writing samples. Chat messages have
advantages:
- They're unedited (no autocorrect cleanup)
- They show conversational voice (most natural register)
- They span topics organically

**Caveat:** Chat messages with the app itself may have a different
tone than private notes. Henry might "perform" more in chat (be more
formal, more deliberate, less raw). When including chat messages, the
voice extraction should note: "Includes chat messages where tone may
differ from private notes."

### Strategy 3: Time-window expansion

If Henry wrote very little in the selected 6-week window, the system
can suggest expanding the window to capture more writing. The prompt
could say:

> "This window has limited writing data. Expanding the window by
> 2 weeks would include 8 more check-in notes and 3 more quick
> notes. Expand?"

This is a gentle nudge, not an auto-expansion. The user chose the
window for a reason — respect that choice but offer the alternative.

### Strategy 4: Use non-writing data as voice proxy

If there are ZERO writing samples but plenty of behavioral data
(workouts, meals, etc.), you can still produce a minimal voice
description:

> "Henry did not write any notes during this window. Voice
> reconstruction is based on behavioral data only: his check-in
> ratings average 3.8/5, his training was consistent (5 sessions
> per week), and his nutrition tracking was intermittent. Without
> writing samples, the persona's voice will default to Henry's
> typical register with topic knowledge limited to what the logged
> data shows."

### The sparsity decision tree

```
Writing samples in window?
  │
  ├── 0 samples → No voice extraction possible
  │               Use behavioral data only. Persona speaks in a
  │               neutral register with topic knowledge.
  │               Display: "No writing data for this window."
  │
  ├── 1-2 samples → Minimal voice extraction
  │               Single most salient feature extracted.
  │               Display: "Limited writing data."
  │
  ├── 3-5 samples → Standard voice extraction
  │               Full extraction using the hybrid method.
  │               Display: nothing (normal quality).
  │
  └── 6+ samples → Full voice extraction
                    Full extraction + characteristic bigram detection
                    + topic-dependent tone shift detection.
                    Display: nothing (normal quality).
```

---

## 5. Detecting and Preserving Style Drift

### The central insight of Ghost Mode

> Henry-in-February writes differently than Henry-in-September.
> The whole point of temporal snapshots is to capture this drift.
> If all windows produced the same voice, Ghost Mode would be a
> chatbot, not a time capsule.

### What drives style drift in a 14-year-old

| Drift driver | Timescale | Measurable signal |
| :--- | :--- | :--- |
| **Seasonal context** (track season vs. off-season vs. school year) | 3-4 months | Topic mix change. Track season writing has more training content. Off-season writing has more project content. Sentence length may increase off-season (more time for reflection). |
| **Skill development** (Henry gets better at writing, coding, or expressing himself) | 6-12 months | Vocabulary richness (MATTR) increases. Hedging may decrease as confidence grows. Topic mix shifts toward more technical/less emotional content. |
| **Life event** (new school, new coach, injury, project failure) | Weeks | Check-in sentiment drops. Writing becomes more reflective, more self-critical. Sentence length may increase (more processing in writing). Characteristic bigrams may shift ("used to say X, now says Y"). |
| **Tool change** (Henry starts writing notes differently, or in different tools) | Overnight | Sudden shift in sentence length, contraction ratio, or register. If he starts using quick notes instead of check-in notes, the writing may become longer and more structured. |
| **Maturation** (14-year-old Henry vs. 15-year-old Henry) | 12+ months | Subtle. Fewer intensifiers, more complex sentence structures, broader vocabulary. Harder to detect but more important. |

### How to measure drift across windows

**Method: Feature vector comparison across time-window signatures.**

Each window generates a style feature vector (the programmatic metrics
from §2, Step 1). Compare windows by computing the vector delta:

```typescript
// Style feature vector for each window
interface StyleVector {
  sentenceLengthMean: number       // 8-20
  sentenceLengthStd: number        // 3-10
  hedgingRate: number              // per 1000 words
  intensifierRate: number          // per 1000 words
  contractionRatio: number         // 0-1
  firstPersonRate: number          // 0-1
  functionWordIOffset: number      // deviation from population mean
  commaDensityPerWord: number      // per 1000 words
  emdashDensityPerWord: number     // per 1000 words
  exclamationDensityPerWord: number // per 1000 words
  topHedgeBigramFreq: [string, number]  // most frequent hedge + its frequency
}

// Compute drift between two windows
function computeDrift(v1: StyleVector, v2: StyleVector): DriftReport {
  // Weighted Euclidean distance by feature importance
  const weights = {
    sentenceLengthMean: 0.20,
    hedgingRate: 0.20,
    contractionRatio: 0.15,
    firstPersonRate: 0.15,
    emdashDensityPerWord: 0.10,
    // ... remaining features weighted by mutual information
  }

  const totalDrift = Object.entries(weights)
    .reduce((sum, [feature, weight]) => {
      const diff = Math.abs(v1[feature] - v2[feature])
      // Normalize diff by expected range of that feature
      return sum + weight * normalize(diff, featureRanges[feature])
    }, 0)

  // Identify which specific features drifted most
  const topDrivers = Object.entries(weights)
    .sort((a, b) => {
      const diffA = Math.abs(v1[a[0]] - v2[a[0]]) / featureRanges[a[0]]
      const diffB = Math.abs(v1[b[0]] - v2[b[0]]) / featureRanges[b[0]]
      return diffB - diffA
    })
    .slice(0, 3)
    .map(([feature]) => ({
      feature,
      description: driftDescriptions[feature],
      v1Value: v1[feature],
      v2Value: v2[feature],
    }))

  return {
    totalDrift,           // 0-1 scale
    significant: totalDrift > 0.35,  // threshold calibrated from data
    topDrivers,
    semanticDescription: generateDriftDescription(topDrivers, v1.windowDate, v2.windowDate)
  }
}
```

### What a drift report looks like to the user

When Henry opens a Ghost Mode window, he can also see how his writing
style has changed since then:

> "Your writing voice in September 2026 is different from March 2026.
> Key differences:
> - Sentences are longer (16 words vs. 12 words average)
> - You use fewer hedges ('I think,' 'probably' down 40%)
> - You use more technical vocabulary (MATTR up from 0.58 to 0.64)
> This suggests increased confidence and comfort with writing about
> technical topics over this period."

### When drift is too large to bridge

If Henry opens a window from 3 years ago, the persona may sound so
different that the reconstruction feels like a different person. In
this case, the system should notify:

> "This window is from {date}. Your writing style has changed
> significantly since then. The reconstruction will sound like the
> Henry from that period, not the Henry you are now. You may find
> the difference striking."

---

## 6. Failure Modes — What Makes AI Voice Imitation a Caricature

### Failure 1: Over-indexing on distinctive features

**The problem:** The LLM latches onto the most noticeable feature
("Henry uses 'literally' a lot") and overuses it in every response.
The persona says "literally" in every other sentence, turning a real
signal into a cartoon.

**Why it happens:** LLMs are trained to follow instructions. The
instruction "Henry frequently uses 'literally'" is an instruction to
use it frequently. The model doesn't naturally understand that
"frequently" means "1-2% of words, not 8%."

**How to fix it:** In the voice description, include rates, not labels.
Not "Henry uses 'literally' a lot" but "Henry uses 'literally'
approximately 1.2 times per 1000 words." This grounds the LLM in a
specific frequency.

**Also:** Include an explicit instruction in the Ghost Mode prompt:
"Use distinctive words at the same rate they appear in the source
corpus. If a word appears 2x per 1000 words in the source, use it
approximately 2x per 1000 words of your output."

### Failure 2: Flattened emotional range

**The problem:** The LLM reproduces Henry's average tone but misses
his extremes. If Henry was sometimes very frustrated and sometimes
very excited, the persona renders those as "mildly annoyed" and
"mildly pleased" — losing the emotional spikes that define real voice.

**Why it happens:** LLMs default to a safe, middle-range emotional
register. Expressing extreme emotion (anger, euphoria, despair)
requires deviating from the safe mean. The model won't do that unless
explicitly instructed.

**How to fix it:** Include emotional range data in the voice
description:
- "Check-in ratings range from 1 to 5, with notes at 1 showing
  significant frustration ('wasted the whole day') and notes at 5
  showing genuine excitement ('huge PR, finally'). The persona should
  reflect this range, not flatten to the 3.8 average."

### Failure 3: Perfect grammar

**The problem:** Henry writes like a 14-year-old: fragments, run-ons,
typos, all-lowercase, missing punctuation. The LLM "cleans up" the
grammar, producing a version of Henry who writes like an editorial
assistant.

**Why it happens:** LLMs are trained to generate correct English.
Imperfect English is a deviation from the training distribution.
The model has to be explicitly told to write incorrectly.

**How to fix it:** Include a sample that shows the level of
grammatical precision or imprecision:
- "The writing samples use sentence fragments. They use lowercase
  for most sentence starts. They frequently omit periods. Match this
  level of formality in your output."

**Hard truth:** This is the hardest failure to fix with a prompt.
The LLM's default output is grammatically correct. Forcing it to
write ungrammatically requires a strong instruction AND a strong
example in the writing samples. If the samples show fragments, the
model will produce more fragments. If the samples don't, the model
won't.

### Failure 4: The "average" bias

**The problem:** When in doubt, the LLM defaults to the most
statistically common writing style across its training data — which
is not Henry's style. The persona drifts toward "generic 14-year-old"
or "generic AI user" instead of "specific Henry."

**Why it happens:** The LLM has seen billions of writing samples
across its training. Its prior distribution is "average of all of
them." The few samples you provide shift the distribution, but if
the samples are weak or contradictory, the model falls back to the
prior.

**How to fix it:** Provide enough samples (10+) with high topical
diversity. The more the samples contrast with each other (and with
the default), the harder it is for the model to fall back to the
average. Also: strong characterful samples that deviate clearly from
"average" writing force the prior distribution to shift.

### Failure 5: Topic bleed from other windows

**The problem:** Ghost Mode window is February 2026. Henry was
studying physics and training for indoor track. But the LLM also
knows (from its training data) what Henry was doing in October 2026.
It accidentally bleeds October knowledge into February's persona.

**Why it happens:** The model's training data doesn't have clear
temporal boundaries. It can't distinguish "what I was told about
Henry" from "what I was trained on about Henry in general."

**How to fix it:** This is the knowledge cutoff problem, not a
style problem per se. But it manifests in style as well: the
February persona uses vocabulary or references topics that Henry
hadn't learned yet.

**Defense:** Strict knowledge cutoff enforcement in the Ghost Mode
prompt (see `docs/ghost-mode-persona-prompt.md`, §2). Additionally,
the style extraction should only consider samples from the window.
If the window is February, the style extraction prompt must not
receive samples from outside the window.

### Failure 6: Register mismatch (chat voice vs. note voice)

**The problem:** The corpus is mostly check-in notes (2-10 words each,
factual, emotionally flat). But the conversation mode requires
paragraph-length responses. The LLM produces paragraph-length
responses but tries to match the terse, factual voice of the notes.
Result: a persona that speaks in short factual paragraphs with no
emotional texture — which is weird.

**Why it happens:** The style samples (notes) are from a different
register than the output (conversation). A 14-year-old's notes don't
sound like a 14-year-old's conversation. The LLM is trying to map
one register to the other and failing.

**How to fix it:** Prioritize chat messages as style samples when
available. Chat is the closest register to the output. Next best:
quick notes (longer, more thoughtful). Last: check-in notes (too
short, too terse).

If no chat samples exist, the voice description should note:
"Style primarily extracted from check-in notes, which are short
and factual. The persona may sound more terse in conversation than
the real Henry would have."

### The caricature checklist

Before finalizing a Ghost Mode persona, check:

| Check | Failure if... | Fix |
| :--- | :--- | :--- |
| **Too clean?** | The persona uses perfect grammar | Add more raw, unedited samples to the prompt |
| **Tic overload?** | A distinctive word appears in every other sentence | Include the rate in the voice description, not just the presence |
| **Too flat?** | All emotional responses are mid-range | Include the emotional range data |
| **Generic?** | The persona could be anyone | Ensure 10+ samples with diverse topics |
| **Topic-biased?** | The persona only talks about the topic of the most prominent sample | Ensure samples are balanced by topic |
| **Register-mismatched?** | The persona talks like a note, not a conversation | Use chat samples if available |
| **Future-bleeding?** | The persona mentions something from after the window | Verify the knowledge cutoff prompt is working |

---

## 7. Implementation Recommendations

### Data source priority for writing samples

| Source | Type | Avg length | Voice quality | Priority |
| :--- | :--- | :--- | :--- | :--- |
| Chat messages with enry.agent | Conversational | 20-100 words | Best register match for output. Most natural voice. | 1st |
| Quick notes | Monologue | 10-200 words | Good voice signal. Longer than check-ins, more reflective. | 2nd |
| Check-in notes (with text) | Diary | 2-20 words | Short but emotionally authentic. Good for emotional range. | 3rd |
| Article note user_notes | Commentary | 10-50 words | If Henry wrote custom notes on saved articles. | 4th |
| Article note summaries | AI-generated | NOT Henry's words | Do NOT include. These are LLM-generated, not user-authored. | Never |
| Workout descriptions | Structured | 1-10 words | "bench 3x8" — formulaic, no style signal. | Never |

### Pipeline for voice extraction

```
1. Query all writing-suitable resources from the window
   └─ resources.type IN ('note', 'checkin', 'article_note')
      AND (payload.content != '' OR payload.note != '' OR
           payload.user_note != '')
      AND created_at BETWEEN window_start AND window_end

2. De-duplicate near-identical samples (cosine similarity > 0.95)

3. If total Henry-authored tokens < 100:
   ──→ Flag as "insufficient data." Do not extract style.
       Use behavioral data only.

4. If total Henry-authored tokens >= 100:
   ──→ Run programmatic extraction (free, deterministic)
   ──→ Select 3-10 representative samples using the selection heuristic
   ──→ Run LLM enrichment (1 API call, ~1000 tokens)
   ──→ Combine into voice description JSON

5. Inject voice description + writing samples into Ghost Mode prompt
```

### Cost

| Step | API calls | Tokens | Cost |
| :--- | :--- | :--- | :--- |
| Programmatic extraction | 0 | 0 | $0 |
| De-duplication embedding | ~10 | ~200 | ~$0.0002 |
| LLM enrichment | 1 | ~1000 input + ~200 output | ~$0.001 |
| **Total per window** | **1-2 calls** | **~1500 tokens** | **~$0.001** |

This is cheap enough to run on-demand when Henry opens a Ghost Mode
session, with no caching needed.

---

## 8. Quick Reference Card

```
┌─ FEATURE LEVELS ───────────────────────────────────────────────┐
│  Level 1: Micro-rhythm   (sentence length dist., function words,│
│                           punctuation density, clause depth)     │
│  Level 2: Word choice    (hedging, intensifiers, contractions,  │
│                           characteristic bigrams, vocabulary)    │
│  Level 3: Structure      (sentence openers, paragraph length,   │
│                           narrative distance, topic intro)       │
│  Level 4: Content        (topic mix, engagement deltas, self-   │
│                           reference patterns)                    │
└─────────────────────────────────────────────────────────────────┘

┌─ EXTRACTION METHOD ────────────────────────────────────────────┐
│  HYBRID: Programmatic metrics → LLM enrichment → final voice   │
│                                                                  │
│  Programmatic:  20+ metrics, deterministic, free, JS-side      │
│  LLM enrichment: 1 call, ~$0.001, adds nuance + human-readable │
│  Final output:   voiceDescription + writingSamples + metrics    │
└─────────────────────────────────────────────────────────────────┘

┌─ SAMPLE SIZE THRESHOLDS ───────────────────────────────────────┐
│  0 samples      → Behavioral data only, no voice              │
│  1-2 samples    → Minimal extraction, display disclaimer       │
│  3-5 samples    → Standard extraction (minimum viable)         │
│  6+ samples     → Full extraction with bigram + drift detect   │
│  20+ samples    → Excellent quality, diminish returns beyond   │
└─────────────────────────────────────────────────────────────────┘

┌─ DRIFT DETECTION ──────────────────────────────────────────────┐
│  Compare StyleVectors across windows using weighted Euclidean   │
│  distance. Report top 3 changed features in natural language.   │
│  Threshold for "significant drift": weighted score > 0.35.      │
│  Alert user if drift is large enough to feel like a different   │
│  person: score > 0.6.                                           │
└─────────────────────────────────────────────────────────────────┘

┌─ CARICATURE CHECKS ────────────────────────────────────────────┐
│  □ Too clean?         → Add raw samples, include grammar level │
│  □ Tic overload?      → Use rates, not just presence           │
│  □ Too flat?          → Include emotional range data           │
│  □ Generic?           → Ensure 10+ diverse-topic samples       │
│  □ Topic-biased?      → Balance sample selection               │
│  □ Register mismatch? → Use chat samples as priority           │
│  □ Future bleed?      → Verify knowledge cutoff enforcement    │
└─────────────────────────────────────────────────────────────────┘

┌─ DATA SOURCES (priority order for writing samples) ────────────┐
│  1st: Chat messages        (best register match)               │
│  2nd: Quick notes          (longest, most reflective)          │
│  3rd: Check-in notes       (short but emotionally authentic)   │
│  4th: Article user_notes   (if they exist)                     │
│  NEVER: AI-generated summaries (not Henry's writing)           │
└─────────────────────────────────────────────────────────────────┘
```
