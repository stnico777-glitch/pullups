import { useState, useCallback, useRef, type CSSProperties, type PointerEvent } from 'react'
import { CameraView } from './components/CameraView'
import type { PullupPhase } from './lib/pullupCounter'
import './App.css'

const GOAL = 1000
const STORAGE_KEY = 'pullups-challenge-total'
const HUD_POS_KEY = 'pullups-hud-pos'

type HudPos = { left: number; top: number }

function loadHudPos(): HudPos | null {
  try {
    const raw = localStorage.getItem(HUD_POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as HudPos
    if (
      typeof p.left === 'number' &&
      typeof p.top === 'number' &&
      Number.isFinite(p.left) &&
      Number.isFinite(p.top)
    ) {
      return {
        left: Math.min(Math.max(p.left, 0), 100),
        top: Math.min(Math.max(p.top, 0), 100),
      }
    }
  } catch {
    // ignore
  }
  return null
}

function saveHudPos(pos: HudPos): void {
  try {
    localStorage.setItem(HUD_POS_KEY, JSON.stringify(pos))
  } catch {
    // ignore
  }
}

let audioCtx: AudioContext | null = null

function loadTotal(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY) || 0)
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), GOAL) : 0
  } catch {
    return 0
  }
}

function saveTotal(n: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(n))
  } catch {
    // ignore
  }
}

function playRepBeep() {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12)
    osc.stop(audioCtx.currentTime + 0.12)
    void audioCtx.resume()
  } catch {
    // optional
  }
}

function phaseLabel(phase: PullupPhase, paused: boolean): string {
  if (paused) return 'Paused'
  if (phase === 'lost') return 'Step into frame'
  if (phase === 'pull') return 'Pull'
  return 'Hang'
}

export default function App() {
  const [started, setStarted] = useState(false)
  const [reps, setReps] = useState(loadTotal)
  const [phase, setPhase] = useState<PullupPhase>('hang')
  const [paused, setPaused] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [hudPos, setHudPos] = useState<HudPos | null>(loadHudPos)
  const [hudDragging, setHudDragging] = useState(false)
  const hudRef = useRef<HTMLDivElement>(null)
  const hudPosRef = useRef<HudPos | null>(hudPos)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null>(null)

  const progress = Math.min(reps / GOAL, 1)
  const remaining = Math.max(GOAL - reps, 0)

  const onPhaseChange = useCallback((p: PullupPhase) => setPhase(p), [])
  const onError = useCallback((msg: string) => setError(msg), [])
  const onJustCounted = useCallback(() => {
    playRepBeep()
    setReps((n) => {
      const next = Math.min(n + 1, GOAL)
      saveTotal(next)
      return next
    })
  }, [])

  const clampHudPos = useCallback((left: number, top: number): HudPos => {
    const el = hudRef.current
    const wPct = el ? (el.offsetWidth / window.innerWidth) * 100 : 30
    const hPct = el ? (el.offsetHeight / window.innerHeight) * 100 : 30
    return {
      left: Math.min(Math.max(left, 0), Math.max(100 - wPct, 0)),
      top: Math.min(Math.max(top, 0), Math.max(100 - hPct, 0)),
    }
  }, [])

  const onHudPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const el = hudRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const originLeft =
        hudPosRef.current?.left ?? (rect.left / window.innerWidth) * 100
      const originTop =
        hudPosRef.current?.top ?? (rect.top / window.innerHeight) * 100
      const seeded = { left: originLeft, top: originTop }
      hudPosRef.current = seeded
      setHudPos(seeded)
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originLeft,
        originTop,
      }
      setHudDragging(true)
      el.setPointerCapture(e.pointerId)
    },
    [],
  )

  const onHudPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const dx = ((e.clientX - drag.startX) / window.innerWidth) * 100
      const dy = ((e.clientY - drag.startY) / window.innerHeight) * 100
      const next = clampHudPos(drag.originLeft + dx, drag.originTop + dy)
      hudPosRef.current = next
      setHudPos(next)
    },
    [clampHudPos],
  )

  const onHudPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      dragRef.current = null
      setHudDragging(false)
      if (hudPosRef.current) saveHudPos(hudPosRef.current)
      try {
        hudRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        // already released
      }
    },
    [],
  )

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
            <div className="landing-progress" aria-label={`${reps} of ${GOAL}`}>
              <div className="progress-meta">
                <span>
                  {reps.toLocaleString()} / {GOAL.toLocaleString()}
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
                // optional
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
        onPhaseChange={onPhaseChange}
        onJustCounted={onJustCounted}
        resetSignal={resetSignal}
        paused={paused}
        onError={onError}
      />

      <header className="workout-top">
        <span className="workout-brand">PULLUPS</span>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            setStarted(false)
            setPaused(false)
            setPhase('hang')
            setError(null)
          }}
        >
          Exit
        </button>
      </header>

      <div
        ref={hudRef}
        className={`hud${hudPos ? ' hud-placed' : ''}${hudDragging ? ' hud-dragging' : ''}`}
        style={
          hudPos
            ? ({
                '--hud-left': `${hudPos.left}%`,
                '--hud-top': `${hudPos.top}%`,
              } as CSSProperties)
            : undefined
        }
        onPointerDown={onHudPointerDown}
        onPointerMove={onHudPointerMove}
        onPointerUp={onHudPointerUp}
        onPointerCancel={onHudPointerUp}
        role="group"
        aria-label="Challenge counter — drag to move"
      >
        <div className="rep-block">
          <span className="rep-label">Challenge</span>
          <span className="rep-count" key={reps}>
            {reps}
          </span>
          <div
            className="progress-wrap"
            aria-label={`${reps} of ${GOAL} pull-ups`}
          >
            <div className="progress-meta">
              <span>
                {reps.toLocaleString()} / {GOAL.toLocaleString()}
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
        <div
          className={`phase-pill phase-${paused ? 'paused' : phase}`}
        >
          {phaseLabel(phase, paused)}
        </div>
      </div>

      <footer className="workout-bottom">
        <div className="workout-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setReps(0)
              saveTotal(0)
              setPaused(false)
              setResetSignal((n) => n + 1)
            }}
          >
            Reset
          </button>
        </div>
        <p className="tip">
          {paused
            ? 'Counting paused — camera stays on'
            : 'Keep your head and at least one arm in view'}
        </p>
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
              setPaused(false)
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
