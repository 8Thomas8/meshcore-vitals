// Module scope so the list keeps filling while another page is open.
const repeaters = ref<HeardRepeater[]>([])
const selfInfo = shallowRef<MeshCoreSelfInfo | null>(null)
const contacts = shallowRef<MeshCoreContact[]>([])
const scanUntil = ref<number | null>(null)
const scannedAt = ref<number | null>(null)
// Failed scans count too, so auto scan does not retry every second.
const lastScanAttempt = ref<number | null>(null)
// When the last scan whose window ran to its end started.
const lastFullScanAt = ref<number | null>(null)
const autoScan = ref(false)
const scanError = ref<string | null>(null)
let listening: MeshCoreConnection | null = null
let scanTag: number | null = null
let scanTimer: ReturnType<typeof setTimeout> | undefined

function onLogRx(payload: unknown) {
  const { lastSnr, lastRssi, raw } = payload as MeshCoreLogRxData
  const at = Date.now()
  for (const sighting of sightings(raw)) {
    const repeater = recordSighting(repeaters.value, sighting, at)
    if (repeater && !sighting.hops) recordRx(repeater, { snr: lastSnr, rssi: lastRssi, at })
  }
}

function onFrame(payload: unknown) {
  const response = parseDiscoverResponse(payload as Uint8Array)
  if (!response || response.tag !== scanTag) return
  const at = Date.now()
  const repeater = recordSighting(repeaters.value, { id: response.id, hops: 0, via: null }, at)
  if (!repeater) return
  recordRx(repeater, { snr: response.rxSnr, rssi: response.rxRssi, at })
  repeater.tx = { snr: response.txSnr, at }
}

class CommandRefused extends Error {
  constructor(readonly unsupported: boolean) {
    // Message keys, translated where they are shown.
    super(unsupported ? 'errors.scanUnsupported' : 'errors.scanFailed')
  }
}

// For commands meshcore.js does not wrap: the companion answers Ok, or Err with
// a reason. An old firmware answers that the command is unknown.
function sendCommand(conn: MeshCoreConnection, frame: Uint8Array) {
  let onAnswer: (payload: unknown) => void = () => {}
  const answered = new Promise<void>((resolve, reject) => {
    onAnswer = (payload) => {
      const [code, reason] = payload as Uint8Array
      if (code === RESP_OK) resolve()
      if (code === RESP_ERR) reject(new CommandRefused(reason === ERR_UNSUPPORTED_CMD))
    }
  })
  conn.on('rx', onAnswer)
  conn.sendToRadioFrame(frame)
  return withTimeout(answered).finally(() => conn.off('rx', onAnswer))
}

async function scan() {
  const conn = listening
  if (!conn || scanUntil.value) return
  scanError.value = null
  scanTag = crypto.getRandomValues(new Uint32Array(1))[0]!
  const startedAt = Date.now()
  lastScanAttempt.value = startedAt
  scanUntil.value = startedAt + DISCOVER_WINDOW_MS
  try {
    await sendCommand(conn, discoverRequest(scanTag))
    // A reconnection in the meantime started a fresh session.
    if (listening !== conn) return
    scannedAt.value = Date.now()
    scanTimer = setTimeout(() => {
      scanUntil.value = null
      lastFullScanAt.value = startedAt
    }, DISCOVER_WINDOW_MS)
  }
  catch (e) {
    if (listening !== conn) return
    scanUntil.value = null
    scanError.value = e instanceof Error ? e.message : String(e)
    // Would fail again on every retry.
    if (e instanceof CommandRefused && e.unsupported) autoScan.value = false
  }
}

// Every connection starts a fresh list.
async function start(conn: MeshCoreConnection) {
  if (listening === conn) return
  listening = conn
  clearTimeout(scanTimer)
  repeaters.value = []
  selfInfo.value = null
  contacts.value = []
  scanUntil.value = null
  scannedAt.value = null
  lastScanAttempt.value = null
  lastFullScanAt.value = null
  autoScan.value = false
  scanError.value = null
  scanTag = null
  conn.on(PUSH_LOG_RX_DATA, onLogRx)
  conn.on('rx', onFrame)
  try {
    const info = await withTimeout(conn.getSelfInfo())
    if (listening !== conn) return
    selfInfo.value = info
    const list = await withTimeout(conn.getContacts(), CONTACTS_TIMEOUT_MS)
    if (listening === conn) contacts.value = list
  }
  catch {
    // Names, positions and link margins stay unknown, the scan still works.
  }
}

export function useRepeaters() {
  return {
    repeaters: readonly(repeaters),
    selfInfo: shallowReadonly(selfInfo),
    contacts: shallowReadonly(contacts),
    scanUntil: readonly(scanUntil),
    scannedAt: readonly(scannedAt),
    lastScanAttempt: readonly(lastScanAttempt),
    lastFullScanAt: readonly(lastFullScanAt),
    autoScan,
    scanError: readonly(scanError),
    start,
    scan
  }
}
