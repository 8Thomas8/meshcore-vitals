import type { ExpressionSpecification } from 'maplibre-gl'

export type ScreenPoint = [number, number]

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

// Share of the box inside the area, 0 when it is out of it.
export function visibleShare(box: Box, area: Box): number {
  const width = Math.max(0, Math.min(box.right, area.right) - Math.max(box.left, area.left))
  const height = Math.max(0, Math.min(box.bottom, area.bottom) - Math.max(box.top, area.top))
  return width * height / ((box.right - box.left) * (box.bottom - box.top))
}

// How far to move the box sideways to bring it inside the area, or as far in
// as it goes without leaving by the other side.
export function slideInto(box: Box, area: Box): number {
  if (box.left < area.left) return Math.max(0, Math.min(area.left - box.left, area.right - box.right))
  if (box.right > area.right) return Math.min(0, Math.max(area.right - box.right, area.left - box.left))
  return 0
}

// Liang-Barsky clipping: the segment crosses the box when part of it survives.
export function segmentCrossesBox([x1, y1]: ScreenPoint, [x2, y2]: ScreenPoint, box: Box): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  let enter = 0
  let exit = 1
  for (const [p, q] of [[-dx, x1 - box.left], [dx, box.right - x1], [-dy, y1 - box.top], [dy, box.bottom - y1]] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) enter = Math.max(enter, t)
    else exit = Math.min(exit, t)
    if (enter > exit) return false
  }
  return true
}

export interface Placement {
  /** Of the label's centre from its dot. */
  offset: ScreenPoint
  box: Box
}

// Where a label may sit around its dot, best first: right, left, above,
// below, then the corners. Above and below, it slides sideways into the view.
export function labelPlacements([x, y]: ScreenPoint, width: number, height: number, gap: number, view: Box): Placement[] {
  const dx = Math.round(gap + width / 2)
  const dy = Math.round(gap + height / 2)
  const offsets: ScreenPoint[] = [[dx, 0], [-dx, 0], [0, -dy], [0, dy], [dx, -dy], [-dx, -dy], [dx, dy], [-dx, dy]]
  return offsets.map(([ox, oy]) => {
    const box = { left: x + ox - width / 2, top: y + oy - height / 2, right: x + ox + width / 2, bottom: y + oy + height / 2 }
    const slide = ox ? 0 : slideInto(box, view)
    return { offset: [ox + slide, oy], box: { ...box, left: box.left + slide, right: box.right + slide } }
  })
}

// The first place in full view that covers nothing taken and no link.
export function freePlacement(placements: Placement[], taken: Box[], links: [ScreenPoint, ScreenPoint][], view: Box): Placement | undefined {
  return placements.find(({ box }) => visibleShare(box, view) === 1
    && !taken.some(other => boxesOverlap(box, other))
    && !links.some(([from, to]) => segmentCrossesBox(from, to, box)))
}

// For a label that must show: a place in full view first, then the one
// covering the fewest things taken, then the one showing the most of it.
// Links may run under it.
export function bestPlacement(placements: Placement[], taken: Box[], view: Box): Placement {
  const scored = placements.map((placement) => {
    const shown = visibleShare(placement.box, view)
    return { placement, full: shown === 1, covered: taken.filter(other => boxesOverlap(placement.box, other)).length, shown }
  })
  return scored.reduce((best, next) => {
    if (next.full !== best.full) return next.full ? next : best
    if (next.covered !== best.covered) return next.covered < best.covered ? next : best
    return next.shown > best.shown ? next : best
  }).placement
}

// A band of light centred at `at` along a line, 0 at its start and 1 at its
// end, fading out over `width` on each side, as a MapLibre line-gradient.
// Sampled at fixed steps so the stops always go up, wherever the band is.
export function flowGradient(at: number, width: number, opacity: number, steps = 40): ExpressionSpecification {
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const x = i / steps
    const glow = Math.max(0, 1 - Math.abs(x - at) / width) ** 2
    return [x, `rgba(255, 255, 255, ${Math.round(glow * opacity * 1000) / 1000})`]
  })
  return ['interpolate', ['linear'], ['line-progress'], ...stops.flat()] as ExpressionSpecification
}
