/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// A phone keeps the app open in the background for days, so a new deployment
// only reaches it after a reload. The app checks when it comes back to the
// foreground and every so often. Reloading drops the Bluetooth link, so it
// only reloads by itself while no node is connected, otherwise it offers to.
//
// Once installed, the service worker serves the app from its cache, so a plain
// reload would bring the same version back: the check asks it to look for a
// new one, which installs in the background, and switching activates it.
// Without a service worker, say on a first visit or in a browser without one,
// the check compares the deployed build id instead.
export default defineNuxtPlugin(() => {
  if (import.meta.dev) return
  const { app } = useRuntimeConfig()
  const { available, apply, setApply, reload } = useAppUpdate()
  const { status, error } = useMeshCore()
  const latestUrl = `${app.baseURL}/${app.buildAssetsDir}/builds/latest.json`.replace(/\/{2,}/g, '/')
  let checking = false
  let latestId: string | null = null
  let registration: ServiceWorkerRegistration | undefined
  // A new worker is installed and waits for a tab to let it take over.
  let waiting = false
  // This tab asked it to.
  let switching = false

  const controlled = () => !!navigator.serviceWorker?.controller

  const activateWorker = registerSW({
    immediate: true,
    onRegisteredSW: (_url, r) => {
      registration = r
    },
    onNeedRefresh: () => {
      waiting = true
      if (controlled()) available.value = true
    },
    // The new worker took over, asked by this tab or another one. The library
    // would reload every tab, including one connected to a node.
    onNeedReload: () => {
      waiting = false
      if (switching || (status.value === 'disconnected' && !error.value)) window.location.reload()
      else available.value = true
    }
  })

  // A page no worker controls never sees the new one take over, it reloads.
  setApply(() => {
    if (waiting && controlled()) {
      switching = true
      activateWorker()
    }
    else {
      reload()
    }
  })

  // Offline or on a failed request, it tries again at the next check.
  async function check() {
    if (available.value || checking || document.hidden) return
    checking = true
    try {
      if (controlled() && registration) {
        await registration.update()
        return
      }
      const latest = await $fetch<{ id: string }>(latestUrl, { query: { t: Date.now() } })
      if (latest.id && latest.id !== app.buildId) {
        latestId = latest.id
        available.value = true
      }
    }
    catch {
      // Tried again later.
    }
    finally {
      checking = false
    }
  }

  onNuxtReady(() => {
    check()
    setInterval(check, UPDATE_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', check)
  })

  watch([available, status, error], () => {
    const isControlled = controlled()
    let reloadedFor: string | null = null
    try {
      reloadedFor = sessionStorage.getItem(RELOADED_FOR_STORAGE_KEY)
    }
    catch {
      // Without storage nothing guards against a loop, the banner offers.
      if (!isControlled) return
    }
    if (!shouldAutoReload({ available: available.value, status: status.value, error: !!error.value, controlled: isControlled, reloadedFor, latestId })) return
    if (!isControlled) {
      try {
        sessionStorage.setItem(RELOADED_FOR_STORAGE_KEY, latestId ?? '')
      }
      catch {
        return
      }
    }
    apply()
  })
})
