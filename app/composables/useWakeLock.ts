// Keeps the screen on while the app is shown, for walking around with it. The
// browser releases the lock whenever the app goes to the background, so it is
// taken again each time it comes back. Module scope, one lock for the app.
const supported = ref(false)
const enabled = ref(false)
/** The browser granted the lock, it may refuse it, e.g. to save battery. */
const active = ref(false)
let sentinel: WakeLockSentinel | null = null
let requesting = false
let started = false

async function acquire() {
  if (!enabled.value || document.hidden || sentinel || requesting) return
  requesting = true
  try {
    const lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => {
      if (sentinel === lock) sentinel = null
      active.value = false
    })
    // Switched off while the request was pending.
    if (!enabled.value) {
      await lock.release()
      return
    }
    sentinel = lock
    active.value = true
  }
  catch {
    active.value = false
  }
  finally {
    requesting = false
  }
}

async function release() {
  const lock = sentinel
  sentinel = null
  active.value = false
  await lock?.release()
}

// Called once on the client, by the wake-lock plugin.
function start() {
  if (started) return
  started = true
  supported.value = 'wakeLock' in navigator
  if (!supported.value) return
  try {
    enabled.value = localStorage.getItem(WAKE_LOCK_STORAGE_KEY) === 'true'
  }
  catch {
    // Off by default.
  }
  document.addEventListener('visibilitychange', acquire)
  watch(enabled, (on) => {
    try {
      localStorage.setItem(WAKE_LOCK_STORAGE_KEY, String(on))
    }
    catch {
      // Stays for this visit only.
    }
    if (on) acquire()
    else release()
  }, { immediate: true })
}

export function useWakeLock() {
  return { supported: readonly(supported), enabled, active: readonly(active), start }
}
