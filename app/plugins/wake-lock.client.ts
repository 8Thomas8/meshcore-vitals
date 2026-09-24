export default defineNuxtPlugin(() => {
  useWakeLock().start()
})
