import { describe, expect, it } from 'vitest'
import { nearestDiatonicDegree } from '../quantize'
import { planWindows, windowStartAt } from './window'

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** A melody spanning close to two octaves, rising, dipping, and rising again. */
function wideRangeMelody(): { timeMs: number; midi: number }[] {
  const shape = [60, 64, 67, 71, 74, 77, 74, 71, 67, 64, 60, 55, 60, 64, 69, 72, 76, 79, 76, 72]
  return shape.map((midi, i) => ({ timeMs: i * 300, midi }))
}

/** Same shape, split into two phrases by a silence, so adaptive mode gets a chance to re-anchor. */
function wideRangeMelodyTwoPhrases(): { timeMs: number; midi: number }[] {
  const first = [60, 64, 67, 71, 74, 77, 74, 71].map((midi, i) => ({ timeMs: i * 300, midi }))
  const secondStart = first[first.length - 1].timeMs + 300 + 1000 // PHRASE_GAP_MS is 600
  const second = [55, 60, 64, 69, 72, 76, 79, 76].map((midi, i) => ({
    timeMs: secondStart + i * 300,
    midi
  }))
  return [...first, ...second]
}

/** Each melody note's position within its window's 15-cell span (0-14, 14 = top/loudest cell). */
function relativePositions(
  melody: { timeMs: number; midi: number }[],
  rootPc: number,
  mode: 'adaptive' | 'fixed',
  placement: 'center' | 'high'
): number[] {
  const plan = planWindows(melody, rootPc, mode, placement)
  return melody.map((note) => {
    const windowStart = windowStartAt(plan, note.timeMs)
    const globalDegree = nearestDiatonicDegree(note.midi, rootPc).globalDegree
    return globalDegree - windowStart
  })
}

describe('melodyPlacement: high vs center', () => {
  it.each([
    ['fixed', wideRangeMelody()] as const,
    ['adaptive', wideRangeMelodyTwoPhrases()] as const
  ])('seats the melody higher in the window and frees more room below it (%s)', (mode, melody) => {
    const centerPositions = relativePositions(melody, 0, mode, 'center')
    const highPositions = relativePositions(melody, 0, mode, 'high')

    const centerMedianPosition = medianOf(centerPositions)
    const highMedianPosition = medianOf(highPositions)

    // A note's position IS the count of grid cells strictly below it (0-14), so this single
    // number answers both questions: where does the melody sit, and how much room is below it.
    // eslint-disable-next-line no-console
    console.log(
      `[${mode}] median melody cell position — center: ${centerMedianPosition}/14, high: ${highMedianPosition}/14 ` +
        `(free cells below — center: ${centerMedianPosition}, high: ${highMedianPosition})`
    )

    expect(highMedianPosition).toBeGreaterThan(centerMedianPosition)
  })

  it('caps how far a low dip can drag the high-placement anchor down', () => {
    // A melody that's mostly high but dips far below its own 92nd percentile for a few notes
    // (repeated, not a single grace-note outlier, so both percentile calculations see it).
    const melody = [
      74, 76, 77, 79, 81, 79, 77, 76, // high passage, establishes the top-seated anchor
      0, 0, 0, // a multi-octave dip
      76, 77, 79
    ].map((midi, i) => ({ timeMs: i * 300, midi }))

    const plan = planWindows(melody, 0, 'fixed', 'high')
    const centerPlan = planWindows(melody, 0, 'fixed', 'center')

    // The anchor stayed near the top-seated position instead of sliding down toward the dip —
    // i.e. it sits well above where 'center' would have put it.
    expect(plan.segments[0].windowStart).toBeGreaterThan(centerPlan.segments[0].windowStart)

    const dipPosition = nearestDiatonicDegree(0, 0).globalDegree - plan.segments[0].windowStart
    // eslint-disable-next-line no-console
    console.log(`capped anchor windowStart: ${plan.segments[0].windowStart}, dip note position: ${dipPosition}`)
  })
})
