import { app } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Song } from '@shared/song'
import { getSettings, upsertLibraryEntry } from './store'

async function resolveDataFolder(): Promise<string> {
  const settings = await getSettings()
  return settings.dataFolder ?? join(app.getPath('userData'), 'songs')
}

/** Writes a converted/imported song into the app's data folder and updates the library index. */
export async function saveSong(song: Song): Promise<string> {
  const folder = await resolveDataFolder()
  await mkdir(folder, { recursive: true })

  const filePath = join(folder, `${song.meta.id}.json`)
  await writeFile(filePath, JSON.stringify(song, null, 2), 'utf-8')
  await upsertLibraryEntry(song.meta)

  return filePath
}
