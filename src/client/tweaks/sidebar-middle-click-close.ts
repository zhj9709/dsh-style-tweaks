/**
 * dsh-style-tweaks — sidebar middle-click close tweak.
 *
 * DSH 0.1.5 added the right Sidebar: a docking surface whose panes hold
 * tab strips (`ui-dockkit`). Tabs close through their ✕ control (shown on
 * hover / focus / activation) or the chip's context menu, but the one
 * gesture every browser tab strip has taught users — a middle mouse click
 * closes the tab — is missing. This tweak adds exactly that gesture, for
 * docked chips and floating panels alike.
 *
 * ## How the host is wired
 *
 * Docked tab chips are `div[role="tab"][data-dockkit-tab="<tabId>"]`
 * elements rendered by `ui-dockkit`'s `TabPanel`. The kit is only adopted
 * by the right Sidebar (`ui-sidebar-right`'s panel and its floating
 * layer), so a chip is a Sidebar tab by construction. The chip's value is
 * the tab's `TabId`, which the public `ctx.sidebarRight` face accepts:
 *
 *   ctx.sidebarRight.close(tabId)
 *
 * That call runs the store's own `closeTab` action, whose planner already
 * guards every edge the native close button guards: a missing tab is a
 * no-op, the guide standing as the sole docked tab is unclosable
 * (`canCloseTab` returns false → `[]`), and closing the last docked tab
 * collapses the column exactly as its ✕ does. The plugin therefore never
 * duplicates those rules — it only forwards the id.
 *
 * Floating panels render no chip: their single tab closes through the
 * header's own ✕ control (`button[data-dockkit-float-close]`, present
 * only when the embedder's `canCloseTab` allows). A middle press on a
 * floating header therefore forwards to that control — `.click()` on the
 * native button — which reuses the kit's close path and its guards
 * unchanged; a press on the header's dock button keeps doing nothing.
 *
 * The face exists on 0.1.5+ hosts only (this plugin compiles against
 * rc.1 types, which predate it), so it is resolved defensively at click
 * time. `ctx.sidebarRight` is provided by `ui-sidebar-right` in that
 * package's own plugin fiber — a SIBLING of this plugin's — and a plain
 * property read resolves services only along the ancestor-fiber chain, so
 * from a sibling it throws ("cannot get property … without inject") even
 * on hosts that have the face; declaring the service in this plugin's
 * `inject` would fix resolution but also make it required, dead-locking
 * the boot on pre-0.1.5 hosts. `ctx.get` is the escape hatch both
 * constraints need: the reflect store is shared per root (child contexts
 * inherit both prototypally), `provide` allocates the isolation key at
 * the root, and an unprovided name answers `undefined` instead of
 * throwing — pre-0.1.5 hosts resolve to `undefined`, where the tweak
 * keeps its inert form. Strict resolution (the default) further requires
 * the providing fiber to be active, which is exactly the state a
 * clickable chip implies. `close()` itself throws when no seat is mounted
 * (e.g. the panel was never opened); those rejections are swallowed: there
 * is no session surface to act on.
 *
 * ## The three capture-phase listeners
 *
 * All three hang on `document` in the capture phase and filter on the
 * middle button (`event.button === 1`) landing inside a chip or a
 * floating header. Document capture runs before the React tree (React
 * 17+ listens at the root container), which is what makes the
 * interception total:
 *
 *   1. `pointerdown` — swallowed (`stopPropagation`). Without this the
 *      chip's own `onPointerDown` starts the docking kit's press → drag
 *      gesture for any non-secondary button; a middle press that drifts
 *      past the drag threshold before release would then place, split,
 *      or float the tab (or move / resize a floating panel) — precisely
 *      what a middle click must never do. Stopping propagation here
 *      means the gesture never begins. Popup dismissal listeners
 *      registered on `document` *after* this tweak mounts sit on the
 *      same node and are skipped too (registration order); the one on
 *      `window` (the tab menu's) still runs first, as it always did.
 *   2. `mousedown` — `preventDefault()` only. This is the browser's
 *      middle-click autoscroll hook (Chromium/Firefox on Windows and
 *      Linux; also Firefox's middle-click paste on Linux); cancelling
 *      the event's default action suppresses the scroll puck without
 *      touching the `auxclick` that follows.
 *   3. `auxclick` — the click event browsers fire for non-primary
 *      buttons (no `click` fires for them). Closes the tab: docked
 *      chips through the face above, floating headers through their
 *      native ✕ control. The element only receives it when the press
 *      and the release share it — a middle press that drifts off the
 *      chip before release lands the `auxclick` on the common ancestor
 *      instead, which answers neither helper and closes nothing, the
 *      same way a native tab strip behaves.
 *
 * ## Lifecycle
 *
 * `setupSidebarMiddleClickClose` returns a disposer removing all three
 * listeners. The caller in `index.tsx` mounts/unmounts it on every
 * settings change, so disabling the toggle restores the stock behavior
 * with no page refresh. A hot reload can also re-run setup before the
 * previous cleanup ran, so a global guard runs the stale disposer first
 * (same pattern as the other DOM-listener tweaks); without it each hot
 * swap would stack three more document listeners and close every tab as
 * many times as it was mounted.
 * @module dsh-style-tweaks/client/tweaks/sidebar-middle-click-close
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** The middle mouse button's `button` value across pointer and mouse events. */
const MIDDLE_BUTTON = 1

/**
 * A dockkit tab chip (docked strip). CSS-Modules hashes rotate per host
 * build, but this hand-written data attribute is part of the kit's public
 * DOM contract (its own drag hit-testing and tests key off it).
 */
const CHIP_SELECTOR = '[data-dockkit-tab]'

/**
 * A floating panel's header. The float layer reuses the strip's classes
 * but renders no chip; its single tab closes through the header's own ✕
 * control, so a middle press here forwards to that control.
 */
const FLOAT_GRIP_SELECTOR = '[data-dockkit-float-grip]'

/** The float header's dock button: middle-clicking it must keep doing nothing. */
const FLOAT_DOCK_SELECTOR = 'button[data-dockkit-float-dock]'

/** The float header's close control, present only when the tab is closable. */
const FLOAT_CLOSE_SELECTOR = 'button[data-dockkit-float-close]'

/** The piece of `ctx.sidebarRight` this tweak needs (host 0.1.5+). */
interface SidebarRightFace {
  /** Close one tab of the mounted session; the host's own rules apply. */
  close(tabId: string): void
}

/**
 * Read the host's right-Sidebar face at click time. The plain property
 * read (`ctx.sidebarRight`) is not an option here: it resolves only along
 * the ancestor-fiber chain, and the service is provided in a SIBLING
 * plugin's fiber, so the read throws even on hosts that have the face.
 * `ctx.get` reads the shared per-root store without the inject
 * requirement, answers `undefined` (never throws) when the name was never
 * provided — pre-0.1.5 hosts — and keeps strict semantics (the providing
 * fiber must be active). An unrecognized shape answers `undefined` too;
 * the tweak then keeps its inert form (side-effect suppression only,
 * nothing closes).
 */
function sidebarRightFace(ctx: ClientContext): SidebarRightFace | undefined {
  try {
    const face: unknown = ctx.get('sidebarRight')
    if (face === null || typeof face !== 'object') return undefined
    if (typeof (face as { close?: unknown }).close !== 'function') return undefined
    return face as SidebarRightFace
  } catch {
    // Service not provided (pre-0.1.5 host): the tweak stays inert.
    return undefined
  }
}

/**
 * The docked tab chip a middle press landed on, if any. The press may
 * land on the chip itself, its title span, or its nested ✕ control —
 * `closest` covers all of them and answers `undefined` for presses on
 * the strip's empty tail, the add/split controls, or anywhere else in
 * the document.
 */
function chipOf(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined
  return target.closest<HTMLElement>(CHIP_SELECTOR) ?? undefined
}

/**
 * The floating-panel header a middle press landed on, if any. Covers the
 * header's title span and empty fill as well as its two controls; the
 * auxclick handler excludes the dock button explicitly.
 */
function floatGripOf(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined
  return target.closest<HTMLElement>(FLOAT_GRIP_SELECTOR) ?? undefined
}

/** Whether a middle press landed inside a chip or a floating header. */
function isMiddleTarget(target: EventTarget | null): boolean {
  return chipOf(target) !== undefined || floatGripOf(target) !== undefined
}

/**
 * HMR duplicate-setup guard (same pattern as the other DOM-listener
 * tweaks): a hot reload can run setup again before the previous effect's
 * cleanup ran, so the stale cleanup is invoked first, keeping three
 * document listeners from stacking.
 */
const GLOBAL_KEY = '__cst_sidebar_middle_click_close_cleanup__'
function getGlobalCleanup(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[GLOBAL_KEY] as (() => void) | undefined
}
function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[GLOBAL_KEY] = fn
}

/**
 * Mount the middle-click close gesture. Returns a disposer that removes
 * every listener; the tweak stays inert (but still suppresses the
 * middle-click side effects listed above) on hosts without the face.
 */
export function setupSidebarMiddleClickClose(ctx: ClientContext): () => void {
  // HMR duplicate-setup guard (same pattern as the other DOM-listener
  // tweaks): a hot reload can run setup again before the previous
  // effect's cleanup ran; run the stale cleanup first so three document
  // listeners never stack.
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  // 1. Keep the press away from the chips' and headers' own handlers: no
  //    drag gesture ever begins, so a held middle button can neither move
  //    nor float a tab, nor drag a floating panel around.
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== MIDDLE_BUTTON) return
    if (!isMiddleTarget(event.target)) return
    event.stopPropagation()
  }

  // 2. Suppress the browser's middle-click autoscroll (and the focus /
  //    drag-selection default). The auxclick that follows still fires.
  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== MIDDLE_BUTTON) return
    if (!isMiddleTarget(event.target)) return
    event.preventDefault()
  }

  // 3. The close itself: browsers deliver middle clicks as `auxclick`,
  //    never as `click`.
  //      • A docked chip forwards its `data-dockkit-tab` id to the host
  //        face; the store's planner owns every guard (missing tab,
  //        unclosable guide, last-docked-tab collapse). A throw means no
  //        seat is mounted — nothing there to close.
  //      • A floating header forwards to its native ✕ control, which
  //        carries the kit's close path and guards; the dock button next
  //        to it is excluded, so middle-clicking it keeps doing nothing.
  const onAuxClick = (event: MouseEvent): void => {
    if (event.button !== MIDDLE_BUTTON) return
    const chip = chipOf(event.target)
    if (chip !== undefined) {
      const tabId = chip.dataset.dockkitTab
      if (tabId === undefined || tabId === '') return
      event.preventDefault()
      const face = sidebarRightFace(ctx)
      if (face === undefined) return
      try {
        face.close(tabId)
      } catch {
        // `sidebarRight: no session surface is mounted` — no seat, no tab.
      }
      return
    }
    const grip = floatGripOf(event.target)
    if (grip === undefined) return
    if (event.target instanceof Element && event.target.closest(FLOAT_DOCK_SELECTOR) !== null) return
    event.preventDefault()
    grip.querySelector<HTMLButtonElement>(FLOAT_CLOSE_SELECTOR)?.click()
  }

  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('auxclick', onAuxClick, true)

  // Every handler here is synchronous and there is no observer, timer or
  // microtask, so the flag only makes the disposer itself idempotent.
  let disposed = false
  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('mousedown', onMouseDown, true)
    document.removeEventListener('auxclick', onAuxClick, true)
    // Identity-checked: a late cleanup from an older bundle instance must not
    // clear the marker the instance that replaced it just published.
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}
