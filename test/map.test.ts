import { describe, expect, it } from 'vitest'
import { bestPlacement, boxesOverlap, flowGradient, freePlacement, labelPlacements, segmentCrossesBox, slideInto, visibleShare } from '~/utils/map'

const box = { left: 10, top: 10, right: 30, bottom: 20 }

describe('boxesOverlap', () => {
  it('needs the boxes to share some area', () => {
    expect(boxesOverlap(box, { left: 25, top: 15, right: 40, bottom: 30 })).toBe(true)
    expect(boxesOverlap(box, { left: 30, top: 10, right: 40, bottom: 20 })).toBe(false)
  })
})

describe('visibleShare', () => {
  it('measures how much of the box is in the area', () => {
    expect(visibleShare(box, { left: 0, top: 0, right: 100, bottom: 100 })).toBe(1)
    expect(visibleShare(box, { left: 20, top: 0, right: 100, bottom: 100 })).toBe(0.5)
    expect(visibleShare(box, { left: 50, top: 0, right: 100, bottom: 100 })).toBe(0)
  })
})

describe('slideInto', () => {
  const area = { left: 0, top: 0, right: 100, bottom: 100 }

  it('brings a box back inside from either side', () => {
    expect(slideInto({ ...box, left: -5, right: 15 }, area)).toBe(5)
    expect(slideInto({ ...box, left: 90, right: 110 }, area)).toBe(-10)
    expect(slideInto(box, area)).toBe(0)
  })

  it('never pushes it out of the other side', () => {
    expect(slideInto({ ...box, left: -30, right: 80 }, area)).toBe(20)
    expect(slideInto({ ...box, left: -30, right: 120 }, area)).toBe(0)
  })
})

describe('segmentCrossesBox', () => {
  it('sees a segment going through the box', () => {
    expect(segmentCrossesBox([0, 15], [40, 15], box)).toBe(true)
    expect(segmentCrossesBox([0, 0], [40, 30], box)).toBe(true)
  })

  it('sees a segment ending inside the box', () => {
    expect(segmentCrossesBox([0, 15], [20, 15], box)).toBe(true)
  })

  it('ignores a segment passing by or stopping short', () => {
    expect(segmentCrossesBox([0, 25], [40, 25], box)).toBe(false)
    expect(segmentCrossesBox([0, 15], [5, 15], box)).toBe(false)
    expect(segmentCrossesBox([0, 0], [40, 4], box)).toBe(false)
  })
})

describe('labelPlacements', () => {
  const view = { left: 0, top: 0, right: 400, bottom: 400 }

  it('tries the right first, then the left, above and below', () => {
    expect(labelPlacements([200, 200], 100, 40, 10, view).slice(0, 4).map(({ offset }) => offset)).toEqual([[60, 0], [-60, 0], [0, -30], [0, 30]])
  })

  it('slides a label above or below its dot back into view', () => {
    const [, left, above] = labelPlacements([20, 200], 100, 40, 10, view)
    expect(left!.box.left).toBe(-90)
    expect(above!.box).toEqual({ left: 0, top: 150, right: 100, bottom: 190 })
  })
})

describe('freePlacement', () => {
  const view = { left: 0, top: 0, right: 400, bottom: 400 }
  const places = labelPlacements([200, 200], 100, 40, 10, view)

  it('takes the first place clear of everything', () => {
    expect(freePlacement(places, [], [], view)).toBe(places[0])
  })

  it('skips a place over a link or a label', () => {
    expect(freePlacement(places, [], [[[200, 200], [400, 200]]], view)).toBe(places[1])
    expect(freePlacement(places, [places[0]!.box], [], view)).toBe(places[1])
  })

  it('skips a place partly out of view', () => {
    expect(freePlacement(places, [], [], { ...view, right: 300 })).toBe(places[1])
  })

  it('finds nothing when every place is taken', () => {
    expect(freePlacement(places, [view], [], view)).toBeUndefined()
  })
})

describe('bestPlacement', () => {
  const view = { left: 0, top: 0, right: 400, bottom: 400 }
  const places = labelPlacements([200, 200], 100, 40, 10, view)

  it('shows the label even over a link', () => {
    expect(bestPlacement(places, [], view)).toBe(places[0])
  })

  it('stays in full view before keeping clear', () => {
    expect(bestPlacement(places, [places[0]!.box], { ...view, left: 150 })).toBe(places[0])
  })

  it('covers as little as it can', () => {
    const dot = (x: number, y: number) => ({ left: x - 5, top: y - 5, right: x + 5, bottom: y + 5 })
    // A dot on every place but the left one.
    const dots = [dot(260, 200), dot(200, 170), dot(200, 230), dot(260, 170), dot(140, 170), dot(260, 230), dot(140, 230)]
    expect(bestPlacement(places, dots, view)).toBe(places[1])
  })

  it('keeps clear when it can stay in full view', () => {
    expect(bestPlacement(places, [places[0]!.box], view)).toBe(places[1])
  })
})

describe('flowGradient', () => {
  const alphaAt = (gradient: unknown[], x: number) => {
    const stops = gradient.slice(3)
    const color = stops[stops.indexOf(x) + 1] as string
    return Number(color.match(/, ([\d.]+)\)$/)![1])
  }

  it('lights the line around the band only', () => {
    const gradient = flowGradient(0.5, 0.2, 0.8, 10)
    expect(alphaAt(gradient, 0.5)).toBe(0.8)
    expect(alphaAt(gradient, 0.4)).toBe(0.2)
    expect(alphaAt(gradient, 0.2)).toBe(0)
  })

  it('keeps its stops going up, even with the band past the end', () => {
    const positions = flowGradient(1.1, 0.2, 0.8, 10).slice(3).filter((_, i) => i % 2 === 0) as number[]
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(positions).toHaveLength(11)
  })
})
