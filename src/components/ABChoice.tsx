import { useEffect } from 'react'
import type { Preference, CandidateRun } from '../lib/scoring'
import { C, card, FONT, muted, secondaryButton } from '../ui/styles'

interface ABChoiceProps {
  round: number
  totalRounds: number
  runs: [CandidateRun, CandidateRun]
  onChoose: (pref: Preference) => void
}

export interface QuickStats {
  /** Hits / shots over Flick + Micro. */
  accuracy: number
  /** Mean time of hits over Flick + Micro, ms; null with no hits. */
  meanTimeMs: number | null
  trackingOnTarget: number
}

export function quickStats(run: CandidateRun): QuickStats {
  const clicks = [...run.flick.trials, ...run.micro.trials]
  const hitTimes = clicks.flatMap((t) => (t.hit && t.timeMs !== null ? [t.timeMs] : []))
  return {
    accuracy: clicks.length ? hitTimes.length / clicks.length : 0,
    meanTimeMs: hitTimes.length ? hitTimes.reduce((a, b) => a + b, 0) / hitTimes.length : null,
    trackingOnTarget: run.tracking.summary.onTargetRatio,
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** "Which one did you control better?" Sens values stay hidden to avoid bias. Keys 1 / 2 / 3. */
export function ABChoice({ round, totalRounds, runs, onChoose }: ABChoiceProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === '1') onChoose('A')
      else if (e.key === '2') onChoose('B')
      else if (e.key === '3') onChoose('same')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChoose])

  return (
    <div data-testid="ab-choice" style={{ width: 640, maxWidth: 'calc(100vw - 32px)', fontFamily: FONT, color: C.text }}>
      <p style={{ ...muted, textAlign: 'center', margin: 0 }}>
        รอบ {round}/{totalRounds}
      </p>
      <h1 style={{ textAlign: 'center', fontSize: 24, margin: '4px 0 20px' }}>อันไหนคุมได้ดีกว่า?</h1>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {(['A', 'B'] as const).map((label, i) => {
          const s = quickStats(runs[i])
          return (
            <button
              key={label}
              data-testid={`choose-${label}`}
              onClick={() => onChoose(label)}
              style={{ ...card, flex: '1 1 240px', textAlign: 'left', cursor: 'pointer', color: C.text, fontFamily: FONT }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 28, fontWeight: 700 }}>เซนส์ {label}</span>
                <kbd style={{ ...muted, border: `1px solid ${C.borderStrong}`, borderRadius: 6, padding: '0 6px' }}>{i + 1}</kbd>
              </div>
              <dl style={{ margin: '16px 0 0', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                <dt style={muted}>ความแม่น</dt>
                <dd style={{ margin: 0 }} data-testid={`stat-accuracy-${label}`}>
                  {pct(s.accuracy)}
                </dd>
                <dt style={muted}>เวลาเฉลี่ยถึงเป้า</dt>
                <dd style={{ margin: 0 }}>{s.meanTimeMs === null ? '-' : `${Math.round(s.meanTimeMs)} ms`}</dd>
                <dt style={muted}>อยู่บนเป้า (Tracking)</dt>
                <dd style={{ margin: 0 }}>{pct(s.trackingOnTarget)}</dd>
              </dl>
            </button>
          )
        })}
      </div>
      <button data-testid="choose-same" onClick={() => onChoose('same')} style={{ ...secondaryButton, marginTop: 16 }}>
        พอๆ กัน <span style={muted}>(3)</span>
      </button>
      <p style={{ ...muted, textAlign: 'center', marginTop: 12 }}>เลือกจากความรู้สึกตอนเล่น ระบบรวมกับผลวัดจริงให้เอง</p>
    </div>
  )
}
