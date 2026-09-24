<script setup lang="ts">
import { mdiAlert, mdiAlertCircle, mdiCheckCircle, mdiChevronRight, mdiPower, mdiRefresh } from '@mdi/js'

// The layout only shows the pages while a node is connected.
const { connection, disconnect } = useMeshCore()
const { t } = useI18n()
const { ago, duration, offset, formatNumber } = useFormat()

const selfInfo = ref<MeshCoreSelfInfo | null>(null)
const device = ref<DeviceSummary & { protocol: number } | null>(null)
const clockOffset = ref<number | null>(null)
const core = ref<MeshCoreStatsCore | null>(null)
const radio = ref<MeshCoreStatsRadio | null>(null)
const packets = ref<MeshCoreStatsPackets | null>(null)
const firstSample = ref<CounterSample | null>(null)
const lastSample = ref<CounterSample | null>(null)
const failed = ref(false)
const refreshing = ref(false)
const now = ref(Date.now())
const { position, altitude, altitudeAccuracy, unavailable: noLocation } = useDevicePosition()
// Only asked when the GPS gives no altitude, so the position leaves the app
// only then.
const elevation = computed(() => altitude.value === null && position.value ? elevationAt(position.value) : undefined)
let clock: ReturnType<typeof setInterval> | undefined

// Sequential on purpose: meshcore.js drops a stats response of the wrong type,
// so two getStats calls in flight can leave one waiting forever.
async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  const conn = connection.value!
  try {
    selfInfo.value ??= await withTimeout(conn.getSelfInfo())
    if (!device.value) {
      const info = await withTimeout(conn.deviceQuery(APP_PROTOCOL_VERSION))
      device.value = { ...parseDeviceInfo(info), protocol: info.firmwareVer }
    }
    const { epochSecs } = await withTimeout(conn.getDeviceTime())
    // The node only reports whole seconds.
    clockOffset.value = epochSecs - Math.floor(Date.now() / 1000)
    core.value = (await withTimeout(conn.getStatsCore())).data
    radio.value = (await withTimeout(conn.getStatsRadio())).data
    packets.value = (await withTimeout(conn.getStatsPackets())).data

    const sample = {
      at: Date.now(),
      recv: packets.value.recv,
      sent: packets.value.sent,
      errors: packets.value.nRecvErrors,
      txAirSecs: radio.value.txAirSecs
    }
    // Counters going backwards mean the node rebooted, so the session restarts.
    if (!firstSample.value || sample.recv < firstSample.value.recv) firstSample.value = sample
    lastSample.value = sample
    failed.value = false
  }
  catch {
    failed.value = true
  }
  refreshing.value = false
}

onMounted(() => {
  refresh()
  clock = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => clearInterval(clock))

const statusText = computed(() => {
  if (refreshing.value) return t('companion.reading')
  if (failed.value) return t('companion.readFailed')
  if (!lastSample.value) return t('companion.reading')
  return t('companion.updated', { ago: ago(lastSample.value.at, now.value) })
})

const battery = computed(() => {
  if (!core.value) return null
  const level = batteryLevel(core.value.batteryMilliVolts)
  if (level >= BATTERY_OK_LEVEL) return { level, tone: 'success', label: t('battery.nominal') } as const
  if (level >= BATTERY_LOW_LEVEL) return { level, tone: 'warning', label: t('battery.low') } as const
  return { level, tone: 'error', label: t('battery.critical') } as const
})

const margin = computed(() => radio.value && selfInfo.value && linkMargin(radio.value.lastSnr, selfInfo.value.radioSf))

// This device's GPS altitude, else the ground under its position, as
// desktops give a position without altitude.
const altitudeStat = computed(() => {
  if (altitude.value !== null) {
    return { value: altitude.value, hint: altitudeAccuracy.value === null ? t('altitude.gps') : t('altitude.gpsAccuracy', { accuracy: formatNumber(altitudeAccuracy.value) }) }
  }
  if (typeof elevation.value === 'number') return { value: elevation.value, hint: t('altitude.ground') }
  if (noLocation.value) return { value: null, hint: t('altitude.blocked') }
  if (!position.value) return { value: null, hint: t('altitude.waiting') }
  return { value: null, hint: elevation.value === null ? t('altitude.lookupFailed') : t('altitude.lookingUp') }
})

const clockTone = computed((): Tone | undefined => {
  const drift = Math.abs(clockOffset.value ?? 0)
  if (drift < CLOCK_DRIFT_WARNING_SECS) return undefined
  return drift < CLOCK_DRIFT_BAD_SECS ? 'warning' : 'error'
})

function errorTone(rate: number | null): Tone | undefined {
  if (!rate || rate < ERROR_RATE_WARNING) return undefined
  return rate < ERROR_RATE_BAD ? 'warning' : 'error'
}

// Feeds the health check on recent receive errors.
const session = computed(() => firstSample.value && lastSample.value && sessionErrors(firstSample.value, lastSample.value))
const errorRate = computed(() => packets.value && receiveErrorRate(packets.value))
const txShare = computed(() => radio.value && core.value && airtimeShare(radio.value.txAirSecs, core.value.uptimeSecs))

interface HealthCheck {
  name: string
  value: string
  tone: Tone
  status: string
  detail: string
}

function errorCheck(name: string, rate: number, bad: number, detail: string): HealthCheck {
  const tone = errorTone(rate) ?? 'success'
  return {
    name,
    value: `${formatNumber(rate * 100, 1)} %`,
    tone,
    status: t(`checks.errors.${tone}`),
    detail: t(detail, { n: formatNumber(bad) }, bad)
  }
}

const checks = computed(() => {
  if (!core.value || !battery.value) return null
  const list: HealthCheck[] = [{
    name: t('checks.battery'),
    value: `${formatNumber(core.value.batteryMilliVolts / 1000, 2)} V`,
    tone: battery.value.tone,
    status: battery.value.label,
    detail: battery.value.tone === 'success'
      ? t('checks.batteryCharge', { percent: formatNumber(battery.value.level * 100) })
      : `${t('checks.batteryCharge', { percent: formatNumber(battery.value.level * 100) })} ${t('checks.plugIn')}`
  }]
  if (margin.value && radio.value && selfInfo.value) {
    list.push({
      name: t('checks.margin'),
      value: `${formatNumber(margin.value.value, 1)} dB`,
      tone: margin.value.tone,
      status: t(`margin.${margin.value.grade}`),
      detail: t('checks.marginDetail', { snr: formatNumber(radio.value.lastSnr, 1), sf: selfInfo.value.radioSf, floor: formatNumber(snrFloor(selfInfo.value.radioSf), 1), fair: MARGIN_FAIR_DB })
    })
  }
  if (clockOffset.value !== null) {
    list.push({
      name: t('checks.clock'),
      value: offset(clockOffset.value),
      tone: clockTone.value ?? 'success',
      status: clockTone.value ? t('checks.clockOff') : t('checks.clockOk'),
      detail: clockTone.value ? t('checks.clockOffDetail') : t('checks.clockOkDetail')
    })
  }
  if (packets.value && errorRate.value !== null) {
    list.push(errorCheck(t('checks.errorsSinceBoot'), errorRate.value, packets.value.nRecvErrors, 'checks.errorsSinceBootDetail'))
  }
  if (session.value) {
    list.push(errorCheck(t('checks.errorsSession'), session.value.rate, session.value.errors, 'checks.errorsSessionDetail'))
  }
  return list
})

const issues = computed(() => checks.value?.filter(check => check.tone !== 'success') ?? [])

const health = computed(() => {
  if (!checks.value) return null
  if (issues.value.some(issue => issue.tone === 'error')) return { tone: 'error', label: t('health.problem') } as const
  if (issues.value.length) return { tone: 'warning', label: t('health.attention') } as const
  return { tone: 'success', label: t('health.healthy') } as const
})

const TONE_ICONS = { success: mdiCheckCircle, warning: mdiAlert, error: mdiAlertCircle }
</script>

<template>
  <v-container class="page-width cards">
    <v-card class="companion full-row">
      <v-progress-linear :active="refreshing" indeterminate absolute location="top" color="primary" height="4" />
      <div class="d-flex align-center ga-2">
        <div class="flex-grow-1 min-w-0">
          <div class="text-title">{{ selfInfo?.name ?? $t('nav.companion') }}</div>
          <!-- Kept while loading so the card does not grow once the node answers. -->
          <div class="font-mono text-small text-medium-emphasis">
            <template v-if="selfInfo">{{ formatNumber(selfInfo.radioFreq / 1000, 3) }} MHz · {{ formatNumber(selfInfo.radioBw / 1000, 1, 0) }} kHz</template>
            <template v-else>&nbsp;</template>
          </div>
        </div>
        <v-btn
          :icon="mdiRefresh"
          variant="tonal"
          color="primary"
          size="44"
          :aria-label="$t('companion.refresh')"
          :loading="refreshing"
          @click="refresh"
        />
        <v-btn
          :icon="mdiPower"
          variant="tonal"
          color="error"
          size="44"
          :aria-label="$t('companion.disconnect')"
          @click="disconnect"
        />
      </div>
      <div class="status-row d-flex align-center ga-2 text-small text-medium-emphasis">
        <v-badge dot inline :class="{ pulse: refreshing }" :color="refreshing ? 'primary' : failed ? 'error' : 'success'" />
        <span>{{ statusText }}</span>
        <v-dialog v-if="health" max-width="440" scrollable opacity="0.6" transition="fade-transition" :disabled="!issues.length">
          <template #activator="{ props: activator }">
            <v-chip
              v-bind="activator"
              :tag="issues.length ? 'button' : 'span'"
              class="ms-auto"
              variant="tonal"
              :link="!!issues.length"
              :color="health.tone"
              :prepend-icon="TONE_ICONS[health.tone]"
              :append-icon="issues.length ? mdiChevronRight : undefined"
            >
              {{ health.label }}
            </v-chip>
          </template>
          <template #default="{ isActive }">
            <v-card class="health-dialog" :title="health.label">
              <v-card-text class="d-flex flex-column ga-4">
                <div v-for="check in issues" :key="check.name" class="d-flex ga-3">
                  <v-icon :icon="TONE_ICONS[check.tone]" :color="check.tone" />
                  <div class="flex-grow-1 min-w-0">
                    <div class="d-flex justify-space-between ga-2">
                      <span class="font-weight-medium">{{ check.name }}</span>
                      <span class="font-mono text-no-wrap" :class="`text-${check.tone}`">{{ check.value }}</span>
                    </div>
                    <div class="text-small" :class="`text-${check.tone}`">{{ check.status }}</div>
                    <div class="text-small text-medium-emphasis mt-1">{{ check.detail }}</div>
                  </div>
                </div>
              </v-card-text>
              <v-card-actions>
                <v-btn :text="$t('common.close')" @click="isActive.value = false" />
              </v-card-actions>
            </v-card>
          </template>
        </v-dialog>
      </div>
    </v-card>

    <VitalsCard v-if="selfInfo" :title="$t('settings.title')" :chip="`SF${selfInfo.radioSf} · CR 4/${selfInfo.radioCr}`">
      <VitalStat :label="$t('settings.frequency')" :value="formatNumber(selfInfo.radioFreq / 1000, 3)" unit="MHz" />
      <VitalStat :label="$t('settings.bandwidth')" :value="formatNumber(selfInfo.radioBw / 1000, 1, 0)" unit="kHz" />
      <VitalStat :label="$t('settings.txPower')" :value="formatNumber(selfInfo.txPower)" unit="dBm" :hint="$t('settings.txPowerMax', { max: selfInfo.maxTxPower })" />
      <VitalStat :label="$t('settings.floor')" :value="formatNumber(snrFloor(selfInfo.radioSf), 1, 0)" unit="dB" :hint="$t('settings.floorFor', { sf: selfInfo.radioSf })" />
    </VitalsCard>

    <VitalsCard v-if="device" :title="$t('device.title')" :chip="$t('device.protocol', { version: device.protocol })">
      <VitalStat class="full-row" :label="$t('device.model')" :value="device.model ?? $t('common.unknown')" />
      <VitalStat :label="$t('device.firmware')" :value="device.version ?? $t('common.unknown')" :hint="device.buildDate ? $t('device.built', { date: device.buildDate }) : undefined" />
      <VitalStat v-if="clockOffset !== null" :label="$t('device.clockOffset')" :value="offset(clockOffset)" :tone="clockTone" :hint="$t('device.clockOffsetHint')" />
      <VitalStat
        :label="$t('altitude.label')"
        :value="altitudeStat.value === null ? $t('common.na') : formatNumber(altitudeStat.value)"
        :unit="altitudeStat.value === null ? undefined : 'm'"
        :hint="altitudeStat.hint"
      />
    </VitalsCard>

    <VitalsCard v-if="core && battery" :title="$t('health.title')" :chip="battery.label" :chip-color="battery.tone">
      <VitalStat :label="$t('checks.battery')" :value="formatNumber(core.batteryMilliVolts / 1000, 2)" unit="V" :tone="battery.tone" :hint="$t('battery.charged', { percent: formatNumber(battery.level * 100) })" />
      <VitalStat :label="$t('health.uptime')" :value="duration(core.uptimeSecs)" />
      <v-progress-linear class="full-row" :model-value="battery.level * 100" :color="battery.tone" height="4" rounded />
      <VitalStat :label="$t('health.queue')" :value="formatNumber(core.queueLen)" :hint="core.queueLen ? $t('health.queueWaiting') : $t('health.queueEmpty')" />
    </VitalsCard>

    <VitalsCard v-if="radio" :title="$t('reception.title')" :chip="margin ? $t(`margin.${margin.grade}`) : undefined" :chip-color="margin?.tone">
      <VitalStat :label="$t('reception.noiseFloor')" :value="formatNumber(radio.noiseFloor)" unit="dBm" />
      <VitalStat :label="$t('reception.lastRssi')" :value="formatNumber(radio.lastRssi)" unit="dBm" />
      <VitalStat :label="$t('reception.lastSnr')" :value="formatNumber(radio.lastSnr, 1)" unit="dB" />
      <VitalStat v-if="margin" :label="$t('reception.margin')" :value="formatNumber(margin.value, 1)" unit="dB" :tone="margin.tone" />
    </VitalsCard>

    <VitalsCard v-if="packets" :title="$t('traffic.title')" :chip="$t('traffic.sinceBoot')">
      <VitalStat :label="$t('traffic.received')" :value="formatNumber(packets.recv)" :hint="$t('traffic.split', { direct: formatNumber(packets.nRecvDirect), flood: formatNumber(packets.nRecvFlood) })" />
      <VitalStat :label="$t('traffic.sent')" :value="formatNumber(packets.sent)" :hint="$t('traffic.split', { direct: formatNumber(packets.nSentDirect), flood: formatNumber(packets.nSentFlood) })" />
      <VitalStat :label="$t('traffic.errors')" :value="errorRate === null ? $t('common.na') : formatNumber(errorRate * 100, 1)" :unit="errorRate === null ? undefined : '%'" :tone="errorTone(errorRate)" :hint="$t('traffic.badPackets', { n: formatNumber(packets.nRecvErrors) }, packets.nRecvErrors)" />
      <VitalStat v-if="radio" :label="$t('traffic.airtime')" :value="txShare === null ? $t('common.na') : formatNumber(txShare * 100, 2)" :unit="txShare === null ? undefined : '% TX'" :hint="`RX ${formatNumber(radio.rxAirSecs / 60)} min`" />
    </VitalsCard>
  </v-container>
</template>

<style scoped lang="scss">
@use '~/assets/scss/variables' as *;

.companion {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

// Opaque, the glass lets the cards behind show through the text.
.health-dialog {
  background: rgb(var(--v-theme-surface)) !important;
}
.cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;

  @media (min-width: $breakpoint-sm) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.full-row {
  grid-column: 1 / -1;
  margin: 0;
}
</style>
