/**
 * dsh-style-tweaks — permanent Settings-nav glyph for this plugin's section.
 *
 * The Settings dialog's left rail draws one glyph per section, but DSH picks
 * that glyph from a hard-coded table in `ui-settings-general`
 * (`SettingsRoot.tsx`):
 *
 *   navIcon(id):
 *     models        → IconDataOutline16
 *     agent-presets → IconAgentPresetOutline16
 *     plugins       → IconPersonalizationOutline16
 *     everything else → IconSettingsOutline16   (the settings gear)
 *
 * and the `settings.section` registration options carry `id` / `order` /
 * `label` only — no icon field (`dsh-client-ui-settings` slot contract). So a
 * plugin cannot ask for its own glyph, and this one lands on the same gear as
 * `general`, `mcp`, cost, usage, archive and every other unlisted section:
 * a rail of thirteen identical gears, where the plugin's own entry is
 * indistinguishable from the built-in ones.
 *
 * The only lever is the DOM, so this module swaps the glyph in place. It is
 * deliberate chrome for this plugin's own menu entry — NOT a user-facing
 * tweak: there is no setting, no toggle, and the swap is applied on boot and
 * after every panel (re)mount for as long as the plugin is loaded.
 *
 * ## Why the original node survives
 *
 * The DSH `<svg>` is hidden (`display: none`) rather than replaced, and the
 * replacement is inserted right after it:
 *
 *   • Dispose is exact — removing our node and clearing one inline style
 *     restores DSH's own glyph, with no need to reconstruct its markup.
 *   • The replacement reuses the original's class, so every host rule keeps
 *     working untouched: `.navIcon`'s flex sizing, the cell's `currentColor`
 *     inheritance (hover / active / theme all follow), and
 *     `ui-settings-general`'s own `.navList:has(> .navCell:nth-child(8))`
 *     rule that blanks trailing glyphs on short rails.
 *   • `display: none` takes the original out of the flex row, so the
 *     replacement occupies the same 16px slot and the label keeps its 8px
 *     gap — the rail's metrics are byte-identical to stock.
 *
 * ## Size and weight (matched to the gear it replaces)
 *
 * Measured ink extents on a 16 grid: gear 14.95 × 15.36, `IconDataOutline16`
 * 13.94 × 14.47, `IconPersonalizationOutline16` 13.41 × 13.40. A glyph that
 * is not in that band reads as foreign next to its neighbours, so the palette
 * outline — drawn on the 16 grid by hand (see `PALETTE_INNER`) — is scaled by
 * `ICON_SCALE` until its inked diameter lands at 15.05:
 *
 *   13.3333 (outline geometry) × 1.0353 + 1.25 (stroke) = 15.05
 *
 * Size and weight are independent dials: the stroke is divided by the same
 * factor and multiplied back by the group transform, so `STROKE_WIDTH` is the
 * rendered weight while `ICON_SCALE` alone controls the diameter. The ink
 * centre stays at (8, 8) and the element stays `16 × 16` with
 * `viewBox="0 0 16 16"`, i.e. exactly the original's box, so nothing shifts.
 *
 * ## (Re)mounting
 *
 * The rail only exists while the dialog is open, and React rebuilds it on
 * every open, which discards both nodes. A body-scoped MutationObserver
 * therefore re-applies the swap whenever a labelled cell appears without one;
 * it is microtask-coalesced (a panel open fires many mutations) and bails out
 * as soon as a swap is already in place, so it never fights its own writes.
 *
 * ## Locating the cell
 *
 * A nav cell carries no section id in the DOM (the React key does not reach
 * the attributes), and CSS cannot select by text — so the cell is found by
 * comparing its `.navLabel` text against this plugin's own localized `nav`
 * string, resolved through the locale service on every attempt (a language
 * switch re-registers the section with fresh text). Reusing the `navList`
 * fragment of DSH's hashed class keeps the match inside the rail, so no other
 * surface in the document can be hit — see `settings-nav-scroll.ts` for the
 * full selector rationale.
 * @module dsh-style-tweaks/client/settings-nav-icon
 */

import { touchesScope } from './mutation-scope.ts'
import { NAV_LIST_SELECTOR, NAV_LIST_WATCH_SELECTOR } from './tweaks/settings-nav-scroll.ts'

/** The label span inside a nav cell. */
const NAV_LABEL_SELECTOR = '[class*="_navLabel"]'

/** Marks this plugin's replacement glyph; doubles as the removal handle. */
const MARK_ATTR = 'data-cst-nav-icon'

/** Marks the displaced DSH glyph, so dispose can un-hide exactly it. */
const HIDDEN_ATTR = 'data-cst-nav-icon-hidden'

/** SVG namespace for the replacement element. */
const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Rendered stroke weight of the palette outline. DSH's own nav glyphs render
 * at 1, but they are dense shapes; a bare round outline lays down far less ink
 * per unit of length, so 1 reads lighter than its neighbours. 1.25 is the
 * value that balances by eye — see the size note above.
 */
const STROKE_WIDTH = 1.25

/**
 * Scale applied to the hand-drawn outline so the palette's inked diameter
 * matches the gear it replaces (15.05 vs. 14.95). Above ≈1.10 the ink would
 * clip against the 16 box; the stroke is divided by this factor, so this is a
 * pure size dial — 1.0 renders the outline at its drawn 14.58.
 */
const ICON_SCALE = 1.0353

/** Centre of the 16 grid, and the pivot the scale is taken about. */
const ICON_CENTER = 8

/** Translation that keeps the scale centred: `8 − 8 × scale`. */
const ICON_OFFSET = (ICON_CENTER - ICON_CENTER * ICON_SCALE).toFixed(4)

/** Stroke that renders at `STROKE_WIDTH` after the group scale. */
const ICON_STROKE = (STROKE_WIDTH / ICON_SCALE).toFixed(4)

/** `scale × translate` about the grid centre, as a transform list. */
const ICON_TRANSFORM = `matrix(${ICON_SCALE} 0 0 ${ICON_SCALE} ${ICON_OFFSET} ${ICON_OFFSET})`

/**
 * The palette glyph, drawn on the 16 grid: the outline carries the thumb hole
 * (bottom right, as in a painter's palette) and four pigment dots sit on the
 * body. Geometry follows the classic 24-grid palette scaled by ⅔, which puts
 * the raw outline at 1.333…14.667 (13.333 across); `ICON_TRANSFORM` then sizes
 * it against DSH's gear. Dots are filled, the outline is stroked, and every
 * paint is `currentColor` so the cell's own colour drives both.
 */
const PALETTE_INNER = `<g transform="${ICON_TRANSFORM}">`
  + `<path d="M8 1.333C4.333 1.333 1.333 4.333 1.333 8s3 6.667 6.667 6.667c.617 0 1.099-.497 1.099-1.125 0-.291-.12-.557-.291-.75-.193-.193-.292-.435-.292-.75a1.093 1.093 0 0 1 1.112-1.112h1.331c2.034 0 3.703-1.669 3.703-3.703C14.643 4.008 11.641 1.333 8 1.333z" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linejoin="round" stroke-linecap="round"/>`
  + '<circle cx="9" cy="4.33" r=".72" fill="currentColor"/>'
  + '<circle cx="11.67" cy="7" r=".72" fill="currentColor"/>'
  + '<circle cx="5.67" cy="5" r=".72" fill="currentColor"/>'
  + '<circle cx="4.33" cy="8.33" r=".72" fill="currentColor"/>'
  + '</g>'

/**
 * HMR duplicate-setup guard (same pattern as the other DOM tweaks): a hot
 * reload can run setup again before the previous effect's cleanup ran, which
 * would leave an orphaned observer and a stale replacement in the rail.
 */
const GLOBAL_KEY = '__cst_settings_nav_icon_cleanup__'

function getGlobalCleanup(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[GLOBAL_KEY] as (() => void) | undefined
}

function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[GLOBAL_KEY] = fn
}

/**
 * Mount the permanent nav glyph for this plugin's Settings section. Returns
 * the disposer that un-hides DSH's own glyph and drops the observer; the
 * caller keeps it alive for the plugin's whole lifetime.
 *
 * @param label - Resolves this plugin's current localized `nav` string, i.e.
 *   exactly the text `settings.section` was registered with.
 */
export function setupSettingsNavIcon(label: () => string): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  /** The rail cells whose label is this plugin's section. */
  const cells = (): Element[] => {
    const list = document.querySelector(NAV_LIST_SELECTOR)
    if (list === null) return []
    const wanted = label()
    if (wanted === '') return []
    return Array.from(list.children).filter((cell) => {
      const text = cell.querySelector(NAV_LABEL_SELECTOR)?.textContent?.trim()
      return text === wanted
    })
  }

  /** Swap in the palette for every cell that does not have one yet. */
  const swap = (): void => {
    for (const cell of cells()) {
      if (cell.querySelector(`svg[${MARK_ATTR}]`) !== null) continue
      const original = cell.querySelector('svg')
      if (original === null) continue
      const own = document.createElementNS(SVG_NS, 'svg')
      own.setAttribute(MARK_ATTR, '')
      own.setAttribute('viewBox', '0 0 16 16')
      own.setAttribute('width', '16')
      own.setAttribute('height', '16')
      own.setAttribute('fill', 'none')
      own.setAttribute('aria-hidden', 'true')
      // Reuse the host's class so its sizing, colour inheritance and rail
      // rules keep applying to the replacement unchanged.
      const className = original.getAttribute('class')
      if (className !== null) own.setAttribute('class', className)
      own.innerHTML = PALETTE_INNER
      if (original instanceof SVGElement) original.style.display = 'none'
      original.setAttribute(HIDDEN_ATTR, '')
      original.after(own)
    }
  }

  /** Drop the replacement and hand the rail back to DSH untouched. */
  const restore = (): void => {
    for (const own of document.querySelectorAll(`svg[${MARK_ATTR}]`)) own.remove()
    for (const original of document.querySelectorAll(`svg[${HIDDEN_ATTR}]`)) {
      if (original instanceof SVGElement) original.style.display = ''
      original.removeAttribute(HIDDEN_ATTR)
    }
  }

  let disposed = false
  let queued = false
  const observer = new MutationObserver((records) => {
    if (disposed || queued) return
    // The rail is the only thing this tweak reads. Without the gate the
    // document-wide observer would run a `querySelector` for every frame of a
    // streaming answer, for a dialog that is not even open.
    if (!touchesScope(records, NAV_LIST_WATCH_SELECTOR)) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (disposed) return
      // The list is gone again (the dialog closed): nothing to swap into.
      //
      // No "a swap is already in place" early return: `swap()` is idempotent
      // per cell (it skips any cell that already carries the replacement), so
      // a document-wide `svg[MARK]` query here only cost a full-tree walk on
      // every tick — and it returned early when *any* cell was swapped, which
      // would have stranded the rest of a multi-cell rail.
      if (cells().length === 0) return
      swap()
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  swap()

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    restore()
    // Identity-checked, like `running-status` / `workspace-close`: a late
    // cleanup from an older bundle instance must not clear the marker the
    // instance that replaced it just published.
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}
