export type Landmark = { x: number; y: number; z: number; visibility?: number }

export type PullupPhase = 'hang' | 'pull' | 'lost'

export type PullupResult = {
  phase: PullupPhase
  reps: number
  elbowAngle: number
  chinOverBar: boolean
  justCounted: boolean
}

// MediaPipe landmark indices
const NOSE = 0
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12
const LEFT_ELBOW = 13
const RIGHT_ELBOW = 14
const LEFT_WRIST = 15
const RIGHT_WRIST = 16

const UP_ELBOW_MAX = 100 // degrees — bent enough at top
const DOWN_ELBOW_MIN = 145 // degrees — extended enough at hang
const CHIN_OVER_MARGIN = 0.02 // nose above wrists (y decreases upward)
const MIN_VISIBILITY = 0.5
const DEBOUNCE_MS = 400

function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x
  const aby = a.y - b.y
  const cbx = c.x - b.x
  const cby = c.y - b.y
  const dot = abx * cbx + aby * cby
  const magAB = Math.hypot(abx, aby)
  const magCB = Math.hypot(cbx, cby)
  if (magAB === 0 || magCB === 0) return 180
  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)))
  return (Math.acos(cos) * 180) / Math.PI
}

function visible(lm: Landmark | undefined): boolean {
  if (!lm) return false
  if (lm.visibility === undefined) return true
  return lm.visibility >= MIN_VISIBILITY
}

export class PullupCounter {
  private reps = 0
  private phase: PullupPhase = 'hang'
  private lastCountAt = 0
  private reachedTop = false

  reset(): void {
    this.reps = 0
    this.phase = 'hang'
    this.lastCountAt = 0
    this.reachedTop = false
  }

  getReps(): number {
    return this.reps
  }

  update(landmarks: Landmark[], now = performance.now()): PullupResult {
    const nose = landmarks[NOSE]
    const lShoulder = landmarks[LEFT_SHOULDER]
    const rShoulder = landmarks[RIGHT_SHOULDER]
    const lElbow = landmarks[LEFT_ELBOW]
    const rElbow = landmarks[RIGHT_ELBOW]
    const lWrist = landmarks[LEFT_WRIST]
    const rWrist = landmarks[RIGHT_WRIST]

    const coreOk =
      visible(nose) &&
      visible(lShoulder) &&
      visible(rShoulder) &&
      visible(lElbow) &&
      visible(rElbow) &&
      visible(lWrist) &&
      visible(rWrist)

    if (!coreOk) {
      this.phase = 'lost'
      return {
        phase: 'lost',
        reps: this.reps,
        elbowAngle: 0,
        chinOverBar: false,
        justCounted: false,
      }
    }

    const leftAngle = angleDeg(lShoulder!, lElbow!, lWrist!)
    const rightAngle = angleDeg(rShoulder!, rElbow!, rWrist!)
    const elbowAngle = (leftAngle + rightAngle) / 2

    const wristY = (lWrist!.y + rWrist!.y) / 2
    const chinOverBar = nose!.y < wristY - CHIN_OVER_MARGIN

    const atTop = chinOverBar && elbowAngle < UP_ELBOW_MAX
    const atHang = !chinOverBar && elbowAngle > DOWN_ELBOW_MIN

    let justCounted = false

    if (atTop) {
      this.phase = 'pull'
      this.reachedTop = true
    } else if (atHang) {
      if (this.reachedTop && now - this.lastCountAt > DEBOUNCE_MS) {
        this.reps += 1
        this.lastCountAt = now
        this.reachedTop = false
        justCounted = true
      }
      this.phase = 'hang'
    } else if (this.phase !== 'lost') {
      // mid-rep transition — keep current phase label
      this.phase = this.reachedTop ? 'pull' : 'hang'
    }

    return {
      phase: this.phase,
      reps: this.reps,
      elbowAngle,
      chinOverBar,
      justCounted,
    }
  }
}
