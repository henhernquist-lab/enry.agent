# Typography Recommendation — enry.agent

> Aesthetic target: futuristic, technical, serious tool for elite performers.
> Reference vibes: Linear, Vercel, Raycast, Arc browser.
> Dark UI (#080808 base), green accent (#00ff66), direct/no-fluff tone.

---

## Current State

| Role | Font | Status |
| :--- | :--- | :--- |
| Sans / UI | **Inter** (via `--font-inter`) | In use |
| Mono | **IBM Plex Mono** (via `--font-ibm-plex-mono`) | In use |
| Display | **Space Grotesk** (via `--font-space-grotesk`) | Defined but rarely used |

Inter is a strong default — the most-readable UI font on the market. But it's
also the "everything" font (every SaaS, every dashboard). The upgrade is about
shedding that generic feel without sacrificing readability.

---

## Display / UI Font Comparison

| Font | Character | Readability at 11–14px | Weights | License | Google Fonts? |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Inter** | Neutral, neo-grotesque, "safe" | ⭐⭐⭐⭐⭐ Gold standard | Thin → Black (9) | SIL OFL | ✅ |
| **Geist** | Engineered, technical, minimal — *literally Vercel's design language* | ⭐⭐⭐⭐⭐ Built to beat Inter at small sizes | Variable + 9 static | MIT | ✅ |
| **Satoshi** | Modernist, sharper, tech-brand feel | ⭐⭐⭐⭐ Slightly narrower, less tested on dark | Thin → Black (9) | Free (Fontshare) | ❌ |
| **General Sans** | Geometric, rational, compact — *great for dashboards* | ⭐⭐⭐⭐ Compact but clear | Thin → Black (9) | Free (Fontshare) | ❌ |
| **Söhne** | Premium, iconic, "design-agency" feel | ⭐⭐⭐⭐ Excellent but subtle | Thin → Black (8) | **Paid** (Klim) | ❌ |

### Inter — proven but generic

**What's good:** Highest x-height of any UI font. Pixel-perfect hinting.
Reads effortlessly at 11px on a #080808 background. Used everywhere for a
reason — it disappears and lets content speak.

**What's not:** It's the default. Every SaaS landing page, every dashboard,
every "modern" app. It reads more "professional tool" than "elite operator."
No personality, no edge.

### Geist — built for this exact aesthetic ⭐

**What's good:** Designed by Vercel specifically for developer tools and
technical interfaces. Cleaner geometry than Inter, slightly improved spacing
at small sizes. Variable font. MIT license. Ships with `next/font` natively
(`import { Geist } from 'next/font/google'`).

**What's not:** Very "Vercel." If enry.agent wants to differentiate from the
Vercel ecosystem visually, Geist leans into it rather than away from it. Also,
Geist is newer — less battle-tested at massive scale than Inter.

**Vibe check:** Geist on a dark background with green accents reads like a
precision instrument. That's the target. It's the font Vercel uses to sell
"serious infrastructure" — matches enry.agent's "serious personal agent"
positioning exactly.

### Satoshi — fresh and sharp

**What's good:** Fontshare original with a slightly sharper, more modernist
edge than Inter. Feels like a tech brand's custom typeface without being one.
Free for commercial use. Full weight range.

**What's not:** Not on Google Fonts — must self-host or load from Fontshare
CDN. Less real-world data on dark UI readability. Narrower letterforms can
feel cramped in dense tool interfaces.

### General Sans — rational and dense

**What's good:** More geometric than Inter, more compact — fits more
information per line without feeling crowded. Excellent for data-heavy
layouts (which enry.agent's tool panels are). Fontshare, free for commercial.

**What's not:** The compact character set can feel too "corporate dashboard"
rather than "personal agent." Same hosting limitation as Satoshi.

### Söhne — beautiful but disqualified

Söhne is stunning — it's the font behind some of the best-designed products
in the world. But it's a paid commercial license from Klim Type Foundry.
Per-weight per-format pricing. Not viable for enry.agent's scope.

---

## Monospace Font Comparison

| Font | Character | Readability at 10–12px | Weights | Ligatures | License | Google Fonts? |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **JetBrains Mono** | Functional, modern, balanced | ⭐⭐⭐⭐⭐ Best at small sizes | Thin → Bold (8) | ✅ Extensive | SIL OFL | ✅ |
| **IBM Plex Mono** | Neutral, professional, humanistic | ⭐⭐⭐⭐ Good, slightly wide | Thin → Bold (8) | ✅ | SIL OFL | ✅ |
| **Geist Mono** | Minimalist, architectural, Swiss | ⭐⭐⭐⭐ Very good, slightly smaller x-height | Thin → Bold (5) | ✅ | SIL OFL | ✅ |
| **Berkeley Mono** | Premium, classic, "gold standard" | ⭐⭐⭐⭐⭐ Excellent balance | Regular → Bold (4) | ❌ | **Paid** | ❌ |
| **Space Mono** | Eccentric, display-forward | ⭐⭐ Not designed for code | Regular → Bold (4) | ❌ | SIL OFL | ✅ |

### JetBrains Mono — functional excellence

**What's good:** Designed specifically to reduce eye strain during long coding
sessions. Largest x-height in class. The most extensive programming ligature
set available (standard + powerline + Nerd Font variants). 8 weights with
true italics. Phenomenal at 10px — the size enry.agent uses for `text-[10px]`
mono labels everywhere.

**What's not:** It's *very* functional. No personality beyond "I am a coding
font." For an app that wants to feel like a precision instrument, JetBrains
Mono reads more like "this is practical" than "this is sharp."

### IBM Plex Mono — current, serviceable

**What's good:** Already in use. Humanistic touches (curved terminals on 'a',
'l', 't') soften the monospace grid. Reads naturally at small sizes. Full
weight range.

**What's not:** Slightly wider than other monos, which wastes horizontal space
in the chat sidebar and tool panels. The humanistic character works against
the "futuristic/serious" target — it feels warm where enry.agent wants to
feel precise.

### Geist Mono — architectural precision ⭐

**What's good:** Designed alongside Geist Sans with the same DNA. Reads like
a monospace font for designers, not just developers. Clean, minimalist
letterforms with an architectural quality — each character feels deliberately
constructed. OFL license. Pairs natively with Geist Sans.

**What's not:** Smaller x-height than JetBrains Mono. At 10px it can feel
slightly too delicate compared to JetBrains' robustness. 5 weights instead
of 8 — enough for most UI use cases but less flexibility.

### Berkeley Mono — beautiful but paid

Widely regarded as the gold standard — pixel-perfect balance of classic
terminal aesthetics and modern design. But it's a paid commercial license
(~$75 lifetime personal, ~$500 commercial). Disqualified for enry.agent.

### Space Mono — not for code

A display font that happens to be monospaced. Gorgeous for headings, terrible
for reading code at small sizes. No programming ligatures. Only 4 weights.
Wrong tool for this job.

---

## Primary Recommendation

### Geist Sans + Geist Mono

| Role | Font | Weight usage | Setup |
| :--- | :--- | :--- | :--- |
| **UI** (body, labels, inputs, buttons) | **Geist Sans** | 400 (body), 500 (labels), 600 (headings) | `next/font/google` |
| **Mono** (code, timestamps, data, tool output) | **Geist Mono** | 400 (body mono), 500 (emphasis) | `next/font/google` |

**Why this pairing wins:**

1. **Same design DNA.** Both fonts were built by the same team (Vercel
   Design) under the same design system. They don't just "pair well" — they
   were literally designed to coexist in a developer-facing product.

2. **Aesthetic match.** Geist *is* the Vercel/Raycast aesthetic. Clean lines,
   minimal noise, engineered precision. On enry.agent's #080808 background
   with #00ff66 green accents, it reads like a heads-up display — not a
   dashboard, not a form, but an instrument.

3. **Technical quality.** Geist Sans was built to beat Inter at small sizes
   on dark backgrounds. Geist Mono inherits the same care. Both are variable
   fonts — smaller bundle, instant weight switching, better performance.

4. **Licensing.** Geist Sans: MIT. Geist Mono: SIL OFL. Both free, both
   commercial-use-friendly, both on Google Fonts. Zero legal friction.

5. **Next.js native.** `import { Geist, Geist_Mono } from 'next/font/google'`
   — they ship with `next/font`, no npm package, no self-hosting, no CDN
   configuration. The same `font-display: swap` and subset optimization
   enry.agent already gets from Inter.

6. **Differentiator from "everything else."** Inter is the default of every
   SaaS. Geist is the font of Vercel — a company that sells developer
   infrastructure. enry.agent is infrastructure for one person. The visual
   language aligns.

**The "too Vercel" concern:** Geist *does* make enry.agent look like it's
part of the Vercel ecosystem. But enry.agent *is* part of the Vercel
ecosystem — it's a Next.js app deployed on Vercel. Leaning into that visual
language is honest, not appropriative. And the green accent palette (vs
Vercel's black/white) is distinctive enough to own.

---

## Backup Pairings

### Backup A: Inter + JetBrains Mono (safe, proven)

Keep Inter for UI, swap IBM Plex Mono → JetBrains Mono. The most readable
monospace font at small sizes paired with the most readable sans-serif.
Inter is already in the codebase — only the mono font changes.

**Trade-off:** Still reads "generic SaaS" on the sans side. JetBrains Mono
is extremely functional but zero personality. Safe but forgettable.

### Backup B: Satoshi + JetBrains Mono (fresher sans)

Swap Inter → Satoshi, swap IBM Plex Mono → JetBrains Mono. Satoshi gives
the sharper, more distinctive sans-serif edge without going full "Vercel."
JetBrains Mono provides the best small-size readability.

**Trade-off:** Satoshi must be self-hosted or loaded from Fontshare CDN —
not on Google Fonts, so no `next/font/google` convenience. More setup work.
Satoshi is less tested on dark UIs at small sizes than Inter or Geist.

### Backup C: Inter + Geist Mono (minimal change)

Keep Inter for UI, swap IBM Plex Mono → Geist Mono. Minimal code change
(one font swap). Geist Mono brings the architectural precision without
committing to the full Geist look.

**Trade-off:** Mixing two different design systems (Inter's neo-grotesque
with Geist Mono's Swiss minimalism). They won't clash but they won't sing
together the way Geist Sans + Geist Mono do. A safe half-step.

---

## Implementation Summary (for when this ships)

```ts
// src/app/layout.tsx — font declarations
import { Geist, Geist_Mono } from 'next/font/google'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})
```

```css
/* src/app/globals.css — updated theme */
@theme inline {
  --font-sans: var(--font-geist), 'Geist', system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), 'Geist Mono', monospace;
  /* --font-display can stay Space Grotesk for hero moments, or map to Geist */
}
```

The `--font-inter` and `--font-ibm-plex-mono` variables can be removed
along with their `next/font/google` imports. Space Grotesk can stay as
`--font-display` for occasional hero/heading use if desired — it doesn't
conflict with the Geist pairing and provides a third voice for rare
large-display moments.

---

## Sources

- [Vercel Font: Geist](https://vercel.com/font) — official typeface, MIT license
- [Google Fonts: Inter](https://fonts.google.com/specimen/Inter) — specimen, weights
- [Google Fonts: JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — ligature features
- [Fontshare: Satoshi](https://www.fontshare.com/fonts/satoshi) — specimen, weights, license
- [Fontshare: General Sans](https://www.fontshare.com/fonts/general-sans) — specimen, weights, license
- [Klim Type Foundry: Söhne](https://klim.co.nz/collections/soehne/) — commercial license
- [Berkeley Mono](https://berkeleygraphics.com/typefaces/berkeley-mono/) — commercial license
