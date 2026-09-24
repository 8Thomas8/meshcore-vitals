// Set by the app-update plugin once a newer deployment than the running one
// is ready. apply() switches to it, which reloads the page.
const available = ref(false)

function reload() {
  reloadNuxtApp({ force: true })
}

let applyUpdate = reload

function apply() {
  applyUpdate()
}

function setApply(fn: () => void) {
  applyUpdate = fn
}

export function useAppUpdate() {
  return { available, apply, setApply, reload }
}
