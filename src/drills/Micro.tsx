import { useMemo } from 'react'
import { generateMicroOffsets, MICRO } from '../lib/targets'
import { ClickDrill, type ClickDrillResult } from './ClickDrill'
import type { DrillProps } from './common'

/** Micro-adjust: small target 2°–8° from the crosshair; measures accuracy, time and corrections. */
export function Micro(props: DrillProps & { onComplete: (r: ClickDrillResult) => void }) {
  // Different stream from Flick so the two drills don't share a pattern.
  const offsets = useMemo(() => generateMicroOffsets(props.seed ^ 0x5bd1e995), [props.seed])
  return <ClickDrill {...props} kind="micro" cfg={MICRO} offsets={offsets} />
}
