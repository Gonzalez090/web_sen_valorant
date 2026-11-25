/** Small X at the crosshair shown briefly after a hit. Static (no animation) so it doesn't distract while aiming. */
export function HitMarker({ visible, color = '#3DDC97' }: { visible: boolean; color?: string }) {
  if (!visible) return null
  const arm = (rotate: number) => (
    <div
      style={{
        position: 'absolute',
        left: -7,
        top: -1,
        width: 14,
        height: 2,
        background: color,
        transform: `rotate(${rotate}deg)`,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
      }}
    />
  )
  return (
    <div aria-hidden data-testid="hit-marker" style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' }}>
      {arm(45)}
      {arm(-45)}
    </div>
  )
}
