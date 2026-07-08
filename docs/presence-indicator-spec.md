# Ambient Presence Indicator — Design Spec

> Signals "this is a live agent" without ever being noisy.
> Reference standard: Superhuman status dot, macOS menu bar indicators,
> ChatGPT thinking pulse, Claude.ai status dot, Raycast ambient glow.
> Implementation reference for Claude Code (Batch B).

---

## 1. Visual Language

### Options evaluated

| Option | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- |
| **Solid dot** (Superhuman, macOS) | Simple, iconic, glanceable. 0% distracting. | Static at rest — doesn't signal "alive" without animation layering. | ✅ Use as the **core element**. Layer animation on top. |
| **Expanding ring** (current implementation) | Readable as "signal" or "pulse." Works at very small sizes. | Can read as "Wi-Fi icon" if the ring expands too far. | ✅ Use as the **secondary layer** — the "breath" ring. |
| **Gradient blob** (Arc, login pages) | Beautiful, atmospheric. Feels alive. | Too large for a persistent indicator. Works as a background element, not a status dot. | ❌ Wrong scale. Blobs belong in the ambient background layer, not the indicator. |
| **Ambient glow / drop shadow** | Premium feel. Softens the dot. No movement required. | Subtle enough that it may not register as "status" on its own. | ✅ Use as a **static base layer** — the dot always glows, the pulse modulates the intensity. |
| **Pulsing dot without ring** (GitHub Copilot) | Minimal. One element, one animation. | Hard to distinguish "idle" from "online" without a second visual cue. | ❌ Too ambiguous for 4 states. |
| **Text label only** | Accessible, unambiguous. | Defeats the "ambient" goal — text demands reading. | ❌ Text label is the tertiary layer, not the primary indicator. |

### Recommended: Three-layer composite

```
Layer 1 (base)       → Static glow behind the dot. Always present.
Layer 2 (core)       → 8px solid dot. Colored by state.
Layer 3 (breath)     → Expanding ring that pulses outward.
```

The glow (layer 1) signals "exists." The dot (layer 2) signals "which mode."
The ring (layer 3) signals "alive / breathing." Together they read as a
single living indicator, not three separate elements.

**Why the current implementation is close but needs refinement:**
The current `StatusIndicator` already uses a dot (layer 2) + expanding ring
(layer 3). What's missing is the static glow (layer 1) and calibrated
animation values. The existing `easeInOut` on the ring feels mechanical —
replace with the emphasized decelerate curve from the motion reference
(`cubic-bezier(0.05, 0.7, 0.1, 1)`) for a more organic breath.

---

## 2. Sizing and Positioning

### Desktop (≥768px)

| Placement | Size | Notes |
| :--- | :--- | :--- |
| **Left sidebar header** (primary) | Dot: 8px diameter. Ring: expands to 20px. Glow: 16px blur radius. | Currently rendered via `<StatusIndicator />` in `left-sidebar.tsx` line 53. This is the primary location — the first thing the user sees when they open the app. |
| **Center panel top bar** (secondary) | Dot: 6px diameter. Ring: expands to 14px. Glow: 12px blur. | Currently rendered in `center-panel.tsx` line 316. Slightly smaller — it's in a content-dense area. |
| **Command palette** (if status shown) | Dot: 6px. No ring (too small a space). | Only if the palette includes agent status. Probably not needed — the palette is an action surface, not a status surface. |

### Mobile (<768px)

| Placement | Size | Notes |
| :--- | :--- | :--- |
| **Top bar / header** | Dot: 8px. Ring: same. | Sidebar collapses on mobile. Status moves to the top nav bar. Same sizes, just repositioned. |

### Positioning rules

- **12px padding** between the indicator and any adjacent text or border.
  The ring's maximum expansion (20px) should not overlap adjacent content.
- **Vertically centered** with any accompanying label text.
- **No tooltip on hover.** The indicator is ambient — if the user needs to
  know what it means, the text label next to it tells them. A tooltip on
  an ambient element is a contradiction.

---

## 3. States and Transitions

### State table

| State | Color | Glow intensity | Ring behavior | Text label | When |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Online** | `#00ff66` (primary) | 50% opacity, 16px blur | Slow breath: 3s cycle | "Online" | Agent is connected and idle. The default. |
| **Thinking** | `#00c8ff` (accent) | 70% opacity, 20px blur | Medium breath: 1.2s cycle | "Thinking" | User sent a message, agent is formulating a response. LLM call in progress, no tokens streaming yet. |
| **Streaming** | `#00ff66` (primary) | 90% opacity, 24px blur | Fast shimmer: 0.6s cycle, asymmetric (quick brighten, slow fade) | "Responding" | Tokens are streaming. The rhythm changes to signal active output. |
| **Error** | `#ff4d4d` (destructive) | 90% opacity, 24px blur | Two fast pulses (0.3s each), then return to Online | "Error" for 3s, then reverts | Agent hit a failure (network error, tool failure, rate limit). Brief red flash, then back to idle — doesn't stay red. |

### Why cyan for "Thinking" and green for "Streaming"?

The current implementation uses amber/warning for "Executing." This is wrong
— amber signals "caution" or "attention needed," not "working." The user
didn't do anything wrong — the agent is doing exactly what it's supposed to.

- **Cyan (accent)** for Thinking: cool, analytical, "processing." Matches the
  accent color token. Feels like a computer doing work.
- **Green (primary)** for Streaming: the agent is actively producing output.
  Green = "go," "live," "producing." The primary brand color.
- **Red (destructive)** for Error: brief, then gone. Red should never be the
  sustained state of the indicator — it's punctuation, not a paragraph.

### State transition matrix

```
Online ──(user sends msg)──→ Thinking ──(first token)──→ Streaming
  ↑                              │                          │
  │                              │ (error)                  │ (stream complete)
  │                              ↓                          ↓
  └────────────────────── Error ──────────────────── Online
                               (auto-reverts after 3s)
```

Every state eventually returns to Online. The indicator should never get
stuck in Thinking, Streaming, or Error.

---

## 4. Timing Values

All values from the motion reference doc. Nothing new invented here.

### Online (breathing)

| Property | Value |
| :--- | :--- |
| Cycle duration | `3,000ms` |
| Dot opacity range | `1 → 0.7 → 1` |
| Ring scale range | `1 → 2 → 1` |
| Ring opacity range | `0.3 → 0 → 0.3` |
| Glow opacity range | `0.5 → 0.35 → 0.5` |
| Easing | `cubic-bezier(0.05, 0.7, 0.1, 1)` — emphasized decelerate |

The online breath should be slow enough that you don't notice it consciously.
If you stare at it, you see it. If you're working, you don't. 3 seconds is
the threshold — faster, and peripheral vision catches the movement.

### Thinking (active pulse)

| Property | Value |
| :--- | :--- |
| Cycle duration | `1,200ms` |
| Dot opacity range | `1 → 0.5 → 1` |
| Ring scale range | `1 → 2.5 → 1` |
| Ring opacity range | `0.4 → 0 → 0.4` |
| Glow opacity range | `0.7 → 0.4 → 0.7` |
| Easing | `cubic-bezier(0.05, 0.7, 0.1, 1)` |

Thinking is a faster version of Online — same easing, same shape, faster
tempo. The ring expands slightly further (2.5× vs 2×) to signal "more
activity." The glow is brighter (70% vs 50%). Same family, different intensity.

### Streaming (shimmer)

| Property | Value |
| :--- | :--- |
| Cycle duration | `600ms` |
| Asymmetry | Brighten in 200ms, fade in 400ms |
| Dot opacity | Stays at `1` (solid) |
| Ring | Hidden entirely during streaming — too busy with fast shimmer |
| Glow opacity range | `0.9 → 0.5 → 0.9` |
| Glow blur | `24px` (expanded from 16px) |
| Easing (brighten) | `cubic-bezier(0, 0, 0.2, 1)` — fast out |
| Easing (fade) | `cubic-bezier(0.4, 0, 1, 1)` — fast in |

Streaming is different from Thinking. It's not a symmetrical breath — it's
an asymmetric shimmer. Quick bright, slow fade. This reads as "output
happening" — the glow brightens each time a new token chunk arrives, then
slowly dims. The dot stays solid (no opacity pulse) because "streaming"
isn't "waiting" — it's "producing."

**Implementation note:** The shimmer can optionally sync to actual token
arrival via the streaming callback. Each time `onStreamUpdate` fires,
trigger a micro-brighten (50ms to peak glow, then fade over 300ms).
If tokens are arriving faster than the fade duration, the glow stays bright
continuously — which is the correct signal: "actively streaming."

### Error (transient flash)

| Property | Value |
| :--- | :--- |
| Pulse count | `2` |
| Pulse duration | `300ms` each (600ms total) |
| Dot color | `#ff4d4d` |
| Glow color | `#ff4d4d` |
| Glow intensity | `0.9` opacity, `24px` blur |
| After flash | Transition to Online over 800ms (color + glow smoothly return to green) |
| Total error visibility | ~1.4s (2 pulses + transition) |

Error is punctuation. Two fast red pulses — enough to notice, not enough to
worry. Then the indicator returns to green Online. The text label shows
"Error" for 3 seconds then reverts to "Online." The red should never linger
— a persistent red dot reads as "something is broken" and creates background
anxiety. Errors in agentic systems are normal and transient.

---

## 5. Anti-Patterns

### What makes an indicator feel like a notification badge

These are the specific tells that push an indicator from "ambient" to
"attention-seeking." Every one of them is wrong for enry.agent.

| Pattern | Why it reads as a notification | Fix |
| :--- | :--- | :--- |
| **Unread count number** | Numbers = "you have X things to deal with." Creates task anxiety. | Never put a number on the indicator. It's status, not inbox. |
| **Bouncing / shaking animation** | "Look at me!" macOS dock bounce. Demands attention. | No translateY, no rotation, no shake. Only opacity + scale breathing. |
| **Red as a sustained color** | Red = problem, error, urgent. Even when the agent is fine, red creates unease. | Red only for the 1.4s error flash, then back to green. |
| **Positioned over content** (top-right of a card, floating) | Reads as "this element has an alert." Badge positioning. | Indicator lives in dedicated UI chrome — sidebar header, top bar. Never overlaid on content. |
| **Size > 12px** | A 16px+ dot reads as a button or tappable element. The user will try to click it. | 8px primary, 6px secondary. Small enough to be chrome, not content. |
| **Multiple indicators** | If there's a dot in the sidebar AND a dot in the center panel AND a dot in the command palette, it looks like a distributed notification system. | Two placements max (sidebar + center panel). Hide the center panel indicator on mobile. |
| **Ring that expands beyond 24px** | A ring expanding to 30-40px starts overlapping text and borders. Reads as a loading spinner or a decorative element. | Cap ring expansion at 2.5× the dot size (20px for 8px dot, 15px for 6px dot). |
| **Pulsing text label** | Text that fades in and out alongside the dot reads as "loading text" or a glitch. | Text label is static. Only the dot + ring + glow animate. |
| **Sound** | Audible notification on state change. | Never. The indicator is silent. |

### The "this is a chatbot" test

If a user who's never seen enry.agent looks at the indicator and thinks
"this is a chat widget" or "this is a notification I should click," the
indicator has failed. The indicator should read as system chrome — like a
macOS menu bar icon or a router status LED. It's infrastructure, not feature.

**Specific checks:**
- Does it look clickable? If yes, it's wrong. The indicator is not interactive.
- Would it make sense on a smart home hub or a server rack? If yes, right vibe.
- Would it make sense on a consumer messaging app? If yes, wrong vibe.

---

## 6. Accessibility Notes

### Screen readers

The indicator is decorative. The text label ("Online," "Thinking,"
"Responding," "Error") provides the semantic content. Mark the dot as
`aria-hidden="true"` so screen readers don't announce "green circle."

The text label should be wrapped in a `<span role="status" aria-live="polite">`
so screen readers announce state changes without interrupting the user.

```html
<div aria-hidden="true">
  <!-- dot + ring + glow -->
</div>
<span role="status" aria-live="polite">
  Online
</span>
```

### Reduced motion

Per the motion reference doc: when `prefers-reduced-motion: reduce` is set,
the ring animation stops entirely. The dot stays static and solid. The glow
stays at its base opacity (50% for Online, 70% for Thinking, 90% for
Streaming). State changes are communicated through color and the text label
only — no animation.

### Color blindness

The four states use color as the primary differentiator. For users who can't
distinguish green/cyan/red, the text label is the fallback. The animation
rhythms (slow/fast/shimmer) provide a secondary differentiator — but the
text label is the only guaranteed-accessible channel. Never remove the label.

---

## 7. Implementation Sketch

```tsx
// Pseudocode — not production, just structure guidance

const stateConfig = {
  online: {
    color: 'bg-primary',
    glowColor: 'rgba(0, 255, 102, 0.5)',
    glowBlur: 16,
    cycleDuration: 3000,
    dotOpacityRange: [1, 0.7, 1],
    ringScaleRange: [1, 2, 1],
    ringOpacityRange: [0.3, 0, 0.3],
    label: 'Online',
  },
  thinking: {
    color: 'bg-accent',
    glowColor: 'rgba(0, 200, 255, 0.7)',
    glowBlur: 20,
    cycleDuration: 1200,
    dotOpacityRange: [1, 0.5, 1],
    ringScaleRange: [1, 2.5, 1],
    ringOpacityRange: [0.4, 0, 0.4],
    label: 'Thinking',
  },
  streaming: {
    color: 'bg-primary',
    glowColor: 'rgba(0, 255, 102, 0.9)',
    glowBlur: 24,
    cycleDuration: 600,
    asymmetricShimmer: true,
    dotSolid: true,
    hideRing: true,
    label: 'Responding',
  },
  error: {
    color: 'bg-destructive',
    glowColor: 'rgba(255, 77, 77, 0.9)',
    glowBlur: 24,
    pulseCount: 2,
    pulseDuration: 300,
    label: 'Error',
    autoRevertTo: 'online',
    autoRevertAfter: 3000,
  },
}
```

The component receives `status` as a prop (same interface as current
`StatusIndicator`). Framer Motion handles the breathing animation with
`animate` keyframes. The error state uses a `useEffect` with a `setTimeout`
to auto-revert to `online` after 3 seconds.

---

## 8. Comparison: Current vs. Proposed

| Aspect | Current (status-indicator.tsx) | Proposed |
| :--- | :--- | :--- |
| States | online, thinking, executing, idle | online, thinking, streaming, error |
| Thinking color | Cyan (accent) — correct | Keep cyan ✅ |
| Executing / Streaming color | Amber (warning) — wrong | Green (primary) — active output |
| Idle | Gray dot — dull, reads as "offline" | Green dot, slow breath — reads as "alive but resting" |
| Error | Not implemented | Red flash, 1.4s then auto-revert |
| Easing | `easeInOut` — mechanical | `[0.05, 0.7, 0.1, 1]` — organic breath |
| Glow | `shadow-[0_0_10px_rgba(...)]` — fixed | Dynamic glow that pulses with the ring |
| Ring cap | No cap — expands to arbitrary size | Capped at 2.5× dot size |
| Text label | Static, no aria | `role="status" aria-live="polite"` |
