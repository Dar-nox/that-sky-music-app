import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.skyAPI = {
      ping: vi.fn().mockResolvedValue('pong'),
      getSettings: vi.fn().mockResolvedValue({ sustainThresholdMs: 300, countdownSeconds: 3 }),
      setSettings: vi.fn(),
      pickDataFolder: vi.fn().mockResolvedValue(null),
      openDataFolder: vi.fn(),
      listLibrary: vi.fn().mockResolvedValue([]),
      parseMidi: vi.fn(),
      convertMidi: vi.fn(),
      saveSong: vi.fn(),
      loadSong: vi.fn(),
      deleteSong: vi.fn(),
      importSheet: vi.fn(),
      playbackLoad: vi.fn(),
      playbackPlay: vi.fn(),
      playbackPause: vi.fn(),
      playbackStop: vi.fn(),
      playbackSetTempo: vi.fn(),
      playbackSetDryRun: vi.fn(),
      playbackSeek: vi.fn(),
      playbackPanic: vi.fn(),
      onPlaybackEvent: vi.fn().mockReturnValue(() => {})
    }
  })

  it('renders the Convert tab by default and confirms the IPC ping round-trip', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Convert Mode' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument())
  })
})
