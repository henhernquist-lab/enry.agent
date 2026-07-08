# Manual QA Checklist — Four New Tools

> Build target: Meet/Game Countdown, Daily Check-in, Quick Notes, Bell Schedule Viewer
> Tester: Henry
> Date: _________

Each section is self-contained. Run through them in any order.
Check the box when a test passes. If something fails, note it in the margin.

---

## 1. Meet / Game Countdown

Countdown timer to the next race, meet, or game. Supports creating, viewing, and deleting events.

### 1.1 Happy Path — Create an upcoming event

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Open the Countdown tool from the tools grid | Tool panel opens. Empty state reads "No upcoming events. Add your first race or game." |
| 2 | Click "Add event" (or equivalent add button) | Form appears with fields: event name, date, optional notes |
| 3 | Enter "Region Championship" and pick a date 14 days from today | Date picker accepts the future date |
| 4 | Submit / save the event | Event appears in the list. Countdown shows "14 days" (or "13 days" depending on time-of-day rounding). Event name and date are visible. |
| 5 | Close the tool and reopen it | Event persists. Countdown updates correctly relative to today's date. |

### 1.2 Edge — Event today

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Create an event with today's date | Countdown displays "Today" or "0 days". Visual treatment should not show a negative number or error. |
| 2 | If the tool shows hours/minutes for same-day events | Countdown counts down to the event time, not just the date. If time isn't supported, "Today" is acceptable. |

### 1.3 Edge — Event in the past

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Create an event with a date 3 days in the past | Event should either (a) be rejected on creation with a validation message like "Date must be in the future", or (b) display with a label like "Past" / "3 days ago" with a grayed-out or muted appearance. |
| 2 | If past events are allowed and displayed | They should sort below upcoming events. Countdown should not show a negative number (e.g., "-3 days"). |

### 1.4 Edge — Multiple events

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Create 3 events with dates 5, 10, and 20 days from now | All three appear in the list. The soonest event (5 days) is either shown first or emphasized as the "next" event. |
| 2 | Delete the soonest event | The 10-day event becomes the next event. Countdown updates correctly. No error. |

### 1.5 Edge — Delete last event

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Delete all events so none remain | Empty state reappears: "No upcoming events. Add your first race or game." No console errors. |

### 1.6 Edge — Very far future date

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Create an event with a date 2 years from now | Countdown displays correctly (e.g., "730 days"). Layout does not break. No overflow or wrapping issues. |

### 1.7 Edge — Empty / whitespace event name

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Try to save an event with an empty name or only spaces | Form shows a validation error (e.g., "Name is required"). Event is not saved. |

---

## 2. Daily Check-in

Daily reflection tool — mood, sleep, goals. One check-in per day.

### 2.1 Happy Path — First check-in

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Open the Daily Check-in tool from the grid | Empty state reads something like "No check-ins yet. Start your first one today." A "Start check-in" or "Check in" button is visible. |
| 2 | Begin a check-in | Form or prompt appears. Fields might include: mood (emoji/scale), hours of sleep, a free-text reflection, and/or goals for the day. |
| 3 | Fill in: mood "Good", sleep "7h", write "Leg day + finish history outline" in goals | All inputs accept values without errors. |
| 4 | Submit the check-in | Confirmation appears. Check-in is saved. A streak indicator may appear ("1 day"). |
| 5 | Close and reopen the tool | Today's check-in is visible. It shows the mood, sleep, and goals you entered. |

### 2.2 Edge — Same-day re-check

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | After completing a check-in, try to start another one on the same day | Tool should either: (a) show "Already checked in today" with the existing check-in visible and no duplicate option, or (b) allow editing today's check-in instead of creating a second one. |
| 2 | If editing is allowed, update the mood and save | Changes persist. Only one check-in exists for today. |

### 2.3 Edge — Streak tracking

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Complete a check-in today, then (simulate or wait for) tomorrow and check in again | Streak counter increments to "2 days". |
| 2 | Skip a day (no check-in) | Streak resets to 0 or disappears. This may be hard to test manually without manipulating dates — note any odd behavior here. |
| 3 | Check in after a missed day | New streak starts at 1. Old streak is not falsely preserved. |

### 2.4 Edge — Empty submission

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Try to submit a check-in with no fields filled (no mood, no text) | If all fields are optional, it saves an empty check-in — this is acceptable but worth noting. If any field is required, a validation message appears. |
| 2 | Submit with only whitespace in text fields | Whitespace-only text is either trimmed and treated as empty, or saved as-is. Note which behavior occurs. |

### 2.5 Edge — Check-in history

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | After 3+ days of check-ins, scroll through history | Older check-ins are accessible. Dates are clearly labeled. Newest appears first. |
| 2 | If pagination or "load more" exists | Older entries load without error. No duplicate entries. |

---

## 3. Quick Notes

Rapid note capture. Auto-saved. No categories or folders — just text.

### 3.1 Happy Path — Create a note

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Open Quick Notes from the grid | Empty state: "Nothing yet. Type a note and it saves instantly." A text input or textarea is focused and ready. |
| 2 | Type "Remember to bring spikes tomorrow" | Text appears in the input. If auto-save is implemented, an indicator ("Saved") appears after a brief pause or on blur. |
| 3 | Navigate away and return to Quick Notes | The note is still there. |

### 3.2 Edge — Multiple notes

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Create 5 notes with distinct content | All 5 appear in a list. Newest appears at the top. Each note shows its first line or a truncated preview. |
| 2 | Click or tap a note to view full content | Full note text is displayed. |

### 3.3 Edge — Very long note

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Paste a 2,000-word essay into a note and save | Note saves without error. List view truncates with "…" or shows only the first few lines. Full view shows the entire text. |
| 2 | Scroll within the full view | No layout break, no text cutoff. |

### 3.4 Edge — Special characters & emoji

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Type a note with emoji, angle brackets `<script>alert(1)</script>`, and accented characters (é, ñ, ü) | All characters display correctly in list and detail view. No HTML injection (the text should render as plain text, not execute). |
| 2 | Include a URL like `https://example.com` | URL is saved as plain text. If auto-linkifying is implemented, it renders as a clickable link — either behavior is fine as long as it doesn't break. |

### 3.5 Edge — Delete a note

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Delete one note from a list of several | Note is removed. Remaining notes stay in order. No error. |
| 2 | Delete the last remaining note | Empty state reappears. No error or blank screen. |

### 3.6 Edge — Rapid typing (auto-save behavior)

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Type rapidly for 10 seconds, then immediately close the tool without waiting for a "Saved" indicator | Reopen the tool. The note contains all text typed, or at minimum everything up to the last auto-save trigger. If auto-save is debounced, the last few characters might be lost — note the behavior. |

### 3.7 Edge — Empty note

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Try to save a completely empty note (no text) | Either the save button is disabled, or an empty note is discarded automatically. An empty note should not persist and clutter the list. |
| 2 | Create a note with text, then edit it to be empty and save | The empty note is either deleted or rejected. |

---

## 4. Bell Schedule Viewer

Displays today's period schedule. Supports loading, viewing, and editing period times and class names.

### 4.1 Happy Path — Load the seed schedule

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Open Bell Schedule from the grid | If no schedule exists: empty state — "No schedule loaded. Add your school's bell times." |
| 2 | Load or import the seed file (mechanism TBD — may be a "Load default" button, a file upload, or pre-seeded on first open) | 7 periods appear with the seed data: Honors Geometry (08:30–09:20), Honors Lit/Comp (09:25–10:15), Biology (10:20–11:10), Lunch (11:15–11:45), Spanish 3 (11:50–12:40), World Geography (12:45–13:35), Health / PE (13:40–14:30). |
| 3 | Verify the current period is highlighted (if the tool supports live period tracking based on current time) | The period matching the current time is visually distinct (highlighted, outlined, or labeled "Now"). If it's before 8:30 AM, no period is highlighted. If it's after 2:30 PM, "School day over" or similar. |

### 4.2 Edge — No schedule loaded

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Open the tool without loading any schedule (clear state) | Empty state message is shown. Clear call-to-action to add or import a schedule. No error, no broken layout. |

### 4.3 Edge — Edit a period

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Edit Period 3: change "Biology" to "AP Biology" | Name updates in the list. Save/persist is confirmed. |
| 2 | Edit Period 3 again: change start time from "10:20" to "10:15" | Time updates. If this creates an overlap with Period 2 (which ends at 10:15), note whether the tool warns about it or allows it silently. |
| 3 | Reload the tool | Edits persist. Changed values are shown, not the original seed data. |

### 4.4 Edge — Time overlaps and gaps

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Set Period 2 end time to "10:25" and Period 3 start time to "10:20" (5-minute overlap) | If the tool validates: a warning or error message appears. If not: the overlap is saved silently — note this behavior for UX consideration. |
| 2 | Set Period 4 (Lunch) end time to "11:45" and Period 5 start time to "12:15" (30-minute gap) | A gap between periods is allowed — this is normal for passing time. No error needed. |

### 4.5 Edge — 24-hour time vs. AM/PM ambiguity

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Enter a start time as "08:00" (24h format) | Displays correctly, not as "8:00 PM". |
| 2 | If the tool accepts "8:00" without leading zero | Interprets as 8:00 AM. No ambiguity. |
| 3 | Try entering "25:00" or "13:60" | Invalid times are rejected with a clear error message. |

### 4.6 Edge — Weekend / non-school day

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | View the schedule on a Saturday or Sunday | If the tool detects weekends: shows a message like "No school today" or "Weekend — next school day is Monday." If it doesn't detect weekends: the regular schedule is shown, which is fine for an MVP. Note which behavior occurs. |
| 2 | Manually choose a different day to view (if day picker exists) | Schedule for that day loads. Current-period highlighting updates based on the selected day and time. |

### 4.7 Edge — Reset to default

| Step | Action | Expected |
| :--- | :--- | :--- |
| 1 | Edit several periods, then use a "Reset" or "Restore defaults" option (if one exists) | Schedule reverts to the seed data. All custom edits are cleared. |
| 2 | If no reset option exists | Editing and re-saving individual fields back to original values works as expected. |

---

## Cross-Tool Checks

Run these once all four tools are functional.

| Check | Action | Expected |
| :--- | :--- | :--- |
| **Auth state** | Sign out of enry.agent and sign back in | All four tools retain their data (events, check-ins, notes, bell schedule). Nothing is lost on logout/login. |
| **Concurrent tabs** | Open two browser tabs, both showing Quick Notes. Create a note in Tab A, then switch to Tab B | Tab B shows the new note (either instantly via real-time sync, or after a manual refresh). Data is consistent. |
| **Mobile layout** | Resize the browser to 375px width (iPhone) | All four tools are usable. Inputs don't overflow. Buttons are tappable (at least 44px touch target). Countdown numbers and schedule periods don't wrap in ugly ways. |
| **Dark mode** | Toggle dark/light mode if the app supports it | All four tools render legibly in both modes. No invisible text, no blown-out backgrounds. |
| **Browser back button** | Open a tool, interact with it, press the browser back button | Returns to the tools grid. Tool state is preserved if you navigate forward again. No "Confirm navigation" dialogs unless there are unsaved changes. |

---

## Notes / Issues Found

| # | Tool | What happened | Steps to reproduce |
| :--- | :--- | :--- | :--- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
