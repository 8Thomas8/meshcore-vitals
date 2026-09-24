// Where this device stands, from its GPS, while the calling component is
// mounted. Denied or unavailable, everything stays null and unavailable is set.
export function useDevicePosition() {
  const position = ref<Position | null>(null)
  /** Metres above sea level, often null without a GPS fix. */
  const altitude = ref<number | null>(null)
  /** Metres. */
  const altitudeAccuracy = ref<number | null>(null)
  const unavailable = ref(false)
  /** When locate() last got a fix. */
  const locatedAt = ref<number | null>(null)
  let watchId: number | undefined

  function onPosition({ coords }: GeolocationPosition) {
    position.value = { lat: coords.latitude, lon: coords.longitude }
    altitude.value = coords.altitude
    altitudeAccuracy.value = coords.altitudeAccuracy
    unavailable.value = false
  }

  function onError() {
    unavailable.value = true
  }

  // The watch only reports when the browser decides to, and phones space its
  // fixes out. This asks for a fresh one now.
  function locate() {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition((fix) => {
      onPosition(fix)
      locatedAt.value = Date.now()
    }, (error) => {
      // A slow fix is not a reason to drop the one the watch has.
      if (error.code === error.PERMISSION_DENIED) onError()
    }, { enableHighAccuracy: true, maximumAge: LOCATE_MAX_AGE_MS, timeout: LOCATE_TIMEOUT_MS })
  }

  onMounted(() => {
    if (!('geolocation' in navigator)) {
      unavailable.value = true
      return
    }
    watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true })
  })

  onBeforeUnmount(() => {
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
  })

  return { position, altitude, altitudeAccuracy, unavailable, locatedAt, locate }
}
