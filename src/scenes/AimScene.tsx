import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { applyMouseDelta, isValidSens, lookToEuler, toRad, valorantVFov, type LookAngles } from '../lib/sens'

/** Eye height above the floor, in metres. */
const EYE_HEIGHT = 1.6
const ROOM_SIZE = 80
const ROOM_HEIGHT = 24
/** Grid cell size in metres. */
const CELL = 2
const MARKER_RADIUS = 20

export interface LookTracker {
  /** Current view angles (yaw wrapped, pitch clamped). */
  look: LookAngles
  /** Total mouse counts applied since mount, for verifying the formula. */
  totalCounts: { x: number; y: number }
}

interface AimSceneProps {
  sens: number
  /** Returns mouse counts since the last call; polled once per frame. */
  consume: () => { dx: number; dy: number }
  tracker: MutableRefObject<LookTracker>
  /** Element whose textContent receives the FPS reading (updated twice per second, no re-render). */
  fpsRef?: RefObject<HTMLElement>
  /** Shows the 30° reference posts (for verifying rotation; off during real drills). */
  showMarkers?: boolean
  children?: ReactNode
}

export function AimScene({ sens, consume, tracker, fpsRef, showMarkers = false, children }: AimSceneProps) {
  return (
    <Canvas
      camera={{ fov: valorantVFov(16 / 9), near: 0.05, far: 500, position: [0, 0, 0] }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0B0D10']} />
      <CameraRig sens={sens} consume={consume} tracker={tracker} />
      <FovSync />
      {fpsRef && <FpsMeter target={fpsRef} />}
      <Room />
      {showMarkers && <AngleMarkers />}
      {children}
    </Canvas>
  )
}

function CameraRig({ sens, consume, tracker }: Pick<AimSceneProps, 'sens' | 'consume' | 'tracker'>) {
  const camera = useThree((s) => s.camera)
  const sensRef = useRef(sens)
  sensRef.current = sens

  useEffect(() => {
    camera.rotation.order = 'YXZ'
  }, [camera])

  useFrame(() => {
    const { dx, dy } = consume()
    const t = tracker.current
    if ((dx !== 0 || dy !== 0) && isValidSens(sensRef.current)) {
      t.look = applyMouseDelta(t.look, dx, dy, sensRef.current)
      t.totalCounts.x += dx
      t.totalCounts.y += dy
    }
    const e = lookToEuler(t.look)
    camera.rotation.set(e.x, e.y, 0, 'YXZ')
  })
  return null
}

/** Keeps the vertical FOV matched to 103° horizontal for the current canvas aspect. */
function FovSync() {
  const camera = useThree((s) => s.camera)
  const { width, height } = useThree((s) => s.size)

  useEffect(() => {
    // Skip zero-size layouts (first paint, minimised window) — valorantVFov would throw.
    if (!(width > 0 && height > 0) || !(camera instanceof THREE.PerspectiveCamera)) return
    camera.aspect = width / height
    camera.fov = valorantVFov(camera.aspect)
    camera.updateProjectionMatrix()
  }, [camera, width, height])
  return null
}

function FpsMeter({ target }: { target: RefObject<HTMLElement> }) {
  const frames = useRef(0)
  const since = useRef(performance.now())
  useFrame(() => {
    frames.current++
    const now = performance.now()
    const elapsed = now - since.current
    if (elapsed >= 500) {
      const fps = Math.round((frames.current * 1000) / elapsed)
      if (target.current) target.current.textContent = String(fps)
      frames.current = 0
      since.current = now
    }
  })
  return null
}

function makeGridTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#12151A'
  ctx.fillRect(0, 0, size, size)
  // Minor lines sit at cell centres (1, 3, 5, 7 m into an 8 m tile) and major lines on the tile
  // edges. With the half-tile offset below, majors land at ±4 m and minors at ±1/±3 m around the
  // player: symmetric, and nothing at 0 to point at the crosshair.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    const p = ((i + 0.5) * size) / 4
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, size)
    ctx.moveTo(0, p)
    ctx.lineTo(size, p)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 4
  ctx.strokeRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

interface PlaneSpec {
  key: string
  w: number
  h: number
  position: [number, number, number]
  rotation: [number, number, number]
  shade: string
}

const HALF = ROOM_SIZE / 2
const FLOOR_Y = -EYE_HEIGHT
const WALL_Y = FLOOR_Y + ROOM_HEIGHT / 2

const PLANES: PlaneSpec[] = [
  { key: 'floor', w: ROOM_SIZE, h: ROOM_SIZE, position: [0, FLOOR_Y, 0], rotation: [-Math.PI / 2, 0, 0], shade: '#ffffff' },
  { key: 'ceil', w: ROOM_SIZE, h: ROOM_SIZE, position: [0, FLOOR_Y + ROOM_HEIGHT, 0], rotation: [Math.PI / 2, 0, 0], shade: '#9aa3b2' },
  { key: 'n', w: ROOM_SIZE, h: ROOM_HEIGHT, position: [0, WALL_Y, -HALF], rotation: [0, 0, 0], shade: '#d7dce4' },
  { key: 's', w: ROOM_SIZE, h: ROOM_HEIGHT, position: [0, WALL_Y, HALF], rotation: [0, Math.PI, 0], shade: '#d7dce4' },
  { key: 'e', w: ROOM_SIZE, h: ROOM_HEIGHT, position: [HALF, WALL_Y, 0], rotation: [0, -Math.PI / 2, 0], shade: '#c3c9d3' },
  { key: 'w', w: ROOM_SIZE, h: ROOM_HEIGHT, position: [-HALF, WALL_Y, 0], rotation: [0, Math.PI / 2, 0], shade: '#c3c9d3' },
]

/** Box room with a grid on every surface so rotation is easy to perceive. */
function Room() {
  const textures = useMemo(() => {
    const base = makeGridTexture()
    const list = PLANES.map((p) => {
      const t = base.clone()
      t.needsUpdate = true
      t.repeat.set(p.w / (CELL * 4), p.h / (CELL * 4))
      // Half-tile shift: tile edges (major lines) move from 0 to ±4 m. See makeGridTexture.
      t.offset.set(0.5, 0.5)
      return t
    })
    base.dispose()
    return list
  }, [])

  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures])

  return (
    <group>
      {PLANES.map((p, i) => (
        <mesh key={p.key} position={p.position} rotation={p.rotation}>
          <planeGeometry args={[p.w, p.h]} />
          <meshBasicMaterial map={textures[i]} color={p.shade} />
        </mesh>
      ))}
    </group>
  )
}

const MARKERS = Array.from({ length: 12 }, (_, i) => {
  const yaw = i * 30
  const color = yaw === 0 ? '#FF4655' : yaw === 90 || yaw === 270 ? '#3DDC97' : '#8A93A3'
  return { yaw, color, height: yaw % 90 === 0 ? 2.4 : 1.2 }
})

/**
 * Posts every 30° around the player at eye level. 0° (straight ahead at start) is accent red,
 * ±90° are mint — handy for checking that a full cm/360 swipe lands back on red.
 */
function AngleMarkers() {
  return (
    <group>
      {MARKERS.map(({ yaw, color, height }) => {
        const a = toRad(yaw)
        // Yaw is positive to the right; three.js forward is -Z.
        const x = Math.sin(a) * MARKER_RADIUS
        const z = -Math.cos(a) * MARKER_RADIUS
        return (
          <mesh key={yaw} position={[x, 0, z]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.12, height, 0.12]} />
            <meshBasicMaterial color={color} />
          </mesh>
        )
      })}
    </group>
  )
}
