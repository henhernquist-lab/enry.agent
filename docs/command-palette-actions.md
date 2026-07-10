# Command Palette Action Catalog

> Cmd+K command palette. Aesthetic: Linear / Raycast / Superhuman —
> dense, useful, keyboard-first. No fluff commands, no nested menus.
> Every action should feel like muscle memory after the second use.

---

## UX Architecture

### Opening behavior

- **Trigger:** `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux)
- **Empty state (before typing):** Two sections:
  1. **Recents** — last 3-5 selected actions in reverse-chronological order. Labeled with a clock icon. If the user has no history yet (first session), this section is hidden.
  2. **Suggested** — 6-8 most-likely actions ranked by recency and frequency (see ranking algorithm below).
- **On type:** Fuzzy-filter across all action names and keywords. Results grouped by category with separator labels. Exact matches sort first within each group.
- **On select:** Execute immediately. Close the palette. No confirmation dialogs unless the action is destructive (e.g., sign out).
- **On Escape:** Close with no action. Restore focus to whatever had it before the palette opened.

### Ranking algorithm (conceptual)

Actions are scored by:
1. **Recency** — last-used timestamp, weighted by 0.7
2. **Frequency** — total invocation count, weighted by 0.3
3. **Context boost** — if user is on `/resources/flashcards`, "New flashcard set" gets a 1.3× multiplier

The 6-8 highest-scoring actions appear as suggestions before any typing.
Recents are stored separately (last N selections, deduped) and displayed above suggestions.

### History persistence

- Local LRU cache of the last 50 selected actions (in `localStorage` key: `cmd-k-history`).
- Each entry: `{ actionId, timestamp }`.
- Recents = last 5 unique entries from this cache, most-recent-first.
- On select, push to cache, dedupe by actionId, trim to 50.

---

## Action Categories

### 1. Navigate

Jump to any page or tool. One action per destination. All keywords are used for fuzzy-matching aliases.

| # | Action | Shortcut | Icon | Target |
| :--- | :--- | :--- | :--- | :--- |
| N1 | **Go home** | `Cmd+Shift+H` | `Home` | `/` — main chat |
| N2 | **Tools** | `Cmd+Shift+T` | `LayoutGrid` | `/resources` |
| N3 | **Saved items** | — | `Archive` | `/resources/saved` |
| N4 | **Prompt library** | — | `BookMarked` | `/prompts` |
| N5 | **Reading list** | — | `BookOpen` | `/reading-list` |
| N6 | **Settings** | `Cmd+,` | `Settings` | `/settings` |
| N7 | **Flashcard Generator** | — | `Brain` | `/resources/flashcards` |
| N8 | **Grade Calculator** | — | `Calculator` | `/resources/grade-calculator` |
| N9 | **Workout Logger** | — | `Dumbbell` | `/resources/workout` |
| N10 | **Meal Logger** | — | `Utensils` | `/resources/meal` |
| N11 | **Repo Scanner** | — | `GitBranch` | `/resources/repo-scanner` |
| N12 | **Habit Streaks** | — | `Target` | `/resources/habits` |
| N13 | **Article Notes** | — | `Newspaper` | `/resources/articles` |
| N14 | **Race Pace Calculator** | — | `Timer` | `/resources/race-pace` |
| N15 | **Repo Reviewer** | — | `ScanSearch` | `/resources/repo-review` |
| N16 | **Meet/Game Countdown** | — | `Hourglass` | `/resources/countdown` |
| N17 | **Daily Check-in** | — | `ClipboardCheck` | `/resources/checkin` |
| N18 | **Quick Notes** | — | `StickyNote` | `/resources/notes` |
| N19 | **Bell Schedule** | — | `Bell` | `/resources/schedule` |

**Keyword aliases for fuzzy matching:**

| Action | Also matches |
| :--- | :--- |
| Go home | "chat", "home" |
| Tools | "grid", "dashboard", "apps", "all tools" |
| Saved items | "history", "recent", "bookmarks", "everything" |
| Prompt library | "prompts", "templates", "reusable" |
| Reading list | "articles", "reads", "queue", "read later" |
| Settings | "preferences", "config", "profile", "account" |
| Flashcard Generator | "anki", "cards", "study", "memorize" |
| Grade Calculator | "gpa", "finals", "grades", "calculator" |
| Workout Logger | "gym", "exercise", "sets", "training", "lifting" |
| Meal Logger | "food", "calories", "nutrition", "macros" |
| Repo Scanner | "github", "repository", "codebase", "scan repo" |
| Habit Streaks | "streaks", "daily", "routines", "checkins" |
| Article Notes | "articles", "read later", "summarize", "url" |
| Race Pace Calculator | "track", "running", "splits", "PR", "200m", "400m" |
| Repo Reviewer | "code review", "audit", "analysis", "review repo" |
| Meet/Game Countdown | "countdown", "race day", "events", "meet" |
| Daily Check-in | "mood", "journal", "reflect", "rate day" |
| Quick Notes | "note", "capture", "jot", "scratch" |
| Bell Schedule | "periods", "classes", "school", "timetable", "NAHS" |

---

### 2. Create

Quick-create a new item. Most open an inline popover/modal at the current location (don't navigate away). A few that need full-page context navigate instead.

**Inline create actions (open popover):**

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| C1 | **New chat** | `Cmd+N` | `MessageSquarePlus` | Start a fresh conversation. Clear the current chat panel, assign a new conversation ID. |
| C2 | **New note** | `Cmd+Shift+N` | `StickyNote` | Open Quick Notes popover inline. Title + body. Save creates a `note` resource, popover closes. |
| C3 | **New flashcard set** | — | `Brain` | Open Flashcard Generator popover. Textarea for pasting notes → generate on submit. |
| C4 | **New race result** | — | `Flag` | Open Race Pace Calculator popover in "Log a result" mode. Distance, time, meet name, PR toggle. |
| C5 | **New check-in** | — | `ClipboardCheck` | Open Daily Check-in popover. 1-5 rating + optional note. |
| C6 | **New meal** | — | `Utensils` | Open Meal Logger popover with description input focused. |
| C7 | **New workout** | — | `Dumbbell` | Open Workout Logger popover with exercise input focused. |
| C8 | **New habit** | — | `Target` | Open Habit Streaks popover with "new habit name" input focused. |
| C9 | **New countdown** | — | `Hourglass` | Open Meet/Game Countdown popover in create mode. Event name, date, type, location. |
| C10 | **New prompt** | — | `BookMarked` | Open Prompt Library save form inline. Body textarea + category picker + tags. |
| C11 | **New article** | — | `Newspaper` | Open Article Notes popover with URL input focused. Paste URL → fetch + summarize. |

**Create actions that navigate (full-page context required):**

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| C12 | **New grade calc** | — | `Calculator` | Navigate to `/resources/grade-calculator` — needs full page for the class grid. |
| C13 | **New repo scan** | — | `GitBranch` | Navigate to `/resources/repo-scanner` — needs full page for chat + file tree. |
| C14 | **New repo review** | — | `ScanSearch` | Navigate to `/resources/repo-review` — needs full page for results display. |
| C15 | **New bell schedule** | — | `Bell` | Navigate to `/resources/schedule` — needs full page for the period grid. |

---

### 3. Search

Semantic and full-text search across enry.agent's data.

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| S1 | **Search prompts** | — | `BookMarked` | Navigate to `/prompts` with the search box focused. If already on `/prompts`, just focus the search input. |
| S2 | **Search articles** | — | `Newspaper` | Navigate to `/resources/articles` with the saved-list search focused. |
| S3 | **Search memories** | — | `Brain` | Open a search modal that queries Supabase via `/api/memories/search` (semantic search over the `memories` table with bge-m3 embeddings). Results appear inline in the palette — select one to jump to the chat where it was saved, or open it in a detail view. |
| S4 | **Search everything** | — | `Search` | Full-text search across all `resources` table rows (titles + payloads). Results grouped by type with a colored label badge. Selecting a result navigates to its resource detail page. |
| S5 | **Search conversations** | — | `MessageCircle` | Fuzzy-search chat titles from the `conversations` table. Selecting a result sets that conversation as active and loads its messages. Search runs against the `conversations.title` column. |

**Aliases:**

| Action | Also matches |
| :--- | :--- |
| Search prompts | "find prompt", "prompt search", "look up prompt" |
| Search articles | "find article", "article search", "saved articles", "reading list search" |
| Search memories | "recall", "remember", "memory search", "what did I say about", "past context" |
| Search everything | "find anything", "global search", "all resources", "search all" |
| Search conversations | "chat history", "past chats", "find conversation", "old chats" |

---

### 4. Settings / System

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| Y1 | **Toggle theme** | `Cmd+Shift+D` | `SunMoon` | Toggle between dark and light mode. Persist preference to localStorage (`theme` key: `"dark"` / `"light"`) and sync to user profile. Instant transition — no page reload. |
| Y2 | **Keyboard shortcuts** | `Cmd+/` (when palette closed) | `Keyboard` | Open a modal or slide-out panel showing all shortcuts in a scannable table. When the palette is open, `?` or `Cmd+/` shows the palette's own shortcut help. |
| Y3 | **Sign out** | — | `LogOut` | Sign out via NextAuth. Show a confirmation: "Sign out? Your data is safe — sign back in anytime." One-step confirm (Enter to confirm, Escape to cancel). |
| Y4 | **View GitHub** | — | `ExternalLink` | Open `https://github.com/henry/enry.agent` in a new tab. |

**Aliases:**

| Action | Also matches |
| :--- | :--- |
| Toggle theme | "dark mode", "light mode", "appearance", "color scheme" |
| Keyboard shortcuts | "hotkeys", "shortcuts", "cheatsheet", "help", "keybindings" |
| Sign out | "logout", "exit", "disconnect", "signoff" |
| View GitHub | "repo", "source", "open source", "code", "github" |

---

## Suggested Actions (pre-type state)

When the palette opens with no query and the user has no recents (or below the recents section), show these 8 actions ranked by the scoring algorithm. This is the default sort order for a first-time user — recency/frequency will reorder it naturally over time.

| # | Action | Category | Why suggested |
| :--- | :--- | :--- | :--- |
| 1 | **New chat** | Create | Most common action. Always relevant. |
| 2 | **New note** | Create | Lowest-friction capture — second most useful quick-create. |
| 3 | **Go home** | Navigate | Universal escape hatch. |
| 4 | **Tools** | Navigate | Gateway to every tool. |
| 5 | **Search everything** | Search | Catch-all for "I don't know where it is." |
| 6 | **Search conversations** | Search | "What was that chat about…" |
| 7 | **Toggle theme** | System | Low-frequency but people hunt for it. |
| 8 | **Keyboard shortcuts** | System | Discovery — teaches the user everything else. |

After the first week of usage, recency/frequency scoring will naturally push this list toward Henry's actual habits. The algorithm should let it evolve without manual curation.

---

## Recents

The 3-5 most recently selected actions appear in their own section above suggestions, labeled with a `Clock` icon and "Recent" header.

Behavior:
- **Dedup**: If the same action appears multiple times in history, show only the most recent.
- **Order**: Most recent first.
- **Persistence**: `localStorage` key `cmd-k-history`. Survives page reloads and browser restarts.
- **Lifespan**: Keep the last 50 selections. Trim older entries.

If the user's history is empty (first session or cleared storage), hide the Recents section entirely.

---

## Bonus: Typing Patterns (Linear / Raycast Inspiration)

These power-user patterns make the palette feel fast. Implement if they accelerate the build — they're polish, not blockers.

### Namespace prefixes

Typing a prefix narrows the result set before fuzzy matching:

| Prefix | Restricts to | Example |
| :--- | :--- | :--- |
| `>` | Create actions only | `> note` → only shows "New note", "New notebook" |
| `@` | Navigate (jump to page) | `@ fla` → "Flashcard Generator" |
| `?` | Settings / System | `? theme` → "Toggle theme" |
| `/` | Search actions | `/ memories` → "Search memories" |

These are discoverable via the "Keyboard shortcuts" modal — list them there with a description. Don't add prefix hints to the empty state (too noisy). Power users find them or learn via the shortcuts panel.

### Quick-submit shortcuts

| When | Press | Behavior |
| :--- | :--- | :--- |
| A single result is highlighted | `Enter` | Execute and close |
| Multiple results, first is highlighted | `Enter` | Execute the first result |
| Multiple results, another is highlighted | `Enter` | Execute the highlighted result |
| Palette is open, any state | `Cmd+Enter` | Execute the top result regardless of highlight |
| Palette is open, any state | `Escape` | Close, no action |
| Palette is open, any state | `Cmd+K` | Close (toggle off) |

### Category jump

Typing a category name followed by a space jumps to that section:

| Type | Result |
| :--- | :--- |
| `navigate` + space | Show all Navigate actions only |
| `create` + space | Show all Create actions only |
| `search` + space | Show all Search actions only |
| `settings` + space | Show all Settings / System actions only |

This is a secondary discoverability path — namespace prefixes (`>`, `@`, `?`, `/`) are the primary one.

### No-results state

If the query returns zero matches:

```
No results for "asdfgh"

Try a different search, or:
  New chat        Cmd+N
  Search everything
  Keyboard shortcuts
```

Provide 2-3 fallback actions so the user never hits a dead end. Never show "No results found." alone.

---

## Summary Counts

| Category | Count |
| :--- | :---: |
| Navigate | 19 |
| Create | 15 |
| Search | 5 |
| Settings / System | 4 |
| **Total actions** | **43** |

Of the 43, roughly 15 will be daily-drivers, 10 weekly, and the rest occasional.
The palette's job: make the 15 feel instant and the 43 feel effortless to find.

---

## Keyboard Shortcut Reference (consolidated)

| Shortcut | Action | Category |
| :--- | :--- | :--- |
| `Cmd+K` | Open / close command palette | — |
| `Cmd+N` | New chat | Create |
| `Cmd+Shift+N` | New note | Create |
| `Cmd+Shift+H` | Go home | Navigate |
| `Cmd+Shift+T` | Tools grid | Navigate |
| `Cmd+Shift+D` | Toggle theme | System |
| `Cmd+,` | Settings | Navigate |
| `Cmd+/` | Keyboard shortcuts (when palette closed) | System |

These 8 shortcuts cover the highest-frequency actions. Everything else is reachable through the palette in 2-3 keystrokes.

---

## Implementation Notes

### Icons

All icons are from `lucide-react`. The icon mapping should be exported as a shared constant so both the command palette and the tools grid use the same icon per tool. Single source of truth.

```ts
// Proposed: src/lib/tool-icons.ts (or inline in a shared registry)
import {
  Brain, Calculator, Dumbbell, Utensils, GitBranch, Target,
  Timer, ScanSearch, Hourglass, ClipboardCheck, StickyNote, Bell,
} from 'lucide-react'

export const TOOL_ICON: Record<string, typeof Brain> = {
  flashcards: Brain,
  grade_calc: Calculator,
  workout: Dumbbell,
  meal: Utensils,
  repo_scan: GitBranch,
  habit_streak: Target,
  race_pace: Timer,
  repo_review: ScanSearch,
  countdown: Hourglass,
  checkin: ClipboardCheck,
  note: StickyNote,
  bell_schedule: Bell,
}
```

### Create popovers

For inline create actions (C1-C11), the popover should:
- Open with a subtle scale-in animation (150ms spring)
- Focus the primary input on open
- Support `Escape` to close without saving
- Support `Cmd+Enter` to submit
- Show a small toast or inline confirmation on successful save
- Not navigate the user away from their current page

### Search debouncing

- Search actions (S1-S5) should debounce input by 200ms before firing API calls.
- Show a `Loader2` spinner in the search input while a query is in-flight.
- Cancel in-flight requests when the query changes (use `AbortController`).

### Accessibility

- The palette dialog should trap focus.
- `aria-label` on the dialog: "Command palette"
- Each action item should have an `aria-label` matching its visible label.
- Category group headings should use `role="presentation"` since cmdk handles group labeling internally.
- Keyboard navigation: `↑` / `↓` to move, `Enter` to select, `Escape` to close.
