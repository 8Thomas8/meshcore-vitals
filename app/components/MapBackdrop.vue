<script setup lang="ts">
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

const props = defineProps<{
  here: Position
  rows: RepeaterRow[]
  /** The card on top of the map, which it frames below. */
  below: HTMLElement | null
  /** The list card at the bottom, the map frames above it. */
  list: HTMLElement | null
  /** When the fix asked for at a scan came in. */
  locatedAt: number | null
  /** The companion's own name, labelled on your position. */
  companionName: string | null
}>()

// The dark style repainted with the app's colors.
const PAINT: [RegExp, Parameters<MapLibreMap['setPaintProperty']>[1], string][] = [
  [/^background$/, 'background-color', THEME_COLORS.background],
  [/^water$/, 'fill-color', '#0f2b47'],
  [/^waterway$/, 'line-color', '#0f2b47'],
  [/^(landuse_park|landcover_wood)$/, 'fill-color', '#10241f'],
  [/^landuse_residential$/, 'fill-color', '#101826'],
  [/^building$/, 'fill-color', '#141c2a'],
  [/^highway_(minor|path)$/, 'line-color', '#1d2a40'],
  [/^highway_(major|motorway)_(inner|subtle)$/, 'line-color', '#2f4262'],
  [/^highway_(major|motorway)_casing$/, 'line-color', '#243249']
]

const { t } = useI18n()
const { hops, formatNumber, formatDistance } = useFormat()

const container = ref<HTMLElement | null>(null)
// Where the card on top ends, its height depends on the screen and on what it says.
const top = ref(MAP_TOP_FALLBACK)
let map: MapLibreMap | undefined
let MarkerClass: typeof Marker | undefined
// Once you move the map yourself, it stops reframing on every update.
let movedByUser = false
let unmounted = false
let attributionTimer: ReturnType<typeof setTimeout> | undefined
const markers = new Map<string, Marker>()
// The repeater whose label you tapped, shown in full whatever it covers.
const pinned = ref<string | null>(null)

// Relayed and out-of-range repeaters, whose signal is not current.
const MUTED_COLOR = '#8a94a6'

// GPS fixes drift every second, the map only follows a real move, or the fix
// taken at a scan.
const stableHere = shallowRef(props.here)
watch(() => props.here, (next) => {
  if (distanceMeters(stableHere.value, next) > MAP_FOLLOW_DISTANCE_M) stableHere.value = next
})
watch(() => props.locatedAt, () => {
  stableHere.value = props.here
})

function colorOf(row: RepeaterRow): string {
  if (row.repeater.hops || row.outOfRange) return MUTED_COLOR
  return row.link ? THEME_COLORS[row.link.tone] : THEME_COLORS.primary
}

const features = computed(() => {
  const here: [number, number] = [stableHere.value.lon, stableHere.value.lat]
  const placed = props.rows.filter(row => row.position)
  return {
    type: 'FeatureCollection' as const,
    features: [
      // Solid from you to the repeaters in direct range.
      ...placed.filter(row => !row.repeater.hops && !row.outOfRange).map(row => ({
        type: 'Feature' as const,
        properties: { kind: 'direct', color: colorOf(row) },
        geometry: { type: 'LineString' as const, coordinates: [here, [row.position!.lon, row.position!.lat]] }
      })),
      // Dashed from the repeater in direct range a relayed one is reached through.
      // A path hash can match several repeaters, then no line is drawn.
      ...placed.flatMap((row) => {
        const via = row.repeater.via
        const matches = via ? placed.filter(other => !other.repeater.hops && other.repeater.id.startsWith(via)) : []
        if (matches.length !== 1) return []
        const through = matches[0]!
        return [{
          type: 'Feature' as const,
          // Coloured like the direct link it hangs from.
          properties: { kind: 'relayed', color: colorOf(through) },
          geometry: { type: 'LineString' as const, coordinates: [[through.position!.lon, through.position!.lat], [row.position!.lon, row.position!.lat]] }
        }]
      }),
      ...placed.map(row => ({
        type: 'Feature' as const,
        properties: { kind: 'repeater', color: colorOf(row), id: row.repeater.id, direct: !row.repeater.hops && !row.outOfRange },
        geometry: { type: 'Point' as const, coordinates: [row.position!.lon, row.position!.lat] }
      })),
      { type: 'Feature' as const, properties: { kind: 'here', color: THEME_COLORS.primary }, geometry: { type: 'Point' as const, coordinates: here } }
    ]
  }
})

const labels = computed(() => props.rows.filter(row => row.position).map((row) => {
  const { repeater } = row
  const way = (snr: number | undefined, margin: LinkMargin | null) =>
    snr === undefined ? { text: t('common.na'), color: null } : { text: `${formatNumber(snr, 1, 0)} dB`, color: margin ? THEME_COLORS[margin.tone] : null }
  return {
    id: repeater.id,
    lngLat: [row.position!.lon, row.position!.lat] as [number, number],
    name: row.name,
    meta: [row.distance !== null && formatDistance(row.distance), typeof row.altitude === 'number' && t('repeaters.altitude', { altitude: formatNumber(row.altitude) })].filter(Boolean).join(' · '),
    hops: repeater.hops ? hops(repeater.hops) : row.outOfRange ? t('repeaters.outOfRange') : null,
    rx: way(repeater.rx?.snr, row.rx),
    tx: way(repeater.tx?.snr, row.tx),
    color: colorOf(row)
  }
}))

// Names come from adverts, so they go in as text, never as HTML.
function labelElement(): HTMLElement {
  const element = document.createElement('div')
  element.className = 'map-label'
  element.innerHTML = `
    <span class="map-label-name"><span class="map-label-dot"></span><span data-name></span></span>
    <span class="map-label-detail" data-meta></span>
    <span class="map-label-detail" data-hops></span>
    <span class="map-label-detail" data-signal>RX <b data-rx></b> · TX <b data-tx></b></span>`
  return element
}

let companionMarker: Marker | undefined

// Only its name, placed around your dot like the repeaters' labels.
function syncCompanionLabel() {
  if (!map || !MarkerClass) return
  const lngLat: [number, number] = [stableHere.value.lon, stableHere.value.lat]
  if (!props.companionName) {
    companionMarker?.remove()
    companionMarker = undefined
    return
  }
  if (!companionMarker) {
    const element = document.createElement('div')
    element.className = 'map-label map-label-companion'
    element.innerHTML = '<span class="map-label-name"><span class="map-label-dot"></span><span data-name></span></span>'
    companionMarker = new MarkerClass({ element }).setLngLat(lngLat).addTo(map)
  }
  companionMarker.setLngLat(lngLat)
  companionMarker.getElement().querySelector<HTMLElement>('[data-name]')!.textContent = props.companionName
  declutter()
}

function syncLabels() {
  if (!map || !MarkerClass) return
  const seen = new Set<string>()
  for (const label of labels.value) {
    seen.add(label.id)
    let marker = markers.get(label.id)
    if (!marker) {
      const element = labelElement()
      const { id } = label
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        togglePin(id)
      })
      marker = new MarkerClass({ element }).setLngLat(label.lngLat).addTo(map)
      markers.set(id, marker)
    }
    marker.setLngLat(label.lngLat)
    const element = marker.getElement()
    const part = (name: string) => element.querySelector<HTMLElement>(`[data-${name}]`)!
    part('name').textContent = label.name
    part('meta').textContent = label.meta
    part('meta').hidden = !label.meta
    part('hops').textContent = label.hops ?? ''
    part('hops').hidden = !label.hops
    part('signal').hidden = !!label.hops
    for (const way of ['rx', 'tx'] as const) {
      part(way).textContent = label[way].text
      part(way).style.color = label[way].color ?? ''
    }
    element.querySelector<HTMLElement>('.map-label-dot')!.style.background = label.color
  }
  for (const [id, marker] of markers) {
    if (seen.has(id)) continue
    marker.remove()
    markers.delete(id)
  }
  declutter()
}

function togglePin(id: string) {
  pinned.value = id === pinned.value ? null : id
}

// Your companion's label goes first, then the tapped one, then the others in
// the list's order, best direct links first. Each takes the first place around its dot in full view
// between the cards where it covers no link, no dot, no map control and no
// label already shown, in full or else reduced to its name. With no such
// place it is hidden until you zoom in or tap its dot.
function declutter() {
  if (!map) return
  const project = (lngLat: [number, number]): ScreenPoint => {
    const { x, y } = map!.project(lngLat)
    return [x, y]
  }
  const links = features.value.features.flatMap(feature =>
    feature.geometry.type === 'LineString' ? [[project(feature.geometry.coordinates[0] as [number, number]), project(feature.geometry.coordinates[1] as [number, number])] as [ScreenPoint, ScreenPoint]] : [])
  const dots: Box[] = features.value.features.flatMap((feature) => {
    if (feature.geometry.type !== 'Point') return []
    const [x, y] = project(feature.geometry.coordinates as [number, number])
    return [{ left: x - MAP_DOT_CLEARANCE, top: y - MAP_DOT_CLEARANCE, right: x + MAP_DOT_CLEARANCE, bottom: y + MAP_DOT_CLEARANCE }]
  })
  const controls: Box[] = [...container.value!.querySelectorAll('.maplibregl-ctrl')].map(control => control.getBoundingClientRect())
  const taken = [...dots, ...controls]
  const { clientWidth, clientHeight } = map.getContainer()
  const view: Box = { left: 0, top: top.value, right: clientWidth, bottom: bottomEdge(clientHeight) }
  // Yours goes first and always shows, off the links if it can.
  if (companionMarker) {
    const element = companionMarker.getElement()
    const placements = labelPlacements(project([stableHere.value.lon, stableHere.value.lat]), element.offsetWidth, element.offsetHeight, MAP_LABEL_GAP, view)
    const place = freePlacement(placements, taken, links, view) ?? bestPlacement(placements, taken, view)
    companionMarker.setOffset(place.offset)
    taken.push(place.box)
  }
  const order = [...labels.value].sort((a, b) => Number(b.id === pinned.value) - Number(a.id === pinned.value))
  for (const label of order) {
    const marker = markers.get(label.id)
    if (!marker) continue
    const element = marker.getElement()
    const point = project(label.lngLat)
    const placements = (compact: boolean) => {
      element.classList.toggle('map-label-compact', compact)
      return labelPlacements(point, element.offsetWidth, element.offsetHeight, MAP_LABEL_GAP, view)
    }
    const isPinned = label.id === pinned.value
    const place = isPinned
      ? bestPlacement(placements(false), taken, view)
      : freePlacement(placements(false), taken, links, view) ?? freePlacement(placements(true), taken, links, view)
    element.classList.toggle('map-label-pinned', isPinned)
    element.style.visibility = place ? '' : 'hidden'
    if (!place) continue
    marker.setOffset(place.offset)
    taken.push(place.box)
  }
}

function measure() {
  if (props.below) top.value = Math.round(props.below.getBoundingClientRect().bottom)
}

// Where the list starts, measured since it folds down and the menu under it
// takes room too.
function bottomEdge(height: number): number {
  return Math.round(props.list ? props.list.getBoundingClientRect().top : height * (1 - LIST_MAX_HEIGHT_SHARE))
}

// Keeps you and every placed repeater in view between the cards, with room
// around for the labels.
function frame() {
  measure()
  if (!map || movedByUser) return
  const points = features.value.features.filter(feature => feature.geometry.type === 'Point').map(feature => feature.geometry.coordinates as [number, number])
  const lons = points.map(([lon]) => lon)
  const lats = points.map(([, lat]) => lat)
  // Under the coverage card and above the capped list, shrunk on short screens
  // where the map could not fit anything otherwise.
  const height = map.getContainer().clientHeight
  const above = top.value + MAP_EDGE_MARGIN
  const bottom = height - bottomEdge(height) + MAP_EDGE_MARGIN
  // Leaves at least MAP_MIN_FRAME_HEIGHT px of map to frame in.
  const fit = Math.min(1, (height - MAP_MIN_FRAME_HEIGHT) / (above + bottom))
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], {
    padding: { top: above * fit, bottom: bottom * fit, left: MAP_SIDE_MARGIN, right: MAP_SIDE_MARGIN },
    maxZoom: 14,
    duration: 0
  })
}

onMounted(async () => {
  const { AttributionControl, Map, Marker, setWorkerUrl } = await import('maplibre-gl')
  if (unmounted) return
  MarkerClass = Marker
  // Its worker ships as a separate file the bundler does not pick up alone.
  setWorkerUrl(workerUrl)
  map = new Map({
    container: container.value!,
    style: MAP_STYLE_URL,
    center: [stableHere.value.lon, stableHere.value.lat],
    zoom: 12,
    keyboard: false,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
    // Set once: the language can only change from pages without the map.
    locale: {
      'Map.Title': t('map.title'),
      'AttributionControl.ToggleAttribution': t('map.toggleAttribution')
    }
  })
  // The bottom corners sit under the list and the menu. Shown in full at first,
  // then folded to its button after a few seconds or once you touch the map,
  // as OpenStreetMap's attribution guidelines allow. The labels move into the
  // room it leaves, and out of its way when you open it again.
  const attribution = new AttributionControl({ compact: true })
  map.addControl(attribution, 'top-right')
  const attributionElement = container.value!.querySelector('.maplibregl-ctrl-attrib')!
  const foldAttribution = () => {
    clearTimeout(attributionTimer)
    attributionElement.classList.remove('maplibregl-compact-show')
  }
  attributionTimer = setTimeout(foldAttribution, MAP_ATTRIBUTION_FOLD_MS)
  controlObserver?.observe(attributionElement)
  map.on('resize', frame)
  map.on('moveend', declutter)
  // A tap on a dot shows its label in full, a tap elsewhere lets it go. In a
  // cluster, the dot closest to the finger wins.
  map.on('click', ({ point }) => {
    const { x, y } = point
    const hits = map!.queryRenderedFeatures([[x - MAP_TAP_RADIUS, y - MAP_TAP_RADIUS], [x + MAP_TAP_RADIUS, y + MAP_TAP_RADIUS]], { layers: ['repeaters'] })
    const distance = (feature: typeof hits[number]) => map!.project((feature.geometry as { coordinates: [number, number] }).coordinates).dist(point)
    const hit = hits.sort((a, b) => distance(a) - distance(b))[0]
    if (hit) togglePin(hit.properties.id)
    else pinned.value = null
    foldAttribution()
  })
  map.on('mouseenter', 'repeaters', () => {
    map!.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'repeaters', () => {
    map!.getCanvas().style.cursor = ''
  })
  map.on('movestart', (event) => {
    if (!event.originalEvent) return
    movedByUser = true
    foldAttribution()
  })
  map.on('load', () => {
    for (const layer of map!.getStyle().layers) {
      const paint = PAINT.find(([id]) => id.test(layer.id))
      if (paint) map!.setPaintProperty(layer.id, paint[1], paint[2])
      if (layer.type === 'symbol') map!.setPaintProperty(layer.id, 'text-color', 'rgba(255, 255, 255, 0.4)')
    }
    map!.addSource('mesh', { type: 'geojson', data: features.value })
    // Apart: line metrics, which the flow needs, shrink the dashes of the
    // relayed links.
    map!.addSource('flow', { type: 'geojson', data: features.value, lineMetrics: true })
    map!.addLayer({
      id: 'direct',
      type: 'line',
      source: 'mesh',
      filter: ['==', ['get', 'kind'], 'direct'],
      paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.7 }
    })
    map!.addLayer({
      id: 'relayed',
      type: 'line',
      source: 'mesh',
      filter: ['==', ['get', 'kind'], 'relayed'],
      paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.7, 'line-dasharray': [4, 4] }
    })
    // Over the lines, a band of light that runs along each of them towards you.
    map!.addLayer({
      id: 'flow',
      type: 'line',
      source: 'flow',
      filter: ['in', ['get', 'kind'], ['literal', ['direct', 'relayed']]],
      layout: { 'line-cap': 'round' },
      paint: { 'line-width': 3, 'line-blur': 1, 'line-opacity': 0, 'line-gradient': flowGradient(-1, MAP_FLOW_WIDTH, MAP_FLOW_OPACITY) }
    })
    // A halo that grows and fades around the repeaters in direct range.
    map!.addLayer({
      id: 'pulse',
      type: 'circle',
      source: 'mesh',
      filter: ['all', ['==', ['get', 'kind'], 'repeater'], ['get', 'direct']],
      paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-opacity': 0 }
    })
    map!.addLayer({
      id: 'repeaters',
      type: 'circle',
      source: 'mesh',
      filter: ['==', ['get', 'kind'], 'repeater'],
      paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 }
    })
    map!.addLayer({
      id: 'here',
      type: 'circle',
      source: 'mesh',
      filter: ['==', ['get', 'kind'], 'here'],
      paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }
    })
    frame()
    syncLabels()
    syncCompanionLabel()
    reducedMotion?.addEventListener('change', toggleAnimation)
    toggleAnimation()
  })
})

// The cards grow and shrink with their text, and the list folds down. A move
// with the window size comes through the map's own resize event. The labels
// are placed again even when the map stays where you moved it.
const cardObserver = import.meta.client
  ? new ResizeObserver(() => {
    frame()
    declutter()
  })
  : undefined
watch([() => props.below, () => props.list], (elements, previous) => {
  for (const element of previous ?? []) {
    if (element) cardObserver?.unobserve(element)
  }
  for (const element of elements) {
    if (element) cardObserver?.observe(element)
  }
}, { immediate: true })

const controlObserver = import.meta.client ? new ResizeObserver(() => declutter()) : undefined

// Throttled, it only needs to look alive. The browser pauses it in a hidden
// tab, and it stays off when the system asks for less motion.
const reducedMotion = import.meta.client ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined
let animationFrame: number | undefined
let lastFrameAt = 0

function animate(time: number) {
  animationFrame = requestAnimationFrame(animate)
  if (!map || time - lastFrameAt < MAP_ANIMATION_FRAME_MS) return
  lastFrameAt = time
  // Grows fast then slows down as it fades.
  const pulse = (time % MAP_PULSE_MS) / MAP_PULSE_MS
  map.setPaintProperty('pulse', 'circle-radius', 6 + 12 * (1 - (1 - pulse) ** 3))
  map.setPaintProperty('pulse', 'circle-opacity', 0.35 * (1 - pulse) ** 2)
  // Links start on your side, so it runs from just past their end to just
  // before their start: in from the repeaters, entering and leaving smoothly.
  const flow = 1 - (time % MAP_FLOW_MS) / MAP_FLOW_MS
  map.setPaintProperty('flow', 'line-gradient', flowGradient(flow * (1 + 2 * MAP_FLOW_WIDTH) - MAP_FLOW_WIDTH, MAP_FLOW_WIDTH, MAP_FLOW_OPACITY))
}

function toggleAnimation() {
  if (!map) return
  const still = !!reducedMotion?.matches
  map.setPaintProperty('flow', 'line-opacity', still ? 0 : 1)
  map.setPaintProperty('pulse', 'circle-opacity', 0)
  if (still && animationFrame !== undefined) {
    cancelAnimationFrame(animationFrame)
    animationFrame = undefined
  }
  else if (!still && animationFrame === undefined) {
    animationFrame = requestAnimationFrame(animate)
  }
}

// The rows refresh every second for their ages, the map only when what it
// draws changes, so it does not repaint for nothing.
watch(() => JSON.stringify(labels.value), syncLabels)
watch(pinned, declutter)
watch([() => props.companionName, stableHere], syncCompanionLabel)

watch(() => JSON.stringify(features.value), () => {
  const source = map?.getSource<GeoJSONSource>('mesh')
  if (!source) return
  source.setData(features.value)
  map!.getSource<GeoJSONSource>('flow')?.setData(features.value)
  frame()
  declutter()
})

onBeforeUnmount(() => {
  unmounted = true
  clearTimeout(attributionTimer)
  cardObserver?.disconnect()
  controlObserver?.disconnect()
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
  reducedMotion?.removeEventListener('change', toggleAnimation)
  map?.remove()
})
</script>

<template>
  <div ref="container" class="map" :style="{ '--map-top': `${top}px` }" aria-hidden="true" />
</template>

<style scoped lang="scss">
.map {
  position: fixed;
  inset: 0;
  z-index: 0;

  // Dims the map, not its labels, so the cards stay the loudest thing.
  :deep(.maplibregl-canvas) {
    filter: brightness(0.65);
  }

  :deep(.map-label) {
    display: flex;
    flex-direction: column;
    padding: 4px 10px;
    border-radius: 12px;
    background: rgba(var(--v-theme-surface), 0.6);
    border: 1px solid var(--glass-border);
    box-shadow: inset 0 1px 0 var(--glass-highlight), 0 6px 16px var(--glass-shadow);
    backdrop-filter: blur(12px);
    color: rgb(var(--v-theme-on-surface));
    white-space: nowrap;
    cursor: pointer;
  }

  :deep(.map-label-compact .map-label-detail) {
    display: none;
  }

  // Over the labels it may cover.
  :deep(.map-label-pinned) {
    z-index: 1;
  }

  :deep(.map-label-name) {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-caption);
    font-weight: 600;
  }

  :deep(.map-label-companion) {
    cursor: default;
  }

  :deep(.map-label-companion .map-label-dot) {
    background: rgb(var(--v-theme-primary));
  }

  :deep(.map-label-dot) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  :deep(.map-label-detail) {
    font-family: var(--font-mono);
    font-size: 10px;
    color: rgba(var(--v-theme-on-surface), 0.7);

    b {
      font-weight: 600;
    }
  }

  // Required attribution, dark so it does not glow through the glass.
  :deep(.maplibregl-ctrl-attrib) {
    background: rgba(var(--v-theme-background), 0.6);
    color: rgba(var(--v-theme-on-surface), 0.6);

    a {
      color: inherit;
    }
  }

  // Below the coverage card.
  :deep(.maplibregl-ctrl-top-right) {
    top: var(--map-top);
  }

  :deep(.maplibregl-ctrl-attrib-button) {
    filter: invert(1);
  }
}
</style>
