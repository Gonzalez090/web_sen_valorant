import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Called from the fallback's button; should leave the app in a safe state. */
  onReset: () => void
}

/** Last-resort guard so a render error shows a way back instead of a blank screen. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main data-testid="error-fallback" className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-bold">เกิดข้อผิดพลาด</h1>
          <p className="mt-2 text-sm text-muted">ความคืบหน้าที่บันทึกไว้ยังอยู่</p>
          <button
            className="mt-6 h-11 rounded-xl bg-accent px-6 text-sm font-semibold text-on-accent"
            onClick={() => {
              this.props.onReset()
              this.setState({ failed: false })
            }}
          >
            กลับหน้าแรก
          </button>
        </div>
      </main>
    )
  }
}
