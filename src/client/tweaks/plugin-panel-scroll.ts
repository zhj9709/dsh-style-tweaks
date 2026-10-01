/**
 * dsh-style-tweaks — plugin-panel-scroll tweak.
 *
 * Two navigation repairs to the plugin management panel
 * (`@deepseek-ai/dsh-client-ui-plugin-manager`), one switch:
 *
 *   1. **The way back keeps its place.** The position belongs to the act of
 *      going back: returning to the page you came from — a component's settings
 *      page → its plugin's page, a plugin's page → the plugin list — puts you
 *      where you left that page, instead of at the top. Entering a page starts
 *      it at the top: forward navigation, the panel opening and a cross-plugin
 *      jump all open the page they land on at its beginning.
 *   2. **The "插件列表" crumb stays put.** On a detail page it scrolls away with
 *      the content, so getting back means scrolling to the top first.
 *
 * ## The panel
 *
 * The manager is a `main` slot panel keyed `plugins`
 * (`PluginManagerPage.tsx`), not a Settings-dialog section, and its whole UI is
 * one scrollport with four views swapped through a navigation store
 * (`navigation-store.ts`: `list` / `package` / `item` / `row`):
 *
 *   <section class={css.page} data-plugin-panel>       ← overflow:auto; height:100%
 *     list view:     <header class={css.pageHead}> … <section class={css.group}> × N
 *     detail views:  <div class={css.detail} data-plugin-detail=… >
 *                     <div class={css.detailTop} data-window-drag>
 *                       <button class={css.crumb}>‹ 插件列表</button>
 *                       <div class={css.detailHead}> icon … actions
 *     </div>
 *   </section>
 *
 * The nesting is three deep, which is what makes fix 1 more than one entry: the
 * list is level 1, a plugin's page is level 2, and one of its components'
 * settings pages is level 3 — and on a bundle with a dozen components (a memory
 * plugin ships sixteen) each level is a page in its own right, long enough to
 * scroll.
 *
 * ## Identifying a view
 *
 * Every detail view marks its own direct child of the scrollport with a
 * host-authored attribute carrying the thing it is showing, and the list view
 * has no such attribute but renders the `<header class={css.pageHead}>`:
 *
 *   data-plugin-detail="dsh-mnemon"                          → package:<name>
 *   data-plugin-item-detail="shell"                          → item:<id>
 *   data-plugin-row-detail="dsh-mnemon#mnemon-source-runtime" → row:<bundle>#<row>
 *   …and no attribute, but a `> [class*="_pageHead"]` child   → list
 *
 * So the identity of a view needs no class guess at all — these are the same
 * attributes the host's own cross-plugin navigation reads. Only the list falls
 * back to a CSS Modules fragment, and that one is safe twice over: `pageHead` is
 * declared once across DSH (in `PluginManagerPage.module.css`), and it is
 * pinned to the list's own position in the tree. A view whose identity cannot be
 * read is left alone rather than guessed at.
 *
 * ## Fix 1 — the way back keeps its place
 *
 * The scroll container is NOT remounted across a view change (verified live on
 * 0.2.0-rc.2: the same `<section>` node answers `querySelector` before and
 * after). The position is lost anyway, and the mechanism is plain CSS:
 *
 *   .page { height: 100%; overflow: auto }
 *
 * The browser clamps `scrollTop` to `scrollHeight - clientHeight` the moment the
 * content under it changes, and the panel's views differ wildly in height — the
 * mnemon list is ~1800px, its plugin page ~2700px, one component's settings
 * page ~1100px, all inside an 860px viewport. Step down into anything shorter
 * than where you were and the offset is gone before you can come back. Nothing
 * is remounted and nothing resets it; the view simply was never able to hold a
 * position while a shorter page stood on the scrollport.
 *
 * So each view's offset is remembered separately, and re-applied **only on the
 * way back** — see `parentKey` for what counts as back. Going *into* a page
 * applies no memory and opens that page at its top (`openAtTop`): the panel
 * keeps its `scrollTop` across a swap, so leaving the offset alone would start
 * the page part-way down, at whatever the browser's clamp measured against the
 * page's own shell (measured: 303px into a 2394px page). That is the rule the
 * user drew when reviewing this tweak — the memory serves 返回, not 进入 — and
 * it also keeps this tweak from inventing a position for a page the reader has
 * never been on.
 *
 * A remembered offset of 0 is a position like any other, and writing it back is
 * the one restore the panel cannot do without: the swap leaves the panel on
 * whatever the clamp measured against the incoming content, and 0 used to be
 * handed to `restore`, whose "nothing to aim at" guard writes nothing at all.
 * Measured on a harness panel (a `[data-plugin-panel]` with a 600px port, driven
 * through the same observer: the list at 0 → a 2200px page scrolled to 1500 → a
 * return to the list, whose content then holds 440): before, the landing was 440
 * — the bottom of the list, with zero writes — and with `openAtTop` the same
 * sequence lands on 0 with one write. A memory of 0 therefore goes through
 * `openAtTop` exactly as entering does.
 *
 *   • a passive `scroll` listener on the panel records `scrollTop` against the
 *     key of the view currently on screen;
 *   • a `MutationObserver` on the panel (direct children only) watches for the
 *     view swap — React removes one view's children and inserts another's — and
 *     when the swap is a step back up to a page this session has already shown,
 *     that page's own recorded offset is re-applied.
 *
 * Keying per view rather than only for the list is what makes the second level
 * work: the plugin page is itself long enough to scroll, so losing its offset on
 * the way down to a component and back up is the same bug one level lower. The
 * third level's own offsets are recorded the same way, but nothing is below it
 * to return *from*, so they are never applied — recording them costs one number
 * each and leaves the rule "back restores, forward does not" with no exceptions.
 *
 * ## Why the offset cannot be read at the moment of the swap
 *
 * Two measurements on 0.2.0-rc.2 shaped this, and both are the reason the
 * recorder has three inputs instead of one:
 *
 *   • **The outgoing offset is already gone when the observer runs.** The clamp
 *     happens at layout, which is before the MutationObserver's microtask: a
 *     probe registered alongside the tweak read `scrollTop === 0` inside the
 *     callback for a view that had been at 900. So "read it before restoring"
 *     is not available — there is nothing left to read.
 *   • **A programmatic `scrollTop` write fires no `scroll` event.** Measured on
 *     this host: `panel.scrollTop = 500` left the property at 500 and produced
 *     zero scroll events over the following 400 ms. Wheel, trackpad, keyboard
 *     and scrollbar drags all do fire, so a listener alone covers ordinary
 *     reading — but not the host's own `scrollIntoView`, not anything a plugin
 *     does to this panel, and not this tweak's own restore.
 *
 * Hence the two capture-phase listeners. A navigation is always a click or a
 * key press, and a capture listener on the panel runs **before** React's own
 * handler does — React 18 binds at the root container, so the root's bubble
 * listener (where the handler lives) fires later in the event's journey than
 * this panel's capture phase. At that instant the outgoing view is still on
 * screen and still holds its offset, which is exactly the one moment the clamp
 * has not reached yet. `keydown` rather than `click` alone also covers a button
 * driven by Space, whose click is synthesized on key-up.
 *
 * The `scroll` listener stays for the case the captures cannot see — a view that
 * changes without a press, e.g. the host resetting the navigation store when the
 * panel is deactivated. Nothing here needs a quiet window around a swap: the one
 * recording a swap itself can produce is the clamp, which carries the position
 * the incoming view is actually showing — the offset just restored (which is
 * `min(memory, max)`, so the browser has nothing left to clamp) or, for a page
 * being entered or returned to at its top, the 0 this tweak has just written.
 * Every swap therefore ends on a position this tweak chose, and recording that
 * position can only repeat the choice. The one swap that used to end somewhere
 * else is the memory-of-0 case, which wrote nothing at all and kept the clamp's
 * number; it is measured in "Fix 1".
 *
 * Later frames are still needed, because a view's own rows arrive in bursts: on
 * the first frames after a swap the view may not be tall enough to hold the
 * offset at all. That is worse than "a single attempt lands short" — the browser
 * clamps the offset to what the view can hold **before the first paint**, so a
 * retry can only walk it back down as the rows arrive, which is a visible
 * correction scroll. Measured on mnemon's package page (viewport 720px, offset
 * 1850): the swap landed on 1674 and the last batch arrived 114 ms later, when
 * the position was pushed to 1850. Coming back from a row whose configure
 * control sits low in a sixteen-row list is exactly where that offset lives, so
 * it was hit on nearly every return.
 *
 * So the restore **borrows the height it is missing**: while the view cannot
 * hold the offset, the panel's own `padding-bottom` grows by the difference,
 * which enlarges the scrollport's scrollable area by exactly that much, and the
 * first frame carries the offset itself. As the view's rows land the borrowed
 * padding shrinks back, frame by frame, and the first frame that can hold the
 * offset on the view's own height returns the padding to the stylesheet
 * (`borrowHeight` / `repayHeight`). The position never moves. What shows for the
 * ~100-150 ms in between is the page's own background where the rows are about
 * to be — the borrowed height is that gap — which is the price of not painting a
 * position the panel is about to leave.
 *
 * "Still growing" is therefore measured as a **quiet spell**, not as "grew since
 * the last frame": the rows arrive in batches with gaps between them, and on
 * mnemon's package page the last batch landed ~110-150 ms after the swap
 * (scrollport 2394px → 2687px). The per-frame rule stopped on the first quiet
 * frame and left the panel 253px short of where the user had been, which reads
 * as the page scrolling off to somewhere it should not have. The loop runs until
 * the offset is reached, the height has been still for `QUIET_MS`, the deadline
 * passes, or **the user moves the panel** — see `yieldToUser`. Reaching the
 * offset hands the whole loan back; the other exits give back only the part the
 * current position does not need (`repayHeight`), so a view that is genuinely
 * shorter than the remembered offset (a component uninstalled since) keeps the
 * reader where they came back to and stays that much taller than its content
 * until they leave it. That is the one case this mechanism trades away — the
 * answer it replaced, landing the reader on the view's real end, is the position
 * being pulled out from under them, which is what this tweak exists to stop —
 * and `releaseHeight` collects whatever is left on the way out of the view. Only
 * truly positive offsets reach `restore`'s loop: a page remembered at its top
 * goes through `openAtTop` (see `viewObserver` for why that write is needed).
 *
 * ### Telling the browser's clamp apart from the user
 *
 * That last exit is exact rather than heuristic, and it rests on the
 * no-scroll-event fact above: this plugin's own `scrollTop` writes are silent,
 * so the only events that can arrive while a restore is retrying are the single
 * clamp the swap causes and real input. The clamp carries the position the
 * restore is already holding, so a scroll event that leaves the panel there is
 * the clamp, and one that moves it is a hand on the wheel. The restore then
 * stands down — it stops writing the position, and the loop stays only to give
 * the borrowed height back at a moment when that cannot move the position, so
 * nobody is ever dragged back to a remembered offset. Measured before the
 * borrowing existed: a remembered 700 the list could no longer hold lands on
 * 412, and the user's own scrolls to 40 / 90 / 20 are then all respected.
 *
 * The memory also outlives the panel itself, because it has to: the manager is a
 * global panel, so switching to the chat and back **unmounts** it entirely, and
 * the offsets must still be there when a page is returned to afterwards. The map
 * therefore lives outside `panel`, and `detach` deliberately keeps it. What the
 * panel does *not* do on the way back in is restore anything: opening the panel
 * is entering, and entering applies no memory (`attach` only seeds the view it
 * opened on, so a later return to it has a position even if nothing was recorded
 * in between).
 *
 * ## Fix 2 — the crumb stays put
 *
 *   position: sticky; top: 0   — pins the page's own header row (crumb, icon,
 *                                 actions) to the top of the scrollport, so the
 *                                 way back is always under the pointer. It holds
 *                                 on all three levels.
 *   z-index: 2                 — the bar has to paint over the rows passing
 *                                 beneath it; without it the text shows
 *                                 through the gaps around the crumb.
 *   background                  — see below.
 *   padding-bottom: 12px        — breathing room under a pinned bar.
 *   margin-bottom: -12px        — …and the 12px that gives back, so the
 *                                 resting layout is byte-identical to stock.
 *
 * The background is `--dsw-alias-bg-base`, which is not a guess: the panel's
 * own scrollport is transparent and the frame behind it paints exactly that
 * token (`ui-layout`'s `.frame { background: var(--dsw-alias-bg-base) }`, and
 * the same token on `.centerCol` under a Windows title bar). Verified on
 * 0.2.0-rc.2 in both themes — light `#fff`, dark `#151517`, matching the frame
 * pixel for pixel. Content only ever occupies the `.page`'s own centred 960px
 * column (`.page > * { max-width: 960px }`), so covering that column is
 * enough: the gutters beside it stay empty and need no fill.
 *
 * `padding-bottom` + `margin-bottom` is a deliberate pair rather than a plain
 * padding: a bare `padding-bottom` would add 12px to the gap between the header
 * and the page's title on every page, resting and stuck alike. The negative
 * margin pulls the following sibling straight back up, so the header's border
 * box is 12px taller (and its background 12px deeper) while the content below
 * it starts exactly where DSH put it. The bar still gets its gap, because when
 * it is pinned that 12px sits inside the bar, between the icon row and the text
 * sliding under it.
 *
 * ## Specificity
 *
 * The host's `.detailTop` rule is (0,1,0) and none of the four properties above
 * are set by it, so a single `[data-plugin-panel] [class*="_detailTop"]` rule
 * (0,2,0) wins outright. `overflow-anchor` is not a property the host sets on
 * the panel at all, and `[data-plugin-panel]` (0,1,0) is all the second rule
 * needs. No `!important` anywhere.
 *
 * ## Lifecycle
 *
 * The panel is mounted and unmounted with the global panel it belongs to, so a
 * body-level `MutationObserver` (gated by `touchesScope`, or a streaming answer
 * would schedule a frame and a document-wide query for every mutation) tracks
 * whichever element currently answers `PANEL_SELECTOR`. The remembered offsets
 * deliberately live outside the panel and survive `detach`, because a page has
 * to keep its position across the panel being unmounted — that is what makes a
 * return from a component still land right after a trip to the chat. Attaching
 * only ever *reads* the panel's position into the memory for the view it shows
 * and never writes one: opening the panel is entering, and a settings change —
 * which re-mounts every tweak — therefore cannot yank the view out from under
 * the user either.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { touchesScope } from '../mutation-scope.ts'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

/** The plugin manager's scrollport. Host-authored attribute, not a hashed class. */
export const PANEL_SELECTOR = '[data-plugin-panel]'

/**
 * The list view's header. The only view with no host-authored identity
 * attribute of its own, and the only one matched by a class fragment — which is
 * safe because `pageHead` is declared once across DSH and this is its only
 * position in the tree.
 */
const LIST_HEAD_SELECTOR = ':scope > [class*="_pageHead"]'

/**
 * The detail views' identity attributes, in the order they are read. Each one
 * sits on the scrollport's direct child and names what that page is showing, so
 * the pair (attribute, value) is a stable key no matter how DSH renames its CSS
 * classes. `row` is checked first because it is the most specific: a bundle row
 * names both the bundle and the row.
 */
const DETAIL_KEY_ATTRS = [
  ['data-plugin-row-detail', 'row'],
  ['data-plugin-item-detail', 'item'],
  ['data-plugin-detail', 'package'],
] as const

/**
 * The view currently on screen, as a stable key, or `undefined` while it cannot
 * be identified — in which case the caller leaves its state alone rather than
 * attributing one page's scroll to another.
 * @param panel - The manager's scrollport.
 * @returns The view key, or undefined.
 */
function viewKey(panel: HTMLElement): string | undefined {
  for (const [attr, prefix] of DETAIL_KEY_ATTRS) {
    const value = panel.querySelector(`:scope > [${attr}]`)?.getAttribute(attr)
    if (value !== undefined && value !== null) return `${prefix}:${value}`
  }
  return panel.querySelector(LIST_HEAD_SELECTOR) !== null ? 'list' : undefined
}

/**
 * The view a crumb leads back to from `key`, or `undefined` when nothing in the
 * panel goes back up from it.
 *
 * This is what separates 返回 from 进入 for the memory: a swap whose target is
 * the outgoing view's parent is the reader going *back*, and only that gets a
 * remembered offset. Coming from the list into a plugin's page — or from a
 * plugin's page into one of its components' pages — is going *in*, and opens
 * that page at its top. The panel offers exactly one way up from any
 * page, and it is its crumb: a component's settings page returns to its plugin's
 * page ("返回 {name}"), and both a plugin's page and an official item's page
 * return to the list ("返回插件列表"). A row's own key names the package it
 * belongs to, which is the one relation that has to be read out of the value:
 * the host composes that value as `${bundle}#${rowId}` (`config-ledger.ts`), so
 * the **first** `#` is the separator — a bundle is an npm package name and cannot
 * contain one, while a row id is the bundle's own free-form string.
 * @param key - The view being left.
 * @returns The key of the page its crumb returns to, or undefined.
 */
function parentKey(key: string): string | undefined {
  if (key.startsWith('row:')) {
    const rest = key.slice(4)
    const hash = rest.indexOf('#')
    return hash <= 0 ? undefined : `package:${rest.slice(0, hash)}`
  }
  if (key.startsWith('package:') || key.startsWith('item:')) return 'list'
  return undefined
}

/** Stylesheet id; also the `data-tweak-css` key of the injected node. */
export const PLUGIN_PANEL_SCROLL_CSS_ID = 'cst-plugin-panel-scroll'

/**
 * How long a restore may keep retrying while its view grows.
 *
 * Generous because a view's own rows can arrive well after its shell does —
 * every slot-rendered row is the owning plugin's own asynchronous render — and
 * harmless for the reason described above: retries stop as soon as the
 * scrollport stops growing, whatever the clock says.
 */
const RESTORE_DEADLINE_MS = 900

/**
 * How long the scrollport may stay the same height before a restore gives up on
 * reaching its target.
 *
 * This exists because "still growing" cannot mean "grew since the last frame":
 * a plugin's rows arrive in bursts with quiet gaps between them, and on
 * `dsh-mnemon`'s package page the last batch landed ~140 ms after the view
 * swapped (measured: scrollport 2394px → 2687px at t=153ms). A per-frame rule
 * stopped on the first quiet frame and left the panel 253px short of where the
 * user had been. A quiet *spell* longer than this is what "settled" means.
 *
 * Combined with `yieldToUser` the window costs nothing: the loop stops the
 * moment the panel moves under a hand, so the only time it can hold the view is
 * while nothing is happening.
 */
const QUIET_MS = 260

const PLUGIN_PANEL_SCROLL_CSS = `
/* The plugin manager's page header: the "插件列表" crumb, the plugin's icon and
 * its actions. Pinned to the top of the panel's scrollport so the way back is
 * always reachable, with the host's own panel background so the content passing
 * under it is hidden rather than showing through. See the module doc for why
 * --dsw-alias-bg-base is the panel's background rather than a guess, and why
 * padding-bottom is paired with an equal negative margin. */
[data-plugin-panel] [class*="_detailTop"] {
  position: sticky;
  top: 0;
  z-index: 2;
  padding-bottom: 12px;
  margin-bottom: -12px;
  background: var(--dsw-alias-bg-base);
}

/* Turn off Chromium's scroll anchoring for this scrollport, and only this one.
 *
 * Anchoring exists to keep the content a reader is looking at still when things
 * resize ABOVE it — normally a good, invisible courtesy, and it was given a fair
 * trial here. It loses on this panel twice over, both measured on 0.2.0-rc.2:
 *
 *   • **At a swap** the anchor node it picks belongs to the content that has just
 *     been deleted, so the adjustment it then applies lands as an arbitrary jump:
 *     returning to a plugin page remembered at 1023 landed on 1316 about a
 *     quarter-second after the swap — one frame of the right place, then dragged
 *     away. With the rule in place the same sequence lands on 1023 and stays.
 *
 *   • **While a page fills in** it does not hold the reader's content still
 *     either, which is what it was let back in to do. On mnemon's package page it
 *     picked an anchor lower in the viewport and walked the panel 293px deeper
 *     than the position the reader had come back to (1641 → 1934, ~100 ms after
 *     the swap), which shows them a later part of the page than the one they
 *     left. Off, the same return lands on 1641 and never moves: the borrowed
 *     height is what makes the offset reachable in the first place, and no
 *     adjustment is needed on top of it.
 *
 * So the panel keeps overflow-anchor off, and the position it lands on is the
 * position it stays on. */
[data-plugin-panel] {
  overflow-anchor: none;
}
`

/** Idempotent style install, same pattern as the other CSS tweaks: refresh the
 *  text unconditionally so a surviving node from an older bundle cannot serve
 *  stale rules after a hot swap. */
function installPluginPanelScrollStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${PLUGIN_PANEL_SCROLL_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = PLUGIN_PANEL_SCROLL_CSS_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, PLUGIN_PANEL_SCROLL_CSS)
  return () => { releaseStyleNode(style, owner) }
}

/** HMR duplicate-setup guard (same pattern as settings-nav-scroll). */
const GLOBAL_KEY = '__cst_plugin_panel_scroll_cleanup__'
function getGlobalCleanup(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[GLOBAL_KEY] as (() => void) | undefined
}
function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[GLOBAL_KEY] = fn
}

/**
 * Mount the tweak: pin the detail page's header, and remember where each view
 * of the panel was scrolled to.
 * @param _ctx - client context (unused; signature parity with JS tweaks).
 * @returns the disposer removing styles, listeners, and observers.
 */
export function setupPluginPanelScroll(_ctx: ClientContext): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  const removeStyles = installPluginPanelScrollStyles()

  /** The scrollport currently being tracked, if the manager panel is open. */
  let panel: HTMLElement | undefined
  /**
   * Every view's remembered offset, keyed by `viewKey`, applied only when that
   * view is returned to (`parentKey`).
   *
   * Deliberately NOT cleared on detach: the manager is a global panel, so
   * switching to the chat and back unmounts it, and a return that happens after
   * that must still land where the page was left. The map is bounded by how many
   * plugins, official items and component rows exist, and each entry is one
   * number.
   */
  const offsets = new Map<string, number>()
  /** The key of the view on screen, or undefined while it is unidentifiable. */
  let currentKey: string | undefined
  /** A restore frame still queued, if any. */
  let frame = 0
  /**
   * The offset the running restore last wrote, or undefined when none is.
   *
   * This plugin's own writes are silent (no scroll event), so this is what tells
   * the browser's one clamp apart from the user: a scroll event that leaves the
   * panel exactly here is the clamp, and one that moves it is a hand on the
   * wheel. See `yieldToUser`.
   */
  let lastWrite: number | undefined
  /**
   * The scrollport currently carrying borrowed height, the inline
   * `padding-bottom` it had before this instance took it over, and the padding
   * the stylesheet gives that element — the base the borrowed height is added to.
   *
   * All three outlive `panel` on purpose: `detach` gives the height back after
   * the panel reference is gone, and the element is usually detached by then.
   */
  let padded: HTMLElement | undefined
  let paddedInline = ''
  let paddedBase = 0
  /** How much height this instance has borrowed from the panel, in px. */
  let paddedPx = 0
  /**
   * Whether the running restore may still write the panel's position. Cleared
   * when the user takes the panel over — from then on the loop is only there to
   * give the borrowed height back, and only at a moment when that moves nothing.
   */
  let writing = true

  /**
   * Borrow the height the offset needs and the view cannot hold yet.
   *
   * A scroll container's own end padding is part of its scrollable area, so
   * growing the panel's `padding-bottom` by the missing amount makes the offset
   * reachable on the frame it is written — which is the whole point: the browser
   * clamps at layout, before the first paint, so an unreachable offset is gone
   * before any later frame could restore it.
   *
   * The stylesheet's own padding is read on takeover and added to, never
   * replaced, and the inline property is removed again on repayment so the
   * resting layout is the host's.
   * @param need - The height the view is missing, in px (always positive).
   */
  const borrowHeight = (need: number): void => {
    if (panel === undefined) return
    if (padded !== panel) {
      paddedInline = panel.style.paddingBottom
      paddedBase = Number.parseFloat(getComputedStyle(panel).paddingBottom) || 0
      padded = panel
      paddedPx = 0
    }
    if (need === paddedPx) return
    paddedPx = need
    padded.style.paddingBottom = `${paddedBase + need}px`
  }

  /**
   * Give back the borrowed height the current position does not need, and never
   * a pixel more.
   *
   * The invariant is that returning height must not move the reader: the padding
   * may only shrink to `scrollTop - realMax`, so the scrollable range still ends
   * exactly at the bottom of their viewport. What that leaves on loan is
   * deliberate — the height a view that is genuinely shorter than the remembered
   * offset cannot take back, which the reader's own position needs for as long as
   * they stay on the view. `releaseHeight` collects the rest — on the way out of
   * the view, where a clamp cannot be seen.
   *
   * A no-op when nothing is on loan, so every exit path can call it.
   */
  const repayHeight = (): void => {
    if (padded === undefined) return
    const realMax = panel === undefined
      ? 0
      : Math.max(0, panel.scrollHeight - panel.clientHeight - paddedPx)
    const deficit = panel === undefined ? 0 : Math.max(0, panel.scrollTop - realMax)
    if (deficit > 0) {
      if (deficit === paddedPx) return
      paddedPx = deficit
      padded.style.paddingBottom = `${paddedBase + deficit}px`
      return
    }
    releaseHeight()
  }

  /**
   * Hand all borrowed height back, restoring whatever inline `padding-bottom` the
   * element had. Removing the last of it can clamp the position, so this is for
   * moments where that cannot be seen: the panel is leaving the view, or a new
   * restore is about to lay the view out from scratch anyway.
   */
  const releaseHeight = (): void => {
    if (padded === undefined) return
    const element = padded
    padded = undefined
    paddedPx = 0
    if (paddedInline === '') element.style.removeProperty('padding-bottom')
    else element.style.paddingBottom = paddedInline
    paddedInline = ''
  }

  /**
   * Record the on-screen view's offset.
   *
   * Bound to three inputs, because the offset cannot be captured any other way:
   *
   *   • **capture-phase `click` and `keydown`** — a navigation is always a press,
   *     and these run before React's own handler (React 18 binds at the root
   *     container, and the root's bubble phase is later in the event's journey
   *     than this panel's capture phase), hence before React commits the view
   *     swap. That is the last instant the outgoing view is still on screen and
   *     still holds its offset: by the time the MutationObserver runs, layout has
   *     already clamped it (measured: a view that was at 900 read back as 0
   *     inside the callback). `keydown` also covers a button driven by Space,
   *     whose click is only synthesized on key-up.
   *   • **passive `scroll`** — covers reading (wheel, trackpad, keyboard, scrollbar
   *     all fire it) and the case the captures cannot see: a view that changes
   *     without a press, such as the host resetting its navigation store when the
   *     panel is deactivated. It is also the only one of the three that a
   *     programmatic scroll misses — `panel.scrollTop = 500` produced zero scroll
   *     events over 400 ms on this host — which is exactly what the captures are
   *     there to cover.
   *
   * All three read the panel's current position, so the closure is shared and is
   * a no-op whenever no view can be identified. What is stored is the position
   * itself, including one the view is only holding because this tweak borrowed
   * height for it: this map records where the reader was, and how far the view
   * can follow is `restore`'s problem, not the memory's.
   */
  const record = (): void => {
    if (panel === undefined || currentKey === undefined) return
    offsets.set(currentKey, panel.scrollTop)
  }

  /**
   * Stand the restore down when the user moves the panel themselves. Bound to
   * the same closure as `record`, so it sees every input.
   *
   * This plugin's own `scrollTop` writes produce no scroll event at all
   * (measured), which makes the discrimination exact rather than heuristic: the
   * only events that can arrive while a restore is retrying are the single
   * clamp the swap causes and real input. The clamp carries the position we are
   * already holding — `lastWrite` — so anything that moves the panel off it is
   * the user, and standing down is the whole point: a remembered offset must
   * never drag someone who has already started scrolling.
   *
   * Standing down stops the position writes but not the loop, because the
   * borrowed height is still on loan and has to be given back — at a moment when
   * giving it back moves nothing, which `repayHeight` decides. The restore's own
   * frames make the same call synchronously (see `step`), so this listener is the
   * backstop for a move that a frame could not see rather than the only detector.
   */
  const yieldToUser = (): void => {
    if (frame === 0 || panel === undefined) return
    if (lastWrite === undefined || panel.scrollTop !== lastWrite) writing = false
  }

  /**
   * Put one view's remembered offset back, then keep the position while the view
   * is still growing into it.
   *
   * Called synchronously from the observer so the swap's first painted frame
   * already carries the offset — which for an offset deeper than the view's own
   * height means borrowing the difference first, so the browser has nothing to
   * clamp. The rAF continuation is only for a view that was still too short on
   * that frame.
   * @param target - The offset to land on. A value of 0 or less skips the whole
   *   path — nothing for the loop to aim at — which is why the callers send a
   *   page remembered at its top through `openAtTop` instead.
   */
  const restore = (target: number): void => {
    cancelRestore()
    if (panel === undefined || disposed || target <= 0) return
    writing = true
    const deadline = performance.now() + RESTORE_DEADLINE_MS
    /** When the height last grew; a quiet spell longer than QUIET_MS ends it. */
    let grownAt = performance.now()
    let previousMax = -1
    /** Write the position, unless the panel already holds it. */
    const write = (next: number): void => {
      if (panel === undefined || panel.scrollTop === next) return
      panel.scrollTop = next
      lastWrite = next
    }
    const step = (): void => {
      frame = 0
      if (disposed || panel === undefined) return
      const now = performance.now()
      const max = Math.max(0, panel.scrollHeight - panel.clientHeight)
      // What the view holds on its own, the borrowed height taken back out:
      // growth has to be measured on the view's own content, or the padding this
      // loop just added would read as a view that had already finished growing.
      const realMax = Math.max(0, max - paddedPx)
      // A panel that is not where this restore last put it was moved by something
      // else — a clamp, a programmatic scroll from the host or another plugin, or
      // a hand on the wheel. All of them are positions to respect, and none of
      // them may be walked back to the target: the retry stops writing and the
      // loop only returns what the borrowed height no longer needs. This is the
      // same discrimination `yieldToUser` makes from scroll events, taken
      // synchronously so it cannot lose a race with a write in the same frame.
      if (writing && lastWrite !== undefined && panel.scrollTop !== lastWrite) writing = false

      if (!writing) {
        // The user — or the browser on their behalf — has the panel. The borrowed
        // height is still ours to return, and `repayHeight` returns only the part
        // the position does not need. The deadline ends the wait; whatever is
        // still on loan then stays for the rest of the visit (`releaseHeight`
        // collects it on the way out), because taking it back would move the
        // reader.
        if (now >= deadline) return
        repayHeight()
        if (paddedPx > 0) frame = window.requestAnimationFrame(step)
        return
      }
      if (realMax >= target) {
        // The view can hold the offset by itself. With the offset inside the
        // view's own range, the borrowed height can go back without moving
        // anything, and the offset this restore owns is where it belongs.
        releaseHeight()
        write(target)
        return
      }
      borrowHeight(target - realMax)
      write(Math.min(target, realMax + paddedPx))
      if (realMax > previousMax) {
        previousMax = realMax
        grownAt = now
      } else if (now - grownAt >= QUIET_MS || now >= deadline) {
        // Settled, and still shorter than the offset: a view that shrank since
        // the offset was remembered. The borrowed height stays exactly as large
        // as the part of the offset the view cannot hold — the reader keeps
        // their position, and the view is left that much longer than its content
        // until they leave it, rather than being pulled back to the view's end.
        return
      }
      frame = window.requestAnimationFrame(step)
    }
    step()
  }

  /**
   * Drop a queued restore frame, forget the position it last wrote, and release
   * every pixel the view borrowed — the panel is going away or a new restore is
   * starting, so nothing may stay on loan.
   */
  function cancelRestore(): void {
    if (frame !== 0) window.cancelAnimationFrame(frame)
    frame = 0
    lastWrite = undefined
    releaseHeight()
  }

  /**
   * Open a page the reader is entering at its top.
   *
   * Entering applies no memory (see `parentKey`), and it is not "leave the
   * offset alone" either: the panel keeps its `scrollTop` across the swap, so a
   * page opened from a scrolled list would start part-way down — landed there by
   * the browser's own clamp against whatever the page's shell happened to
   * measure mid-commit, which is neither the top nor the position the reader
   * came from (measured: 303px into a 2394px page). A page that is being opened
   * starts at its beginning.
   *
   * A **return** to a page remembered at its top arrives here too: the reader's
   * own 0 is the position, and the same clamp is what would otherwise stand in
   * for it (see `viewObserver` for the measurement).
   *
   * Synchronous, like the restore, so the first painted frame is already there.
   */
  const openAtTop = (): void => {
    if (panel === undefined) return
    cancelRestore()
    if (panel.scrollTop !== 0) panel.scrollTop = 0
  }

  /**
   * React's view swap lands as one batch of direct-child records on the panel.
   *
   * A step back **up** restores the remembered offset of the page being returned
   * to (`parentKey`); anything else is entering, and entering opens at the top.
   *
   * A remembered offset of 0 is restored like any other, and it is the one case
   * that cannot be left to `restore`: that guard treats a target of 0 as nothing
   * to aim at, so a return to a page the reader had left at its top kept
   * whatever the swap's clamp left. Measured on a harness panel (600px port; the
   * list at 0 → a 2200px page scrolled to 1500 → a return to a list whose
   * content then holds 440): without the write the landing is 440, the bottom of
   * the list; with it, 0. A memory of 0 therefore goes through `openAtTop`,
   * which writes the top the same way entering does.
   */
  const viewObserver = new MutationObserver(() => {
    if (panel === undefined) return
    const key = viewKey(panel)
    // Unidentifiable means "this is not a settled view" — a transition frame, or
    // a host state this tweak has no name for. Keep the previous key rather
    // than blanking the memory attribution; the next settled view re-syncs.
    if (key === undefined || key === currentKey) return
    const left = currentKey
    currentKey = key
    // 返回 restores, 进入 opens at the top — and a memory of 0 is a position on
    // the 返回 side, not the absence of one: the reader left that page at its
    // top, and the swap's clamp is what moved it (see the doc above).
    const memory = left !== undefined && parentKey(left) === key ? offsets.get(key) : undefined
    if (memory === undefined || memory <= 0) openAtTop()
    else restore(memory)
  })

  const detach = (): void => {
    if (panel === undefined) return
    viewObserver.disconnect()
    panel.removeEventListener('scroll', record)
    panel.removeEventListener('click', record, true)
    panel.removeEventListener('keydown', record, true)
    panel.removeEventListener('scroll', yieldToUser, true)
    panel.removeEventListener('click', yieldToUser, true)
    panel.removeEventListener('keydown', yieldToUser, true)
    panel = undefined
    currentKey = undefined
    cancelRestore()
  }

  const attach = (next: HTMLElement): void => {
    detach()
    panel = next
    currentKey = viewKey(next)
    if (currentKey !== undefined && !offsets.has(currentKey)) {
      // Seed the view the panel opened on — where it opened is the only position
      // it has, and a later return to it needs one. Deliberately not a restore:
      // opening the panel is entering, and entering applies no memory.
      offsets.set(currentKey, next.scrollTop)
    }
    next.addEventListener('scroll', record, { passive: true })
    next.addEventListener('click', record, true)
    next.addEventListener('keydown', record, true)
    next.addEventListener('scroll', yieldToUser, { capture: true, passive: true })
    next.addEventListener('click', yieldToUser, true)
    next.addEventListener('keydown', yieldToUser, true)
    viewObserver.observe(next, { childList: true })
  }

  const scan = (): void => {
    const found = document.querySelector<HTMLElement>(PANEL_SELECTOR)
    if (found === panel) return
    if (found === null) {
      detach()
      return
    }
    attach(found)
  }

  let disposed = false
  let scanFrame = 0
  const scheduleScan = (): void => {
    if (scanFrame !== 0) return
    scanFrame = window.requestAnimationFrame(() => {
      scanFrame = 0
      scan()
    })
  }

  const bodyObserver = new MutationObserver((records) => {
    // The panel is the only thing `scan` reads. Without the gate a streaming
    // answer would schedule a frame — and a document-wide query — for a
    // mutation in the transcript.
    if (!touchesScope(records, PANEL_SELECTOR)) return
    // While nothing is attached — or the element that was attached has left the
    // document — scan in this callback rather than on a frame. The deferral is a
    // coalescing device for a panel that is already tracked, and it must not be
    // the only way an attach or detach can happen: a `scan` on a frame is one
    // rAF away from never running at all, and rAF stalls on this host whenever
    // the window is occluded (the same stall the sidebar-session-count notes
    // record). Measured: a plugin panel mounted by a rail click during such a
    // stall stayed untracked — the whole memory silently doing nothing, with
    // only the stylesheet left behind — until an unrelated mutation landed
    // while frames were running again.
    if (panel === undefined || !panel.isConnected) scan()
    else scheduleScan()
  })
  bodyObserver.observe(document.body, { childList: true, subtree: true })
  scan()

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    bodyObserver.disconnect()
    // Both queued frames are cancelled below, so neither callback can outlive
    // the disposer and re-arm itself against a torn-down tweak.
    if (scanFrame !== 0) window.cancelAnimationFrame(scanFrame)
    detach()
    cancelRestore()
    removeStyles()
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}
