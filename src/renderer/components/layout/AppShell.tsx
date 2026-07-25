import type { ReactNode } from 'react'
import { StarryBackground } from '../background/StarryBackground'
import { Sidebar, type IpcStatus } from './Sidebar'

export function AppShell({
  ipcStatus,
  children
}: {
  ipcStatus: IpcStatus
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="relative isolate flex h-screen overflow-hidden text-moon-100">
      <StarryBackground />
      <Sidebar ipcStatus={ipcStatus} />
      <main className="scrollbar-night relative z-10 min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
