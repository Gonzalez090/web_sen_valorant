import { forwardRef } from 'react'
import type { DrillScores } from '@/lib/scoring'

interface ShareCardProps {
  sens: number
  edpi: number
  cm360: number
  dpi: number
  profile: DrillScores | null
}

const BARS: [keyof DrillScores, string][] = [
  ['flick', 'Flick'],
  ['micro', 'Micro'],
  ['tracking', 'Tracking'],
]

/**
 * 1200×630 result image for social posts. Fixed dark colours (inline, not theme tokens) so the
 * picture looks the same whatever theme the page is in.
 */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(({ sens, edpi, cm360, dpi, profile }, ref) => (
  <div
    ref={ref}
    style={{
      width: 1200,
      height: 630,
      boxSizing: 'border-box',
      padding: 72,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: 'radial-gradient(circle at 85% 10%, rgba(255,70,85,0.22), transparent 45%), linear-gradient(160deg, #12151A 0%, #0B0D10 100%)',
      color: '#F5F7FA',
      fontFamily: "Inter, 'IBM Plex Sans Thai', 'Noto Sans Thai', system-ui, sans-serif",
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, color: '#8A93A3' }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: '#FF4655' }} />
      Sensitivity Finder · เซนส์ที่แนะนำ
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48 }}>
      <div>
        <div style={{ fontSize: 200, fontWeight: 800, lineHeight: 1, letterSpacing: -6, fontVariantNumeric: 'tabular-nums' }}>{sens.toFixed(3)}</div>
        <div style={{ display: 'flex', gap: 40, marginTop: 28, fontSize: 28, color: '#8A93A3', fontVariantNumeric: 'tabular-nums' }}>
          <span>
            eDPI <b style={{ color: '#F5F7FA' }}>{Math.round(edpi)}</b>
          </span>
          <span>
            cm/360 <b style={{ color: '#F5F7FA' }}>{cm360.toFixed(1)}</b>
          </span>
          <span>
            DPI <b style={{ color: '#F5F7FA' }}>{dpi}</b>
          </span>
        </div>
      </div>
      {profile && (
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 18, fontSize: 22 }}>
          {BARS.map(([k, name]) => {
            const v = Math.round(profile[k] * 100)
            return (
              <div key={k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8A93A3' }}>
                  <span>{name}</span>
                  <b style={{ color: '#F5F7FA', fontVariantNumeric: 'tabular-nums' }}>{v}</b>
                </div>
                <div style={{ height: 8, borderRadius: 4, marginTop: 8, background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: `${v}%`, height: '100%', borderRadius: 4, background: '#3DDC97' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  </div>
))
ShareCard.displayName = 'ShareCard'
