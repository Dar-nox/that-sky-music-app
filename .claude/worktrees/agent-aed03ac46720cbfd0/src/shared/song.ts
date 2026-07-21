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
