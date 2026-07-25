import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArrangerDiagnostics } from '@shared/arranger'
import type { ParsedMidiInternal } from './midi/parse'

/**
 * Where before/after JSON pairs land for manual Arranger comparison during development.
 *
 * Deliberately a plain project-relative folder, not the user's configured data folder — this is
 * a throwaway diagnostic tool for this branch, not a feature end users interact with, so there's
 * no need for settings/gating. Only meaningful under `npm run dev`, where the working directory
 * is the project root.
 */
function devExportsFolder(): string {
  return join(process.cwd(), 'dev-exports')
}

/** Strips characters that would be awkward in a filename, so any source MIDI name is safe to reuse. */
function sanitizeBaseName(name: string): string {
  return name.replace(/\.(mid|midi)$/i, '').replace(/[^a-z0-9_-]+/gi, '_')
}

async function writeDevExport(filename: string, payload: unknown): Promise<string> {
  const folder = devExportsFolder()
  await mkdir(folder, { recursive: true })
  const filePath = join(folder, filename)
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
  return filePath
}

/**
 * Writes the full, unaltered parse of a MIDI file — every note's real pitch/time/duration, no
 * quantization, no grid mapping, no octave folding — as `<name>.raw.json`. The ground truth to
 * diff an Arranger/Convert Mode output against.
 */
export async function exportRawMidiJson(parsed: ParsedMidiInternal, sourceFileName: string): Promise<string> {
  return writeDevExport(`${sanitizeBaseName(sourceFileName)}.raw.json`, parsed)
}

/**
 * Writes an already-produced Song (Convert Mode or Arranger output) as `<name>.<kind>.json` —
 * `kind` distinguishes the two pipelines' exports so a Convert Mode export of the same source
 * file can never silently overwrite an Arranger export (or vice versa) under a misleading name.
 * The Song's own `meta.arrangement`/`meta.conversionReport` already carries the quality report,
 * so nothing extra needs to be captured separately; `diagnostics` (Arranger only) adds the
 * internal window/key-segment plans that aren't part of the production Song schema.
 */
export async function exportDevJson(
  payload: unknown,
  sourceFileName: string,
  kind: 'arranged' | 'converted',
  diagnostics?: ArrangerDiagnostics
): Promise<string> {
  const body = diagnostics ? { ...(payload as object), arrangerDiagnostics: diagnostics } : payload
  return writeDevExport(`${sanitizeBaseName(sourceFileName)}.${kind}.json`, body)
}
