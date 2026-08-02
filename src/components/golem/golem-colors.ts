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
// and read back computed `color`, which the browser always resolves to rgb().
// The probe inherits from the host element, so .golem-figure-scoped tokens
// (--golem-accent, --golem-eye, and the per-model tint) resolve correctly.

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

export function readGolemColors(host: HTMLElement | null): GolemColors {
  if (typeof window === 'undefined' || !host) return FALLBACK

  const probe = document.createElement('span')
  // Out of flow and invisible, but still inheriting from `host` so scoped
  // custom properties resolve against the right element.
  probe.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'
  host.appendChild(probe)

  const out = { ...FALLBACK }
  try {
    for (const key of Object.keys(TOKENS) as (keyof GolemColors)[]) {
      probe.style.color = ''
      probe.style.color = `var(${TOKENS[key]})`
      const resolved = getComputedStyle(probe).color
      // An unresolvable var leaves `color` at its inherited value; anything
      // that parses to rgb()/rgba() is a real answer.
      if (resolved && resolved.startsWith('rgb')) out[key] = resolved
    }
  } catch {
    /* fall through to defaults */
  } finally {
    probe.remove()
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

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', sync)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      media.removeEventListener('change', sync)
    }
  }, [host])

  return colors
}
