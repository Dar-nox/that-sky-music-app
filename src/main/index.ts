import { app, BrowserWindow, globalShortcut, Menu } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { setMainWindow } from './windowRef'
import { initActiveWindowGuard } from './keystroke/activeWindowGuard'
import { refreshGlobalHotkeys } from './hotkeys'
import { initTray } from './tray'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    setMainWindow(null)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Remove Electron's default File/Edit/View/Window menu entirely. `autoHideMenuBar`
  // on the window only hides it visually — Alt still toggles it back on, which this
  // app's users trigger constantly since Play Mode's workflow is built around
  // alt-tabbing into the Sky window (CLAUDE.md §7).
  Menu.setApplicationMenu(null)

  registerIpcHandlers()
  createWindow()

  // Safety layer + minimized-window control surfaces (CLAUDE.md §9, §11 step 6).
  initActiveWindowGuard()
  initTray()
  refreshGlobalHotkeys().catch((err: unknown) => {
    console.error('Failed to register global transport hotkeys:', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
