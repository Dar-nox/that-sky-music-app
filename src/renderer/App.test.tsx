import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.skyAPI = {
      ping: vi.fn().mockResolvedValue('pong'),
      getSettings: vi.fn().mockResolvedValue({ sustainThresholdMs: 300 }),
      setSettings: vi.fn(),
      listLibrary: vi.fn(),
      parseMidi: vi.fn(),
      convertMidi: vi.fn(),
      saveSong: vi.fn()
    }
  })

  it('renders the Convert tab by default and confirms the IPC ping round-trip', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Convert Mode' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument())
  })
})
