import { useState, useCallback } from 'react'
import { CameraView } from './components/CameraView'
import type { PullupPhase } from './lib/pullupCounter'
import './App.css'

const CHALLENGE_GOAL = 1000
const STORAGE_KEY = 'pullups-challenge-total'

let audioCtx: AudioContext | null = null

function loadTotal(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), CHALLENGE_GOAL) : 0
  } catch {
    return 0
  }
}

function saveTotal(n: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(n))
  } catch {
    // storage optional
  }
}

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
  const [reps, setReps] = useState(loadTotal)
  const [phase, setPhase] = useState<PullupPhase>('hang')
  const [resetSignal, setResetSignal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const progress = Math.min(reps / CHALLENGE_GOAL, 1)
  const remaining = Math.max(CHALLENGE_GOAL - reps, 0)

  const onJustCounted = useCallback(() => {
    playRepBeep()
    setReps((n) => {
      const next = Math.min(n + 1, CHALLENGE_GOAL)
      saveTotal(next)
      return next
    })
  }, [])

  if (!started) {
    return (
      <div className="landing">
        <div className="landing-glow" aria-hidden />
        <div className="landing-grid" aria-hidden />
        <main className="landing-main">
          <p className="brand">PULLUPS</p>
          <h1 className="tagline">1,000 pull-up challenge.</h1>
          <p className="support">
            Prop your phone so your full body and the bar are visible. Pose
            tracking runs on your device — video never leaves the browser.
          </p>
          {reps > 0 && (
            <div className="landing-progress" aria-label={`${reps} of ${CHALLENGE_GOAL}`}>
              <div className="progress-meta">
                <span>
                  {reps.toLocaleString()} / {CHALLENGE_GOAL.toLocaleString()}
                </span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ transform: `scaleX(${progress})` }}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            className="cta"
            onClick={() => {
              setError(null)
              try {
                if (!audioCtx) audioCtx = new AudioContext()
                void audioCtx.resume()
              } catch {
                // audio optional
              }
              setStarted(true)
            }}
          >
            {reps > 0 ? 'Continue' : 'Start'}
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="workout">
      <CameraView
        onRepsChange={() => {
          // Challenge total is owned by App + localStorage; ignore session counter absolute value
        }}
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
            setPhase('hang')
            setError(null)
          }}
        >
          Exit
        </button>
      </header>

      <div className="hud">
        <div className="rep-block">
          <span className="rep-label">Challenge</span>
          <span className="rep-count" key={reps}>
            {reps}
          </span>
          <div
            className="progress-wrap"
            aria-label={`${reps} of ${CHALLENGE_GOAL} pull-ups`}
          >
            <div className="progress-meta">
              <span>
                {reps.toLocaleString()} / {CHALLENGE_GOAL.toLocaleString()}
              </span>
              <span>
                {remaining === 0 ? 'Done' : `${remaining.toLocaleString()} left`}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          </div>
        </div>
        <div className={`phase-pill phase-${phase}`}>{phaseLabel(phase)}</div>
      </div>

      <footer className="workout-bottom">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setReps(0)
            saveTotal(0)
            setResetSignal((n) => n + 1)
          }}
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
