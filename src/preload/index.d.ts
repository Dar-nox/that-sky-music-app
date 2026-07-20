import type { SkyAPI } from '@shared/ipc'

declare global {
  interface Window {
    skyAPI: SkyAPI
  }
}
