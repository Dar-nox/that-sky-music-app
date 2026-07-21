import { majorRootPcToKeyName } from '@shared/midi'
import { MAJOR_SCALE_STEPS } from '../quantize'

export interface KeyCandidateNote {
  midi: number
  durationMs: number
}

export interface DetectedKey {
  /** Major-scale root pitch class 0-11. */
  rootPc: number
  /** Same root as a name, e.g. "F". */
  keyName: string
  /** % of weighted note time that is diatonic in this key. Low = the source is chromatic. */
  fitPercent: number
}

/**
 * Krumhansl–Schmuckler major profile. Values are the classic experimental "tonal hierarchy"
 * ratings — the tonic/fifth/third score highest, so a key whose strong scale degrees carry
 * the most sounding time wins.
 */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

function correlate(weights: number[], profile: number[]): number {
  const n = weights.length
  const meanW = weights.reduce((a, b) => a + b, 0) / n
  const meanP = profile.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let sumSqW = 0
  let sumSqP = 0
  for (let i = 0; i < n; i++) {
    const dw = weights[i] - meanW
    const dp = profile[i] - meanP
    numerator += dw * dp
    sumSqW += dw * dw
    sumSqP += dp * dp
  }

  const denominator = Math.sqrt(sumSqW * sumSqP)
  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * Picks the best-fitting major key by correlating a *duration-weighted* pitch-class histogram
 * against the Krumhansl–Schmuckler major profile at all 12 rotations.
 *
 * This is deliberately better than `parse.ts:estimateMajorKey`, which counts note *events* and
 * picks whichever scale merely covers the most of them. Counting events over-weights fast
 * passing tones and frequently ties between relative/neighbouring keys; weighting by sounding
 * time and scoring against a tonal profile lets a long tonic pedal outvote a flurry of
 * ornaments, which is what the ear does too.
 *
 * Minor keys are never reported separately: Sky's grid is a diatonic major scale, so a minor
 * key is represented by its relative major (identical pitch set) — same convention as
 * `parseKeyToMajorRootPc`.
 */
export function detectKey(notes: KeyCandidateNote[]): DetectedKey {
  if (notes.length === 0) {
    return { rootPc: 0, keyName: 'C', fitPercent: 0 }
  }

  const weights = new Array<number>(12).fill(0)
  for (const note of notes) {
    // A zero/negative-length note still says something about pitch content; floor its weight
    // so degenerate MIDI files don't produce an all-zero histogram.
    weights[pitchClass(note.midi)] += Math.max(note.durationMs, 1)
  }

  let bestRootPc = 0
  let bestScore = -Infinity
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    const rotated = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - rootPc + 12) % 12])
    const score = correlate(weights, rotated)
    if (score > bestScore) {
      bestScore = score
      bestRootPc = rootPc
    }
  }

  return {
    rootPc: bestRootPc,
    keyName: majorRootPcToKeyName(bestRootPc),
    fitPercent: keyFitPercent(notes, bestRootPc)
  }
}

/**
 * How well a set of notes fits a given major key, as the % of total sounding time spent on
 * diatonic pitch classes. Surfaced in the UI so a shaky auto-detect (or a bad manual choice)
 * is visible before the user trusts the arrangement — a chromatic source scoring ~70% is a
 * warning that a lot of notes are about to be snapped.
 */
export function keyFitPercent(notes: KeyCandidateNote[], rootPc: number): number {
  const scaleClasses = new Set(MAJOR_SCALE_STEPS.map((step) => (((rootPc + step) % 12) + 12) % 12))

  let totalWeight = 0
  let diatonicWeight = 0
  for (const note of notes) {
    const weight = Math.max(note.durationMs, 1)
    totalWeight += weight
    if (scaleClasses.has(pitchClass(note.midi))) diatonicWeight += weight
  }

  return totalWeight === 0 ? 0 : Math.round((diatonicWeight / totalWeight) * 100)
}
