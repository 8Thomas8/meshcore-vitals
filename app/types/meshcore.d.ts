// meshcore.js ships no type declarations. These cover only the calls validated
// against a real node (see docs/spike-meshcore-connection.md), with the shapes
// observed on firmware companion + meshcore.js 1.15.

interface MeshCoreSelfInfo {
  type: number
  txPower: number
  maxTxPower: number
  publicKey: Uint8Array
  /** Degrees × 1e6. */
  advLat: number
  /** Degrees × 1e6. */
  advLon: number
  manualAddContacts: number
  /** kHz. */
  radioFreq: number
  /** Hz. */
  radioBw: number
  radioSf: number
  radioCr: number
  name: string
}

interface MeshCoreContact {
  publicKey: Uint8Array
  /** 1 = chat, 2 = repeater, 3 = room server. */
  type: number
  flags: number
  /**
   * -1 when no path is known (flood), 0 for a direct neighbour. Otherwise the
   * low 6 bits are the hop count and the top 2 bits the hash size minus one.
   */
  outPathLen: number
  outPath: Uint8Array
  advName: string
  /** Unix seconds, from the advertising node's own clock. */
  lastAdvert: number
  /** Degrees × 1e6. */
  advLat: number
  /** Degrees × 1e6. */
  advLon: number
  lastMod: number
}

interface MeshCoreStats<T> {
  type: number
  raw: Uint8Array
  data: T
}

interface MeshCoreStatsCore {
  batteryMilliVolts: number
  uptimeSecs: number
  queueLen: number
}

interface MeshCoreStatsRadio {
  /** dBm. */
  noiseFloor: number
  /** dBm. */
  lastRssi: number
  /** dB. */
  lastSnr: number
  txAirSecs: number
  rxAirSecs: number
}

interface MeshCoreStatsPackets {
  recv: number
  sent: number
  nSentFlood: number
  nSentDirect: number
  nRecvFlood: number
  nRecvDirect: number
  nRecvErrors: number
}

interface MeshCoreTraceData {
  reserved: number
  pathLen: number
  flags: number
  tag: number
  authCode: number
  pathHashes: Uint8Array
  /** SNR × 4 per hop on the way out, as signed bytes. */
  pathSnrs: Uint8Array
  /** dB, measured by this node on the way back. */
  lastSnr: number
}

interface MeshCoreLogRxData {
  /** dB. */
  lastSnr: number
  /** dBm. */
  lastRssi: number
  raw: Uint8Array
}

interface MeshCoreDeviceInfo {
  /** Companion protocol version, not the firmware release. */
  firmwareVer: number
  /** Holds the BLE PIN among other things, never display it. */
  reserved: Uint8Array
  firmware_build_date: string
  /** Rest of the frame: the model, then on newer firmware a NUL-padded version string. */
  manufacturerModel: string
}

interface MeshCoreConnection {
  on: (event: number | string, handler: (payload: unknown) => void) => void
  off: (event: number | string, handler: (payload: unknown) => void) => void
  close: () => Promise<void>
  sendToRadioFrame: (frame: Uint8Array) => Promise<void>
  deviceQuery: (appTargetVer: number) => Promise<MeshCoreDeviceInfo>
  getDeviceTime: () => Promise<{ epochSecs: number }>
  getSelfInfo: () => Promise<MeshCoreSelfInfo>
  getContacts: () => Promise<MeshCoreContact[]>
  getStatsCore: () => Promise<MeshCoreStats<MeshCoreStatsCore>>
  getStatsRadio: () => Promise<MeshCoreStats<MeshCoreStatsRadio>>
  getStatsPackets: () => Promise<MeshCoreStats<MeshCoreStatsPackets>>
  /** Rejects with no reason when the node answers Err, e.g. on an empty path. */
  tracePath: (path: number[], extraTimeoutMillis?: number) => Promise<MeshCoreTraceData>
}

declare module '@liamcottle/meshcore.js/src/connection/web_ble_connection.js' {
  const WebBleConnection: { open: () => Promise<MeshCoreConnection | null | undefined> }
  export default WebBleConnection
}

declare module '@liamcottle/meshcore.js/src/connection/web_serial_connection.js' {
  const WebSerialConnection: { open: () => Promise<MeshCoreConnection | null> }
  export default WebSerialConnection
}
