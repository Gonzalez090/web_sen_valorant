import { useMemo } from 'react'
import { FLICK, generateFlickOffsets } from '../lib/targets'
import { ClickDrill, type ClickDrillResult } from './ClickDrill'
import type { DrillProps } from './common'

/** Flick: head target 15°–90° away; measures time, hits, and overshoot/undershoot. */
export function Flick(props: DrillProps & { onComplete: (r: ClickDrillResult) => void }) {
  const offsets = useMemo(() => generateFlickOffsets(props.seed), [props.seed])
  return <ClickDrill {...props} kind="flick" cfg={FLICK} offsets={offsets} />
}
