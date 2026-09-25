// Where this device stands, from its GPS, while a page using it is shown.
// Denied or unavailable, everything stays null and unavailable is set.
// Module scope so a page switch keeps the watch and its fix: a fresh watch may
// not report until you move.
const fix = shallowRef<CompanionFix | null>(null)
const position = computed(() => fix.value?.position ?? null)
/** Metres above sea level, often null without a GPS fix. */
const altitude = ref<number | null>(null)
/** Metres. */
const altitudeAccuracy = ref<number | null>(null)
const unavailable = ref(false)
/** When locate() last settled on a fix. */
const locatedAt = ref<number | null>(null)
let watchId: number | undefined
let users = 0
let stopTimer: ReturnType<typeof setTimeout> | undefined
let locating = false
let locateTimer: ReturnType<typeof setTimeout> | undefined

function settle() {
  clearTimeout(locateTimer)
  locating = false
  if (fix.value) locatedAt.value = Date.now()
}

function isPrecise(at: number) {
  return fix.value !== null && reachAt(fix.value, at) <= LOCATE_PRECISE_M
}

function onPosition({ coords }: GeolocationPosition) {
  // GPS and network fixes may be stamped by different clocks.
  const next: CompanionFix = {
    position: { lat: coords.latitude, lon: coords.longitude },
    accuracy: coords.accuracy,
    at: Date.now()
  }
  altitude.value = coords.altitude
  altitudeAccuracy.value = coords.altitudeAccuracy
  unavailable.value = false
  if (isBetterFix(next, fix.value)) fix.value = next
  if (locating && isPrecise(next.at)) settle()
}

function onError() {
  unavailable.value = true
}

// The watch only reports when the browser decides to, and phones space its
// fixes out. This asks for a fresh one now, then keeps improving it for a
// while: the first fix is often a coarse one while the GPS wakes up.
function locate() {
  if (!('geolocation' in navigator)) return
  clearTimeout(locateTimer)
  if (isPrecise(Date.now())) return settle()
  locating = true
  locateTimer = setTimeout(settle, LOCATE_WINDOW_MS)
  navigator.geolocation.getCurrentPosition(onPosition, (error) => {
    // A slow fix is not a reason to drop the one the watch has.
    if (error.code === error.PERMISSION_DENIED) onError()
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: LOCATE_WINDOW_MS })
}

// Once no page uses it, e.g. on disconnecting: the next companion may be
// somewhere else.
function stop() {
  if (users || watchId === undefined) return
  navigator.geolocation.clearWatch(watchId)
  watchId = undefined
  clearTimeout(locateTimer)
  locating = false
  fix.value = null
  altitude.value = null
  altitudeAccuracy.value = null
  unavailable.value = false
  locatedAt.value = null
}

export function useDevicePosition() {
  let counted = false

  onMounted(() => {
    if (!('geolocation' in navigator)) {
      unavailable.value = true
      return
    }
    clearTimeout(stopTimer)
    watchId ??= navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true })
    users++
    counted = true
  })

  // The old page goes before the new one comes, so the watch waits a moment.
  onBeforeUnmount(() => {
    if (!counted) return
    users--
    clearTimeout(stopTimer)
    stopTimer = setTimeout(stop)
  })

  return {
    position,
    altitude: readonly(altitude),
    altitudeAccuracy: readonly(altitudeAccuracy),
    unavailable: readonly(unavailable),
    locatedAt: readonly(locatedAt),
    locate
  }
}
