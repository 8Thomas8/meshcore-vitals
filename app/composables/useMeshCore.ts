// Module scope so every page shares the one Bluetooth link. It is only ever
// written on the client.
const connection = shallowRef<MeshCoreConnection | null>(null)
const status = ref<ConnectionStatus>('disconnected')
const error = ref<string | null>(null)

// open() returns before the GATT link is up, and a failed link emits nothing,
// hence the timeout.
function waitUntilConnected(conn: MeshCoreConnection) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('errors.connectTimeout')), CONNECT_TIMEOUT_MS)
    conn.on('connected', () => {
      clearTimeout(timer)
      resolve()
    })
    conn.on('disconnected', () => {
      clearTimeout(timer)
      reject(new Error('errors.disconnectedWhileConnecting'))
    })
  })
}

async function connect() {
  error.value = null
  status.value = 'connecting'
  let conn: MeshCoreConnection | null | undefined
  try {
    const { default: WebBleConnection } = await import('@liamcottle/meshcore.js/src/connection/web_ble_connection.js')
    conn = await WebBleConnection.open()
    if (!conn) {
      status.value = 'disconnected'
      return
    }
    await waitUntilConnected(conn)
    conn.on('disconnected', () => {
      connection.value = null
      status.value = 'disconnected'
    })
    connection.value = conn
    status.value = 'connected'
  }
  catch (e) {
    await conn?.close()
    status.value = 'disconnected'
    // Dismissing the device picker rejects with NotFoundError.
    if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }
}

async function disconnect() {
  await connection.value?.close()
  connection.value = null
  status.value = 'disconnected'
}

export function useMeshCore() {
  return {
    connection: shallowReadonly(connection),
    status: readonly(status),
    error: readonly(error),
    connect,
    disconnect
  }
}
