export type Landmark = { x: number; y: number; z?: number; visibility?: number }

export type PullupPhase = 'hang' | 'pull' | 'lost'

export type PullupResult = {
  phase: PullupPhase
  justCounted: boolean
}

const NOSE = 0
const L_SHOULDER = 11
const R_SHOULDER = 12
const L_ELBOW = 13
const R_ELBOW = 14
const L_WRIST = 15
const R_WRIST = 16

// Head vs bar (wrists). y grows downward.
const TOP_OFFSET = 0.04 // nose near / above wrists → top
const HANG_OFFSET = 0.14 // nose clearly below wrists → hang
const MIN_VIS = 0.25
const DEBOUNCE_MS = 350

function ok(lm: Landmark | undefined): lm is Landmark {
  return !!lm && (lm.visibility === undefined || lm.visibility >= MIN_VIS)
}

function elbowAngle(shoulder: Landmark, elbow: Landmark, wrist: Landmark): number {
  const abx = shoulder.x - elbow.x
  const aby = shoulder.y - elbow.y
  const cbx = wrist.x - elbow.x
  const cby = wrist.y - elbow.y
  const den = Math.hypot(abx, aby) * Math.hypot(cbx, cby)
  if (den === 0) return 180
  const cos = Math.min(1, Math.max(-1, (abx * cbx + aby * cby) / den))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Count a rep when you reach the top, then return to a hang.
 * Primary signal: nose vs wrist height. Elbow bend is a soft assist only.
 */
export class PullupCounter {
  private phase: PullupPhase = 'hang'
  private reachedTop = false
  private lastCountAt = 0

  reset(): void {
    this.phase = 'hang'
    this.reachedTop = false
    this.lastCountAt = 0
  }

  update(lm: Landmark[], now = performance.now()): PullupResult {
    const nose = lm[NOSE]
    const arms = [
      [lm[L_SHOULDER], lm[L_ELBOW], lm[L_WRIST]] as const,
      [lm[R_SHOULDER], lm[R_ELBOW], lm[R_WRIST]] as const,
    ].filter(([s, e, w]) => ok(s) && ok(e) && ok(w))

    if (!ok(nose) || arms.length === 0) {
      this.phase = 'lost'
      return { phase: 'lost', justCounted: false }
    }

    let wristY = 0
    let bent = 180
    for (const [s, e, w] of arms) {
      wristY += w!.y
      bent = Math.min(bent, elbowAngle(s!, e!, w!))
    }
    wristY /= arms.length

    // How far the head is below the bar (negative = above bar)
    const belowBar = nose.y - wristY
    const atTop = belowBar < TOP_OFFSET || bent < 115
    const atHang = belowBar > HANG_OFFSET && bent > 135

    let justCounted = false

    if (atTop) {
      this.reachedTop = true
      this.phase = 'pull'
    } else if (atHang) {
      if (this.reachedTop && now - this.lastCountAt > DEBOUNCE_MS) {
        this.reachedTop = false
        this.lastCountAt = now
        justCounted = true
      }
      this.phase = 'hang'
    } else {
      this.phase = this.reachedTop ? 'pull' : 'hang'
    }

    return { phase: this.phase, justCounted }
  }
}
