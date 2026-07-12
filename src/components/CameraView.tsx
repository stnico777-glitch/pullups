import { useEffect, useRef, useState, useEffectEvent } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { getPoseLandmarker, drawPose } from '../lib/pose'
import { PullupCounter, type PullupPhase } from '../lib/pullupCounter'
import './CameraView.css'

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
  const [ready, setReady] = useState(false)

  const handleFrame = useEffectEvent(
    (landmarks: NormalizedLandmark[], ctx: CanvasRenderingContext2D) => {
      drawPose(ctx, landmarks)
      const result = counterRef.current.update(landmarks)
      onRepsChange(result.reps)
      onPhaseChange(result.phase)
      if (result.justCounted) onJustCounted()
    },
  )

  useEffect(() => {
    counterRef.current.reset()
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
            width: { ideal: 1280 },
            height: { ideal: 720 },
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

        const ctx = canvas.getContext('2d')
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

          if (video.currentTime === lastVideoTimeRef.current) return
          lastVideoTimeRef.current = video.currentTime

          const result = landmarker.detectForVideo(video, performance.now())
          ctx.clearRect(0, 0, w, h)

          const pose = result.landmarks[0]
          if (pose) {
            handleFrame(pose, ctx)
          } else {
            onPhaseChange('lost')
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
  }, [handleFrame, onError, onPhaseChange])

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
