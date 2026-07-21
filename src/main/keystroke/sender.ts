import { Key, keyboard } from '@nut-tree-fork/nut-js'

/** Maps the key names used in Settings (note keys + transport hotkeys) to nut.js's Key enum. */
const KEY_NAME_TO_NUT_KEY: Record<string, Key> = {
  Y: Key.Y,
  U: Key.U,
  I: Key.I,
  O: Key.O,
  P: Key.P,
  H: Key.H,
  J: Key.J,
  K: Key.K,
  L: Key.L,
  ';': Key.Semicolon,
  N: Key.N,
  M: Key.M,
  ',': Key.Comma,
  '.': Key.Period,
  '/': Key.Slash,
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
