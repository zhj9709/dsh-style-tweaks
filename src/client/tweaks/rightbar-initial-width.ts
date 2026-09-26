/**
 * dsh-style-tweaks — right Sidebar initial-width tweak.
 *
 * ## How the host decides the width
 *
 * DSH 0.1.5's right Sidebar owns no width of its own; `ui-layout` does. Its
 * `openRightbar` store action fills an unset preference on the first open:
 *
 *   d.layoutInfo.rightbar ??= Math.max(300, Math.round(viewportWidth * 0.45))
 *
 * (`RIGHTBAR_DEFAULT_RATIO = 0.45`), a drag then overwrites it through
 * `setRightbar` — which clamps to `[300, viewportWidth × 0.7]` — and every
 * later open/close keeps whatever px sits in there. The store is in-memory,
 * so a reload drops the preference back to `null` and the 45% default
 * applies again.
 *
 * None of that is reachable through the public face: `ctx.layout` offers
 * `openRightbar(track, fullscreen)` / `closeRightbar()` / `toggleSidebar()` /
 * `selectPanel()`. The width action lives on the controller's own `panels`
 * bound-action set — declared `private` in the host's TypeScript surface,
 * but a plain runtime property on the instance.
 *
 * ## What this tweak does
 *
 * It supplies the missing percentage axis. While the plugin owns the axis,
 * the FIRST open after a page load writes the width itself —
 * `round(frameWidth × percent / 100)`, through the host's own
 * `panels.setRightbar` — so the host's clamp, its three-column solve, its
 * drag handle position and the panel's own `width` all stay in agreement
 * (the plugin never touches the grid template or the panel's inline style).
 * A manual drag, and every open/close after the write, is left exactly as
 * the host stored it. A reload clears both the store and the page-level
 * markers, so the percentage applies again.
 *
 * ## Why wrap `openRightbar`
 *
 *   • Seeding at mount time alone is wrong: it can only use the window width
 *     as of the page load, and it cannot tell "first open" from "the sidebar
 *     has been open before" (after a close the store already holds px).
 *   • Watching for the panel's `[data-sidebar-right-open]` attribute and
 *     correcting the width afterwards can paint one frame at the host's 45%
 *     before the correction lands — a visible jump.
 *   • Wrapping the forwarded call puts the write in the same React commit as
 *     the open, so the sidebar reaches its final width in one frame, and the
 *     frame measurement is the one in force at open time.
 *
 * The wrapper is installed on the `LayoutController` INSTANCE that
 * `ctx.get('layout')` resolves. `ui-sidebar-right` reads `const layout =
 * ctx.layout` inside its own effect and calls `layout.openRightbar(...)`
 * from there; whichever plugin's effect runs first, both hold the same
 * object, so replacing the instance method is order-independent.
 *
 * ## Guards
 *
 *   • Shape check — a host without the 0.1.5 right Sidebar (no `layout`
 *     service), or one whose controller no longer carries a callable
 *     `panels.setRightbar`, leaves the tweak inert: no throw, no write, no
 *     DOM change.
 *   • Drag probe — the first pointer press on the right column's own drag
 *     handle (`[data-side="rightbar"]`, the handle `ui-layout` renders)
 *     proves the user set the width by hand; from that moment this page load
 *     is theirs and the tweak stops writing entirely. Without this, a
 *     settings change (which re-mounts every tweak) would overwrite a width
 *     the user had just dragged.
 *   • Page-level markers on `window` — the write happens once per page load
 *     (`…_seeded__`), so a re-mount cannot write twice; the drag probe keeps
 *     its own flag so it survives re-mounts.
 *
 * ## Live preview
 *
 * While the sidebar is already OPEN when this mounts, the width is written
 * immediately: that mount is the user's own edit of the percentage in the
 * Settings panel, and showing the result right away is the point. The same
 * branch is skipped once the user has dragged (the drag probe above), and a
 * mount made while the sidebar is CLOSED only arms the wrapper - a page that
 * already wrote its width never writes again.
 *
 * The panel's transition makes that write an animated resize, which is
 * exactly how a drag of the same handle looks. The disposer restores the
 * original method, but only while the installed wrapper is still the current
 * value: another plugin wrapping the same method must not be clobbered.
 * @module dsh-style-tweaks/client/tweaks/rightbar-initial-width
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'

import { resolveRightbarPercent } from '../tweak-config.ts'

/**
 * The panel root `ui-sidebar-right` marks while the sidebar is shown
 * (`data-sidebar-right-open`), in both the docked and the fullscreen
 * presentation. Its presence answers "is the sidebar open right now".
 */
const OPEN_SELECTOR = '[data-sidebar-right-open]'

/**
 * The right column grid item. Its parent element is the frame `ui-layout`
 * measures for `viewportWidth` (the same number the host clamps against), so
 * measuring it here keeps the percentage and the host's floor consistent.
 * A hand-written data attribute, not a CSS-Modules hash.
 */
const RIGHTBAR_COLUMN_SELECTOR = '[data-rightbar-col]'

/**
 * The right column's resize handle. `ui-layout`'s `DragHandle` carries the
 * owning column's name on `data-side`; a press here is the user resizing the
 * sidebar by hand.
 */
const RIGHTBAR_HANDLE_SELECTOR = '[data-side="rightbar"]'

/** Page-level marker: this page load has already had its width written. */
const SEEDED_KEY = '__cst_rightbar_initial_width_seeded__'
/** Page-level marker: the user dragged the right column's handle. */
const DRAGGED_KEY = '__cst_rightbar_initial_width_dragged__'
/** Page-level marker: a live drag probe currently holds the document listener. */
const PROBE_KEY = '__cst_rightbar_initial_width_probe__'

/** The piece of `ctx.layout`'s controller this tweak needs. */
interface LayoutControllerLike {
  /** Report the right panel's presentation; the host fills a missing width. */
  openRightbar(track: boolean, fullscreen: boolean): void
  /**
   * The controller's bound action set. `private` in the host's TypeScript
   * surface, a plain runtime property on the instance.
   */
  panels?: { setRightbar(px: number): void } | undefined
}

/** The window as a bag of page-level markers (same pattern as the HMR guards). */
function markers(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>
}

/** This page load has already had its width written by the tweak. */
function alreadySeeded(): boolean {
  return markers()[SEEDED_KEY] === true
}

/** Record that the width has been written (or attempted) for this page load. */
function markSeeded(): void {
  markers()[SEEDED_KEY] = true
}

/** The user has resized the right sidebar by hand during this page load. */
function userDragged(): boolean {
  return markers()[DRAGGED_KEY] === true
}

/**
 * Arm the one-shot drag probe; returns the function that disarms it.
 *
 * A `pointerdown` anywhere in the document is inspected once per press
 * (capture phase, read-only — nothing is intercepted) and the probe retires
 * itself the first time it lands on the right column's handle.
 *
 * The listener belongs to the mount that armed it. `installRightbarInitialWidth`
 * re-runs on every settings change, so a listener that the disposer could not
 * take back was a registration that outlived the instance holding it; the
 * released marker makes the next mount arm a fresh one. What survives a
 * re-mount is the FLAG the probe leaves behind (`DRAGGED_KEY`, page-level):
 * that is the part a later mount must still see, so the user's own drag keeps
 * outranking the configured percentage.
 *
 * The one drag this cannot observe is one made while the probe is disarmed —
 * i.e. while the tweak is switched off. Nothing is seeded in that window
 * either, so a re-enable seeds the configured percentage on the next open,
 * which is what enabling the tweak means.
 */
function armDragProbe(): () => void {
  const store = markers()
  if (store[PROBE_KEY] === true) return () => {}
  store[PROBE_KEY] = true
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(RIGHTBAR_HANDLE_SELECTOR) === null) return
    document.removeEventListener('pointerdown', onPointerDown, true)
    store[DRAGGED_KEY] = true
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true)
    // A probe that never fired must be re-armable by the next mount; once it
    // has fired, the page-level flag answers for every mount that follows.
    if (store[DRAGGED_KEY] !== true) store[PROBE_KEY] = false
  }
}

/** Whether the right Sidebar is open right now, in either presentation. */
function sidebarOpen(): boolean {
  return document.querySelector(OPEN_SELECTOR) !== null
}

/**
 * Resolve `ctx.layout` and check the shape this tweak needs.
 *
 * `ctx.get` is the escape hatch for a service provided in a SIBLING plugin's
 * fiber (a plain property read resolves only along the ancestor-fiber chain
 * and would throw); it answers `undefined` instead of throwing when the name
 * was never provided, so a pre-0.1.5 host lands on the inert path. An
 * unrecognized shape answers `undefined` too — the tweak then changes
 * nothing at all.
 */
function layoutFace(ctx: ClientContext): LayoutControllerLike | undefined {
  try {
    const raw: unknown = ctx.get('layout')
    if (raw === null || typeof raw !== 'object') return undefined
    const face = raw as { openRightbar?: unknown; panels?: unknown }
    if (typeof face.openRightbar !== 'function') return undefined
    const panels = face.panels
    if (panels === null || typeof panels !== 'object') return undefined
    if (typeof (panels as { setRightbar?: unknown }).setRightbar !== 'function') return undefined
    return raw as LayoutControllerLike
  } catch {
    // Service not provided (pre-0.1.5 host): the tweak stays inert.
    return undefined
  }
}

/**
 * Write the width as a percentage of the session frame.
 *
 * The frame is measured through the right column's parent element — the very
 * element `ui-layout` observes for `viewportWidth` — and falls back to the
 * browser viewport when that measurement is unavailable or zero (a detached
 * frame, or a host that renamed the attribute). `panels.setRightbar` stays
 * the only writer: it applies the host's own clamp and its transition
 * bookkeeping, and it keeps the column solve, the drag handle and the
 * panel's width in step.
 * @param panels - the host's bound width action.
 * @param percent - the resolved percentage (already inside [15, 70]).
 * @returns whether a width was actually written.
 */
function writeWidth(panels: NonNullable<LayoutControllerLike['panels']>, percent: number): boolean {
  const frame = document.querySelector(RIGHTBAR_COLUMN_SELECTOR)?.parentElement ?? null
  const measured = frame?.getBoundingClientRect().width ?? 0
  const viewport = measured > 0 ? measured : window.innerWidth
  if (!(viewport > 0)) return false
  const px = Math.round((viewport * percent) / 100)
  if (!(px > 0)) return false
  try {
    panels.setRightbar(px)
  } catch {
    // The host's action set rejected the write (unloaded layout owner):
    // leave the axis to the host rather than reporting a failure.
    return false
  }
  return true
}

/**
 * Mount the right Sidebar initial-width axis.
 *
 * Returns a disposer that restores the host's own `openRightbar` and disarms
 * the one-shot drag probe (no styles, no DOM nodes). The tweak stays inert on
 * hosts without the 0.1.5 right Sidebar, on hosts whose controller no longer
 * carries a `setRightbar` action, and for the rest of a page load in which the
 * user has resized the sidebar by hand.
 * @param ctx - client root context.
 * @param percent - the configured first-open width as a percentage of the frame.
 * @returns the disposer to call when the tweak is disabled or re-mounted.
 */
export function installRightbarInitialWidth(ctx: ClientContext, percent: number): () => void {
  const noop = (): void => {}

  const face = layoutFace(ctx)
  if (face === undefined) return noop
  const panels = face.panels
  if (panels === undefined) return noop

  const clamped = resolveRightbarPercent(percent)

  // The user's own drag outranks the configured percentage for this page load.
  // Every exit below hands the probe back: a mount that does no work must not
  // leave its listener behind for the rest of the page.
  const releaseProbe = armDragProbe()
  if (userDragged()) {
    releaseProbe()
    return noop
  }

  // The sidebar is open as this mounts: that mount IS the user editing the
  // percentage, so show the result now instead of waiting for a re-open.
  if (sidebarOpen()) {
    if (writeWidth(panels, clamped)) markSeeded()
    releaseProbe()
    return noop
  }

  // A closed sidebar on a page that already wrote its width: the stored px
  // (which the user may have dragged) stands. Nothing to arm, nothing to do.
  if (alreadySeeded()) {
    releaseProbe()
    return noop
  }

  // First open of this page load: write before forwarding, so the column
  // reaches its final width in the same React commit as the open itself.
  const original = face.openRightbar
  let seeded = false
  const wrapper = function (this: unknown, track: boolean, fullscreen: boolean): void {
    if (!seeded) {
      seeded = true
      if (writeWidth(panels, clamped)) markSeeded()
    }
    original.call(this, track, fullscreen)
  }
  face.openRightbar = wrapper

  return () => {
    releaseProbe()
    // Only unwind our own wrapper: another plugin may have wrapped the same
    // method in the meantime, and its wrapper must survive this disposal.
    if (face.openRightbar === wrapper) face.openRightbar = original
  }
}
