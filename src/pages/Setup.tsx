import { useState, type FormEvent } from 'react'
import type { Role } from '../lib/scoring'
import { FULL_SESSION_EST_S, isFinished, progress } from '../lib/session'
import { DPI_MAX, DPI_MIN, isValidDpi, isValidSens, roundSens } from '../lib/sens'
import { useSessionStore } from '../store/useSessionStore'
import { C, card, chip, minutesText, muted, page, primaryButton, secondaryButton, warn } from '../ui/styles'

const DPI_PRESETS = [400, 800, 1600]

const CHECKLIST = [
  { id: 'accel', title: 'ปิด mouse acceleration', detail: 'Windows: ปิด "Enhance pointer precision"' },
  { id: 'pad', title: 'ใช้แผ่นรองเมาส์ที่เล่นจริง', detail: 'พื้นผิวต่างกัน ความรู้สึกต่างกัน' },
  { id: 'posture', title: 'นั่งท่าที่เล่นจริง', detail: 'ระยะแขนและมุมข้อมือเหมือนตอนเล่นจริง' },
]

export function Setup() {
  const session = useSessionStore((s) => s.session)
  const last = useSessionStore((s) => s.lastSettings)
  const start = useSessionStore((s) => s.start)
  const resume = useSessionStore((s) => s.resume)
  const reset = useSessionStore((s) => s.reset)

  const [dpiText, setDpiText] = useState(String(last?.dpi ?? ''))
  const [sensText, setSensText] = useState(last?.userSens ? String(last.userSens) : '')
  const [role, setRole] = useState<Role>(last?.role ?? 'other')
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [touched, setTouched] = useState(false)

  const dpi = Number(dpiText)
  const dpiOk = dpiText.trim() !== '' && isValidDpi(dpi)
  const sens = Number(sensText)
  const sensOk = sensText.trim() === '' || isValidSens(sens)
  const canStart = dpiOk && sensOk

  const inProgress = session !== null && !isFinished(session)
  const finished = session !== null && isFinished(session)
  const prog = session && inProgress ? progress(session) : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!canStart) return
    start({ dpi, userSens: sensText.trim() === '' ? null : sens, role })
  }

  return (
    <main style={page}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 36, margin: 0, letterSpacing: -0.5 }}>หาเซนส์ที่ใช่สำหรับคุณ</h1>
          <p style={{ ...muted, fontSize: 15, marginTop: 8 }}>เล็งในห้องซ้อม เทียบเซนส์ทีละคู่ จนเหลือค่าที่คุณคุมได้ดีที่สุด</p>
        </header>

        {inProgress && prog && (
          <section data-testid="resume-card" style={{ ...card, marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>มีการทดสอบค้างอยู่</h2>
            <p style={{ ...muted, margin: '0 0 16px' }}>
              {session.warmup ? 'วอร์มอัป' : `รอบ ${prog.round}/${prog.totalRounds}`} · เหลือ{minutesText(prog.remainingS)}
            </p>
            <button data-testid="resume-session" autoFocus onClick={resume} style={primaryButton}>
              ทำต่อจากที่ค้างไว้ →
            </button>
          </section>
        )}
        {finished && (
          <section
            data-testid="last-result-card"
            style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <span style={muted}>
              ผลล่าสุด: <b style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{roundSens(session.psa.base).toFixed(3)}</b>
            </span>
            <button data-testid="view-last-result" onClick={resume} style={{ ...secondaryButton, width: 'auto' }}>
              ดูผล
            </button>
          </section>
        )}

        <form onSubmit={submit} style={card} noValidate>
          <label htmlFor="dpi" style={{ fontSize: 14, fontWeight: 600 }}>
            DPI ของเมาส์
          </label>
          <input
            id="dpi"
            data-testid="dpi-input"
            inputMode="numeric"
            autoFocus={!inProgress}
            placeholder="800"
            value={dpiText}
            onChange={(e) => setDpiText(e.target.value)}
            aria-invalid={touched && !dpiOk}
            aria-describedby="dpi-help"
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              margin: '8px 0',
              padding: '12px 16px',
              borderRadius: 10,
              border: `1px solid ${touched && !dpiOk ? C.amber : C.borderStrong}`,
              background: C.bg,
              color: C.text,
              fontSize: 32,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {DPI_PRESETS.map((d) => (
              <button
                type="button"
                key={d}
                data-testid={`dpi-preset-${d}`}
                onClick={() => setDpiText(String(d))}
                style={{ ...chip(dpiText === String(d)), flex: 1 }}
              >
                {d}
              </button>
            ))}
          </div>
          <p id="dpi-help" style={{ ...(touched && !dpiOk ? warn : muted), margin: '8px 0 0' }} data-testid="dpi-help">
            {touched && !dpiOk ? `ใส่ DPI เป็นจำนวนเต็ม ${DPI_MIN}–${DPI_MAX}` : 'ดูค่า DPI ได้จากโปรแกรมของเมาส์ (เช่น G HUB, Synapse)'}
          </p>

          <details style={{ marginTop: 20 }} data-testid="more-options" open={last?.userSens != null || last?.role === 'duelist' || undefined}>
            <summary style={{ cursor: 'pointer', fontSize: 14 }}>ตัวเลือกเพิ่มเติม</summary>
            <label htmlFor="sens" style={{ display: 'block', fontSize: 14, marginTop: 12 }}>
              เซนส์ที่ใช้อยู่ตอนนี้ <span style={muted}>(ไม่บังคับ ใช้เป็นจุดเริ่มต้น)</span>
            </label>
            <input
              id="sens"
              data-testid="sens-input"
              inputMode="decimal"
              placeholder="เช่น 0.35"
              value={sensText}
              onChange={(e) => setSensText(e.target.value)}
              aria-invalid={!sensOk}
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 6,
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${sensOk ? C.borderStrong : C.amber}`,
                background: C.bg,
                color: C.text,
                fontSize: 16,
              }}
            />
            {!sensOk && <p style={{ ...warn, margin: '4px 0 0' }}>ใส่ตัวเลขมากกว่า 0</p>}
            <div style={{ fontSize: 14, marginTop: 12 }}>บทบาทที่เล่นบ่อย</div>
            <div role="radiogroup" aria-label="บทบาท" style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {(
                [
                  ['duelist', 'Duelist'],
                  ['other', 'อื่นๆ'],
                ] as const
              ).map(([r, label]) => (
                <button
                  type="button"
                  key={r}
                  role="radio"
                  aria-checked={role === r}
                  data-testid={`role-${r}`}
                  onClick={() => setRole(r)}
                  style={{ ...chip(role === r), flex: 1 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </details>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>ก่อนเริ่ม</div>
            {CHECKLIST.map((c) => (
              <label
                key={c.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  marginBottom: 6,
                  borderRadius: 10,
                  border: `1px solid ${checked[c.id] ? 'rgba(61,220,151,0.4)' : C.border}`,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  data-testid={`check-${c.id}`}
                  checked={!!checked[c.id]}
                  onChange={(e) => setChecked({ ...checked, [c.id]: e.target.checked })}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ fontSize: 14 }}>{c.title}</span>
                  <br />
                  <span style={{ ...muted, fontSize: 12 }}>{c.detail}</span>
                </span>
              </label>
            ))}
          </div>

          <p style={{ ...muted, textAlign: 'center', margin: '16px 0 12px' }} data-testid="time-estimate">
            ใช้เวลา{minutesText(FULL_SESSION_EST_S)} · พักได้ตลอด
          </p>
          <button
            type="submit"
            data-testid="start-button"
            aria-disabled={!canStart}
            style={{ ...(inProgress ? secondaryButton : primaryButton), opacity: canStart ? 1 : 0.5 }}
          >
            {inProgress ? 'เริ่มใหม่ทั้งหมด' : 'เริ่มหาเซนส์ →'}
          </button>
          {inProgress && <p style={{ ...muted, fontSize: 12, textAlign: 'center', margin: '8px 0 0' }}>เริ่มใหม่จะลบความคืบหน้าที่ค้างอยู่</p>}
        </form>

        {session && (
          <p style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              data-testid="clear-session"
              onClick={reset}
              style={{ background: 'none', border: 0, color: C.muted, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              ล้างข้อมูลที่บันทึกไว้
            </button>
          </p>
        )}
      </div>
    </main>
  )
}
