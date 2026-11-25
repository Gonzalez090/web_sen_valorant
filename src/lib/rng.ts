/** Seeded PRNG returning floats in [0, 1). Same seed → same sequence (used to give A and B identical targets). */
export type Rng = () => number

/** mulberry32: small, fast, good enough for target placement. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform float in [min, max). */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng()
}

/** -1 or 1 with equal probability. */
export function randSign(rng: Rng): -1 | 1 {
  return rng() < 0.5 ? -1 : 1
}
