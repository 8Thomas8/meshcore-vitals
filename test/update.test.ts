import { describe, expect, it } from 'vitest'
import { shouldAutoReload } from '~/utils/update'

const idle = { available: true, status: 'disconnected' as const, error: false, controlled: false, reloadedFor: null, latestId: 'b2' }

describe('shouldAutoReload', () => {
  it('reloads an idle page onto a new deployment', () => {
    expect(shouldAutoReload(idle)).toBe(true)
  })

  it('waits while nothing new is out', () => {
    expect(shouldAutoReload({ ...idle, available: false })).toBe(false)
  })

  it('never drops a node link', () => {
    expect(shouldAutoReload({ ...idle, status: 'connected' })).toBe(false)
    expect(shouldAutoReload({ ...idle, status: 'connecting' })).toBe(false)
  })

  it('keeps the last connection error on screen', () => {
    expect(shouldAutoReload({ ...idle, error: true })).toBe(false)
  })

  it('reloads once per deployment without a service worker', () => {
    expect(shouldAutoReload({ ...idle, reloadedFor: 'b2' })).toBe(false)
    expect(shouldAutoReload({ ...idle, reloadedFor: 'b1' })).toBe(true)
  })

  it('always switches to a waiting service worker', () => {
    expect(shouldAutoReload({ ...idle, controlled: true, reloadedFor: 'b2' })).toBe(true)
  })
})
