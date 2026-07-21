# CLAUDE.md — SkyKeys (working title)

> A Windows desktop app that converts MIDI files into Sky: Children of the Light
> note sheets, and can play those sheets back automatically as real keystrokes
> into the game. Built with Electron + React + TypeScript.
>
> This file is the spec Claude Code should treat as ground truth for
> architecture and behavior. Sections marked **[DECISION]** are gaps in the
> original request that I've filled with a reasonable default — change them
> freely, they're not load-bearing. Sections marked **[VERIFY]** are things
> Claude Code should double-check against a live reference (screenshot, wiki
> image, or the game itself) before hard-coding, because I couldn't fully
> confirm them from research.

---

## 1. What this app is

Two core modes, plus Settings:

1. **Convert Mode** — import a `.mid`/`.midi` file, turn it into a Sky note
   sheet (`.json`/`.txt`), with support for long-press (sustained) notes for
   instruments like Triumph Violin, Cello, Harmonica, Electric Guitar, Voice
   of AURORA, Triumph Saxophone.
2. **Play Music Mode** — load a converted or imported sheet, and the app
   sends real keystrokes to the game to "play" it, with tempo control,
   play/pause, next/previous, and auto-minimize on play.
3. **Settings** — remap the 15 note keys and the transport hotkeys
   (play/pause/next/prev), since in-game keybinds can change.

Target platform: **Windows only**, packaged as an installable/portable `.exe`.

---

## 2. Research findings that shape the design

I looked into how Sky's instruments actually work before speccing this, since
getting these wrong would make the whole conversion pipeline useless:

- **The grid is 3×5 = 15 notes**, spanning a two-octave major scale (most
  instruments). This is community-standard as "ABC1–5" notation (row A/B/C,
  column 1–5) — used by existing tools like `sky-music/sky-python-music-sheet-maker`.
- **The notes are diatonic (scale degrees), not chromatic.** There is no
  "black key" equivalent. This is the single most important fact for the
  conversion algorithm — see §5.
- **Default Steam/PC keyboard layout** is the piano-style block:
  `Y U I O P` / `H J K L ;` / `N M , . /`.
- **Long-press / sustain is instrument-specific**, not universal. Confirmed
  sustain-capable instruments (marked with a fermata symbol in-game): Electric
  Guitar, Voice of AURORA, Triumph Violin, Triumph Saxophone, Cello,
  Harmonica. Most instruments (Kalimba, Piano, Guitar, Harp, etc.) are
  tap-only — holding the key does nothing extra in-game.
- **Sky auto-transposes the whole instrument** to match ambient background
  music/location unless a Music Sheet is active or the player "pauses" their
  key by muting audio. This actually works in our favor: because we convert
  MIDI into **relative scale-degree positions** (row/col), not absolute
  pitches, the melody stays internally correct regardless of what absolute
  key Sky happens to be in when the user plays it back. Worth telling the
  user this in-app so they're not confused if it sounds transposed from the
  original recording — the shape is still right.
- **Prior art exists** for both halves of this project: `sky-music/*` tools
  (MIDI → Sky sheet conversion, JSON sheet formats used by the "Sky Studio"
  mobile app and community sites) and `sky-automated-music-playstation`
  (reads a JSON sheet and sends timed key/button presses to automate
  playback). Neither does both halves in one desktop app with long-press
  support — that's the actual gap this project fills. Recommend building an
  **import adapter** so this app can also open existing community
  `.json`/`.txt` sheets, not just ones it converts itself — free
  compatibility with a large existing sheet library.

---

## 3. Tech stack **[DECISION]**

You said React and left the rest to me. Here's what I'd use and why:

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** | Needs Node-level OS access (global keystroke injection, global hotkeys). Tauri is lighter but pushes the keystroke-injection code into Rust (`enigo` crate) — more friction given your JS/React background. Electron is the pragmatic choice here. |
| Scaffold/bundler | **electron-vite** | Vite-based, wires up main/preload/renderer with HMR out of the box. Much less config than raw webpack. |
| UI | **React + TypeScript** | As requested. TS matters more than usual here because of the main↔renderer IPC contract and the song JSON schema — types will catch a lot of bugs. |
| Styling | **Tailwind CSS** | Fast to get to "looks okay" without hand-rolling a design system. |
| State (renderer) | **Zustand** | Lighter than Redux for a single-window app of this size. |
| MIDI parsing | **`@tonejs/midi`** | Gives you parsed notes with absolute time/duration/velocity and a resolved tempo map, instead of raw ticks. Saves you from writing tempo-map math by hand. |
| Keystroke injection | **`nut.js`** | Actively maintained, works well from an Electron main process. Avoid `robotjs` — it's effectively unmaintained and needs a full native build toolchain (Python, node-gyp, windows-build-tools) to install, which is a bad time for anyone who `npm install`s this later, including you on a fresh machine. |
| Global hotkeys | **Electron's built-in `globalShortcut`** | No extra dependency needed for play/pause/next/prev working while the game has focus. |
| Foreground-window check | **`active-win`** | For the safety guard in §7 — detects what window currently has OS focus so we don't blast keystrokes into Discord by accident. |
| Settings/library persistence | **`electron-store`** | JSON-backed key-value store, zero setup. No need for SQLite at this scale (a personal song library + a settings blob). |
| Packaging | **`electron-builder`** | NSIS installer `.exe` (and optionally a portable `.exe` target too). |
| Testing | **Vitest** (pure logic: quantization, scheduler math, schema validation) + **React Testing Library** (UI) | The keystroke-injection path itself can't be meaningfully unit-tested (it's talking to the OS) — see §11 for how to handle that instead. |

**Cut for v1, don't build:** SQLite/any real database, cloud sync, an
auto-updater, code signing (an unsigned personal-use `.exe` will trigger a
Windows SmartScreen warning — that's normal and fine for now; only worth
paying for a cert if you ever distribute this more broadly), multiplayer/
ensemble sync features. All of these add real complexity for no payoff at
the "works for me and my friends" scale this app is aimed at.

---

## 4. Architecture

Standard three-process Electron split, with a hard rule: **all OS-level
keystroke injection and global hotkey registration lives in the main
process.** The renderer never touches `nut.js` or `globalShortcut` directly.

```
┌─────────────────────────────┐
│   Renderer (React, in a     │
│   sandboxed BrowserWindow)  │
│   - Convert Mode UI         │
│   - Play Music Mode UI      │
│   - Settings UI             │
└───────────▲─────────────────┘
            │ contextBridge (typed IPC API)
┌───────────┴─────────────────┐
│   Preload script             │
│   exposes window.skyAPI.*    │
└───────────▲─────────────────┘
            │ ipcMain / ipcRenderer
┌───────────┴─────────────────┐
│   Main process (Node)        │
│   - MIDI parsing/conversion  │
│   - Playback scheduler       │
│   - nut.js keystroke sender  │
│   - globalShortcut hotkeys   │
│   - active-win safety guard  │
│   - electron-store (settings,│
│     song library manifest)   │
│   - Tray icon + menu         │
└──────────────────────────────┘
```

Security baseline (state this explicitly so it doesn't drift toward legacy
patterns): `contextIsolation: true`, `nodeIntegration: false` in the
renderer's `BrowserWindow`, all main-process capability exposed only through
a narrow `contextBridge` API in the preload script.

### Suggested project structure

```
skykeys/
├─ electron-builder.yml
├─ package.json
├─ src/
│  ├─ main/
│  │  ├─ index.ts               # app lifecycle, window/tray creation
│  │  ├─ ipc/                   # ipcMain handlers, grouped by feature
│  │  ├─ midi/
│  │  │  ├─ parse.ts            # @tonejs/midi wrapper
│  │  │  ├─ quantize.ts         # chromatic -> diatonic scale-degree mapping
│  │  │  └─ convert.ts          # orchestrates parse -> quantize -> schema
│  │  ├─ scheduler/
│  │  │  └─ playback.ts         # lookahead scheduler, tempo scaling
│  │  ├─ keystroke/
│  │  │  ├─ sender.ts           # nut.js wrapper (keydown/keyup timing)
│  │  │  └─ windowGuard.ts      # active-win foreground check
│  │  ├─ store.ts               # electron-store: settings + library index
│  │  └─ importAdapters/        # normalize external sheet formats
│  ├─ preload/
│  │  └─ index.ts               # contextBridge API surface
│  └─ renderer/
│     ├─ App.tsx
│     ├─ pages/
│     │  ├─ ConvertMode/
│     │  ├─ PlayMusicMode/
│     │  └─ Settings/
│     ├─ store/                 # zustand
│     └─ components/
└─ resources/
   └─ icon.ico
```

---

## 5. Song data schema **[DECISION]**

Two important choices here that weren't specified in the original request:

1. **Store notes by Sky grid position (row/col), not by physical key.**
   If keybinds live only in Settings and get resolved to a physical key at
   *playback time*, then remapping keys never requires re-converting any
   song. This decouples Convert Mode's output from Settings entirely.
2. **Store timing as absolute milliseconds at 1.0× tempo**, computed once at
   conversion time from the MIDI tempo map. Playback scales every timestamp
   by the current tempo multiplier; it never re-reads the original MIDI.

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "id": "8e2f0c1a-...",
    "title": "Song Title",
    "artist": "Original Artist",
    "sourceFile": "song.mid",
    "convertedAt": "2026-07-21T10:00:00Z",
    "detectedKey": "C Major",
    "bpm": 120,
    "durationMs": 143200,
    "sustainInstrumentRecommended": true,
    "conversionReport": {
      "notesTotal": 342,
      "notesUnaltered": 298,
      "notesOctaveShifted": 31,
      "notesDropped": 13
    }
  },
  "notes": [
    { "row": "A", "col": 3, "timeMs": 0,    "durationMs": 220, "hold": false },
    { "row": "B", "col": 1, "timeMs": 220,  "durationMs": 640, "hold": true  },
    { "row": "A", "col": 3, "timeMs": 860,  "durationMs": 180, "hold": false }
  ]
}
```

`hold: true` means "send keydown at `timeMs`, keyup at `timeMs + durationMs`"
(this is only meaningful if the equipped in-game instrument supports
sustain). `hold: false` means a fixed short tap regardless of the original
note's duration, since most instruments can't be sustained anyway.

Chords are just multiple note objects sharing the same `timeMs`.

**Import compatibility:** write a small adapter layer that detects and
normalizes at least the "Sky Studio" JSON format and the `sky-music`
project's JSON format into this schema on import, so users can drop in
sheets downloaded from the wider community, not just ones this app produced.

---

## 6. Convert Mode

Pipeline:

1. **Parse** the MIDI file with `@tonejs/midi` → note events (pitch, start
   time, duration, velocity, track).
2. **Track selection.** If multiple tracks/channels exist, let the user pick
   which one is the melody (default heuristic: the track with the fewest
   simultaneous overlapping notes, or highest average pitch — expose this as
   a starting suggestion, not an automatic silent choice).
3. **Key detection.** Try to read a key-signature meta-event; if absent,
   estimate from a pitch-class histogram; otherwise let the user pick the
   key manually. Always show the user what key was used/assumed.
4. **Quantize** each chromatic MIDI pitch to the nearest diatonic scale
   degree of the detected key (this is the "12-tone → 7-note" step — the
   part of the app that actually matters most). Record how far each note
   moved for the conversion report.
5. **Map** scale-degree + octave to a Sky grid position (row/col). A note
   that doesn't land in the two-octave window *at its natural octave* is
   resolved by the configurable out-of-range mode: **shift** (move it by
   whole octaves until it fits), **clamp** (pin it to the nearest edge
   note), or **drop** (leave it out).

   > Corrected 2026-07-21. This previously read "octave-shifted to fit, or
   > dropped if they still don't fit after shifting", and the code
   > implemented exactly that — it octave-shifted first and only consulted
   > the setting afterwards. Because the window is already two octaves wide,
   > the shift search covered essentially the whole usable MIDI range, so
   > the clamp/drop branches were unreachable and the dropdown did nothing
   > for any real song. The setting has to gate the decision, not follow it.
6. **Long-press detection.** Only relevant if the user flags the target
   instrument as sustain-capable for this conversion. Any note longer than a
   configurable threshold (default 300ms) becomes `hold: true` with its
   real duration; everything else is `hold: false`.
7. **Chord density control.** Offer "melody only" (top note per timestamp)
   vs. "full chords" (cap configurable, e.g. max 4 simultaneous notes) —
   dense piano-style chords rarely translate well to a 15-note grid.
8. **Export** the schema above, plus show the conversion report inline (%
   unaltered / octave-shifted / dropped) so the user can judge quality
   before trusting a conversion, and re-run with different settings if it
   looks rough.

---

## 7. Play Music Mode

- **Library list**: every song in the app's data folder — both ones
  converted in-app and ones imported directly as `.json`/`.txt` — shown in a
  sidebar/list, selectable to load into the player. Support drag-and-drop
  import in addition to a file picker.
- **Transport**: Play/Pause (toggle), Previous, Next, arranged as requested
  with prev/next flanking play/pause. Tempo control as a slider or numeric
  input (e.g. 50%–150% of original).
- **On pressing Play:**
  1. Validate a song is loaded.
  2. Show a short on-screen countdown (default 3 seconds, configurable) so
     the user has time to alt-tab into the Sky window before input starts.
  3. Minimize the app window.
  4. Start the main-process scheduler, which walks the note list and fires
     `nut.js` keydown/keyup events at the right times, scaled by the current
     tempo multiplier.
- **Scheduler design**: a lookahead loop (checked every ~15–20ms) comparing
  elapsed playback time against the next scheduled note event(s), rather
  than one `setTimeout` per note — this avoids cumulative drift over a
  multi-minute song. Changing tempo mid-playback re-anchors the clock
  instead of rescaling already-fired events.
- **Because the window is minimized during playback**, the practical control
  surface has to be something other than clicking buttons in the window.
  Recommended: a **system tray icon** with a right-click menu (play/pause,
  next, previous, current song name) *and* global hotkeys for the same
  actions — both are cheap to build with Electron's built-in `Tray` and
  `globalShortcut` APIs and solve the "how do I control this once it's
  minimized" problem directly.

---

## 8. Settings

- **Note key remapping**: a 3×5 grid UI, click a cell → press a key to
  bind it, with duplicate-key detection and a "reset to default" button.
- **Transport hotkeys**: separate bindings for Play/Pause, Next, Previous
  (these should work globally, not just when the app window is focused,
  since the whole point is that the app is minimized during playback).
- **Sustain threshold** (ms) and **minimum tap press duration** (ms) —
  very short keydown→keyup pairs can get missed by some games/OS input
  handling, so pad tap presses to a small floor, e.g. 50ms, configurable.
- **Countdown duration** before playback starts.
- **Target window title** for the safety guard (default `"Sky"`).
- Data folder location, with an "open folder" button.

### Default keybind table **[DECISION — confirm against §2's VERIFY note]**

| Grid | Col 1 | Col 2 | Col 3 | Col 4 | Col 5 |
|---|---|---|---|---|---|
| Row A | Y | U | I | O | P |
| Row B | H | J | K | L | ; |
| Row C | N | M | , | . | / |

| Transport action | Default hotkey |
|---|---|
| Play / Pause | `Space` |
| Next song | `→` (Right Arrow) |
| Previous song | `←` (Left Arrow) |
| Panic stop | `Esc` |

---

## 9. Safety / fair-play considerations

Worth stating plainly rather than glossing over:

- **Wrong-window risk**: if the Sky window loses focus while playback is
  running, keystrokes go wherever focus actually is. Two mitigations, both
  worth building: (1) an `active-win`-based guard that auto-pauses playback
  if the foreground window title doesn't match the configured target, and
  (2) a global **panic hotkey** (`Esc` by default) that immediately halts
  all pending key sends regardless of app state. Don't skip the panic key —
  it's cheap to build and it's the one thing that prevents "oops, that just
  typed garbage into my Discord DM."
- **A dry-run/simulate mode** (log the note stream to the console/UI instead
  of actually sending OS input) is worth building early — it makes
  scheduler and conversion development possible without having the game
  open on a second monitor for every test, and it doubles as a genuinely
  useful "preview before you commit" feature for users.
- This class of tool (MIDI-to-macro for Sky's music minigame) already exists
  in the community in various forms (see §2) — it's automating your own
  single-player input, not multiplayer manipulation or an economic exploit.
  Still worth keeping the framing as a personal practice/convenience tool
  rather than something aimed at, say, playing "for" someone else in a
  shared space without their knowledge — a small in-app note to that effect
  costs nothing.

---

## 10. Testing strategy

- **Vitest** for everything that's pure logic and therefore actually
  testable: MIDI quantization math, scale-degree mapping, schema
  validation/round-tripping, scheduler timing math, tempo-rescaling math.
- **React Testing Library** for Convert Mode/Play Music Mode/Settings
  components in isolation, driven by mocked `window.skyAPI`.
- **What you can't unit test**: whether `nut.js` actually lands a keystroke
  in the real Sky window. Handle this with (a) the dry-run mode above during
  development, and (b) a short manual QA checklist before each release
  (load a known test sheet, play it into a text editor and diff the typed
  output against expected keys/timing, then repeat in the actual game).

---

## 11. Suggested build order

1. Scaffold: electron-vite + React + TS + Tailwind, empty windows, IPC
   plumbing wired end-to-end with a trivial "ping" call.
2. Convert Mode MVP: MIDI import → manual key selection → quantization →
   schema export → conversion report UI. No long-press yet.
3. Play Music Mode MVP: library list, load/play/pause/stop via `nut.js`,
   tempo slider, minimize-on-play, countdown. Dry-run mode first, real
   keystrokes second.
4. Long-press support + chord density controls in Convert Mode.
5. Settings: keybind remapping, transport hotkeys, sustain/tap thresholds.
6. Safety layer: `active-win` guard, panic hotkey, tray icon + menu.
7. Import adapters for existing community sheet formats.
8. Packaging: `electron-builder` installer + portable target, app icon.
9. Stretch: visual piano-roll/progress display during playback, drag-and-
   drop import, smarter auto melody-track/key detection.

---

## 12. Summary of recommendations (the "what would you add/remove/change" ask)

**Add:**
- System tray icon + menu (solves the "app is minimized, how do I control
  it" problem better than relying on hotkeys alone).
- Panic hotkey (`Esc`) that hard-stops all pending keystrokes.
- Active-window safety guard (auto-pause if focus leaves the target window).
- Dry-run/simulate mode for development and as a user-facing preview.
- Conversion quality report (% unaltered/shifted/dropped notes).
- Import adapter for existing community sheet formats, not just this app's
  own output.
- Drag-and-drop file import for both MIDI and sheet files.

**Change:**
- Store notes by Sky grid position, not physical key, so keybind changes in
  Settings never invalidate previously converted songs.
- Treat long-press as a per-conversion flag tied to instrument capability,
  not a universal feature — it only matters for the six sustain-capable
  instruments.

**Skip for v1:** a real database, cloud sync, auto-updates, code signing,
multiplayer/ensemble features. All addable later if this actually gets used
enough to justify them; none are needed to hit the functionality you
described.

**Open question for you:** the exact row↔pitch orientation of the in-game
3×5 grid (which physical row is the lowest octave) — I couldn't fully pin
this down from research. Worth a two-minute check against your own
in-game instrument screen before locking in the mapping in `quantize.ts`.
