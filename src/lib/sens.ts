/** Valorant mouse/camera constants and conversions. Angles are in degrees unless noted. */

/** Degrees of rotation per mouse count at sensitivity 1.0 (same for yaw and pitch). */
export const VALORANT_YAW = 0.07
/** Valorant's fixed horizontal FOV. */
export const VALORANT_HFOV = 103
/** Pitch is clamped to ±this value so the camera never flips. */
export const PITCH_LIMIT = 89
/** Default starting eDPI when the user doesn't provide a current sensitivity. */
export const DEFAULT_EDPI = 280

export const DPI_MIN = 100
export const DPI_MAX = 32000
/** Smallest sensitivity Valorant can represent at 3 decimal places. */
export const SENS_MIN = 0.001

const CM_PER_INCH = 2.54

export function degreesPerCount(sens: number): number {
  return sens * VALORANT_YAW
}

/** `deg = counts * sens * 0.07` */
export function countsToDegrees(counts: number, sens: number): number {
  return counts * sens * VALORANT_YAW
}

function assertPositive(name: string, value: number): void {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new RangeError(`${name} must be a positive finite number, got ${value}`)
  }
}

/** Sensitivity must be a positive finite number. */
export function isValidSens(sens: number): boolean {
  return Number.isFinite(sens) && sens > 0
}

/**
 * cm of mouse travel for a full 360° turn: `(360 / (sens * 0.07)) / dpi * 2.54`
 * @throws RangeError if sens or dpi is not a positive finite number
 */
export function cmPer360(sens: number, dpi: number): number {
  assertPositive('sens', sens)
  assertPositive('dpi', dpi)
  return (360 / (sens * VALORANT_YAW) / dpi) * CM_PER_INCH
}

/**
 * Inverse of cmPer360.
 * @throws RangeError if cm or dpi is not a positive finite number
 */
export function sensFromCmPer360(cm: number, dpi: number): number {
  assertPositive('cm', cm)
  assertPositive('dpi', dpi)
  return (360 * CM_PER_INCH) / (cm * dpi * VALORANT_YAW)
}

/** @throws RangeError if dpi or sens is not a positive finite number */
export function edpi(dpi: number, sens: number): number {
  assertPositive('dpi', dpi)
  assertPositive('sens', sens)
  return dpi * sens
}

/**
 * Starting sensitivity for a DPI, from DEFAULT_EDPI.
 * @throws RangeError if dpi is not a positive finite number
 */
export function defaultSens(dpi: number): number {
  assertPositive('dpi', dpi)
  return DEFAULT_EDPI / dpi
}

/**
 * Valorant accepts sensitivity with 3 decimal places. Never returns less than SENS_MIN,
 * so a valid sensitivity can't round down to an unusable 0.
 * @throws RangeError if sens is not a positive finite number
 */
export function roundSens(sens: number): number {
  assertPositive('sens', sens)
  return Math.max(SENS_MIN, Math.round(sens * 1000) / 1000)
}

/** DPI must be a whole number in DPI_MIN–DPI_MAX. */
export function isValidDpi(dpi: number): boolean {
  return Number.isInteger(dpi) && dpi >= DPI_MIN && dpi <= DPI_MAX
}

/**
 * Converts horizontal FOV to vertical FOV for a given aspect ratio (width / height).
 * @throws RangeError if hFovDeg is outside (0, 180) or aspect is not a positive finite number
 *   (e.g. a 0-height canvas during first layout — callers should skip until size is known)
 */
export function hFovToVFov(hFovDeg: number, aspect: number): number {
  if (!(Number.isFinite(hFovDeg) && hFovDeg > 0 && hFovDeg < 180)) {
    throw new RangeError(`hFovDeg must be in (0, 180), got ${hFovDeg}`)
  }
  assertPositive('aspect', aspect)
  const h = toRad(hFovDeg)
  return toDeg(2 * Math.atan(Math.tan(h / 2) / aspect))
}

/** Vertical FOV for three.js PerspectiveCamera at Valorant's 103° horizontal FOV. */
export function valorantVFov(aspect: number): number {
  return hFovToVFov(VALORANT_HFOV, aspect)
}

export function clampPitch(pitch: number): number {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch))
}

/** Wraps an angle to [-180, 180). */
export function normalizeAngle(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

export interface LookAngles {
  /** Positive = turned right. */
  yaw: number
  /** Positive = looking up. */
  pitch: number
}

/**
 * Applies raw mouse movement to view angles.
 * movementX > 0 (mouse right) turns right; movementY > 0 (mouse toward you) looks down.
 * Yaw is wrapped to [-180, 180), pitch clamped to ±PITCH_LIMIT.
 * Non-finite movement or invalid sens is ignored (returns `look` unchanged) so a bad
 * event can never corrupt the camera angles.
 */
export function applyMouseDelta(
  look: LookAngles,
  movementX: number,
  movementY: number,
  sens: number,
): LookAngles {
  if (!Number.isFinite(movementX) || !Number.isFinite(movementY) || !isValidSens(sens)) {
    return look
  }
  return {
    yaw: normalizeAngle(look.yaw + countsToDegrees(movementX, sens)),
    pitch: clampPitch(look.pitch - countsToDegrees(movementY, sens)),
  }
}

/**
 * Converts look angles to a three.js Euler (radians, order 'YXZ').
 * three.js turns left for positive Y rotation, so yaw is negated.
 */
export function lookToEuler(look: LookAngles): { x: number; y: number } {
  return { x: toRad(look.pitch), y: -toRad(look.yaw) }
}

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}
