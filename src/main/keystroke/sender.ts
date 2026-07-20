import { Key, keyboard } from '@nut-tree-fork/nut-js'

/** Maps the key names used in Settings (note keys + transport hotkeys) to nut.js's Key enum. */
const KEY_NAME_TO_NUT_KEY: Record<string, Key> = {
  Q: Key.Q,
  W: Key.W,
  E: Key.E,
  R: Key.R,
  T: Key.T,
  A: Key.A,
  S: Key.S,
  D: Key.D,
  F: Key.F,
  G: Key.G,
  Z: Key.Z,
  X: Key.X,
  C: Key.C,
  V: Key.V,
  B: Key.B,
  Space: Key.Space,
  Left: Key.Left,
  Right: Key.Right,
  Escape: Key.Escape
}

function resolveKey(keyName: string): Key {
  const key = KEY_NAME_TO_NUT_KEY[keyName]
  if (key === undefined) {
    throw new Error(`Unmapped key name: "${keyName}"`)
  }
  return key
}

export async function sendKeyDown(keyName: string): Promise<void> {
  await keyboard.pressKey(resolveKey(keyName))
}

export async function sendKeyUp(keyName: string): Promise<void> {
  await keyboard.releaseKey(resolveKey(keyName))
}
