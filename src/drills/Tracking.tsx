import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { summarizeTracking, type TrackingSample, type TrackingSummary } from '../lib/metrics'
import { normalizeAngle, toRad, type LookAngles } from '../lib/sens'
import { generateStrafePath, strafeOffsetAt, TARGET_DISTANCE, trackingStart, TRACKING } from '../lib/targets'
import { MAX_FRAME_S, positionFor, type DrillProps } from './common'

export interface TrackingResult {
  kind: 'tracking'
  summary: TrackingSummary
}

/** Body box size in metres, derived from its angular size at TARGET_DISTANCE. */
const BODY_W = 2 * TARGET_DISTANCE * Math.tan(toRad(TRACKING.halfWidthDeg))
const BODY_H = 2 * TARGET_DISTANCE * Math.tan(toRad(TRACKING.halfHeightDeg))

/**
 * Tracking: a body strafes left/right at agent speed with random direction changes for
 * TRACKING.durationS. Measures time on target and mean distance from the body centre.
 */
export function Tracking({ seed, tracker, active, onComplete, debugRef }: DrillProps & { onComplete: (r: TrackingResult) => void }) {
  // Different stream from the click drills.
  const path = useMemo(() => generateStrafePath(seed ^ 0x27d4eb2f), [seed])
  const mesh = useRef<THREE.Mesh>(null)
  const st = useRef({ clock: 0, center: null as LookAngles | null, samples: [] as TrackingSample[], done: false })
  const cb = useRef(onComplete)
  cb.current = onComplete

  useFrame((_, delta) => {
    const s = st.current
    if (s.done) return
    const look = tracker.current.look
    const started = s.center !== null
    if (!started) {
      // Until the drill starts, park the body in front of the crosshair.
      placeMesh(mesh.current, trackingStart(look))
      if (!active) return
      s.center = trackingStart(look)
    }
    if (!active) return

    const dt = started ? Math.min(delta, MAX_FRAME_S) : 0
    s.clock += dt
    const target = { yaw: normalizeAngle(s.center!.yaw + strafeOffsetAt(path, s.clock)), pitch: s.center!.pitch }
    placeMesh(mesh.current, target)
    if (dt > 0) s.samples.push({ t: s.clock, dt, look: { ...look }, target })

    if (debugRef) debugRef.current = { kind: 'tracking', index: 0, total: 1, target, clock: s.clock, done: false }

    if (s.clock >= TRACKING.durationS) {
      s.done = true
      if (debugRef) debugRef.current = { kind: 'tracking', index: 1, total: 1, target: null, clock: s.clock, done: true }
      if (mesh.current) mesh.current.visible = false
      cb.current({ kind: 'tracking', summary: summarizeTracking(s.samples, TRACKING.halfWidthDeg, TRACKING.halfHeightDeg) })
    }
  })

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[BODY_W, BODY_H, BODY_W]} />
      <meshBasicMaterial color="#FF4655" />
    </mesh>
  )
}

function placeMesh(m: THREE.Mesh | null, look: LookAngles) {
  if (!m) return
  m.position.set(...positionFor(look, TARGET_DISTANCE))
  m.rotation.set(0, -toRad(look.yaw), 0)
}
