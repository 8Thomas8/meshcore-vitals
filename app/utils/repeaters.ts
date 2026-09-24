import { ADV_TYPE_REPEATER, CMD_SEND_CONTROL_DATA, COVERAGE_GOOD_USABLE, DEFAULT_LANGUAGE, MARGIN_COMFORTABLE_DB, MARGIN_FAIR_DB, MAX_RX_HISTORY, CTL_NODE_DISCOVER_REQ, CTL_NODE_DISCOVER_RESP, PUSH_CONTROL_DATA } from './constants'
import type { DeepReadonly } from 'vue'
import type { CoverageLevel, HeardRepeater, Position, RxSample } from './constants'
import { formatNumber } from './vitals'
import type { LinkMargin } from './vitals'

const ROUTE_TRANSPORT_FLOOD = 0
const ROUTE_FLOOD = 1
const ROUTE_TRANSPORT_DIRECT = 3
const PAYLOAD_ADVERT = 4

const ADVERT_HAS_POSITION = 0x10
const ADVERT_HAS_FEAT1 = 0x20
const ADVERT_HAS_FEAT2 = 0x40
const ADVERT_HAS_NAME = 0x80

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function int8(byte: number): number {
  return byte << 24 >> 24
}

// Coordinates come as degrees × 1e6, and 0,0 means the node has none. A
// forged or broken advert can carry any int32, which the map would reject.
export function toPosition(lat: number, lon: number): Position | null {
  const position = { lat: lat / 1e6, lon: lon / 1e6 }
  if (!(lat || lon) || Math.abs(position.lat) > 90 || Math.abs(position.lon) > 180) return null
  return position
}

export interface RepeaterRow {
  repeater: DeepReadonly<HeardRepeater>
  name: string
  viaName: string | null
  details: string
  /** Its own advert first, then the companion's contact. */
  position: DeepReadonly<Position> | null
  /** Metres, ground under its position. Undefined while looking up, null when unknown. */
  altitude: number | null | undefined
  /** Metres. */
  distance: number | null
  bearing: number | null
  rx: LinkMargin | null
  tx: LinkMargin | null
  /** The weaker of the two ways. */
  link: LinkMargin | null
  /** In direct range before, silent during the last scan. */
  outOfRange: boolean
}

export interface Sighting {
  id: string
  /** 0 when heard directly. */
  hops: number
  /** Id of the repeater in direct range the packet came through. */
  via: string | null
  name?: string | null
  position?: Position | null
}

// Repeaters seen in a packet the companion logged. A flood packet carries the
// hashes of the repeaters it went through: the last one is in direct range and
// the earlier ones are further away behind it. A repeater's own advert also
// names it. A direct packet drops each hop from its path as it goes, so it
// tells nothing.
export function sightings(raw: Uint8Array): Sighting[] {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const header = raw[0]!
  const route = header & 0x03
  let i = route === ROUTE_TRANSPORT_FLOOD || route === ROUTE_TRANSPORT_DIRECT ? 5 : 1
  if (raw.length <= i) return []
  const pathLen = raw[i++]!
  const hashSize = (pathLen >> 6) + 1
  const hops = pathLen & 0x3f
  const payloadStart = i + hops * hashSize
  const payload = raw.subarray(payloadStart)
  const flood = route === ROUTE_FLOOD || route === ROUTE_TRANSPORT_FLOOD
  if (!flood && hops) return []

  const path = Array.from({ length: hops }, (_, hop) => toHex(raw.subarray(i + hop * hashSize, i + (hop + 1) * hashSize)))
  const via = path.at(-1) ?? null
  const seen: Sighting[] = path.map((id, hop) => ({ id, hops: hops - 1 - hop, via: hop === hops - 1 ? null : via }))

  // Public key, timestamp and signature, then the app data.
  if ((header >> 2 & 0x0f) !== PAYLOAD_ADVERT || payload.length < 101) return seen
  const flags = payload[100]!
  if ((flags & 0x0f) !== ADV_TYPE_REPEATER) return seen
  let j = payloadStart + 101
  let position: Position | null = null
  if (flags & ADVERT_HAS_POSITION) {
    if (raw.length < j + 8) return seen
    position = toPosition(view.getInt32(j, true), view.getInt32(j + 4, true))
    j += 8
  }
  if (flags & ADVERT_HAS_FEAT1) j += 2
  if (flags & ADVERT_HAS_FEAT2) j += 2
  const name = flags & ADVERT_HAS_NAME
    ? new TextDecoder().decode(raw.subarray(j)).replace(/\0.*$/s, '').trim() || null
    : null
  return [...seen, { id: toHex(payload.subarray(0, 32)), hops, via, name, position }]
}

// Zero-hop request that asks the repeaters in range to answer with their full
// public key and how well they heard us.
export function discoverRequest(tag: number): Uint8Array {
  const frame = new Uint8Array(7)
  frame[0] = CMD_SEND_CONTROL_DATA
  frame[1] = CTL_NODE_DISCOVER_REQ
  frame[2] = 1 << ADV_TYPE_REPEATER
  new DataView(frame.buffer).setUint32(3, tag, true)
  return frame
}

export interface DiscoverResponse {
  id: string
  tag: number
  /** dB, how the repeater heard our request. */
  txSnr: number
  /** dB, how we heard its answer. */
  rxSnr: number
  /** dBm. */
  rxRssi: number
}

// The companion pushes the SNR and RSSI it measured, the path length, then the
// payload: type, the SNR × 4 the repeater measured, the tag and its key.
export function parseDiscoverResponse(frame: Uint8Array): DiscoverResponse | null {
  if (frame[0] !== PUSH_CONTROL_DATA || frame.length < 4 + 6 + 8) return null
  const payload = frame.subarray(4)
  if (payload[0] !== (CTL_NODE_DISCOVER_RESP | ADV_TYPE_REPEATER)) return null
  return {
    id: toHex(payload.subarray(6)),
    tag: new DataView(payload.buffer, payload.byteOffset).getUint32(2, true),
    txSnr: int8(payload[1]!) / 4,
    rxSnr: int8(frame[1]!) / 4,
    rxRssi: int8(frame[2]!)
  }
}

// A path hash is only the first bytes of a key, so an id matches a longer or
// shorter one it prefixes. Returns null when the id could be several repeaters.
export function recordSighting(list: HeardRepeater[], sighting: Sighting, at: number): HeardRepeater | null {
  const { id, hops, via, name, position } = sighting
  const matches = list.filter(repeater => repeater.id.startsWith(id) || id.startsWith(repeater.id))
  if (matches.length > 1) return null
  let repeater = matches[0]
  if (!repeater) {
    list.push({ id, name: null, position: null, hops, via, rx: null, history: [], tx: null, lastHeard: at })
    // Read back, a reactive list hands out its proxy.
    repeater = list.at(-1)!
  }
  if (id.length > repeater.id.length) repeater.id = id
  // The shortest route is the one that counts.
  if (hops <= repeater.hops) {
    repeater.hops = hops
    repeater.via = via
  }
  if (name) repeater.name = name
  if (position) repeater.position = position
  repeater.lastHeard = at
  return repeater
}

export interface DirectLink {
  /** dB above the floor, how we hear it. */
  rx: number
  /** dB above the floor, how it hears us, null until a scan measures it. */
  tx: number | null
}

/** Why the coverage got its level, the words depend on the language. */
export type CoverageReason = 'nothing-heard' | 'confirmed' | 'unconfirmed' | 'none-solid' | 'single' | 'weak'

export interface Coverage {
  level: CoverageLevel
  reason: CoverageReason
  /** Links above the fair margin both ways, or on reception while unscanned. */
  usable: number
  /** Usable links a scan confirmed both ways. */
  confirmed: number
  /** Confirmed links above the comfortable margin. */
  solid: number
  /** Usable links a scan has not confirmed yet. */
  unconfirmed: number
}

// Rules over the repeaters recently heard in direct range. A link counts by its
// weaker way. Good needs a fallback and one solid link, both confirmed by a
// scan, so one strong repeater alone stays fair.
export function assessCoverage(links: DirectLink[]): Coverage {
  const weaker = (link: DirectLink) => Math.min(link.rx, link.tx ?? link.rx)
  const usable = links.filter(link => weaker(link) >= MARGIN_FAIR_DB)
  const solid = usable.filter(link => weaker(link) >= MARGIN_COMFORTABLE_DB)
  const confirmed = usable.filter(link => link.tx !== null)
  const count = usable.length
  const confirmedSolid = solid.filter(link => link.tx !== null).length
  const counts = { usable: count, confirmed: confirmed.length, solid: confirmedSolid, unconfirmed: count - confirmed.length }
  if (!links.length) return { level: 'none', reason: 'nothing-heard', usable: 0, confirmed: 0, solid: 0, unconfirmed: 0 }
  if (confirmed.length >= COVERAGE_GOOD_USABLE && confirmedSolid) return { level: 'good', reason: 'confirmed', ...counts }
  if (count >= COVERAGE_GOOD_USABLE && solid.length) return { level: 'fair', reason: 'unconfirmed', ...counts }
  if (count >= COVERAGE_GOOD_USABLE) return { level: 'fair', reason: 'none-solid', ...counts }
  if (count === 1) return { level: 'fair', reason: 'single', ...counts }
  return { level: 'weak', reason: 'weak', ...counts }
}

// Only a repeater in direct range answers a scan. One that answered before,
// and was not heard directly since the last full scan started, is out of range
// for now. Being named further along a relayed path proves nothing, and a
// firmware that never answers scans is left alone.
export function isOutOfRange(repeater: DeepReadonly<HeardRepeater>, lastScanStartedAt: number | null): boolean {
  if (repeater.hops || !repeater.tx || lastScanStartedAt === null) return false
  return Math.max(repeater.rx?.at ?? 0, repeater.tx.at) < lastScanStartedAt
}

export function recordRx(repeater: HeardRepeater, sample: RxSample) {
  repeater.rx = sample
  repeater.history.push(sample)
  if (repeater.history.length > MAX_RX_HISTORY) repeater.history.shift()
}

export function formatDistance(meters: number, locale = DEFAULT_LANGUAGE): string {
  return meters < 1000 ? `${formatNumber(meters, 0, 0, locale)} m` : `${formatNumber(meters / 1000, 1, 1, locale)} km`
}

const EARTH_RADIUS_M = 6_371_000

function radians(degrees: number): number {
  return degrees * Math.PI / 180
}

export function distanceMeters(from: Position, to: Position): number {
  const dLat = radians(to.lat - from.lat)
  const dLon = radians(to.lon - from.lon)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

// Initial great-circle bearing, degrees clockwise from true north.
export function bearingDegrees(from: Position, to: Position): number {
  const dLon = radians(to.lon - from.lon)
  const y = Math.sin(dLon) * Math.cos(radians(to.lat))
  const x = Math.cos(radians(from.lat)) * Math.sin(radians(to.lat)) - Math.sin(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
