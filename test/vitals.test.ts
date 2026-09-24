import { describe, expect, it } from 'vitest'
import { airtimeShare, batteryLevel, formatCountdown, formatDuration, formatElapsed, linkMargin, formatNumber, formatOffset, parseDeviceInfo, receiveErrorRate, sessionErrors, snrFloor } from '~/utils/vitals'

const packets = {
  recv: 2185,
  sent: 50,
  nSentFlood: 34,
  nSentDirect: 16,
  nRecvFlood: 2066,
  nRecvDirect: 119,
  nRecvErrors: 308
}

describe('receiveErrorRate', () => {
  it('counts errors against everything the radio decoded or failed to', () => {
    expect(receiveErrorRate(packets)).toBeCloseTo(308 / 2493)
  })

  it('is unknown before any packet', () => {
    expect(receiveErrorRate({ ...packets, recv: 0, nRecvErrors: 0 })).toBeNull()
  })
})

describe('airtimeShare', () => {
  it('divides airtime by uptime', () => {
    expect(airtimeShare(23, 278750)).toBeCloseTo(0.0000825)
  })

  it('is unknown right after boot', () => {
    expect(airtimeShare(0, 0)).toBeNull()
  })
})

describe('snrFloor', () => {
  it('follows the LoRa demodulation floor', () => {
    expect(snrFloor(7)).toBe(-7.5)
    expect(snrFloor(8)).toBe(-10)
    expect(snrFloor(12)).toBe(-20)
  })
})

describe('batteryLevel', () => {
  it('maps 3.0 to 4.2 V onto 0 to 1', () => {
    expect(batteryLevel(3600)).toBeCloseTo(0.5)
  })

  it('clamps outside the cell range', () => {
    expect(batteryLevel(2800)).toBe(0)
    expect(batteryLevel(4350)).toBe(1)
  })
})

describe('formatNumber', () => {
  it('groups thousands the way the language does', () => {
    expect(formatNumber(18342)).toBe('18,342')
    expect(formatNumber(18342, 0, 0, 'fr-FR')).toBe('18\u202F342')
  })

  it('uses a real minus sign', () => {
    expect(formatNumber(-112)).toBe('−112')
  })

  it('pads to the requested decimals', () => {
    expect(formatNumber(4.2, 2)).toBe('4.20')
    expect(formatNumber(-10, 1, 0)).toBe('−10')
    expect(formatNumber(-7.5, 1, 0)).toBe('−7.5')
    expect(formatNumber(-7.5, 1, 0, 'fr-FR')).toBe('−7,5')
  })
})

describe('formatDuration', () => {
  it('shows days and hours past a day', () => {
    expect(formatDuration(278750)).toBe('3 d 5 h')
  })

  it('shows hours and minutes under a day', () => {
    expect(formatDuration(3720)).toBe('1 h 2 min')
  })

  it('shows minutes under an hour', () => {
    expect(formatDuration(59)).toBe('0 min')
  })
})

describe('parseDeviceInfo', () => {
  const info = { firmwareVer: 8, reserved: new Uint8Array(6), firmware_build_date: '19 Feb 2025', manufacturerModel: '' }

  it('splits the model from the NUL-padded version', () => {
    expect(parseDeviceInfo({ ...info, manufacturerModel: 'Heltec V3\0\0\0v1.9.1\0\0' }))
      .toEqual({ model: 'Heltec V3', version: 'v1.9.1', buildDate: '19 Feb 2025' })
  })

  it('has no version on older firmware', () => {
    expect(parseDeviceInfo({ ...info, manufacturerModel: 'Heltec V3' }).version).toBeNull()
  })
})

describe('sessionErrors', () => {
  const first = { at: 0, recv: 1000, sent: 100, errors: 50, txAirSecs: 10 }

  it('is unknown under a minute', () => {
    expect(sessionErrors(first, { ...first, at: 30000 })).toBeNull()
  })

  it('is unknown with nothing heard since', () => {
    expect(sessionErrors(first, { ...first, at: 600000 })).toBeNull()
  })

  it('rates the receive errors over the session', () => {
    expect(sessionErrors(first, { at: 600000, recv: 1190, sent: 120, errors: 60, txAirSecs: 16 })).toEqual({ rate: 0.05, errors: 10 })
  })
})

describe('formatOffset', () => {
  it('signs small offsets in seconds', () => {
    expect(formatOffset(4.4)).toBe('+4 s')
    expect(formatOffset(-12)).toBe('−12 s')
  })

  it('switches to minutes past a minute', () => {
    expect(formatOffset(-600)).toBe('−10 min')
  })
})

describe('formatCountdown', () => {
  it('shows minutes and padded seconds, rounding up', () => {
    expect(formatCountdown(102_400)).toBe('1:43')
    expect(formatCountdown(5_000)).toBe('0:05')
  })

  it('stops at zero', () => {
    expect(formatCountdown(-3_000)).toBe('0:00')
  })
})

describe('linkMargin', () => {
  it('measures from the floor of the spreading factor', () => {
    expect(linkMargin(0, 8)).toMatchObject({ value: 10, tone: 'success', grade: 'comfortable' })
    expect(linkMargin(-5, 8)).toMatchObject({ value: 5, tone: 'warning', grade: 'fair' })
    expect(linkMargin(-6, 8)).toMatchObject({ value: 4, tone: 'error', grade: 'tight' })
  })
})

describe('formatElapsed', () => {
  it('counts seconds, then minutes', () => {
    expect(formatElapsed(0, 59_900)).toBe('59 s')
    expect(formatElapsed(0, 125_000)).toBe('2 min')
  })

  it('does not go negative on a clock skew', () => {
    expect(formatElapsed(5_000, 0)).toBe('0 s')
  })

  it('takes the units of the language', () => {
    expect(formatElapsed(0, 2 * 86_400_000, { day: 'j', hour: 'h', minute: 'min', second: 's' })).toBe('2 j 0 h')
  })
})
