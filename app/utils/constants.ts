import { mdiAccessPoint, mdiRadioTower } from '@mdi/js'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export type Tone = 'success' | 'warning' | 'error'

export type CoverageLevel = 'good' | 'fair' | 'weak' | 'none'

export interface CounterSample {
  at: number
  recv: number
  sent: number
  errors: number
  txAirSecs: number
}

export interface DeviceSummary {
  model: string | null
  version: string | null
  buildDate: string | null
}

export interface Position {
  lat: number
  lon: number
}

export interface LinkSample {
  /** dB. */
  snr: number
  at: number
}

export interface RxSample extends LinkSample {
  /** dBm. */
  rssi: number
}

export interface HeardRepeater {
  /** Public key in hex, or only its first bytes when heard through a path hash. */
  id: string
  name: string | null
  position: Position | null
  /** Fewest hops it was heard at, 0 in direct range. */
  hops: number
  /** Id of the repeater in direct range it was reached through. */
  via: string | null
  /** How we hear it, RSSI in dBm, only in direct range. */
  rx: RxSample | null
  /** Every rx sample this session, oldest first. */
  history: RxSample[]
  /** How it hears us, only known from a scan. */
  tx: LinkSample | null
  lastHeard: number
}

// OpenFreeMap's dark style, free and keyless. Its tiles, fonts and sprites come
// from the same host.
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

// Ground elevation from the Copernicus 90 m terrain model, free and keyless.
export const ELEVATION_API_URL = 'https://api.open-meteo.com/v1/elevation'
export const ELEVATION_RETRY_MS = 60_000

// Numbers are formatted this way outside a component, and until the language
// is known.
export const DEFAULT_LANGUAGE = 'en-US'

// The language chosen in the footer, kept for a year.
export const LOCALE_COOKIE = 'locale'
export const LOCALE_COOKIE_MAX_AGE_SECS = 365 * 86_400

export const REPOSITORY_URL = 'https://github.com/8Thomas8/meshcore-vitals-app'

export const NAV_ITEMS = [
  { title: 'nav.repeaters', to: '/', icon: mdiRadioTower },
  { title: 'nav.companion', to: '/companion', icon: mdiAccessPoint }
]

export const THEME_COLORS = {
  'background': '#0c121d',
  'surface': '#131c2b',
  'on-background': '#ffffff',
  'on-surface': '#ffffff',
  'primary': '#7cc4ff',
  'on-primary': '#0c121d',
  'success': '#5be49b',
  'warning': '#ffc857',
  'error': '#ff6b6b',
  'info': '#7cc4ff',
  'halo': '#18406b'
}

// The companion protocol version meshcore.js itself announces on connect.
export const APP_PROTOCOL_VERSION = 3

export const PUSH_LOG_RX_DATA = 0x88
export const ADV_TYPE_REPEATER = 2

// Companion protocol codes meshcore.js 1.15 does not know about.
export const RESP_OK = 0
export const RESP_ERR = 1
export const ERR_UNSUPPORTED_CMD = 1
export const CMD_SEND_CONTROL_DATA = 55
export const PUSH_CONTROL_DATA = 0x8e
export const CTL_NODE_DISCOVER_REQ = 0x80
export const CTL_NODE_DISCOVER_RESP = 0x90

// Repeaters delay their answer by up to a few seconds so they do not collide,
// and each answers at most 4 requests every 2 minutes.
export const DISCOVER_WINDOW_MS = 30_000

// Well under the 4 requests every 2 minutes each repeater answers, shared with
// everyone else scanning around.
export const AUTO_SCAN_INTERVAL_MS = 3 * 60_000

// Enough for an hour at one packet every 30 s.
export const MAX_RX_HISTORY = 120

// Whether the screen is kept on, remembered on this device. Off by default,
// it costs battery.
export const WAKE_LOCK_STORAGE_KEY = 'keep-screen-on'

// Share of the screen the repeater list may take, leaving the map visible.
export const LIST_MAX_HEIGHT_SHARE = 0.45

// Whether the repeater list is folded, remembered on this device.
export const LIST_HIDDEN_STORAGE_KEY = 'repeaters-list-hidden'

// Where the coverage card ends before it is measured, app bar included.
export const MAP_TOP_FALLBACK = 200

// Room kept between the cards and what the map frames.
export const MAP_EDGE_MARGIN = 40

// Room kept on each side of what the map frames, for the labels.
export const MAP_SIDE_MARGIN = 60

// How far from a dot a tap still picks it, for a finger.
export const MAP_TAP_RADIUS = 20

// How long the map attribution shows in full before it folds to its button.
// OpenStreetMap's guidelines allow folding it after five seconds.
export const MAP_ATTRIBUTION_FOLD_MS = 5_000

// On a short screen the paddings shrink to leave the map at least this height.
export const MAP_MIN_FRAME_HEIGHT = 60

// Room kept between a map label and its dot, and around every dot, which no
// label may cover. The largest dot reaches 11 px from its centre.
export const MAP_LABEL_GAP = 14
export const MAP_DOT_CLEARANCE = 11

// A fresh GPS fix asked for at a scan, given up on after this.
export const LOCATE_TIMEOUT_MS = 20_000

// A fix the watch got this recently is fresh enough, and saves the GPS a
// second request.
export const LOCATE_MAX_AGE_MS = 10_000

// The map animations: one frame at most this often, a pulse around direct
// repeaters this long, and a band of light this long to run in along each link,
// this wide (in line lengths) and this bright at its centre.
export const MAP_ANIMATION_FRAME_MS = 33
export const MAP_PULSE_MS = 2_000
export const MAP_FLOW_MS = 1_800
export const MAP_FLOW_WIDTH = 0.18
export const MAP_FLOW_OPACITY = 0.75

// How far you move before the map redraws and reframes around you, above GPS drift.
export const MAP_FOLLOW_DISTANCE_M = 25

// How often an open app looks for a newer deployment, on top of each time it
// comes back to the foreground.
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60_000

// The deployment this tab last reloaded by itself for, so it does not loop.
export const RELOADED_FOR_STORAGE_KEY = 'app-update-reloaded-for'

export const CONNECT_TIMEOUT_MS = 20_000

// A request normally gets its answer within a second over Bluetooth.
export const REQUEST_TIMEOUT_MS = 5_000

// The contact list streams one frame per contact.
export const CONTACTS_TIMEOUT_MS = 30_000

// A Li-ion cell, empty and full.
export const BATTERY_EMPTY_MV = 3000
export const BATTERY_FULL_MV = 4200

// Each tone starts at its threshold: at or above OK is fine, below LOW is bad.
export const BATTERY_OK_LEVEL = 0.5
export const BATTERY_LOW_LEVEL = 0.2

// The margin gauge fills up here.
export const MARGIN_GAUGE_FULL_DB = 20

// Only repeaters heard directly this recently count towards coverage.
export const COVERAGE_RECENT_MS = 10 * 60_000

// Coverage is good with this many usable repeaters in direct range.
export const COVERAGE_GOOD_USABLE = 2

export const MARGIN_COMFORTABLE_DB = 10
export const MARGIN_FAIR_DB = 5

export const ERROR_RATE_WARNING = 0.1
export const ERROR_RATE_BAD = 0.25

export const CLOCK_DRIFT_WARNING_SECS = 60
export const CLOCK_DRIFT_BAD_SECS = 3600

// Session rates over a shorter span are mostly noise.
export const MIN_SESSION_MINUTES = 1
