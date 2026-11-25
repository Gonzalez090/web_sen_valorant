/** Tiny synthesized hit/miss blips (no audio assets). Created lazily on first use. */
let ctx: AudioContext | null = null

function blip(freq: number, durationS: number, gain: number) {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const now = ctx.currentTime
    g.gain.setValueAtTime(gain, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationS)
    osc.connect(g).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + durationS)
  } catch {
    // Audio is optional feedback; ignore environments without Web Audio.
  }
}

export function playHit() {
  blip(1200, 0.06, 0.15)
}

export function playMiss() {
  blip(220, 0.08, 0.08)
}
