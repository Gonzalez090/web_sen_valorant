import { motion } from 'framer-motion'
import { toPng } from 'html-to-image'
import { CheckCircle2, Copy, Crosshair, ImageDown, Info, RotateCcw, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ShareCard } from '@/components/ShareCard'
import { useToast } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HelpTip } from '@/components/ui/tooltip'
import { buildInsights, DRILL_NAMES, type Insight } from '@/lib/insights'
import type { DrillScores } from '@/lib/scoring'
import { niceTicks } from '@/lib/niceTicks'
import { summarizeSession, type Session } from '@/lib/session'
import { cmPer360, edpi, roundSens } from '@/lib/sens'
import { cn } from '@/lib/utils'
import { useSessionStore, type Theme } from '@/store/useSessionStore'

const COUNT_UP_MS = 700

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts from 0 to `target` on mount (instant with reduced motion). */
function useCountUp(target: number): number {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0))
  useEffect(() => {
    if (reducedMotion()) {
      setV(target)
      return
    }
    let id = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / COUNT_UP_MS)
      setV(target * (1 - Math.pow(1 - k, 3)))
      if (k < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [target])
  return v
}

/** Chart colours per theme (recharts needs concrete colours, not CSS variables). */
const CHART: Record<Theme, { accent: string; good: string; muted: string; dot: string; grid: string; fg: string; card: string; border: string }> = {
  dark: { accent: '#FF4655', good: '#3DDC97', muted: '#8A93A3', dot: 'rgba(138,147,163,0.5)', grid: 'rgba(255,255,255,0.05)', fg: '#F5F7FA', card: '#171A21', border: 'rgba(255,255,255,0.12)' },
  light: { accent: '#E0323F', good: '#0F7F52', muted: '#5B6472', dot: 'rgba(91,100,114,0.45)', grid: 'rgba(11,13,16,0.06)', fg: '#0B0D10', card: '#FFFFFF', border: 'rgba(11,13,16,0.16)' },
}

const fmt = (x: number) => roundSens(x).toFixed(3)

interface RoundRow {
  name: string
  lo: number
  hi: number
  base: number
  /** Winning sens, null on a tie. */
  winner: number | null
}

function roundRows(s: Session): RoundRow[] {
  return s.history.map((r, i) => {
    const [lo, hi] = [...r.plan.candidates].sort((a, b) => a.sens - b.sens)
    const w = r.judgement.winner
    return {
      name: r.plan.kind === 'validation' ? 'ยืนยัน' : `รอบ ${i + 1}`,
      lo: roundSens(lo.sens),
      hi: roundSens(hi.sens),
      base: roundSens(r.baseAfter),
      winner: w === 'tie' ? null : roundSens(r.plan.candidates[w === 'A' ? 0 : 1].sens),
    }
  })
}

const fadeUp = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: 'easeOut' as const, delay: 0.1 + i * 0.05 },
})

/** `session` comes from App so the page keeps its last session while fading out after a reset. */
export function Results({ session }: { session: Session }) {
  const fineTune = useSessionStore((s) => s.fineTune)
  const reset = useSessionStore((s) => s.reset)
  const theme = useSessionStore((s) => s.theme)
  const c = CHART[theme]

  const summary = useMemo(() => summarizeSession(session), [session])
  const insights = useMemo(() => buildInsights(session), [session])
  const rows = useMemo(() => roundRows(session), [session])
  const yAxis = useMemo(() => {
    const values = rows.flatMap((r) => [r.lo, r.hi, r.base])
    return niceTicks(Math.min(...values), Math.max(...values))
  }, [rows])
  const sens = roundSens(summary.sens)
  const shown = useCountUp(sens)
  const dpi = session.settings.dpi
  const edpiValue = edpi(dpi, sens)
  const cm360 = cmPer360(sens, dpi)

  const [toast, showToast] = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sens.toFixed(3))
      showToast('คัดลอกแล้ว')
    } catch {
      showToast('คัดลอกไม่ได้ ลองเลือกตัวเลขแล้วกด Ctrl+C')
    }
  }

  const shareRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const saveImage = async () => {
    const node = shareRef.current
    if (!node) return
    setSharing(true)
    try {
      const opts = { pixelRatio: 1, cacheBust: true, width: 1200, height: 630 }
      // Embedding web fonts can fail (offline, blocked CSS); fall back to system fonts.
      const url = await toPng(node, opts).catch(() => toPng(node, { ...opts, skipFonts: true }))
      const a = document.createElement('a')
      a.href = url
      a.download = `sens-${sens.toFixed(3)}.png`
      a.click()
      showToast('บันทึกรูปแล้ว')
    } catch {
      showToast('สร้างรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSharing(false)
    }
  }

  const profile = summary.profile
  const radar = profile
    ? (['Flick', 'Micro', 'Tracking'] as const).map((name) => {
        const score = Math.round(profile[name.toLowerCase() as 'flick' | 'micro' | 'tracking'] * 100)
        return { drill: `${name} ${score}`, score }
      })
    : []

  const strengths = useMemo(() => {
    if (!profile) return null
    const order = (Object.keys(profile) as (keyof DrillScores)[]).sort((a, b) => profile[b] - profile[a])
    return { best: order[0], worst: order[order.length - 1] }
  }, [profile])

  const tooltipStyle ={ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, color: c.fg, fontSize: 12 }

  return (
    <main className="px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-220">
        <section className="text-center">
          <motion.p {...fadeUp(0)} className="text-base text-muted">
            เซนส์ที่แนะนำใน Valorant{session.mode === 'fine' && ' (ทดสอบละเอียด)'}
          </motion.p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <div
              data-testid="result-sens"
              data-value={sens.toFixed(3)}
              className="text-[clamp(72px,15vw,136px)] leading-none font-extrabold tracking-tighter tabular-nums select-all"
            >
              {shown.toFixed(3)}
            </div>
            <Button data-testid="copy-icon-button" variant="ghost" size="icon" aria-label="คัดลอกค่าเซนส์" onClick={() => void copy()}>
              <Copy className="size-5" strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
          <motion.div {...fadeUp(1)} className="mx-auto mt-8 max-w-sm">
            <Button data-testid="copy-button" autoFocus size="lg" className="w-full" onClick={() => void copy()}>
              <Copy className="size-5" strokeWidth={2} aria-hidden /> คัดลอกเซนส์
            </Button>
          </motion.div>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <Stat i={2} label="eDPI" help="DPI × เซนส์ ใช้เทียบความไวกับคนที่ใช้ DPI ต่างกัน" value={Math.round(edpiValue).toString()} testId="stat-edpi" />
          <Stat i={3} label="cm/360" help="ระยะที่ต้องลากเมาส์เพื่อหมุนตัวครบ 1 รอบ" value={`${cm360.toFixed(1)} cm`} testId="stat-cm360" />
          <Stat i={4} label="ช่วงแนะนำ" help="ถ้าอยากปรับเอง ให้อยู่ในช่วงนี้ (±3%)" value={`${fmt(summary.range[0])} – ${fmt(summary.range[1])}`} testId="stat-range" />
        </section>

        <motion.section {...fadeUp(5)} className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">สิ่งที่เราเห็นจากการเล่นของคุณ</h2>
          <div className="grid gap-3" data-testid="insights">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </motion.section>

        <motion.section {...fadeUp(6)} className="mt-12 grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="font-semibold">การบีบช่วงเซนส์</h2>
            <p className="mt-1 mb-4 text-xs text-muted">
              จุด<span className="font-medium text-good">เขียว</span> = ค่าที่ชนะ · จุดเทา = ค่าที่แพ้ · เส้น<span className="font-medium text-accent-text">แดง</span> = ค่ากลางหลังจบรอบ
            </p>
            <div className="h-60" data-testid="rounds-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={yAxis.ticks.length ? [yAxis.ticks[0], yAxis.ticks[yAxis.ticks.length - 1]] : ['auto', 'auto']}
                    ticks={yAxis.ticks}
                    interval={0}
                    tick={{ fill: c.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => v.toFixed(yAxis.decimals)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: c.fg }}
                    itemStyle={{ color: c.fg }}
                    cursor={{ stroke: c.border }}
                    formatter={(v) => (typeof v === 'number' ? v.toFixed(3) : String(v))}
                  />
                  <Line dataKey="base" name="ค่ากลาง" stroke={c.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {(['lo', 'hi'] as const).map((k) => (
                    <Line
                      key={k}
                      dataKey={k}
                      name={k === 'lo' ? 'ต่ำ' : 'สูง'}
                      stroke="none"
                      isAnimationActive={false}
                      activeDot={false}
                      dot={(p: { cx?: number; cy?: number; index?: number; payload?: RoundRow }) => {
                        const won = p.payload !== undefined && p.payload.winner === p.payload[k]
                        return <circle key={`${k}-${p.index}`} cx={p.cx} cy={p.cy} r={won ? 5 : 4} fill={won ? c.good : c.dot} />
                      }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul data-testid="rounds-list" className="mt-4 space-y-0.5 text-xs text-muted tabular-nums">
              {rows.map((r, i) => (
                <li key={i}>
                  {r.name}: {r.lo.toFixed(3)} vs {r.hi.toFixed(3)} →{' '}
                  {r.winner === null ? <span>เสมอ คงค่าเดิม {r.base.toFixed(3)}</span> : <b className="text-good">{r.winner.toFixed(3)}</b>}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col">
            <h2 className="font-semibold">จุดแข็ง / จุดอ่อน</h2>
            <p className="mt-1 mb-4 text-xs text-muted">คะแนนเฉลี่ยทุกรอบ (0–100)</p>
            {/* Grows with the round chart beside it, so the radar sits centred instead of leaving a gap. */}
            <div className="min-h-64 flex-1" data-testid="radar-chart">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke={c.grid} />
                  <PolarAngleAxis dataKey="drill" tick={{ fill: c.fg, fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" name="คะแนน" stroke={c.accent} fill={c.accent} fillOpacity={0.22} isAnimationActive={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: c.fg }} itemStyle={{ color: c.fg }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {strengths && (
              <dl data-testid="strengths" className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">ถนัดที่สุด</dt>
                <dd className="font-medium text-good">{DRILL_NAMES[strengths.best]}</dd>
                <dt className="text-muted">ควรฝึกเพิ่ม</dt>
                <dd className="font-medium">{DRILL_NAMES[strengths.worst]}</dd>
              </dl>
            )}
          </Card>
        </motion.section>

        <motion.div {...fadeUp(7)}>
          <Card data-testid="final-advice" className="mt-12 flex items-start gap-4 border-warn/30">
            <Crosshair className="mt-0.5 size-5 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
            <div>
              <h2 className="font-semibold">ขั้นต่อไป</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">ใส่ค่านี้ในเกม แล้วลองเล่นใน The Range 2–3 วันก่อนตัดสิน มือต้องใช้เวลาปรับตัวกับเซนส์ใหม่</p>
            </div>
          </Card>
        </motion.div>

        <motion.section {...fadeUp(8)} className="mt-6 grid gap-3 sm:grid-cols-3">
          <Button data-testid="fine-tune-button" variant="secondary" onClick={fineTune}>
            <Crosshair className="size-4" strokeWidth={1.75} aria-hidden /> ทดสอบละเอียดต่อ
          </Button>
          <Button data-testid="share-button" variant="secondary" disabled={sharing} onClick={() => void saveImage()}>
            <ImageDown className="size-4" strokeWidth={1.75} aria-hidden /> {sharing ? 'กำลังสร้างรูป…' : 'บันทึกรูปไว้แชร์'}
          </Button>
          <Button data-testid="restart-button" variant="secondary" onClick={reset}>
            <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden /> เริ่มใหม่
          </Button>
        </motion.section>
      </div>

      {/* Off-screen source for the share image; the inner card is what gets captured. */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-[-10000px]">
        <ShareCard ref={shareRef} sens={sens} edpi={edpiValue} cm360={cm360} dpi={dpi} profile={profile} />
      </div>

      {toast}
    </main>
  )
}

function Stat({ i, label, help, value, testId }: { i: number; label: string; help: string; value: string; testId: string }) {
  return (
    <motion.div {...fadeUp(i)}>
      <Card data-testid={testId} className="h-full p-5">
        <div className="flex items-center gap-1.5 text-sm text-muted">
          {label}
          <HelpTip label={label} text={help} />
        </div>
        <div className="mt-2 text-[28px] font-bold tracking-tight tabular-nums">{value}</div>
      </Card>
    </motion.div>
  )
}

const TONE: Record<Insight['tone'], { icon: LucideIcon; className: string }> = {
  good: { icon: CheckCircle2, className: 'text-good' },
  warn: { icon: TriangleAlert, className: 'text-warn' },
  info: { icon: Info, className: 'text-muted' },
}

function InsightCard({ insight }: { insight: Insight }) {
  const { icon: Icon, className } = TONE[insight.tone]
  return (
    <Card data-testid={`insight-${insight.id}`} className="flex items-start gap-3 px-5 py-4">
      <Icon className={cn('mt-0.5 size-5 shrink-0', className)} strokeWidth={1.75} aria-hidden />
      <p className="text-[15px] leading-relaxed">{insight.text}</p>
    </Card>
  )
}
