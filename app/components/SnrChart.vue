<script setup lang="ts">
const props = defineProps<{
  samples: readonly Readonly<RxSample>[]
  spreadingFactor: number
  now: number
}>()

const { t } = useI18n()
const { ago, formatNumber } = useFormat()

const HEIGHT = 150
const PAD = { top: 8, right: 12, bottom: 22, left: 34 }

const root = ref<HTMLElement | null>(null)
const width = ref(320)
// By time, the history shifts once full.
const hover = ref<number | null>(null)
let observer: ResizeObserver | undefined

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    width.value = entry!.contentRect.width
  })
  observer.observe(root.value!)
})

onBeforeUnmount(() => observer?.disconnect())

const floor = computed(() => snrFloor(props.spreadingFactor))

// Clean 5 dB ticks, 10 dB when the range is wide, always showing the floor
// with some of the lost zone under it.
function yDomain(step: number) {
  const snrs = props.samples.map(sample => sample.snr)
  const low = Math.floor(Math.min(floor.value - 1, ...snrs) / step) * step
  const high = Math.ceil(Math.max(floor.value + step, ...snrs) / step) * step
  return { low, high, step }
}

const chart = computed(() => {
  let domain = yDomain(5)
  if (domain.high - domain.low > 30) domain = yDomain(10)
  const { low, high, step } = domain
  const start = props.samples[0]?.at ?? props.now
  const end = Math.max(props.now, start + 60_000)
  const plotWidth = width.value - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (at: number) => PAD.left + (at - start) / (end - start) * plotWidth
  const y = (snr: number) => PAD.top + (high - snr) / (high - low) * plotHeight
  const points = props.samples.map(sample => ({ x: x(sample.at), y: y(sample.snr) }))
  const line = points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join('')
  const bottom = HEIGHT - PAD.bottom
  return {
    start,
    points,
    line,
    area: points.length > 1 ? `${line}L${points.at(-1)!.x},${bottom}L${points[0]!.x},${bottom}Z` : '',
    ticks: Array.from({ length: (high - low) / step + 1 }, (_, i) => ({ value: low + i * step, y: y(low + i * step) })),
    floorY: y(floor.value),
    bottom,
    right: width.value - PAD.right
  }
})

// The crosshair snaps to the nearest sample.
function onPointer(event: PointerEvent) {
  const { points } = chart.value
  if (!points.length) return
  let nearest = 0
  points.forEach((point, i) => {
    if (Math.abs(point.x - event.offsetX) < Math.abs(points[nearest]!.x - event.offsetX)) nearest = i
  })
  hover.value = props.samples[nearest]!.at
}

const tooltip = computed(() => {
  const index = props.samples.findIndex(sample => sample.at === hover.value)
  const sample = props.samples[index]
  const point = chart.value.points[index]
  if (!sample || !point) return null
  return { sample, point, left: Math.min(Math.max(point.x - 70, 0), width.value - 140) }
})

const summary = computed(() => {
  const snrs = props.samples.map(sample => sample.snr)
  return t('chart.summary', {
    n: snrs.length,
    min: formatNumber(Math.min(...snrs), 2),
    max: formatNumber(Math.max(...snrs), 2),
    sf: props.spreadingFactor,
    floor: formatNumber(floor.value, 1)
  }, snrs.length)
})
</script>

<template>
  <div ref="root" class="chart">
    <svg
      :width="width"
      :height="HEIGHT"
      role="img"
      :aria-label="summary"
      @pointermove="onPointer"
      @pointerdown="onPointer"
      @pointerleave="hover = null"
    >
      <g class="grid">
        <line v-for="tick in chart.ticks" :key="tick.value" :x1="PAD.left" :x2="chart.right" :y1="tick.y" :y2="tick.y" />
      </g>
      <g class="axis">
        <text v-for="tick in chart.ticks" :key="tick.value" :x="PAD.left - 6" :y="tick.y" text-anchor="end" dominant-baseline="central">
          {{ formatNumber(tick.value) }}
        </text>
        <text :x="PAD.left" :y="HEIGHT - 4">{{ ago(chart.start, now) }}</text>
        <text :x="chart.right" :y="HEIGHT - 4" text-anchor="end">{{ $t('chart.now') }}</text>
      </g>
      <rect class="floor-zone" :x="PAD.left" :y="chart.floorY" :width="chart.right - PAD.left" :height="chart.bottom - chart.floorY" />
      <line class="floor" :x1="PAD.left" :x2="chart.right" :y1="chart.floorY" :y2="chart.floorY" />
      <text class="axis" :x="chart.right - 4" :y="chart.floorY - 5" text-anchor="end">{{ $t('chart.floor', { sf: spreadingFactor }) }}</text>
      <path v-if="chart.area" class="area" :d="chart.area" />
      <path class="line" :d="chart.line" />
      <line v-if="tooltip" class="crosshair" :x1="tooltip.point.x" :x2="tooltip.point.x" :y1="PAD.top" :y2="chart.bottom" />
      <circle
        v-if="tooltip ?? chart.points.at(-1)"
        class="dot"
        :cx="(tooltip?.point ?? chart.points.at(-1)!).x"
        :cy="(tooltip?.point ?? chart.points.at(-1)!).y"
        r="4"
      />
    </svg>
    <div v-if="tooltip" class="tooltip" :style="{ left: `${tooltip.left}px` }">
      <div class="font-mono font-weight-medium">{{ formatNumber(tooltip.sample.snr, 2, 0) }} dB</div>
      <div class="text-small text-medium-emphasis">{{ formatNumber(tooltip.sample.rssi) }} dBm · {{ ago(tooltip.sample.at, now) }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chart {
  position: relative;
  touch-action: pan-y;

  svg {
    display: block;
  }
}

.grid line {
  stroke: rgba(var(--v-theme-on-surface), 0.1);
}

.axis,
.axis text {
  fill: rgba(var(--v-theme-on-surface), 0.6);
  font-family: var(--font-mono);
  font-size: 10px;
}

.floor-zone {
  fill: rgba(var(--v-theme-error), 0.1);
}

.floor {
  stroke: rgb(var(--v-theme-error));
  stroke-opacity: 0.7;
}

.area {
  fill: rgba(var(--v-theme-primary), 0.1);
}

.line {
  fill: none;
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.crosshair {
  stroke: rgba(var(--v-theme-on-surface), 0.4);
}

.dot {
  fill: rgb(var(--v-theme-primary));
  stroke: rgb(var(--v-theme-surface));
  stroke-width: 2;
}

.tooltip {
  position: absolute;
  top: 0;
  width: 140px;
  padding: 6px 10px;
  border-radius: 10px;
  pointer-events: none;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--glass-border);
}
</style>
