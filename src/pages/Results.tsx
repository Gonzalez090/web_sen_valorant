import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { buildInsights, type Insight } from '../lib/insights'
import { niceTicks } from '../lib/niceTicks'
import { summarizeSession, type Session } from '../lib/session'
import { cmPer360, edpi, roundSens } from '../lib/sens'
import { useSessionStore } from '../store/useSessionStore'
import { C, card, FONT, muted, page, primaryButton, secondaryButton } from '../ui/styles'

const COUNT_UP_MS = 700
const TOAST_MS = 2000

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

const tooltipStyle = { background: C.card, border: `1px solid ${C.borderStrong}`, borderRadius: 8, fontFamily: FONT }

export function Results() {
  const session = useSessionStore((s) => s.session)!
  const fineTune = useSessionStore((s) => s.fineTune)
  const reset = useSessionStore((s) => s.reset)

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

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>()
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  const showToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sens.toFixed(3))
      showToast('คัดลอกแล้ว')
    } catch {
      showToast('คัดลอกไม่ได้ ลองเลือกตัวเลขแล้วกด Ctrl+C')
    }
  }

  const profile = summary.profile
  const radar = profile
    ? (['Flick', 'Micro', 'Tracking'] as const).map((name) => {
        const score = Math.round(profile[name.toLowerCase() as 'flick' | 'micro' | 'tracking'] * 100)
        return { drill: `${name} ${score}`, score }
      })
    : []

  return (
    <main style={page}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <section style={{ textAlign: 'center' }}>
          <p style={{ ...muted, fontSize: 15, margin: 0 }}>เซนส์ที่แนะนำใน Valorant{session.mode === 'fine' && ' (ทดสอบละเอียด)'}</p>
          <div
            data-testid="result-sens"
            data-value={sens.toFixed(3)}
            style={{ fontSize: 120, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', margin: '8px 0 16px', userSelect: 'all' }}
          >
            {shown.toFixed(3)}
          </div>
          <div style={{ maxWidth: 360, margin: '0 auto' }}>
            <button data-testid="copy-button" autoFocus onClick={() => void copy()} style={primaryButton}>
              คัดลอกเซนส์
            </button>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 40 }}>
          <Stat label="eDPI" help="DPI × เซนส์ ใช้เทียบความไวกับคนที่ใช้ DPI ต่างกัน" value={Math.round(edpi(dpi, sens)).toString()} testId="stat-edpi" />
          <Stat label="cm/360" help="ระยะที่ต้องลากเมาส์เพื่อหมุนตัวครบ 1 รอบ" value={`${cmPer360(sens, dpi).toFixed(1)} cm`} testId="stat-cm360" />
          <Stat label="ช่วงแนะนำ" help="ถ้าอยากปรับเอง ให้อยู่ในช่วงนี้ (±3%)" value={`${fmt(summary.range[0])} – ${fmt(summary.range[1])}`} testId="stat-range" />
        </section>

        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>สิ่งที่เราเห็นจากการเล่นของคุณ</h2>
          <div style={{ display: 'grid', gap: 12 }} data-testid="insights">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 40 }}>
          <div style={card}>
            <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>การบีบช่วงเซนส์</h2>
            <p style={{ ...muted, margin: '0 0 12px', fontSize: 12 }}>
              จุด<span style={{ color: C.mint }}>เขียว</span> = ค่าที่ชนะในรอบนั้น · เส้นแดง = ค่ากลางหลังจบรอบ
            </p>
            <div style={{ height: 240 }} data-testid="rounds-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={yAxis.ticks.length ? [yAxis.ticks[0], yAxis.ticks[yAxis.ticks.length - 1]] : ['auto', 'auto']}
                    ticks={yAxis.ticks}
                    interval={0}
                    tick={{ fill: C.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => v.toFixed(yAxis.decimals)}
                  />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: C.text }} formatter={(v) => (typeof v === 'number' ? v.toFixed(3) : String(v))} />
                  <Line dataKey="base" name="ค่ากลาง" stroke={C.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
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
                        return <circle key={`${k}-${p.index}`} cx={p.cx} cy={p.cy} r={won ? 5 : 4} fill={won ? C.mint : 'rgba(138,147,163,0.5)'} />
                      }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul data-testid="rounds-list" style={{ ...muted, fontSize: 12, margin: '12px 0 0', padding: 0, listStyle: 'none', fontVariantNumeric: 'tabular-nums' }}>
              {rows.map((r, i) => (
                <li key={i}>
                  {r.name}: {r.lo.toFixed(3)} vs {r.hi.toFixed(3)} →{' '}
                  {r.winner === null ? <span>เสมอ คงค่าเดิม {r.base.toFixed(3)}</span> : <b style={{ color: C.mint }}>{r.winner.toFixed(3)}</b>}
                </li>
              ))}
            </ul>
          </div>

          <div style={card}>
            <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>จุดแข็ง / จุดอ่อน</h2>
            <p style={{ ...muted, margin: '0 0 12px', fontSize: 12 }}>คะแนนเฉลี่ยทุกรอบ (0–100)</p>
            <div style={{ height: 260 }} data-testid="radar-chart">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="drill" tick={{ fill: C.text, fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" name="คะแนน" stroke={C.accent} fill={C.accent} fillOpacity={0.25} isAnimationActive={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section style={{ ...card, marginTop: 40, borderColor: 'rgba(255,181,71,0.25)' }} data-testid="final-advice">
          <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>ขั้นต่อไป</h2>
          <p style={{ ...muted, margin: 0, fontSize: 14 }}>ใส่ค่านี้ในเกม แล้วลองเล่นใน The Range 2–3 วันก่อนตัดสิน มือต้องใช้เวลาปรับตัวกับเซนส์ใหม่</p>
        </section>

        <section style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <button data-testid="fine-tune-button" onClick={fineTune} style={{ ...secondaryButton, flex: '1 1 200px' }}>
            ทดสอบละเอียดต่อ
          </button>
          <button data-testid="restart-button" onClick={reset} style={{ ...secondaryButton, flex: '1 1 200px' }}>
            เริ่มใหม่
          </button>
        </section>
      </div>

      {toast && (
        <div
          role="status"
          data-testid="toast"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: C.card,
            border: `1px solid ${C.borderStrong}`,
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: 14,
          }}
        >
          {toast}
        </div>
      )}
    </main>
  )
}

function Stat({ label, help, value, testId }: { label: string; help: string; value: string; testId: string }) {
  return (
    <div style={card} data-testid={testId}>
      <div style={{ ...muted, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        <span
          tabIndex={0}
          role="img"
          aria-label={help}
          title={help}
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 16,
            height: 16,
            borderRadius: 8,
            border: `1px solid ${C.borderStrong}`,
            fontSize: 10,
            cursor: 'help',
          }}
        >
          ?
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

const TONE_COLOR: Record<Insight['tone'], string> = { good: C.mint, warn: C.amber, info: C.muted }

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div data-testid={`insight-${insight.id}`} style={{ ...card, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, marginTop: 8, flex: 'none', background: TONE_COLOR[insight.tone] }} />
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{insight.text}</p>
    </div>
  )
}
