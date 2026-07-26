import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Bundled locally on purpose: the renderer's CSP is `default-src 'self'`, so a
// remote Google Fonts stylesheet (or a data: URI font) would be blocked. Vite
// emits these as same-origin assets, which works in dev and under file://.
// `full.css` is the Fraunces axis bundle that carries SOFT/WONK — the axes
// globals.css sets on headings.
import '@fontsource-variable/fraunces/full.css'
// The italic face carries the section titles. Fraunces has a real italic, so
// this avoids Chromium synthesising an oblique — which looks wrong on a serif.
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/nunito/index.css'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
