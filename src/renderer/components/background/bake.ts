import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Bakes a piece of the painting into a standalone SVG image, handed back as a
 * `blob:` URL for a layer's `background-image`.
 *
 * ## Why this exists
 *
 * The obvious way to animate the backdrop is to put each coat in its own
 * promoted `<div>` and let the compositor move it. Measured on this machine,
 * idle on the Convert page, that gave:
 *
 *   | animated live-SVG layers | median frame |
 *   |--------------------------|--------------|
 *   | 6, with impasto filters  |     66.6 ms  |  (~15 fps)
 *   | 6, filters removed       |     33.2 ms  |  (~30 fps)
 *   | none (`still`)           |     16.6 ms  |  (60 fps, 0 paints)
 *
 * So the filters were only half the cost. Live SVG *content* in a transforming
 * layer gets re-rastered regardless — dashed, round-capped, wide strokes are
 * expensive to rasterize, and Blink redoes that work as the layer moves.
 * Promotion alone does not buy a cached texture when the layer's contents are
 * SVG DOM.
 *
 * An `<img>`-style image is different. Once the browser has decoded an SVG
 * *image* at a given size it holds the raster in the image cache, and
 * translating the element that shows it is genuine compositor work. So each
 * coat is serialized to markup once, at startup, and never touched again.
 *
 * Two consequences to keep in mind when editing:
 *   - The baked document is standalone. It cannot reference filters or
 *     gradients defined in the page, so every layer carries its own `<defs>`.
 *   - It also has no CSS custom properties, so `var(--color-…)` is resolved
 *     against the live document before serializing.
 */

/** Resolves the theme's custom properties, which don't exist inside the baked
 *  document. Read from `<html>`, where the `@theme` block puts them. */
function makeVarResolver(): (name: string) => string {
  const styles = getComputedStyle(document.documentElement)
  const cache = new Map<string, string>()
  return (name) => {
    let value = cache.get(name)
    if (value === undefined) {
      value = styles.getPropertyValue(name).trim() || '#000'
      cache.set(name, value)
    }
    return value
  }
}

export interface BakedLayer {
  url: string
  revoke: () => void
}

/**
 * @param content  The marks for this coat. Must include its own `<defs>`.
 * @param width    Intrinsic size of the baked image, in the painting's own
 *                 coordinates. The layer scales it with `background-size: cover`,
 *                 and because the baked file is still SVG this costs no sharpness.
 */
export function bakeLayer(content: React.JSX.Element, width: number, height: number): BakedLayer {
  const resolveVar = makeVarResolver()

  const markup = renderToStaticMarkup(content).replace(/var\(\s*(--[a-z0-9-]+)\s*\)/gi, (_, name: string) =>
    resolveVar(name)
  )

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${markup}</svg>`

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  return { url, revoke: () => URL.revokeObjectURL(url) }
}
