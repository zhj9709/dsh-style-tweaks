/**
 * dsh-style-tweaks — sidebar session-count tweak.
 *
 * DSH folds each Workspace's session list to five rows and grows it five at a
 * time (`COLLAPSED_SESSION_LIMIT` in the workspace browser). That limit is a
 * `useState` inside the browser component, and the persisted view store keeps
 * only `groupBy / orderBy / groupExpansion / sessionOrderByAccount /
 * archivedFilter` — so no setting, slot or store action reaches it from outside
 * the host. This tweak therefore drives the control the host already renders
 * rather than replacing it.
 *
 * ## How it takes over
 *
 * The host paints one overflow button per folded group, carrying
 * `data-row-key="overflow:<groupKey>"` and `aria-expanded` (true once nothing
 * is hidden). Pressing it is the only way to make the host render more rows, so
 * the tweak presses it on the user's behalf and then decides what stays on
 * screen:
 *
 *   1. **Grow** — press the host button until the group has rendered at least
 *      as many rows as the configured count needs. The host advances five at a
 *      time and finally jumps to "all" (`Infinity`) when the remainder is five
 *      or fewer, so the loop terminates on either the row count or on the
 *      button going away.
 *   2. **Trim** — hide the rows past the configured count. The rows carry no
 *      inline style of their own (verified on 0.1.7-rc.2), so a marker
 *      attribute plus one stylesheet rule is enough, and a host re-render that
 *      keeps the same elements leaves the markers alone.
 *   3. **Re-label** — hide the host's button and put the plugin's own in its
 *      place. The wording is the host's own (`workspace` namespace, the
 *      `sessions.expand` / `sessions.collapse` pair), and the number is the
 *      honest remainder from {@link pendingCount}: sessions above the host's
 *      limit, read off that very label, plus the rows this trim is holding.
 *
 * Pressing the plugin's button changes only the trim count; growing is always
 * delegated back to the host, so the host's "show everything" state is what
 * backs a long list. Collapsing trims back to the initial count instead of
 * asking the host to fold to five, because the host's own fold cannot express
 * a custom count.
 *
 * ## The grow is never hidden
 *
 * An earlier revision marked the list `visibility: hidden` while it was growing,
 * to conceal the 5 → 10 → 15 → 20 steps the host walks through one React render
 * at a time. That was a mistake in both directions, and users reported a blink
 * on every expansion. The hide was kept for the automatic grow and dropped for
 * a press, which left the two paths behaving differently and both of them
 * wrong: the window is short (one press is a single render, well under 100ms),
 * and a `visibility` toggle that short still reads as a flicker, so the list
 * vanished and came back. Concealing the steps was never worth anything either
 * — the presses land close enough together that the user sees one growth, not a
 * ladder. Growth is now always shown, through the host's own row animation.
 *
 * ## The button is published before the rows, not after
 *
 * Showing the growth is not the same as waiting for it, and conflating the two
 * is what made the control feel slow. Publishing used to sit at the very end of
 * a pass, behind the grow and behind a settle that waits for both the row count
 * and the host's label to hold still — measured: expanding a Workspace had all
 * eleven of its rows on screen by ~50ms, and the button did not appear until
 * t=199ms. The rows were there and the thing you press to see more was not.
 *
 * The figure itself never needed that wait. It is `total - shown`, and both
 * halves are known the moment the group opens: the total is the host's own "N
 * more" label plus the rows it has rendered, and `shown` is the trim the pass is
 * about to apply. So the button is published before the grow starts, carrying
 * the figure the grow was going to produce, and the publish after it reuses that
 * same total — held for the pass, because asking `totalSessions` twice means
 * asking the host's label twice, and the host rewrites that label on every
 * render. Publishing early is therefore not publishing early *and then again*:
 * the number lands once and stays put.
 *
 * The one case that cannot publish early is a host label with no integer in it —
 * the host is already showing everything, or has not painted yet. There is no
 * honest figure to put up front there, so that pass reads it the settled way.
 *
 * ## What the tweak does not do
 *
 * It never hides a selected row. Opening a session — including opening one
 * found through the host's own search, which reveals the row and scrolls to it
 * — marks that row `aria-selected="true"`, and the trim always yields to it. A
 * row the host asked to scroll to but the user is not in is not covered; the
 * host's reveal lifts the group's limit to "all" on its own, which leaves the
 * row rendered, and the trim is re-applied on the next tick.
 *
 * ## Stability of the anchors
 *
 * Class fragments (`groupSection`, `sessionOverflowButton`, `list`) are
 * CSS-Modules hashes that rotate per build, so every selector matches on the
 * stable semantic fragment as a substring, the way `locate-current-session` and
 * `project-running-indicator` do. `data-row-key` is the host's own contract and
 * carries the group key, which is what the per-group state is keyed by.
 *
 * @module dsh-style-tweaks/client/tweaks/sidebar-session-count
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

/** Attribute marking a row the trim must keep hidden. */
const HIDDEN_ATTR = 'data-cst-sid-hidden'
/** Attribute marking the plugin's own overflow button. */
const OWN_BUTTON_ATTR = 'data-cst-sid-button'

/**
 * How long to let the host's row transition finish before a corrective pass.
 *
 * `AnimatedRows` glides a row in or out over ~200ms (`ROW_GLIDE_MS`) and keeps
 * the departing row in the DOM for that whole window, where it still matches
 * the `session:` row selector. Any count taken inside the window includes a row
 * that is on its way out, so a trim computed there is computed against a set
 * that will shrink. This is the host's own duration plus slack.
 */
const GLIDE_SETTLE_MS = 300

/** A Workspace group's block; the class fragment survives CSS-Modules hashing. */
const GROUP_SELECTOR = '[class*="groupSection"]'
/** Session rows, keyed by the host's own `session:<id>` row key. */
const SESSION_ROW_SELECTOR = '[data-row-key^="session:"]'
/** The host's overflow button, keyed by `overflow:<groupKey>`. */
const OVERFLOW_BUTTON_SELECTOR = '[data-row-key^="overflow:"]'
/** The scrolling list the rows live in. */
const LIST_SELECTOR = '[class*="list"][role="tree"]'
/** The selected session row, which the trim always yields to. */
const SELECTED_ROW_SELECTOR = '[data-row-key^="session:"][aria-selected="true"]'

/**
 * The rules this tweak needs. `!important` because the host's own row rules set
 * `display`, and both of these have to win over them.
 *
 * The second rule hides the host's overflow button outright, for the WHOLE
 * page, rather than hiding it from script. Doing it in script left a window: the
 * host inserts the button in the same commit that adds the rows, and the tweak's
 * observer only reached it two microtasks later, so the host's own count — a
 * figure recomputed on every render and wrong for most of the grow — was on
 * screen for those milliseconds. A stylesheet applies as part of layout, with
 * no such window, and the plugin's own button takes over with a settled number.
 */
const SESSION_COUNT_CSS = `
[${HIDDEN_ATTR}="1"] { display: none !important; }
${OVERFLOW_BUTTON_SELECTOR} { display: none !important; }
`

/** Locale bound to the host's `workspace` namespace, for the button wording. */
type Translate = (key: string, params?: Record<string, string | number>) => string
let tWorkspace: Translate | undefined

/** Per-group trim target, kept on the element so a React re-render cannot lose it. */
const TRIM_ATTR = 'data-cst-sid-trim'
/**
 * Marks a group whose user pressed the plugin's button at least once.
 *
 * Needed because a full list and a complete-by-default list look identical
 * from the DOM: both render every session and hide none. Without the mark, a
 * Workspace that was expanded all the way and one that simply has fewer
 * sessions than the configured count are the same case, and the button that
 * folds the first back disappears along with the one that never belonged on
 * the second.
 */
const TOUCHED_ATTR = 'data-cst-sid-touched'
/**
 * Cached session total for a group, so the button's figure does not have to
 * wait for the host to re-render its own label. See {@link totalSessions}.
 */
const TOTAL_ATTR = 'data-cst-sid-total'

/** Resolved configuration for one mount of the tweak. */
export interface SidebarSessionCountConfig {
  /** Rows a Workspace shows before any expansion. */
  readonly initialCount: number
  /** Rows one press of the plugin's button adds. */
  readonly expandStep: number
}

/**
 * How long a settle loop tolerates a suspended rAF before the fallback timer
 * fires.
 *
 * An occluded window — the user alt-tabs away right after pressing — stops
 * scheduling frames entirely while `visibilityState` still reads "visible"
 * (measured 2026-09-26: 0 frames in 900 ms). Every settle below waits on
 * {@link nextFrame}, so without a fallback one press could freeze its pass
 * mid-grow: `busy` stays held, the group's button ignores every further click,
 * and the list sits at whatever the host had last rendered — observed live,
 * twice. The timer keeps the chain moving; Chromium clamps background timers
 * too, so the pass finishes slowly rather than never.
 */
const FRAME_FALLBACK_MS = 250

/**
 * Wall-clock ceiling for one settle, next to the frame-count cap.
 *
 * The frame cap assumes frames keep coming. Under the suspended-rAF condition
 * {@link nextFrame} guards against, one "frame" can take a second or more, and
 * 90 of them would hold the pass — and `busy` — for minutes. Two seconds is
 * more than 90 frames ever need at 60 fps (1.5 s), so on a healthy renderer
 * the frame cap still binds first and nothing changes.
 */
const SETTLE_BUDGET_MS = 2000

/** Next animation frame, used to wait out a host render between presses. */
function nextFrame(): Promise<void> {
  return new Promise(resolve => {
    let settled = false
    const once = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    const timer = window.setTimeout(once, FRAME_FALLBACK_MS)
    requestAnimationFrame(() => {
      window.clearTimeout(timer)
      once()
    })
  })
}

/** Own stylesheet for the two attribute rules. */
function injectStyles(): () => void {
  const id = 'cst-sidebar-session-count'
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweakCss = id
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, SESSION_COUNT_CSS)
  // No origin check on the way out: `releaseStyleNode` already refuses to
  // remove a node a newer instance has adopted (the token check in
  // `style-node.ts`), so tracking who created it here would only re-test the
  // same ownership rule.
  return () => { releaseStyleNode(style, owner) }
}

/** The host's overflow button for a group, or null when the group is not folded. */
function hostButton(group: Element): HTMLButtonElement | null {
  return group.querySelector<HTMLButtonElement>(OVERFLOW_BUTTON_SELECTOR)
}

/** Session rows currently rendered for a group, in document order. */
function sessionRows(group: Element): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>(SESSION_ROW_SELECTOR)]
}

/** Current trim target for a group, defaulting to the configured initial count. */
function trimOf(group: Element, config: SidebarSessionCountConfig): number {
  const raw = Number(group.getAttribute(TRIM_ATTR))
  return Number.isFinite(raw) && raw > 0 ? raw : config.initialCount
}

/**
 * Whether the host still has a pressable "show more" for this group.
 *
 * The two states that cannot grow are: no overflow button (the host renders
 * none when it is already showing everything), and a button that is
 * `aria-expanded="true"` (the host's "everything is shown" state, where a
 * press would fold it back to five). Both leave the rendered count fixed, so
 * a group in either state must not be queued for growing.
 */
function canGrow(group: Element): boolean {
  const button = hostButton(group)
  if (button === null) return false
  return button.getAttribute('aria-expanded') !== 'true'
}

/** Rows the trim is currently hiding, i.e. what a "show more" press reveals.
 *
 * Counted from the markers rather than as `rendered - trim`: the selected row
 * is never hidden and may sit past the target, so the two can differ, and the
 * button's number is the one the user acts on.
 */
function remainingRows(group: Element): number {
  return sessionRows(group).filter(row => row.hasAttribute(HIDDEN_ATTR)).length
}

/**
 * Sessions above the host's own limit, read off its overflow button.
 *
 * The host renders that button as `t('sessions.expand', { n })` where `n` is
 * its `visible.hiddenCount` — the number of sessions past ITS limit, which is
 * exactly what it has not rendered. Parsing the first integer out of the label
 * therefore reads a number the host itself computed, in whichever locale is
 * active, rather than inventing one here.
 *
 * Once the host is showing everything the label reads "收起" and carries no
 * integer, so the match fails and this contributes zero — also right, since
 * there is nothing left above the limit.
 */
function hostNotRendered(group: Element): number {
  const match = hostButton(group)?.textContent?.match(/\d+/u)
  if (match === null || match === undefined) return 0
  return Number(match[0])
}

/**
 * How many sessions the Workspace has, or null when it cannot be read yet.
 *
 * The host's label plus the rows it has rendered add up to the total, exactly:
 * the label carries the sessions above its limit, the DOM carries the rest.
 *
 * The result is cached on the group because the total does NOT change when the
 * user presses "show more" — only the split between rendered and hidden does.
 * That is the whole point: the press used to leave the button showing the
 * previous figure for the ~100ms the host takes to re-render its own label,
 * which read as the number stalling and then jumping. With the total held, the
 * remainder is `total - shown`, and `shown` is this tweak's own value, so the
 * new figure is available the instant the trim is applied.
 */
function totalSessions(group: Element): number | null {
  const notRendered = hostNotRendered(group)
  const rendered = sessionRows(group).length
  if (notRendered > 0) {
    const total = notRendered + rendered
    setAttr(group, TOTAL_ATTR, String(total))
    return total
  }
  // No integer in the label: either the host shows everything (so `rendered`
  // IS the total) or it has not painted its label yet (so keep what we know).
  const cached = Number(group.getAttribute(TOTAL_ATTR))
  if (Number.isFinite(cached) && cached >= rendered && cached > 0) return cached
  return rendered > 0 ? rendered : null
}

/**
 * Sessions a press would reveal.
 *
 * Counted as "everything the Workspace holds, minus what is on screen", so it
 * covers both places the remainder can sit — above the host's own limit, and
 * below it behind this tweak's trim. Reading only the trim reported a list
 * with seven unrendered sessions as complete; reading only the host's label
 * ignored the rows this tweak is hiding, and left the figure unable to be
 * produced at all until the host re-rendered.
 */
function pendingCount(group: Element, shown: number, knownTotal?: number | null): number {
  const total = knownTotal === undefined ? totalSessions(group) : knownTotal
  if (total === null) return remainingRows(group)
  return Math.max(0, total - shown)
}

/**
 * Whether pressing the button would reveal anything. A Workspace can be over
 * the host's limit with nothing held by the trim, and a press is still
 * meaningful there because it raises the trim and the grow then follows — so
 * this asks the two places separately rather than only about hidden rows.
 */
function hasMore(group: Element): boolean {
  return hostNotRendered(group) > 0 || remainingRows(group) > 0
}

/**
 * A cheap fingerprint of everything a pass reads or writes for one group.
 *
 * The sweep consults it to skip groups whose settled state has not moved. That
 * matters because the sidebar mutates constantly for reasons that have nothing
 * to do with this tweak — a live session's own row updates about once a
 * second — and every one of those mutations used to cost every open group a
 * full pass: `syncGroup`, its 300ms glide settle, and a second `syncGroup`.
 * Measured before this existed: the group's busy mark was held roughly a third
 * of the time, so a third of all presses landed inside a pass (and the queue
 * caught them). With the fingerprint, a steady sidebar runs no passes at all
 * and the mark is free whenever the user presses.
 *
 * Every input a pass reacts to is in here. Counters alone are not enough: the
 * host reorders rows on a sort change by MOVING the same elements, so the
 * hidden marks ride along with them, and a count-only fingerprint would call
 * the result settled while the marks sat on the wrong rows — hence the row
 * identity at the tail (`lastKey`, `firstHiddenKey`). The selected row is
 * included for the same reason: the trim yields to it.
 */
function stateSignature(group: Element): string {
  const rows = sessionRows(group)
  const own = group.querySelector<HTMLButtonElement>(`button[${OWN_BUTTON_ATTR}]`)
  const host = hostButton(group)
  const selected = group.querySelector(SELECTED_ROW_SELECTOR)
  const last = rows.length > 0 ? rows[rows.length - 1] : undefined
  let hidden = 0
  let firstHiddenKey = ''
  for (const row of rows) {
    if (!row.hasAttribute(HIDDEN_ATTR)) continue
    hidden += 1
    if (firstHiddenKey === '') firstHiddenKey = row.getAttribute('data-row-key') ?? '?'
  }
  return [
    rows.length,
    hidden,
    firstHiddenKey,
    last?.getAttribute('data-row-key') ?? '',
    selected?.getAttribute('data-row-key') ?? '',
    group.getAttribute(TRIM_ATTR) ?? '',
    group.hasAttribute(TOUCHED_ATTR) ? 'touched' : '',
    group.getAttribute(TOTAL_ATTR) ?? '',
    hostLabel(group),
    host === null ? 'no-host' : host.style.display,
    own === null
      ? 'no-own'
      : `${own.textContent ?? ''}|${own.style.display}|${own.getAttribute('aria-expanded') ?? ''}`,
  ].join('|')
}

/**
 * Set or clear an attribute, writing only on an actual change.
 *
 * This is the tweak's load-bearing detail, not a micro-optimisation. The
 * MutationObserver below watches `HIDDEN_ATTR`, and a DOM `setAttribute`
 * queues a record **even when the value is identical** — so a sweep that
 * rewrote every attribute unconditionally would queue another sweep, which
 * would rewrite them again, and the sidebar would spin the main thread
 * forever. Writing only on change makes a repeat sweep a genuine no-op, and
 * the loop terminates after the first follow-up pass.
 */
function setAttr(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value)
}

function clearAttr(node: Element, name: string): void {
  if (node.hasAttribute(name)) node.removeAttribute(name)
}

/** Set an inline style only on a real change, for the same reason as {@link setAttr}. */
function setStyle(node: HTMLElement, property: 'display', value: string): void {
  if (node.style[property] !== value) node.style[property] = value
}

/**
 * Apply the trim to one group: mark every row past the target, unmark every
 * row within it, and always leave the selected row alone. Returns the number
 * of rows left on screen.
 *
 * Safe to run on every mutation batch and every settle frame: both directions
 * are change-guarded, so against a settled tree the call is a no-op. The
 * unmark direction is what clears a previous trim's stale marks (see
 * {@link awaitStableRows}), which is why the unconditional callers matter.
 */
function applyTrim(group: Element, trim: number): number {
  const rows = sessionRows(group)
  const selected = group.querySelector(SELECTED_ROW_SELECTOR)
  let shown = 0
  for (const row of rows) {
    // The selected row is the session the user is in; hiding it would fight
    // the host's own reveal, which scrolls to exactly that row. It counts
    // against the target, so a selected row deep in the list does not push
    // the target up and quietly widen every group.
    const keep = selected !== null && (row === selected || row.contains(selected))
    if (keep || shown < trim) {
      clearAttr(row, HIDDEN_ATTR)
      shown += 1
    } else {
      setAttr(row, HIDDEN_ATTR, '1')
    }
  }
  return shown
}

/**
 * The host button's label, which is where this tweak reads the count of
 * sessions above the host's own limit from.
 */
function hostLabel(group: Element): string {
  return hostButton(group)?.textContent?.trim() ?? ''
}

/**
 * Wait for the group to settle — by ROW COUNT and by the host's LABEL — while
 * trimming on the way.
 *
 * Three things make this more than a plain "wait for stability".
 *
 * The row count: the host commits rows in batches and `AnimatedRows` glides
 * them over ~200ms, so a count read straight after a press can be partial.
 *
 * The label: `pendingCount` takes "sessions above the host's limit" from the
 * host button's own text, and React rewrites that text as part of the same
 * render that adds the rows. Waiting on the count alone is therefore not
 * enough — the count settled at 15ms while the button still read the previous
 * "20", so the first pass computed 21 and the corrective pass, 300ms later,
 * recomputed 16. Users saw the button's number change under them after every
 * press. Both inputs have to be steady before a figure is published.
 *
 * The trim: it is re-applied on EVERY frame of the wait rather than once at
 * the end, and UNCONDITIONALLY — never behind a `count > trim` gate. Forward
 * reason: the settle spends the better part of 100ms confirming the count, and
 * in that window rows past the target were painted and visible before a
 * gate-at-the-end trim hid them — a blink, the list growing by a row and
 * pulling it back. Trimming per frame means a row is marked the moment it
 * appears. Backward reason (measured 2026-09-26): a trim target that just ROSE
 * inherits stale hidden marks — rows hidden by the previous, smaller trim ride
 * out the host's keyed re-render on their elements — and while the rendered
 * count is still under the target, a gated trim skips them. On a multi-press
 * grow they were then cleared only by the LAST press, so a row snapped into
 * the MIDDLE of the already-grown list one press late and shifted every row
 * below it down a row-height: the flash on every second expansion (14 → 21
 * painted 19 rows with row 15 missing for 91ms, then row 15 popped in
 * mid-list). An unconditional trim clears the stale marks in the same
 * pre-paint microtask as the insertion. The final trim in `syncGroup` still
 * runs, and settles the result.
 */
async function awaitStableRows(
  group: Element,
  trim: number,
  frames = 5,
  max = 90,
): Promise<number> {
  const t0 = performance.now()
  let count = sessionRows(group).length
  let label = hostLabel(group)
  let stable = 0
  for (let frame = 0; frame < max && performance.now() - t0 < SETTLE_BUDGET_MS; frame += 1) {
    await nextFrame()
    applyTrim(group, trim)
    const now = sessionRows(group).length
    const nowLabel = hostLabel(group)
    if (now === count && nowLabel === label) {
      stable += 1
      if (stable >= frames) return count
    } else {
      stable = 0
      label = nowLabel
    }
    count = now
  }
  return count
}

/**
 * Frames to give a press's render to land before calling the press dead.
 *
 * Ten frames is ~160ms on a healthy renderer, and stretches automatically
 * under the suspended-rAF fallback (each "frame" there is a timer tick). Every
 * measured host render has landed well inside this.
 */
const PRESS_LAND_FRAMES = 10

/**
 * Press the host's button until the group has settled at `needed` rows.
 *
 * The host's `aria-expanded` is the trap here. It mirrors `sessionsExpanded`,
 * which the host derives from its own LIMIT (`visible.hiddenCount === 0`), not
 * from the rows it has actually committed — so the flag can read "everything
 * shown" while the list is still three rows short of it, which is what pinned
 * ten-row Workspaces at seven visible rows. Once the flag is set the press is
 * also no longer a growth: the host reads that button as a COLLAPSE and resets
 * the limit to its five-row default. So the flag is never pressed, only waited
 * out — the count is given a chance to catch up, and if it does not, the grow
 * stops rather than collapsing the list behind the user's back.
 *
 * ## Why a MutationObserver guards the grow
 *
 * The host grows in steps of five, so a target below the step boundary (seven
 * rows, say) is always reached with rows to spare: it renders ten, and four of
 * them have to go. Trimming on the next animation frame was too late to stop
 * that being seen — the browser paints between the commit and the frame
 * callback, so the list showed ten rows and then pulled back to seven, which is
 * the blink users reported. A `MutationObserver` callback is a MICROtask, and
 * the microtask checkpoint runs before the frame is painted, so marking the
 * surplus rows the moment they are inserted means they are never presented.
 * The rAF wait below still settles the count; while the grow runs, the
 * observer is the only thing keeping the render honest.
 *
 * The callback trims UNCONDITIONALLY, not only once the rendered count has
 * passed `needed`. A raised trim target inherits stale hidden marks from the
 * previous, smaller trim — they sit on row elements the host KEEPS across its
 * keyed re-render — and on a multi-press grow the first press lands while the
 * rendered count is still below the target, so a gate there skipped the
 * cleanup and the marks survived until the last press. The row then popped
 * into the middle of the already-grown list one press late, shifting every
 * row below it: the flash users reported on every second expansion. Clearing
 * in the same microtask as the insertion is what makes the first press paint
 * a complete list. `applyTrim` is change-guarded, so with nothing stale to
 * clear it is a no-op.
 */
async function growTo(group: Element, needed: number, budgetMs = 4000): Promise<void> {
  const deadline = performance.now() + budgetMs
  let count = sessionRows(group).length
  const guard = count <= needed
    ? new MutationObserver(() => { applyTrim(group, needed) })
    : undefined
  if (guard !== undefined) {
    guard.observe(group, { childList: true, subtree: true })
  }
  try {
    while (count < needed && performance.now() < deadline) {
      const button = hostButton(group)
      // No button left means the host is rendering every row it has.
      if (button === null) return
      if (button.getAttribute('aria-expanded') === 'true') {
        count = await awaitStableRows(group, needed)
        return
      }
      const before = count
      button.click()
      // Wait only until THIS press's render has landed — not for full
      // stability. Pacing a multi-press grow by the full settle held ~100ms
      // between presses, and the user watched the list grow in instalments
      // (10 → 15 → pause → 20 for a +10 target); pressed back-to-back, the
      // host's renders land a couple of frames apart and the glide animation
      // reads them as one continuous flow. Count AND label stability is
      // settled exactly once, after the last press, by the awaitStableRows in
      // `syncGroup` — the figure the button publishes comes from there.
      let landed = false
      for (let frame = 0; frame < PRESS_LAND_FRAMES && performance.now() < deadline; frame += 1) {
        await nextFrame()
        count = sessionRows(group).length
        if (count > before) {
          landed = true
          break
        }
      }
      // The press produced nothing (host ignored it, or the render never
      // landed). Stop rather than spin on the same button. A short grow is
      // self-healing: `syncGroup` trims to what rendered, and the next sweep
      // re-enters `growTo` for the remainder.
      if (!landed) return
    }
  } finally {
    guard?.disconnect()
  }
}

/**
 * Wording for the plugin's own overflow button.
 *
 * Both halves come from the host's `workspace` locale namespace, so the
 * wording and its locale follow the host's own catalogue. The count is the
 * honest one from {@link pendingCount} — the same figure the press is about —
 * so the label cannot promise one thing and deliver another, which is what
 * happened when the host's own number was reused with a different step size.
 */
function buttonText(pending: number): string {
  const collapse = tWorkspace?.('sessions.collapse') ?? '收起'
  if (pending <= 0) return collapse
  const n = pending
  return tWorkspace?.('sessions.expand', { n }) ?? `展开其余 ${n} 个会话`
}

/** Create (once) the plugin's own overflow button inside a group. */
function ownButton(group: Element, onClick: () => void): HTMLButtonElement {
  const existing = group.querySelector<HTMLButtonElement>(`button[${OWN_BUTTON_ATTR}]`)
  if (existing !== null) {
    if (existing.dataset.cstSidWired !== '1') {
      existing.addEventListener('click', onClick)
      existing.dataset.cstSidWired = '1'
    }
    return existing
  }
  const host = hostButton(group)
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(OWN_BUTTON_ATTR, '1')
  // Reuse the host's own class so the button keeps the shipped look; the
  // fragment is stable across builds the same way every other anchor is.
  if (host !== null) button.className = host.className
  button.addEventListener('click', onClick)
  button.dataset.cstSidWired = '1'
  if (host !== null) host.parentElement?.insertBefore(button, host.nextSibling)
  else group.appendChild(button)
  return button
}

/**
 * Show the plugin's button for a group, or take it down when it has nothing to
 * do. `knownTotal` pins the total so two publishes within one pass cannot
 * disagree; see the `lockedTotal` note in {@link syncGroup}.
 */
function publish(
  group: Element,
  onPress: (group: Element) => void,
  shown: number,
  knownTotal?: number | null,
): void {
  // The count covers both kinds of remainder; `touched` keeps the button on a
  // group the user expanded all the way, which is the one case where nothing is
  // left to reveal but the fold still has to be offered.
  const pending = pendingCount(group, shown, knownTotal)
  const showButton = pending > 0 || group.hasAttribute(TOUCHED_ATTR)
  const existing = group.querySelector<HTMLButtonElement>(`button[${OWN_BUTTON_ATTR}]`)
  if (!showButton) {
    // A button this instance mounted earlier (the Workspace had more sessions
    // a moment ago, or the count was raised) has to be taken down, not just
    // skipped — otherwise it keeps its old "收起" over a complete list.
    if (existing !== null) setStyle(existing, 'display', 'none')
    return
  }
  const button = ownButton(group, () => { onPress(group) })
  setStyle(button, 'display', '')
  const label = buttonText(pending)
  if (button.textContent !== label) button.textContent = label
  setAttr(button, 'aria-expanded', pending > 0 ? 'false' : 'true')
  setAttr(button, 'data-cst-sid-pending-count', String(pending))
  setAttr(button, 'data-cst-sid-visible', String(shown))
}

/**
 * Bring one group in line with the configuration: grow the host far enough,
 * then trim to the group's target and publish the button wording.
 *
 * `alive` is the mount's liveness probe. A pass can outlive its own instance —
 * a settings change disposes and re-mounts every tweak while a grow is still
 * awaiting frames — and its writes are exactly what a disposed instance must
 * not make: the marker writes would re-hide rows the cleanup had just
 * released, and `publish` would re-create a button whose listener belongs to
 * the dead instance (the live one then finds it already wired and never
 * attaches its own). Checked once before the first write, and again after the
 * waits, because the waits are where the disposal lands.
 */
async function syncGroup(
  group: Element,
  config: SidebarSessionCountConfig,
  onPress: (group: Element) => void,
  alive: () => boolean,
): Promise<void> {
  const trimBefore = trimOf(group, config)
  if (!alive()) return
  // Growth is always shown, never hidden. See the module doc: the hide was a
  // blink in both directions, and the steps it concealed land close enough
  // together to read as one growth rather than a ladder.
  //
  // Growing is pointless once the list already holds every session the
  // Workspace has, and that is what the common "reveal the remainder" press
  // does: the trim runs a step past the last session and the button turns into
  // 收起. Asking the host to grow there buys a settle it can never satisfy —
  // its own button is gone — so the press that shows the last two sessions
  // sat ~150ms before the label flipped, which is the delay the user reported
  // on "展开其余 2 个会话". The total comes from the same reading the figure
  // uses, so this is a statement about the Workspace, not about the host's
  // transient button state.
  const rowsNow = sessionRows(group).length
  const knownTotal = totalSessions(group)
  const needsGrow = rowsNow < trimBefore && (knownTotal === null || rowsNow < knownTotal)
  // Take the host's button off screen BEFORE growing, not after.
  //
  // It is not just a label swap. The host recomputes its count on every render,
  // so while the grow walks the limit up it shows a running total that is wrong
  // for most of that walk — measured: the button appeared reading 25, the next
  // React commit put it at 20, and only when the grow finished and this tweak's
  // own button replaced it did the number settle at 24. Three changes in under
  // 200ms, all of them the user watching a figure they cannot trust move. With
  // the host's button hidden up front, that whole window shows no figure at all,
  // and the plugin's button appears once with the settled number.
  const hostBefore = hostButton(group)
  if (hostBefore !== null) setStyle(hostBefore, 'display', 'none')
  /**
   * The total, read once and held for the rest of this pass.
   *
   * `totalSessions` recomputes from the host's label every time it is asked,
   * and the host rewrites that label on every render — so a pass that asked
   * twice could publish two different figures for one press, which is the
   * number-changing bug all over again. Reading it up front and passing it down
   * makes the second publish a no-op when nothing really changed.
   */
  let lockedTotal: number | null | undefined
  if (needsGrow) {
    // Publish BEFORE the grow, not after it.
    //
    // The button's figure is `total - shown`, and neither input needs the rows:
    // the total is the host's own "N more" label plus the rows it has rendered,
    // both readable the moment the group opens, and `shown` is the trim this
    // pass is about to apply. Waiting for the grow made the button itself the
    // last thing to arrive — measured: expanding a Workspace put all eleven of
    // its rows on screen by ~50ms, and the button did not appear until t=199ms,
    // which read as the control lagging the list. The rows still walk up
    // visibly (see the module doc), but the button is there from the start,
    // already carrying the figure the grow was going to produce anyway.
    //
    // Gated on the host's label carrying an integer, because that is the only
    // moment the total is knowable. Without one — the host is already showing
    // everything, or has not painted — there is no honest figure to publish
    // early, and the pass below reads it the settled way instead.
    if (hostNotRendered(group) > 0) {
      // `knownTotal` is used, not a second `totalSessions` call: both reads
      // happen in this one task with no await between them, so the value read
      // above is exactly what a fresh call would return — and the doc above
      // stays true, that the figure comes from a single reading.
      lockedTotal = knownTotal
      publish(group, onPress, trimBefore, lockedTotal)
    }
    await growTo(group, trimBefore)
    // `growTo` stops the moment the row count reaches the target, and the rows
    // land in the same React commit that rewrites the host button's label — so
    // it can return with the label still reading the previous press. Publishing
    // a figure computed from that stale input is what made the button's number
    // change under the user (21, then 16 a third of a second later): this
    // second settle is the one that actually covers the label. With the total
    // held, the row count is all that is left to settle.
    await awaitStableRows(group, trimBefore)
  }
  // The waits above are where a disposal lands, so the liveness of the mount
  // is re-checked here, before the tail — which is all writes.
  if (!alive()) return
  // The trim is the user's intent, and it is NEVER rewritten from the row
  // count. An earlier revision clamped it with `Math.min(trimBefore, rendered)`
  // and wrote the result back, which latched: a single pass that read a partial
  // count mid-render (seven of ten) pinned the trim at seven, and every later
  // pass found `min(7, 10) === 7` and agreed with itself. Ten-row Workspaces
  // were stuck at seven visible rows with no way back. If the grow fell short,
  // the trim simply exceeds what is rendered, the trim shows what is there, and
  // the next sweep tries the grow again.
  const trim = trimBefore
  const visible = applyTrim(group, trim)
  // The host's button was already taken off screen above, before the grow; it
  // stays in the DOM because the host still owns the "show all" state, and its
  // label is not ours to read once growth is under way.
  const host = hostButton(group)
  if (host !== null) setStyle(host, 'display', 'none')
  publish(group, onPress, visible, lockedTotal)
}

/**
 * Mount the tweak. Returns a disposer that removes the plugin's buttons and
 * clears every marker, restoring the host's own control.
 */
export function setupSidebarSessionCount(
  ctx: ClientContext,
  config: SidebarSessionCountConfig,
): () => void {
  try {
    const locale = (ctx as unknown as { locale?: { bind(ns: string): Translate } }).locale
    if (locale !== undefined && typeof locale.bind === 'function') {
      tWorkspace = locale.bind('workspace')
    }
  } catch {
    tWorkspace = undefined
  }

  const removeStyles = injectStyles()
  let disposed = false
  /** Whether this mount is still live; every write path consults it. */
  const isAlive = (): boolean => !disposed

  /**
   * One pass per group, in flight.
   *
   * This is the ONLY guard, deliberately shared by the sweep and the button's
   * click handler. An earlier revision kept two — `busy` for the sweep and
   * `clicking` for clicks — and because neither knew about the other, a press
   * landing while a sweep was mid-grow ran two `syncGroup` passes over one
   * group at once. The two then wrote the trim markers in whatever order they
   * finished, so a group configured for ten rows could settle with three rows
   * marked hidden from the pass that ran with a smaller count.
   * Sharing the guard means a press landing inside a pass cannot run inline —
   * so it is QUEUED ({@link pendingPress}) and served by the pass that holds
   * the mark, the moment it releases the group. Dropping it was the old
   * behaviour, and it was not rare: a live session's own row mutates about
   * once a second, every one of those mutations re-sweeps the sidebar, and
   * each sweep holds every open group's mark for the length of its settle —
   * so a sizable fraction of all presses landed inside some pass and vanished
   * without touching the trim (measured 2026-09-27: a click 800ms after load).
   */
  const busy = new WeakSet<Element>()

  /**
   * Fingerprint of each group's last settled pass, as of the moment that pass
   * finished (see {@link stateSignature}). A sweep that finds the current
   * fingerprint equal skips the group entirely — that is what keeps a sidebar
   * full of live-updating rows from costing every open group a pass per
   * mutation.
   */
  const settled = new WeakMap<Element, string>()

  /**
   * A press that arrived while the group was busy, stored as the trim value it
   * computed at click time (see {@link clicker}). One slot per group: a burst
   * of clicks during one pass coalesces into the latest intent.
   */
  const pendingPress = new WeakMap<Element, number>()

  /**
   * Resolves the glide-settle wait of a group's in-flight pass early, when a
   * press is queued for it. Without this the press would wait out the full
   * settle — the one visible cost of queueing a press instead of dropping it.
   */
  const tailWake = new WeakMap<Element, () => void>()

  /** Apply a press's outcome and re-sync. Shared by the direct and queued paths. */
  const applyPress = (group: Element, next: number): void => {
    setAttr(group, TRIM_ATTR, String(next))
    setAttr(group, TOUCHED_ATTR, '1')
    // The user asked for this growth, so it is shown rather than hidden.
    runSync(group)
  }

  /**
   * Serve a press queued while the group was busy. Called from every site that
   * releases `busy`. Skipped when the group folded away during the wait —
   * raising the trim of a detached subtree would only re-mark nodes the sweep
   * is about to clean.
   */
  const servePendingPress = (group: Element): void => {
    if (disposed) return
    const next = pendingPress.get(group)
    if (next === undefined) return
    pendingPress.delete(group)
    if (!group.isConnected) return
    applyPress(group, next)
  }

  /**
   * Run one pass over a group, then re-run it once the DOM has settled.
   *
   * The second pass is the fix for a class of bug no guard can prevent: the
   * host's `AnimatedRows` glides rows in and out over ~200ms, adding and
   * removing them in batches, so a pass that runs mid-animation counts a row
   * set that is about to change. A group configured for ten rows was observed
   * settling with three rows marked hidden — the pass had seen thirteen rows,
   * marked the tail, and the animation then finished at ten, leaving the marks
   * behind on rows that survived.
   *
   * Waiting out the host's own transition duration and re-running fixes the
   * count against the settled tree. It cannot loop: every write in `syncGroup`
   * is change-guarded, so the second pass finds everything already correct,
   * writes nothing, and the observer goes quiet.
   */
  const runSync = (group: Element): void => {
    if (disposed) return
    if (busy.has(group)) return
    busy.add(group)
    void (async (): Promise<void> => {
      try {
        await syncGroup(group, config, clicker, isAlive)
        // A press that arrived while this pass ran is served by the finally
        // below, and ITS pass covers both jobs this tail exists for: the
        // re-read against the settled tree and the published figure. This is
        // checked twice — here, and again after the settle — because the
        // press that matters lands during the settle, not before it: the
        // figure the user reacts to ("展开其余 2 个会话") is published by the
        // first `syncGroup`, and a press on it then queues behind exactly this
        // wait. `clicker` wakes the wait when it queues; the second check
        // catches a press that landed just before the wait ended.
        if (pendingPress.has(group)) return
        // Re-run against the settled tree — and "settled" has to mean the
        // animation is OVER, not merely that the row count stopped moving.
        // `AnimatedRows` keeps a departing row in the DOM (still matching
        // `session:`) for the length of its ~200ms glide, so a pass that runs
        // during one trims a set that is about to shrink: it saw thirteen rows,
        // marked the tail, and when the glide finished at ten, three marked rows
        // had survived. A count-stability test passes mid-glide precisely
        // because the count really is stable there, so the wait has to clear
        // the host's own transition duration before the second pass reads.
        //
        // It cannot loop: every write in `syncGroup` is change-guarded, so the
        // second pass finds everything already correct, writes nothing, and the
        // observer goes quiet.
        await new Promise<void>((resolve) => {
          const wake = (): void => {
            window.clearTimeout(timer)
            tailWake.delete(group)
            resolve()
          }
          const timer = window.setTimeout(wake, GLIDE_SETTLE_MS)
          tailWake.set(group, wake)
        })
        if (disposed) return
        if (pendingPress.has(group)) return
        // The group may have been folded away while the wait elapsed.
        if (!group.isConnected || group.querySelector(SESSION_ROW_SELECTOR) === null) return
        await syncGroup(group, config, clicker, isAlive)
        // Record what this pass settled, so the next sweep can tell an idle
        // group from one that needs work (see `stateSignature`).
        settled.set(group, stateSignature(group))
      } catch {
        // A pass that throws — most plausibly the host's own click handler
        // throwing back through `button.click()` — must not surface as an
        // unhandled rejection, and must not stop the surrounding sweep. The
        // finally releases the group and serves any queued press; the
        // mutations the pass produced schedule the next sweep, which retries
        // against the fresh state.
      } finally {
        busy.delete(group)
        servePendingPress(group)
      }
    })()
  }

  /**
   * Presses the plugin's own button, one round per click, coalesced.
   *
   * A click arriving while a pass holds the group is queued with the trim
   * value computed NOW — from the click-time DOM — and served when the pass
   * releases the group; see {@link pendingPress}. Serving the precomputed
   * value is what keeps a queued "show more" from turning into a fold because
   * the pass it waited for happened to complete the list in the meantime.
   */
  const clicker = (group: Element): void => {
    // A listener that outlived its mount — see `syncGroup`'s note on the
    // re-created button — must be inert rather than run a dead instance's pass.
    if (disposed) return
    const current = trimOf(group, config)
    // Two states, decided by whether a press would reveal anything: more
    // raises the trim by a step and the grow in `syncGroup` follows it, and
    // none folds back to the initial count. That is what keeps the button from
    // being a one-way ratchet.
    //
    // The trim is deliberately NOT capped at the rendered row count. That
    // count is what the host has been asked for so far, not how many sessions
    // the Workspace has, so capping at it pins the trim to the current batch
    // and every press after the first reveals a single row. `syncGroup` grows
    // the host to meet the trim, and stops on its own once the host runs out
    // of button.
    const next = hasMore(group) ? current + config.expandStep : config.initialCount
    if (busy.has(group)) {
      pendingPress.set(group, next)
      // Cut the in-flight pass's glide settle short — that wait is the only
      // thing standing between this click and the press being served.
      tailWake.get(group)?.()
      return
    }
    applyPress(group, next)
  }

  /**
   * Drive every open group once.
   *
   * `syncGroup` is async (it may wait on host renders while growing), so a
   * sweep can be re-entered by the mutations the previous sweep is still
   * producing. `busy` (shared with the click handler, see above) keeps one pass
   * per group in flight: a sweep that arrives mid-pass finds the group marked
   * and skips it, and the mutations the pass causes re-schedule a sweep
   * afterwards, which then finds the finished state and writes nothing.
   */
  let scheduled = false
  const sweep = async (): Promise<void> => {
    if (disposed) return
    const open: Element[] = []
    for (const group of document.querySelectorAll(GROUP_SELECTOR)) {
      if (group.querySelector(SESSION_ROW_SELECTOR) !== null) {
        if (!busy.has(group)) open.push(group)
        continue
      }
      // A folded Workspace renders neither rows nor the host's own overflow
      // button, so React unmounts those — but the plugin's button is a DOM
      // patch sitting beside them, and React only removes the nodes it owns.
      // Skipping the group (as an earlier revision did) therefore left a
      // "show more" under a Workspace the user had just closed, offering to
      // expand a list that is not there.
      group.querySelector(`button[${OWN_BUTTON_ATTR}]`)?.remove()
      // Folding is also how the host resets its own limit, so the trim has to
      // follow it back to the configured count. Keeping the old trim would
      // re-grow the list to wherever it had been left the last time the
      // Workspace was opened, which is not what folding a group means here.
      clearAttr(group, TRIM_ATTR)
      clearAttr(group, TOUCHED_ATTR)
      clearAttr(group, TOTAL_ATTR)
      // Folding releases the group's fingerprint with the other markers, so
      // its next unfold is treated as a fresh group and gets a full pass.
      settled.delete(group)
    }
    const groups = open
    // A group whose fingerprint matches the one its last settled pass recorded
    // is skipped whole: nothing a pass would read or write has moved. This is
    // what makes an idling sidebar free — its rows keep updating (a live
    // session's timer, a status dot), and without the check every one of those
    // mutations bought every open group a full pass with a 300ms settle.
    const growing: Element[] = []
    for (const group of groups) {
      if (settled.get(group) === stateSignature(group)) continue
      // Groups that already render enough rows are trimmed straight away —
      // that pass is synchronous and touches no host button. A group whose
      // trim is still above its rendered rows goes through the grow path
      // below, one press at a time.
      if (sessionRows(group).length < trimOf(group, config)
        && canGrow(group)) {
        growing.push(group)
        continue
      }
      runSync(group)
    }
    // Groups that need more rows press the host's button, and that is a React
    // render each time. Running them one after another keeps the host from
    // re-rendering the whole tree once per group in a burst; each list is marked
    // pending by its own pass, so the sequence settles one Workspace at a time.
    for (const group of growing) {
      if (disposed) return
      let ok = true
      busy.add(group)
      try {
        await syncGroup(group, config, clicker, isAlive)
      } catch {
        ok = false
        // Same reasoning as `runSync`'s catch: a throwing pass must not
        // abandon the groups still queued behind it. `ok` keeps the fingerprint
        // from being recorded, so the next sweep retries this group.
      } finally {
        busy.delete(group)
      }
      // A sweep that arrived while this group was busy skipped it, and the
      // mutations it produced have already been delivered. Re-arm so the
      // finished state — the button label above all — is written by a sweep
      // that can see the group idle.
      schedule()
      if (ok && !disposed && group.isConnected) settled.set(group, stateSignature(group))
      servePendingPress(group)
    }
  }
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      void sweep()
    })
  }

  schedule()

  // The host re-renders the whole tree on session switches, group toggles and
  // window-width changes, which drops the plugin's buttons and the trim
  // markers along with it. Re-sweeping on those mutations is the whole reason
  // this is an observer rather than a one-shot pass.
  //
  // The observer is fed by the tweak's own writes — every attribute write in
  // `syncGroup` queues a record, because the filter covers the attributes the
  // trim marks and the button publishes. That is not a loop on its own: the
  // writes are change-guarded (`setAttr` / `clearAttr` / `setStyle` and the
  // text comparison in `syncGroup`), so the follow-up sweep finds every value
  // already correct, writes nothing, and the chain ends after one pass — and
  // with the fingerprint check at the top of the sweep, that follow-up
  // usually runs no pass at all (see `stateSignature`). An earlier revision
  // wrote unconditionally and pinned the main thread here.
  const observer = new MutationObserver((records) => {
    if (disposed) return
    for (const record of records) {
      const target = record.target
      if (!(target instanceof Element)) continue
      if (target.matches(`${LIST_SELECTOR}, ${GROUP_SELECTOR}, ${SESSION_ROW_SELECTOR}`)) {
        schedule()
        return
      }
      if (target.closest(GROUP_SELECTOR) !== null) {
        schedule()
        return
      }
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [HIDDEN_ATTR, 'aria-selected', 'aria-expanded', 'data-row-key'],
  })

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    for (const button of document.querySelectorAll(`[${OWN_BUTTON_ATTR}]`)) button.remove()
    for (const row of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) clearAttr(row, HIDDEN_ATTR)
    for (const group of document.querySelectorAll(GROUP_SELECTOR)) {
      clearAttr(group, TRIM_ATTR)
      clearAttr(group, TOUCHED_ATTR)
      clearAttr(group, TOTAL_ATTR)
      const host = hostButton(group)
      if (host !== null) setStyle(host, 'display', '')
    }
    removeStyles()
  }
  return cleanup
}
