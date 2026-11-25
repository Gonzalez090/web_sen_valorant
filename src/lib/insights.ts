import type { DrillScores } from './scoring'
import type { CurvePoint } from './sweep'
import { summarizeSession, type Session, type SessionSummary } from './session'

/** Plain-language findings for the results page. */
export interface Insight {
  id: 'bias' | 'profile' | 'confidence'
  tone: 'good' | 'warn' | 'info'
  text: string
}

export const DRILL_NAMES: Record<keyof DrillScores, string> = {
  flick: 'การสะบัดเข้าเป้า (Flick)',
  micro: 'การเล็งละเอียด (Micro)',
  tracking: 'การเล็งตามเป้า (Tracking)',
}

/** A bias needs to show on at least this many runs on one side to be reported. */
const BIAS_MIN_RUNS = 2
/** The score curve must fall at least this share of its peak on both sides for a clear result. */
export const CLEAR_DROP = 0.1
/** Drill scores closer than this count as even. */
const PROFILE_SPREAD = 0.1

export function biasInsight(sum: SessionSummary): Insight {
  const b = sum.bias
  const fast = b.overWhenFaster >= BIAS_MIN_RUNS
  const slow = b.underWhenSlower >= BIAS_MIN_RUNS
  if (fast && slow)
    return { id: 'bias', tone: 'good', text: 'เซนส์ที่สูงกว่านี้ทำให้คุณหมุนเลยเป้า ส่วนที่ต่ำกว่าทำให้หมุนไม่ถึง ค่านี้อยู่ตรงกลางพอดี' }
  if (fast) return { id: 'bias', tone: 'good', text: 'คุณมักหมุนเลยเป้าตอน flick เมื่อเซนส์สูงกว่านี้ ค่านี้ช่วยให้หยุดได้แม่นขึ้น' }
  if (slow) return { id: 'bias', tone: 'good', text: 'คุณมักหมุนไม่ถึงเป้าเมื่อเซนส์ต่ำกว่านี้ ค่านี้ช่วยให้ไปถึงเป้าได้ในจังหวะเดียว' }
  if (b.runs > 0 && b.over * 3 >= b.runs && b.over > b.under)
    return { id: 'bias', tone: 'warn', text: 'คุณมีแนวโน้มหมุนเลยเป้าเล็กน้อย ถ้ารู้สึกไวไป ลองค่าต่ำสุดในช่วงแนะนำ' }
  if (b.runs > 0 && b.under * 3 >= b.runs && b.under > b.over)
    return { id: 'bias', tone: 'warn', text: 'คุณมีแนวโน้มหมุนไม่ถึงเป้าเล็กน้อย ถ้ารู้สึกหนืดไป ลองค่าสูงสุดในช่วงแนะนำ' }
  return { id: 'bias', tone: 'good', text: 'การหยุดที่เป้าของคุณสมดุลดี ไม่หมุนเลยหรือขาดเป้าอย่างชัดเจน' }
}

/** Strongest and weakest drill; `even` when they are closer than PROFILE_SPREAD. */
export function drillProfile(profile: DrillScores): { best: keyof DrillScores; worst: keyof DrillScores; even: boolean } {
  const keys = Object.keys(profile) as (keyof DrillScores)[]
  const best = keys.reduce((a, b) => (profile[b] > profile[a] ? b : a))
  const worst = keys.reduce((a, b) => (profile[b] < profile[a] ? b : a))
  return { best, worst, even: profile[best] - profile[worst] < PROFILE_SPREAD }
}

export function profileInsight(profile: DrillScores | null): Insight | null {
  if (!profile) return null
  const { best, worst, even } = drillProfile(profile)
  if (even) return { id: 'profile', tone: 'info', text: 'ฝีมือทั้ง 3 ด้านของคุณใกล้เคียงกัน ไม่มีจุดอ่อนชัดเจน' }
  return { id: 'profile', tone: 'info', text: `จุดแข็งของคุณคือ${DRILL_NAMES[best]} ส่วน${DRILL_NAMES[worst]}ยังฝึกเพิ่มได้อีก` }
}

/** How far the score curve falls from its peak on each side, as a share of the peak. */
export function peakDrops(curve: readonly CurvePoint[]): { left: number; right: number } {
  if (curve.length === 0) return { left: 0, right: 0 }
  let peak = 0
  for (let i = 1; i < curve.length; i++) if (curve[i].score > curve[peak].score) peak = i
  const top = curve[peak].score
  if (top <= 0) return { left: 0, right: 0 }
  const low = (xs: readonly CurvePoint[]) => Math.min(top, ...xs.map((p) => p.score))
  return { left: (top - low(curve.slice(0, peak))) / top, right: (top - low(curve.slice(peak + 1))) / top }
}

/**
 * How sharp the result is. Clear when the score curve rises to a peak and falls away on both
 * sides; a flat curve, or a best value at the edge of what was tested, means more sets would help.
 * (The near-best range itself is not the test: around a real peak scores are close by nature, so
 * the range stays a few tenths wide however many sets are played.)
 */
export function confidenceInsight(sum: SessionSummary): Insight {
  const [lo, hi] = sum.range
  const [tLo, tHi] = sum.tested
  const atEdge = sum.sens <= tLo * 1.01 || sum.sens >= tHi * 0.99
  if (atEdge)
    return { id: 'confidence', tone: 'warn', text: 'ค่าที่ดีที่สุดอยู่ที่ขอบของช่วงที่ทดสอบ กด "ทดสอบเพิ่ม" เพื่อเช็กค่าที่ไกลกว่านี้' }
  const { left, right } = peakDrops(sum.curve)
  if (Math.min(left, right) >= CLEAR_DROP)
    return { id: 'confidence', tone: 'good', text: `ผลชัดเจน คะแนนของคุณสูงสุดตรงกลางแล้วลดลงทั้งสองข้าง ค่าในช่วง ${lo.toFixed(3)}–${hi.toFixed(3)} ใช้ได้ดีพอกัน` }
  if (Math.max(left, right) < CLEAR_DROP)
    return { id: 'confidence', tone: 'warn', text: 'คะแนนในทุกค่าที่ทดสอบใกล้กันมาก ยังชี้ค่าที่ดีที่สุดได้ไม่ชัด กด "ทดสอบเพิ่ม" เพื่อให้ผลแม่นขึ้น' }
  return { id: 'confidence', tone: 'warn', text: 'คะแนนยังไม่ลดลงชัดเจนทั้งสองข้างของค่านี้ กด "ทดสอบเพิ่ม" เพื่อให้ผลแม่นขึ้น' }
}

export function buildInsights(s: Session): Insight[] {
  const sum = summarizeSession(s)
  return [confidenceInsight(sum), biasInsight(sum), profileInsight(sum.profile)].filter((x): x is Insight => x !== null)
}
