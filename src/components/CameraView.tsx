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
  onError: (message: string) => void
}

export function CameraView({
  onPhaseChange,
  onJustCounted,
  resetSignal,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const counterRef = useRef(new PullupCounter())
  const rafRef = useRef(0)
  const lastDetectAt = useRef(0)
  const lastPhase = useRef<PullupPhase | null>(null)
  const [ready, setReady] = useState(false)

  const onFrame = useEffectEvent((pose: NormalizedLandmark[]) => {
    const { phase, justCounted } = counterRef.current.update(pose)
    if (phase !== lastPhase.current) {
      lastPhase.current = phase
      onPhaseChange(phase)
    }
    if (justCounted) onJustCounted()
  })

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

        const ctx = canvas.getContext('2d', { alpha: true })
        if (!ctx) return

        let lastTime = -1

        const loop = () => {
          rafRef.current = requestAnimationFrame(loop)
          if (video.readyState < 2) return

          const now = performance.now()
          if (now - lastDetectAt.current < DETECT_MS) return
          if (video.currentTime === lastTime) return
          lastTime = video.currentTime
          lastDetectAt.current = now

          const w = video.videoWidth
          const h = video.videoHeight
          if (!w || !h) return

          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
          }

          const result = landmarker.detectForVideo(video, now)
          ctx.clearRect(0, 0, w, h)

          const pose = result.landmarks[0]
          if (pose) {
            drawPose(ctx, pose)
            onFrame(pose)
          } else if (lastPhase.current !== 'lost') {
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
  }, [onError, onFrame, onPhaseChange])

  return (
    <div className="camera-stage">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="camera-overlay" />
      {!ready && <div className="camera-loading">Starting camera…</div>}
    </div>
  )
}
