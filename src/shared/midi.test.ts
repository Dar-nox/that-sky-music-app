import { describe, expect, it } from 'vitest'
import { MAJOR_KEY_NAMES, majorRootPcToKeyName, parseKeyToMajorRootPc } from './midi'

describe('major key name round-trip', () => {
  it.each(MAJOR_KEY_NAMES)('%s round-trips through pitch-class conversion', (name) => {
    expect(majorRootPcToKeyName(parseKeyToMajorRootPc(name))).toBe(name)
  })
})
