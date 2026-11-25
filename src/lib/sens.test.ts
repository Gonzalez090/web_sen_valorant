import {
  applyMouseDelta,
  clampPitch,
  cmPer360,
  countsToDegrees,
  defaultSens,
  edpi,
  hFovToVFov,
  isValidDpi,
  isValidSens,
  lookToEuler,
  normalizeAngle,
  roundSens,
  SENS_MIN,
  sensFromCmPer360,
  valorantVFov,
} from './sens'

describe('countsToDegrees', () => {
  it('uses 0.07 deg per count per sens', () => {
    expect(countsToDegrees(1, 1)).toBeCloseTo(0.07)
    expect(countsToDegrees(100, 0.4)).toBeCloseTo(2.8)
    expect(countsToDegrees(-100, 0.4)).toBeCloseTo(-2.8)
  })
})

describe('cmPer360', () => {
  it('dpi 800 sens 0.4 → ≈ 40.8 cm', () => {
    expect(cmPer360(0.4, 800)).toBeCloseTo(40.82, 2)
  })

  it('dpi 1600 sens 0.2 equals dpi 800 sens 0.4 (same eDPI)', () => {
    expect(cmPer360(0.2, 1600)).toBeCloseTo(cmPer360(0.4, 800), 10)
  })

  it('counts for one full turn rotate exactly 360°', () => {
    const sens = 0.35
    const dpi = 800
    const counts = (cmPer360(sens, dpi) / 2.54) * dpi
    expect(countsToDegrees(counts, sens)).toBeCloseTo(360, 8)
  })

  it.each([0, -0.4, NaN, Infinity])('throws on invalid sens %s', (sens) => {
    expect(() => cmPer360(sens, 800)).toThrow(RangeError)
  })

  it.each([0, -800, NaN])('throws on invalid dpi %s', (dpi) => {
    expect(() => cmPer360(0.4, dpi)).toThrow(RangeError)
    expect(() => sensFromCmPer360(40, dpi)).toThrow(RangeError)
  })

  it.each([0, -40, NaN])('sensFromCmPer360 throws on invalid cm %s', (cm) => {
    expect(() => sensFromCmPer360(cm, 800)).toThrow(RangeError)
  })

  it('round-trips with sensFromCmPer360', () => {
    expect(sensFromCmPer360(cmPer360(0.523, 1200), 1200)).toBeCloseTo(0.523, 10)
  })
})

describe('edpi / defaultSens', () => {
  it('eDPI = dpi * sens', () => {
    expect(edpi(800, 0.4)).toBeCloseTo(320)
  })

  it('default start is eDPI 280', () => {
    expect(defaultSens(800)).toBeCloseTo(0.35)
    expect(defaultSens(1600)).toBeCloseTo(0.175)
    expect(edpi(400, defaultSens(400))).toBeCloseTo(280)
  })

  it.each([0, -800, NaN, Infinity])('defaultSens throws on invalid dpi %s', (dpi) => {
    expect(() => defaultSens(dpi)).toThrow(RangeError)
  })

  it.each([
    [0, 0.4],
    [-800, 0.4],
    [800, -1],
    [800, 0],
    [800, NaN],
  ])('edpi throws on invalid input (dpi=%s, sens=%s)', (dpi, sens) => {
    expect(() => edpi(dpi, sens)).toThrow(RangeError)
  })
})

describe('roundSens', () => {
  it('rounds to 3 decimals', () => {
    expect(roundSens(0.34567)).toBe(0.346)
    expect(roundSens(0.1234)).toBe(0.123)
    expect(roundSens(1.005)).toBe(1.005)
    expect(roundSens(0.1445)).toBe(0.145)
  })

  it('never rounds a valid sens below SENS_MIN', () => {
    expect(SENS_MIN).toBe(0.001)
    expect(roundSens(0.0004)).toBe(0.001)
    expect(roundSens(0.0005)).toBe(0.001)
  })

  it.each([0, -0.4, NaN, Infinity])('throws on invalid sens %s', (sens) => {
    expect(() => roundSens(sens)).toThrow(RangeError)
  })
})

describe('isValidDpi', () => {
  it('accepts 100–32000 only', () => {
    expect(isValidDpi(100)).toBe(true)
    expect(isValidDpi(32000)).toBe(true)
    expect(isValidDpi(99)).toBe(false)
    expect(isValidDpi(32001)).toBe(false)
    expect(isValidDpi(NaN)).toBe(false)
  })

  it('rejects non-integer DPI', () => {
    expect(isValidDpi(800.5)).toBe(false)
  })
})

describe('isValidSens', () => {
  it('accepts positive finite only', () => {
    expect(isValidSens(0.4)).toBe(true)
    expect(isValidSens(0)).toBe(false)
    expect(isValidSens(-0.4)).toBe(false)
    expect(isValidSens(NaN)).toBe(false)
    expect(isValidSens(Infinity)).toBe(false)
  })
})

describe('FOV conversion', () => {
  it('16:9 at 103° horizontal → ≈ 70.53° vertical', () => {
    expect(valorantVFov(16 / 9)).toBeCloseTo(70.53, 2)
  })

  it('aspect 1 keeps the same FOV', () => {
    expect(hFovToVFov(90, 1)).toBeCloseTo(90, 10)
  })

  it('wider aspect → smaller vertical FOV', () => {
    expect(valorantVFov(21 / 9)).toBeLessThan(valorantVFov(16 / 9))
  })

  it('4:3 → ≈ 86.63°, 21:9 → ≈ 56.63°', () => {
    expect(valorantVFov(4 / 3)).toBeCloseTo(86.63, 2)
    expect(valorantVFov(21 / 9)).toBeCloseTo(56.63, 2)
  })

  it.each([0, -1, NaN, Infinity])('throws on invalid aspect %s', (aspect) => {
    expect(() => hFovToVFov(103, aspect)).toThrow(RangeError)
    expect(() => valorantVFov(aspect)).toThrow(RangeError)
  })

  it.each([0, 180, -10, NaN])('throws on invalid hFov %s', (fov) => {
    expect(() => hFovToVFov(fov, 16 / 9)).toThrow(RangeError)
  })
})

describe('angles', () => {
  it('normalizeAngle wraps into [-180, 180)', () => {
    expect(normalizeAngle(190)).toBeCloseTo(-170)
    expect(normalizeAngle(-190)).toBeCloseTo(170)
    expect(normalizeAngle(360)).toBeCloseTo(0)
    expect(normalizeAngle(180)).toBeCloseTo(-180)
  })

  it('clampPitch limits to ±89', () => {
    expect(clampPitch(120)).toBe(89)
    expect(clampPitch(-120)).toBe(-89)
    expect(clampPitch(10)).toBe(10)
  })

  it('applyMouseDelta: right turns right, toward-you looks down', () => {
    const look = applyMouseDelta({ yaw: 0, pitch: 0 }, 100, 100, 0.4)
    expect(look.yaw).toBeCloseTo(2.8)
    expect(look.pitch).toBeCloseTo(-2.8)
  })

  it('applyMouseDelta clamps pitch and wraps yaw', () => {
    const look = applyMouseDelta({ yaw: 179, pitch: 88 }, 100, -100, 1)
    expect(look.yaw).toBeCloseTo(-174)
    expect(look.pitch).toBe(89)
  })

  it.each([
    [NaN, 0, 0.4],
    [0, NaN, 0.4],
    [Infinity, 0, 0.4],
    [10, 10, NaN],
    [10, 10, 0],
    [10, 10, -0.4],
  ])('applyMouseDelta ignores bad input (dx=%s, dy=%s, sens=%s)', (dx, dy, sens) => {
    const start = { yaw: 12, pitch: -3 }
    expect(applyMouseDelta(start, dx, dy, sens)).toEqual(start)
  })
})

describe('lookToEuler', () => {
  it('maps yaw right to negative Y rotation and pitch up to positive X', () => {
    const e = lookToEuler({ yaw: 90, pitch: 45 })
    expect(e.y).toBeCloseTo(-Math.PI / 2)
    expect(e.x).toBeCloseTo(Math.PI / 4)
  })
})
