# Error Copy Reference

Friendlier, action-oriented error messages for every tool in enry.agent.
Tone: dark, direct, no corporate-speak, no exclamation points.

Each template follows: what happened → what to do about it.

---

## Shared / Cross-Tool Errors

These apply to all tools. Use these instead of tool-specific variants
where the error is generic (network, auth, etc.).

### Network / Connection

| Scenario | Current (if any) | Proposed |
| :--- | :--- | :--- |
| Fetch fails (offline, DNS, timeout) | "Network error" / "Network error. Check your connection and try again." | **"Can't reach the server. Check your connection and try again."** |
| Slow response (>15s) | *(none — hangs silently)* | **"Taking longer than usual. The server might be under load — retrying is faster than waiting."** |

### Auth

| Scenario | Current (if any) | Proposed |
| :--- | :--- | :--- |
| 401 / session expired | *(none — redirects to login silently)* | **"Session expired. The page will reload — you won't lose anything."** |
| 403 / permission denied | *(none)* | **"You don't have access to this. Sign in with the right account and try again."** |

### Server

| Scenario | Current (if any) | Proposed |
| :--- | :--- | :--- |
| 500 / server error | "Something went wrong. Try again." | **"The server hit an error. This is usually temporary — try again in a moment."** |
| 503 / overloaded | *(none)* | **"Server is at capacity. Wait a few seconds and retry."** |
| Rate limited (429) | *(none)* | **"Too many requests. Give it a few seconds before the next one."** |

---

## 1. Flashcard Generator

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| AI generation fails (non-ok response) | `err.message` or "Generation failed" | **"The model couldn't generate cards. Try shorter notes, or break them into smaller chunks."** |
| Response can't be parsed | "Could not parse flashcards from response" | **"Got a response, but couldn't extract cards from it. Try again — sometimes the model needs a second pass."** |
| Empty notes submitted | *(none — button disabled)* | *(no change needed)* |
| DB save fails (saveResource) | *(silent)* | **"Cards generated, but couldn't save to your library. Your cards are still visible — try saving again."** |

---

## 2. Grade Calculator

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| Save fails (PUT /api/tools/grades) | `err.message` or "Save failed" | **"Couldn't save your grades. Check your connection and try again — your data is still in the form."** |
| Load fails on mount | "Failed to load saved grades" | **"Couldn't load your saved grades. Your previous data is safe — refreshing the page usually fixes this."** |

---

## 3. Workout Logger

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| Log fails (POST /api/tools/workouts) | `err.message` or "Failed to log workout" | **"Didn't save this workout. Try again — the data is still in the form."** |
| Delete fails | `err.message` or "Failed to delete workout" | **"Couldn't delete this entry. It might already be gone — refresh the page to check."** |
| Load fails on mount | "Failed to load workouts" | **"Couldn't load your workout history. Refreshing the page usually fixes this."** |

---

## 4. Meal Logger

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| AI macro estimation returns nothing | "Could not estimate macros — try adding explicit numbers like \"calories: 400, protein: 30\"" | *(keep this — already good and actionable)* |
| Log fails (POST /api/tools/meals) | `err.message` or "Failed to log meal" | **"Didn't save this meal. Try again — your input is still in the box."** |
| Delete fails | `err.message` or "Failed to delete meal" | **"Couldn't delete this meal. It might already be gone — reload to check."** |
| Load fails on mount | "Failed to load meals" | **"Couldn't load today's meals. Refreshing the page usually fixes this."** |

---

## 5. Repo Scanner

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| Fetch fails (invalid URL, private repo, rate limit) | `err.message` or "Failed to fetch repo" | **"Couldn't fetch this repo. Make sure the URL is public and the repo exists."** |
| GitHub API rate limited | *(shows generic error)* | **"GitHub is rate limiting this request. Wait a minute and try again."** |
| Chat fails | "Chat failed. Try again." | **"The model didn't respond. Try asking again — sometimes it takes a second pass."** |
| Repo too large (file tree > limit) | *(silent — truncated to 100 files)* | *(no change needed — truncation is a feature, not an error)* |

---

## 6. Habit Streaks

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| Add habit fails (POST /api/tools/habits) | `err.message` or "Failed to add habit" | **"Couldn't create this habit. Try again — the name is still in the input."** |
| Toggle check-in fails (POST /api/tools/habit-logs) | `err.message` or "Failed to toggle habit" | **"Check-in didn't register. Tap again — it should go through on retry."** |
| Delete fails | `err.message` or "Failed to delete habit" | **"Couldn't delete this habit. It might already be removed — refresh to check."** |

---

## 7. Prompt Library

### Full page (`/prompts`)

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| Title empty | "Title is required." | *(keep)* |
| Body empty | "Body is required." | *(keep)* |
| Save fails (POST/PUT /api/resources) | `data.error` or "Save failed." | **"Couldn't save this prompt. Check your connection and try again."** |
| Network error during save | "Network error. Try again." | **"Can't reach the server. Check your connection and try again."** |

### Inline launcher (`/resources/prompts`)

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| Save fails (POST /api/resources) | "Something went wrong. Try again." | **"Couldn't save this prompt. Check your connection and try again."** |
| Network error | "Network error. Check your connection and try again." | *(keep — already fine)* |

---

## 8. Article Notes

| Trigger | Current Message | Proposed Message |
| :--- | :--- | :--- |
| Invalid URL | "Enter a valid URL starting with http:// or https://" | *(keep)* |
| Server returns error during ingest | `data.error` or "Something went wrong. Try again." | **"Couldn't process this article. It might be behind a paywall or the site blocks scraping. Try a different article."** |
| Network error during ingest | "Network error. Check your connection and try again." | **"Connection dropped while processing. Hit generate again — it usually works on retry."** |
| Note generation failed (partial save) | "Note generation failed — the article was saved but is missing the summary and flashcards. You can delete it and retry." | *(keep — this is good copy)* |

---

## Tone Guide

- **No exclamation points.** Even for success states. "Saved." not "Saved!"
- **No corporate-speak.** Never "We encountered an unexpected error" or "Please try again later."
- **One sentence, two max.** Users read short copy. Frontload the action.
- **Be honest about severity.** If it's temporary, say so. If they should retry, say so. If they should try something different, tell them what.
- **Don't blame the user.** "You entered an invalid URL" → "Make sure the URL is public and the repo exists."
- **Dark mode vibe.** The app is minimal and desaturated. Copy should feel the same. No emoji, no chirpy tone.
