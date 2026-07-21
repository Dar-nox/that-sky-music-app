import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// vitest.config.ts doesn't set `test.globals: true`, so React Testing
// Library's auto-cleanup (which detects a global `afterEach`) never kicks
// in. Without this, multiple `render()` calls across tests in the same file
// pile up in the same jsdom document, causing "found multiple elements"
// failures in any test file with more than one test that renders.
afterEach(() => {
  cleanup()
})
