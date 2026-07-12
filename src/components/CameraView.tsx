import { useEffect, useRef, useState, useEffectEvent } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { getPoseLandmarker, drawPose } from '../lib/pose'
import { PullupCounter, type PullupPhase } from '../lib/pullupCounter'
import './CameraView.css'

const DETECT_INTERVAL_MS = 50 // ~20 FPS inference — enough for reps, cheaper than every frame

type Props = {
  onRepsChange: (reps: number) => void
  onPhaseChange: (phase: PullupPhase) => void
  onJustCounted: () => void
  resetSignal: number
  onError: (message: string) => void
}

export function CameraView({
  onRepsChange,
  onPhaseChange,
  onJustCounted,
  resetSignal,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const counterRef = useRef(new PullupCounter())
  const rafRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const lastDetectAtRef = useRef(0)
  const lastPoseRef = useRef<NormalizedLandmark[] | null>(null)
  const lastRepsRef = useRef(-1)
  const lastPhaseRef = useRef<PullupPhase | null>(null)
  const [ready, setReady] = useState(false)

  const applyResult = useEffectEvent(
    (landmarks: NormalizedLandmark[]) => {
      const result = counterRef.current.update(landmarks)

      if (result.reps !== lastRepsRef.current) {
        lastRepsRef.current = result.reps
        onRepsChange(result.reps)
      }
      if (result.phase !== lastPhaseRef.current) {
        lastPhaseRef.current = result.phase
        onPhaseChange(result.phase)
      }
      if (result.justCounted) onJustCounted()
    },
  )

  const setPhaseIfChanged = useEffectEvent((phase: PullupPhase) => {
    if (phase !== lastPhaseRef.current) {
      lastPhaseRef.current = phase
      onPhaseChange(phase)
    }
  })

  useEffect(() => {
    counterRef.current.reset()
    lastRepsRef.current = 0
    lastPhaseRef.current = 'hang'
    onRepsChange(0)
    onPhaseChange('hang')
  }, [resetSignal, onRepsChange, onPhaseChange])

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
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
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

        // Opaque canvas so the navy page background never shows through
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

          // Always paint the camera frame first — never leave a blank/blue screen
          ctx.drawImage(video, 0, 0, w, h)
          if (lastPoseRef.current) {
            drawPose(ctx, lastPoseRef.current)
          }

          const now = performance.now()
          if (now - lastDetectAtRef.current < DETECT_INTERVAL_MS) return
          if (video.currentTime === lastVideoTimeRef.current) return
          lastVideoTimeRef.current = video.currentTime
          lastDetectAtRef.current = now

          const result = landmarker.detectForVideo(video, now)
          const pose = result.landmarks[0] ?? null
          lastPoseRef.current = pose

          if (pose) {
            applyResult(pose)
          } else {
            setPhaseIfChanged('lost')
          }
        }

        rafRef.current = requestAnimationFrame(loop)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not access camera'
        onError(message)
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [applyResult, onError, setPhaseIfChanged])

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
