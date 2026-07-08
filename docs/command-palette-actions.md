# Command Palette Action Catalog

> Cmd+K command palette. Aesthetic: Linear / Raycast / Superhuman —
> dense, useful, keyboard-first. No fluff commands, no nested menus.
> Every action should feel like muscle memory after the second use.

---

## UX Architecture

### Opening behavior

- **Trigger:** `Cmd+K` (Mac) / `Ctrl+K` (Windows)
- **Empty state (before typing):** Show the "Suggested" list below — 6-8
  most-likely actions ranked by recency and frequency
- **On type:** Fuzzy-filter across all action names and keywords. Results
  grouped by category with a separator line. Exact matches sort first.
- **On select:** Execute immediately. Close the palette. No confirmation
  dialogs unless the action is destructive (e.g., sign out).
- **On Escape:** Close with no action. Restore focus to whatever had it
  before the palette opened.

### Ranking algorithm (conceptual)

Actions are scored by:
1. **Recency** — last-used timestamp, weighted by 0.7
2. **Frequency** — total invocation count, weighted by 0.3
3. **Context** — if user is on `/resources/flashcards`, "New flashcard set"
   gets a boost

The 6-8 highest-scoring actions appear as suggestions before any typing.

---

## Action Categories

### 1. Navigate

Jump to any page or tool. One action per destination.

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
| Tools | "grid", "dashboard", "apps" |
| Saved items | "history", "recent", "bookmarks" |
| Prompt library | "prompts", "templates", "reusable" |
| Reading list | "articles", "reads", "queue" |
| Settings | "preferences", "config", "profile" |
| Flashcard Generator | "anki", "cards", "study", "memorize" |
| Grade Calculator | "gpa", "finals", "grades", "calculator" |
| Workout Logger | "gym", "exercise", "sets", "training" |
| Meal Logger | "food", "calories", "nutrition", "macros" |
| Repo Scanner | "github", "repository", "codebase" |
| Habit Streaks | "streaks", "daily", "routines" |
| Article Notes | "articles", "read later", "summarize" |
| Race Pace Calculator | "track", "running", "splits", "PR" |
| Repo Reviewer | "code review", "audit", "analysis" |
| Meet/Game Countdown | "countdown", "race day", "events" |
| Daily Check-in | "mood", "journal", "reflect" |
| Quick Notes | "note", "capture", "jot", "scratch" |
| Bell Schedule | "periods", "classes", "school", "timetable" |

---

### 2. Create

Quick-create a new item without navigating to the tool first. These open
a modal/popover at the current location (don't navigate away).

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| C1 | **New chat** | `Cmd+N` | `MessageSquarePlus` | Start a fresh conversation. Clear the current chat panel, assign a new conversation ID. |
| C2 | **New note** | `Cmd+Shift+N` | `StickyNote` | Open a Quick Notes popover inline. Save creates a `note` resource. |
| C3 | **New flashcard set** | — | `Brain` | Open the Flashcard Generator popover. Paste notes → generate. |
| C4 | **New race result** | — | `Flag` | Open the Race Pace Calculator in "Log a result" mode. |
| C5 | **New check-in** | — | `ClipboardCheck` | Open the Daily Check-in popover. |
| C6 | **New meal** | — | `Utensils` | Open the Meal Logger popover with the input focused. |
| C7 | **New workout** | — | `Dumbbell` | Open the Workout Logger popover with the exercise input focused. |
| C8 | **New habit** | — | `Target` | Open the Habit Streaks popover with the "new habit" input focused. |
| C9 | **New countdown** | — | `Hourglass` | Open the Meet/Game Countdown popover in create mode. |
| C10 | **New prompt** | — | `BookMarked` | Open the Prompt Library popover (inline save form). |
| C11 | **New article** | — | `Newspaper` | Open the Article Notes popover with the URL input focused. |

**Create actions that navigate (because they need full-page context):**

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| C12 | **New grade calc** | — | `Calculator` | Navigate to `/resources/grade-calculator` — needs full page for the class grid. |
| C13 | **New repo scan** | — | `GitBranch` | Navigate to `/resources/repo-scanner` — needs full page for chat + file tree. |
| C14 | **New repo review** | — | `ScanSearch` | Navigate to `/resources/repo-review` — needs full page for results. |
| C15 | **New bell schedule** | — | `Bell` | Navigate to `/resources/schedule` — needs full page for the period grid. |

---

### 3. Search

Semantic and full-text search across enry.agent's data.

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| S1 | **Search prompts** | — | `BookMarked` | Navigate to `/prompts` with the search box focused. If already on `/prompts`, just focus the search input. |
| S2 | **Search articles** | — | `Newspaper` | Navigate to `/resources/articles` with the saved-list search focused. |
| S3 | **Search memories** | — | `Brain` | Open a search modal that queries Supabase via `/api/memories` (semantic search over the `memories` table). Results appear inline in the palette — select one to jump to the chat where it was saved, or open it in a detail view. |
| S4 | **Search everything** | — | `Search` | Full-text search across all `resources` table rows (titles + payloads). Results grouped by type with a label badge. Selecting a result navigates to its resource detail page. |
| S5 | **Search conversations** | — | `MessageCircle` | Fuzzy-search chat titles from the `conversations` table. Selecting a result sets that conversation as active. |

**Aliases:**
| Action | Also matches |
| :--- | :--- |
| Search prompts | "find prompt", "prompt search" |
| Search articles | "find article", "article search", "saved articles" |
| Search memories | "recall", "remember", "memory search", "what did I say about" |
| Search everything | "find anything", "global search", "all resources" |
| Search conversations | "chat history", "past chats", "find conversation" |

---

### 4. Settings / System

| # | Action | Shortcut | Icon | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| Y1 | **Toggle theme** | `Cmd+Shift+D` | `SunMoon` | Toggle between dark and light mode. Persist preference to localStorage or the user profile. |
| Y2 | **Keyboard shortcuts** | `Cmd+/` (when palette closed) | `Keyboard` | Open a modal or slide-out panel showing all shortcuts. When the palette is open, this action is shadowed — use the palette's own shortcut help (? or Cmd+/) instead. |
| Y3 | **Sign out** | — | `LogOut` | Sign out. Show a confirmation: "Sign out? Your data is safe — sign back in anytime." One-step confirm (Enter to confirm, Escape to cancel). |
| Y4 | **View GitHub** | — | `ExternalLink` | Open `https://github.com/henry/enry.agent` in a new tab. |

**Aliases:**
| Action | Also matches |
| :--- | :--- |
| Toggle theme | "dark mode", "light mode", "appearance" |
| Keyboard shortcuts | "hotkeys", "shortcuts", "cheatsheet", "help" |
| Sign out | "logout", "exit", "disconnect" |
| View GitHub | "repo", "source", "open source", "code" |

---

## Suggested Actions (pre-type state)

When the palette opens with no query, show these 6-8 actions ranked by
the scoring algorithm. This list is the default sort order — recency/frequency
will reorder it over time, but the first-open experience starts here.

| # | Action | Category | Why suggested |
| :--- | :--- | :--- | :--- |
| 1 | **New chat** | Create | Most common action. Always relevant. |
| 2 | **New note** | Create | Low-friction capture — second most useful quick-create. |
| 3 | **Go home** | Navigate | Always a destination. |
| 4 | **Tools** | Navigate | Gateway to everything else. |
| 5 | **Search everything** | Search | Catch-all fallback for "I don't know where it is." |
| 6 | **Search conversations** | Search | "What was that chat about…" |
| 7 | **Toggle theme** | System | Low-frequency but people look for it. |
| 8 | **Keyboard shortcuts** | System | Discovery — helps users learn the rest. |

After the first week of usage, recency/frequency will naturally push this
list toward Henry's actual habits. Let it evolve.

---

## Bonus: Typing Patterns (Linear / Raycast Inspiration)

These are power-user patterns that make the palette feel fast rather
than merely functional. Implement them if they accelerate the build —
they're polish, not blockers.

### Namespace prefixes

Typing a prefix narrows the result set before fuzzy matching:

| Prefix | Restricts to | Example |
| :--- | :--- | :--- |
| `>` | Create actions only | `> note` → only shows "New note" |
| `@` | Navigate (jump to page) | `@ fla` → "Flashcard Generator" |
| `?` | Settings / System | `? theme` → "Toggle theme" |
| `/` | Search actions | `/ memories` → "Search memories" |

These are discoverable via the "Keyboard shortcuts" modal — list them there.
Don't add prefix hints to the empty state (too busy). Let power users find
them or teach them via the shortcuts panel.

### Quick-submit shortcuts

| When | Press | Behavior |
| :--- | :--- | :--- |
| A single result is highlighted | `Enter` | Execute and close |
| Multiple results, first is highlighted | `Enter` | Execute the first result |
| Multiple results, another is highlighted | `Enter` | Execute the highlighted result |
| Palette is open, any state | `Cmd+Enter` | Execute the top result regardless of highlight |
| Palette is open, any state | `Escape` | Close, no action |

### History and dedup

- The palette keeps a local LRU cache of the last 50 selected actions
  (in localStorage).
- If the user selects "New note," and there are 3 existing notes in the
  suggestions list, don't show "New note" twice. The action takes priority —
  dedup by removing the duplicate.

### No-results state

If the query returns zero matches:

```
No results for "asdfgh"

Try a different search, or:
  New chat        Cmd+N
  Search everything
  Keyboard shortcuts
```

Two fallback actions, no dead end. Never show "No results found." alone.

---

## Summary Counts

| Category | Count |
| :--- | :---: |
| Navigate | 19 |
| Create | 15 |
| Search | 5 |
| Settings / System | 4 |
| **Total actions** | **43** |

Of the 43, ~15 will be used daily, ~10 weekly, and the rest occasionally.
The palette's job is to make the 15 feel instant and the 43 feel discoverable
without being overwhelming.

---

## Keyboard Shortcut Reference (consolidated)

| Shortcut | Action | Category |
| :--- | :--- | :--- |
| `Cmd+K` | Open command palette | — |
| `Cmd+N` | New chat | Create |
| `Cmd+Shift+N` | New note | Create |
| `Cmd+Shift+H` | Go home | Navigate |
| `Cmd+Shift+T` | Tools grid | Navigate |
| `Cmd+Shift+D` | Toggle theme | System |
| `Cmd+,` | Settings | Navigate |
| `Cmd+/` | Keyboard shortcuts (when palette closed) | System |

These 8 shortcuts cover the highest-frequency actions. Everything else is
reachable through the palette in 2-3 keystrokes.
