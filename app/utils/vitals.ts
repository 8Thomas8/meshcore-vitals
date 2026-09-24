import { BATTERY_EMPTY_MV, BATTERY_FULL_MV, DEFAULT_LANGUAGE, MARGIN_COMFORTABLE_DB, MARGIN_FAIR_DB, MIN_SESSION_MINUTES } from './constants'
import type { CounterSample, DeviceSummary } from './constants'

export function receiveErrorRate(packets: MeshCoreStatsPackets): number | null {
  const total = packets.recv + packets.nRecvErrors
  return total ? packets.nRecvErrors / total : null
}

export function airtimeShare(airSecs: number, uptimeSecs: number): number | null {
  return uptimeSecs ? airSecs / uptimeSecs : null
}

// Lowest SNR a LoRa receiver can still demodulate, in dB: -7.5 at SF7, then
// 2.5 dB lower for each spreading factor step.
export function snrFloor(spreadingFactor: number): number {
  return -2.5 * (spreadingFactor - 4)
}

// How far above the demodulation floor a packet came in.
export function linkMargin(snr: number, spreadingFactor: number) {
  const value = snr - snrFloor(spreadingFactor)
  if (value >= MARGIN_COMFORTABLE_DB) return { value, tone: 'success', grade: 'comfortable' } as const
  if (value >= MARGIN_FAIR_DB) return { value, tone: 'warning', grade: 'fair' } as const
  return { value, tone: 'error', grade: 'tight' } as const
}

export type LinkMargin = ReturnType<typeof linkMargin>

// Linear between an empty and a full cell. Rough, the real discharge curve is
// flat in the middle.
export function batteryLevel(milliVolts: number): number {
  return Math.min(1, Math.max(0, (milliVolts - BATTERY_EMPTY_MV) / (BATTERY_FULL_MV - BATTERY_EMPTY_MV)))
}

const numberFormats = new Map<string, Intl.NumberFormat>()

// Separators follow the language (1,842.5 in English, 1 842,5 in French),
// the minus sign is always a true minus.
export function formatNumber(value: number, maxDecimals = 0, minDecimals = maxDecimals, locale = DEFAULT_LANGUAGE): string {
  const key = `${locale}|${maxDecimals}|${minDecimals}`
  let format = numberFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: maxDecimals, minimumFractionDigits: minDecimals })
    numberFormats.set(key, format)
  }
  return format.format(value).replace('-', '−')
}

export interface DurationUnits {
  day: string
  hour: string
  minute: string
  second: string
}

// The abbreviations change with the language, English by default.
export const DURATION_UNITS: DurationUnits = { day: 'd', hour: 'h', minute: 'min', second: 's' }

export function formatDuration(totalSecs: number, units = DURATION_UNITS): string {
  const days = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const minutes = Math.floor((totalSecs % 3600) / 60)
  if (days) return `${days} ${units.day} ${hours} ${units.hour}`
  if (hours) return `${hours} ${units.hour} ${minutes} ${units.minute}`
  return `${minutes} ${units.minute}`
}

// Time since, without the words around it, which depend on the language.
export function formatElapsed(at: number, now: number, units = DURATION_UNITS): string {
  const secs = Math.max(0, Math.floor((now - at) / 1000))
  return secs < 60 ? `${secs} ${units.second}` : formatDuration(secs, units)
}

export function formatCountdown(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

export function parseDeviceInfo(info: MeshCoreDeviceInfo): DeviceSummary {
  const [model, version] = info.manufacturerModel.split('\0').map(part => part.trim()).filter(Boolean)
  return { model: model ?? null, version: version ?? null, buildDate: info.firmware_build_date.trim() || null }
}

// Receive errors between two samples of the same boot. Unknown over too short
// a span, or with nothing heard in between.
export function sessionErrors(first: CounterSample, last: CounterSample) {
  if ((last.at - first.at) / 60000 < MIN_SESSION_MINUTES) return null
  const recv = last.recv - first.recv
  const errors = last.errors - first.errors
  return recv + errors ? { rate: errors / (recv + errors), errors } : null
}

export function formatOffset(secs: number, units = DURATION_UNITS): string {
  const sign = secs < 0 ? '−' : '+'
  const abs = Math.abs(Math.round(secs))
  return `${sign}${abs < 60 ? `${abs} ${units.second}` : formatDuration(abs, units)}`
}
