import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { RoundDots } from '@/components/Hud'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import type { CandidateRun, Preference } from '@/lib/scoring'

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
    <div data-testid="ab-choice" className="w-160 max-w-[calc(100vw-32px)]">
      <p className="text-center text-sm text-muted tabular-nums">
        รอบ {round}/{totalRounds}
      </p>
      <RoundDots total={totalRounds} done={round - 1} testId="ab-stepper" className="mt-2 justify-center" />
      <h1 className="mt-1 mb-6 text-center text-2xl font-bold tracking-tight">อันไหนคุมได้ดีกว่า?</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['A', 'B'] as const).map((label, i) => {
          const s = quickStats(runs[i])
          return (
            <motion.button
              key={label}
              data-testid={`choose-${label}`}
              onClick={() => onChoose(label)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
              className="rounded-card border border-line bg-card p-6 text-left transition-colors duration-150 hover:border-accent/60 hover:bg-accent/5"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">เซนส์ {label}</span>
                <Kbd>{i + 1}</Kbd>
              </div>
              <dl className="mt-5 grid grid-cols-[1fr_auto] gap-y-2 text-sm tabular-nums">
                <dt className="text-muted">ความแม่น</dt>
                <dd className="font-semibold" data-testid={`stat-accuracy-${label}`}>
                  {pct(s.accuracy)}
                </dd>
                <dt className="text-muted">เวลาเฉลี่ยถึงเป้า</dt>
                <dd className="font-semibold">{s.meanTimeMs === null ? '-' : `${Math.round(s.meanTimeMs)} ms`}</dd>
                <dt className="text-muted">อยู่บนเป้า (Tracking)</dt>
                <dd className="font-semibold">{pct(s.trackingOnTarget)}</dd>
              </dl>
            </motion.button>
          )
        })}
      </div>
      <Button data-testid="choose-same" variant="secondary" className="mt-4 w-full" onClick={() => onChoose('same')}>
        พอๆ กัน <Kbd>3</Kbd>
      </Button>
      <p className="mt-4 text-center text-sm text-muted">เลือกจากความรู้สึกตอนเล่น ระบบรวมกับผลวัดจริงให้เอง</p>
    </div>
  )
}
