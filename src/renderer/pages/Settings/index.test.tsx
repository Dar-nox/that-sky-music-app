import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { Settings } from './index'

function makeSettings() {
  return {
    ...DEFAULT_SETTINGS,
    noteKeys: { ...DEFAULT_SETTINGS.noteKeys },
    transportHotkeys: { ...DEFAULT_SETTINGS.transportHotkeys }
  }
}

describe('Settings', () => {
  beforeEach(() => {
    window.skyAPI = {
      ping: vi.fn().mockResolvedValue('pong'),
      getSettings: vi.fn().mockResolvedValue(makeSettings()),
      setSettings: vi.fn().mockResolvedValue(undefined),
      pickDataFolder: vi.fn().mockResolvedValue(null),
      openDataFolder: vi.fn().mockResolvedValue(undefined),
      listLibrary: vi.fn().mockResolvedValue([]),
      parseMidi: vi.fn(),
      convertMidi: vi.fn(),
      arrangeMidi: vi.fn(),
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

  it('renders the note key grid with default keys', async () => {
    render(<Settings />)

    const cellA1 = await screen.findByRole('button', { name: 'Note key A1' })
    expect(cellA1).toHaveTextContent('Y')

    expect(screen.getByRole('button', { name: 'Note key B5' })).toHaveTextContent(';')
    expect(screen.getByRole('button', { name: 'Note key C5' })).toHaveTextContent('/')
  })

  it('captures a new key when a cell is clicked and a key is pressed', async () => {
    render(<Settings />)

    const cellA1 = await screen.findByRole('button', { name: 'Note key A1' })
    fireEvent.click(cellA1)
    fireEvent.keyDown(window, { key: 'q' })

    await waitFor(() => expect(cellA1).toHaveTextContent('Q'))
    expect(window.skyAPI.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ noteKeys: expect.objectContaining({ A1: 'Q' }) })
    )
  })

  it('warns when a captured key is already bound to another cell', async () => {
    render(<Settings />)

    const cellA2 = await screen.findByRole('button', { name: 'Note key A2' })
    fireEvent.click(cellA2)
    // 'y' is already the default binding for A1.
    fireEvent.keyDown(window, { key: 'y' })

    await waitFor(() => expect(screen.getByText(/already bound to cell A1/)).toBeInTheDocument())
  })

  it('resets note keys to the default layout', async () => {
    render(<Settings />)

    const cellA1 = await screen.findByRole('button', { name: 'Note key A1' })
    fireEvent.click(cellA1)
    fireEvent.keyDown(window, { key: 'q' })
    await waitFor(() => expect(cellA1).toHaveTextContent('Q'))

    fireEvent.click(screen.getAllByText('Reset to default')[0])

    await waitFor(() => expect(cellA1).toHaveTextContent('Y'))
  })
})
