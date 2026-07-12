import { useEffect, useRef, useState, useEffectEvent } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { getPoseLandmarker, drawPose } from '../lib/pose'
import { PullupCounter, type PullupPhase } from '../lib/pullupCounter'
import './CameraView.css'

const DETECT_MS = 100 // ~10 FPS pose — enough for reps, ~70% less inference

type Props = {
  onPhaseChange: (phase: PullupPhase) => void
  onJustCounted: () => void
  resetSignal: number
  paused: boolean
  onError: (message: string) => void
}

export function CameraView({
  onPhaseChange,
  onJustCounted,
  resetSignal,
  paused,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const counterRef = useRef(new PullupCounter())
  const rafRef = useRef(0)
  const lastDetectAt = useRef(0)
  const lastVideoTime = useRef(-1)
  const lastPose = useRef<NormalizedLandmark[] | null>(null)
  const lastPhase = useRef<PullupPhase | null>(null)
  const pausedRef = useRef(paused)
  const [ready, setReady] = useState(false)

  const onFrame = useEffectEvent((pose: NormalizedLandmark[]) => {
    if (pausedRef.current) return
    const { phase, justCounted } = counterRef.current.update(pose)
    if (phase !== lastPhase.current) {
      lastPhase.current = phase
      onPhaseChange(phase)
    }
    if (justCounted) onJustCounted()
  })

  // Keep paused flag readable inside the RAF loop without restarting the camera
  useEffect(() => {
    pausedRef.current = paused
    if (paused) {
      counterRef.current.reset()
      lastPhase.current = 'hang'
      onPhaseChange('hang')
    }
  }, [paused, onPhaseChange])

  // Only reset when the user hits Reset — never on parent re-renders
  useEffect(() => {
    counterRef.current.reset()
    lastPhase.current = 'hang'
    onPhaseChange('hang')
  }, [resetSignal, onPhaseChange])

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false

    async function start() {
      try {
        const landmarker = await getPoseLandmarker()
        if (cancelled) return

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15, max: 20 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas) return

        video.srcObject = stream
        await video.play()
        setReady(true)

        // Opaque canvas so a stalled video never shows the black stage through
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) return

        const loop = () => {
          rafRef.current = requestAnimationFrame(loop)
          if (video.readyState < 2) return

          const w = video.videoWidth
          const h = video.videoHeight
          if (!w || !h) return

          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
          }

          // Always paint the camera frame first — never leave a blank screen
          ctx.drawImage(video, 0, 0, w, h)
          if (lastPose.current) {
            drawPose(ctx, lastPose.current)
          }

          const now = performance.now()
          if (now - lastDetectAt.current < DETECT_MS) return
          if (video.currentTime === lastVideoTime.current) return
          lastVideoTime.current = video.currentTime
          lastDetectAt.current = now

          const result = landmarker.detectForVideo(video, now)
          const pose = result.landmarks[0] ?? null
          lastPose.current = pose

          if (pose) {
            onFrame(pose)
          } else if (!pausedRef.current && lastPhase.current !== 'lost') {
            lastPhase.current = 'lost'
            onPhaseChange('lost')
          }
        }

        rafRef.current = requestAnimationFrame(loop)
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Could not access camera')
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onError, onPhaseChange])

  return (
    <div className="camera-stage">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        autoPlay
        aria-hidden
      />
      <canvas ref={canvasRef} className="camera-overlay" />
      {!ready && <div className="camera-loading">Starting camera…</div>}
    </div>
  )
}
