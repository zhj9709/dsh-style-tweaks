/**
 * dsh-style-tweaks — settings-nav-scroll tweak.
 *
 * Makes the settings dialog's LEFT nav column scrollable once its section
 * list outgrows the fixed-height panel, instead of silently clipping the
 * entries at the bottom. Without this, a user with several plugin-registered
 * sections cannot reach the last items at all — the panel hides them and
 * nothing scrolls. The scrollbar itself is an overlay-style thin strip:
 * parked in the rail's spare padding so it never squeezes the menu, and
 * visible only while the list is actually being scrolled (macOS-style),
 * driven by a scroll listener rather than `:hover`.
 *
 * ## Symptom
 *
 * The settings dialog is DSH's `SettingsRoot`
 * (`packages/client/ui-settings-general/src/client/SettingsRoot.tsx`):
 *
 *   <div className={css.panel} role="dialog" aria-modal="true">   ← 800px, overflow: hidden
 *     <nav className={css.nav}>                                   ← 188px rail
 *       <div className={css.navTitle}>…</div>
 *       <div className={css.navList}>                             ← the section buttons
 *         <button className={css.navCell}>…</button> × N
 *       </div>
 *     </nav>
 *     <div className={css.content}> … </div>
 *   </div>
 *
 * The panel has ONE height for every section (`SettingsRoot.module.css`:
 * `height: min(800px, calc(100vh - 48px)); overflow: hidden`) so it does not
 * resize under the pointer between nav clicks, and its own comment states
 * "whatever does not fit scrolls in `.options`" — the right content column
 * got `overflow-y: auto`, but the LEFT nav never received the same
 * treatment. `.navList` is a plain flex column (`gap: 4px`, default
 * `flex: 0 1 auto`, no `min-height: 0`, no overflow), and its `min-height:
 * auto` forbids shrinking below the content, so the list simply overflows
 * `.nav` and the `.panel`'s `overflow: hidden` clips whatever spills past
 * the bottom edge. With enough plugin sections (this plugin alone adds one),
 * the last nav entries become unreachable.
 *
 * ## Fix — part 1 (CSS): make the list the scroll container
 *
 * One rule turning the nav list into the scroll container of the nav rail's
 * leftover height:
 *
 *   flex: 1          — the list owns the column height below the title
 *                      (previously implicit; nav is a flex column whose
 *                      only other child is the title row).
 *   min-height: 0    — the load-bearing line: overrides the flex item's
 *                      `min-height: auto`, allowing the list to be shorter
 *                      than its content so overflow becomes possible.
 *   overflow-y: auto — scroll only when entries exceed the height; a short
 *                      list looks exactly like stock DSH.
 *   overscroll-behavior: contain — at the list's scroll end the chain stops
 *                      here instead of scrolling some page behind the modal.
 *   padding-bottom: 12px — breathing room after the last entry when fully
 *                      scrolled (`.nav` has no bottom padding by design);
 *                      invisible when the list does not scroll.
 *   margin-inline-end: -12px — parks the bar OUT of the content column,
 *                      8px clear of the cells (see part 2).
 *
 * The title row stays fixed and the panel keeps its size — no layout shift
 * anywhere else.
 *
 * ## Fix — part 2 (CSS): the bar parks in the rail's padding gutter, clear of the cells
 *
 * A classic scrollbar consumes its width from the element's content box —
 * the first shipped version narrowed the cells 164 → 156px the moment the
 * bar appeared, and the bar sat there permanently while the list overflowed.
 * Native Chromium scrollbars have no CSS "overlay" mode, but the classic
 * bar can be parked out of the content column:
 *
 *   margin-inline-end: -12px — the list's border box stretches the rail's
 *                      full 12px right padding into itself: 8px gap + 4px
 *                      bar strip. The thumb therefore sits 8px clear of the
 *                      entries (values user-tuned in the console as W=4 /
 *                      GAP=8, then solidified into the tweak) and floats
 *                      over the rail's padding area like an overlay bar,
 *                      flush with the gutter edge before the content column
 *                      boundary.
 *
 *   [class*="_navCell"] { max-width: 164px } — the park widens the list's
 *                      content box whenever the bar is ABSENT (no overflow →
 *                      content 176px), which made the hover highlight paint
 *                      12px wider than stock in that state. Capping the cells
 *                      at DSH's stock width (188 nav − 2×12 padding) pins
 *                      them to 164px in EVERY state — bar present, bar
 *                      absent, hovering, scrolling — so the rail's geometry
 *                      never differs from stock by a pixel. If DSH ever
 *                      widens the rail, the cap only over-narrows cosmetically;
 *                      if it narrows, stretch wins below the cap and nothing
 *                      changes.
 *
 *   ::-webkit-scrollbar { width: 4px } — thinner than DSH's global 8px
 *                      skin; colour/radius of the visible thumb come from
 *                      DSH's global thumb rules (l2 tokens inherited from
 *                      the panel; the 4px radius auto-clamps to 2px on this
 *                      width), so only geometry lives here.
 *
 * ## Fix — part 3 (JS): show only while scrolling
 *
 * The idle bar must be invisible, and the first attempt used the classic
 * hover-reveal (`:not(:hover)::-webkit-scrollbar-thumb → transparent`).
 * Chromium does not reliably repaint custom scrollbar pseudo-elements when
 * only the HOST's `:hover` state changes — the thumb kept its last painted
 * style until an unrelated invalidation; in practice the bar appeared when
 * clicking a nav cell (React re-rendered the list → repaint) instead of
 * while scrolling, which is exactly backwards.
 *
 * So the show condition is driven by real activity: `scroll` events on the
 * list toggle a `cst-nav-scroll-show` class on the list itself, and ~800ms
 * after the last scroll event it is removed (macOS overlay-bar timing).
 * Class changes restyle the element itself, so the scrollbar repaints
 * reliably — no dependence on host pseudo-state. Wheel-scrolling requires
 * the pointer on the list, thumb drags fire scroll, and programmatic
 * scrolls (keyboard focus moving through the cells) count as activity too;
 * idle hovering shows nothing, matching "hide when not scrolling".
 *
 * The JS surface is deliberately small: a MutationObserver keeps the
 * scroll listener attached to whichever element currently matches the
 * selector (the dialog unmounts when closed and remounts when opened),
 * one passive `scroll` listener per attached list, one idle timer.
 *
 * ## Selector strategy
 *
 * DSH hashes CSS Modules class names with the `[hash]_[local]` pattern
 * (`packages/client/tsdown.client.ts`: `cssModules: { pattern:
 * '[hash]_[local]' }`), so the compiled class is `<hash>_navList` — the hash
 * is unpredictable across DSH versions, the local name is not. We match the
 * fragment with `[class*="_navList"]` and pin it structurally to the one
 * place that renders it: the modal panel's nav rail
 * (`div[role="dialog"][aria-modal="true"] > nav > …`). Both anchors are
 * redundant on their own; together they survive either DSH reshuffling the
 * dialog structure or renaming the local class.
 *
 * `navList` is defined in exactly one CSS module in DSH
 * (`ui-settings-general/src/client/SettingsRoot.module.css`), so the
 * fragment cannot collide with other dialogs (Modal primitive, lightbox,
 * onboarding steps, …) even before the structural pin.
 *
 * ## Specificity
 *
 * DSH's `.navList { display: flex; flex-direction: column; gap: 4px }` is
 * (0,0,1,0). The base rule is (0,3,2) — three attribute selectors plus two
 * element selectors — and DSH sets none of the base properties we touch.
 * The idle-thumb rule (0,3,2) beats DSH's unscoped global thumb skin
 * (0,0,1); the show rule adds a class (0,4,2) and its hover variant (0,5,2)
 * restores DSH's idle/hover token pair while shown. No `!important`
 * anywhere.
 *
 * ## Scrollbar skin
 *
 * The visible thumb reads DSH's themed scrollbar tokens: the panel rebinds
 * `--dsh-scrollbar-thumb{,-hover}` to the l2 elevation tokens (declared on
 * `.panel` so they inherit into any scrolling descendant); we reference the
 * same custom properties so the nav bar matches the right column's look,
 * only thinner.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { touchesScope } from '../mutation-scope.ts'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

/**
 * The dialog's left rail list. Exported because the rail is not this tweak's
 * private surface: `settings-nav-icon.ts` matches cells inside the same list,
 * and the two must never drift apart.
 */
export const NAV_LIST_SELECTOR = 'div[role="dialog"][aria-modal="true"] > nav > [class*="_navList"]'
/**
 * The same list, unanchored — for observer gates only, never for querying.
 *
 * `touchesScope` decides whether an added or removed node is relevant by asking
 * whether that node *contains* the scope, and `querySelector` only walks
 * descendants. So the anchored form above cannot see the dialog itself being
 * mounted or unmounted: `div[role=dialog]` is the scope's own ancestor, never a
 * descendant of itself. It works today only because the host renders `Modal`
 * through a portal whose wrapper is what actually lands in `document.body` — a
 * coincidence of that one component, not a property of the gate. A host that
 * mounted the dialog in place would leave this tweak and `settings-nav-icon`
 * silently inert, with nothing to say so. A false positive here costs one extra
 * `scan()`; a false negative costs a dead scroll driver.
 */
export const NAV_LIST_WATCH_SELECTOR = '[class*="_navList"]'
/** Class the scroll driver toggles to reveal the thumb. Lives on the list itself. */
const SHOW_CLASS = 'cst-nav-scroll-show'
/** Overlay-bar idle delay: fade out this long after the last scroll event. */
const HIDE_DELAY_MS = 800

const SETTINGS_NAV_SCROLL_CSS = `
/* Settings dialog left nav list: become the scroll container once the
 * section entries outgrow the fixed-height panel, with the bar parked in
 * the rail's right padding gutter — 8px gap + 4px strip = the full 12px
 * padding (see the module doc for the full derivation — panel
 * overflow:hidden clips the overflow today, and .options only gave the
 * RIGHT column a scroll treatment). */
${NAV_LIST_SELECTOR} {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 12px;
  margin-inline-end: -12px;
}

/* Pin the cells to DSH's stock width (188 nav − 2×12 padding): the parked
 * margin widens the list's content box whenever the bar is absent, and
 * without the cap the hover highlight would paint 6px wider than stock in
 * that state. With the cap the cells stay stock-width in every state. */
${NAV_LIST_SELECTOR} > [class*="_navCell"] {
  max-width: 164px;
}

/* Thin bar: 4px vs DSH's global 8px skin. Idle thumb is blanked; the
 * scroll driver below adds ${SHOW_CLASS} to reveal it with DSH's own l2
 * token colours while the list is actually scrolling. */
${NAV_LIST_SELECTOR}::-webkit-scrollbar {
  width: 4px;
}
${NAV_LIST_SELECTOR}::-webkit-scrollbar-thumb {
  background: transparent;
  transition: background-color .15s ease;
}
${NAV_LIST_SELECTOR}.${SHOW_CLASS}::-webkit-scrollbar-thumb {
  background: var(--dsh-scrollbar-thumb);
}
${NAV_LIST_SELECTOR}.${SHOW_CLASS}::-webkit-scrollbar-thumb:hover {
  background: var(--dsh-scrollbar-thumb-hover);
}
`

export const SETTINGS_NAV_SCROLL_CSS_ID = 'cst-settings-nav-scroll'

/** Idempotent style install, same pattern as the pure-CSS tweaks — with one
 * upgrade: if HMR re-runs setup while the previous style element survived
 * (teardown order across a hot swap is not guaranteed), its text is from the
 * OLD bundle. Refresh the text unconditionally so the new rules always win. */
function installNavScrollStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${SETTINGS_NAV_SCROLL_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = SETTINGS_NAV_SCROLL_CSS_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== SETTINGS_NAV_SCROLL_CSS) style.textContent = SETTINGS_NAV_SCROLL_CSS
  const owner = claimStyleNode(style)
  return () => { releaseStyleNode(style, owner) }
}

/**
 * HMR duplicate-setup guard (same pattern as project-running-indicator): a
 * hot reload can run setup again before the previous effect's cleanup ran;
 * run the stale cleanup first so two drivers never fight over one list.
 */
const GLOBAL_KEY = '__cst_settings_nav_scroll_cleanup__'
function getGlobalCleanup(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[GLOBAL_KEY] as (() => void) | undefined
}
function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[GLOBAL_KEY] = fn
}

/**
 * Mount the scroll driver: keep the scroll listener on whichever element
 * currently matches the nav-list selector, reveal the thumb while it
 * scrolls, fade it out after the idle delay.
 * @param _ctx - client context (unused; signature parity with JS tweaks).
 * @returns the disposer removing styles, listeners, and observers.
 */
export function setupSettingsNavScroll(_ctx: ClientContext): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  const removeStyles = installNavScrollStyles()

  let list: HTMLElement | undefined
  let onScroll: (() => void) | undefined
  let hideTimer: number | undefined

  const detach = (): void => {
    if (list === undefined) return
    if (onScroll !== undefined) list.removeEventListener('scroll', onScroll)
    list.classList.remove(SHOW_CLASS)
    if (hideTimer !== undefined) {
      window.clearTimeout(hideTimer)
      hideTimer = undefined
    }
    list = undefined
    onScroll = undefined
  }

  /** Fade the thumb out; the scroll listener stays attached for the next scroll. */
  const hide = (): void => {
    if (list === undefined) return
    list.classList.remove(SHOW_CLASS)
    hideTimer = undefined
  }

  const show = (): void => {
    if (list === undefined) return
    list.classList.add(SHOW_CLASS)
    if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hide, HIDE_DELAY_MS)
  }

  const attach = (next: HTMLElement): void => {
    detach()
    list = next
    onScroll = show
    list.addEventListener('scroll', onScroll, { passive: true })
  }

  const scan = (): void => {
    const found = document.querySelector<HTMLElement>(NAV_LIST_SELECTOR)
    if (found === list) return
    if (found === null) {
      detach()
      return
    }
    attach(found)
  }

  let disposed = false
  let frame = 0
  const scheduleScan = (): void => {
    if (frame !== 0) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      scan()
    })
  }

  const observer = new MutationObserver((records) => {
    // The rail is the only thing `scan` reads, and this observer spans the
    // whole body: without the gate a streaming answer would schedule a frame —
    // and a document-wide query — for a mutation in the transcript.
    if (touchesScope(records, NAV_LIST_WATCH_SELECTOR)) scheduleScan()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  scan()

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    // Cancelled below, so no queued frame can outlive the disposer — this tweak
    // needs no `disposed` test inside its callback.
    if (frame !== 0) window.cancelAnimationFrame(frame)
    detach()
    removeStyles()
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}
