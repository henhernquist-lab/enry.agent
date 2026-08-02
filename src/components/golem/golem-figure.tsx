import { golemTintForModel, type GolemState } from '@/lib/golem-mascot'
import { GolemArt, type GolemDeformRef } from './golem-art'

interface GolemFigureProps {
  state: GolemState
  /** Usage past its warning threshold — heavy, slow, tilted. */
  droop?: boolean
  /** Active model id; tints the accents by the model's house. */
  modelId?: string | null
  /** Per-frame bounce/bob/facing from the motion engine (mascot only). */
  deformRef?: GolemDeformRef
  className?: string
}

/**
 * Golem's presentational shell — the one place that owns the layer split.
 *
 * Two nested elements on purpose: the outer carries the tint variables and the
 * droop tilt, the inner carries the per-state keyframes. The floating mascot
 * writes its own transform on ancestors of both, so nothing here ever competes
 * with the rAF for the same `transform` property.
 */
export function GolemFigure({ state, droop = false, modelId, deformRef, className = '' }: GolemFigureProps) {
  const tint = golemTintForModel(modelId ?? null)

  return (
    <div
      className={`golem-figure ${droop ? 'golem-droop' : ''} ${className}`}
      style={tint ? ({ '--golem-model-tint': tint } as React.CSSProperties) : undefined}
    >
      <div className={`h-full w-full golem-state-${state}`}>
        <GolemArt state={state} deformRef={deformRef} />
      </div>
    </div>
  )
}
