import { useEffect, useRef, useState, useEffectEvent } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { drawPose } from '../lib/pose'
import { PullupCounter, type PullupPhase } from '../lib/pullupCounter'
import PoseWorker from '../lib/pose.worker?worker'
import './CameraView.css'

const DETECT_MS = 100 // ~10 FPS pose — enough for reps

type WorkerOut =
  | { type: 'ready' }
  | { type: 'result'; landmarks: NormalizedLandmark[] | null }
  | { type: 'error'; message: string }

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
  const lastPose = useRef<NormalizedLandmark[] | null>(null)
  const lastPhase = useRef<PullupPhase | null>(null)
  const pausedRef = useRef(paused)
  const detectBusy = useRef(false)
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

  const paintOverlay = useEffectEvent(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    ctx.clearRect(0, 0, w, h)
    if (lastPose.current) drawPose(ctx, lastPose.current)
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
    let worker: Worker | null = null

    async function start() {
      try {
        worker = new PoseWorker()

        const readyPromise = new Promise<void>((resolve, reject) => {
          const onMsg = (event: MessageEvent<WorkerOut>) => {
            if (event.data.type === 'ready') {
              worker?.removeEventListener('message', onMsg)
              resolve()
            } else if (event.data.type === 'error') {
              worker?.removeEventListener('message', onMsg)
              reject(new Error(event.data.message))
            }
          }
          worker!.addEventListener('message', onMsg)
          worker!.postMessage({ type: 'init' })
        })

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
        await readyPromise
        if (cancelled) return

        setReady(true)

        worker.onmessage = (event: MessageEvent<WorkerOut>) => {
          if (cancelled) return
          const data = event.data

          if (data.type === 'result') {
            detectBusy.current = false
            lastPose.current = data.landmarks
            paintOverlay()

            if (data.landmarks) {
              onFrame(data.landmarks)
            } else if (!pausedRef.current && lastPhase.current !== 'lost') {
              lastPhase.current = 'lost'
              onPhaseChange('lost')
            }
            return
          }

          if (data.type === 'error') {
            detectBusy.current = false
            // Soft-fail detection; keep camera running
            console.warn(data.message)
          }
        }

        const loop = () => {
          rafRef.current = requestAnimationFrame(loop)
          if (video.readyState < 2) return

          // Always refresh skeleton overlay; live video paints itself
          paintOverlay()

          if (detectBusy.current) return
          const now = performance.now()
          if (now - lastDetectAt.current < DETECT_MS) return
          lastDetectAt.current = now
          detectBusy.current = true

          void createImageBitmap(video)
            .then((bitmap) => {
              if (cancelled || !worker) {
                bitmap.close()
                detectBusy.current = false
                return
              }
              worker.postMessage(
                { type: 'detect', bitmap, timestamp: now },
                [bitmap],
              )
            })
            .catch(() => {
              detectBusy.current = false
            })
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
      worker?.terminate()
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
      />
      <canvas ref={canvasRef} className="camera-overlay" />
      {!ready && <div className="camera-loading">Starting camera…</div>}
    </div>
  )
}
