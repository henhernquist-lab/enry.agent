# Ambient Animated Background — Design Spec

> Target: subtle, futuristic, "the app feels alive" — never distract from content.
> Reference standard: Linear, Vercel dashboard, Arc browser spaces, Anthropic console.
> Implementation guide for Claude Code. Read-only spec — no code changes here.

---

## Reference Analysis

### What the best apps do — and why it works

| Product | Pattern | Why it works | Key technique |
| :--- | :--- | :--- | :--- |
| **Linear** | Thin-line grid + barely-visible wash | Grid = structure, precision. Makes the canvas feel engineered, not empty. | Grid lines at 2-5% opacity on a near-black surface. No motion on the grid itself. |
| **Vercel** | Dot matrix / subtle mesh | Developer-first environment. Dots feel lighter than lines. Grounding without clutter. | A subtle point-grid that anchors the eye without drawing attention. |
| **Arc** | Gradient washes behind content | Spatial orientation. Soft color blooms separate Workspaces (Work vs. Personal) without hard edges. | Slow-moving gradient bleeds — think cloud shadows, not screen savers. |
| **Raycast** | Particle/glow micro-effects | Premium texture. A hint of techno-polish that rewards attention without demanding it. | Glows appear/disappear on interaction, not idly. |
| **Anthropic** | Warm editorial restraint | Calm. Reduces screen fatigue during deep work. Feels like a tool that respects your time. | Warmer neutrals, zero motion, texture via typography not effects. |

### The universal rule

**By 2-10% opacity.** Every effective ambient background lives at the threshold
of perception. Users shouldn't consciously notice it. They should feel it
subconsciously — structure, depth, life — without ever thinking "the background
is doing something." If a user can describe what the background looks like
without looking for it, the effect is too strong.

---

## Color Palette (existing token set only)

No new colors. Pull from enry.agent's existing CSS variables.

| Token | Hex | Use in background |
| :--- | :--- | :--- |
| `--surface-base` | `#080808` | Base background — never animate this |
| `--primary` | `#00ff66` | The **only** accent color for animated elements. Sparingly. |
| `--accent` | `#00c8ff` | **Do not use.** Cyan + dark UI = "2015 sci-fi terminal simulator." |
| `--border` | `#262626` | Grid lines, dot colors, subtle structure |
| `--muted-foreground` | `#9ca3af` | **Do not use.** Gray on dark reads as noise, not atmosphere. |
| `--warning` | `#ffb800` | **Do not use.** Amber = alert/warning semantics. Confusing in a background. |

**Rule:** If an animated element isn't using `#00ff66` (primary green), it
should be using a near-transparent white/gray — `rgba(255,255,255,0.02)` to
`rgba(255,255,255,0.06)` range. No other color enters the ambient layer.

---

## Motion Timing

### Speed taxonomy

| Category | Duration / speed | Use for | Example |
| :--- | :--- | :--- | :--- |
| **Glacial** | 60–120 seconds per cycle | Gradient washes, large-scale drift | A gradient bloom slowly traversing the viewport |
| **Ambient** | 8–20 seconds per cycle | Particle/dot float, subtle glow pulse | A handful of dots drifting upward |
| **Breathing** | 3–6 seconds per cycle | Micro-glow on interactive areas, status indicators | The primary accent ring on the chat input |
| **Responsive** | 200–400ms | Hover/click feedback | Grid highlight on mouse proximity |

### Rules

1. **No looping faster than 3 seconds.** Anything faster reads as "animation,"
   not "atmosphere." The brain registers it as motion, checks if it's
   important, and diverts attention from content.

2. **No perfectly synchronized elements.** If multiple dots, particles, or
   gradient nodes are moving, stagger their phase by random offsets. Avoid
   the "screensaver effect" where everything moves in lockstep.

3. **Ease, don't linear.** Use `ease-in-out` or cubic-bezier curves for
   anything drifting. Linear motion reads as mechanical/robotic, not organic.
   Exception: data traces (vertical lines) are intentionally linear —
   they represent data flow, not natural movement.

4. **No infinite loops that visibly restart.** Fade elements out before they
   reach their loop point, or use overlapping cycles so one fades in as
   another fades out. Visible resets break immersion.

---

## Opacity / Contrast Guidelines

### Target ranges

| Element | Min opacity | Max opacity | Notes |
| :--- | :---: | :---: | :--- |
| Grid lines | 2% | 5% | Currently at 40% — **way too high.** Should feel like graph paper glimpsed through tracing paper. |
| Dot/particle glow | 3% | 10% | At 10%, a green dot on `#080808` is visible but not loud. Closer to 5% is ideal. |
| Gradient washes | 3% | 8% | The gradient exists in color space only — an `rgba(0,255,102,0.04)` bloom is perceptible as depth, not as color. |
| Data traces (vertical lines) | 0% → 6% → 0% | Peak at 6% | Currently at 20% with a 0→0.5→0 opacity cycle — reduce peak to 0.06 (6%). |
| Scanlines | 1% | 2% | Currently at 3% black stripes — could go even subtler. |

### The squint test

Squint at the screen. If you can identify *what* is moving, it's too strong.
If you can only sense *that something* is moving — a feeling of depth or life —
it's right.

---

## Technical Approach

### Recommended: Canvas-based noise + gradient mesh (hybrid)

**Not** a single technique. The best ambient backgrounds layer 2–3 techniques
at different depths and speeds.

| Layer | Technique | Purpose | Depth |
| :--- | :--- | :--- | :--- |
| **Layer 1 (deepest)** | Large slow gradient bloom (SVG/div with `filter: blur(200px)`) | Atmospheric depth, spatial orientation | z-0 |
| **Layer 2** | Canvas noise field — Perlin/simplex noise with ~40px scale, mapped to alpha | Subtle texture, organic "aliveness" | z-0 |
| **Layer 3 (closest to content)** | CSS grid overlay (thin lines, very low opacity) | Structure, precision | z-0 |

### Why this approach beats the alternatives

**CSS animated gradient mesh (rejected):** Looks great on landing pages, fails
in tools. Gradient meshes at tool-appropriate opacity are invisible on
dark backgrounds. At higher opacity they're distracting. Too heavy to compute
smoothly at 60fps in a content-heavy React app.

**SVG particles (rejected):** SVG is the right tool for static illustrations.
Hundreds of animated SVG elements thrash the DOM. Canvas is purpose-built
for particle systems — zero layout cost, zero reflow.

**Pure CSS glow overlays (rejected):** Works for hero sections. Not for a
persistent tool UI. Fixed-position glow overlays create banding and clipping
artifacts at panel boundaries.

**Canvas noise field (recommended):** A single `<canvas>` with a 2D noise
shader. Compute a simplex/perlin noise value at each pixel, map it to a
low alpha, and render at ~30fps (not 60 — saves battery, motion reads the
same at ambient speeds). The noise field is the anchor — everything else
(big gradient bloom, subtle grid) layers on top with CSS.

The noise field doesn't "animate" in the traditional sense — it shifts one
pixel per frame while blending between noise samples. This creates the
feeling of air moving, or light changing on a surface, without any
recognizable "thing" moving.

**Performance note:** The canvas should render at 1/4 resolution (scaled up
with `imageSmoothingEnabled: false` for a subtle pixel-grid effect, or with
CSS `image-rendering: pixelated` if that's desired). At full resolution,
Perlin noise computation across a 2560×1440 viewport is too expensive for
a background layer. Quarter-res → 640×360 → trivially cheap.

---

## Common Failure Modes to Avoid

### "Looks vibe-coded" — the exact patterns to reject

These are the patterns that read as "someone asked an AI to make a cool
background" rather than "a designer made a deliberate choice."

| Pattern | Why it fails | What to do instead |
| :--- | :--- | :--- |
| **Rainbow gradients** | Screams "2015 SaaS landing page hero." No coherent color system. | Monochromatic. One accent color max. Green only. |
| **Fast movement** | Triggers peripheral vision. The eye treats motion as a potential threat or notification. | Nothing moves faster than glacial/ambient speeds. Ever. |
| **Obvious circular loops** | A dot tracing the same circle every 4 seconds is a screensaver, not atmosphere. | Overlap cycles at different phases. No two elements should visibly repeat in sync. |
| **Matrix rain / falling characters** | The most clichéd "tech" visual in existence. Instant credibility loss. | Data traces should be single-pixel-wide vertical beams at 4-6% opacity max, not green text characters. |
| **Pulsing glow on everything** | Glows are spice, not the meal. Overuse reads as "trying too hard to look futuristic." | One glow. One place. The chat input ring or the status dot. That's it. |
| **High contrast between background and panels** | Creates a "floating rectangles on a busy background" effect that hurts readability. | Panels should sit on the background, not fight it. The background should be darker and subtler than any panel. |
| **Background visible through panel backgrounds** | If you can see the grid through a `bg-surface-elevated` panel, the grid is too strong or the panel is too transparent. | Panels must be opaque. The background lives in the gaps between panels and in the page-level negative space. |
| **Responsive death** | Background effects that work at 1440p but choke mobile devices. | Canvas renders at 1/4 viewport resolution. `requestAnimationFrame` with a frame-skip counter (render every 2nd frame on mobile). |
| **Battery drain** | A 60fps canvas + React re-renders = laptop fans in 2 minutes. | Target 20-30fps actual render rate. Use `performance.now()` throttling, not `setInterval`. |

### The Litmus Test

After implementing, ask:

1. **Does it still feel like enry.agent?** If the background makes the app
   feel like a different product, it's wrong.
2. **Can I read a chat message without the background pulling my eye?**
   If the answer is "barely" or "it's a little distracting," tone it down.
3. **If I disable the background entirely, does the app feel worse?**
   If the answer is no — if the app feels the same or better — the background
   isn't adding value. It should feel like something is missing when turned off.
4. **Would I show this to a teammate without feeling self-conscious?**
   If there's any cringe, simplify.

---

## Implementation Phases (for Claude Code)

### Phase 1 — Calibrate what exists

Before building anything new, fix what's already there:
- Drop `.grid-overlay` opacity from `0.4` (40%) to `0.05` (5%)
- Drop `DataTraces` container opacity from `0.2` (20%) to `0.06` (6%)
- Drop scanlines `rgba(0,0,0,0.03)` to `rgba(0,0,0,0.015)`
- Test. Squint. Does it still feel like "something"? Good. Now build the new
  layer against this subtler baseline.

### Phase 2 — Add the noise field

- Create `src/components/ambient-noise.tsx` — a single `<canvas>` component
  with Perlin/simplex noise, 1/4 viewport resolution, rendering at ~25fps
- Noise alpha range: 0.01–0.04 (1-4% opacity equivalent)
- Noise scale: ~60px feature size (each "blob" of noise covers ~60px)
- Noise speed: shift 0.5–1.0 pixels per frame
- Only render when the tab is visible (`document.visibilityState`)

### Phase 3 — Add the gradient bloom

- A single large `div` (or SVG `radialGradient`) with `filter: blur(180px)`
  positioned off-center (e.g. 70% right, 30% top)
- Color: `rgba(0, 255, 102, 0.03)` — barely-there green
- Motion: drift 5-10px over 90 seconds, reverse direction, loop (ease-in-out)
- This creates the feeling of "light shifting" — like a window in the room
  is slowly changing — without any recognizable shape

### Phase 4 — Polish and calibrate

- Layer order (bottom → top): gradient bloom → noise canvas → grid overlay
  → scanlines → content panels
- Test on: 1080p, 1440p, 4K, mobile (375px)
- Test with: empty chat, dense chat, tool panel open, onboarding flow
- The noise field should be slightly more visible on the empty chat (it
  provides visual interest where there's no content) and nearly invisible
  behind dense tool panels

---

## Reference Values (starting calibration)

```css
/* Grid — subtle graphite structure */
--ambient-grid-opacity: 0.04;        /* was 0.4 — 10x reduction */
--ambient-grid-color: #262626;       /* border token — no change */

/* Gradient bloom — depth without distraction */
--ambient-bloom-color: rgba(0, 255, 102, 0.03);
--ambient-bloom-blur: 180px;
--ambient-bloom-size: 60vw;          /* large enough to never see edges */
--ambient-bloom-duration: 90s;       /* one full drift cycle */

/* Noise field — organic texture */
--ambient-noise-alpha-min: 0.01;     /* 1% — darkest noise */
--ambient-noise-alpha-max: 0.04;     /* 4% — brightest noise */
--ambient-noise-scale: 60;           /* px per noise feature */
--ambient-noise-fps: 25;             /* target render rate */
--ambient-noise-drift: 0.8;          /* px per frame shift */

/* Data traces — subtle flow indicators */
--ambient-trace-opacity: 0.06;       /* was 0.2 — container opacity */
--ambient-trace-peak: 0.06;          /* was 0.5 — peak individual opacity */

/* Scanlines — barely-there texture */
--ambient-scanline-opacity: 0.015;   /* was 0.03 — RGBA black stripes */
```

These are starting points. Calibrate by eye on the actual rendered app, not
in isolation. The right value is the one you can't quite tell is there.
