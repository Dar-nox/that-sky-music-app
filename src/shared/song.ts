import type { ArrangementReport } from './arranger'

export type GridRow = 'A' | 'B' | 'C'
export type GridCol = 1 | 2 | 3 | 4 | 5

export interface SkyNote {
  row: GridRow
  col: GridCol
  timeMs: number
  durationMs: number
  hold: boolean
}

export interface ConversionReport {
  notesTotal: number
  notesUnaltered: number
  notesOctaveShifted: number
  notesDropped: number
}

export interface SongMeta {
  id: string
  /** Which pipeline produced this song. Absent on songs saved before the Arranger existed. */
  generator?: 'converter' | 'arranger'
  /** Present only for Arranger output — the richer per-stage report (see @shared/arranger). */
  arrangement?: ArrangementReport
  title: string
  artist: string
  sourceFile: string
  convertedAt: string
  detectedKey: string
  bpm: number
  durationMs: number
  sustainInstrumentRecommended: boolean
  conversionReport: ConversionReport
}

export interface Song {
  schemaVersion: 1
  meta: SongMeta
  notes: SkyNote[]
}
