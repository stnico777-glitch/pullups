import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

// Only the joints we care about — skip full-body DrawingUtils
const DRAW_IDX = [0, 11, 12, 13, 14, 15, 16]
const DRAW_BONES: [number, number][] = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 12],
]

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      const opts = {
        runningMode: 'VIDEO' as const,
        numPoses: 1,
      }
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          ...opts,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        })
      } catch {
        return await PoseLandmarker.createFromOptions(vision, {
          ...opts,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        })
      }
    })()
  }
  return poseLandmarkerPromise
}

/** Lightweight skeleton — ~10x cheaper than MediaPipe DrawingUtils */
export function drawPose(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
): void {
  const w = ctx.canvas.width
  const h = ctx.canvas.height

  ctx.strokeStyle = '#3dff9a'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'

  ctx.beginPath()
  for (const [a, b] of DRAW_BONES) {
    const pa = landmarks[a]
    const pb = landmarks[b]
    if (!pa || !pb) continue
    ctx.moveTo(pa.x * w, pa.y * h)
    ctx.lineTo(pb.x * w, pb.y * h)
  }
  ctx.stroke()

  for (const i of DRAW_IDX) {
    const p = landmarks[i]
    if (!p) continue
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
