<script setup lang="ts">
const props = defineProps<{
  /** Degrees from north, null when the direction is unknown. */
  bearing: number | null
  /** Where the device faces, null to keep north up. */
  heading: number | null
}>()

const POINTS = [
  { key: 'n', angle: 0 },
  { key: 'e', angle: 90 },
  { key: 's', angle: 180 },
  { key: 'w', angle: 270 }
]

const { t } = useI18n()
// Apart from the heading, which changes many times a second.
const labels = computed(() => POINTS.map(({ key }) => t(`compass.${key}`)))

// Letters move around the dial but stay upright.
const points = computed(() => POINTS.map(({ key, angle }, i) => {
  const radians = (angle - (props.heading ?? 0)) * Math.PI / 180
  return { key, north: !angle, label: labels.value[i], x: 17 * Math.sin(radians), y: -17 * Math.cos(radians) }
}))
</script>

<template>
  <svg class="dial" viewBox="-24 -24 48 48" width="48" height="48" aria-hidden="true">
    <circle r="23" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-opacity="0.35" />
    <text
      v-for="point in points"
      :key="point.key"
      :x="point.x"
      :y="point.y"
      :fill-opacity="point.north ? 1 : 0.6"
      :font-weight="point.north ? 700 : 500"
      fill="currentColor"
      font-size="8"
      text-anchor="middle"
      dominant-baseline="central"
    >
      {{ point.label }}
    </text>
    <path
      v-if="bearing !== null"
      d="M0 -10 L6 8 L0 4 L-6 8 Z"
      fill="currentColor"
      :transform="`rotate(${bearing - (heading ?? 0)})`"
    />
    <text v-else fill="currentColor" font-size="12" text-anchor="middle" dominant-baseline="central">?</text>
  </svg>
</template>

<style scoped lang="scss">
.dial {
  display: block;
}
</style>
