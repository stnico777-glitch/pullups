import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

// Only the joints we care about — skip full-body DrawingUtils
const DRAW_IDX = [0, 11, 12, 13, 14, 15, 16]
const DRAW_BONES: [number, number][] = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 12],
]

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
