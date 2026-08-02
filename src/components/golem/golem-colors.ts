'use client'

import { useEffect, useState } from 'react'

// Theme colours for the 3D Golem.
//
// CSS custom properties can't drive a WebGL material, so they have to be read
// out into JS. Reading them is less direct than it looks: the --golem-* tokens
// are `color-mix(...)` expressions, and getPropertyValue on an unregistered
// custom property hands back the *specified* text ("color-mix(in srgb, …)"),
// not a resolved colour — THREE.Color can't parse that.
//
// So resolve them through a throwaway probe: set `color: var(--token)` on it
// and read back computed `color`, which the browser always resolves to a real
// colour. The probe inherits from the host element, so .golem-figure-scoped
// tokens (--golem-accent, --golem-eye, and the per-model tint) resolve
// correctly.
//
// What the resolved value is *not* is `rgb()` — see toThreeColorStyle below.

export interface GolemColors {
  body: string
  bodyLight: string
  bodyShade: string
  eye: string
  accent: string
  glow: string
}

const FALLBACK: GolemColors = {
  body: '#8b8178',
  bodyLight: '#a89c91',
  bodyShade: '#6b625b',
  eye: '#2b2724',
  accent: '#c8a06a',
  glow: '#c8a06a',
}

const TOKENS: Record<keyof GolemColors, string> = {
  body: '--golem-body',
  bodyLight: '--golem-body-light',
  bodyShade: '--golem-body-shade',
  eye: '--golem-eye',
  accent: '--golem-accent',
  glow: '--golem-glow',
}

/**
 * Normalise a computed CSS colour into something THREE.Color can actually
 * parse.
 *
 * The catch that made the first version of this file a no-op: a computed
 * `color` that originated from `color-mix()` does not serialise as `rgb()`.
 * Chromium hands back the CSS Color 4 form —
 *
 *   color(srgb 0.474675 0.415059 0.329882)
 *
 * — for every one of these tokens. THREE.Color has no parser for that
 * function ("Unknown color model"), and it fails *soft*: it warns and leaves
 * the colour at white. So the string has to be converted here, numerically,
 * before three ever sees it.
 *
 * Returns null for anything unrecognised so the caller can fall back loudly.
 */
function toThreeColorStyle(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  // Legacy serialisations three already understands, passed through untouched.
  if (v.startsWith('#') || v.startsWith('rgb')) return v

  const srgb = /^color\(\s*srgb\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)/.exec(v)
  if (!srgb) return null

  // Components are 0–1 floats and may fall outside the gamut; clamp before
  // quantising. Alpha (after the `/`) is deliberately dropped — these feed
  // material colours, where opacity is a separate channel.
  const hex = [1, 2, 3]
    .map((i) => {
      const f = Number(srgb[i])
      if (!Number.isFinite(f)) return null
      return Math.round(Math.min(1, Math.max(0, f)) * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')

  return hex.length === 6 ? `#${hex}` : null
}

export function readGolemColors(host: HTMLElement | null): GolemColors {
  if (typeof window === 'undefined' || !host) return FALLBACK

  const probe = document.createElement('span')
  // Out of flow and invisible, but still inheriting from `host` so scoped
  // custom properties resolve against the right element.
  probe.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'
  host.appendChild(probe)

  const out = { ...FALLBACK }
  const missed: string[] = []
  try {
    for (const key of Object.keys(TOKENS) as (keyof GolemColors)[]) {
      probe.style.color = ''
      probe.style.color = `var(${TOKENS[key]})`
      const parsed = toThreeColorStyle(getComputedStyle(probe).color)
      if (parsed) out[key] = parsed
      else missed.push(TOKENS[key])
    }
  } catch {
    /* fall through to defaults */
  } finally {
    probe.remove()
  }

  // Falling back silently is how this broke the first time: Golem rendered a
  // hardcoded grey in every theme and looked merely "wrong", not "broken".
  if (missed.length && process.env.NODE_ENV !== 'production') {
    console.warn(`[golem-colors] unresolved, using fallback: ${missed.join(', ')}`)
  }

  return out
}

/**
 * Golem's palette, re-read whenever the theme changes.
 *
 * Watches `data-theme` on <html> (what the theme toggle writes) plus the OS
 * colour-scheme query, so all three themes repaint the 3D material without a
 * remount.
 */
export function useGolemColors(host: React.RefObject<HTMLElement | null>): GolemColors {
  const [colors, setColors] = useState<GolemColors>(FALLBACK)

  useEffect(() => {
    let frame = 0
    const sync = () => {
      // One frame late: the attribute flips before the cascade recomputes, so
      // reading synchronously can catch the outgoing theme's colours.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setColors(readGolemColors(host.current)))
    }
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })

    // The per-model tint is an inline style on the .golem-figure ancestor, not
    // on <html>, so the theme observer alone never sees it: switching models
    // repainted the CSS but left the 3D material on the previous model's
    // accent until something else forced a re-read.
    const figure = host.current?.closest('.golem-figure')
    const tintObserver = figure ? new MutationObserver(sync) : null
    if (figure) tintObserver?.observe(figure, { attributes: true, attributeFilter: ['style'] })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', sync)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      tintObserver?.disconnect()
      media.removeEventListener('change', sync)
    }
  }, [host])

  return colors
}
