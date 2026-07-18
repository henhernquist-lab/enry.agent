# Enry Learn — base architecture

This document is for the next agent building a feature on top of Learn's
base (Knowledge Diff, Ambient Mode, Confidence Calibration, Explain-Back
grading, Prerequisite Excavation, Contradiction Alarm, The Map). It is not a
user-facing changelog. If you're about to build one of those, read this
whole file before touching the schema or `learn-ops.ts` — the base was
deliberately shaped so you shouldn't need to change either.

## What Learn is, in one paragraph

Learn is a mode, structurally a peer to Drive — its own route (`/learn`),
its own server ops module (`learn-ops.ts`, sibling to Drive's
`write-ops.ts`), its own verb dispatcher, its own session-state table row.
Drive's primitive is a file edit that moves through
`propose → apply → branch → commit → pr`. Learn's primitive is a **claim** —
one belief, with provenance and a decay state — that moves through
`create → probe → (whatever a feature adds) → retire`.

## The claim lifecycle

A claim is born via `learn "<topic>"` (or, later, `import`/`derived` from
other sources — see `source_type` below). It starts at `strength = 1.0`,
`status = 'active'`, and `next_probe_at` set to "now" — due for its first
probe immediately.

From there:

1. `probe` finds the most-overdue active claim (`next_probe_at <= now()`,
   nulls first), writes a `probe_asked` event, and remembers it as the
   session's `pending_probe` (same discipline as Drive's `pending_diff` —
   one thing in flight at a time, alive in the session row so a page reload
   doesn't lose it).
2. The next `probe` call, this time with an answer while a probe is pending,
   writes an `answer_recorded` event and reschedules `next_probe_at` using
   the claim's **current** `half_life`. The base does not grade the answer —
   see "What the base deliberately does not do" below.
3. `strength` at any moment is `computeStrength(claim, events)`
   (`src/lib/learn/strength.ts`) — currently a pure exponential decay from
   `last_probed_at` (or `created_at` if never probed) using the claim's own
   `half_life`. Nothing in the base writes `strength` directly except at
   creation (1.0) — it's always a computed view, not stored state that drifts
   out of sync. If you build something that DOES need to persist a strength
   snapshot (e.g. for a "strength history" chart), write it as a
   `claim_events` row, not a mutation of `claims.strength`.
4. `status` moves `active → shaky → retired → untrusted` — the base never
   changes it after creation. `retire` (the verb) is stubbed; whatever
   replaces it decides the transition rules.

## The `claim_events` contract — the extension point

`claim_events` is append-only. Nothing in this codebase updates or deletes a
row in it except the `ON DELETE CASCADE` from a deleted claim.

```
claim_events
  id, claim_id, event_type (free text), payload (jsonb), created_at
```

**`event_type` is deliberately not a `CHECK`-constrained enum.** A new
feature registers a new event type by writing one — zero migration. This is
the whole point of the table: features derive their behavior by reading this
log, not by the base predicting what they'll need.

Event types the base itself writes:

| event_type | payload shape | written by |
|---|---|---|
| `probe_asked` | `{ content: string }` | `probeNext` → `surfaceNextDue` |
| `answer_recorded` | `{ answer: string, asked_at: string }` | `probeNext` → `recordAnswer` |

When you add a new event type, add a row to this table in your own PR — a
feature agent reading this file next should be able to see the full registry
in one place, not have to grep the codebase for every `event_type` string
literal.

## What the base deliberately does not do

- **No grading.** `probe` records the raw answer text and reschedules using
  the claim's *existing* `half_life`, unchanged. It does not decide whether
  the answer was right. Confidence Calibration and Explain-Back grading are
  both explicitly out of this base's scope — when either lands, it should:
  1. Read the `answer_recorded` event (and whatever else it needs from the
     claim/its history).
  2. Decide correctness/quality by whatever logic it owns.
  3. Call `nextHalfLife(currentHalfLife, wasCorrect)` (already in
     `strength.ts`, unused by the base today) to get the new `half_life`.
  4. Write its own verdict as a new event type (e.g. `graded`,
     `confidence_scored`) — don't overload `answer_recorded`.
  5. Update `claims.half_life` (and optionally `next_probe_at` again, since
     the base's reschedule already ran with the old half-life).
- **No confidence math.** `confidence_stated`/`confidence_actual` exist as
  columns on `claims` and are both nullable — the base never writes either.
- **No claim clustering/visualization.** `topic` is a free-text label for
  grouping; there's no graph structure. That's The Map's job.
- **No prerequisite tracking.** Nothing links one claim to another. That's
  Prerequisite Excavation's job.
- **No contradiction detection.** Nothing compares claims against each
  other. That's Contradiction Alarm's job — note the existing, unrelated
  `contradictions` table (migration 008) is a different feature entirely
  (chat/decision contradictions, not claim contradictions); don't reuse it
  without checking whether that's actually what you want.

## `computeStrength` — replace, don't extend in place

`src/lib/learn/strength.ts` exports one function with this signature:

```ts
computeStrength(claim: ClaimForStrength, events: ClaimEventForStrength[]): number
```

The current implementation ignores `events` entirely — it's in the
signature so a smarter version (streak-aware, latency-weighted, fitted to an
actual forgetting curve) can read event history without every call site
needing to change. If you're replacing the decay model, replace the body of
this function and keep the signature. Every caller (today: nothing outside
this module computes strength inline — `probeNext`'s due-claim query uses
`next_probe_at` directly, not a live `computeStrength` call, since the
schedule was already set by the previous probe) should keep working
untouched.

## Verb dispatcher — adding a real verb

`learn-ops.ts` exports `dispatchLearn(verb, args, ctx)`. All six verbs are
registered in the `switch` from day one:

```ts
export const LEARN_VERBS = ['learn', 'probe', 'gap', 'defend', 'teach', 'retire'] as const
```

`gap`, `defend`, `teach`, `retire` currently call `notYetImplemented(verb)`,
which round-trips through the real route (not faked client-side) and
returns a clear message. To implement one:

1. Write a real function in `learn-ops.ts` (or a new file in
   `src/lib/learn/` if it's substantial — `learn-ops.ts` importing from
   sibling files is fine, same pattern Drive's `write-ops.ts` uses for
   `diff.ts`/`working-copy.ts`/etc.).
2. Swap the one line in `dispatchLearn`'s switch.
3. Nothing in the route (`app/api/learn/exec/route.ts`) or the client
   (`app/learn/page.tsx`) needs to change — the route already forwards any
   verb in `LEARN_VERBS` and renders whatever `output`/`data` comes back.

## Session state

`resources` rows with `type = 'learn_session'`, payload shape
`LearnSessionPayload` (`src/lib/resources.ts`) — same table, same row
pattern Drive's `terminal_session` uses. Every write goes through
`casUpdateSessionPayload` (`src/lib/session-cas.ts`, extracted from Drive's
`write-ops.ts` so both modes share one compare-and-swap implementation
instead of two that can silently drift). Requires migration
`018_resources_version.sql` (the `resources.version` column) — same
requirement Drive's session writes already have.

## The techniques (moved skills)

`feynman`, `fifth-grader`, `socratic-mode`, and `eli-expert` moved out of
main chat's `SKILLS` registry array into `LEARN_SKILLS`
(`src/lib/skills/registry.ts`) — same `SkillDefinition` objects, imported
not forked. They're currently browsable in Learn's page (a static sidebar
list) but **not wired into any verb** — `teach` and `defend` are the
obvious homes for them (e.g. `teach` running the Feynman technique's
system prompt against a specific claim, `defend` running ELI-Expert's
"push back" mode to test whether a claim survives scrutiny). When you build
either verb, that's where these plug in — `getSkill()` only searches the
main `SKILLS` array, so look these up via `LEARN_SKILLS.find(...)` instead.

## Reused, not rebuilt

- **Embeddings**: `src/lib/embeddings.ts`'s `generateEmbedding(text, 'passage' | 'query')`
  — same `nv-embedqa-e5-v5` pipeline `memories`/`contradictions` already
  use. `claims.embedding` is `vector(1024)`, same dimension. Remember it's
  asymmetric: `'passage'` when writing a claim, `'query'` when searching.
- **Memory**: `src/lib/memory.ts`'s `searchMemories(googleId, query, limit)`
  — `learnTopic` already calls this to ground claim generation in what enry
  already knows about the user. If you build something that searches
  *claims* by similarity (a `match_claims` RPC analogous to `match_memories`
  in migration 001), that wasn't built in the base — add it in your own
  migration when you need it.
- **NIM client**: `src/lib/nim.ts`'s `nimClientFor`/`DEFAULT_NIM_MODEL`/
  `parseJsonLoose` — same pattern every other LLM call in this codebase
  uses.

## Known gaps, left for you on purpose

- No vector index on `claims.embedding` (matches `memories`' own
  minimal-index convention at this data scale — add one if claim volume
  ever makes exact search slow).
- No `match_claims` RPC (see above).
- `learnTopic`'s source-type heuristic (`> 300 chars` → `'import'`, else
  `'derived'`) is a simple heuristic, not a real classifier — fine for now,
  revisit if `learn` ever needs to actually parse structured source
  documents (PDFs, URLs, etc.) rather than pasted text.
- Learn's page has no model/effort picker (Drive has both) — the base
  always uses the default NIM model. Add one if a feature needs model
  choice; the `ctx.model` plumbing in `learn-ops.ts` already accepts an
  override, the UI just doesn't expose it yet.
