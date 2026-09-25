import { describe, expect, it } from 'vitest'
import type { CompanionFix } from '~/utils/constants'
import { FIX_DRIFT_M_PER_S } from '~/utils/constants'
import { isBetterFix, reachAt } from '~/utils/companion'

// About 111 m per 0.001° of latitude.
function fixOf(accuracy: number, at: number, north = 0): CompanionFix {
  return { position: { lat: 48.85 + north / 111_195, lon: 2.35 }, accuracy, at }
}

describe('reachAt', () => {
  it('grows the accuracy at walking pace as the fix ages', () => {
    expect(reachAt(fixOf(5, 10_000), 10_000)).toBe(5)
    expect(reachAt(fixOf(5, 10_000), 20_000)).toBe(5 + FIX_DRIFT_M_PER_S * 10)
  })

  it('never shrinks it', () => {
    expect(reachAt(fixOf(5, 10_000), 0)).toBe(5)
  })
})

describe('isBetterFix', () => {
  const kept = fixOf(5, 10_000)

  it('takes the first fix whatever its accuracy', () => {
    expect(isBetterFix(fixOf(2_000, 0), null)).toBe(true)
  })

  it('takes a fix at least as accurate', () => {
    expect(isBetterFix(fixOf(4, 10_000), kept)).toBe(true)
    expect(isBetterFix(fixOf(5, 10_000), kept)).toBe(true)
  })

  it('keeps a recent accurate fix over a coarse one around it', () => {
    expect(isBetterFix(fixOf(1_500, 11_000, 300), kept)).toBe(false)
    expect(isBetterFix(fixOf(50, 20_000, 30), kept)).toBe(false)
  })

  it('lets a less accurate fix in once you could have walked out of the kept one', () => {
    const later = 10_000 + 20_000
    const reach = 5 + FIX_DRIFT_M_PER_S * 20
    expect(isBetterFix(fixOf(reach, later), kept)).toBe(true)
    expect(isBetterFix(fixOf(reach + 1, later), kept)).toBe(false)
  })

  it('follows you while you move with a steady accuracy', () => {
    expect(isBetterFix(fixOf(6, 11_000, 1.4), kept)).toBe(true)
  })

  it('follows you faster than a walk once the fixes cannot both be right', () => {
    expect(isBetterFix(fixOf(16, 11_000, 25), kept)).toBe(true)
    expect(isBetterFix(fixOf(16, 11_000, 20), kept)).toBe(false)
  })

  it('ignores a fix with no usable accuracy, and replaces a kept one', () => {
    expect(isBetterFix(fixOf(Number.NaN, 11_000), kept)).toBe(false)
    expect(isBetterFix(fixOf(50, 11_000), fixOf(Number.NaN, 10_000))).toBe(true)
  })
})
