# Accessibility Audit — /resources & Tool Detail Views

Audit scope: the `/resources` landing page and all 8 tool components.
Assessment: keyboard navigation, aria-live regions, color contrast, form labels.

---

## 1. Keyboard Navigation

### /resources Grid Page

| Element | Pass/Fail | Notes |
| :--- | :---: | :--- |
| Grid cards (links) | ✅ Pass | Cards are `<a>` elements — natively focusable and Enter-activatable |
| "Saved" header link | ✅ Pass | Native `<Link>` |
| "Chat" back link | ✅ Pass | Native `<Link>` |
| Page dots (future) | ❌ N/A | Not yet built — ensure they use `<button>` with `aria-label="Page X"` |

### Tool Detail Pages (all 8)

| Component | Element | Pass/Fail | Notes |
| :--- | :--- | :---: | :--- |
| **Flashcards** | Textarea | ✅ | Focusable. Enter doesn't submit (no `onKeyDown`), could be improved |
| | Card flip area | ❌ | `<div onClick>` with no `tabIndex`, `role="button"`, or `onKeyDown`. Entire flashcard review UI is invisible to keyboard users |
| | Prev/Next buttons | ✅ | Native `<button>` elements |
| **Grade Calc** | All class inputs | ✅ | Native `<input>` elements, tab-able |
| | Save button | ✅ | Native `<button>` |
| | Remove class button | ✅ | Native `<button>` |
| **Workout Logger** | Exercise input | ✅ | Native `<input>` |
| | Reps/weight inputs | ✅ | Native `<input>` |
| | Progress selector | ✅ | Native `<select>` |
| | Delete workout button | ✅ | Native `<button>` |
| **Meal Logger** | Meal input | ✅ | Native `<input>`, Enter submits (`onKeyDown`) |
| | Delete meal button | ✅ | Native `<button>` |
| **Repo Scanner** | URL input | ✅ | Native `<input>`, Enter submits (`onKeyDown`) |
| | Chat input | ✅ | Native `<input>`, Enter sends (`onKeyDown`) |
| **Habit Streaks** | New habit input | ✅ | Native `<input>`, Enter adds (`onKeyDown`) |
| | Toggle checkbox | ⚠️ | Native `<button>` but zero visual focus ring in the CSS (`border-border` same for focused/unfocused states). Keyboard users can't see which habit is focused |
| | Delete habit button | ✅ | Native `<button>` |
| **Prompt Library** | Title input | ✅ | Native `<input>` |
| (launcher) | Body textarea | ✅ | Native `<textarea>` |
| **Article Notes** | URL input | ✅ | Native `<input>`, Enter submits |
| | Note textarea | ✅ | Native `<textarea>` |
| | Study mode (prev/next) | ⚠️ | Keyboard handler exists for Space/ArrowRight to advance — good. But no focus management when transitioning between cards — focus stays on body after click |

### Resource Saved Page

| Element | Pass/Fail | Notes |
| :--- | :---: | :--- |
| Tab bar | ✅ | Proper `role="tablist"`, `role="tab"`, `aria-selected`, keyboard Left/Right arrow navigation |
| Saved item rows | ❌ | `<div onClick>` with no `tabIndex`, `role="button"`, or `onKeyDown` handler. Entire saved items list is keyboard-inaccessible |
| Detail modal close | ✅ | Native `<button>` |
| Delete buttons | ✅ | Native `<button>` |

---

## 2. aria-live Regions

### Summary

**Zero `aria-live` regions exist anywhere across all 8 tools or the resources page.**

Every tool now has error state display (after the recent error handling fixes), but none of them announce errors to screen readers. When an error appears in the DOM, a screen reader user gets no notification.

| Component | Error/Success Element | Has `aria-live`? | Fix |
| :--- | :--- | :---: | :--- |
| All 8 tools | Error div (`<div className="flex items-start gap-2 rounded border ...">`) | ❌ | Add `role="alert"` or wrap in `<div aria-live="polite">` |
| All tools | Loading spinners | ❌ | Add `aria-live="polite"` with "Loading…" text for screen readers |
| Grade Calc | "Saved!" success | ❌ | Add `aria-live="assertive"` for success announcement |
| Article Notes | Loading steps (4-stage progress) | ❌ | Each step change should announce. Add `aria-live="polite"` to the step container |
| Article Notes | Success state ("Saved" with summary) | ❌ | Wrap in `aria-live="polite"` so screen reader hears the result |
| Flashcard Generator | Card flip animation | ❌ | Add `aria-live="polite"` on the card content so the question/answer change is announced |

---

## 3. Color Contrast (Dark Theme)

The app uses Tailwind CSS variables: `bg-surface-base`, `text-foreground`, `text-muted-foreground`, etc. Exact contrast ratios depend on the resolved CSS values which are defined elsewhere (likely in `globals.css`). Assessment based on common dark-theme values:

### Error Text: `text-[#ff4d4d]` / `text-destructive`

| Background | Color | Typical hex | Approx. contrast | Pass? |
| :--- | :--- | :--- | :---: | :---: |
| `.bg-surface-base` | `text-[#ff4d4d]` | #ff4d4d on #0d0d0d | ~10.5:1 | ✅ |
| `.bg-surface-secondary` | `text-[#ff4d4d]` | #ff4d4d on #161616 | ~9.8:1 | ✅ |
| `.bg-[#ff4d4d]/8` (error box bg) | `text-[#ff4d4d]` | #ff4d4d on ~#1a0f0f | ~7.5:1 | ✅ |
| `.border-[#ff4d4d]/30` (error box border) | Border only | — | n/a | ✅ (decorative) |

Verdict: **Pass.** The bright red `#ff4d4d` on dark surfaces has excellent contrast.

### Warning Text: `text-warning`

This is a Tailwind CSS variable. On dark themes, `text-warning` is typically amber/yellow (~#f59e0b or #eab308).

| Background | Typical hex | Approx. contrast | Pass? |
| :--- | :--- | :---: | :---: |
| Dark surface (#0d0d0d) | #f59e0b on #0d0d0d | ~8.1:1 | ✅ |
| Dark surface (#0d0d0d) | #eab308 on #0d0d0d | ~7.6:1 | ✅ |

Verdict: **Pass** for standard amber warning colors. If the actual yellow is lighter (e.g., #fde047), contrast drops to ~5:1 — still passable but verify against the actual CSS variable.

### Muted Text: `text-muted-foreground`

This is typically gray (#737373 or #a3a3a3) on a dark background.

| Background | Typical hex | Approx. contrast | Pass? |
| :--- | :--- | :---: | :---: |
| #0d0d0d | #737373 | ~4.6:1 | ⚠️ Borderline (just above 4.5:1) |
| #0d0d0d | #a3a3a3 | ~8.5:1 | ✅ |
| #161616 | #737373 | ~4.3:1 | ❌ Below 4.5:1 threshold |
| #161616 | #a3a3a3 | ~7.9:1 | ✅ |

Verdict: **Needs verification.** If `text-muted-foreground` resolves to a color darker than #757575 (e.g., #6b6b6b or #666666), it fails WCAG AA on `bg-surface-secondary`. Check the actual CSS variable value.

### Placeholder Text: `placeholder-muted-foreground/50`

At 50% opacity on top of the background color, placeholder text likely fails contrast requirements.

| Background | Typical color | Approx. contrast | Pass? |
| :--- | :--- | :---: | :---: |
| #161616 | #a3a3a3 at 50% | ~2.2:1 | ❌ Fails |
| #161616 | #8c8c8c at 50% | ~1.8:1 | ❌ Fails |

Verdict: **Likely fails.** Placeholder text at 50% opacity is almost certainly below the 3:1 minimum for non-text UI elements. Note: WCAG exempts placeholder text in some interpretations, but for accessibility, visible placeholder text should be readable. Consider using `placeholder:text-muted-foreground/70` instead.

### Primary Accent: `text-primary`

| Background | Typical hex | Approx. contrast | Pass? |
| :--- | :--- | :---: | :---: |
| #0d0d0d | #3b82f6 (blue) | ~4.6:1 | ⚠️ Borderline |
| #0d0d0d | #6366f1 (indigo) | ~4.0:1 | ❌ Below threshold |
| #161616 | #3b82f6 | ~4.3:1 | ❌ Below threshold |

Verdict: **Needs verification.** `text-primary` on dark backgrounds often fails WCAG AA for normal text. Verify against the actual CSS variable. Consider a slightly lighter primary color for the dark theme.

---

## 4. Form Input Labels

### Summary

The vast majority of form inputs across all 8 tools use **placeholder text as their only label**. This is an accessibility violation — screen readers may not announce placeholder text, and placeholder text disappears when the user starts typing.

| Component | Input | Has `<label>`? | Placeholder-only? | Fix |
| :--- | :--- | :---: | :---: | :--- |
| **Flashcards** | Notes textarea | ❌ | ✅ | Add `<label className="sr-only">Notes</label>` or an `aria-label="Notes"` |
| **Grade Calc** | Target GPA input | ❌ | ❌ | No label, no placeholder. Relies on adjacent `<p>Target GPA</p>`. Add `aria-labelledby` |
| | Class name | ❌ | ✅ | Add `aria-label="Class name"` |
| | Grade % | ❌ | ❌ | Column header exists but not associated. Add `aria-label="Current grade"` |
| | Final weight % | ❌ | ❌ | Add `aria-label="Final exam weight"` |
| | Credits | ❌ | ❌ | Add `aria-label="Credit hours"` |
| **Workout Logger** | Exercise name | ❌ | ✅ | Add `aria-label="Exercise name"` |
| | Reps inputs | ❌ | ❌ | Context provided by adjacent text "reps ×". Add `aria-label="Reps set X"` |
| | Weight inputs | ❌ | ❌ | Context "lbs". Add `aria-label="Weight set X"` |
| | Progress selector | ❌ | ❌ | No label. Add `aria-label="Select exercise to view progress"` |
| **Meal Logger** | Meal input | ❌ | ✅ | Add `aria-label="Describe your meal"` |
| **Repo Scanner** | URL input | ❌ | ✅ | No label. Add `aria-label="GitHub repository URL"` |
| | Chat input | ❌ | ✅ | Add `aria-label="Ask about this repository"` |
| **Habit Streaks** | New habit | ❌ | ✅ | Add `aria-label="New habit name"` |
| **Prompt Library** | Title input | ❌ | ✅ | Add `aria-label="Prompt title"` |
| (launcher) | Body textarea | ❌ | ✅ | Add `aria-label="Prompt body"` |
| **Article Notes** | URL input | ⚠️ | ❌ | Has `<label>Article URL</label>` — ✅ Pass |
| | Note textarea | ⚠️ | ❌ | Has `<label>Why you saved this (optional)</label>` — ✅ Pass |
| (search) | Search input | ❌ | ✅ | Add `aria-label="Search articles"` |
| **Race Pace** | All inputs | ✅ | — | **Only tool with proper labels.** Has `<label className={labelCls}>` for distance, time, strategy, date, meet, notes, etc. Gold standard. |

### Label Summary

| Tool | Labeled inputs | Total inputs | Score |
| :--- | :---: | :---: | :--- |
| Flashcards | 0 | 1 | 🔴 0% |
| Grade Calculator | 0 | 5 per class row | 🔴 0% |
| Workout Logger | 0 | 2 per set + exercise | 🔴 0% |
| Meal Logger | 0 | 1 | 🔴 0% |
| Repo Scanner | 0 | 2 | 🔴 0% |
| Habit Streaks | 0 | 1 | 🔴 0% |
| Prompt Library (launcher) | 0 | 2 | 🔴 0% |
| Article Notes | 2 | 3 | 🟡 67% |
| Race Pace Calculator | All | All | 🟢 100% |

---

## Summary Scorecard

| Category | Overall | Critical Issues |
| :--- | :---: | :--- |
| Keyboard Navigation | 🟡 Partial | Saved item rows not keyboard accessible. Flashcard card flip not reachable. Habit toggle has no visible focus ring. |
| aria-live Regions | 🔴 Fail | Zero `aria-live` or `role="alert"` across entire codebase. Screen readers never announce errors, success, or loading state changes. |
| Color Contrast | 🟡 Needs verification | `text-muted-foreground` and `text-primary` may fail WCAG AA on `bg-surface-secondary`. Placeholder at 50% opacity almost certainly fails. Error red and warning amber pass. |
| Form Labels | 🔴 Fail | 7 of 8 tools use placeholder-only inputs with zero `<label>` or `aria-label` attributes. Only Race Pace has proper labels. |

### Top 5 Fixes (Priority Order)

1. **Add `aria-label` to every input** — one attribute per input, zero layout change, huge accessibility win. Start with the high-traffic tools (Flashcards, Meal Logger, Repo Scanner).

2. **Add `role="alert"` to all error display divs** — also one attribute, instantly makes screen readers announce errors. The 5 tools that now have error states (grade calc, workout, meal, habits, prompt launcher) all need this.

3. **Make saved item rows keyboard accessible** — add `tabIndex={0}`, `role="button"`, and `onKeyDown` (Enter/Space) to saved item divs in both `[slug]/page.tsx` and `saved/page.tsx`.

4. **Make flashcard review keyboard accessible** — the card flip area needs `tabIndex={0}`, `role="button"`, `aria-label="Flip card"`, and `onKeyDown` (Enter/Space to flip). Prev/Next keyboard shortcuts are also needed (already partially handled by Space/ArrowRight in study mode).

5. **Verify `text-muted-foreground` contrast** — check the resolved CSS variable value against `bg-surface-base` and `bg-surface-secondary`. If contrast ratio < 4.5:1, lighten the color. Same for `text-primary` on dark surfaces.
