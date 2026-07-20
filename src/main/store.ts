import type StoreType from 'electron-store'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/settings'
import type { SongMeta } from '@shared/song'

interface StoreSchema {
  settings: AppSettings
  library: SongMeta[]
}

let storePromise: Promise<StoreType<StoreSchema>> | null = null

// electron-store is ESM-only; this main process builds as CJS, so it's loaded via dynamic import.
function getStore(): Promise<StoreType<StoreSchema>> {
  if (!storePromise) {
    storePromise = import('electron-store').then(({ default: Store }) => {
      return new Store<StoreSchema>({
        defaults: {
          settings: DEFAULT_SETTINGS,
          library: []
        }
      })
    })
  }
  return storePromise
}

export async function getSettings(): Promise<AppSettings> {
  const store = await getStore()
  return store.get('settings')
}

export async function setSettings(settings: AppSettings): Promise<void> {
  const store = await getStore()
  store.set('settings', settings)
}

export async function getLibrary(): Promise<SongMeta[]> {
  const store = await getStore()
  return store.get('library')
}

export async function setLibrary(library: SongMeta[]): Promise<void> {
  const store = await getStore()
  store.set('library', library)
}

/** Adds a song to the library index, replacing any existing entry with the same id. */
export async function upsertLibraryEntry(meta: SongMeta): Promise<void> {
  const library = await getLibrary()
  const withoutExisting = library.filter((entry) => entry.id !== meta.id)
  await setLibrary([...withoutExisting, meta])
}
