import { CLOSE_MARGIN, type DrillScores } from './scoring'
import { summarizeSession, type Session } from './session'

/** Plain-language findings for the results page. */
export interface Insight {
  id: 'bias' | 'profile' | 'feel'
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
/** Answered rounds with a clear measured winner needed before judging the player's feel. */
export const FEEL_MIN_ROUNDS = 3
/** Drill scores closer than this count as even. */
const PROFILE_SPREAD = 0.1

export function biasInsight(s: Session): Insight {
  const b = summarizeSession(s).bias
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

export function profileInsight(profile: DrillScores | null): Insight | null {
  if (!profile) return null
  const keys = Object.keys(profile) as (keyof DrillScores)[]
  const best = keys.reduce((a, b) => (profile[b] > profile[a] ? b : a))
  const worst = keys.reduce((a, b) => (profile[b] < profile[a] ? b : a))
  if (profile[best] - profile[worst] < PROFILE_SPREAD) return { id: 'profile', tone: 'info', text: 'ฝีมือทั้ง 3 ด้านของคุณใกล้เคียงกัน ไม่มีจุดอ่อนชัดเจน' }
  return { id: 'profile', tone: 'info', text: `จุดแข็งของคุณคือ${DRILL_NAMES[best]} ส่วน${DRILL_NAMES[worst]}ยังฝึกเพิ่มได้อีก` }
}

/**
 * How often the player's A/B answer matched the measured winner. Rounds answered "same", or where
 * the measured scores were closer than CLOSE_MARGIN, say nothing either way and are skipped.
 */
export function feelInsight(s: Session): Insight | null {
  if (s.history.length === 0) return null
  const answered = s.history.filter((r) => r.preference !== 'same')
  if (answered.length === 0) return { id: 'feel', tone: 'info', text: 'คุณตอบ "พอๆ กัน" ทุกรอบ ผลนี้จึงมาจากการวัดจริงเป็นหลัก' }
  const decisive = answered.filter((r) => Math.abs(r.judgement.measured.a - r.judgement.measured.b) >= CLOSE_MARGIN)
  if (decisive.length < FEEL_MIN_ROUNDS)
    return { id: 'feel', tone: 'info', text: 'ผลวัดของเซนส์ที่เทียบกันใกล้กันมาก ความรู้สึกของคุณจึงช่วยตัดสินในหลายรอบ' }
  const agree = decisive.filter((r) => (r.judgement.measured.a > r.judgement.measured.b ? 'A' : 'B') === r.preference).length
  const tone = agree * 2 > decisive.length ? 'good' : 'warn'
  const tail = tone === 'good' ? 'ความรู้สึกมือของคุณเชื่อถือได้' : 'ลองใช้ค่านี้สักพัก ความรู้สึกอาจตามผลวัดมาเอง'
  return { id: 'feel', tone, text: `ความรู้สึกของคุณตรงกับผลวัดจริง ${agree} จาก ${decisive.length} รอบที่ผลวัดต่างกันชัด · ${tail}` }
}

export function buildInsights(s: Session): Insight[] {
  const profile = summarizeSession(s).profile
  return [biasInsight(s), profileInsight(profile), feelInsight(s)].filter((x): x is Insight => x !== null)
}
