import { FIX_DRIFT_M_PER_S } from './constants'
import type { CompanionFix } from './constants'
import { distanceMeters } from './repeaters'

// Metres, as you may have walked away from the fix since.
export function reachAt(fix: CompanionFix, at: number): number {
  return fix.accuracy + FIX_DRIFT_M_PER_S * Math.max(0, at - fix.at) / 1000
}

// Phones mix precise GPS fixes with coarse ones from Wi-Fi or cell towers. A
// fix too far from the kept one for both to be right means you moved faster.
export function isBetterFix(next: CompanionFix, kept: CompanionFix | null): boolean {
  if (!Number.isFinite(next.accuracy)) return false
  if (!kept || !Number.isFinite(kept.accuracy)) return true
  const reach = reachAt(kept, next.at)
  return next.accuracy <= reach || distanceMeters(kept.position, next.position) > reach + next.accuracy
}
