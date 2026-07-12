import { useState, useCallback } from 'react'
import { CameraView } from './components/CameraView'
import type { PullupPhase } from './lib/pullupCounter'
import './App.css'

let audioCtx: AudioContext | null = null

function playRepBeep() {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const ctx = audioCtx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.stop(ctx.currentTime + 0.12)
    void ctx.resume()
  } catch {
    // audio optional
  }
}

function phaseLabel(phase: PullupPhase): string {
  if (phase === 'lost') return 'Step into frame'
  if (phase === 'pull') return 'Pull'
  return 'Hang'
}

export default function App() {
  const [started, setStarted] = useState(false)
  const [reps, setReps] = useState(0)
  const [phase, setPhase] = useState<PullupPhase>('hang')
  const [resetSignal, setResetSignal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const onJustCounted = useCallback(() => {
    playRepBeep()
  }, [])

  if (!started) {
    return (
      <div className="landing">
        <div className="landing-glow" aria-hidden />
        <div className="landing-grid" aria-hidden />
        <main className="landing-main">
          <p className="brand">PULLUPS</p>
          <h1 className="tagline">Camera counts your reps.</h1>
          <p className="support">
            Prop your phone so your full body and the bar are visible. Pose
            tracking runs on your device — video never leaves the browser.
          </p>
          <button
            type="button"
            className="cta"
            onClick={() => {
              setError(null)
              setStarted(true)
            }}
          >
            Start
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="workout">
      <CameraView
        onRepsChange={setReps}
        onPhaseChange={setPhase}
        onJustCounted={onJustCounted}
        resetSignal={resetSignal}
        onError={setError}
      />

      <header className="workout-top">
        <span className="workout-brand">PULLUPS</span>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setStarted(false)
            setReps(0)
            setPhase('hang')
            setError(null)
          }}
        >
          Exit
        </button>
      </header>

      <div className="hud">
        <div className="rep-block">
          <span className="rep-label">Reps</span>
          <span className="rep-count" key={reps}>
            {reps}
          </span>
        </div>
        <div className={`phase-pill phase-${phase}`}>{phaseLabel(phase)}</div>
      </div>

      <footer className="workout-bottom">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => setResetSignal((n) => n + 1)}
        >
          Reset
        </button>
        <p className="tip">Keep your head and at least one arm in view</p>
      </footer>

      {error && (
        <div className="error-banner" role="alert">
          <p>{error}</p>
          <p className="error-hint">
            Allow camera access and reload, or try another browser.
          </p>
          <button
            type="button"
            className="cta cta-compact"
            onClick={() => {
              setError(null)
              setStarted(false)
            }}
          >
            Back
          </button>
        </div>
      )}
    </div>
  )
}
