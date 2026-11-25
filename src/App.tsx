import { cmPer360, edpi, roundSens, valorantVFov } from './lib/sens'

// Placeholder until step 2+; shows sens.ts output so it can be checked in the browser.
export default function App() {
  const dpi = 800
  const sens = 0.4
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Sensitivity Finder — step 1</h1>
      <ul data-testid="sens-demo">
        <li>DPI: {dpi}</li>
        <li>Sens: {roundSens(sens)}</li>
        <li>eDPI: {edpi(dpi, sens)}</li>
        <li>cm/360: {cmPer360(sens, dpi).toFixed(2)}</li>
        <li>vFOV @16:9: {valorantVFov(16 / 9).toFixed(2)}°</li>
      </ul>
    </main>
  )
}
