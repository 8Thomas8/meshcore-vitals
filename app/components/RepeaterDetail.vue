<script setup lang="ts">
import { mdiClose, mdiOpenInNew } from '@mdi/js'

const props = defineProps<{
  row: RepeaterRow
  heading: number | null
  spreadingFactor: number | null
  now: number
}>()

defineEmits<{ close: [], select: [id: string] }>()

const { t } = useI18n()
const { ago, hops, formatNumber, formatDistance } = useFormat()

// The drawer does not move focus in, and following a via link removes the
// button that had it.
const closeButton = ref<{ $el: HTMLElement } | null>(null)
watch(() => props.row.repeater.id, () => nextTick(() => closeButton.value?.$el.focus()), { immediate: true })

const history = computed(() => props.row.repeater.history)

const stats = computed(() => {
  const snrs = history.value.map(sample => sample.snr)
  if (!snrs.length) return null
  return { average: snrs.reduce((sum, snr) => sum + snr, 0) / snrs.length, lowest: Math.min(...snrs) }
})

const shortKey = computed(() => {
  const id = props.row.repeater.id.toUpperCase()
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
})
</script>

<template>
  <div class="detail">
    <header class="header d-flex align-center ga-3">
      <CompassDial
        class="flex-shrink-0"
        :class="row.repeater.hops || row.outOfRange ? 'text-medium-emphasis' : `text-${row.link?.tone ?? 'primary'}`"
        :bearing="row.bearing"
        :heading="heading"
      />
      <div class="flex-grow-1 min-w-0">
        <h2 class="text-title text-truncate">{{ row.name }}</h2>
        <!-- One line: only the key gets cut short. -->
        <div class="d-flex font-mono text-small text-medium-emphasis text-no-wrap min-w-0 overflow-hidden">
          <span v-if="row.distance !== null" class="flex-shrink-0">{{ formatDistance(row.distance) }} ·&nbsp;</span>
          <span v-if="typeof row.altitude === 'number'" class="flex-shrink-0">{{ $t('repeaters.altitude', { altitude: formatNumber(row.altitude) }) }} ·&nbsp;</span>
          <span class="text-truncate">{{ shortKey }}</span>
        </div>
      </div>
      <v-btn ref="closeButton" :icon="mdiClose" variant="text" :aria-label="$t('common.close')" @click="$emit('close')" />
    </header>

    <template v-if="!row.repeater.hops">
      <div class="d-flex align-center ga-3">
        <MarginGauge :margin="row.link?.value ?? null" :tone="row.link?.tone" />
        <div class="d-flex flex-column align-start ga-1 min-w-0">
          <v-chip v-if="row.outOfRange" size="small" variant="tonal">{{ $t('repeaters.outOfRange') }}</v-chip>
          <v-chip v-else-if="row.link" size="small" variant="tonal" :color="row.link.tone">{{ $t(`margin.${row.link.grade}`) }}</v-chip>
          <span v-if="row.outOfRange" class="text-small text-medium-emphasis">{{ $t('detail.outOfRange') }}</span>
          <span>{{ $t('detail.marginTitle') }}</span>
          <span v-if="spreadingFactor !== null" class="text-small text-medium-emphasis">
            {{ $t('detail.marginHelp', { sf: spreadingFactor, floor: formatNumber(snrFloor(spreadingFactor), 1, 0), fair: MARGIN_FAIR_DB, comfortable: MARGIN_COMFORTABLE_DB }) }}
          </span>
        </div>
      </div>

      <section class="section">
        <div class="section-title">{{ $t('detail.signal') }}</div>
        <div class="stats">
          <VitalStat
            :label="$t('detail.youHearIt')"
            :value="row.repeater.rx ? formatNumber(row.repeater.rx.snr, 2, 0) : $t('common.na')"
            :unit="row.repeater.rx ? 'dB SNR' : undefined"
            :tone="row.rx?.tone"
            :hint="row.repeater.rx ? `RX · ${formatNumber(row.repeater.rx.rssi)} dBm · ${ago(row.repeater.rx.at, now)}` : 'RX'"
          />
          <VitalStat
            :label="$t('detail.itHearsYou')"
            :value="row.repeater.tx ? formatNumber(row.repeater.tx.snr, 2, 0) : $t('common.na')"
            :unit="row.repeater.tx ? 'dB SNR' : undefined"
            :tone="row.tx?.tone"
            :hint="row.repeater.tx ? `TX · ${t('detail.scanned', { ago: ago(row.repeater.tx.at, now) })}` : `TX · ${t('detail.scanToMeasure')}`"
          />
        </div>
      </section>

      <section class="section">
        <div class="section-title">
          <span>{{ $t('detail.reception') }}</span>
          <span class="text-small text-medium-emphasis">{{ $t('detail.packets', { n: formatNumber(history.length) }, history.length) }}</span>
        </div>
        <div v-if="stats" class="stats">
          <VitalStat :label="$t('detail.averageSnr')" :value="formatNumber(stats.average, 1)" unit="dB" />
          <VitalStat :label="$t('detail.lowestSnr')" :value="formatNumber(stats.lowest, 2, 0)" unit="dB" />
        </div>
        <SnrChart v-if="history.length && spreadingFactor !== null" :samples="history" :spreading-factor="spreadingFactor" :now="now" />
        <p v-else class="text-small text-medium-emphasis ma-0">{{ $t('detail.chartEmpty') }}</p>
      </section>
    </template>

    <section v-else class="section">
      <div class="section-title">{{ $t('detail.route') }}</div>
      <p class="text-small text-medium-emphasis ma-0">
        <i18n-t keypath="detail.heardThrough" scope="global">
          <template #hops>{{ hops(row.repeater.hops) }}</template>
          <template #through>
            <button v-if="row.repeater.via" type="button" class="link" @click="$emit('select', row.repeater.via)">{{ row.viaName }}</button>
            <template v-else>{{ $t('detail.unknownRepeater') }}</template>
          </template>
        </i18n-t>
        {{ $t('detail.lastHopOnly') }}
      </p>
    </section>

    <section class="section">
      <dl class="facts text-small">
        <dt class="text-medium-emphasis">{{ $t('detail.lastHeard') }}</dt>
        <dd>{{ ago(row.repeater.lastHeard, now) }}</dd>
        <dt class="text-medium-emphasis">{{ $t('detail.position') }}</dt>
        <dd class="font-mono">
          <a
            v-if="row.position"
            class="link"
            :href="`https://www.google.com/maps/search/?api=1&query=${row.position.lat},${row.position.lon}`"
            target="_blank"
            rel="noopener"
          >
            <!-- Always with a decimal point, a comma would clash with the one between them. -->
            {{ row.position.lat.toFixed(5) }}, {{ row.position.lon.toFixed(5) }}
            <v-icon :icon="mdiOpenInNew" size="12" />
          </a>
          <template v-else>{{ $t('detail.unknown') }}</template>
        </dd>
        <dt class="text-medium-emphasis">{{ $t('detail.groundAltitude') }}</dt>
        <dd class="font-mono">
          <template v-if="typeof row.altitude === 'number'">{{ formatNumber(row.altitude) }} m</template>
          <template v-else-if="row.altitude === undefined">{{ $t('detail.lookingUp') }}</template>
          <template v-else>{{ $t('detail.unknown') }}</template>
        </dd>
        <dt class="text-medium-emphasis">{{ row.repeater.id.length < 64 ? $t('detail.keyPrefix') : $t('detail.publicKey') }}</dt>
        <dd class="font-mono key">{{ row.repeater.id }}</dd>
      </dl>
    </section>
  </div>
</template>

<style scoped lang="scss">
.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px max(16px, env(safe-area-inset-bottom));
}

// Stays on top while the rest scrolls, so the close button is always there.
// Opaque, a blur does not work inside the already blurred panel.
.header {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: -16px -16px 0;
  padding: 16px;
  background: rgb(var(--v-theme-surface));
}

h2 {
  margin: 0;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--glass-border);
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-weight: 500;
}

.link {
  padding: 0;
  text-decoration: none;
  border: 0;
  background: none;
  font: inherit;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}

.facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 16px;
  margin: 0;

  dd {
    margin: 0;
    text-align: right;
  }
}

.key {
  overflow-wrap: anywhere;
}
</style>
