import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import {
  evaluateClickTrial,
  summarizeClickTrials,
  type ClickSummary,
  type ClickTrial,
  type ClickTrialResult,
  type Sample,
} from '../lib/metrics'
import type { LookAngles } from '../lib/sens'
import { placeTarget, TARGET_DISTANCE, type ClickDrillConfig, type Offset } from '../lib/targets'
import { MAX_FRAME_S, positionFor, type DrillProps } from './common'

export interface ClickDrillResult {
  kind: 'flick' | 'micro'
  summary: ClickSummary
  trials: ClickTrialResult[]
}

interface ClickDrillProps extends DrillProps {
  kind: 'flick' | 'micro'
  cfg: ClickDrillConfig
  offsets: Offset[]
  onComplete: (result: ClickDrillResult) => void
}

/**
 * One target at a time, placed relative to where the crosshair is when it appears. Left click
 * shoots; a target not clicked within cfg.timeoutS is a miss. Every frame records the aim so
 * overshoot/undershoot and corrections can be measured.
 */
export function ClickDrill({ kind, cfg, offsets, tracker, flush, active, onShot, onComplete, debugRef }: ClickDrillProps) {
  const [target, setTarget] = useState<LookAngles | null>(null)
  const st = useRef({
    index: 0,
    clock: 0,
    lastFrameWall: 0,
    trial: null as ClickTrial | null,
    results: [] as ClickTrialResult[],
    done: false,
  })
  const activeRef = useRef(active)
  activeRef.current = active
  const cb = useRef({ onShot, onComplete })
  cb.current = { onShot, onComplete }

  const publish = () => {
    if (!debugRef) return
    const s = st.current
    debugRef.current = { kind, index: s.index, total: offsets.length, target: s.trial?.target ?? null, clock: s.clock, done: s.done }
  }

  const spawn = () => {
    const s = st.current
    const look = { ...tracker.current.look }
    const t = placeTarget(look, offsets[s.index])
    s.trial = { start: look, target: t, radiusDeg: cfg.radiusDeg, spawnT: s.clock, samples: [{ t: s.clock, look }], click: null }
    setTarget(t)
  }

  const finish = (click: Sample | null): ClickTrialResult | null => {
    const s = st.current
    if (!s.trial) return null
    s.trial.click = click
    const r = evaluateClickTrial(s.trial)
    s.results.push(r)
    s.trial = null
    s.index++
    if (s.index >= offsets.length) {
      s.done = true
      setTarget(null)
      publish()
      cb.current.onComplete({ kind, summary: summarizeClickTrials(s.results, cfg.radiusDeg), trials: s.results })
    } else {
      spawn()
    }
    return r
  }

  useFrame((_, delta) => {
    const s = st.current
    if (!activeRef.current || s.done) return
    s.clock += Math.min(delta, MAX_FRAME_S)
    s.lastFrameWall = performance.now()
    if (!s.trial) spawn()
    else {
      s.trial.samples.push({ t: s.clock, look: { ...tracker.current.look } })
      if (s.clock - s.trial.spawnT >= cfg.timeoutS) {
        finish(null)
        cb.current.onShot?.(false)
      }
    }
    publish()
  })

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const s = st.current
      if (e.button !== 0 || !activeRef.current || s.done || !s.trial) return
      flush()
      const sinceFrame = Math.min(MAX_FRAME_S, Math.max(0, (performance.now() - s.lastFrameWall) / 1000))
      const sample: Sample = { t: s.clock + sinceFrame, look: { ...tracker.current.look } }
      s.trial.samples.push(sample)
      const r = finish(sample)
      publish()
      cb.current.onShot?.(r?.hit ?? false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [flush, tracker])

  if (!target) return null
  const radius = TARGET_DISTANCE * Math.tan((cfg.radiusDeg * Math.PI) / 180)
  return (
    <mesh position={positionFor(target, TARGET_DISTANCE)}>
      <sphereGeometry args={[radius, 24, 16]} />
      <meshBasicMaterial color="#FF4655" />
    </mesh>
  )
}
