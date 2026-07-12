/// <reference lib="webworker" />
import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

type InMsg =
  | { type: 'init' }
  | { type: 'detect'; bitmap: ImageBitmap; timestamp: number }

type OutMsg =
  | { type: 'ready' }
  | { type: 'result'; landmarks: NormalizedLandmark[] | null }
  | { type: 'error'; message: string }

let landmarker: PoseLandmarker | null = null
let initPromise: Promise<void> | null = null

async function ensureLandmarker(): Promise<PoseLandmarker> {
  if (landmarker) return landmarker
  if (!initPromise) {
    initPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      const opts = {
        runningMode: 'VIDEO' as const,
        numPoses: 1,
      }
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          ...opts,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        })
      } catch {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          ...opts,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        })
      }
    })()
  }
  await initPromise
  return landmarker!
}

function post(msg: OutMsg) {
  self.postMessage(msg)
}

self.onmessage = (event: MessageEvent<InMsg>) => {
  const data = event.data
  if (data.type === 'init') {
    void ensureLandmarker()
      .then(() => post({ type: 'ready' }))
      .catch((err: unknown) =>
        post({
          type: 'error',
          message:
            err instanceof Error ? err.message : 'Could not load pose model',
        }),
      )
    return
  }

  if (data.type === 'detect') {
    const { bitmap, timestamp } = data
    void ensureLandmarker()
      .then((lm) => {
        const result = lm.detectForVideo(bitmap, timestamp)
        bitmap.close()
        post({ type: 'result', landmarks: result.landmarks[0] ?? null })
      })
      .catch((err: unknown) => {
        try {
          bitmap.close()
        } catch {
          // already closed
        }
        post({
          type: 'error',
          message: err instanceof Error ? err.message : 'Pose detect failed',
        })
      })
  }
}
