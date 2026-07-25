import type { GridCol, GridRow } from '@shared/song'
import {
  GRID_DEGREE_SPAN,
  degreeToGridPosition,
  nearestDiatonicDegree,
  rootPcLookup,
  type RootPcInput
} from '../quantize'
import type { RoledChordEvent, RoledNote, VoiceRole } from './voices'

export interface PlacedNote {
  row: GridRow
  col: GridCol
  /** Position within the window as a scale degree 0-14 — used for ordering and interval checks. */
  relativeDegree: number
  role: VoiceRole
  durationMs: number
  /** True if the note had to move by one or more whole octaves to fit the window. */
  octaveFolded: boolean
}

export interface PlacedChordEvent {
  timeMs: number
  notes: PlacedNote[]
}

export interface VoicingResult {
  events: PlacedChordEvent[]
  octaveFolds: number
  gridCollisionsMerged: number
  voicingReduced: number
  /** Notes dropped specifically because keeping them would clash (land one scale step from a
   * note already kept), not because of the maxChordNotes cap — see placeAndReduce's cap step. */
  dissonancesAvoided: number
}

/** Folds a global scale degree into the window by whole octaves, nearest-first. */
function foldIntoWindow(globalDegree: number, windowStart: number): number {
  let folded = globalDegree
  while (folded < windowStart) folded += 7
  while (folded > windowStart + GRID_DEGREE_SPAN) folded -= 7
  return folded
}

/**
 * The diatonic 2nd — exactly one scale step apart — is the harshest interval this grid can
 * produce: Sky has no per-note velocity to soften a clash the way a real instrument's voicing
 * could, so two notes a step apart read as equally loud and mostly indistinguishable rather than
 * as an intentional color tone.
 *
 * A 2nd stacked with an octave (a 9th) — or, symmetrically, a 7th stacked with an octave (a
 * 14th) — carries the same clash, just moved an octave away. Standard tonal harmony already
 * treats 2nds and 7ths as the dissonant scale-step intervals for exactly this reason: a 7th is a
 * 2nd's mirror image (2nd + 7th = an octave). Real-song testing confirmed this isn't just theory —
 * a bass note and a melody note a 9th apart (e.g. a low A2 against a high B5) read as clearly
 * clashing on Sky's grid, since the window only spans two octaves and there's no velocity or
 * decay to separate them the way register would in a real mix. `% 7` folds any degree gap onto a
 * single octave's worth of interval classes before checking, so a 2nd/9th (remainder 1) or a
 * 7th/14th (remainder 6) is caught regardless of how many octaves apart the two notes actually
 * are; every other interval (3rds, 4ths, 5ths, 6ths and their octave-compounded versions) stays
 * consonant.
 */
export function isDissonant(degreeA: number, degreeB: number): boolean {
  const step = Math.abs(degreeA - degreeB) % 7
  return step === 1 || step === 6
}

/**
 * Places one note in the window. Bass and inner notes get direction-aware folding: of the
 * octave placements available, prefer the lowest one that still sits below the melody, so the
 * chord keeps its shape. Nearest-octave folding (what the plain converter does) routinely lands
 * accompaniment *above* the tune, which is the main source of muddy, inverted-sounding output —
 * and since Sky has no per-note velocity, a wrongly-higher note reads as more prominent than the
 * melody it's supposed to sit under.
 *
 * Melody notes get a different kind of direction-awareness: continuity with the *previous*
 * melody note. A global scale degree usually has two valid octave placements inside a 15-cell
 * window; folding always picks the lower one regardless of context, so two melodically-adjacent
 * notes straddling the window's boundary can fold to placements many cells apart — a one-step
 * melodic motion turning into a large, audible wrong-direction leap. Preferring whichever valid
 * placement is closer to the previous melody note keeps that motion small, the way it actually
 * sounded in the source.
 *
 * The bass voice gets the same continuity treatment, for the same reason: of the placements that
 * still clear the melody, prefer whichever is closest to where the bass sat last, so the line
 * moves smoothly instead of leaping an octave whenever the melody's own register happens to
 * shift. Inner voices don't get this — they're the first thing `maxChordNotes` trims away, so
 * tracking their continuity has little payoff.
 *
 * This does *not* try to dodge a melody clash by picking a different octave. Every below-melody
 * placement of the same note sits exactly a multiple of 7 scale-steps from any other, and
 * `isDissonant` only cares about that gap mod 7 — so every octave copy of a given note has
 * identically-clashing (or identically-safe) status against a fixed melody degree; there is no
 * octave choice that changes the answer. (An earlier version of this function tried anyway; it
 * only ever appeared to work because the old, narrower dissonance check wasn't mod-7-invariant —
 * it could tell a literal 2nd from a 9th even though they're the same clash. Real clash-avoidance
 * for these notes happens one level up, in `placeAndReduce`'s cap step, which can drop the note
 * entirely rather than pretend an octave swap fixes anything.)
 */
function placeDegree(
  globalDegree: number,
  windowStart: number,
  role: VoiceRole,
  melodyDegree: number | null,
  lastMelodyAbsolute: number | null,
  lastBassAbsolute: number | null
): number {
  const nearest = foldIntoWindow(globalDegree, windowStart)

  if (role === 'melody') {
    if (lastMelodyAbsolute === null) return nearest
    const alternate = nearest + 7
    if (alternate > windowStart + GRID_DEGREE_SPAN) return nearest
    const nearestDistance = Math.abs(nearest - lastMelodyAbsolute)
    const alternateDistance = Math.abs(alternate - lastMelodyAbsolute)
    return alternateDistance < nearestDistance ? alternate : nearest
  }

  if ((role !== 'bass' && role !== 'inner') || melodyDegree === null) return nearest

  // Every octave placement of this degree that both fits the window and sits below the melody,
  // nearest first.
  const belowMelody: number[] = []
  for (let candidate = nearest; candidate >= windowStart; candidate -= 7) {
    if (candidate < melodyDegree) belowMelody.push(candidate)
  }
  if (belowMelody.length === 0) return windowStart

  if (role !== 'bass' || lastBassAbsolute === null) return belowMelody[0]

  return belowMelody.reduce((best, candidate) =>
    Math.abs(candidate - lastBassAbsolute) < Math.abs(best - lastBassAbsolute) ? candidate : best
  )
}

/**
 * Ranks the notes of a chord by how much they contribute to the harmony, so that capping the
 * chord drops the redundant notes rather than arbitrary ones.
 *
 * Order: melody (the tune — never dropped) > bass (the root) > the third above the bass (the
 * note that makes a chord major or minor) > the fifth > remaining inner voices. This replaces
 * the plain converter's velocity sort, which keeps whatever happened to be played loudest —
 * often an octave doubling that adds nothing once it's collapsed onto a diatonic grid.
 */
function voicingPriority(note: PlacedNote, bassDegree: number | null): number {
  if (note.role === 'melody') return 0
  if (note.role === 'bass') return 1
  if (bassDegree !== null) {
    const intervalAboveBass = (((note.relativeDegree - bassDegree) % 7) + 7) % 7
    if (intervalAboveBass === 2) return 2 // the third
    if (intervalAboveBass === 4) return 3 // the fifth
  }
  return 4
}

// Given the interval arithmetic above, a kept third and a kept fifth can never land exactly one
// scale step apart from each other (their bass-relative residues are 2 and 4 mod 7, so their
// minimum possible separation is 2) — the clashes placeAndReduce's cap step actually needs to
// catch are an "other inner" note clashing with anything, or a third/fifth forced into a melody
// clash by placeDegree's own tight-window fallback.

/**
 * Maps each chord event onto the grid, then reduces it to a playable voicing.
 *
 * Two reductions happen here, in order:
 *  1. **Grid-collision dedupe.** Two source notes an octave apart collapse onto the same cell
 *     once folded into a 2-octave window. On a piano that's a doubling; in Sky it's the same
 *     key pressed twice at the same instant, which sounds once and wastes a slot the chord
 *     could have spent on a real harmony note.
 *  2. **maxChordNotes cap**, by the priority above — walked greedily so that a candidate which
 *     would clash with something already kept is skipped in favor of a lower-priority one that
 *     doesn't, rather than accepted just because there was numeric room left.
 */
export function placeAndReduce(
  events: RoledChordEvent[],
  rootPc: RootPcInput,
  windowStartFor: (timeMs: number) => number,
  maxChordNotes: number
): VoicingResult {
  let octaveFolds = 0
  let gridCollisionsMerged = 0
  let voicingReduced = 0
  let dissonancesAvoided = 0

  const rootPcAt = rootPcLookup(rootPc)

  // Tracks the previous event's melody/bass placement so placeDegree can keep motion small
  // across chords and across the window boundary. A window shift is already a legitimate phrase
  // boundary, so continuity resets there rather than anchoring the new window off the old one's.
  let lastMelodyAbsolute: number | null = null
  let lastBassAbsolute: number | null = null
  let lastWindowStart: number | null = null

  const placedEvents = events.map((event) => {
    const windowStart = windowStartFor(event.timeMs)
    if (lastWindowStart !== null && windowStart !== lastWindowStart) {
      lastMelodyAbsolute = null
      lastBassAbsolute = null
    }
    lastWindowStart = windowStart

    const rootPcHere = rootPcAt(event.timeMs)
    const degreeOf = (note: RoledNote): number => nearestDiatonicDegree(note.midi, rootPcHere).globalDegree

    const melodyNote = event.notes.find((n) => n.role === 'melody')
    const melodyDegree = melodyNote
      ? placeDegree(degreeOf(melodyNote), windowStart, 'melody', null, lastMelodyAbsolute, null)
      : null
    if (melodyDegree !== null) lastMelodyAbsolute = melodyDegree

    const placed: PlacedNote[] = event.notes.map((note) => {
      const degree = degreeOf(note)
      const absolute =
        note.role === 'melody' && melodyDegree !== null
          ? melodyDegree
          : placeDegree(degree, windowStart, note.role, melodyDegree, lastMelodyAbsolute, lastBassAbsolute)
      if (note.role === 'bass') lastBassAbsolute = absolute
      const relativeDegree = absolute - windowStart
      const octaveFolded = degree !== relativeDegree + windowStart
      if (octaveFolded) octaveFolds++

      const position = degreeToGridPosition(relativeDegree)
      return {
        row: position.row,
        col: position.col,
        relativeDegree,
        role: note.role,
        durationMs: note.durationMs,
        octaveFolded
      }
    })

    // 1. Dedupe grid collisions, keeping the highest-priority role on each cell.
    const bassDegreeForPriority =
      placed.find((n) => n.role === 'bass')?.relativeDegree ?? null
    const byCell = new Map<string, PlacedNote>()
    for (const note of placed) {
      const cell = `${note.row}${note.col}`
      const existing = byCell.get(cell)
      if (!existing) {
        byCell.set(cell, note)
        continue
      }
      gridCollisionsMerged++
      // Keep whichever note matters more, with its own real duration untouched — the arranger
      // only repositions pitches, it never blends or extends note timing.
      const winner =
        voicingPriority(note, bassDegreeForPriority) < voicingPriority(existing, bassDegreeForPriority)
          ? note
          : existing
      byCell.set(cell, winner)
    }

    // 2. Cap the chord by musical priority, preferring a non-clashing lower-priority note over a
    // clashing higher-priority one when both can't fit. Melody and bass are never skipped for
    // clashing (only capacity can exclude them, same as every other role) — but a third/fifth/
    // other-inner candidate that would land a single scale step from a note already kept is
    // passed over in favor of whatever comes next. The result can end up with fewer notes than
    // maxChordNotes when avoiding dissonance leaves no other choice — a sparser but consonant
    // chord beats a denser, arbitrarily clashing one.
    const deduped = [...byCell.values()]
    const ranked = [...deduped].sort(
      (a, b) =>
        voicingPriority(a, bassDegreeForPriority) - voicingPriority(b, bassDegreeForPriority) ||
        b.relativeDegree - a.relativeDegree
    )
    const kept: PlacedNote[] = []
    let dissonancesAvoidedHere = 0
    for (const candidate of ranked) {
      if (kept.length >= Math.max(1, maxChordNotes)) break
      const isProtected = candidate.role === 'melody' || candidate.role === 'bass'
      const clashesWithKept = kept.some((k) => isDissonant(k.relativeDegree, candidate.relativeDegree))
      if (!isProtected && clashesWithKept) {
        dissonancesAvoidedHere++
        continue
      }
      kept.push(candidate)
    }
    dissonancesAvoided += dissonancesAvoidedHere
    // voicingReduced means "dropped purely for exceeding capacity" — dissonance-driven skips are
    // tracked separately so the two reasons a note gets cut aren't conflated.
    voicingReduced += deduped.length - kept.length - dissonancesAvoidedHere

    return { timeMs: event.timeMs, notes: kept }
  })

  return { events: placedEvents, octaveFolds, gridCollisionsMerged, voicingReduced, dissonancesAvoided }
}
