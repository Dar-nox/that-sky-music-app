import type { NoteKeyMap } from '@shared/keybinds'
import type { PlaybackEvent, PlaybackStatus } from '@shared/playback'
import type { Song } from '@shared/song'
import { sendKeyDown, sendKeyUp } from '../keystroke/sender'
import { buildScheduledEvents, type ScheduledKeyEvent } from './events'

const TICK_MS = 16

type PlaybackEventListener = (event: PlaybackEvent) => void

/**
 * Lookahead scheduler (CLAUDE.md §7): a fixed-interval tick compares elapsed
 * song-time against the next scheduled note event(s), rather than one
 * setTimeout per note, to avoid cumulative drift over a multi-minute song.
 * Changing tempo re-anchors the clock instead of rescaling already-fired
 * events. In dry-run mode no OS keystrokes are sent — only 'note' events are
 * emitted, which the renderer uses as the live preview/log.
 */
export class PlaybackScheduler {
  private song: Song | null = null
  private scheduledEvents: ScheduledKeyEvent[] = []
  private cursor = 0
  private heldNoteIndices = new Set<number>()
  private keyMap: NoteKeyMap | null = null
  private tempoMultiplier = 1
  private dryRun = true
  private state: PlaybackStatus['state'] = 'idle'
  private anchorAtMs = 0
  private elapsedAtAnchorMs = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<PlaybackEventListener>()

  onEvent(listener: PlaybackEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  load(song: Song, keyMap: NoteKeyMap, minTapPressMs: number, dryRun: boolean): PlaybackStatus {
    this.stopTimer()
    this.song = song
    this.keyMap = keyMap
    this.dryRun = dryRun
    this.tempoMultiplier = 1
    this.scheduledEvents = buildScheduledEvents(song.notes, minTapPressMs)
    this.cursor = 0
    this.heldNoteIndices.clear()
    this.elapsedAtAnchorMs = 0
    this.state = 'stopped'
    this.emitStatus()
    return this.getStatus()
  }

  setDryRun(dryRun: boolean): PlaybackStatus {
    this.dryRun = dryRun
    this.emitStatus()
    return this.getStatus()
  }

  play(): PlaybackStatus {
    if (!this.song) throw new Error('No song loaded')
    if (this.state !== 'playing') {
      this.anchorAtMs = Date.now()
      this.state = 'playing'
      this.startTimer()
      this.emitStatus()
    }
    return this.getStatus()
  }

  pause(): PlaybackStatus {
    if (this.state === 'playing') {
      this.elapsedAtAnchorMs = this.currentElapsedMs()
      this.state = 'paused'
      this.stopTimer()
      this.releaseAllHeld()
      this.emitStatus()
    }
    return this.getStatus()
  }

  stop(): PlaybackStatus {
    this.stopTimer()
    this.releaseAllHeld()
    this.cursor = 0
    this.elapsedAtAnchorMs = 0
    this.state = this.song ? 'stopped' : 'idle'
    this.emitStatus()
    return this.getStatus()
  }

  /** Panic: identical to stop(), exposed under its own name for the safety-guard hotkey (CLAUDE.md §9). */
  panic(): PlaybackStatus {
    return this.stop()
  }

  setTempo(multiplier: number): PlaybackStatus {
    this.elapsedAtAnchorMs = this.currentElapsedMs()
    this.anchorAtMs = Date.now()
    this.tempoMultiplier = multiplier
    this.emitStatus()
    return this.getStatus()
  }

  /** Jumps to an arbitrary point in the song, whether playing, paused, or stopped. */
  seek(timeMs: number): PlaybackStatus {
    if (!this.song) return this.getStatus()

    this.releaseAllHeld()
    const clamped = Math.max(0, Math.min(timeMs, this.song.meta.durationMs))
    const nextCursor = this.scheduledEvents.findIndex((event) => event.timeMs >= clamped)
    this.cursor = nextCursor === -1 ? this.scheduledEvents.length : nextCursor

    this.elapsedAtAnchorMs = clamped
    if (this.state === 'playing') this.anchorAtMs = Date.now()

    this.emitStatus()
    return this.getStatus()
  }

  getStatus(): PlaybackStatus {
    return {
      state: this.state,
      songId: this.song?.meta.id ?? null,
      elapsedMs: this.currentElapsedMs(),
      durationMs: this.song?.meta.durationMs ?? 0,
      tempoMultiplier: this.tempoMultiplier,
      dryRun: this.dryRun
    }
  }

  private currentElapsedMs(): number {
    if (this.state !== 'playing') return this.elapsedAtAnchorMs
    const realDeltaMs = Date.now() - this.anchorAtMs
    return this.elapsedAtAnchorMs + realDeltaMs * this.tempoMultiplier
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    if (!this.song) return
    const elapsedMs = this.currentElapsedMs()

    while (this.cursor < this.scheduledEvents.length && this.scheduledEvents[this.cursor].timeMs <= elapsedMs) {
      this.fireEvent(this.scheduledEvents[this.cursor])
      this.cursor++
    }

    const finished = this.cursor >= this.scheduledEvents.length
    if (finished) this.stopTimer()

    // Emit the completed-progress status first (state is still 'playing' here, so
    // currentElapsedMs() reports the real final position), then reset for replayability.
    this.emitStatus()

    if (finished) {
      this.state = 'stopped'
      this.cursor = 0
      this.elapsedAtAnchorMs = 0
      this.heldNoteIndices.clear()
      this.emit({ type: 'ended' })
      this.emitStatus()
    }
  }

  private fireEvent(event: ScheduledKeyEvent): void {
    if (event.kind === 'down') this.heldNoteIndices.add(event.noteIndex)
    else this.heldNoteIndices.delete(event.noteIndex)

    this.emit({ type: 'note', row: event.row, col: event.col, kind: event.kind, timeMs: event.timeMs })

    if (this.dryRun) return
    const key = this.keyMap?.[`${event.row}${event.col}`]
    if (!key) return
    const action = event.kind === 'down' ? sendKeyDown : sendKeyUp
    action(key).catch((err: unknown) => {
      this.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    })
  }

  private releaseAllHeld(): void {
    if (!this.dryRun && this.keyMap) {
      for (const noteIndex of this.heldNoteIndices) {
        const note = this.song?.notes[noteIndex]
        const key = note ? this.keyMap[`${note.row}${note.col}`] : undefined
        if (key) sendKeyUp(key).catch(() => {})
      }
    }
    this.heldNoteIndices.clear()
  }

  private emit(event: PlaybackEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private emitStatus(): void {
    this.emit({ type: 'status', status: this.getStatus() })
  }
}

export const playbackScheduler = new PlaybackScheduler()
