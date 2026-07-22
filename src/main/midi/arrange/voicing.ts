import type { GridCol, GridRow } from '@shared/song'
import { GRID_DEGREE_SPAN, degreeToGridPosition, nearestDiatonicDegree } from '../quantize'
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
}

/** Folds a global scale degree into the window by whole octaves, nearest-first. */
function foldIntoWindow(globalDegree: number, windowStart: number): number {
  let folded = globalDegree
  while (folded < windowStart) folded += 7
  while (folded > windowStart + GRID_DEGREE_SPAN) folded -= 7
  return folded
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
 */
function placeDegree(
  globalDegree: number,
  windowStart: number,
  role: VoiceRole,
  melodyDegree: number | null,
  lastMelodyAbsolute: number | null
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

  // Walk down by octaves from the nearest placement while staying in the window and below the melody.
  let best = nearest
  for (let candidate = nearest; candidate >= windowStart; candidate -= 7) {
    if (candidate < melodyDegree) {
      best = candidate
      break
    }
    best = candidate
  }
  return best
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

/**
 * Maps each chord event onto the grid, then reduces it to a playable voicing.
 *
 * Two reductions happen here, in order:
 *  1. **Grid-collision dedupe.** Two source notes an octave apart collapse onto the same cell
 *     once folded into a 2-octave window. On a piano that's a doubling; in Sky it's the same
 *     key pressed twice at the same instant, which sounds once and wastes a slot the chord
 *     could have spent on a real harmony note.
 *  2. **maxChordNotes cap**, by the priority above.
 */
export function placeAndReduce(
  events: RoledChordEvent[],
  rootPc: number,
  windowStartFor: (timeMs: number) => number,
  maxChordNotes: number
): VoicingResult {
  let octaveFolds = 0
  let gridCollisionsMerged = 0
  let voicingReduced = 0

  // Tracks the previous event's melody placement so placeDegree can keep melodic motion small
  // across the window boundary. A window shift is already a legitimate phrase boundary, so
  // continuity resets there rather than anchoring the new window's melody to the old one's.
  let lastMelodyAbsolute: number | null = null
  let lastWindowStart: number | null = null

  const placedEvents = events.map((event) => {
    const windowStart = windowStartFor(event.timeMs)
    if (lastWindowStart !== null && windowStart !== lastWindowStart) {
      lastMelodyAbsolute = null
    }
    lastWindowStart = windowStart

    const degreeOf = (note: RoledNote): number => nearestDiatonicDegree(note.midi, rootPc).globalDegree

    const melodyNote = event.notes.find((n) => n.role === 'melody')
    const melodyDegree = melodyNote
      ? placeDegree(degreeOf(melodyNote), windowStart, 'melody', null, lastMelodyAbsolute)
      : null
    if (melodyDegree !== null) lastMelodyAbsolute = melodyDegree

    const placed: PlacedNote[] = event.notes.map((note) => {
      const degree = degreeOf(note)
      const absolute =
        note.role === 'melody' && melodyDegree !== null
          ? melodyDegree
          : placeDegree(degree, windowStart, note.role, melodyDegree, lastMelodyAbsolute)
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
      // Keep whichever note matters more, and the longer duration so sustain isn't cut short.
      const winner =
        voicingPriority(note, bassDegreeForPriority) < voicingPriority(existing, bassDegreeForPriority)
          ? note
          : existing
      byCell.set(cell, { ...winner, durationMs: Math.max(note.durationMs, existing.durationMs) })
    }

    // 2. Cap the chord by musical priority.
    const deduped = [...byCell.values()]
    const ranked = [...deduped].sort(
      (a, b) =>
        voicingPriority(a, bassDegreeForPriority) - voicingPriority(b, bassDegreeForPriority) ||
        b.relativeDegree - a.relativeDegree
    )
    const kept = ranked.slice(0, Math.max(1, maxChordNotes))
    voicingReduced += deduped.length - kept.length

    return { timeMs: event.timeMs, notes: kept }
  })

  return { events: placedEvents, octaveFolds, gridCollisionsMerged, voicingReduced }
}
