# Motion Design Reference — enry.agent

> Target: "serious tool, not landing page" — Linear, Vercel, Raycast, Arc.
> Direct, functional, invisible-until-you-notice-it's-missing.
> Implementation reference for Claude Code (Batch B).

---

## 1. Duration Table

All values in milliseconds. These are canonical — if a component uses a
different duration, it's wrong and should be updated to match this table.

### Interaction durations (quick — under 300ms)

| Interaction | Duration | Why this value |
| :--- | :---: | :--- |
| **Hover state change** (color, border, bg) | `120ms` | Fast enough to feel instant, slow enough to avoid flicker. CSS `transition` on the hover target, not a Framer Motion animation. |
| **Button press / tap feedback** | `100ms` | Scale from 1 → 0.97 and back. Any longer feels laggy; shorter feels like nothing happened. |
| **Checkbox / toggle** | `150ms` | Tick mark or switch needs to be seen completing. 100ms is too fast to register the state change. |
| **Tooltip enter** | `200ms` | Slight delay so hovering past things doesn't trigger tooltips. Fade in, not slide. |
| **Tooltip exit** | `100ms` | Fast exit — no one waits for a tooltip to leave. |
| **Dropdown / popover open** | `150ms` | Quick scale+opacity entrance. Feels snappy. |
| **Dropdown / popover close** | `100ms` | Faster close than open — the user is moving on. |
| **Save confirmation** ("Saved." toast) | `180ms` enter, `200ms` hold, `150ms` exit | Enter quick, sit still for reading, exit faster. |

### Transition durations (structural — 150–400ms)

| Interaction | Duration | Why this value |
| :--- | :---: | :--- |
| **Modal open** | `200ms` | Scale 0.95→1 + opacity 0→1. Fast enough to feel responsive, slow enough to signal "new context." |
| **Modal close** | `150ms` | Reverse. Faster close respects the user's intent to leave. |
| **Page transition** (route change) | `250ms` | Crossfade or slide. Needs to feel like a meaningful navigation without being sluggish. |
| **Tab switch** (inline content swap) | `200ms` | Faster than page transition — same context, different view. |
| **Sidebar panel expand/collapse** | `250ms` | Layout shift — needs enough time to not feel jarring but not so much that the UI feels heavy. |
| **List item stagger** (per-item delay) | `35ms` | Each card enters 35ms after the previous. 0.035s × 5 cards = 0.175s total — fast cascade. |
| **List item enter** (individual) | `200ms` | Opacity 0→1 + y offset. Standard item entrance. |

### Ambient / loop durations (background — 1s+)

| Interaction | Duration | Why this value |
| :--- | :---: | :--- |
| **Status dot pulse** (idle) | `3000ms` | Slow breathing. The idle state should feel calm. |
| **Status dot pulse** (thinking) | `1000ms` | Faster pulse = "working." Still not frantic. |
| **Status dot pulse** (executing) | `500ms` | Quickest pulse = "actively processing." Signals urgency without panic. |
| **Streaming cursor blink** | `600ms` | On 400ms / off 200ms. Recognizable as a cursor. |
| **Gradient bloom drift** (ambient bg) | `90,000ms` (90s) | Per the ambient background spec. Glacial. |
| **Data trace vertical flow** | `4,000–6,000ms` | One trace from top to bottom. Randomized per trace. |
| **Loading spinner** (indeterminate) | `1,000ms` per rotation | Standard spinner speed. Don't customize this. |

### Animation taxonomy summary

```
0–150ms   : Micro-interactions (hover, tap, toggle, tooltip)
150–300ms : Transitions (modal, page, tab, sidebar, item enter)
300–600ms : State pulses (status, cursor blink)
1s–90s    : Ambient loops (spinner, traces, background drift)
```

**Nothing in the tool UI should animate for longer than 400ms unless it's
ambient/loop.** If an animation takes >400ms, ask: is this decorative or
functional? If decorative — cut it. If functional (e.g., a progress bar
filling) — it's fine, but cap at 3,000ms max.

---

## 2. Easing Curves

"easeOut" is not specific enough. Every easing must have an explicit
cubic-bezier or a Framer Motion spring config with exact values.

### Standard easing catalog

| Name | cubic-bezier | Framer Motion equivalent | Use for |
| :--- | :--- | :--- | :--- |
| **Fast out** | `cubic-bezier(0, 0, 0.2, 1)` | `{ ease: [0, 0, 0.2, 1] }` | Modal open, popover open, toast enter. Fast start, decelerates smoothly. |
| **Fast in** | `cubic-bezier(0.4, 0, 1, 1)` | `{ ease: [0.4, 0, 1, 1] }` | Modal close, popover close, toast exit. Accelerates into disappearance. |
| **Standard productive** | `cubic-bezier(0.2, 0, 0, 1)` | `{ ease: [0.2, 0, 0, 1] }` | Page transitions, tab switches, sidebar panels. Slightly snappier than material design standard. |
| **Emphasized decelerate** | `cubic-bezier(0.05, 0.7, 0.1, 1)` | `{ ease: [0.05, 0.7, 0.1, 1] }` | List item enter/exit, stagger sequences. Gentle deceleration — items "settle" into place. |
| **Linear** | `cubic-bezier(0, 0, 1, 1)` | `{ ease: 'linear' }` | Data traces, loading spinners, cursor blinks. Constant speed only for mechanical/indeterminate motion. |
| **Sharp** | `cubic-bezier(0.4, 0, 0.6, 1)` | `{ ease: [0.4, 0, 0.6, 1] }` | Hover transitions (CSS, not Framer Motion). Slight curve — invisible, just feels right. |

### Spring configs — exactly one spring

**The codebase currently uses 4 different spring configs** (`stiffness:
200/300/350/400`, `damping: 26/28/30`). This is too many. Consolidate to one:

| Property | Value | Why |
| :--- | :---: | :--- |
| **stiffness** | `300` | Snappy but not bouncy. Linear's command palette uses ~300. Material Design 3 uses 200-400 range. 300 is the sweet spot. |
| **damping** | `28` | Slightly underdamped — introduces a barely-perceptible bounce that reads as "polished" without being playful. Critical damping would be 30 (no bounce at all); 28 gives 1-2% overshoot. |
| **mass** | `1` | Default. Don't touch this. |

**Canonical spring config:**

```ts
const toolSpring = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 28,
}
```

**When to use spring vs. duration-based easing:**

| Use spring for… | Use duration + cubic-bezier for… |
| :--- | :--- |
| List item stagger entrances | Modal open/close |
| Tab indicator (layoutId) | Popover open/close |
| Expand/collapse height | Page transitions |
| Scale-on-tap feedback | Toast enter/exit |
| Drag / gesture response | Anything that shouldn't overshoot at all |

**Rule:** If the animation has a fixed endpoint (open → closed, off → on), use
duration. If the animation has a natural-feeling target (item settling into
a grid, indicator tracking a tab), use spring.

### Mapped to interactions

| Interaction | Easing | Duration |
| :--- | :--- | :---: |
| Hover state change | `cubic-bezier(0.4, 0, 0.6, 1)` (CSS) | `120ms` |
| Button press | Spring `{ stiffness: 300, damping: 28 }` | — |
| Checkbox/toggle | `cubic-bezier(0, 0, 0.2, 1)` | `150ms` |
| Tooltip enter | `cubic-bezier(0, 0, 0.2, 1)` | `200ms` |
| Tooltip exit | `cubic-bezier(0.4, 0, 1, 1)` | `100ms` |
| Dropdown/popover open | `cubic-bezier(0, 0, 0.2, 1)` | `150ms` |
| Dropdown/popover close | `cubic-bezier(0.4, 0, 1, 1)` | `100ms` |
| Save confirmation enter | `cubic-bezier(0, 0, 0.2, 1)` | `180ms` |
| Save confirmation exit | `cubic-bezier(0.4, 0, 1, 1)` | `150ms` |
| Modal open | `cubic-bezier(0, 0, 0.2, 1)` | `200ms` |
| Modal close | `cubic-bezier(0.4, 0, 1, 1)` | `150ms` |
| Page transition | `cubic-bezier(0.2, 0, 0, 1)` | `250ms` |
| Tab switch | `cubic-bezier(0.2, 0, 0, 1)` | `200ms` |
| Sidebar expand/collapse | `cubic-bezier(0.2, 0, 0, 1)` | `250ms` |
| List item stagger enter | Spring `{ stiffness: 300, damping: 28 }` | — |
| List item exit | `cubic-bezier(0.05, 0.7, 0.1, 1)` | `200ms` |
| Tab indicator (layoutId) | Spring `{ stiffness: 300, damping: 28 }` | — |
| Status pulse (all states) | `cubic-bezier(0.4, 0, 0.6, 1)` | Varies by state |
| Data traces | `linear` | `4,000–6,000ms` |

---

## 3. Anti-Patterns

### What makes an animation feel "vibe-coded" vs. "designed"

The line between the two is subtle but binary. These are the specific tells.

#### Bouncy springs on everything

**Vibe-coded:** `{ type: 'spring', stiffness: 100, damping: 10 }` on a modal.
It bounces in like a beach ball. Fun for 2 seconds, annoying on the 50th open.

**Designed:** Single spring config (`stiffness: 300, damping: 28`) used
selectively — list items, tab indicators, scale-on-tap. Moves feel tight and
professional, never playful.

**Fix:** If you can consciously feel the bounce, it's too much. A well-tuned
spring should feel "snappy," not "springy." Most interactions don't need
springs at all — duration + cubic-bezier is the right call for anything with
a fixed endpoint.

#### Long durations (>400ms for non-ambient)

**Vibe-coded:** A modal that takes 600ms to open. A page transition that fades
for 800ms. Feels like the app is loading, not animating. The user waits.

**Designed:** Modal opens in 200ms. Page transition in 250ms. The user
perceives the change but isn't made to wait for it.

**Fix:** Time your animation. If you can say "one-mississippi" while it plays,
it's too long. The brain registers smooth motion at 150-250ms. Beyond 400ms,
it stops feeling "smooth" and starts feeling "slow."

#### Decorative rotations, flips, 3D transforms

**Vibe-coded:** Cards that rotate 360° on hover. Buttons that skew on click.
A logo that spins while loading. Any transform that says "look what I can do."

**Designed:** Only one 3D transform in the entire app — the flashcard flip
(`rotateY: 90`). It's there because the interaction IS the feature, not
because it looks cool. Everything else is 2D: `opacity`, `y`, `x`, `scale`.

**Fix:** If an animation would still make sense as a static screenshot, it
doesn't need a 3D transform. The flashcard flip is the exception because
the interaction IS the animation — removing it removes the feature.

#### Fade-in-on-scroll for everything

**Vibe-coded:** Every section fades in as you scroll. Hero text, feature cards,
footer — all opacity 0→1 with staggered delays. Feels like a Wix template.

**Designed:** Scroll-based reveal is used exactly once — the resources grid
card stagger on `/resources`. Everything else renders immediately. The app is
a tool, not a story. Content should be there when the user gets there.

**Fix:** If you're adding `whileInView` or `useScroll` to solve a problem other
than "this page has a narrative flow," it's wrong. enry.agent has zero
narrative flow — it's a workspace.

#### AnimatePresence without `mode="wait"`

**Vibe-coded:** Content flashes because the entering and exiting elements
occupy the same space simultaneously. A flicker that reads as a bug.

**Designed:** `mode="wait"` on every `AnimatePresence` that swaps content in
the same container. The exiting element fully leaves before the entering one
appears. No overlap, no flicker.

**Current codebase issue:** Several `AnimatePresence` usages are missing
`mode="wait"` — e.g., `habit-streaks.tsx`, `daily-checkin.tsx`,
`meal-logger.tsx`. These should be fixed in Batch B.

#### Scale: 0 or scale: 0.5 entrances

**Vibe-coded:** Elements that zoom in from zero. Reads as "pop-in effect" —
the default Framer Motion tutorial animation. Feels like a PowerPoint transition.

**Designed:** `scale: 0.95` for modals (subtle zoom — signals depth).
`scale: 0.97` for popovers (barely perceptible — signals origin). `scale: 1`
everywhere else (no scale animation at all).

**Fix:** If scale is below 0.9, it's a special effect. If it's not a modal
or popover, it shouldn't have a scale animation at all. List items enter with
`opacity + y`, not `scale`.

#### Animated height from 0

**Vibe-coded:** `animate={{ height: 'auto' }}` or `animate={{ height: 0 }}`.
Triggers layout recalculation on every frame. Janky on complex pages.

**Designed:** Avoid `height` animation entirely. Use `opacity` + `y` for
entrances. For expand/collapse, prefer a fixed known height or use the
`layout` prop with `AnimatePresence` instead of animating `height` directly.

**Current codebase issue:** `automations-section.tsx` animates from `height: 0`
to `height: 'auto'`. This is expensive. Replace with a two-step sequence:
render at full height with `opacity: 0`, then animate `opacity` to 1.

---

## 4. Reduced Motion Guidelines

### The media query

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

This handles CSS transitions/animations globally. But Framer Motion runs in
JS — it doesn't respect this media query. Every Framer Motion animation needs
an explicit reduced-motion fallback.

### Fallback table

| Animation type | Full-motion behavior | Reduced-motion fallback |
| :--- | :--- | :--- |
| **Modal open** | Scale 0.95→1, opacity 0→1, 200ms | Opacity 0→1, 0ms (instant). No scale. |
| **Modal close** | Scale 1→0.95, opacity 1→0, 150ms | Opacity 1→0, 0ms. No scale. |
| **Page transition** | Slide x-30→0, opacity 0→1, 250ms | Opacity 0→1, 0ms. No slide. |
| **List item stagger** | Spring entrance with 35ms stagger | All items appear at once, opacity 0→1, 0ms. No stagger, no y offset. |
| **Tab indicator (layoutId)** | Spring animation | Instant position change (CSS class swap, no animation). |
| **Status dot pulse** | Breathing opacity cycle | Static solid dot. No animation. |
| **Streaming cursor blink** | 600ms blink cycle | Static visible cursor. No blink. |
| **Data traces (ambient)** | Vertical flow | Hidden entirely. No background motion. |
| **Gradient bloom drift** | 90s slow drift | Hidden entirely. |
| **Noise field (ambient)** | 25fps canvas render | Hidden entirely. |
| **Hover transitions** | 120ms color/shadow change | Instant change. |
| **Tooltip/popover** | 150ms fade+scale | Instant appear/disappear. |
| **Save confirmation** | 180ms enter, 150ms exit | Instant appear, hold 200ms, instant disappear. |
| **Flashcard flip** | rotateY 90→0 animation | Simple opacity crossfade — front hides instantly, back shows instantly. No rotation. |

### Implementation pattern

```tsx
import { useReducedMotion } from 'framer-motion'

function MyComponent() {
  const prefersReduced = useReducedMotion()

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={prefersReduced ? { duration: 0 } : { duration: 0.2, ease: [0, 0, 0.2, 1] }}
    >
      content
    </motion.div>
  )
}
```

**One-liner helper (add to a shared `useMotion` hook):**

```ts
const useSafeMotion = () => {
  const reduced = useReducedMotion()
  return {
    reduced,
    itemEnter: reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0 } }
      : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: [0.05, 0.7, 0.1, 1] } },
    modalEnter: reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
      : { initial: { opacity: 0, scale: 0.95, y: 10 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: 10 }, transition: { duration: 0.2, ease: [0, 0, 0.2, 1] } },
  }
}
```

---

## 5. Performance Guidance

### Safe to animate (GPU-composited — free)

These properties trigger only compositing — no layout, no paint. They run at
60fps even on low-power devices.

| Property | Framer Motion usage |
| :--- | :--- |
| `opacity` | `animate={{ opacity: 1 }}` |
| `transform: scale()` | `animate={{ scale: 1 }}` |
| `transform: translateX()` | `animate={{ x: 0 }}` |
| `transform: translateY()` | `animate={{ y: 0 }}` |
| `transform: rotate()` | `animate={{ rotate: 0 }}` |
| `transform: translateZ()` | Rarely used, but safe |

**Rule:** 90%+ of all animations should use only these properties. If you're
not animating opacity, scale, x, or y — question why.

### Expensive to animate (triggers layout — costly)

These properties trigger layout recalculation on every frame. The browser
must reflow the entire page, then repaint, then composite. This is ~100× more
expensive than a GPU-composited animation.

| Property | Why expensive | What to use instead |
| :--- | :--- | :--- |
| `width`, `height` | Triggers layout reflow for the element and all siblings | Avoid entirely. Use `scale` for visual size changes, or `layout` prop for layoutId transitions. |
| `top`, `left`, `right`, `bottom` | Triggers layout reflow | Use `x` and `y` (CSS transforms). Same visual result, zero layout cost. |
| `margin`, `padding` | Triggers layout reflow | Design around fixed padding. Animate `gap` only if absolutely necessary (and even then, prefer opacity transitions). |
| `border-width` | Triggers paint + potentially layout | Use `box-shadow` or `outline` for border-like effects if animation is needed. |
| `font-size` | Triggers layout reflow + text reshaping | Avoid. Use `scale` if you must enlarge text (but beware: fractional scaling looks blurry). |

### Moderately expensive (triggers paint — use sparingly)

These don't trigger layout but do trigger paint. They're acceptable at low
frequency but shouldn't be used in high-density animations (e.g., a list of
50 items each animating `box-shadow`).

| Property | Cost | Guidance |
| :--- | :--- | :--- |
| `box-shadow` | Paint | Fine for 1-3 elements simultaneously (e.g., the chat input glow). Don't animate on every card in a grid. |
| `background-color` | Paint | Fine for hover transitions on single elements. Don't animate across a page transition. |
| `border-color` | Paint | Same as background-color. |
| `color` | Paint | Fine. Text color changes are cheap. |
| `filter: blur()` | Paint + some GPU | Expensive. Use only for the ambient gradient bloom (one element ever). |

### Framer Motion–specific performance tips

**1. Use `layout` prop instead of animating size directly.**
When transitioning between layouts (e.g., a card expanding to full detail),
use `<motion.div layout>` with `layoutId`. Framer Motion calculates the
transform difference and animates with GPU-composited properties only.

**2. Avoid `AnimatePresence` inside large lists.**
`AnimatePresence` tracks every child's presence. In a list of 50+ items,
this is expensive. For large lists, animate the container, not each child.

**3. Use `will-change` sparingly.**
Don't add `will-change: transform` to every animated element. The browser
pre-allocates GPU memory for each one. Let Framer Motion handle this —
it adds and removes `will-change` dynamically during animations.

**4. Stagger delays are cheap; stagger animations are not.**
`transition={{ delay: index * 0.035 }}` on 20 items is fine — 20 elements
each playing a 200ms animation, staggered. But 100 items each with
independent spring animations will drop frames. Cap staggers at ~30 items.

**5. The ambient background canvas is the biggest performance risk.**
The noise field renders at 25fps on a quarter-resolution canvas. That's
cheap. But **never** run it at full resolution or at 60fps. Follow the
ambient background spec exactly.

---

## Quick Reference Card

```
┌─ Duration ─────────────────────────────────────────────────────┐
│  100ms    Tap feedback, tooltip exit, popover close            │
│  120ms    Hover transitions (CSS)                              │
│  150ms    Toggle, modal close, save exit                       │
│  180ms    Save enter, dropdown open                            │
│  200ms    Modal open, tab switch, item enter, tooltip enter    │
│  250ms    Page transition, sidebar expand                      │
│  300ms+   Ambient only (status pulse, spinner, traces, bloom)  │
└────────────────────────────────────────────────────────────────┘

┌─ Easing ───────────────────────────────────────────────────────┐
│  Fast out       [0, 0, 0.2, 1]       Modal/popover open       │
│  Fast in        [0.4, 0, 1, 1]       Modal/popover close      │
│  Standard       [0.2, 0, 0, 1]       Page/tab/sidebar         │
│  Emphasized     [0.05, 0.7, 0.1, 1]  List items, stagger      │
│  Sharp          [0.4, 0, 0.6, 1]     CSS hover transitions    │
│  Spring         { stiff: 300, damp: 28 }  List stagger, tabs, │
│                                           expand/collapse      │
└────────────────────────────────────────────────────────────────┘

┌─ Safe properties ──────────────────────────────────────────────┐
│  Always safe:       opacity, scale, x, y, rotate               │
│  Sometimes OK:      box-shadow, background-color, color        │
│  Never animate:     width, height, top, left, margin, padding  │
└────────────────────────────────────────────────────────────────┘

┌─ Reduced motion ───────────────────────────────────────────────┐
│  useReducedMotion() on every animated component.               │
│  Fallback: instant opacity-only, no scale/slide/stagger.       │
│  Ambient effects hidden entirely.                              │
└────────────────────────────────────────────────────────────────┘
```
