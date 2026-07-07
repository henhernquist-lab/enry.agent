# Post-Fix Audit — All 8 Tool Save Paths

> Audit date: July 7, 2026
> Fix: `resolveResourceUserId()` in `src/lib/resource-user.ts` — maps raw Google OAuth ID (text) → `profiles.id` UUID before any `resources.user_id` insert.
> Scope: read-only. No code or database changes.

---

## Summary

**All 8 tools save through `/api/resources` POST, which uniformly resolves `session.user.id` through `resolveResourceUserId()` before any Supabase insert.** The fix is universal — no tool was missed. Payload shapes match their display views across the board. The only concern is Article Notes, which has two save paths (one through the fix, one through a dedicated endpoint that needs its own verification).

---

## Per-Tool Breakdown

### 1. Flashcards

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | Uses `saveResource('flashcards', ...)` → `/api/resources` POST → `resolveResourceUserId()` |
| Payload matches display | ✅ Yes | Saves `{ notes: string, cards: { question, answer }[] }`. PayloadView reads `p.cards`. Match. |
| Missed by fix? | No | `saveResource()` is the universal wrapper. |
| Saved items show? | Should work | `loadResources('flashcards')` → `/api/resources?type=flashcards` GET → same ID resolution. Rows that exist will appear. |

### 2. Grade Calculator

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | `saveResource('grade_calc', title, { targetGpa, classes, weightedGpa })` → resolved UUID |
| Payload matches display | ✅ Yes | Saves `{ targetGpa: string, classes: GradeClass[], weightedGpa: number }`. PayloadView displays `gp.weightedGpa`, `gp.targetGpa`, `gp.classes`. Match. |
| Missed by fix? | No | Standard path. |
| Saved items show? | Should work | GPA summary uses `resourceSummary()` → displays `"GPA X.XX · target Y.YY"`. |
| Note | — | Also saves to `/api/tools/grades` (PUT) — a separate profile-backed endpoint, not the resources table. That endpoint uses its own `google_id` lookup and is unrelated to the resources FK bug. |

### 3. Workout Logger

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | `saveResource('workout', title, { exercise, sets, logged_at })` → resolved UUID |
| Payload matches display | ✅ Yes | `{ exercise: string, sets: { reps, weight }[] }`. PayloadView reads `wp.exercise`, `wp.sets`. Match. |
| Missed by fix? | No | Standard path. |
| Saved items show? | Should work | Summary: `"N sets · Xlbs max"` via `resourceSummary()`. |

### 4. Meal Logger

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | `saveResource('meal', title, { description, ...macros })` → resolved UUID. `macros` = `{ calories, protein, carbs, fat }`. |
| Payload matches display | ✅ Yes | PayloadView reads `mp.description`, `mp.calories`, `mp.protein`, `mp.carbs`, `mp.fat`. All present. |
| Missed by fix? | No | Standard path. |
| Saved items show? | Should work | Summary: `"Xcal · Yg protein"` via `resourceSummary()`. |

### 5. Repo Scanner

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | `saveResource('repo_scan', data.name, data)` where `data` is the full `RepoInfo` object → resolved UUID |
| Payload matches display | ✅ Yes | PayloadView reads `rp.name`, `rp.description`, `rp.stars`, `rp.language`, `rp.fileTree`, `rp.topics`. All present in `RepoInfo`. |
| Missed by fix? | No | Standard path. |
| Saved items show? | Should work | Summary: `"language · X ★ · Y files"` via `resourceSummary()`. |
| Flag | ⚠️ Storage concern | `data.readme` is saved in the payload but never displayed. For large repos with long READMEs, this wastes Supabase storage. Not a bug — just future cleanup. |

### 6. Habit Streaks

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | `saveResource('habit_streak', title, { habit_id, habit_name, checked_on, streak })` → resolved UUID |
| Payload matches display | ✅ Yes | PayloadView reads `hp.habit_name`, `hp.checked_on`, `hp.streak`. All present. `habit_id` is saved but not displayed (used for reference). |
| Missed by fix? | No | Standard path. |
| Saved items show? | Should work | Summary: `"Nd streak"` or `"checked in"` via `resourceSummary()`. |

### 7. Prompt Library

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | Direct `fetch('/api/resources', { method: 'POST', body: JSON.stringify({ type: 'prompt', title, payload: { body, category: 'general', tags: [] } }) })` → same resolved UUID in the route |
| Payload matches display | ✅ Yes | PayloadView reads `pp.body`, `pp.tags`. Both present. `category` saved but not displayed (optional field, fine). |
| Missed by fix? | No | Uses `/api/resources` POST — same route, same resolution. |
| Saved items show? | Should work | Minor: `resourceSummary()` returns `''` for `prompt` type (falls through to `default`). Prompt saved items show with just the title and timestamp — usable, but no rich summary like other tools. |
| Note | — | The PromptLibraryLauncher in `[slug]/page.tsx` is a simplified inline form. The full prompt library at `/prompts` has its own save/load paths that use the same resources API. Both paths go through the fix. |

### 8. Article Notes

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Verified | **Path A (save):** `/api/article-notes` POST → `resolveResourceUserId(userId(session))` → resolved UUID ✅. **Path B (load):** `fetch('/api/resources?type=article_note')` → GET → same resolution ✅. **Path C (search):** `/api/article-notes/search` POST → also uses `resolveResourceUserId()` ✅. All three paths use the fix. |
| Payload matches display | ✅ Yes | PayloadView reads `ap.summary`, `ap.key_claims`, `ap.flashcards`. All present. |
| Missed by fix? | No | Verified `src/app/api/article-notes/route.ts` line 21: `const uid = await resolveResourceUserId(userId(session))`. Same pattern as `/api/resources`. Search route (line 19) also uses it. |
| Saved items show? | ✅ Yes | All three paths (save, load, search) resolve the UUID correctly. Post-fix saves will appear. |

### Bonus: Race Pace Calculator

| Check | Status | Detail |
| :--- | :--- | :--- |
| Save path correct | ✅ Yes | Direct `fetch('/api/resources', { method: 'POST', body: ... })` → same resolved UUID |
| Payload matches display | ✅ Yes | Saves `RacePacePayload`. PayloadView handles both `calculation` and `result` modes. Match. |
| Missed by fix? | No | Uses `/api/resources` POST. |

> Note: Race Pace is not accessible from the 8-tool grid on `/resources` but has a tool component and resources type. It shares the same `/api/resources` save path.

---

## Findings Summary

| Tool | Save path | Payload/display | Flags |
| :--- | :--- | :--- | :--- |
| Flashcards | ✅ Correct | ✅ Match | — |
| Grade Calculator | ✅ Correct | ✅ Match | Dual save to `/api/tools/grades` (unrelated) |
| Workout Logger | ✅ Correct | ✅ Match | — |
| Meal Logger | ✅ Correct | ✅ Match | — |
| Repo Scanner | ✅ Correct | ✅ Match | ⚠️ README stored but not displayed |
| Habit Streaks | ✅ Correct | ✅ Match | — |
| Prompt Library | ✅ Correct | ✅ Match | Minor: no summary text in list view |
| Article Notes | ✅ Verified | ✅ Match | — |
| (Race Pace) | ✅ Correct | ✅ Match | Not in the 8-tool grid |

---

## Verdict

✅ **All 8 tools pass.** The `/api/article-notes` POST handler (verified manually, line 21 of `src/app/api/article-notes/route.ts`) uses the same `resolveResourceUserId(userId(session))` pattern as `/api/resources`. The search route also uses it. No tool was missed by the fix.

### Verified save paths per tool:

| Tool | Resolves UUID via |
| :--- | :--- |
| Flashcards | `saveResource()` → `/api/resources` POST |
| Grade Calculator | `saveResource()` → `/api/resources` POST |
| Workout Logger | `saveResource()` → `/api/resources` POST |
| Meal Logger | `saveResource()` → `/api/resources` POST |
| Repo Scanner | `saveResource()` → `/api/resources` POST |
| Habit Streaks | `saveResource()` → `/api/resources` POST |
| Prompt Library | `fetch('/api/resources', { POST })` |
| Article Notes | `resolveResourceUserId()` in `/api/article-notes` POST |

3. **Minor: Prompt summary in list view** — `resourceSummary()` returns empty string for `prompt` type. The list still shows the title and timestamp, but lacks the rich preview other tools have. Consider adding a summary like showing the first 40 chars of `body` or the tag count.

4. **Minor: README storage** — Repo Scanner saves the full README text in the payload. For large repos this wastes storage. Consider trimming to first 500 chars before save, or removing the readme field from the saved payload since it's never displayed in the detail view.
