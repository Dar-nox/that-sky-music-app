import { useEffect, useState } from 'react'
import {
  DEFAULT_ARRANGE_OPTIONS,
  type AccompanimentMode,
  type ArrangeOptions,
  type ClashHandling,
  type MelodyPlacement,
  type WindowMode
} from '@shared/arranger'
import { MAJOR_KEY_NAMES, majorRootPcToKeyName, parseKeyToMajorRootPc, type ParsedMidi } from '@shared/midi'
import type { Song } from '@shared/song'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { MidiWorkbench, OptionGroup, TrackList } from '../../components/midi/MidiWorkbench'
import {
  Alert,
  Annotation,
  Button,
  Callout,
  Checkbox,
  Disclosure,
  Field,
  Figure,
  NumberInput,
  Select,
  TextInput
} from '../../components/ui'
import { IconSave, IconStar } from '../../components/icons'

function normalizeToMajorKeyName(key: string): string {
  try {
    return majorRootPcToKeyName(parseKeyToMajorRootPc(key))
  } catch {
    return 'C'
  }
}

/**
 * A labelled group of figures inside the report.
 *
 * A subhead over a hairline, not a heading over a grid of bordered tiles. The
 * Arranger's report is eleven numbers; boxing each one turned reading it into
 * scanning a dashboard, when what you actually want is to run your eye down the
 * list and notice the one that isn't zero.
 */
function ReportBlock({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="hairline-top pt-6">
      <h3 className="mb-6 font-display text-lg font-medium text-moon-300 italic">{title}</h3>
      {children}
    </div>
  )
}

function formatMmSs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const ACCOMPANIMENTS: { value: AccompanimentMode; label: string; hint: string }[] = [
  { value: 'full', label: 'Full', hint: 'A voicing under every melody note — recommended' },
  { value: 'bass', label: 'Bass only', hint: 'Just the bass line under the melody' },
  { value: 'none', label: 'None', hint: 'Melody alone — the cleanest, most reliable result' }
]

export function ArrangerMode() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [parsed, setParsed] = useState<ParsedMidi | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedTrackIndices, setSelectedTrackIndices] = useState<number[]>([0])
  const [autoKey, setAutoKey] = useState(DEFAULT_ARRANGE_OPTIONS.autoKey)
  const [key, setKey] = useState('C')
  const [autoMelodyTrack, setAutoMelodyTrack] = useState(DEFAULT_ARRANGE_OPTIONS.autoMelodyTrack)
  const [melodyTrackIndex, setMelodyTrackIndex] = useState<number | null>(
    DEFAULT_ARRANGE_OPTIONS.melodyTrackIndex
  )
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [sustainCapable, setSustainCapable] = useState(false)
  const [sustainThresholdMs, setSustainThresholdMs] = useState(DEFAULT_SETTINGS.sustainThresholdMs)
  const [maxChordNotes, setMaxChordNotes] = useState(DEFAULT_ARRANGE_OPTIONS.maxChordNotes)
  const [accompaniment, setAccompaniment] = useState<AccompanimentMode>(
    DEFAULT_ARRANGE_OPTIONS.accompaniment
  )
  const [windowMode, setWindowMode] = useState<WindowMode>(DEFAULT_ARRANGE_OPTIONS.windowMode)
  const [melodyPlacement, setMelodyPlacement] = useState<MelodyPlacement>(
    DEFAULT_ARRANGE_OPTIONS.melodyPlacement
  )
  const [clashHandling, setClashHandling] = useState<ClashHandling>(DEFAULT_ARRANGE_OPTIONS.clashHandling)
  const [keySegmentation, setKeySegmentation] = useState(DEFAULT_ARRANGE_OPTIONS.keySegmentation)
  const [responsiveWindowing, setResponsiveWindowing] = useState(
    DEFAULT_ARRANGE_OPTIONS.responsiveWindowing
  )

  const [arranging, setArranging] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [exportingDev, setExportingDev] = useState(false)
  const [devExportPaths, setDevExportPaths] = useState<{ raw: string; arranged: string } | null>(null)

  useEffect(() => {
    window.skyAPI
      .getSettings()
      .then((settings) => setSustainThresholdMs(settings.sustainThresholdMs))
      .catch(() => {
        // Keep the shared default if settings can't be loaded yet.
      })
  }, [])

  async function handleFiles(files: File[]): Promise<void> {
    const file = files[0]
    if (!file) return

    setError(null)
    setSong(null)
    setSavedPath(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await window.skyAPI.parseMidi(arrayBuffer)

      setFileName(file.name)
      setBuffer(arrayBuffer)
      setParsed(result)
      // Piano MIDIs usually arrive split across treble/bass tracks, and the arranger is built
      // for full chords — so default to every track that actually has notes.
      const withNotes = result.tracks.filter((t) => t.noteCount > 0).map((t) => t.index)
      setSelectedTrackIndices(withNotes.length > 0 ? withNotes : [result.suggestedTrackIndex])
      setKey(normalizeToMajorKeyName(result.detectedKey ?? result.estimatedKey))
      setTitle(file.name.replace(/\.(mid|midi)$/i, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse MIDI file')
      setParsed(null)
      setBuffer(null)
      setFileName(null)
    }
  }

  function toggleTrack(index: number): void {
    const wasSelected = selectedTrackIndices.includes(index)
    setSelectedTrackIndices((prev) =>
      wasSelected ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    )
    // A pin only makes sense while its track is part of the arrangement.
    if (wasSelected && melodyTrackIndex === index) {
      setAutoMelodyTrack(true)
      setMelodyTrackIndex(null)
    }
  }

  function buildOptions(): ArrangeOptions {
    return {
      trackIndices: selectedTrackIndices,
      key,
      autoKey,
      autoMelodyTrack,
      melodyTrackIndex,
      sustainCapable,
      sustainThresholdMs,
      maxChordNotes,
      accompaniment,
      windowMode,
      melodyPlacement,
      clashHandling,
      keySegmentation,
      responsiveWindowing,
      sourceFileName: fileName ?? 'unknown.mid',
      title: title || 'Untitled',
      artist
    }
  }

  async function handleArrange(): Promise<void> {
    if (!buffer || !parsed || selectedTrackIndices.length === 0) return

    setArranging(true)
    setError(null)
    setSong(null)
    setSavedPath(null)
    setDevExportPaths(null)

    const options = buildOptions()

    try {
      const result = await window.skyAPI.arrangeMidi(buffer, options)
      setSong(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arranging failed')
    } finally {
      setArranging(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (!song) return

    setSaving(true)
    setError(null)

    try {
      const path = await window.skyAPI.saveSong(song)
      setSavedPath(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save song')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Dev-only: writes the unaltered MIDI parse and this arrangement side by side into
   * dev-exports/, for manually comparing what the Arranger changed against the source.
   */
  async function handleDevExport(): Promise<void> {
    if (!buffer || !song) return

    setExportingDev(true)
    setError(null)

    try {
      const baseName = fileName ?? 'unknown.mid'
      const diagnostics = await window.skyAPI.arrangeMidiDiagnostics(buffer, buildOptions())
      const [raw, arranged] = await Promise.all([
        window.skyAPI.devExportRawMidi(buffer, baseName),
        window.skyAPI.devExportJson(song, baseName, 'arranged', diagnostics)
      ])
      setDevExportPaths({ raw, arranged })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev export failed')
    } finally {
      setExportingDev(false)
    }
  }

  const report = song?.meta.arrangement

  return (
    <MidiWorkbench
      title="Sky Music Arranger"
      intro="Where Convert Mode transcribes a MIDI note-for-note, the Arranger repositions it to suit a 15-key diatonic instrument: it anchors the playable octave range on the melody, folds the accompaniment around it, and reduces chords to the notes that actually carry the harmony. It never touches note timing or duration — only where each note lands on the grid."
      fileName={fileName}
      fileBadges={
        parsed ? (
          <>
            <Annotation>{parsed.tracks.length} tracks</Annotation>
            <Annotation tone="gold">{autoKey ? 'Auto key' : `${key} Major`}</Annotation>
          </>
        ) : undefined
      }
      onFiles={handleFiles}
      error={error}
      actionLabel="Arrange"
      actionBusyLabel="Arranging…"
      actionBusy={arranging}
      actionDisabled={arranging || selectedTrackIndices.length === 0}
      actionWarning={selectedTrackIndices.length === 0 ? 'Select at least one track.' : null}
      onAction={() => void handleArrange()}
      optionsSlot={
        parsed && (
          <div className="grid gap-x-14 gap-y-10 xl:grid-cols-2">
            <OptionGroup label="Tracks & melody">
              <Field label="Tracks to arrange">
                <TrackList>
                  {parsed.tracks.map((t) => (
                    <Checkbox
                      key={t.index}
                      checked={selectedTrackIndices.includes(t.index)}
                      onCheckedChange={() => toggleTrack(t.index)}
                      label={
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="min-w-0 truncate">{t.name}</span>
                          <Annotation>{t.noteCount} notes</Annotation>
                        </span>
                      }
                    />
                  ))}
                </TrackList>
              </Field>

              <Field
                label="Melody track"
                hint="Which track carries the tune. Pinning it stops a momentarily higher accompaniment note (a chord voicing, a grace note) from stealing the melody role mid-phrase."
              >
                <Select
                  value={autoMelodyTrack ? 'auto' : melodyTrackIndex === null ? 'none' : String(melodyTrackIndex)}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === 'auto') {
                      setAutoMelodyTrack(true)
                      setMelodyTrackIndex(null)
                    } else if (value === 'none') {
                      setAutoMelodyTrack(false)
                      setMelodyTrackIndex(null)
                    } else {
                      setAutoMelodyTrack(false)
                      setMelodyTrackIndex(Number(value))
                    }
                  }}
                >
                  <option value="auto">Auto-detect (recommended)</option>
                  {parsed.tracks
                    .filter((t) => selectedTrackIndices.includes(t.index))
                    .map((t) => (
                      <option key={t.index} value={t.index}>
                        {t.name}
                      </option>
                    ))}
                  <option value="none">No preference (pitch only)</option>
                </Select>
              </Field>

              <Field label="Key">
                <div className="space-y-2">
                  <Checkbox checked={autoKey} onCheckedChange={setAutoKey} label="Detect key automatically" />
                  {!autoKey && (
                    <Select value={key} onChange={(e) => setKey(e.target.value)}>
                      {MAJOR_KEY_NAMES.map((name) => (
                        <option key={name} value={name}>
                          {name} Major
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-6">
                <Field label="Title">
                  <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Artist">
                  <TextInput value={artist} onChange={(e) => setArtist(e.target.value)} />
                </Field>
              </div>
            </OptionGroup>

            <OptionGroup label="Harmony & range">
              <Field
                label="Accompaniment"
                hint="Fifteen keys can't hold a full piano texture — a chord under every melody note just competes with the tune for the same keys. The melody always plays in full; this controls how much goes underneath it."
              >
                <Select
                  value={accompaniment}
                  onChange={(e) => setAccompaniment(e.target.value as AccompanimentMode)}
                >
                  {ACCOMPANIMENTS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label} — {a.hint}
                    </option>
                  ))}
                </Select>
              </Field>

              <label className="flex items-center gap-2 text-sm text-moon-200">
                Max chord notes
                <NumberInput
                  width="xs"
                  min={1}
                  max={6}
                  value={maxChordNotes}
                  onChange={(e) => setMaxChordNotes(Number(e.target.value))}
                />
              </label>

              <Field
                label="Clash handling"
                hint="Two notes one scale step apart can't be softened on Sky's grid — there's no per-note volume or decay, so they read as a smear. This controls how far the arranger goes to avoid that. Turn it down if a song wants those notes."
              >
                <Select
                  value={clashHandling}
                  onChange={(e) => setClashHandling(e.target.value as ClashHandling)}
                >
                  <option value="full">Full — also drop notes that clash with one still ringing</option>
                  <option value="chords">Chords only — never drop an overlapping note</option>
                  <option value="off">Off — keep every note, clashes and all</option>
                </Select>
              </Field>

              <Field label="Octave range handling">
                <Select value={windowMode} onChange={(e) => setWindowMode(e.target.value as WindowMode)}>
                  <option value="adaptive">Adaptive — follow the melody, shift only between phrases</option>
                  <option value="fixed">Fixed — one range for the whole song</option>
                </Select>
              </Field>

              <Field
                label="Melody placement"
                hint={
                  'Sky has no per-note volume — pitch is the only thing that reads as louder. "High" seats the melody near the top of its range so it sits above the accompaniment in the mix, instead of centered where it competes with it.'
                }
              >
                <Select
                  value={melodyPlacement}
                  onChange={(e) => setMelodyPlacement(e.target.value as MelodyPlacement)}
                >
                  <option value="center">Center — original behavior</option>
                  <option value="high">High — melody sits near the top of the range</option>
                </Select>
              </Field>

              <Checkbox
                checked={sustainCapable}
                onCheckedChange={setSustainCapable}
                label="Target instrument supports sustain"
                hint="Triumph Violin, Cello, Harmonica, Electric Guitar, Voice of AURORA, Triumph Saxophone."
              />
              {sustainCapable && (
                <label className="flex items-center gap-2 text-sm text-moon-200">
                  Sustain threshold (ms)
                  <NumberInput
                    width="xs"
                    min={0}
                    value={sustainThresholdMs}
                    onChange={(e) => setSustainThresholdMs(Number(e.target.value))}
                  />
                </label>
              )}

              {/* Native <details>, so these stay mounted when collapsed and the
                  conditional guards below behave exactly as before. */}
              <Disclosure
                summary="Experimental"
                defaultOpen={keySegmentation || (windowMode === 'adaptive' && responsiveWindowing)}
              >
                <Checkbox
                  checked={keySegmentation}
                  onCheckedChange={setKeySegmentation}
                  label="Detect key changes (experimental)"
                  hint="Looks for a sustained, confident modulation partway through the song instead of forcing the whole piece through one key. Conservative by design — shouldn’t fire on a typical chromatic-but-stable song, only a genuine, lasting key change."
                />
                {windowMode === 'adaptive' && (
                  <Checkbox
                    checked={responsiveWindowing}
                    onCheckedChange={setResponsiveWindowing}
                    label="Responsive octave re-anchoring (experimental)"
                    hint="Unproven — allows the range to also shift mid-phrase, not just between phrases, for a melody that drifts far without ever pausing. This trades heavy note folding for a possible audible register jump mid-line; A/B it by ear rather than trusting the report numbers."
                  />
                )}
              </Disclosure>
            </OptionGroup>
          </div>
        )
      }
      reportSlot={
        song && report ? (
          <div className="space-y-9">
            {/* What the arranger decided, before what it counted. */}
            <div className="flex flex-wrap gap-x-14 gap-y-6">
              <div className="min-w-0">
                <div className="font-display text-2xl leading-tight font-medium text-moon-50 italic">
                  {report.melodyTrackIndex === null
                    ? 'None (pitch only)'
                    : (parsed?.tracks.find((t) => t.index === report.melodyTrackIndex)?.name ??
                      `Track ${report.melodyTrackIndex + 1}`)}
                </div>
                <div className="mt-1.5 text-[0.8rem] text-moon-400">melody track</div>
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-2xl leading-tight font-medium text-moon-50 italic">
                    {report.key} Major
                  </span>
                  <Annotation tone={report.keyFitPercent < 80 ? 'warn' : 'good'}>
                    {report.keyFitPercent}% fit
                  </Annotation>
                </div>
                <div className="mt-1.5 text-[0.8rem] text-moon-400">key</div>
              </div>
            </div>

            {report.keyFitPercent < 80 && (
              <Alert tone="warning">
                A lot of this song sits outside a single major scale, so many notes had to be
                snapped. Try picking the key manually if it sounds wrong.
              </Alert>
            )}

            {report.keySegments && report.keySegments.length > 1 && (
              <ReportBlock title="Detected key changes">
                <ul className="space-y-2.5">
                  {report.keySegments.map((segment, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                      <span className="font-mono text-xs text-moon-500">
                        {formatMmSs(segment.startMs)}–{formatMmSs(segment.endMs)}
                      </span>
                      <span className="font-display font-medium text-moon-100 italic">
                        {segment.key} Major
                      </span>
                      <Annotation tone={segment.keyFitPercent < 80 ? 'warn' : 'neutral'}>
                        {segment.keyFitPercent}% fit
                      </Annotation>
                    </li>
                  ))}
                </ul>
              </ReportBlock>
            )}

            <ReportBlock title="Volume">
              <div className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">
                <Figure label="Notes in" value={report.notesIn} />
                <Figure label="Notes out" value={report.notesOut} />
                <Figure label="Chord events" value={report.chordEventsTotal} />
                <Figure label="Avg notes/chord" value={report.avgNotesPerChord} />
                <Figure label="Peak notes/sec" value={report.peakNotesPerSecond} />
              </div>
            </ReportBlock>

            <ReportBlock title="Adjustments">
              <div className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
                <Figure label="Octave folds" value={report.octaveFolds} />
                <Figure label="Range shifts" value={report.windowShifts} />
                <Figure label="Doublings merged" value={report.gridCollisionsMerged} />
                <Figure label="Voicing-reduced" value={report.voicingReduced} />
                {/* Arrangements saved before the clash-handling setting existed carry only the
                    combined total, so fall back to one figure rather than showing two blanks. */}
                {report.dissonancesAvoidedInChord === undefined ||
                report.dissonancesAvoidedOverlap === undefined ? (
                  <Figure label="Dissonances avoided" value={report.dissonancesAvoided} />
                ) : (
                  <>
                    <Figure
                      label="Clash — in chord"
                      value={report.dissonancesAvoidedInChord}
                      sub="resolved while capping"
                    />
                    <Figure
                      label="Clash — overlap"
                      value={report.dissonancesAvoidedOverlap}
                      tone={report.dissonancesAvoidedOverlap > 0 ? 'warn' : 'neutral'}
                      sub="dropped while ringing"
                    />
                  </>
                )}
                <Figure label="Accomp. removed by mode" value={report.densityThinned} />
                <Figure label="Register-suppressed" value={report.registerSuppressed} />
              </div>
            </ReportBlock>

            <Callout icon={<IconStar size={14} />}>
              Tip: load this in Play Music Mode with dry-run enabled to preview the note stream
              before sending real keystrokes to the game.
            </Callout>

            <div className="flex flex-wrap items-center gap-7 pt-1">
              <Button
                variant="success"
                icon={<IconSave size={15} />}
                loading={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Saving…' : 'Save to library'}
              </Button>
              <Button loading={exportingDev} onClick={() => void handleDevExport()}>
                {exportingDev ? 'Exporting…' : 'Export raw + arranged (dev)'}
              </Button>
            </div>

            {savedPath && <Alert tone="success">Saved to {savedPath}</Alert>}
            {devExportPaths && (
              <p className="font-mono text-[11px] break-all text-moon-500">
                Exported {devExportPaths.raw} and {devExportPaths.arranged}
              </p>
            )}
          </div>
        ) : undefined
      }
    />
  )
}
