import type { GolemState } from '@/lib/golem-mascot'

// The character itself — inline SVG so every swatch can come from a theme
// token. Not one literal color lives in here: `--golem-*` is derived from the
// palette in globals.css, so a new theme repaints Golem for free.
//
// State changes the drawing only where it has to (eyes, cracks, glow). Motion
// that belongs to a state — the success hop, the error shudder, the thinking
// rune pulse — rides on `.golem-state-*` classes in globals.css so it costs no
// JS and no React renders.

function Eyes({ state }: { state: GolemState }) {
  if (state === 'dozing') {
    return (
      <g
        stroke="var(--golem-eye)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      >
        <path d="M21.6 28.4q2.9 2.4 5.8 0" />
        <path d="M36.6 28.4q2.9 2.4 5.8 0" />
      </g>
    )
  }

  const alert = state === 'thinking'
  const radius = alert ? 3.8 : state === 'error' ? 2.9 : 3.4
  const glowOpacity = state === 'error' ? 0.12 : alert ? 0.5 : 0.35

  return (
    <>
      <circle cx="24.5" cy="28" r={alert ? 6.8 : 6} fill="var(--golem-glow)" opacity={glowOpacity} />
      <circle cx="39.5" cy="28" r={alert ? 6.8 : 6} fill="var(--golem-glow)" opacity={glowOpacity} />
      <circle cx="24.5" cy="28" r={radius} fill="var(--golem-eye)" opacity={state === 'error' ? 0.55 : 1} />
      <circle cx="39.5" cy="28" r={radius} fill="var(--golem-eye)" opacity={state === 'error' ? 0.55 : 1} />
    </>
  )
}

export function GolemArt({ state = 'idle' }: { state?: GolemState }) {
  return (
    <svg
      viewBox="0 0 64 72"
      data-golem-state={state}
      className="h-full w-full overflow-visible"
      role="presentation"
    >
      <ellipse cx="32" cy="68" rx="15" ry="3.2" fill="var(--golem-shadow)" />

      {/* Stubby limbs sit behind the body so the joins tuck under the clay */}
      <rect
        x="5.5"
        y="34"
        width="9"
        height="16"
        rx="4.5"
        fill="var(--golem-body-shade)"
        stroke="var(--golem-outline)"
        strokeWidth="1.2"
        transform="rotate(-10 10 42)"
      />
      <rect
        x="49.5"
        y="34"
        width="9"
        height="16"
        rx="4.5"
        fill="var(--golem-body-shade)"
        stroke="var(--golem-outline)"
        strokeWidth="1.2"
        transform="rotate(10 54 42)"
      />
      <rect
        x="16"
        y="57"
        width="14"
        height="9"
        rx="4.5"
        fill="var(--golem-body-shade)"
        stroke="var(--golem-outline)"
        strokeWidth="1.2"
      />
      <rect
        x="34"
        y="57"
        width="14"
        height="9"
        rx="4.5"
        fill="var(--golem-body-shade)"
        stroke="var(--golem-outline)"
        strokeWidth="1.2"
      />

      <path
        d="M13 27C13 15.5 21 9 32 9s19 6.5 19 18v18c0 9.4-7.4 14-19 14s-19-4.6-19-14V27Z"
        fill="var(--golem-body)"
        stroke="var(--golem-outline)"
        strokeWidth="1.4"
      />

      <path
        d="M19.5 24c1.4-6.6 6.4-10.6 12.5-11"
        fill="none"
        stroke="var(--golem-body-light)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      />

      <g
        stroke="var(--golem-crack)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M17.8 42.5l2.8 3.4-1.4 3" opacity="0.75" />
        <path d="M44.5 32l-2.4 3.2 1.6 2.6" opacity="0.6" />
        {/* Error splits the clay properly — a fracture across the whole body */}
        {state === 'error' && (
          <path
            className="golem-fracture"
            d="M32 10.5l-4.5 9 6 4-3.5 7.5 4 5-2.5 6"
            strokeWidth="1.6"
            opacity="0.9"
          />
        )}
      </g>

      <g className="golem-rune-mark">
        <circle cx="32" cy="46" r="5.4" fill="none" stroke="var(--golem-rune)" strokeWidth="1.2" />
        <path
          d="M32 42.4v7.2M29.2 45.4l2.8 2.6 2.8-2.6"
          fill="none"
          stroke="var(--golem-rune)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <Eyes state={state} />
    </svg>
  )
}
