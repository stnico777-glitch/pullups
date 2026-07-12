import {
  FilesetResolver,
  PoseLandmarker,
  DrawingUtils,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL)
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
      } catch {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        })
      }
    })()
  }
  return poseLandmarkerPromise
}

export function drawPose(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
): void {
  const utils = new DrawingUtils(ctx)
  utils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
    color: '#3dff9a',
    lineWidth: 3,
  })
  utils.drawLandmarks(landmarks, {
    color: '#ffffff',
    fillColor: '#0a1628',
    lineWidth: 1,
    radius: 3,
  })
}
