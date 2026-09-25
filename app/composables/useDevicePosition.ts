// Where this device stands, from its GPS, while the calling component is
// mounted. Denied or unavailable, everything stays null and unavailable is set.
export function useDevicePosition() {
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

  onMounted(() => {
    if (!('geolocation' in navigator)) {
      unavailable.value = true
      return
    }
    watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true })
  })

  onBeforeUnmount(() => {
    clearTimeout(locateTimer)
    locating = false
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
  })

  return { position, altitude, altitudeAccuracy, unavailable, locatedAt, locate }
}
