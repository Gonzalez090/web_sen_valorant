/** Evenly spaced round-number axis ticks (step 1, 2 or 5 × 10^n) covering [min, max]. */
export interface NiceTicks {
  ticks: number[]
  /** Decimal places needed to print the step exactly. */
  decimals: number
}

export function niceTicks(min: number, max: number, target = 5): NiceTicks {
  if (!(Number.isFinite(min) && Number.isFinite(max))) return { ticks: [], decimals: 0 }
  if (max < min) [min, max] = [max, min]
  if (max === min) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / Math.max(1, target - 1)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  const lo = Math.floor(min / step + 1e-9)
  const hi = Math.ceil(max / step - 1e-9)
  const ticks: number[] = []
  for (let i = lo; i <= hi; i++) ticks.push(Number((i * step).toFixed(decimals)))
  return { ticks, decimals }
}
