import { applyMouseDelta, isValidSens, normalizeAngle, toDeg, toRad, type LookAngles } from './sens'

export interface LookTracker {
  /** Current view angles (yaw wrapped, pitch clamped). */
  look: LookAngles
  /** Total mouse counts applied since creation, for verifying the formula. */
  totalCounts: { x: number; y: number }
}

export const newTracker = (): LookTracker => ({ look: { yaw: 0, pitch: 0 }, totalCounts: { x: 0, y: 0 } })

/** Applies pending mouse counts to the tracker in place. No-op for zero/non-finite movement or invalid sens. */
export function applyInput(t: LookTracker, dx: number, dy: number, sens: number): void {
  if ((dx === 0 && dy === 0) || !isValidSens(sens)) return
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
  t.look = applyMouseDelta(t.look, dx, dy, sens)
  t.totalCounts.x += dx
  t.totalCounts.y += dy
}

/** Unit direction vector in three.js space (forward = -Z, yaw right = +X, pitch up = +Y). */
export function lookToDirection(look: LookAngles): [number, number, number] {
  const y = toRad(look.yaw)
  const p = toRad(look.pitch)
  return [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)]
}

/** Great-circle angle between two view directions, in degrees. */
export function angularDistance(a: LookAngles, b: LookAngles): number {
  const [ax, ay, az] = lookToDirection(a)
  const [bx, by, bz] = lookToDirection(b)
  const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))
  return toDeg(Math.acos(dot))
}

/** Planar yaw/pitch offset from one look to another; yaw takes the short way round. */
export function offsetBetween(from: LookAngles, to: LookAngles): { dYaw: number; dPitch: number } {
  return { dYaw: normalizeAngle(to.yaw - from.yaw), dPitch: to.pitch - from.pitch }
}
