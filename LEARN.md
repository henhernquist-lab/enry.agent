# Enry Learn — base architecture

This document is for the next agent building a feature on top of Learn's
base (Knowledge Diff, Ambient Mode, Confidence Calibration, Explain-Back
grading, Prerequisite Excavation, Contradiction Alarm, and the three Freebuff
features — Enemy Claims, Confidence Casino, Receipts). It is not a
user-facing changelog. If you're about to build one of those, read this
whole file before touching the schema or `learn-ops.ts` — the base was
deliberately shaped so you shouldn't need to change either.

**The Map and Fog of War are built** (see their section below) — they're no
longer future work. The Freebuff features have their schema + integration
seams in place (migration 020) but no logic yet; that's what you're here for.

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

Event types written across Learn (base + the verbs/features built on it):

| event_type | payload shape | written by |
|---|---|---|
| `probe_asked` | `{ content: string, via?: 'ambient' }` | `surfaceNextDue`; Ambient cron (`via:'ambient'`) |
| `answer_recorded` | `{ answer: string, asked_at: string, via?: 'ambient' }` | `recordAnswer`; Ambient reply (`via:'ambient'`) |
| `defense_attempted` | `{ claim_content, counterargument, rebuttal, rounds: [{side,text}], asked_at }` | `defend` (`recordDefense`) |
| `explanation_graded` | `{ explanation, verdict: 'SURVIVED'\|'EXPOSED'\|'EVADED', rationale, claim_content, asked_at }` | `teach` (`gradeExplanation`) |
| `claim_retired` | `{ claim_content }` | `retire` (on success) |
| `resource_saved` | `{ view, title, params, snapshot, saved_at }` | `saveView` (claim-anchored path only) |

`rounds[]` in `defense_attempted` is shaped for a future Argument Ledger to
replay the exchange. `resource_saved` is the claim-anchored half of saveable
views (see "Saveable views" below) — multi-claim view artifacts go to
`resources`, not here.

When you add a new event type, add a row to this table in your own PR — a
feature agent reading this file next should be able to see the full registry
in one place, not have to grep the codebase for every `event_type` string
literal.

**Reserved payload field names (Confidence Casino).** `claim_events.payload`
is jsonb precisely so features add fields without a migration. Casino's
stake/payout ride here, not in new columns. To keep them consistent across
whatever event types Casino writes (e.g. a `bet_placed` and a `bet_settled`),
these field names are reserved — use them, don't reinvent:

| payload field | type | meaning |
|---|---|---|
| `stake_amount` | number | units the user wagered on their answer |
| `payout` | number | units returned (0 on a loss; > stake on a win) |

The durable running balance those deltas sum to is NOT an event — it lives in
`user_learn_state.casino_balance` (migration 020), read/written via
`src/lib/learn/casino.ts` (`getCasinoBalance` / `adjustCasinoBalance`). The
base never touches it; those helpers exist only so Casino has a ready home.
See that file's note on concurrency before building a high-frequency bet loop.

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

**All six verbs are now implemented.** `gap` (weakest-topic surfacer, read-only),
`defend` (two-phase: strongest counterargument → your rebuttal, logs
`defense_attempted`), `teach` (Feynman gate: you explain a claim, a separate
model call grades it `SURVIVED`/`EXPOSED`/`EVADED` and logs
`explanation_graded`), and `retire` (moves a claim to `status='retired'` — hard-
gated: refuses unless the claim has a `SURVIVED` `explanation_graded` in its
history). `defend`/`teach` park a `pending_defense`/`pending_teach` in the
session (same one-in-flight discipline as `pending_probe`); the client routes
the next message to whichever interaction is pending. The teach rubric is
isolated as `TEACH_GRADING_RUBRIC` in `learn-ops.ts` — swap that one constant
to retune grading without touching any wiring.

To add a further verb (or replace one):

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
not forked. They're browsable in Learn's Chat-tab sidebar. `teach` and `defend` are now
implemented but use their OWN prompts (`TEACH_GRADING_RUBRIC`,
`DEFEND_SYSTEM_PROMPT`), not these skill definitions — wiring a specific
technique's system prompt into a verb (e.g. Feynman into `teach`, ELI-Expert
into `defend`) is still an open enhancement. `getSkill()` only searches the
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

## The Map (and Fog of War)

The Map tab is a first-class canvas of every non-retired claim, peer to Chat
in interaction weight. Data flow:

- `GET /api/learn/map` → `getMapData(userId)` in `src/lib/learn/map.ts`. Loads
  the user's claims, computes each node's live `strength` via `strength.ts`
  (never the stored column), and builds a **nearest-neighbor link set** from
  embedding cosine similarity (top-`NEIGHBORS_PER_NODE` per node above
  `MIN_SIMILARITY`). We deliberately do NOT ship 1024-dim vectors to the
  browser — the server does the similarity math and sends only `{ source,
  target, similarity }` links; the client runs a `d3-force` layout over those
  links to get the visual clustering. Node position is therefore emergent, not
  persisted — there is no stable (x, y) or "region id" anywhere.
- `GET /api/learn/claim?claim_id=` → one claim + its recent `claim_events`,
  fetched lazily on node click (the overview never carries event history).
- `ClaimMap` (`src/components/learn/claim-map.tsx`) renders to a `<canvas>`
  with hand-rolled pan/zoom/hit-testing. `d3-force` is the only new dependency
  and is used purely for layout math, no rendering.

**Fog of War** is a rendering mode on the same canvas, toggled from the Map.
It reads per-claim freshness — `last_touched_at`, the max of `created_at`,
`last_probed_at`, and the newest `claim_events` row — from the `claim_activity`
**view** (migration 020). It's a view, not a table, because activity is fully
derivable from columns that already exist; there's no region state to keep in
sync (and no stable region to attach it to, per the layout note above). Fresh
nodes clear a soft hole in the fog scaled by recency; cold regions
(`> FOG_COLD_DAYS` untouched) stay fogged. The clear radius is recomputed every
frame against `Date.now()`, so as a session sits open, holes shrink and fog
closes back in — that's the "decaying back into fog" animation, no re-fetch.

Both the Map and Fog degrade gracefully **before migration 020 is run**:
`getMapData` retries its claims select without `is_enemy` if that column is
missing, and falls back from the `claim_activity` view to
`GREATEST(created_at, last_probed_at)` (ignoring non-probe events until the
view exists). `MapData.fog_source` reports which path ran.

## The Freebuff integration surface (schema + seams, not features)

Migration `020_learn_freebuff_surface.sql` and the code shipped with it add
everything the three Freebuff features need and NOTHING they own. None of the
three are implemented here.

- **Enemy Claims.** `claims.is_enemy boolean` + `claims.enemy_caught_at
  timestamptz`. `surfaceNextDue` already selects any `status='active'` claim
  regardless of the flag, so enemy claims are *already* in probe rotation with
  zero logic change — the base just carries `is_enemy` through into the probe
  response `data` and the session's `pending_probe` so the feature can render/
  score a surfaced enemy differently. To build it: read `is_enemy` off the
  probe response, and when the user correctly rejects one, set
  `enemy_caught_at` (and write your own `enemy_caught` event). No further
  schema change needed.
- **Confidence Casino.** Stake/payout are `claim_events.payload` fields (see
  the reserved-field table above); the running balance is
  `user_learn_state.casino_balance` via `src/lib/learn/casino.ts`. Neither is
  touched by the base.
- **Receipts.** `src/lib/learn/receipts-hook.ts` exposes a registrable hook.
  Main chat's send path (`src/app/api/chat/route.ts`) invokes
  `getReceiptsHook()` **fire-and-forget** (not awaited) on every outgoing user
  message, passing `{ userId, googleId, message }`. The default hook is a
  no-op that resolves `null` — zero reads, zero latency. To build Receipts:
  write your contradiction detector as a `ReceiptsHook`, call
  `registerReceiptsHook(...)` once from a side-effect import chat already pulls
  in, and never touch chat's runtime otherwise. The seam is observe-only today
  (its result is logged, not fed back into the stream); surfacing a result
  into the chat response is a larger change and its own proposal. This is the
  sensitive one — the detector runs against every message the user sends, so
  it must stay cheap and must never block the response.

## Tab-registration contract

Everything in Learn that isn't the Chat console is a **tab**, and every tab
registers in ONE place: `LEARN_TABS` in
`src/components/learn/tab-registry.tsx`. To add a feature tab (Confidence
Casino, Enemy Claims dashboard, Receipts log, ...), append one `LearnTabDef`:

```ts
{ id: 'casino', label: 'Casino', icon: Coins, render: () => <ConfidenceCasino /> }
```

That's the whole ceremony. The Learn page reads this array to build the tab
bar, the "+" menu (which lists any registered tab not currently open), and the
active tab's content — it hard-codes no tab id. `defaultOpen: true` makes a tab
visible on load without the "+" (Map uses it); omit it and the tab opens on
demand and is closeable. **Chat is intentionally not in the registry**: it's
the pinned home tab that owns the shared input box, session id, and
pending-probe state, so it can't be closed or opened from "+". Every feature
(except the inline LLM skills in the Chat tab) must be a registry entry — that
rule is what keeps "each feature is its own openable tab" true as Freebuff
lands.

Current tabs: Map, Diff, Sources, Casino, Enemies, Receipts, Grades, Cards,
Articles, Notes.

### Cards is deliberately NOT wired to `claims`

The Cards tab wraps `FlashcardGenerator` (`src/components/tools/`) unchanged.
It calls `/api/automations/generate`, parses `Q:`/`A:` text, and saves to
`resources` (`type='flashcards'`) — plain, disposable Q/A pairs, no spaced
repetition, no embedding.

`learn "<topic>"` in Chat is a completely different path: dedicated
claim-extraction prompt, real embedding, saved to `claims`. Only claims get
the full lifecycle — probing, strength/half-life decay, Gap analysis, Sources
custody, Knowledge Diff coverage, Ambient push probing, defend/teach/retire.

**This split is a deliberate decision, confirmed with Henry, not an
oversight**: Cards is a lightweight, disposable study tool; `learn` is the
durable path. Notes pasted into Cards never become claims and are invisible
to every claim-based feature above. If a future feature wants Cards' output
to join the claim system, that's a real design question (a flashcard's Q/A
shape doesn't map 1:1 onto a claim's single-provable-statement shape) — don't
just point Cards' save call at `learnTopic()` without working that out.

Articles is a different situation and NOT part of this split: it already
saves to the same `resources` (`type='article_note'`) that Sources' "Imports"
section reads by provenance — the tab is the creation/management workspace,
Sources is the provenance browser. Same data, two views, not redundant.

## Sources (Source Custody) + the pin mechanism

The Sources tab (`src/lib/learn/sources.ts`, `/api/learn/sources`) groups every
non-retired claim by its `(source_type, source_ref)` provenance. A source can be
**pinned** as trusted. Pins are stored as `resources` rows
(`type='learn_source_pin'`, payload `{source_type, source_ref}`) — no migration,
same polymorphic pattern as `learn_session`. `getPinnedSourceKeys(userId)` is the
seam a future **Source-Grounded Mode** reads to preferentially cite pinned
sources and to treat unpinned-custody claims as untrusted. The base builds the
mechanism only — it enforces nothing (the UI surfaces a "N claims lack pinned
custody" count but changes no `status`).

## Saveable views (Map / Diff / Sources)

`src/lib/learn/saved-views.ts` + `/api/learn/saved-views` persist a view so it
reopens EXACTLY (reads a frozen `snapshot`, never recomputes). Two stores:
- **Multi-claim view artifact** (a Diff result, a Map camera + node snapshot):
  `resources` row, `type='learn_saved_view'`.
- **Claim-anchored save**: `claim_events` row, `event_type='resource_saved'` on
  that claim.
A new `learn_resources` table was deliberately NOT created: `resources` is the
established generic home and avoids a migration; `claim_events` can't hold a
multi-claim artifact anyway (`claim_id` is `NOT NULL`). Payload carries `params`
(reopen inputs) + `snapshot` (frozen data). Note Postgres `jsonb` does not
preserve key order — reconstruction must be value-equality, not string-equality.

## Knowledge Diff — data model

`src/lib/learn/diff.ts` + `/api/learn/diff`. Given a target topic: one LLM call
maps its **semantic surface** into 8-14 facets; each facet (embedded as
`facet + why`, `'query'` mode) is compared by cosine to the user's claim
embeddings — the SAME pipeline the Map uses, no new similarity system. Per facet:
`missing` (nearest claim sim < `FACET_MATCH_SIM`), else `known` (live
`computeStrength ≥ 0.6` and no recent `EXPOSED`/`EVADED` teach) or `half_known`.
`FACET_MATCH_SIM=0.40` is calibrated to nv-embedqa-e5-v5's COMPRESSED
query↔passage range (exact match ~0.50, related-but-different ~0.25-0.30,
unrelated ~0.10-0.19) — retune if the embedding model changes. Diffs are saveable
(above), so one from last week reopens exactly rather than recomputing.

## Ambient Mode — cron + Web Push contract

A background layer (NOT a tab), `src/lib/learn/ambient.ts`. Delivery is Web
Push (VAPID), not SMS — there is no reply channel; a push notification is a
summons into the app, not a two-way conversation. The answer always goes
through the same in-app probe-answer path every other probe uses.

- **Settings** live in a `resources` row (`type='learn_ambient_settings'`) — in
  Learn's own settings (the header "Ambient" modal), never global. Fields:
  `enabled`, `push_subscription` (`{endpoint, keys:{p256dh, auth}}` or `null`),
  `max_per_day`, `quiet_start/end_hour`, `timezone`. The daily-send counter +
  the one in-flight `pending` probe live in that same payload.
- **Subscription flow**: flipping "Enabled" on in the modal (or the standalone
  "Enable" button under Push notifications) calls `subscribeToPush()`
  (`src/lib/push-client.ts`) — requests Notification permission, registers
  `public/sw.js`, subscribes via `PushManager` using
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and POSTs the resulting subscription to
  `/api/learn/ambient/push-subscribe`, which stores it via `saveAmbientSettings`
  (same row, same merge pattern as every other Ambient setting — no separate
  table). `DELETE` on that route (or the modal's "Disable" button) clears it.
- **Cron**: `GET /api/cron/ambient-probe`, `Bearer CRON_SECRET` (identical guard
  to cruise-tick). Scheduled by `.github/workflows/enry-ambient-probe.yml`
  (every ~15 min, mirrors `enry-cruise-tick.yml`). Per user, sends at most one
  probe, gated in order: `enabled` → `push_subscription` present → not
  quiet-hours (tz-aware) → not `awaiting_engagement` (see below) → under daily
  cap → a claim is actually due (else `nothing_due` — silence is fine).
- **Send**: `sendAmbientPush` (`src/lib/learn/ambient.ts`) is real Web Push,
  credential-gated on `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
  `VAPID_SUBJECT`. With no keys it's a logged no-op (`stubbed: true`) so the
  decision path stays exercisable without keys — the schedule is inert until
  keys are set. A genuine send failure (`send_failed`) does NOT consume the
  daily cap or park `pending` — the claim stays due for the next tick. A `404`/
  `410` from the push service means the subscription expired
  (`subscription_expired`): handled the same as `send_failed` (no cap, no
  pending) AND clears the dead subscription from settings so the UI shows
  "not subscribed" and prompts a resubscribe.
- **No reply webhook.** There used to be one (SMS-era); it's gone. Clicking a
  notification is handled entirely client + service-worker side — see below.
  Because there's no separate reply-recording path, `pending` (the
  one-in-flight guard) can't be cleared by an inbound webhook anymore. Instead:
  a pending probe is **resolved** once the claim's `next_probe_at` has moved
  past `asked_at` — the fact `recordAnswer` (the in-app probe-answer path,
  `learn-ops.ts`) already produces on any real answer, read back rather than
  duplicated. If neither resolved nor answered within `PENDING_TIMEOUT_MS`
  (24h), the guard lifts anyway — "don't nag, move on" — decision reported as
  `awaiting_engagement` until then.
- **Notification click → probe**: `public/sw.js`'s `notificationclick` handler
  focuses (or opens) a client at `event.notification.data.url`, which is always
  `/learn?probe=1`. `src/app/learn/page.tsx` reads that query param on mount
  and auto-runs the exact same `probe` invocation the Probe button triggers
  (`exec('probe', '', 'probe')`) — no separate code path. Because both this
  module's `nextDueClaim` and the in-app probe's `selectDueClaim` order by
  `next_probe_at` ascending, the claim that surfaces is the one the push was
  about (barring a claim becoming due in between). The query param is stripped
  via `router.replace('/learn')` right after, so a refresh doesn't re-trigger.
  The user's typed answer then goes through `recordAnswer` like any other
  probe — Ambient has no answer-recording logic of its own.

## Cross-tab actions (the `LearnActions` seam)

A feature tab that must hand off to the Chat console (Knowledge Diff's "start
studying this gap" drops a scoped `learn` invocation into Chat) uses
`useLearnActions()` (`src/components/learn/learn-actions.tsx`). The page provides
`{ openChatWith }` ONCE via `LearnActionsProvider` wrapping tab content — so a
tab never reaches into page/shell state directly. Add a new cross-tab action =
one field on `LearnActions`, not per-tab shell surgery.

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
