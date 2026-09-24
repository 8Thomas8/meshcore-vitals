// The formatters whose words or number separators depend on the language.
// formatNumber and formatDistance keep the names of the utils they wrap, so a
// component that takes them from here shadows the plain English ones.
export function useFormat() {
  const { t, te, localeProperties } = useI18n()
  const language = computed(() => localeProperties.value.language ?? DEFAULT_LANGUAGE)
  const units = computed((): DurationUnits => ({
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
    second: t('units.second')
  }))

  return {
    formatNumber: (value: number, maxDecimals = 0, minDecimals = maxDecimals) => formatNumber(value, maxDecimals, minDecimals, language.value),
    formatDistance: (meters: number) => formatDistance(meters, language.value),
    duration: (secs: number) => formatDuration(secs, units.value),
    offset: (secs: number) => formatOffset(secs, units.value),
    ago: (at: number, now: number) => t('time.ago', { time: formatElapsed(at, now, units.value) }),
    hops: (hops: number) => t('repeaters.hops', hops),
    // Errors thrown by the app carry a message key, the browser's own come as
    // they are.
    message: (text: string) => te(text) ? t(text) : text
  }
}
