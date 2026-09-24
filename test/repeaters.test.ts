import { describe, expect, it } from 'vitest'
import type { HeardRepeater } from '~/utils/constants'
import { bearingDegrees, assessCoverage, discoverRequest, distanceMeters, formatDistance, isOutOfRange, parseDiscoverResponse, recordRx, recordSighting, sightings, toHex, toPosition } from '~/utils/repeaters'
import { MAX_RX_HISTORY } from '~/utils/constants'

const KEY = Uint8Array.from({ length: 32 }, (_, i) => 0xa0 + i)

function advert(flags: number, appData: number[], path: number[] = []): Uint8Array {
  // Header: flood route, advert payload. Then the path.
  return Uint8Array.from([0x11, path.length, ...path, ...KEY, ...new Array(4 + 64).fill(0), flags, ...appData])
}

function int32LE(value: number): number[] {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setInt32(0, value, true)
  return [...bytes]
}

describe('sightings', () => {
  it('reads a flood path back from the repeater in direct range', () => {
    expect(sightings(Uint8Array.from([0x15, 0x03, 0x11, 0x22, 0x33, 0xff]))).toEqual([
      { id: '11', hops: 2, via: '33' },
      { id: '22', hops: 1, via: '33' },
      { id: '33', hops: 0, via: null }
    ])
  })

  it('reads multi-byte path hashes', () => {
    expect(sightings(Uint8Array.from([0x15, 0x42, 0x11, 0x22, 0x33, 0x44, 0xff])).map(s => s.id)).toEqual(['1122', '3344'])
  })

  it('skips the transport codes', () => {
    expect(sightings(Uint8Array.from([0x14, 1, 2, 3, 4, 0x01, 0x7c, 0xff]))).toEqual([{ id: '7c', hops: 0, via: null }])
  })

  it('cannot tell who sent a direct packet', () => {
    expect(sightings(Uint8Array.from([0x0a, 0x01, 0x11, 0xff]))).toEqual([])
  })

  it('reads a repeater advert heard straight from it', () => {
    const name = [...new TextEncoder().encode('Hilltop')]
    expect(sightings(advert(0x92, [...int32LE(48_856_600), ...int32LE(2_352_200), ...name]))).toEqual([{
      id: toHex(KEY),
      hops: 0,
      via: null,
      name: 'Hilltop',
      position: { lat: 48.8566, lon: 2.3522 }
    }])
  })

  it('names a repeater advert heard through a path', () => {
    expect(sightings(advert(0x02, [], [0x11, 0x22])).at(-1)).toMatchObject({ id: toHex(KEY), hops: 2, via: '22' })
  })

  it('keeps only the path of an advert from another node type', () => {
    expect(sightings(advert(0x81, [0x41], [0x22]))).toEqual([{ id: '22', hops: 0, via: null }])
  })

  it('stops at an advert cut short before its position', () => {
    expect(sightings(advert(0x12, [1, 2, 3], [0x22]))).toEqual([{ id: '22', hops: 0, via: null }])
  })
})

describe('discoverRequest', () => {
  it('asks repeaters for their full key', () => {
    expect([...discoverRequest(0x01020304)]).toEqual([55, 0x80, 0x04, 0x04, 0x03, 0x02, 0x01])
  })
})

describe('parseDiscoverResponse', () => {
  it('reads both directions of the link', () => {
    const frame = Uint8Array.from([0x8e, 0xd6, 0x9c, 0x00, 0x92, 0x37, 0x04, 0x03, 0x02, 0x01, ...KEY])
    expect(parseDiscoverResponse(frame)).toEqual({ id: toHex(KEY), tag: 0x01020304, txSnr: 13.75, rxSnr: -10.5, rxRssi: -100 })
  })

  it('ignores other frames', () => {
    expect(parseDiscoverResponse(Uint8Array.from([0x88, 0, 0, 0]))).toBeNull()
  })
})

describe('recordSighting', () => {
  it('upgrades a path hash to the full key', () => {
    const list: HeardRepeater[] = []
    recordSighting(list, { id: 'a0', hops: 0, via: null }, 1)
    recordSighting(list, { id: toHex(KEY), hops: 0, via: null }, 2)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: toHex(KEY), lastHeard: 2 })
  })

  it('keeps the shortest route', () => {
    const list: HeardRepeater[] = []
    recordSighting(list, { id: '11', hops: 1, via: '33' }, 1)
    recordSighting(list, { id: '11', hops: 2, via: '44' }, 2)
    expect(list[0]).toMatchObject({ hops: 1, via: '33', lastHeard: 2 })
  })

  it('skips a hash shared by two repeaters', () => {
    const list: HeardRepeater[] = []
    recordSighting(list, { id: 'a0b1', hops: 0, via: null }, 1)
    recordSighting(list, { id: 'a0c2', hops: 0, via: null }, 1)
    expect(recordSighting(list, { id: 'a0', hops: 0, via: null }, 2)).toBeNull()
  })
})

describe('assessCoverage', () => {
  it('has none with nothing in direct range', () => {
    expect(assessCoverage([]).level).toBe('none')
  })

  it('stays fair with one strong repeater and no fallback', () => {
    expect(assessCoverage([{ rx: 25, tx: 25 }]).level).toBe('fair')
  })

  it('is good with two usable repeaters, one solid, both confirmed', () => {
    expect(assessCoverage([{ rx: 12, tx: 11 }, { rx: 7, tx: 6 }, { rx: 1, tx: null }])).toEqual({
      level: 'good',
      reason: 'confirmed',
      usable: 2,
      confirmed: 2,
      solid: 1,
      unconfirmed: 0
    })
  })

  it('counts the usable repeaters not scanned yet apart', () => {
    expect(assessCoverage([{ rx: 12, tx: 11 }, { rx: 7, tx: 6 }, { rx: 14, tx: null }])).toMatchObject({
      reason: 'confirmed',
      usable: 3,
      confirmed: 2,
      unconfirmed: 1
    })
  })

  it('stays fair until a scan confirms they hear us', () => {
    expect(assessCoverage([{ rx: 12, tx: null }, { rx: 7, tx: null }]).level).toBe('fair')
  })

  it('stays fair with usable repeaters but none solid', () => {
    expect(assessCoverage([{ rx: 7, tx: 6 }, { rx: 8, tx: 5 }])).toMatchObject({ level: 'fair', reason: 'none-solid', usable: 2 })
  })

  it('judges a link by its weaker way', () => {
    expect(assessCoverage([{ rx: 15, tx: 3 }, { rx: 12, tx: 2 }]).level).toBe('weak')
  })
})

describe('positions', () => {
  const paris = { lat: 48.8566, lon: 2.3522 }
  const lyon = { lat: 45.764, lon: 4.8357 }

  it('treats 0,0 as no position', () => {
    expect(toPosition(0, 0)).toBeNull()
  })

  it('rejects coordinates off the globe', () => {
    expect(toPosition(500_000_000, 2_000_000)).toBeNull()
    expect(toPosition(48_000_000, -200_000_000)).toBeNull()
  })

  it('shows metres under a kilometre', () => {
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(12_340)).toBe('12.3 km')
    expect(formatDistance(12_340, 'fr-FR')).toBe('12,3 km')
  })

  it('measures the great-circle distance', () => {
    expect(distanceMeters(paris, lyon) / 1000).toBeCloseTo(391.5, 1)
  })

  it('gives the bearing from north', () => {
    expect(bearingDegrees(paris, lyon)).toBeCloseTo(150.5, 1)
  })
})

describe('recordRx', () => {
  it('keeps the latest samples only', () => {
    const list: HeardRepeater[] = []
    const repeater = recordSighting(list, { id: 'a0', hops: 0, via: null }, 0)!
    for (let at = 0; at < MAX_RX_HISTORY + 5; at++) recordRx(repeater, { snr: 1, rssi: -90, at })
    expect(repeater.history).toHaveLength(MAX_RX_HISTORY)
    expect(repeater.history[0]!.at).toBe(5)
    expect(repeater.rx?.at).toBe(MAX_RX_HISTORY + 4)
  })
})

describe('isOutOfRange', () => {
  const heard = ({ hops = 0, rx = null as number | null, tx = 1000 as number | null, lastHeard = 1000 } = {}) => ({
    id: 'a0',
    name: null,
    position: null,
    hops,
    via: null,
    rx: rx === null ? null : { snr: 5, rssi: -90, at: rx },
    history: [],
    tx: tx === null ? null : { snr: 5, at: tx },
    lastHeard
  })

  it('keeps everything before a full scan', () => {
    expect(isOutOfRange(heard(), null)).toBe(false)
  })

  it('drops a direct repeater not heard directly since the last scan started', () => {
    expect(isOutOfRange(heard({ tx: 1000 }), 2000)).toBe(true)
    expect(isOutOfRange(heard({ tx: 2500 }), 2000)).toBe(false)
    expect(isOutOfRange(heard({ tx: 1000, rx: 2500 }), 2000)).toBe(false)
  })

  it('does not count being named in a relayed path', () => {
    expect(isOutOfRange(heard({ tx: 1000, lastHeard: 2500 }), 2000)).toBe(true)
  })

  it('leaves alone repeaters that never answered a scan', () => {
    expect(isOutOfRange(heard({ tx: null, rx: 1000 }), 2000)).toBe(false)
  })

  it('leaves relayed repeaters alone, they never answer a scan', () => {
    expect(isOutOfRange(heard({ hops: 2 }), 2000)).toBe(false)
  })
})
