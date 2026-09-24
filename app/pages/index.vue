<script setup lang="ts">
import { mdiChevronDown, mdiChevronRight, mdiChevronUp, mdiEye, mdiEyeOff, mdiInformationOutline, mdiRadar } from '@mdi/js'
import { useDisplay } from 'vuetify'

// The layout only shows the pages while a node is connected.
const { connection } = useMeshCore()
const { repeaters, selfInfo, contacts, scanUntil, scannedAt, lastScanAttempt, lastFullScanAt, autoScan, scanError, start, scan } = useRepeaters()

const { smAndDown } = useDisplay()
const { t } = useI18n()
const { ago, hops, message, formatNumber, formatDistance } = useFormat()
const { supported: wakeLockSupported, enabled: keepScreenOn, active: screenKeptOn } = useWakeLock()
const { position: here, unavailable: noLocation, locatedAt, locate } = useDevicePosition()
const heading = ref<number | null>(null)
const now = ref(Date.now())
const summary = ref<{ $el: HTMLElement } | null>(null)
let clock: ReturnType<typeof setInterval> | undefined

// Folded down to its header to give the map the room. Remembered on this
// device only, storage may be blocked.
const listHidden = ref(false)
const list = ref<{ $el: HTMLElement } | null>(null)
watch(listHidden, (hidden) => {
  try {
    localStorage.setItem(LIST_HIDDEN_STORAGE_KEY, String(hidden))
  }
  catch {
    // Stays for this visit only.
  }
})

// Only the absolute event is relative to north.
function onOrientation(event: DeviceOrientationEvent) {
  if (event.absolute && event.alpha !== null) heading.value = (360 - event.alpha) % 360
}

onMounted(() => {
  start(connection.value!)
  clock = setInterval(() => {
    now.value = Date.now()
    // Auto scans only run while this page is shown and the tab is visible.
    if (autoScan.value && !document.hidden && nextScanAt.value !== null && now.value >= nextScanAt.value) scan()
  }, 1000)
  window.addEventListener('deviceorientationabsolute', onOrientation)
  try {
    listHidden.value = localStorage.getItem(LIST_HIDDEN_STORAGE_KEY) === 'true'
  }
  catch {
    // Shown by default.
  }
})

onBeforeUnmount(() => {
  clearInterval(clock)
  window.removeEventListener('deviceorientationabsolute', onOrientation)
})

// Each scan, manual or auto, also places you afresh.
watch(lastScanAttempt, (at) => {
  if (at) locate()
})

const scanning = computed(() => scanUntil.value !== null)
const nextScanAt = computed(() => autoScan.value && !scanning.value ? (lastScanAttempt.value ?? 0) + AUTO_SCAN_INTERVAL_MS : null)
const scanLeftMs = computed(() => scanUntil.value && Math.max(0, scanUntil.value - now.value))
const scanProgress = computed(() => scanLeftMs.value === null ? 0 : 100 * (1 - scanLeftMs.value / DISCOVER_WINDOW_MS))

const repeaterContacts = computed(() => contacts.value
  .filter(contact => contact.type === ADV_TYPE_REPEATER)
  .map(contact => ({ id: toHex(contact.publicKey), contact })))

// A path hash can match several contacts, then none is picked.
function contactFor(id: string) {
  const matches = repeaterContacts.value.filter(entry => entry.id.startsWith(id))
  return matches.length === 1 ? matches[0]!.contact : null
}

function margin(sample: LinkSample | null) {
  return sample && selfInfo.value ? linkMargin(sample.snr, selfInfo.value.radioSf) : null
}

function nameOf(id: string): string {
  const heard = repeaters.value.find(repeater => repeater.id.startsWith(id))
  return heard?.name ?? contactFor(heard?.id ?? id)?.advName ?? t('repeaters.unnamed', { id: id.slice(0, 8).toUpperCase() })
}

const rows = computed(() => repeaters.value
  .map((repeater): RepeaterRow => {
    const contact = contactFor(repeater.id)
    const position = repeater.position ?? (contact && toPosition(contact.advLat, contact.advLon))
    const distance = here.value && position ? distanceMeters(here.value, position) : null
    const altitude = position ? elevationAt(position) : null
    const viaName = repeater.via && nameOf(repeater.via)
    const rx = margin(repeater.rx)
    const tx = margin(repeater.tx)
    const outOfRange = isOutOfRange(repeater, lastFullScanAt.value)
    const route = repeater.hops
      ? t('repeaters.via', { hops: hops(repeater.hops), name: viaName ?? t('repeaters.unknown') })
      : outOfRange ? t('repeaters.outOfRange') : t('repeaters.direct')
    const details = [
      distance !== null && formatDistance(distance),
      typeof altitude === 'number' && t('repeaters.altitude', { altitude: formatNumber(altitude) }),
      ago(repeater.lastHeard, now.value)
    ]
    return {
      repeater,
      name: nameOf(repeater.id),
      viaName,
      // The route may wrap, each other part stays whole.
      details: [route, ...details.filter(part => typeof part === 'string').map(part => part.replaceAll(' ', '\u00a0'))].join(' · '),
      position,
      altitude,
      distance,
      bearing: here.value && position ? bearingDegrees(here.value, position) : null,
      // A repeater out of range keeps its last values, not their colors.
      rx: outOfRange ? null : rx,
      tx: outOfRange ? null : tx,
      link: outOfRange ? null : rx && tx ? (tx.value < rx.value ? tx : rx) : rx ?? tx,
      outOfRange
    }
  })
  // Direct ones by link quality, then the closest relayed ones, the ones out
  // of range last.
  .sort((a, b) => Number(a.outOfRange) - Number(b.outOfRange)
    || a.repeater.hops - b.repeater.hops
    || (b.link?.value ?? -Infinity) - (a.link?.value ?? -Infinity)
    || b.repeater.lastHeard - a.repeater.lastHeard))

// The ones silent at the last scan stay hidden until asked for.
const showOutOfRange = ref(false)
const inRange = computed(() => rows.value.filter(row => !row.outOfRange))
const outOfRangeCount = computed(() => rows.value.length - inRange.value.length)
const shownRows = computed(() => showOutOfRange.value ? rows.value : inRange.value)

const direct = computed(() => inRange.value.filter(row => !row.repeater.hops))

// By id prefix, the id grows from a path hash to the full key while it is open.
const selectedId = ref<string | null>(null)
const selected = computed(() => {
  const id = selectedId.value
  return id === null ? null : rows.value.find(row => row.repeater.id.startsWith(id) || id.startsWith(row.repeater.id)) ?? null
})
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (open) => {
    if (!open) selectedId.value = null
  }
})

const COVERAGE_TONES = { good: 'success', fair: 'warning', weak: 'error', none: 'error' } as const

const coverage = computed(() => {
  if (!inRange.value.length) return null
  const links = direct.value.flatMap(({ repeater, rx, tx }) =>
    rx && repeater.rx && now.value - repeater.rx.at < COVERAGE_RECENT_MS ? [{ rx: rx.value, tx: tx?.value ?? null }] : [])
  const assessment = assessCoverage(links)
  const { reason, usable, confirmed, solid, unconfirmed } = assessment
  return {
    ...assessment,
    tone: COVERAGE_TONES[assessment.level],
    label: t(`coverage.level.${assessment.level}`),
    reason: reason === 'confirmed' && unconfirmed
      ? `${t('coverage.reason.confirmed', { confirmed, solid }, solid)} ${t('coverage.reason.unscanned', unconfirmed)}`
      : t(`coverage.reason.${reason}`, { usable, confirmed, solid, minutes: COVERAGE_RECENT_MS / 60_000, fair: MARGIN_FAIR_DB }, solid)
  }
})
</script>

<template>
  <v-container class="page-width screen">
    <!-- Lazy: MapLibre, its styles and its worker only load once there is a map to show. -->
    <LazyMapBackdrop v-if="here" :here="here" :rows="shownRows" :below="summary?.$el ?? null" :list="list?.$el ?? null" :located-at="locatedAt" :companion-name="selfInfo?.name ?? null" />
    <v-card ref="summary" class="summary">
      <v-progress-linear
        :active="scanning"
        :model-value="scanProgress"
        absolute
        location="top"
        color="primary"
        height="4"
      />
      <div class="d-flex align-center ga-2">
        <v-tooltip location="bottom" max-width="300" open-on-click :disabled="!coverage">
          <template #activator="{ props: activator }">
            <button v-bind="activator" type="button" class="coverage d-flex align-center ga-2 flex-grow-1 min-w-0">
              <!-- Usable repeaters out of the ones good coverage needs. -->
              <v-progress-circular
                :model-value="coverage ? Math.min(coverage.usable, COVERAGE_GOOD_USABLE) / COVERAGE_GOOD_USABLE * 100 : 0"
                :color="coverage?.tone ?? 'primary'"
                size="40"
                width="4"
              >
                <span v-if="coverage" class="score font-mono">{{ coverage.usable }}</span>
              </v-progress-circular>
              <span class="flex-grow-1 min-w-0">
                <span class="d-block text-title headline">{{ coverage?.label ?? (scanning ? $t('scan.scanning') : rows.length ? $t('repeaters.noneInRange') : $t('repeaters.noneYet')) }}</span>
                <span class="d-flex align-center ga-1 text-small text-medium-emphasis min-w-0">
                  <span class="text-truncate">
                    <template v-if="inRange.length">{{ $t('repeaters.counts', { direct: direct.length, relayed: $t('repeaters.relayed', inRange.length - direct.length) }) }}</template>
                    <template v-else>{{ scanning ? $t('scan.waiting') : rows.length ? $t('scan.nothingAnswered') : $t('scan.prompt') }}</template>
                  </span>
                  <v-icon v-if="coverage" :icon="mdiInformationOutline" size="14" class="flex-shrink-0" />
                </span>
              </span>
            </button>
          </template>
          <div class="d-flex flex-column ga-2 py-1">
            <span class="font-weight-medium">{{ coverage?.reason }}</span>
            <span>{{ $t('coverage.help.usable', { minutes: COVERAGE_RECENT_MS / 60_000, fair: MARGIN_FAIR_DB, comfortable: MARGIN_COMFORTABLE_DB }) }}</span>
            <span>{{ $t('coverage.help.levels', { count: COVERAGE_GOOD_USABLE, fair: MARGIN_FAIR_DB }) }}</span>
          </div>
        </v-tooltip>
        <!-- Inert while scanning or on auto, but not disabled: Vuetify's disabled look is unreadable. -->
        <v-btn
          class="action flex-shrink-0"
          rounded="pill"
          color="primary"
          height="44"
          :variant="scanning || autoScan ? 'tonal' : 'elevated'"
          :aria-disabled="scanning || autoScan"
          :prepend-icon="mdiRadar"
          @click="autoScan || scan()"
        >
          <template v-if="scanning">{{ Math.ceil((scanLeftMs ?? 0) / 1000) }} s</template>
          <template v-else-if="nextScanAt !== null && lastScanAttempt">{{ formatCountdown(nextScanAt - now) }}</template>
          <template v-else>{{ $t('scan.button') }}</template>
        </v-btn>
      </div>
      <div class="status-row d-flex align-center ga-2 text-small text-medium-emphasis">
        <v-badge dot inline :class="{ pulse: scanning }" :color="scanning ? 'primary' : scanError ? 'error' : 'success'" />
        <span v-if="scanError" class="text-error text-truncate">{{ message(scanError) }}</span>
        <span v-else-if="scanning" class="text-truncate">{{ $t('scan.inProgress') }}</span>
        <span v-else class="text-truncate">
          {{ scannedAt ? $t('scan.done', { ago: ago(scannedAt, now) }) : $t('scan.never') }}
          <template v-if="noLocation"> · {{ $t('scan.noLocation') }}</template>
        </span>
        <v-switch
          v-model="autoScan"
          :label="$t('scan.auto')"
          :title="$t('scan.autoHint', { minutes: AUTO_SCAN_INTERVAL_MS / 60_000 })"
          class="toggle ms-auto"
          color="primary"
          density="compact"
          size="small"
          hide-details
        />
        <!-- For walking around with the phone in hand. On but refused turns amber. -->
        <v-switch
          v-if="wakeLockSupported"
          v-model="keepScreenOn"
          :label="$t('wakeLock.label')"
          :title="keepScreenOn && !screenKeptOn ? $t('wakeLock.refused') : $t('wakeLock.hint')"
          class="toggle"
          :class="{ 'text-warning': keepScreenOn && !screenKeptOn }"
          color="primary"
          density="compact"
          size="small"
          hide-details
        />
      </div>
    </v-card>

    <v-card v-if="rows.length" ref="list" class="bottom list" :style="{ maxHeight: `${LIST_MAX_HEIGHT_SHARE * 100}dvh` }">
      <button
        v-ripple
        type="button"
        class="list-toggle d-flex align-center ga-2 text-small"
        :aria-expanded="!listHidden"
        :aria-controls="listHidden ? undefined : 'repeater-rows'"
        @click="listHidden = !listHidden"
      >
        <span class="flex-grow-1 font-weight-medium">{{ $t('repeaters.count', shownRows.length) }}</span>
        <span class="text-medium-emphasis">{{ listHidden ? $t('repeaters.showList') : $t('repeaters.hideList') }}</span>
        <v-icon :icon="listHidden ? mdiChevronUp : mdiChevronDown" size="20" class="text-medium-emphasis" />
      </button>
      <!-- Unmounted when folded, the rows would keep updating every second. -->
      <div v-if="!listHidden" id="repeater-rows" class="rows">
        <button
          v-for="row in shownRows"
          :key="row.repeater.id"
          v-ripple
          type="button"
          class="row"
          :class="{ 'out-of-range': row.outOfRange }"
          @click="selectedId = row.repeater.id"
        >
          <CompassDial
            class="icon"
            :class="row.repeater.hops || row.outOfRange ? 'text-medium-emphasis' : `text-${row.link?.tone ?? 'primary'}`"
            :bearing="row.bearing"
            :heading="heading"
          />
          <span class="name font-weight-medium text-truncate">{{ row.name }}</span>
          <span class="details text-small text-medium-emphasis">{{ row.details }}</span>
          <span v-if="!row.repeater.hops" class="links font-mono text-small">
            <span>
              <span class="text-medium-emphasis">RX </span>
              <span :class="row.rx && `text-${row.rx.tone}`">{{ row.repeater.rx ? `${formatNumber(row.repeater.rx.snr, 2, 0)} dB` : $t('common.na') }}</span>
            </span>
            <span>
              <span class="text-medium-emphasis">TX </span>
              <span :class="row.tx ? `text-${row.tx.tone}` : 'text-disabled'">{{ row.repeater.tx ? `${formatNumber(row.repeater.tx.snr, 2, 0)} dB` : $t('repeaters.txUnknown') }}</span>
            </span>
          </span>
          <v-icon class="chevron text-medium-emphasis" :icon="mdiChevronRight" />
        </button>
        <button
          v-if="outOfRangeCount"
          v-ripple
          type="button"
          class="out-of-range-toggle d-flex align-center ga-2 text-small text-medium-emphasis"
          :title="$t('repeaters.outOfRangeHint')"
          @click="showOutOfRange = !showOutOfRange"
        >
          <v-icon :icon="showOutOfRange ? mdiEyeOff : mdiEye" size="18" />
          <span>{{ $t(showOutOfRange ? 'repeaters.hideOutOfRange' : 'repeaters.showOutOfRange', outOfRangeCount) }}</span>
        </button>
      </div>
    </v-card>

    <v-bottom-sheet v-if="smAndDown" v-model="detailOpen" scrollable>
      <v-card class="sheet glass-dense">
        <RepeaterDetail
          v-if="selected"
          :row="selected"
          :heading="heading"
          :spreading-factor="selfInfo?.radioSf ?? null"
          :now="now"
          @close="selectedId = null"
          @select="selectedId = $event"
        />
      </v-card>
    </v-bottom-sheet>
    <v-navigation-drawer v-else v-model="detailOpen" class="glass-dense" location="right" temporary width="400">
      <RepeaterDetail
        v-if="selected"
        :row="selected"
        :heading="heading"
        :spreading-factor="selfInfo?.radioSf ?? null"
        :now="now"
        @close="selectedId = null"
        @select="selectedId = $event"
      />
    </v-navigation-drawer>

    <v-card v-if="!rows.length" class="bottom empty text-medium-emphasis">
      {{ $t('repeaters.empty') }}
    </v-card>
  </v-container>
</template>

<style scoped lang="scss">
@use '~/assets/scss/variables' as *;

// The coverage card on top, the list held at the bottom of the page just above
// the menu, growing upwards.
.screen {
  flex-grow: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  // Lets the map behind take the gestures outside the cards.
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
}

.bottom {
  margin-top: auto;
}

// Leaves the map room between the two cards, the rows scroll under the
// toggle.
.list {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.rows {
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--glass-border);
}

.list-toggle {
  width: 100%;
  min-height: 44px;
  padding: 8px 12px 8px 16px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: rgba(var(--v-theme-on-surface), 0.06);
  }
}

.out-of-range-toggle {
  width: 100%;
  min-height: 44px;
  padding: 8px 16px;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;

  .row + & {
    border-top: 1px solid var(--glass-border);
  }

  &:hover,
  &:focus-visible {
    background: rgba(var(--v-theme-on-surface), 0.06);
  }
}

// Keeps its width while the label turns into a countdown, unless a translation
// needs more.
.action {
  min-width: 104px;
  justify-content: center;
}

.toggle {
  flex: 0 0 auto;

  // As tall as the status line, the card keeps its height.
  :deep(.v-selection-control) {
    min-height: 32px;
    height: 32px;
  }

  :deep(.v-label) {
    font-size: var(--text-caption);
    opacity: 1;
  }
}

.summary {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

// Two lines rather than cut, some languages need them on a phone.
.headline {
  display: -webkit-box !important;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1.2;
}

.score {
  font-size: var(--text-hint);
  font-weight: 500;
}

.coverage {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sheet {
  max-height: 85dvh;
  border-radius: 24px 24px 0 0 !important;
}

.empty {
  padding: 16px;
  font-size: var(--text-hint);
}

// Stacked on phones, the SNR moves to its own column on wider screens.
.row {
  width: 100%;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  grid-template-areas: 'icon name chevron' 'icon details chevron' 'icon links chevron';
  align-items: center;
  gap: 2px 12px;
  padding: 12px 16px;

  & + & {
    border-top: 1px solid var(--glass-border);
  }

  &.out-of-range {
    opacity: 0.7;
  }

  &:hover,
  &:focus-visible {
    background: rgba(var(--v-theme-on-surface), 0.06);
  }

  @media (min-width: $breakpoint-sm) {
    grid-template-columns: 48px minmax(0, 1fr) auto auto;
    grid-template-areas: 'icon name links chevron' 'icon details links chevron';
  }
}

.icon {
  grid-area: icon;
}

.chevron {
  grid-area: chevron;
  margin-right: -6px;
}

.name {
  grid-area: name;
}

.details {
  grid-area: details;
}

.links {
  grid-area: links;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 16px;
  margin-top: 2px;

  @media (min-width: $breakpoint-sm) {
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    margin-top: 0;
  }
}
</style>
