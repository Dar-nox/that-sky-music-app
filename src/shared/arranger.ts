// Types for the Sky Music Arranger — the second, "make it sound good" MIDI pipeline
// that sits alongside the faithful converter in src/main/midi/convert.ts.
//
// Where Convert Mode transcribes (snap every note, resolve out-of-range notes with
// shift/clamp/drop), the Arranger *arranges*: it re-anchors the playable octave window
// on the melody, folds the accompaniment around it, reduces chord voicings to the notes
// that actually define the harmony, tightens rhythm, and thins density. Same Song schema
// out, so playback/library need no changes.

/** Beat subdivision that note onsets are snapped to. */
export type RhythmGrid = 'off' | '1/8' | '1/16' | '1/32'

/** Caps how many chord events per second survive thinning. */
export type DensityMode = 'sparse' | 'medium' | 'full'

/**
 * `adaptive` re-anchors the 15-note window per phrase (octave jumps land in silence);
 * `fixed` keeps one window for the whole song, matching the plain converter's behavior.
 */
export type WindowMode = 'adaptive' | 'fixed'

export interface ArrangeOptions {
  /** One or more track indices merged into a single note stream before arranging. */
  trackIndices: number[]
  /** Major-scale root name, e.g. "C", "F#", "Bb". Ignored when `autoKey` is true. */
  key: string
  /** Use the arranger's duration-weighted key detection instead of `key`. */
  autoKey: boolean
  sustainCapable: boolean
  sustainThresholdMs: number
  /** Max simultaneous notes kept per chord event, after grid-collision dedupe. */
  maxChordNotes: number
  rhythmGrid: RhythmGrid
  /** Onsets closer together than this collapse into one chord event (rolled chords -> blocks). */
  onsetMergeMs: number
  /** The same grid cell can't re-fire faster than this; closer repeats are dropped. */
  minRetriggerMs: number
  density: DensityMode
  windowMode: WindowMode
  sourceFileName: string
  title: string
  artist: string
}

export interface ArrangementReport {
  /** Major root actually used, e.g. "C". */
  key: string
  /** % of weighted note time that is diatonic in `key` — low values mean a shaky auto-detect. */
  keyFitPercent: number
  notesIn: number
  notesOut: number
  /** Notes that collapsed onto a grid cell already taken at the same instant (octave doublings). */
  gridCollisionsMerged: number
  /** Notes dropped by the maxChordNotes voicing reduction. */
  voicingReduced: number
  /** Notes dropped by density thinning. */
  densityThinned: number
  /** Repeats of a cell that came in faster than minRetriggerMs. */
  retriggersRemoved: number
  onsetsSnapped: number
  onsetsMerged: number
  /** Notes moved by one or more whole octaves to fit the window. */
  octaveFolds: number
  /** How many times the adaptive window re-anchored at a phrase boundary. */
  windowShifts: number
  chordEventsTotal: number
  avgNotesPerChord: number
  peakNotesPerSecond: number
}

export const DEFAULT_ARRANGE_OPTIONS: Pick<
  ArrangeOptions,
  'maxChordNotes' | 'rhythmGrid' | 'onsetMergeMs' | 'minRetriggerMs' | 'density' | 'windowMode' | 'autoKey'
> = {
  autoKey: true,
  maxChordNotes: 4,
  rhythmGrid: '1/16',
  onsetMergeMs: 30,
  minRetriggerMs: 70,
  density: 'medium',
  windowMode: 'adaptive'
}

/** Chord events per second allowed by each density mode (`Infinity` = uncapped). */
export const DENSITY_EVENTS_PER_SECOND: Record<DensityMode, number> = {
  sparse: 4,
  medium: 8,
  full: Infinity
}

/** Denominator of a whole note for each rhythm grid setting. */
export const RHYTHM_GRID_DIVISIONS: Record<Exclude<RhythmGrid, 'off'>, number> = {
  '1/8': 8,
  '1/16': 16,
  '1/32': 32
}
