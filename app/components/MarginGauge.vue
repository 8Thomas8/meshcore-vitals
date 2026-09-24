<script setup lang="ts">
const props = defineProps<{
  /** dB above the demodulation floor, null when unknown. */
  margin: number | null
  tone?: Tone
}>()

// A 270° arc open at the bottom.
const RADIUS = 46
const ARC = 0.75 * 2 * Math.PI * RADIUS
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const filled = computed(() => props.margin === null ? 0 : Math.min(1, Math.max(0, props.margin / MARGIN_GAUGE_FULL_DB)) * ARC)
const { t } = useI18n()
const { formatNumber } = useFormat()
const label = computed(() => props.margin === null ? t('common.na') : `${props.margin > 0 ? '+' : ''}${formatNumber(props.margin, 1)}`)
</script>

<template>
  <svg
    class="gauge"
    :class="tone && `text-${tone}`"
    width="120"
    height="120"
    viewBox="0 0 120 120"
    role="img"
    :aria-label="margin === null ? $t('gauge.unknown') : $t('gauge.label', { margin: label })"
  >
    <circle class="track" cx="60" cy="60" :r="RADIUS" :stroke-dasharray="`${ARC} ${CIRCUMFERENCE}`" transform="rotate(135 60 60)" />
    <circle v-if="filled" class="fill" cx="60" cy="60" :r="RADIUS" :stroke-dasharray="`${filled} ${CIRCUMFERENCE}`" transform="rotate(135 60 60)" />
    <text class="value" x="60" y="62" text-anchor="middle">{{ label }}</text>
    <text class="unit" x="60" y="80" text-anchor="middle">{{ $t('gauge.unit') }}</text>
  </svg>
</template>

<style scoped lang="scss">
.gauge {
  display: block;
  flex-shrink: 0;
}

circle {
  fill: none;
  stroke-width: 10;
  stroke-linecap: round;
}

.track {
  stroke: rgba(var(--v-theme-on-surface), 0.14);
}

.fill {
  stroke: currentColor;
}

.value {
  fill: rgb(var(--v-theme-on-surface));
  font-size: 24px;
  font-weight: 700;
}

.unit {
  fill: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 11px;
}
</style>
