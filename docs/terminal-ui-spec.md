# Live Terminal UI — Design Spec

> Target: an in-app terminal inside enry.agent that feels like a real,
> polished terminal — not a web-based simulation.
> Reference terminals: Warp, Ghostty, Alacritty, Hyper, Raycast command
> mode, Vercel deployment logs.
> Read-only spec. No code changes.

---

## 1. Color Scheme — Mapping enry.agent's Tokens to Terminal Roles

### The core idea

A real terminal doesn't use a single text color — it differentiates
semantic roles through color: the command you typed, the output the
program wrote, the prompt that invited you, the error that needs
attention. enry.agent's existing token set maps perfectly to these
roles. No new colors needed.

### Token → Terminal Role Map

| Role | CSS Variable | Hex | Terminal equivalent | When to use |
| :--- | :--- | :--- | :--- | :--- |
| **Prompt / Cursor** | `--primary` | `#00ff66` | The "you are here" signal. Bright enough to be found in a dense scrollback. | Prompt symbol (`$` or `❯`), cursor caret, active line number |
| **Command (stdin)** | `--foreground` | `#ffffff` | What the user typed. Full white — maximum contrast against the dark background. The command should read as the most important text on the line. | User's typed command text |
| **stdout** | `--muted-foreground` | `#9ca3af` | Program output. This is the "body text" of the terminal — read when needed, scanned otherwise. Muted gray keeps it from competing with the prompt and command. | All program output that isn't stderr |
| **stderr** | `--destructive` | `#ff4d4d` | Error output. Red draws immediate attention. But — and this is critical — only use full red for actual errors. Warnings should use a lower saturation. | STDERR stream, non-zero exit codes |
| **stderr (warning)** | `--warning` | `#ffb800` | Warnings and non-fatal diagnostics. Amber signals "pay attention" without the alarm of red. | STDERR warnings, deprecation notices |
| **Success / exit 0** | `--primary` | `#00ff66` | Green "ok" marker after a clean exit. Follows the prompt convention — green means "ready." | Exit code indicators, success badges |
| **Info / system** | `--accent` | `#00c8ff` | Timestamps, file paths, line numbers, metadata — the structural scaffolding of terminal output. Cyan distinguishes "information about output" from "the output itself." | Timestamps, cwd markers, file:line references |
| **Directory** | `--accent` | `#00c8ff` | Directory names in paths. Cyan matches common terminal conventions (`ls` directories in many themes). | Path components that are directories |
| **Executable** | `--primary` | `#00ff66` | Command names in output where the program name matters (e.g., `which`, `type`). | Binary names in `which` or `type` output |
| **Highlight / search match** | `--primary` at 15% opacity | `rgba(0,255,102,0.15)` | Search result highlight. A subtle green background fill — not a border or underline. | Active search match background |
| **Selection** | `--primary` at 20% opacity | `rgba(0,255,102,0.20)` | Text selection. Slightly stronger than search highlight. Must be distinguishable from the search highlight. | User-dragged text selection |
| **Divider / separator** | `--border` | `#262626` | Horizontal rules between blocks, section separators in the scrollback. | Block separators |
| **Background** | `--surface-base` | `#080808` | Terminal backdrop. Near-black, matches the app background. Never animate this. | Terminal container background |
| **Prompt secondary** | `--muted-foreground` | `#9ca3af` | Secondary prompt metadata — git branch, repo name, elapsed time. Information that's useful but shouldn't compete with the command itself. | Git branch, directory, time in prompt |

### ANSI color mapping (for TUI programs)

If the terminal runs actual command-line tools that emit ANSI escape
sequences, map the 16 standard ANSI colors to enry.agent's palette:

| ANSI # | Name | Hex | Token |
| :--- | :--- | :--- | :--- |
| 0 | Black | `#080808` | `--surface-base` |
| 1 | Red | `#ff4d4d` | `--destructive` |
| 2 | Green | `#00ff66` | `--primary` |
| 3 | Yellow | `#ffb800` | `--warning` |
| 4 | Blue | `#00c8ff` | `--accent` |
| 5 | Magenta | `#a855f7` | Extended — purple for `diff` etc. |
| 6 | Cyan | `#22d3ee` | Extended — lighter cyan than accent |
| 7 | White | `#ffffff` | `--foreground` |
| 8 | Bright black | `#262626` | `--border` |
| 9 | Bright red | `#ff6b6b` | Lighter destructive |
| 10 | Bright green | `#00ff88` | Lighter primary |
| 11 | Bright yellow | `#ffcc00` | Lighter warning |
| 12 | Bright blue | `#4dd4ff` | Lighter accent |
| 13 | Bright magenta | `#c084fc` | Lighter purple |
| 14 | Bright cyan | `#67e8f9` | Lighter cyan |
| 15 | Bright white | `#f5f5f5` | Off-white foreground |

> **Rule:** The 16 ANSI colors must be visible in a single block comment
> in the terminal component's CSS. No scattering them across files.

---

## 2. Prompt Design

### Anatomy of the prompt line

A great prompt tells you where you are without asking. It's contextual,
minimal, and immediately scannable.

```
❯  enry-agent/main  ±  18:15:42  12s
❯  npm run dev
```

And after the command runs:

```
❯  enry-agent/main  ±  18:15:54  0.3s  ✓
❯
```

### Component breakdown

| Element | Content | Color | Behavior |
| :--- | :--- | :--- | :--- |
| **Prompt symbol** | `❯` | `--primary` (`#00ff66`) | Always visible. The "you are here" glyph. Should be 1–2px larger than the body text to anchor the eye. |
| **Repo name** | Current git repo (e.g., `enry-agent`) | `--muted-foreground` | Shown only when the terminal is within a git repo context. Detected from the chat's active context or explicitly set. |
| **Branch** | `main` (or active branch) | `--accent` if clean, `--warning` if dirty | Branch name, shown after a `/`. Changes color if the repo has uncommitted changes (amber = dirty). |
| **Timestamp** | `18:15:42` | `--muted-foreground` at 60% opacity | Optional — shown in the prompt's secondary line or as a right-aligned info. Not every terminal needs it, but for a command log it's invaluable. |
| **Elapsed** | `12s` | `--muted-foreground` at 60% opacity | Time since the last command finished. Shows after the timestamp. Renders as `0.3s` for sub-second commands, `12s` for multi-second. |
| **Exit status** | `✓` or `✗` | `--primary` on success, `--destructive` on failure | A tiny checkmark or cross appears briefly after the elapsed time when a command finishes. Fades out after 5 seconds. |
| **Input line** | (blank) | `--foreground` | Full-width editable area. Shows `--foreground` for typed text, `--muted-foreground` at 50% opacity for placeholder text ("Type a command…"). |

### Prompt variants

| Context | Prompt | Notes |
| :--- | :--- | :--- |
| **Default** | `❯` | Minimal. Show when there's no git context or when the user hasn't started a session. |
| **Git-aware** | `❯  enry-agent/main` | Shows repo/branch when detected. |
| **Git-dirty** | `❯  enry-agent/main*` | Appends `*` after the branch and uses `--warning` for the branch color. |
| **Busy** | `❯` (with animated cursor) | While a command is executing, the prompt symbol dims to 50%, the cursor becomes a spinning indicator (see §3). |
| **Error** | `❯` (with `✗` in the prompt info) | After a non-zero exit, an `✗` appears in the prompt's secondary info. The `❯` itself stays green — the environment is ready, not broken. |

### Cursor style

| State | Style | Animated? |
| :--- | :--- | :--- |
| **Idle** (awaiting input) | Block cursor, `--primary` green. Blinking 600ms on/off. | Yes — standard terminal cursor blink |
| **Typing** | Beam cursor, `--primary` green. Thin vertical line (2px wide). No blink while typing. | Blink resumes 2s after last keystroke |
| **Executing** | Spinning indicator replaces cursor: a `─` that rotates through `│ ─ └ ┤` at 300ms per frame. | CSS `@keyframes`, same as a loading spinner |
| **Selecting** | Hidden cursor. Standard browser text selection takes over. | No custom animation |

### Prompt line spacing

```
┌─────────────────────────────────────────────────────────┐
│                                                          │  ← 4px padding above prompt
│  ❯  enry-agent/main  ±  18:15:42  12s  ✓               │  ← Prompt info (single line)
│  ❯  npm run dev                                         │  ← The command (bold weight)
│    ─────────────────────────────────────                 │  ← Horizontal rule (border, 50% opacity)
│  > /Users/henry/apps/enry-agent                          │  ← cwd (accent, italic)
│                                                          │  ← 4px padding before output
│  ▲ enry.agent dev server running at:                     │  ← stdout (muted foreground)
│    http://localhost:3000                                  │
│  ✓ Ready in 2.3s                                         │
│                                                          │  ← 4px padding after output
│  ❯                                                       │  ← Next prompt (ready state)
│                                                          │  ← 4px padding below prompt
└─────────────────────────────────────────────────────────┘
```

---

## 3. Typography

### Font stack

Use enry.agent's existing monospace token:

```
--font-mono: var(--font-ibm-plex-mono), 'IBM Plex Mono', monospace;
```

(If the Geist Mono migration from `typography-recommendation.md` ships,
Geist Mono becomes the primary. Both are excellent — the key is that the
terminal uses the same monospace font as the rest of the app for visual
consistency.)

### Sizing

| Element | Size | Weight | Line height |
| :--- | :--- | :--- | :--- |
| Prompt symbol (`❯`) | `14px` | `600` | `1.6` |
| Prompt info (repo, branch, time) | `11px` | `400` | `1.6` |
| Command text (stdin) | `13px` | `500` | `1.6` |
| stdout / stderr output | `13px` | `400` | `1.6` |
| Timestamps in output | `11px` | `400` | `1.6` |
| Horizontal rule separator | `1px` | — | — |

### Line height rationale

`1.6` for a 13px font gives an effective line spacing of 20.8px. This is
generous for a terminal — most terminals use 1.2–1.4 — but enry.agent's
terminal is an in-app terminal, not a full-screen emulator. The extra
vertical breathing room:
- Prevents the terminal from looking like a dense wall of text
- Aligns with the rest of enry.agent's typography scale
- Makes individual lines more scannable in a scrollback

> **Trade-off acknowledged:** If the terminal ever needs to display
> extremely dense output (like a `docker build` log or a test suite
> running), the generous line height means fewer visible lines. That's
> acceptable — the terminal has full scrollback, and the density trade
> is worth readability.

### Character spacing (tracking)

| Element | Letter-spacing | Why |
| :--- | :--- | :--- |
| Prompt info (repo, branch, time) | `0.02em` | Slight loosening for readability at small sizes |
| Command text (stdin) | `0` | Default monospace. Commands are code — don't space them out. |
| stdout / stderr | `0` | Default monospace. No tracking for body text. |
| Timestamps | `0.04em` | Loose tracking makes numeric timestamps easier to parse |

### What not to do

- **No font ligatures in output.** `!=` rendering as `≠` in a terminal
  context is confusing. The user's shell may use ligatures (FiraCode,
  JetBrains Mono Nerd Font), but the terminal's display of program output
  should preserve exact character sequences. Command input may optionally
  show ligatures since the user typed it — but output never should.
- **No font-size transitions.** Terminal text size changes should be
  instant. An animated font-size transition would feel heavy and
  un-terminal-like.
- **No `font-feature-settings` for tabular numbers by default.** Unless
  the output is tabular data (tables, CSV, logs), proportional or
  default monospace numeral spacing is fine. Add a separate monospace
  "data table" mode for structured tabular output.

---

## 4. Scrollback UX Patterns Worth Borrowing

### From Warp: Block-based scrollback

The most significant UX innovation in modern terminals. Each command
execution + its output forms a logical "block." Blocks are:

- **Collapsible.** Click a `▼` / `▶` toggle to collapse output and see
  only the command line. Useful for long logs where you only need the
  command reference.
- **Copyable.** A `⎘` icon appears on hover at the top-right of the block.
  Click to copy the entire output. This is significantly better than
  click-drag-selecting across hundreds of lines.
- **Shareable.** Each block has a "copy as markdown" action — the command
  as a code block, the output as text below it. Perfect for pasting into
  chats, issues, or PRs.
- **Searchable within.** `Cmd+F` inside a block searches only that block's
  output. A subsequent `Cmd+F` searches the entire scrollback.

### From Ghostty: Infinite scrollback with no perf cliff

Ghostty handles millions of lines of scrollback without jank because it
virtualizes — only rendering the visible lines + a small buffer above and
below.

**Implementation rule for enry.agent:** The Live Terminal must use a
virtualized list (react-window or similar) for scrollback content. The
maximum DOM nodes should be ~50–100 regardless of how many commands have
been executed.

### From Vercel deployment logs: Structured log lines

Vercel's deployment logs treat each log line as metadata-rich:

```
18:15:42  INFO  [build]  ✓  Running build in 8s
└───────────────────┘ └──┘  └┘  └──────────────────┘
    Timestamp        Level  Icon  Message
```

Each component is independently styled and selectable. Apply this to the
Live Terminal's non-command output:

| Component | Color | Width |
| :--- | :--- | :--- |
| Timestamp | `--accent`, 60% opacity | 80px fixed, right-aligned |
| Level / type badge | Caps, `--muted-foreground` | Auto, padded |
| Icon | Semantic (green = success, red = error) | 16px fixed |
| Message | `--muted-foreground` | Remaining space |

### From Raycast: Automatic command history

Raycast's command mode remembers the last 5 commands and shows them as
quick-selectable above the input when the terminal is empty. This bridges
the gap between "I know what I want to run" and "I've run it before."

**Implementation:** Show the last 3 commands as pill-badges above the
empty prompt input. Clicking one pre-fills the input without executing.

### Common scrollback patterns to implement

| Pattern | UX | Implementation |
| :--- | :--- | :--- |
| **Scroll to bottom** | After a new command finishes, auto-scroll to the latest output. If the user has scrolled up (above the latest block), show a small "↓ Scroll to bottom" button floating near the bottom of the terminal. | `IntersectionObserver` on the terminal bottom sentinel |
| **Command search** | `Cmd+F` searches command text and output. Matches show a green highlight (`--primary` at 15% opacity). | Standard browser `find()` or a custom search overlay |
| **Output folding** | Long output (>50 lines) is collapsed by default with a "Show all N lines" toggle. | Collapse threshold configurable; 50 lines default |
| **Scrollback limit** | Cap the scrollback at 10,000 lines. Older lines are dropped from the virtual list (but can be persisted to browser storage for later retrieval). | LRU cache, 10k line limit |
| **Copy on select** | Selecting text auto-copies it to clipboard (Warp-style). A brief "Copied" toast appears. | `mouseup` handler on the terminal content area |

---

## 5. Empty State

### What the terminal shows before the first command

A blank terminal with a blinking cursor is the "real terminal" experience,
but it's also wasted space. For an in-app terminal that might be the
user's first encounter with the feature, the empty state should
communicate what the terminal *is* and *does*.

### Composition

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│     ❯                                                    │
│                                                          │
│      ┌─────────────────────────────────────┐              │
│      │  Welcome to enry.agent's terminal   │              │
│      │                                     │              │
│      │  Try:                               │              │
│      │  ❯  run tests                       │              │
│      │  ❯  deploy                          │              │
│      │  ❯  check status                    │              │
│      │  ❯  help                            │              │
│      │                                     │              │
│      │  Or just type anything to start.    │              │
│      └─────────────────────────────────────┘              │
│                                                          │
│     ❯  _   ← blinking cursor awaiting input              │
│                                                          │
│                                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Layers

1. **Background:** The terminal surface shows `--surface-base` (`#080808`).
   No ambient background effects bleed into the terminal. The terminal is
   a clean, flat surface — like a real terminal window, not a web card.

2. **Prompt line:** The `❯` glyph (green, 14px, weight 600) is visible.
   The cursor blinks at the end of the empty input line. This tells the
   user "I'm ready" without any extra decoration.

3. **Welcome card (optional, shown on first visit):** A bordered box
   (`--border` color, 8px radius, `--surface-secondary` background)
   appears centered in the terminal body. It contains:
   - A brief heading: "Welcome to enry.agent's terminal"
   - 4 example commands as clickable pills (`run tests`, `deploy`,
     `check status`, `help`)
   - A subtle subtext: "Or just type anything to start."
   - The welcome card auto-dismisses after the first command is executed.
     It can be re-shown via the command palette action "Show terminal
     welcome."

4. **Recents (shown on subsequent opens):** Above the prompt line, 3
   pill-badges with the last 3 unique commands. Labeled with a small
   `⏎` clock icon. Clickable to pre-fill the input.

5. **Blinking cursor:** The most important element. Even in the empty
   state, the cursor must be blinking. A terminal without a cursor is a
   dead terminal. The blink animation is CSS-only (600ms cycle, step-end):
   ```css
   @keyframes cursor-blink {
     0%, 40% { opacity: 1; }
     50%, 100% { opacity: 0; }
   }
   .terminal-cursor {
     animation: cursor-blink 600ms step-end infinite;
   }
   ```

### When not to show the welcome card

- **After the first command.** The welcome card disappears forever for
  this session. The user has seen it.
- **When the terminal is embedded in a tool panel.** If the terminal is
  already contextual (e.g., showing build output for a specific tool),
  the welcome card is irrelevant — the tool's output IS the content.
- **When `prefers-reduced-motion` is set.** The welcome card appears
  instantly (no fade-in animation) and the cursor never blinks. Static
  block cursor.

### Anti-pattern: The "glowing empty terminal"

Do not fill the empty terminal with animated data traces, falling
characters, or pulsing glows. An empty terminal should be calm — it's
waiting for you, not performing for you. The ambient background layer
handles "the app feels alive" — the terminal does not need its own
ambient animation.

---

## 6. Anti-Patterns — What Makes an In-App Terminal Feel Fake vs. Real

### The uncanny valley of web terminals

A terminal rendered in the browser will never be indistinguishable from
a native terminal. The goal isn't to fool the user — it's to make the
terminal so well-designed that the user doesn't care that it's in-browser.
These anti-patterns are the specific tells that break that illusion.

| Anti-pattern | Why it feels fake | Real terminal behavior |
| :--- | :--- | :--- |
| **Input lag > 50ms** | The most common tell of Electron-based terminals. The user types a character and sees it appear a frame later. The brain registers this as "this is not a real terminal." | Every keystroke renders on the next frame (≤16ms at 60fps). If latency can't be guaranteed, the terminal should buffer input and batch-render rather than stuttering per keystroke. |
| **Fake scroll momentum** | A terminal scrollback that continues to glide after the user lifts their finger, like a mobile photo gallery. Real terminals stop exactly where the user scrolls to. | `overscroll-behavior: none`. No momentum scrolling. The scrollback should snap to line boundaries, not pixels. |
| **No cursor blink** | A static cursor reads as "this element is not interactive." Even if the terminal is empty, the cursor must blink. | CSS `@keyframes` blink, 600ms step-end. Never Framer Motion for this — it's a mechanical loop. |
| **Animated output reveal** | Output that fades in, slides in, or types out character-by-character. This is the "AI chat" pattern, not the "terminal" pattern. | Output appears instantly. The only animation is the cursor blinking at the end of streaming output. |
| **Background gradients / noise behind text** | Terminal text on a gradient or animated background is harder to read, period. The ambient background spec says backgrounds should be nearly invisible — inside the terminal, they should be absent. | The terminal surface is `--surface-base` (`#080808`). Solid, flat, no bleed-through from the ambient background layer. |
| **Card-like block styling** | Each command block rendered as a rounded card with a shadow, padding, and a border radius. This is a dashboard, not a terminal. | Blocks are separated by a single `1px` horizontal rule (`--border` at 50% opacity). No shadows, no rounded corners on the content area, no padding between lines. |
| **Clickable buttons inside output** | Every line of output wrapped in a `<button>` so the user can copy it. Real terminals don't have buttons in output — they have text. | Copy is available via selection + right-click or a subtle hover action on the block level (not per-line). Output reads as text, not as interactive controls. |
| **Icon-heavy output** | Replacing text with icons (`🔴` for error, `✅` for success, `ℹ️` for info). Icons break monospace alignment and look like a web app pretending to be a terminal. | Use glyphs from the font or simple ASCII characters: `✓` (U+2713), `✗` (U+2717), `→` (U+2192). These are monospace-compatible. |
| **Tooltips on every element** | Hovering over any text shows a tooltip. Real terminals don't have tooltips — the text IS the information. | Tooltips only on the prompt's git branch info (to show full path) and on truncated paths. Never on output text. |
| **"Typing" animation for command output** | Rendering `npm install` one character at a time with a typewriter animation. This signals "fake AI assistant" not "real command execution." | Commands appear instantly when submitted. Output streams as it arrives from the backend. The only progressive reveal is an actual streaming response, not a simulated one. |
| **Rounded everything** | A terminal with `border-radius: 12px` on the container, 8px on blocks, 6px on inputs. Terminals are rectangular. | The terminal container has a `border-radius: 8px` (matches enry.agent's `--radius`). That's the only rounded corner. Everything inside is rectangular. |
| **Non-standard selection color** | Overriding the browser's default blue selection with a custom green tint that has poor contrast against the dark background. | Selection uses `rgba(0,255,102,0.20)` — the same green as the prompt, at 20% opacity. Must pass contrast checks against `#080808`. |
| **Persistent scrollbar** | A visible, 12px-wide scrollbar in the terminal at all times. Real terminals fade the scrollbar when not in use. | Use the app's existing custom scrollbar (6px, `--border` color, hover-reveals). On the terminal, consider `scrollbar-hidden` class with a hover-to-reveal pattern. |

### The "Live Terminal litmus test"

Ask someone who uses a terminal daily (developer, sysadmin, power user)
to use the Live Terminal for 30 seconds. If they say any of these things,
fix the corresponding issue:

| They say… | Likely cause |
| :--- | :--- |
| "Why is it slow when I type?" | Input lag. See anti-pattern #1. |
| "The text is hard to read." | Contrast too low or font rendering issue. Check stdout color and font smoothing. |
| "This doesn't feel like a terminal." | Too much UI chrome. Remove buttons, shadows, rounded corners, icons. |
| "Where's the cursor?" | Cursor not visible or not blinking. See empty state (#5) and prompt design (#2). |
| "The output looks weird." | ANSI color mapping issue or wrong character encoding. Check the 16-color map in §1. |
| "Can I scroll back?" | Scrollback not implemented or not working. See §4. |
| "Why is it animated?" | Output reveal animation. See anti-pattern #5. |

---

## 7. Block Design (after command execution)

### The block structure

```
┌─ Block ─────────────────────────────────────┐
│                                              │
│  ❯  npm run dev                              │  ← Command line (prompt + text)
│                                              │
│  ▲  enry.agent dev server running…           │  ← stdout
│     http://localhost:3000                     │
│  ✓  Ready in 2.3s                            │
│                                              │
│  exit: 0  ───  18:15:54  ───  2.3s           │  ← Block footer (exit code, time, duration)
│                                              │
└──────────────────────────────────────────────┘
```

### Block states

| State | Visual | Hover action |
| :--- | :--- | :--- |
| **Default** | Full content visible. 1px `--border` rule separates it from the next block. | Copy button appears at top-right. |
| **Collapsed** | Only the command line shows. A `▶` icon replaces the `❯` prompt symbol. Output is hidden. | Click to expand. |
| **Selected** | Block has a 1px `--primary` left border (not a full box highlight). | Already selected — clicking outside deselects. |
| **Streaming** | No block footer yet (exit code unknown). A subtle shimmer on the bottom edge of the last output line. | "Cancel" button replaces the copy button. |

### Block footer

The block footer is a compact summary line, rendered in `--muted-foreground`
at `11px`:

```
exit: 0  ───  18:15:54  ───  2.3s
```

| Component | Content | Color |
| :--- | :--- | :--- |
| Exit code | `exit: 0` or `exit: 1` | Green if 0, red if non-zero |
| Separator | ` ─── ` | `--border` |
| Timestamp | `18:15:54` | `--muted-foreground` at 60% |
| Separator | ` ─── ` | `--border` |
| Duration | `2.3s` | `--muted-foreground` |

If the output was truncated (>50 lines), also show:

```
exit: 0  ───  18:15:54  ───  2.3s  ───  342 lines (truncated)
```

---

## 8. Transitions and Micro-interactions

### What to animate

| Interaction | Animation | Duration | Easing |
| :--- | :--- | :--- | :--- |
| **Block collapse/expand** | Height collapse with `layout` animation (Framer Motion) | 200ms | `[0.2, 0, 0, 1]` |
| **New block entrance** | Opacity 0→1, y: 4→0 | 150ms | `[0, 0, 0.2, 1]` |
| **Copy confirmation** | Brief green flash on the copied text's block border | 600ms total | CSS `pulse-confirm` from globals.css |
| **Hover on block** | Subtle background tint change: `--surface-secondary` → `--surface-elevated` | 120ms | CSS transition (sharp: `[0.4, 0, 0.6, 1]`) |
| **Scroll to bottom float** | Float button fades in when user scrolls up, fades out at bottom | 150ms | `[0, 0, 0.2, 1]` |
| **Welcome card entrance** | Opacity 0→1, no scale, no slide | 200ms | `[0, 0, 0.2, 1]` |
| **Welcome card dismiss** | Opacity 1→0 | 100ms | `[0.4, 0, 1, 1]` |

### What NOT to animate

- **Cursor blink.** CSS `@keyframes` only. No Framer Motion.
- **Streaming text reveal.** Text appears as it arrives. No progressive
  reveal animation.
- **Prompt line state changes.** Prompt info (repo, branch) appears
  instantly when context changes. No crossfade.
- **Block footer.** Appears instantly when a command finishes.
- **Scroll position.** Don't animate scrolling. Instant jump to the new
  position.

### Reduced motion

When `prefers-reduced-motion: reduce`:

- Block collapse/expand: Instant (no animation)
- New block entrance: Instant opacity
- Copy confirmation: No flash (border stays at `--border`)
- Hover on block: Instant background change
- All ambient / loop animations: Stop
- Cursor: Static block cursor, no blink

---

## 9. Layout and Spacing

### Terminal container

```
┌── 12px padding ─────────────────────────────┐
│                                               │
│  8px  │  Block 1                              │
│       │  ─────────────────────                │
│       │                                       │
│       │  Block 2                              │
│       │  ─────────────────────                │
│       │                                       │
│       │  ❯ _  (active prompt)                │
│                                               │
└───────────────────────────────────────────────┘
```

| Property | Value |
| :--- | :--- |
| Container padding | `12px` all sides |
| Internal block spacing | `8px` between blocks (vertical) |
| Prompt line height | `1.6` (20.8px for 13px text) |
| Block separator | `1px` `--border` at 50% opacity |
| Prompt-to-content gap | `4px` |
| Content-to-block-footer gap | `4px` |
| Block-footer-to-next-block gap | `8px` |
| Left margin for prompt symbol | `0` (it's left-aligned with the container padding) |

### Responsive behavior

| Viewport | Behavior |
| :--- | :--- |
| **≥1024px** | Full terminal rendering. All features. |
| **768–1023px** | Terminal occupies full width of the container. Prompt info (git, time) collapses to a single line. Welcome card uses the available width. |
| **<768px** | Block footer hides (exit code + timestamp available on hover). Copy button moves to a long-press gesture. Prompt info hidden — only the `❯` glyph visible. |

---

## 10. Input Handling

### Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Enter` | Execute command |
| `Shift+Enter` | Insert newline in the input |
| `↑` | Cycle back through command history |
| `↓` | Cycle forward through command history |
| `Tab` | Insert 2 spaces (no auto-complete in v1 — that's a v2 feature) |
| `Ctrl+C` | Cancel the current execution (if running) or clear the input |
| `Ctrl+L` | Clear terminal (hides all blocks, resets to empty state) |
| `Cmd+K` | Focus the terminal input (if not already focused) |
| `Escape` | Blur the terminal input / close search overlay |

### Command history

- Stored in memory for the session (last 100 commands)
- Persisted to localStorage (key: `terminal-history`) for cross-session
- Deduped: consecutive identical commands are stored once
- Shown as pill-badges in the empty state recents (last 3)
- Searchable via `Ctrl+R` (reverse-i-search pattern — opens a search
  overlay over the input)

### Execution feedback

When a command is submitted:
1. The prompt dims (❯ goes to 50% opacity)
2. The cursor becomes a spinning indicator
3. Output begins streaming as it arrives
4. When complete, the block footer appears with exit code + timing
5. The next prompt appears beneath the block

---

## 11. Reference: Modern Terminal Design Comparison

| Aspect | Warp | Ghostty | Alacritty | enry.agent Live Terminal |
| :--- | :--- | :--- | :--- | :--- |
| **Output model** | Block-based, collapsible | Raw text stream | Raw text stream | **Block-based** (Warp-inspired) |
| **Theming** | Accent color + UI surface | Minimal, system-native | TOML config only | **Existing token set** |
| **Input** | IDE-like multi-line editor | Standard terminal input | Standard terminal input | **Single-line with Shift+Enter** |
| **Scrollback** | Infinite, searchable blocks | Virtualized, millions of lines | Configurable line buffer | **Virtualized, blocks + search** |
| **Empty state** | Recent commands + AI input | Blank terminal | Blank terminal | **Welcome card → recents → blank** |
| **Typography** | System font, ligatures | System font, no ligatures | Configurable | **App monospace token** |
| **Cursor** | Block/beam, blink configurable | Block, blink | Block, blink | **Context-aware block/beam/spin** |
| **Performance** | GPU-accelerated (Rust) | GPU-accelerated (Zig/Metal) | GPU-accelerated (Rust) | **Virtualized DOM, CSS-only animations** |

---

## 12. Implementation Notes (for when this ships)

### File structure (proposed)

```
src/
  components/
    terminal/
      live-terminal.tsx          ← Main component: container + state management
      terminal-prompt.tsx        ← Prompt line: glyph, info, input field
      terminal-block.tsx         ← Single command block (command + output + footer)
      terminal-output.tsx        ← Output area within a block
      terminal-cursor.tsx        ← Cursor component (block, beam, spinner)
      terminal-empty.tsx         ← Empty state (welcome card + recents)
      terminal-scrollback.tsx    ← Virtualized scrollback container
      terminal-search.tsx        ← Search overlay for scrollback
      terminal-history.tsx       ← Command history hook + provider
      terminal-welcome-card.tsx  ← Welcome card component
```

### Key CSS classes (proposed)

These should follow the existing conventions in `globals.css` — CSS
transitions, not Framer Motion, for all micro-interactions except block
collapse/expand.

```css
/* Terminal-specific overrides — these sit in a terminal.css or inline */
.terminal {
  --terminal-bg: var(--surface-base);
  --terminal-text: var(--foreground);
  --terminal-output: var(--muted-foreground);
  --terminal-prompt: var(--primary);
  --terminal-error: var(--destructive);
  --terminal-warning: var(--warning);
  --terminal-info: var(--accent);
  --terminal-border: var(--border);
  --terminal-selection: rgba(0, 255, 102, 0.20);
  --terminal-search-highlight: rgba(0, 255, 102, 0.15);
  --terminal-radius: var(--radius);
}

.terminal-content {
  overscroll-behavior: none;        /* No momentum scroll */
  scroll-behavior: auto;             /* No smooth scroll */
  font-variant-ligatures: none;      /* No ligatures in output */
}

.terminal-output-line {
  white-space: pre-wrap;
  word-break: break-all;             /* Preserve long lines */
}

.terminal-block {
  /* No border radius, no box shadow, no padding separate from container */
}
```

### ANSI parsing

If the terminal supports actual shell commands (not just enry.agent's
internal command system), it needs an ANSI escape sequence parser:

- Use a well-maintained library: `anser` (3.2kB gzipped) or `ansi-to-html`
  (small, focused).
- The parser maps ANSI 16-color codes to enry.agent's token set using the
  table from §1.
- 256-color and truecolor (24-bit) support is optional for v1 — document
  as "future."

### Cursor blink as CSS

```css
@keyframes cursor-blink {
  0%, 40%   { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.terminal-cursor-blink {
  animation: cursor-blink 600ms step-end infinite;
}
```

### Streaming output

When the terminal's output is a streaming response (e.g., from an API
executing a command):

1. Create a new block with no footer
2. Append text to the output area as chunks arrive
3. The block's output area auto-scrolls as new text appears (only if the
   user is already at the bottom of the block)
4. When streaming completes, render the block footer (exit code, timing)
5. Show the next prompt

---

## Quick Reference Card

```
┌─ Color roles ───────────────────────────────────────────────────┐
│  Prompt / Cursor    #00ff66  (--primary)                        │
│  Command (stdin)    #ffffff  (--foreground)                     │
│  stdout             #9ca3af  (--muted-foreground)               │
│  stderr (error)     #ff4d4d  (--destructive)                    │
│  stderr (warn)      #ffb800  (--warning)                        │
│  Success / exit 0   #00ff66  (--primary)                        │
│  Info / metadata    #00c8ff  (--accent)                         │
│  Selection          rgba(0,255,102,0.20)                        │
│  Background         #080808  (--surface-base)                   │
└─────────────────────────────────────────────────────────────────┘

┌─ Prompt anatomy ────────────────────────────────────────────────┐
│  ❯  repo/branch  ±  18:15:42  12s  ✓                           │
│  ↑   ↑           ↑   ↑         ↑    ↑                           │
│  │   git context │  timestamp  │    exit status (5s)            │
│  │  (muted-fg)   │  (accent)   │                                 │
│  │               │             elapsed (muted-fg, 60%)           │
│  prompt glyph    │                                              │
│  (primary, 14px) │                                              │
└─────────────────────────────────────────────────────────────────┘

┌─ Anti-patterns (never) ─────────────────────────────────────────┐
│  ✅ Real:   Instant output, CSS cursor blink, solid bg          │
│  ❌ Fake:   Typing animation, animated backgrounds, icons       │
│  ✅ Real:   Block-level copy, rectangular layout, 1px rules    │
│  ❌ Fake:   Per-line buttons, rounded cards, gradient surfaces  │
│  ✅ Real:   Virtualized scrollback, snap-to-line scrolling      │
│  ❌ Fake:   Momentum scroll, infinite DOM growth, janky perf    │
└─────────────────────────────────────────────────────────────────┘
```
