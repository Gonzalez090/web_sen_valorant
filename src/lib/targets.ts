import { mulberry32, randRange, randSign } from './rng'
import { normalizeAngle, toDeg, type LookAngles } from './sens'

/** Distance from the player to targets, in metres (only matters for drawing; logic is angular). */
export const TARGET_DISTANCE = 12
/** Targets never spawn above/below this absolute pitch. */
export const TARGET_PITCH_LIMIT = 35

export interface ClickDrillConfig {
  count: number
  minDeg: number
  maxDeg: number
  /** Angular radius of the target, in degrees. */
  radiusDeg: number
  /** Seconds before an unclicked target counts as a miss. */
  timeoutS: number
}

/** Flick: head-sized target 15°–90° away, mostly horizontal with some vertical. */
export const FLICK: ClickDrillConfig = { count: 6, minDeg: 15, maxDeg: 90, radiusDeg: 1.2, timeoutS: 3 }
/** Micro-adjust: small target 2°–8° from the crosshair, any direction. */
export const MICRO: ClickDrillConfig = { count: 5, minDeg: 2, maxDeg: 8, radiusDeg: 0.5, timeoutS: 2.5 }

/** Largest vertical component of a flick offset, in degrees. */
const FLICK_MAX_VERTICAL = 20
/** Share of flicks that get a large vertical component; the rest are near-horizontal. */
const FLICK_VERTICAL_SHARE = 0.35

export interface Offset {
  dYaw: number
  dPitch: number
}

/** Flick offsets: planar distance in [minDeg, maxDeg], horizontal with occasional vertical. */
export function generateFlickOffsets(seed: number, cfg: ClickDrillConfig = FLICK): Offset[] {
  const rng = mulberry32(seed)
  return Array.from({ length: cfg.count }, () => {
    const d = randRange(rng, cfg.minDeg, cfg.maxDeg)
    const vMax = Math.min(FLICK_MAX_VERTICAL, d) * (rng() < FLICK_VERTICAL_SHARE ? 1 : 0.15)
    const dPitch = randRange(rng, -vMax, vMax)
    const dYaw = randSign(rng) * Math.sqrt(d * d - dPitch * dPitch)
    return { dYaw, dPitch }
  })
}

/** Micro offsets: planar distance in [minDeg, maxDeg], uniform direction. */
export function generateMicroOffsets(seed: number, cfg: ClickDrillConfig = MICRO): Offset[] {
  const rng = mulberry32(seed)
  return Array.from({ length: cfg.count }, () => {
    const d = randRange(rng, cfg.minDeg, cfg.maxDeg)
    const a = randRange(rng, 0, 2 * Math.PI)
    return { dYaw: d * Math.cos(a), dPitch: d * Math.sin(a) }
  })
}

/**
 * Target position for an offset from the current look. If the vertical part would leave
 * ±TARGET_PITCH_LIMIT it is mirrored instead of clamped, so the distance is unchanged.
 */
export function placeTarget(look: LookAngles, offset: Offset): LookAngles {
  let pitch = look.pitch + offset.dPitch
  if (Math.abs(pitch) > TARGET_PITCH_LIMIT) pitch = look.pitch - offset.dPitch
  pitch = Math.max(-TARGET_PITCH_LIMIT, Math.min(TARGET_PITCH_LIMIT, pitch))
  return { yaw: normalizeAngle(look.yaw + offset.dYaw), pitch }
}

// --- Tracking ---------------------------------------------------------------------------------

/** Agent run speed in m/s, used as the strafe speed. */
export const AGENT_SPEED = 6.75

export const TRACKING = {
  durationS: 6,
  /** Angular strafe speed at TARGET_DISTANCE (≈29.4°/s). */
  speedDegPerS: toDeg(Math.atan(AGENT_SPEED / TARGET_DISTANCE)),
  /** Target stays within ±rangeDeg of the starting yaw, bouncing at the edges. */
  rangeDeg: 25,
  minSegS: 0.25,
  maxSegS: 1.0,
  /** Chance a segment is a short stop (counter-strafe) instead of a move. */
  stopChance: 0.15,
  /** Body box half-size in degrees (≈0.6 m × 1.5 m at 12 m). */
  halfWidthDeg: toDeg(Math.atan(0.3 / TARGET_DISTANCE)),
  halfHeightDeg: toDeg(Math.atan(0.75 / TARGET_DISTANCE)),
} as const

export interface StrafeSegment {
  /** Start time in seconds. */
  t0: number
  dir: -1 | 0 | 1
  /** Unfolded position at t0 (before bouncing at the range edges). */
  x0: number
}

/** Random strafe path: segments of 0.25–1 s that reverse direction or briefly stop. */
export function generateStrafePath(seed: number, durationS: number = TRACKING.durationS): StrafeSegment[] {
  const rng = mulberry32(seed)
  const v = TRACKING.speedDegPerS
  const path: StrafeSegment[] = []
  let t = 0
  let x = 0
  let prevDir: -1 | 0 | 1 = 0
  while (t < durationS) {
    let dir: -1 | 0 | 1
    if (prevDir === 0) dir = randSign(rng)
    else if (rng() < TRACKING.stopChance) dir = 0
    else dir = prevDir === 1 ? -1 : 1
    const len = randRange(rng, TRACKING.minSegS, TRACKING.maxSegS)
    path.push({ t0: t, dir, x0: x })
    x += dir * v * len
    t += len
    prevDir = dir
  }
  return path
}

/**
 * Where the strafing body starts: exactly on the crosshair (pitch clamped to the target limit), so
 * sens A and B begin tracking from the same place regardless of where the previous drill ended.
 */
export function trackingStart(look: LookAngles): LookAngles {
  return { yaw: look.yaw, pitch: Math.max(-TARGET_PITCH_LIMIT, Math.min(TARGET_PITCH_LIMIT, look.pitch)) }
}

/** Folds an unfolded coordinate into [-r, r], bouncing at the edges (triangle wave). */
export function bounce(x: number, r: number): number {
  const period = 4 * r
  const u = (((x + r) % period) + period) % period
  return (u <= 2 * r ? u : period - u) - r
}

/** Target yaw offset (degrees from the starting yaw) at time t. */
export function strafeOffsetAt(path: StrafeSegment[], t: number): number {
  if (path.length === 0) return 0
  let seg = path[0]
  for (const s of path) {
    if (s.t0 > t) break
    seg = s
  }
  const x = seg.x0 + seg.dir * TRACKING.speedDegPerS * Math.max(0, t - seg.t0)
  return bounce(x, TRACKING.rangeDeg)
}
