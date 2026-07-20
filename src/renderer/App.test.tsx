import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    window.skyAPI = {
      ping: vi.fn().mockResolvedValue('pong'),
      getSettings: vi.fn(),
      setSettings: vi.fn(),
      listLibrary: vi.fn()
    }
  })

  it('renders the Convert tab by default and confirms the IPC ping round-trip', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Convert Mode' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument())
  })
})
