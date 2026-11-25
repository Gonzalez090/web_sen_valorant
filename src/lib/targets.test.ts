import {
  bounce,
  FLICK,
  generateFlickOffsets,
  generateMicroOffsets,
  generateStrafePath,
  MICRO,
  placeTarget,
  strafeOffsetAt,
  TARGET_PITCH_LIMIT,
  trackingStart,
  TRACKING,
} from './targets'

const dist = (o: { dYaw: number; dPitch: number }) => Math.hypot(o.dYaw, o.dPitch)

describe('flick offsets', () => {
  const offs = generateFlickOffsets(123)

  it('same seed gives identical targets (fair A/B)', () => {
    expect(generateFlickOffsets(123)).toEqual(offs)
    expect(generateFlickOffsets(124)).not.toEqual(offs)
  })

  it('has FLICK.count targets at 15 to 90 degrees, vertical part at most 20', () => {
    expect(offs).toHaveLength(FLICK.count)
    for (const o of generateFlickOffsets(9, { ...FLICK, count: 500 })) {
      expect(dist(o)).toBeGreaterThanOrEqual(15 - 1e-9)
      expect(dist(o)).toBeLessThanOrEqual(90 + 1e-9)
      expect(Math.abs(o.dPitch)).toBeLessThanOrEqual(20)
    }
  })

  it('goes both left and right, and some have a real vertical part', () => {
    const many = generateFlickOffsets(5, { ...FLICK, count: 200 })
    expect(many.some((o) => o.dYaw > 0)).toBe(true)
    expect(many.some((o) => o.dYaw < 0)).toBe(true)
    expect(many.some((o) => Math.abs(o.dPitch) > 5)).toBe(true)
  })
})

describe('micro offsets', () => {
  it('are 2 to 8 degrees away and seeded', () => {
    for (const o of generateMicroOffsets(77, { ...MICRO, count: 500 })) {
      expect(dist(o)).toBeGreaterThanOrEqual(2 - 1e-9)
      expect(dist(o)).toBeLessThanOrEqual(8 + 1e-9)
    }
    expect(generateMicroOffsets(77)).toEqual(generateMicroOffsets(77))
    expect(generateMicroOffsets(77)).toHaveLength(MICRO.count)
  })
})

describe('placeTarget', () => {
  it('adds the offset and wraps yaw', () => {
    const t = placeTarget({ yaw: 170, pitch: 0 }, { dYaw: 30, dPitch: 5 })
    expect(t.yaw).toBeCloseTo(-160)
    expect(t.pitch).toBeCloseTo(5)
  })

  it('mirrors the vertical offset instead of leaving the pitch limit', () => {
    const t = placeTarget({ yaw: 0, pitch: 30 }, { dYaw: 10, dPitch: 15 })
    expect(t.pitch).toBeCloseTo(15)
    expect(Math.abs(t.pitch)).toBeLessThanOrEqual(TARGET_PITCH_LIMIT)
  })
})

describe('strafe path', () => {
  it('covers the duration, is seeded, and uses 0.25 to 1 s segments', () => {
    const p = generateStrafePath(3)
    expect(generateStrafePath(3)).toEqual(p)
    expect(p[0].t0).toBe(0)
    expect(p[p.length - 1].t0).toBeLessThan(TRACKING.durationS)
    for (let i = 1; i < p.length; i++) {
      const len = p[i].t0 - p[i - 1].t0
      expect(len).toBeGreaterThanOrEqual(TRACKING.minSegS - 1e-9)
      expect(len).toBeLessThanOrEqual(TRACKING.maxSegS + 1e-9)
    }
  })

  it('reverses between moving segments and sometimes stops', () => {
    const p = generateStrafePath(11, 60)
    for (let i = 1; i < p.length; i++) {
      if (p[i].dir !== 0 && p[i - 1].dir !== 0) expect(p[i].dir).toBe(-p[i - 1].dir)
    }
    expect(p.some((s) => s.dir === 0)).toBe(true)
  })

  it('moves at agent speed (about 29.4 deg/s at 12 m) and stays within range', () => {
    expect(TRACKING.speedDegPerS).toBeCloseTo(29.36, 1)
    const p = generateStrafePath(8)
    for (let t = 0; t < TRACKING.durationS; t += 0.01) {
      expect(Math.abs(strafeOffsetAt(p, t))).toBeLessThanOrEqual(TRACKING.rangeDeg + 1e-9)
    }
  })

  it('is continuous and never faster than agent speed', () => {
    const p = generateStrafePath(21)
    let prev = strafeOffsetAt(p, 0)
    for (let t = 0.005; t < TRACKING.durationS; t += 0.005) {
      const x = strafeOffsetAt(p, t)
      expect(Math.abs(x - prev)).toBeLessThanOrEqual(TRACKING.speedDegPerS * 0.005 + 1e-6)
      prev = x
    }
  })
})

describe('bounce', () => {
  it('folds into [-r, r]', () => {
    expect(bounce(0, 25)).toBeCloseTo(0)
    expect(bounce(30, 25)).toBeCloseTo(20)
    expect(bounce(-30, 25)).toBeCloseTo(-20)
    expect(bounce(100, 25)).toBeCloseTo(0)
  })
})

describe('trackingStart', () => {
  it('starts on the crosshair in yaw and pitch', () => {
    expect(trackingStart({ yaw: 40, pitch: -29.4 })).toEqual({ yaw: 40, pitch: -29.4 })
  })

  it('clamps pitch to the target limit', () => {
    expect(trackingStart({ yaw: 0, pitch: 80 }).pitch).toBe(TARGET_PITCH_LIMIT)
    expect(trackingStart({ yaw: 0, pitch: -80 }).pitch).toBe(-TARGET_PITCH_LIMIT)
  })
})
