import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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

/** Reads a previously saved song back out of the app's data folder by id. */
export async function loadSong(id: string): Promise<Song> {
  const folder = await resolveDataFolder()
  const filePath = join(folder, `${id}.json`)
  const raw = await readFile(filePath, 'utf-8')
  return JSON.parse(raw) as Song
}
