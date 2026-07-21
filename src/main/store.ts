import type StoreType from 'electron-store'
import { DEFAULT_NOTE_KEYS, type NoteKeyMap } from '@shared/keybinds'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/settings'
import type { SongMeta } from '@shared/song'

interface StoreSchema {
  settings: AppSettings
  library: SongMeta[]
}

let storePromise: Promise<StoreType<StoreSchema>> | null = null

/** The app's original, incorrect defaults. Used only to migrate saved settings. */
const LEGACY_NOTE_KEYS: NoteKeyMap = {
  A1: 'Q', A2: 'W', A3: 'E', A4: 'R', A5: 'T',
  B1: 'A', B2: 'S', B3: 'D', B4: 'F', B5: 'G',
  C1: 'Z', C2: 'X', C3: 'C', C4: 'V', C5: 'B'
}

function mapsMatch(left: NoteKeyMap, right: NoteKeyMap): boolean {
  return Object.entries(left).every(([id, key]) => right[id as keyof NoteKeyMap] === key)
}

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
  const settings = store.get('settings')

  // Existing installs persisted the former QWERTY mapping. Update only that
  // exact map, so any future user-defined remapping remains untouched.
  if (mapsMatch(settings.noteKeys, LEGACY_NOTE_KEYS)) {
    const migrated = { ...settings, noteKeys: DEFAULT_NOTE_KEYS }
    store.set('settings', migrated)
    return migrated
  }

  return settings
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

/** Removes a song from the library index by id. */
export async function removeLibraryEntry(id: string): Promise<void> {
  const library = await getLibrary()
  await setLibrary(library.filter((entry) => entry.id !== id))
}
