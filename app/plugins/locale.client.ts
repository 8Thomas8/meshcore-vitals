// The pages are prerendered once, in English. Detecting the language before
// hydration would render French over English HTML and leave mismatched
// attributes behind, so the switch waits until hydration is over, async pages
// included.
export default defineNuxtPlugin((nuxtApp) => {
  const cookie = useCookie<string | null>(LOCALE_COOKIE, { maxAge: LOCALE_COOKIE_MAX_AGE_SECS, sameSite: 'lax' })

  onNuxtReady(async () => {
    const i18n = nuxtApp.$i18n
    const available: string[] = i18n.localeCodes.value
    const browser = navigator.languages.map(tag => tag.split('-')[0]!).find(code => available.includes(code))
    const wanted = cookie.value && available.includes(cookie.value) ? cookie.value : browser
    if (wanted && wanted !== i18n.locale.value) await i18n.setLocale(wanted as typeof i18n.locale.value)
    // Only a choice made in the footer, after this, is remembered.
    watch(i18n.locale, (code) => {
      cookie.value = code
    })
  })
})
