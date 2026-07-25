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
  /**
   * Detects a sustained, confident key change partway through the song instead of forcing the
   * whole piece through one globally-chosen key (see dev-exports/findings.md's "Hopes and
   * Dreams" case). Conservative by design — see keySegment.ts's constants. Defaults off so
   * existing output is unaffected unless explicitly enabled.
   */
  keySegmentation: boolean
  /**
   * Experimental: allows the melody window to re-anchor mid-phrase (not just across a silence)
   * when the local register drifts far enough — see window.ts's `applyResponsiveReanchoring`
   * doc comment for the trade-off. Defaults off.
   */
  responsiveWindowing: boolean
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
  /** Notes dropped specifically to avoid a one-scale-step clash with another kept note, as
   * opposed to voicingReduced's pure-capacity drops. */
  dissonancesAvoided: number
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
  /** Present only when key segmentation found more than one segment. `key`/`keyFitPercent`
   * above always mirror segments[0] for backward compatibility; this carries the full list. */
  keySegments?: { startMs: number; endMs: number; key: string; keyFitPercent: number }[]
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
  | 'keySegmentation'
  | 'responsiveWindowing'
> = {
  autoKey: true,
  autoMelodyTrack: true,
  melodyTrackIndex: null,
  maxChordNotes: 4,
  accompaniment: 'full',
  windowMode: 'adaptive',
  melodyPlacement: 'center',
  keySegmentation: false,
  responsiveWindowing: false
}

// Shared-safe mirrors of the Arranger's internal window/key-segment plan shapes (defined for
// real in src/main/midi/arrange/window.ts and keySegment.ts), so ArrangerDiagnostics can cross
// the IPC boundary and be typed in the renderer without pulling main-process-only code into the
// shared bundle. Structural typing means the main-side types satisfy these without any mapping.

export interface WindowSegmentInfo {
  startMs: number
  endMs: number
  windowStart: number
  reason?: 'initial' | 'phrase' | 'responsive' | 'key-change'
}

export interface WindowPlanInfo {
  segments: WindowSegmentInfo[]
  windowShifts: number
}

export interface KeySegmentInfo {
  startMs: number
  endMs: number
  rootPc: number
  keyName: string
  fitPercent: number
}

export interface KeySegmentChunkTraceInfo {
  startMs: number
  endMs: number
  weightMs: number
  evaluated: boolean
  activeRootPc: number
  activeFitPercent: number
  bestAlternateRootPc: number
  bestAlternateKeyName: string
  bestAlternateFitPercent: number
  candidateStreak: number
}

export interface KeySegmentPlanInfo {
  segments: KeySegmentInfo[]
  keyChanges: number
  chunkTrace: KeySegmentChunkTraceInfo[]
}

/**
 * Internal detail behind an arrangement that isn't part of the production `Song`/
 * `ArrangementReport` shape — surfaced only through the dev-export tooling, so a song's segment/
 * key decisions can be read directly from JSON instead of inferred by listening.
 */
export interface ArrangerDiagnostics {
  /** Snapshot of which experimental flags were active, so an exported JSON stays
   * self-describing even after defaults change later. */
  options: { keySegmentation: boolean; responsiveWindowing: boolean }
  /** Full segment list including reason tags — tells the whole re-anchoring story, phrase and
   * responsive alike. */
  windowPlan: WindowPlanInfo
  /** Null when keySegmentation is off; otherwise the full segment list plus the raw per-chunk
   * scan trace (why every chunk did or didn't move the needle). */
  keySegmentPlan: KeySegmentPlanInfo | null
}
