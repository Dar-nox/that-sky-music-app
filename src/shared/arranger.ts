// Types for the Sky Music Arranger — the second, "make it sound good" MIDI pipeline
// that sits alongside the faithful converter in src/main/midi/convert.ts.
//
// Where Convert Mode transcribes (snap every note, resolve out-of-range notes with
// shift/clamp/drop), the Arranger *arranges*: it re-anchors the playable octave window
// on the melody, folds the accompaniment around it (direction- and continuity-aware,
// unlike the plain converter's nearest-octave fold), and reduces chord voicings to the
// notes that actually define the harmony. It only ever repositions pitches onto the grid —
// it never touches note timing or duration. Same Song schema out, so playback/library
// need no changes.

/**
 * How much accompaniment to put under the melody.
 *
 * `full` keeps the reduced voicing from `maxChordNotes`/register separation as-is, `bass` keeps
 * only the bass voice, `none` strips accompaniment entirely for a clean monophonic melody. All
 * three are pitch/voicing decisions — none of them touch when or how often a note fires.
 */
export type AccompanimentMode = 'full' | 'bass' | 'none'

/**
 * `adaptive` re-anchors the 15-note window per phrase (octave jumps land in silence);
 * `fixed` keeps one window for the whole song, matching the plain converter's behavior.
 */
export type WindowMode = 'adaptive' | 'fixed'

/**
 * Where the melody sits inside its 15-cell window.
 *
 * Sky has no per-note velocity — pitch is the only thing that makes a note read as louder in
 * the mix, so a melody centered in the window spends half its time in the quiet lower cells and
 * leaves little headroom below it for accompaniment. `high` seats the melody's upper register
 * near the top of the window instead, so it sits in the loud cells and the accompaniment has
 * the low cells to itself. `center` is the original behavior and stays the default.
 */
export type MelodyPlacement = 'center' | 'high'

export interface ArrangeOptions {
  /** One or more track indices merged into a single note stream before arranging. */
  trackIndices: number[]
  /** Major-scale root name, e.g. "C", "F#", "Bb". Ignored when `autoKey` is true. */
  key: string
  /** Use the arranger's duration-weighted key detection instead of `key`. */
  autoKey: boolean
  /**
   * Use the same fewest-simultaneous-notes heuristic Convert Mode suggests tracks with (see
   * src/main/midi/parse.ts) to pick which selected track anchors melody-role assignment.
   * Ignored when `melodyTrackIndex` is set.
   */
  autoMelodyTrack: boolean
  /**
   * Pins melody-role assignment to notes from this track. `null` means no track preference —
   * every selected track's notes are melody candidates, decided by pitch continuity alone. This
   * is the pre-melody-track-detection behavior, kept as an explicit opt-out for songs where no
   * single track reliably carries the tune.
   */
  melodyTrackIndex: number | null
  sustainCapable: boolean
  sustainThresholdMs: number
  /** Max simultaneous notes kept per chord event, after grid-collision dedupe. */
  maxChordNotes: number
  accompaniment: AccompanimentMode
  windowMode: WindowMode
  melodyPlacement: MelodyPlacement
  sourceFileName: string
  title: string
  artist: string
}

export interface ArrangementReport {
  /** Major root actually used, e.g. "C". */
  key: string
  /** Track index actually used to anchor melody-role assignment, or null if none was pinned. */
  melodyTrackIndex: number | null
  /** % of weighted note time that is diatonic in `key` — low values mean a shaky auto-detect. */
  keyFitPercent: number
  notesIn: number
  notesOut: number
  /** Notes that collapsed onto a grid cell already taken at the same instant (octave doublings). */
  gridCollisionsMerged: number
  /** Notes dropped by the maxChordNotes voicing reduction. */
  voicingReduced: number
  /** Accompaniment notes dropped by the accompaniment mode filter. */
  densityThinned: number
  /** Accompaniment notes dropped for sitting in (or above) the melody's register. */
  registerSuppressed: number
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
  | 'maxChordNotes'
  | 'accompaniment'
  | 'windowMode'
  | 'melodyPlacement'
  | 'autoKey'
  | 'autoMelodyTrack'
  | 'melodyTrackIndex'
> = {
  autoKey: true,
  autoMelodyTrack: true,
  melodyTrackIndex: null,
  maxChordNotes: 4,
  accompaniment: 'full',
  windowMode: 'adaptive',
  melodyPlacement: 'center'
}
