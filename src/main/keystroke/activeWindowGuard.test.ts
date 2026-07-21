import { describe, expect, it, vi } from 'vitest'

// Importing activeWindowGuard.ts transitively pulls in the scheduler, which
// imports the nut.js keystroke sender — mock it the same way playback.test.ts
// does, so the real native module never loads under Vitest.
vi.mock('./sender', () => ({
  sendKeyDown: vi.fn().mockResolvedValue(undefined),
  sendKeyUp: vi.fn().mockResolvedValue(undefined)
}))

import { isTargetWindowFocused } from './activeWindowGuard'

describe('isTargetWindowFocused', () => {
  it('matches case-insensitively as a substring', () => {
    expect(isTargetWindowFocused('Sky: Children of the Light', 'sky')).toBe(true)
  })

  it('does not match when the target is absent from the title', () => {
    expect(isTargetWindowFocused('Discord', 'Sky')).toBe(false)
  })

  it('treats a null foreground title as not matching a configured target', () => {
    expect(isTargetWindowFocused(null, 'Sky')).toBe(false)
  })

  it('treats a blank configured target as "no restriction" and always matches', () => {
    expect(isTargetWindowFocused('anything at all', '')).toBe(true)
    expect(isTargetWindowFocused(null, '   ')).toBe(true)
  })

  it('matches regardless of surrounding text in the window title', () => {
    expect(isTargetWindowFocused('Sky: Children of the Light - Steam', 'Sky')).toBe(true)
  })
})
