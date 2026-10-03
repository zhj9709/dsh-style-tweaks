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
 *      honest remainder (see {@link remainder}): sessions above the host's
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
 * ## The button is published with the rows, not after them
 *
 * Showing the growth is not the same as waiting for it, and conflating the two
 * is what made the control feel slow. Publishing used to sit at the very end of
 * a pass, behind the grow and behind a settle that waits for both the row count
 * and the host's label to hold still — measured: expanding a Workspace had all
 * eleven of its rows on screen by ~50ms, and the button did not appear until
 * t=199ms. The rows were there and the thing you press to see more was not.
 *
 * The figure itself never needed that wait — it is `total - shown`, and both
 * halves are known from a single reading — but publishing it before the grow
 * turned out to be one step too early: `shown` is the block the pass will END
 * at, and that size can still move while the grow runs (unfolding a Workspace
 * renders rows before the app marks its selected row, so a figure published up
 * front promised seven rows and the pass delivered fourteen — measured
 * 2026-09-28 as "x 数字还会变一下"). The publish therefore fires on the first
 * LANDING of the grow, one frame or two after the press: the rows the press
 * produced are on screen, the app has marked the row if it was going to, and
 * the number that goes up is the one the pass will end on. The total is held for
 * the rest of the pass — asking `totalSessions` twice would mean asking the
 * host's label twice, and the host rewrites that label on every render — so the
 * number lands once and stays put.
 *
 * The one case that cannot publish at the first landing is a host label with no
 * integer in it — the host is already showing everything, or has not painted
 * yet. There is no honest figure to put up then, so that pass reads it the
 * settled way.
 *
 * ## What the tweak does not do
 *
 * It never hides the rows above a selected one. Opening a session — including
 * opening one found through the host's own search, or one the locate button
 * scrolled to, both of which make the host render the row first — marks that
 * row `aria-selected="true"`, and the trim then holds back only the rows BELOW
 * it: the selected session is drawn where it really sits in the Workspace, not
 * directly under the fold. A row the host asked to scroll to but the user is
 * not in is not covered; the host's reveal lifts the group's limit to "all" on
 * its own, which leaves the row rendered, and the trim is re-applied on the
 * next tick.
 *
 * The block that rule opens is the next CONFIGURED size — `initial + k × step`
 * — and it is LATCHED (see `visibleTarget` and `applyTrim`), so it survives
 * both the selection moving on and a fold/unfold cycle: a group whose ninth
 * session was selected shows fourteen rows, keeps fourteen when the user
 * clicks the second one, and comes back as fourteen after the Workspace is
 * folded and reopened, instead of snapping to a nine-row block no press could
 * have produced. The block shrinks on the 收起 press, and folding the Workspace
 * resets the PRESSES that built it while keeping the part the selection needs
 * (`SELECTION_ATTR`) — see the sweep's note for why those two halves have to be
 * treated differently.
 *
 * A SETTINGS change is not a fold. Every save re-mounts this tweak, and the
 * latches live on the host's own group elements, so the mount that follows
 * reads the width the list already had and leaves it alone: an expanded
 * Workspace stays expanded while the user tunes a count, and the new counts
 * reach the lists nobody had opened (they carry no latch, so `trimOf` falls
 * back to the configured initial count). Only switching the feature OFF forgets
 * the latches — see `resetSidebarSessionCountLayout`.
 *
 * ## Stability of the anchors
 *
 * Class fragments (`groupSection`, `sessionOverflowButton`, `list`) are
 * CSS-Modules hashes that rotate per build, so every selector matches on the
 * stable semantic fragment as a substring, the way `locate-current-session` and
 * `project-running-indicator` do. `data-row-key` is the host's own contract and
 * carries the group key, which is what the per-group state is keyed by.
 *
 * ## Nested Workspaces
 *
 * The sidebar's `workspace-tree` grouping mode renders a child Workspace's
 * `groupSection` INSIDE its parent's (`renderGroup` order: workspace row,
 * `div[role=group]{children}`, the parent's own rows, the parent's overflow
 * button). Every read and write here is therefore scoped by
 * {@link owns} — a descendant query over a parent also returns its children's
 * rows, and a trim computed from that list keeps the CHILDREN visible while
 * marking the parent's own sessions hidden, with no pass left to un-hide them
 * (trimming only ever runs for the innermost group). This is the reason
 * `sessionRows`, `hostButton`, `ownButtonNode` and `selectedRow` all filter.
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
 * The host glides rows in and out over ~200ms (`ROW_GLIDE_MS` in its
 * `AnimatedRows`) and commits them in batches, so a count read inside that
 * window describes a set that is still changing: measured 2026-09-26, a pass
 * that ran mid-animation saw thirteen rows, marked the tail for a ten-row
 * block, and the animation then finished at ten — leaving marks on rows that
 * survived. This is the host's own duration plus slack.
 *
 * A note for whoever re-derives this: the departing row is NOT the reason.
 * rc.2 animates a CLONE, stripped of `data-row-key` and parked in a sibling
 * overlay outside the list, so a departing row never matches
 * `SESSION_ROW_SELECTOR` and never counts toward a group. The wait is about the
 * arriving batch, and 300ms is empirical.
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
/** The selected session row, whose whole prefix the trim keeps visible. */
const SELECTED_ROW_SELECTOR = '[data-row-key^="session:"][aria-selected="true"]'

/**
 * The rules this tweak needs. `!important` because the host's own row rules set
 * `display`, and both of these have to win over them.
 *
 * The second rule hides the host's overflow button rather than hiding it from
 * script. Doing it in script left a window: the host inserts the button in the
 * same commit that adds the rows, and the tweak's observer only reached it two
 * microtasks later, so the host's own count — a figure recomputed on every
 * render and wrong for most of the grow — was on screen for those milliseconds.
 * A stylesheet applies as part of layout, with no such window, and the plugin's
 * own button takes over with a settled number.
 *
 * It is scoped to groups where the plugin's button is actually present, and
 * that scope is the fallback: were the plugin's own publish to fail for a group
 * (a throw, or any of the paths that decide not to show a button), an
 * unscoped rule would leave that list with no way to expand at all — for the
 * pointer, the keyboard and assistive technology alike — while the scoped one
 * simply leaves the host's own control in place. During a grow the host's
 * button is additionally hidden by an inline style, which is what covers the
 * frames before the plugin's button exists.
 */
const SESSION_COUNT_CSS = `
[${HIDDEN_ATTR}="1"] { display: none !important; }
${GROUP_SELECTOR}:has(> button[${OWN_BUTTON_ATTR}]) > ${OVERFLOW_BUTTON_SELECTOR} { display: none !important; }
`

/** Locale bound to the host's `workspace` namespace, for the button wording. */
type Translate = (key: string, params?: Record<string, string | number>) => string
let tWorkspace: Translate | undefined

/**
 * Per-group trim target, kept on the element so a React re-render cannot lose
 * it. It holds the rows the group shows, which is the value a press moves and
 * also the value a deep selection latches the block up to (see `applyTrim`).
 */
const TRIM_ATTR = 'data-cst-sid-trim'
/**
 * The block the selected session needs, in configured sizes, as last measured
 * while its row was on screen (see {@link selectionNeed}).
 *
 * This is the half of a block that survives the Workspace being folded: a fold
 * drops the trim (the list comes back at the configured count, which is what
 * folding means) but keeps this, because the host reopens a folded group at its
 * own five-row limit — the selected row is then not in the DOM, and a
 * requirement that is forgotten there can never be measured again.
 */
const SELECTION_ATTR = 'data-cst-sid-selection'
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
  /**
   * Whether a reveal eases in instead of landing in the same frame (the
   * panel's "expansion animation" switch). Off restores the instant landing
   * the tweak had before the ease existed.
   *
   * Both readings are deliberate. The ease is animated because on a machine
   * that reports `prefers-reduced-motion: reduce` — this one does — nothing
   * else animates a reveal: the host's own row fades bail out on that media
   * query, and `display: none` has no transition. Measured 2026-09-27 on the
   * locate path: the revealed block went from seven rows to twenty-one in ONE
   * frame (with the locate's scroll jumping 0 → 568px in the same frame),
   * which is what the user reported as "列表还是会闪". The HIDE direction
   * stays instant whatever this says, and that asymmetry is the point: a row
   * hidden because it is beyond the fold must never be presented at all, so
   * its mark has to land in the same microtask as the render that produced it
   * (see the mount observer), while a revealed row was on screen a moment ago
   * and easing it back is the difference between a growth the eye can follow
   * and a flash.
   */
  readonly animate: boolean
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

const INSTANCE_SEQ_KEY = '__cst_sid_instance_seq__'

/**
 * A unique identity for one mount of this tweak.
 *
 * On `globalThis`, not in module scope, for the same reason `style-node` keeps
 * its counter there: a hot-reloaded bundle is a fresh module instance, so a
 * module-level counter would hand the new instance the token the old one is
 * still using — and the button the old instance wired would look like the new
 * instance's own.
 * @returns The token to stamp on buttons this mount wires.
 */
function nextInstanceToken(): string {
  const store = globalThis as unknown as Record<string, number | undefined>
  const next = (store[INSTANCE_SEQ_KEY] ?? 0) + 1
  store[INSTANCE_SEQ_KEY] = next
  return String(next)
}

/** Attribute carrying the token of the instance that wired a button. */
const OWNER_ATTR = 'data-cst-sid-owner'

/**
 * Whether `node` belongs to THIS group rather than to a nested one.
 *
 * The sidebar nests Workspaces in its `workspace-tree` grouping mode:
 * `renderGroup` renders a child's `groupSection` INSIDE its parent's, ordered
 * `[workspace row, div[role=group]{children}, …the parent's own rows, its
 * overflow button]` — so a descendant query over a parent also returns every
 * child's rows, selected marker, overflow button and this tweak's own button.
 * Everything below is scoped through this test, because a parent's trim that
 * counted its children's rows would hide the parent's own sessions (they sort
 * after the children, so they are the ones past the target) and no pass would
 * ever un-hide them: trimming only ever runs for the innermost group.
 *
 * `closest` is the right test rather than `:scope >`, because the host does not
 * promise which wrapper holds the button (today it is a direct child of the
 * group's own `groupSection`, and the rows are too).
 */
function owns(group: Element, node: Element): boolean {
  return node.closest(GROUP_SELECTOR) === group
}

/** The host's overflow button for a group, or null when the group is not folded. */
function hostButton(group: Element): HTMLButtonElement | null {
  for (const button of group.querySelectorAll<HTMLButtonElement>(OVERFLOW_BUTTON_SELECTOR)) {
    if (owns(group, button)) return button
  }
  return null
}

/**
 * This tweak's own button inside a group, or null.
 *
 * Scoped like everything else here: a parent group also CONTAINS its children's
 * buttons, and publishing into the wrong one would leave the child without a
 * control and the parent with two.
 */
function ownButtonNode(group: Element): HTMLButtonElement | null {
  for (const button of group.querySelectorAll<HTMLButtonElement>(`button[${OWN_BUTTON_ATTR}]`)) {
    if (owns(group, button)) return button
  }
  return null
}

/** The selected session row of THIS group, or null. */
function selectedRow(group: Element): HTMLElement | null {
  for (const row of group.querySelectorAll<HTMLElement>(SELECTED_ROW_SELECTOR)) {
    if (owns(group, row)) return row
  }
  return null
}

/** Session rows currently rendered for a group, in document order. */
function sessionRows(group: Element): HTMLElement[] {
  return [...group.querySelectorAll<HTMLElement>(SESSION_ROW_SELECTOR)].filter(row => owns(group, row))
}

/** Current trim target for a group, defaulting to the configured initial count. */
function trimOf(group: Element, config: SidebarSessionCountConfig): number {
  const raw = Number(group.getAttribute(TRIM_ATTR))
  return Number.isFinite(raw) && raw > 0 ? raw : config.initialCount
}

/**
 * Whether the host still has a pressable "show more" for this group.
 *
 * The two states that cannot grow are: no overflow button (the host renders none
 * once its own five-row fold hides nothing — including when it is expanded to
 * everything, where the button that IS present reads "收起" instead), and a
 * button that is `aria-expanded="true"` (the host derives that flag from its own
 * LIMIT, so a press there would fold the list back to five rather than extend
 * it). Both leave the rendered count fixed, so a group in either state must not
 * be queued for growing.
 */
function canGrow(group: Element): boolean {
  const button = hostButton(group)
  if (button === null) return false
  return button.getAttribute('aria-expanded') !== 'true'
}

/** Rows the trim is currently hiding, i.e. what a "show more" press reveals.
 *
 * Read off the markers rather than recomputed from the target: the marks are
 * what the user sees, and what the settle's fingerprint compares. */
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
 * Whether the Workspace's session total is readable right now.
 *
 * Two states qualify, and they are complements: the host's button carries an
 * "N more sessions" figure (the count of sessions above its own limit), or the
 * host reports that it is showing everything — in which case the total is
 * simply what it has rendered. Only the third state has nothing to say: a label
 * that has not painted yet, where a figure published would be a guess.
 *
 * The second state needs its own evidence, because the host's flag is derived
 * from its LIMIT while the rows it has committed can lag behind it (see
 * `growTo`): a cached total that covers the rendered rows is what separates
 * "everything really is on screen" from "the flag is ahead of the DOM". Without
 * that, the honest reading is unknown — and unknown means the caller publishes
 * nothing early rather than a figure the next render would contradict.
 */
function totalIsKnowable(group: Element): boolean {
  if (hostNotRendered(group) > 0) return true
  const button = hostButton(group)
  // No button at all: the host's own fold hides nothing, so what is rendered IS
  // the total — the same reading `totalSessions` makes for this state.
  if (button === null) return sessionRows(group).length > 0
  if (button.getAttribute('aria-expanded') !== 'true') return false
  const cached = Number(group.getAttribute(TOTAL_ATTR))
  return Number.isFinite(cached) && cached > 0 && cached >= sessionRows(group).length
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
 *
 * The cache is only trustworthy while the Workspace cannot have SHRUNK past it.
 * A Workspace whose sessions were archived or deleted goes from "N more" to no
 * button at all, and the host's button is rendered exactly while its own fold
 * still hides something — so its absence is proof that every session it has is
 * on screen. Trusting the old, larger cache there published a remainder that did
 * not exist and turned the button into one that only re-wrote the same number
 * (measured shape: nine sessions, configured seven, six archived → the button
 * kept reading "展开其余 6 个会话" over a three-row list). The cache is therefore
 * dropped whenever the host reports it is showing everything it has.
 */
function totalSessions(group: Element): number | null {
  const notRendered = hostNotRendered(group)
  const rendered = sessionRows(group).length
  if (notRendered > 0) {
    const total = notRendered + rendered
    setAttr(group, TOTAL_ATTR, String(total))
    return total
  }
  // No host button: the host's own fold is hiding nothing, so `rendered` IS the
  // total. Any cache from when the Workspace was larger is stale by definition.
  if (hostButton(group) === null) {
    clearAttr(group, TOTAL_ATTR)
    return rendered > 0 ? rendered : null
  }
  // A button with no integer in its label is the host's "everything is shown"
  // state. Its flag is derived from the host's LIMIT while the rows it has
  // committed can lag behind (see `growTo`), so the cache is what tells "really
  // everything" apart from "the flag is ahead of the DOM" — and it may only be
  // used while it still covers what is rendered.
  const cached = Number(group.getAttribute(TOTAL_ATTR))
  if (Number.isFinite(cached) && cached >= rendered && cached > 0) return cached
  return rendered > 0 ? rendered : null
}

/**
 * Both halves of the published figure, from one reading of the total.
 *
 * `pending` is "everything the Workspace holds, minus what is on screen", so it
 * covers the two places the remainder can sit — above the host's own limit, and
 * below it behind this tweak's trim. Reading only the trim reported a list with
 * seven unrendered sessions as complete; reading only the host's label ignored
 * the rows this tweak is hiding, and left the figure unable to be produced at
 * all until the host re-rendered.
 *
 * `total` comes out with it because the caller needs to know whether the
 * rendered rows add up to it: `shown` is a promise about the block a pass is
 * heading for, which during a grow can exceed what the host has handed over
 * yet, and that is exactly the state in which `pending` reads 0 without the
 * list being complete. Asking twice would also mean reading the host's label
 * twice, and the host rewrites that label on every render.
 * @param group - The group being measured.
 * @param shown - Rows the caller has on screen (or is heading for).
 * @param knownTotal - Total held for this pass, or undefined to read it live.
 * @returns The Workspace's session total (`null` while unknown) and the
 *   remainder a press would reveal.
 */
function remainder(
  group: Element,
  shown: number,
  knownTotal?: number | null,
): { readonly total: number | null; readonly pending: number } {
  const total = knownTotal === undefined ? totalSessions(group) : knownTotal
  if (total === null) return { total: null, pending: remainingRows(group) }
  return { total, pending: Math.max(0, total - shown) }
}

/**
 * Whether pressing the button would reveal anything. A Workspace can be over
 * the host's limit with nothing held by the trim, and a press is still
 * meaningful there because it raises the trim and the grow then follows — so
 * this asks the two places separately rather than only about hidden rows.
 *
 * The published FIGURE is included as a third place, and that is the point: the
 * button shows whenever the remainder is above zero, so a press must not be
 * allowed to mean "fold back" in a state the button just described as "N more
 * sessions". The two readings part exactly where the host's flag runs ahead of
 * the rows it has committed (see `growTo`): the label there still counts
 * sessions that are not on screen, so growing is the honest answer and the
 * count drops to zero on its own once the rows land. `shown` is what the caller
 * has on screen — the same value it publishes — so both halves read one number,
 * through the same {@link remainder} the figure comes from.
 * @param group - The group whose button is being pressed.
 * @param shown - Session rows the caller currently has on screen.
 * @returns Whether the press should extend the list rather than fold it.
 */
function hasMore(group: Element, shown: number): boolean {
  if (hostNotRendered(group) > 0 || remainingRows(group) > 0) return true
  return remainder(group, shown).pending > 0
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
 * included for the same reason: the visible block is measured up to it.
 */
function stateSignature(group: Element): string {
  const rows = sessionRows(group)
  const own = ownButtonNode(group)
  const host = hostButton(group)
  const selected = selectedRow(group)
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
    group.getAttribute(SELECTION_ATTR) ?? '',
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
 * The block a group keeps on screen: the trim, raised so that every row
 * rendered ABOVE the selected one stays visible.
 *
 * The trim never leaves a hole above the selected row. That is a rule about
 * the row's POSITION, not about sparing the session the user is in: keeping
 * only the selected row visible while hiding the rows between it and the trim
 * draws it directly under row `trim`, so a session that is 12th in its
 * Workspace is painted as the 8th row of a seven-row fold — and it slides back
 * to 12th the moment a press fills the gap in. Both locating paths hit that,
 * because both work by making the host render the row and then leave the
 * layout to this trim: the host's own reveal (a Session opened from search,
 * whose limit lifts to "all") and the locate button (which presses the
 * overflow until the row exists). Measured 2026-09-27 with the target below
 * the selected row: hidden marks on [1, 3..9] of ten rows, `shown` published
 * as 2, and the selected row drawn second while it was the third.
 *
 * The raise lands on the next CONFIGURED size (see {@link nextConfiguredSize}):
 * the block a press produces is always `initial + k × step`, so a selection
 * that needs more takes the next one in the series. Users read the list through
 * that series — with 7/7, being in the ninth session means one press has been
 * spent, and the list should show 14 rows (the fifteenth, 21) rather than a
 * nine-row block no press could produce and no fold restored. That was the
 * reported symptom: select the ninth session, fold the Workspace, unfold it,
 * and a nine-row list came back with a figure that matched no press count.
 *
 * The raise comes from the selected row, and {@link selectionNeed} is what
 * remembers it when that row is not on screen — the part of the block that
 * survives a fold, as opposed to the part a press added.
 *
 * Only the RENDERED index is used, never the session's index in the Workspace:
 * the host folds rows out on its own account (running rows bypass its fold),
 * and the rendered list is the one the user reads positions off.
 *
 * `remember` is for {@link applyTrim} alone: it writes the measurement down so
 * the requirement survives the row leaving the DOM. The read-only callers
 * (`clicker`, `growTo`'s live re-read) consult the same number without writing.
 */
function visibleTarget(
  group: Element,
  rows: readonly HTMLElement[],
  trim: number,
  config: SidebarSessionCountConfig,
  remember = false,
): number {
  return Math.max(trim, selectionNeed(group, rows, config, remember))
}

/**
 * The block the selected session needs, in configured sizes — `0` when the
 * group has no selection to cover.
 *
 * With the row on screen it is measured off the row and (when `remember`)
 * written to the group. Without it — the host has not rendered the row, which
 * is what unfolding a Workspace produces, since the host reopens a folded group
 * at its own five-row limit — the last measurement stands. That remembered
 * value is the whole reason a fold does not lose the size: measured
 * 2026-09-28, the fifteenth session selected (its row held open by a
 * twenty-one-row block), fold and reopen, and the list could only rebuild from
 * the configured count because the row was not in the DOM to measure.
 *
 * A selection that moved to another Workspace looks exactly the same from here
 * as a row that is not rendered, so the remembered value is never cleared on
 * that account: it is corrected the next time a selection IS seen in the group,
 * and it only ever holds the block a press could have produced anyway.
 *
 * ## What the stickiness costs, and why it stays
 *
 * The consequence is visible and intended: select the fifteenth session in
 * Workspace A, switch to a session in B, and A's block is still twenty-one —
 * `applyTrim` latched A's `TRIM_ATTR` to it and this is what keeps supplying
 * it. Folding A and reopening brings it back at twenty-one as well, because a
 * fold resets only the press-derived half. So the list is as wide as the user
 * last had it, never narrower — the same promise the latched trim makes, and
 * the same one the README states.
 *
 * What it cannot do is demand rows the Workspace does not have. A remembered
 * block past the real total leaves `applyTrim`'s target above the last row, so
 * the mark loop never runs out, every row is shown and nothing is hidden. Nor
 * does the button's figure inherit it: `remainder` is `total − shown` with
 * `total` read from the host, so the number on the button stays the honest one
 * even when the target behind it is not.
 */
function selectionNeed(
  group: Element,
  rows: readonly HTMLElement[],
  config: SidebarSessionCountConfig,
  remember: boolean,
): number {
  const selected = selectedRow(group)
  const index = selected === null ? -1 : rows.findIndex(row => row === selected || row.contains(selected))
  if (index >= 0) {
    const need = nextConfiguredSize(index + 1, config)
    if (remember) setAttr(group, SELECTION_ATTR, String(need))
    return need
  }
  const remembered = Number(group.getAttribute(SELECTION_ATTR))
  return Number.isFinite(remembered) && remembered > 0 ? remembered : 0
}

/**
 * Round a row count up to the next size a press can produce: `initial + k ×
 * step`, or the configured count itself when the count already covers it.
 *
 * The series is what the button walks (`clicker` adds exactly one step), so
 * keeping every block on it means a size on screen can always be reached,
 * described and restored by counting presses.
 *
 * The contract, in the exact form it should be asserted in: for 7/7 the
 * result is 7 for rows 1–7, 14 for rows 8–14 and 21 for rows 15–21; for 5/5
 * it is 5 for rows 1–5 and 10 for rows 6–10. Two properties hold for every
 * input — the result is never below the base, and it is always the base plus a
 * whole number of strides, so no row count can produce a size the button
 * could not have reached. The guards are for a hand-edited store: the schema
 * floors both numbers, but a `0` here would otherwise divide by zero and hand
 * the caller a NaN target.
 */
function nextConfiguredSize(rows: number, config: SidebarSessionCountConfig): number {
  const base = Math.max(1, config.initialCount)
  if (rows <= base) return base
  const stride = Math.max(1, config.expandStep)
  return base + Math.ceil((rows - base) / stride) * stride
}

/**
 * How long a revealed row takes to ease back onto the screen — this tweak's
 * only animation, and the one the panel's "expansion animation" switch gates
 * (see {@link SidebarSessionCountConfig.animate}).
 */
const REVEAL_EASE_MS = 160

/**
 * Ease a batch of just-revealed rows back onto the screen.
 *
 * `height` rides along with `opacity` so the list GROWS into its new shape
 * rather than snapping to it: the rows below the reveal slide down over the
 * same 160ms instead of jumping. No `fill`, so the animation leaves the row at
 * its natural height — which is exactly where the keyframes end, since the
 * height was measured with the row laid out. Heights are read in one pass
 * before any animation starts (one forced layout for the batch, not one per
 * row).
 */
function easeRowsIn(rows: readonly HTMLElement[]): void {
  const heights = rows.map(row => row.offsetHeight)
  rows.forEach((row, index) => {
    const height = heights[index] ?? 0
    if (height === 0) return
    row.animate(
      [{ opacity: 0, height: '0px' }, { opacity: 1, height: `${String(height)}px` }],
      { duration: REVEAL_EASE_MS, easing: 'ease-out' },
    )
  })
}

/**
 * Apply the trim to one group: mark every row past the target, unmark every
 * row within it. Returns the number of rows left on screen.
 *
 * A target ABOVE the stored trim is written back as the group's trim, and that
 * latch is the fix for the second thing users reported about the selection
 * rule. The block a deep selection forces open used to be recomputed on every
 * pass, so it lasted only as long as that row stayed selected: locate to the
 * ninth session and nine rows show; click the second session and the block
 * snaps back to the configured seven — "后面会收起来", rows the user was just
 * looking at disappearing because they switched sessions. A raise now becomes
 * the group's size, so the block only ever shrinks on the 收起 press (whose
 * count the next raise may in turn exceed). Folding the Workspace keeps it
 * too — see the sweep's note on why the host's reopen makes forgetting it
 * unrecoverable.
 *
 * Persisting is also what makes the rule self-consistent: `trimOf` reads this
 * attribute back, `clicker` grows from it, and the published remainder is
 * `total - shown`, so a latched raise is one number everywhere instead of a
 * derived value that three callers each compute their own way. The write is
 * change-guarded like every other one here, and `TRIM_ATTR` is deliberately
 * absent from the observer's `attributeFilter` — the latch cannot feed itself.
 *
 * The raise itself is {@link visibleTarget}'s — the next configured size above
 * the selected row — and the latch is measured against the value STORED on the
 * group, not against the argument: a pass that computed the raise for its own
 * use (to know how far to grow) must not thereby skip recording it.
 *
 * Safe to run on every mutation batch and every settle frame: both directions
 * are change-guarded, so against a settled tree the call is a no-op. The
 * unmark direction is what clears a previous trim's stale marks (see
 * {@link awaitStableRows}), which is why the unconditional callers matter.
 */
function applyTrim(group: Element, trim: number, config: SidebarSessionCountConfig): number {
  const rows = sessionRows(group)
  const target = visibleTarget(group, rows, trim, config, true)
  if (target > trimOf(group, config)) setAttr(group, TRIM_ATTR, String(target))
  const revealed: HTMLElement[] = []
  let shown = 0
  for (const row of rows) {
    if (shown < target) {
      // Unmarking a marked row is a reveal — the user was looking at a fold a
      // moment ago — so the batch is eased in below, unless the animation
      // switch is off.
      if (row.hasAttribute(HIDDEN_ATTR)) {
        clearAttr(row, HIDDEN_ATTR)
        revealed.push(row)
      }
      shown += 1
    } else {
      setAttr(row, HIDDEN_ATTR, '1')
    }
  }
  if (config.animate && revealed.length > 0) easeRowsIn(revealed)
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
 * The label: {@link hostNotRendered} takes "sessions above the host's limit"
 * from the host button's own text, and React rewrites that text as part of the
 * same render that adds the rows. Waiting on the count alone is therefore not
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
  config: SidebarSessionCountConfig,
  frames = 5,
  max = 90,
): Promise<number> {
  const t0 = performance.now()
  let count = sessionRows(group).length
  let label = hostLabel(group)
  let stable = 0
  for (let frame = 0; frame < max && performance.now() - t0 < SETTLE_BUDGET_MS; frame += 1) {
    await nextFrame()
    applyTrim(group, trim, config)
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
 * Press the host's button until the group renders the block it is supposed to
 * show — `needed` as a floor, re-read live on every press.
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
 * The requirement is re-read every iteration rather than taken once, because
 * the block can GROW while this loop runs: a page load starts the first pass
 * before the app has marked its selected row, so the trim read at the top is
 * often a step smaller than the one the selection is about to latch (measured
 * 2026-09-28: the pass grew to the seven rows the trim then asked for, the
 * selection appeared mid-grow, and the list was left four rows short of the
 * fourteen its own trim demanded with nothing left to trigger another pass).
 * `needed` stays as a floor so a caller's own target is never undercut.
 *
 * Marking the rows this grow produces happens elsewhere: every mutation of a
 * group is trimmed by the mount's own observer, in the microtask it arrives in
 * (see `setupSidebarSessionCount`). This loop only presses and waits.
 *
 * ## Why `onLand` fires on every landing, not the first
 *
 * The callback is the early publish, and its gate — whether the Workspace's
 * total is knowable yet — can be false on the first press: the host rewrites
 * its "N more" label in the same commit that hands the rows over, so a read
 * taken the frame after the rows land can still be looking at the previous
 * press's label. Arming it behind a local `landedOnce` flag forfeited the
 * publish for the rest of that grow, and the button then waited out the
 * closing settle — reintroducing exactly the "control lags the list" timing
 * this early publish exists to avoid. The callback carries its own `published`
 * latch, so calling it on each landing costs one attribute read and stops.
 *
 * `alive` is checked before every press and before `onLand`: this loop can be
 * mid-wait when a settings save disposes the mount (`index.tsx` re-mounts every
 * tweak), and a loop that kept going would press the host's button for a feature
 * the user just switched off and publish a button whose listener belongs to the
 * disposed instance.
 */
async function growTo(
  group: Element,
  needed: number,
  config: SidebarSessionCountConfig,
  onLand: () => void,
  alive: () => boolean,
  budgetMs = 4000,
): Promise<void> {
  const deadline = performance.now() + budgetMs
  for (;;) {
    if (performance.now() >= deadline || !alive()) return
    const target = Math.max(needed, visibleTarget(group, sessionRows(group), trimOf(group, config), config))
    const count = sessionRows(group).length
    if (count >= target) return
    const button = hostButton(group)
    // No button left means the host is rendering every row it has.
    if (button === null) return
    if (button.getAttribute('aria-expanded') === 'true') {
      await awaitStableRows(group, target, config)
      return
    }
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
      if (sessionRows(group).length > count) {
        landed = true
        break
      }
    }
    // The press produced nothing (host ignored it, or the render never
    // landed). Stop rather than spin on the same button. A short grow is
    // self-healing: `syncGroup` trims to what rendered, and the next sweep
    // re-enters `growTo` for the remainder — which is why the sweep refuses to
    // record a short block as settled (see its own note).
    if (!landed) return
    if (!alive()) return
    onLand()
  }
}

/**
 * Wording for the plugin's own overflow button.
 *
 * Both halves come from the host's `workspace` locale namespace, so the
 * wording and its locale follow the host's own catalogue. The count is the
 * honest one from {@link remainder} — the same figure the press is about —
 * so the label cannot promise one thing and deliver another, which is what
 * happened when the host's own number was reused with a different step size.
 */
function buttonText(pending: number): string {
  const collapse = tWorkspace?.('sessions.collapse') ?? '收起'
  if (pending <= 0) return collapse
  const n = pending
  return tWorkspace?.('sessions.expand', { n }) ?? `展开其余 ${n} 个会话`
}

/**
 * Create the plugin's own overflow button inside a group.
 *
 * The button carries the token of the instance that WIRED it, and only that
 * instance may reuse it. A boolean "already wired" marker was the reason a
 * disposed instance's button could come back to life: a pass that outlives its
 * mount can still publish one (see `publishOnce`), the successor instance found
 * the marker set — the state-node rule is "already wired, so do not wire" — and
 * the button stayed bound to a `clicker` that returns immediately. An unknown
 * token therefore means "replace the node", not "adopt it": the old listener
 * cannot be removed, and re-adding one per remount would pile up dead handlers.
 * @param group - The group the button belongs to.
 * @param token - This instance's identity, stamped on the node it wired.
 * @param onClick - The press handler of the LIVE instance.
 * @returns The button to publish into.
 */
function ownButton(group: Element, token: string, onClick: () => void): HTMLButtonElement {
  const existing = ownButtonNode(group)
  if (existing !== null) {
    if (existing.getAttribute(OWNER_ATTR) === token) return existing
    existing.remove()
  }
  const host = hostButton(group)
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute(OWN_BUTTON_ATTR, '1')
  // Reuse the host's own class so the button keeps the shipped look; the
  // fragment is stable across builds the same way every other anchor is.
  if (host !== null) button.className = host.className
  button.addEventListener('click', onClick)
  button.setAttribute(OWNER_ATTR, token)
  if (host !== null) host.parentElement?.insertBefore(button, host.nextSibling)
  else group.appendChild(button)
  return button
}

/**
 * Show the plugin's button for a group, or take it down when it has nothing to
 * do. `knownTotal` pins the total so two publishes within one pass cannot
 * disagree; see the `lockedTotal` note in {@link syncGroup}.
 * @param group - The group being published.
 * @param config - This mount's counts, for the "nothing left to fold" test.
 * @param token - This instance's identity (see {@link ownButton}).
 * @param onPress - The live instance's press handler.
 * @param shown - Rows this pass actually left on screen.
 * @param knownTotal - Total held for this pass, or undefined to read it live.
 */
function publish(
  group: Element,
  config: SidebarSessionCountConfig,
  token: string,
  onPress: (group: Element) => void,
  shown: number,
  knownTotal?: number | null,
): void {
  const { total, pending } = remainder(group, shown, knownTotal)
  const rows = sessionRows(group).length
  // A group the user pressed at least once keeps its fold control even with
  // nothing left to reveal — that is the only way back to the configured block.
  // Unless the list has nothing left to fold at all: nothing to reveal, no more
  // rows than the configured block, and every rendered row already accounted
  // for. The last clause is what keeps this off the grow path — the early
  // publish passes the block the grow is heading for, so `pending` can read 0
  // while the host is still handing rows over, and clearing the mark there would
  // take the 收起 away from a list the user just expanded.
  if (pending <= 0 && rows <= config.initialCount && (total === null || rows >= total)) clearAttr(group, TOUCHED_ATTR)
  const showButton = pending > 0 || group.hasAttribute(TOUCHED_ATTR)
  const existing = ownButtonNode(group)
  if (!showButton) {
    // A button this instance mounted earlier (the Workspace had more sessions
    // a moment ago, or the count was raised) has to be taken down, not just
    // skipped — otherwise it keeps its old "收起" over a complete list. Only
    // this instance's own: a successor may already own a live button here.
    if (existing !== null && existing.getAttribute(OWNER_ATTR) === token) setStyle(existing, 'display', 'none')
    return
  }
  const button = ownButton(group, token, () => { onPress(group) })
  setStyle(button, 'display', '')
  const label = buttonText(pending)
  if (button.textContent !== label) button.textContent = label
  setAttr(button, 'aria-expanded', pending > 0 ? 'false' : 'true')
}

/**
 * One group's pass: grow the host far enough, trim to the group's target and
 * publish the button wording.
 *
 * `alive` is the mount's liveness probe. A pass can outlive its own instance —
 * a settings change disposes and re-mounts every tweak while a grow is still
 * awaiting frames — and its writes are exactly what a disposed instance must
 * not make: the marker writes would re-hide rows the cleanup had just
 * released, and `publish` would re-create a button whose listener belongs to
 * the dead instance. Checked before the first write, on every landing inside
 * `growTo`, and again after the waits, because the waits are where the disposal
 * lands. `token` is the same instance's identity, which keeps `publish` from
 * adopting or hiding a button a successor instance owns (see {@link ownButton}).
 *
 * Marking the rows a pass produces is not this function's job and not its
 * caller's: every mutation of a group is trimmed by the mount's own observer,
 * in the microtask it arrives in (see `setupSidebarSessionCount`). A guard
 * scoped to the pass looked equivalent and was not — the pass's two halves are
 * separated by the glide settle, and a host render landing in that wait sat
 * unmarked for as long as it took the closing pass to run.
 */
async function syncGroup(
  group: Element,
  config: SidebarSessionCountConfig,
  onPress: (group: Element) => void,
  alive: () => boolean,
  token: string,
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
  const rows = sessionRows(group)
  const rowsNow = rows.length
  const knownTotal = totalSessions(group)
  /**
   * The block this pass is about to show: the stored trim, raised for the
   * selection to the next configured size (see {@link visibleTarget}).
   *
   * Computed ONCE, before the grow, because three things have to agree on it —
   * how far the host is grown, the figure the early publish promises, and the
   * trim the tail applies. Computed twice, a pass could grow to one number and
   * publish another, which is the number-changing bug in yet another costume.
   */
  const target = visibleTarget(group, rows, trimBefore, config)
  const needsGrow = rowsNow < target && (knownTotal === null || rowsNow < knownTotal)
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
    // Publish as soon as the block's SIZE is real — after the first press's
    // render has landed, not before the grow starts.
    //
    // The figure is `total - shown` and it costs nothing to compute, which is
    // why an earlier revision published it up front: waiting for the grow made
    // the button itself the last thing to arrive (measured: expanding a
    // Workspace put all eleven of its rows on screen by ~50ms, and the button
    // did not appear until t=199ms, which read as the control lagging the
    // list). But `shown` is the block this pass will end at, and that size can
    // still move while the grow runs: unfolding a Workspace renders rows before
    // the app has marked its selected row, so a figure published at the top
    // promised the seven-row block and the pass delivered fourteen — measured
    // 2026-09-28 as the user's "x 数字还会变一下", `展开其余 25 个会话` on the
    // way in and `18` on the way out. One press later the render has landed,
    // the app has marked the row if it was going to, and the target read then
    // is the one the pass will actually reach. The delay is a frame or two.
    //
    // Skipped while the total is unknown: a label that has not painted yet
    // says nothing about how many sessions the Workspace holds, and a figure
    // published from a guess would only be corrected later — the very thing
    // this early publish exists to avoid. A host that reports it is showing
    // everything does NOT fall in that bucket (its total is simply what it has
    // rendered), which matters for the press that finishes a list: measured
    // 2026-09-28, `展开其余 4 个会话` on the last four rows, one press showing
    // all thirty-two, and the button kept reading four until the pass settled —
    // the user's "剩最后几条展开时 x 数字还会变一下". With the gate relaxed it
    // flips to the host's 收起 with the rows.
    let published = false
    const publishOnce = (): void => {
      // The landing that calls this can arrive after a settings save disposed
      // the mount (see `growTo`): publishing then would wire a button for a dead
      // instance and hide the live one behind it.
      if (published || !alive() || !totalIsKnowable(group)) return
      published = true
      // `knownTotal` is used, not a second `totalSessions` call: the total does
      // not move when the host hands rows over — only the split between
      // rendered and unrendered does — so the value read before the grow is
      // still the honest one, and the figure comes from a single reading.
      lockedTotal = knownTotal
      // The block, NOT the rows on screen: this figure is a promise about what
      // the press is about to reach, which is the only useful thing to say
      // while the grow is still running. The closing `publish` passes the rows
      // actually shown instead, and the two agree whenever the grow lands —
      // they can differ only when it fell short, which is the one case where a
      // figure moving is the honest report that the grow did.
      const settledTarget = visibleTarget(group, sessionRows(group), trimOf(group, config), config)
      publish(group, config, token, onPress, settledTarget, lockedTotal)
    }
    await growTo(group, target, config, publishOnce, alive)
    // `growTo` stops the moment the row count reaches the target, and the rows
    // land in the same React commit that rewrites the host button's label — so
    // it can return with the label still reading the previous press. Publishing
    // a figure computed from that stale input is what made the button's number
    // change under the user (21, then 16 a third of a second later): this
    // second settle is the one that actually covers the label. With the total
    // held, the row count is all that is left to settle.
    await awaitStableRows(group, target, config)
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
  //
  // `trimBefore` (the stored value) is passed, not `target`: `applyTrim`
  // recomputes the same raise and records it, so the two agree on the block
  // while the latch stays measured against what the group had stored.
  const visible = applyTrim(group, trimBefore, config)
  // The host's button was already taken off screen above, before the grow; it
  // stays in the DOM because the host still owns the "show all" state, and its
  // label is not ours to read once growth is under way.
  const host = hostButton(group)
  if (host !== null) setStyle(host, 'display', 'none')
  // The rows actually SHOWN, where the early publish used the block it was
  // heading for — see `publishOnce` for why those two are not the same value
  // and when they part.
  publish(group, config, token, onPress, visible, lockedTotal)
}

/**
 * Mount the tweak. Returns a disposer that removes the plugin's buttons and the
 * row markers, restoring the host's own control — but NOT the per-group
 * latches, which are what a remount (every settings change) reads to put the
 * lists back the way they were. See `cleanup` and
 * {@link resetSidebarSessionCountLayout}.
 */
export function setupSidebarSessionCount(
  ctx: ClientContext,
  config: SidebarSessionCountConfig,
): () => void {
  try {
    const locale = (ctx as unknown as { locale?: { bind(ns: string): Translate } }).locale
    if (locale !== undefined && typeof locale.bind === 'function') {
      tWorkspace = locale.bind('workspace')
    } else {
      // Never keep a previous instance's binding: a stale `t` is a translation
      // function of a context this mount does not own.
      tWorkspace = undefined
    }
  } catch {
    tWorkspace = undefined
  }

  const removeStyles = injectStyles()
  let disposed = false
  /** Whether this mount is still live; every write path consults it. */
  const isAlive = (): boolean => !disposed
  /**
   * This mount's identity, stamped on every button it wires (see
   * {@link ownButton}). Unique per mount and per bundle instance, so a button
   * left by a pass that outlived its mount is replaced rather than adopted.
   */
  const token = nextInstanceToken()

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
   * Consecutive passes that ended with a group's block still short of what it
   * should show, per group — the bound on {@link recordSettled}'s retry.
   */
  const shortPasses = new WeakMap<Element, number>()
  /**
   * How many short passes in a row are retried before the block is accepted as
   * final. Five covers the ordinary case (a host that hands rows over one press
   * at a time behind a slow render) without letting a host that never yields
   * make every later mutation pay for another pass.
   */
  const SHORT_PASS_LIMIT = 5

  /**
   * Whether a group still has rows to gain: it renders fewer than the block it
   * is supposed to show, and the host still has rows to hand over.
   *
   * The block, not the trim: `visibleTarget` includes the requirement the
   * selected row carries, and a pass that left the block short of THAT is just
   * as stuck as one that left it short of the trim — the load-time case below
   * was exactly this shape.
   *
   * `canGrow` is what keeps the retry honest: with the host's button gone, or
   * flagged as showing everything, there is nothing left to press, so a short
   * block is final and recording it is correct.
   */
  const blockIsShort = (group: Element): boolean => {
    const rows = sessionRows(group)
    return rows.length < visibleTarget(group, rows, trimOf(group, config), config) && canGrow(group)
  }

  /**
   * What a finished pass left behind — and with it, whether a sweep may be
   * re-armed for this group.
   *
   * - `settled`: the fingerprint is recorded; the group is at rest.
   * - `short`: the block is still short of what it should show and the retry
   *   budget has room. Re-arm — this is the retry the mechanism exists for, and
   *   it is what keeps a short block from freezing: leaving it unrecorded is
   *   only half a fix, because a sweep nobody re-arms never comes back on its
   *   own. The re-arm is BOUNDED by {@link SHORT_PASS_LIMIT}, so a host that
   *   accepts presses without ever yielding rows costs a fixed number of
   *   passes rather than one per mutation, forever.
   * - `failed`: the pass threw, the mount is gone, or the group detached.
   *   Never re-armed. A throwing pass re-invoked from its own re-arm would loop
   *   without end, and the other two have no list left to fix.
   */
  type SettleOutcome = 'settled' | 'short' | 'failed'

  /**
   * Record a finished pass as the group's settled state — unless the block is
   * still short, in which case the fingerprint is left unrecorded so the next
   * sweep retries the grow.
   *
   * Recording a short block froze the list: nothing about the group would
   * change afterwards, the fingerprint would keep matching, and every later
   * sweep would skip it — so a grow that ended a step short left the list at
   * whatever the host had rendered for as long as the sidebar stayed quiet.
   * Measured 2026-09-28 on a page load: the mount pass grew to the seven rows
   * the trim asked for at the time, the app marked its selected row mid-grow
   * (latching the trim to fourteen), and the pass recorded that ten-row state
   * as settled — ten rows on screen against a fourteen-row target, with no
   * sweep ever coming back to it.
   *
   * The retry is bounded by {@link SHORT_PASS_LIMIT}: a host that keeps
   * accepting presses without yielding rows (or one whose flag says "everything
   * shown" while it lags) must not make every mutation pay for another pass.
   * After the limit the short block is recorded like any other — it self-heals
   * on the next real change to the group, and a press recomputes from the
   * on-screen count anyway.
   * @returns What the pass left, for the caller's re-arm decision.
   */
  const recordSettled = (group: Element, ok: boolean): SettleOutcome => {
    if (!ok || disposed || !group.isConnected) return 'failed'
    if (blockIsShort(group)) {
      const attempts = (shortPasses.get(group) ?? 0) + 1
      if (attempts <= SHORT_PASS_LIMIT) {
        shortPasses.set(group, attempts)
        return 'short'
      }
    }
    shortPasses.delete(group)
    settled.set(group, stateSignature(group))
    return 'settled'
  }

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
   * releases `busy`. Dropped when the group folded away during the wait: the
   * queued value was computed from a list that no longer exists — folding
   * resets the block, and a press that outlived it would write the OLD size
   * back over the fresh one (measured 2026-09-28: a press queued behind a pass
   * re-applied a thirty-five-row trim minutes later, after the fold had already
   * come back down to the configured count). Raising the trim of a detached
   * subtree would likewise only re-mark nodes the sweep is about to clean.
   */
  const servePendingPress = (group: Element): void => {
    if (disposed) return
    const next = pendingPress.get(group)
    if (next === undefined) return
    pendingPress.delete(group)
    if (!group.isConnected || sessionRows(group).length === 0) return
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
        await syncGroup(group, config, clicker, isAlive, token)
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
        // animation is OVER, not merely that the row count stopped moving. The
        // host commits the rows a press uncovers in batches over its ~200ms
        // glide, so a pass that runs during one trims a set that is about to
        // change: it saw thirteen rows, marked the tail, and when the glide
        // finished at ten, three marked rows had survived. A count-stability
        // test passes mid-glide precisely because the count really is stable
        // there, so the wait has to clear the host's own transition duration
        // before the second pass reads. (The departing row is not the reason —
        // rc.2 animates a clone without `data-row-key`, parked outside the
        // list, which never matches a session row; see `GLIDE_SETTLE_MS`.)
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
        if (!group.isConnected || sessionRows(group).length === 0) return
        await syncGroup(group, config, clicker, isAlive, token)
        // Record what this pass settled, so the next sweep can tell an idle
        // group from one that needs work (see `stateSignature`) — unless the
        // block is still short of its target, which this path can produce just
        // as the sweep's growing branch can (a press that ran out of budget
        // mid-grow). Both recording sites share one rule; see `recordSettled`.
        //
        // This path is the one that can leave a short block WITHOUT any grow of
        // its own — it is chosen for groups that render enough rows already, and
        // `blockIsShort` measures the selection's block, which can sit above
        // that count — so it is also the one that has to re-arm on `short`. A
        // group that went quiet here would keep a fold short of its selection
        // until the next unrelated mutation, which on a sidebar that has just
        // gone still is not coming. Only `short` re-arms: a settled pass needs
        // no sweep, and the `failed` case is handled by the catch above.
        if (recordSettled(group, true) === 'short') schedule()
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
    // Grows from the block this group is LIVING at, not from a bare `trimOf`:
    // `visibleTarget` re-measures the selected row on every call, so a press
    // landing between a raise and its latch still steps from the raised block
    // rather than from the lower stored value. Calling that "what is on screen"
    // would be wrong — neither operand counts rendered rows, the block is a
    // target — but the intent stands: a press measured against a size the list
    // has already outgrown would find nothing to grow, and "show more" would
    // look dead for that one click.
    const rows = sessionRows(group)
    const current = visibleTarget(group, rows, trimOf(group, config), config)
    // Two states, decided by whether a press would reveal anything: more raises
    // the trim by a step and the grow in `syncGroup` follows it, and none folds
    // back to the initial count. That is what keeps the button from being a
    // one-way ratchet — and `hasMore` reads the same `shown` value `publish`
    // counted with, so a press can never fold a list the button just described
    // as having sessions left.
    //
    // The trim is deliberately NOT capped at the rendered row count. That
    // count is what the host has been asked for so far, not how many sessions
    // the Workspace has, so capping at it pins the trim to the current batch
    // and every press after the first reveals a single row. `syncGroup` grows
    // the host to meet the trim, and stops on its own once the host runs out
    // of button.
    const next = hasMore(group, Math.min(rows.length, current)) ? current + config.expandStep : config.initialCount
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
      if (sessionRows(group).length > 0) {
        if (!busy.has(group)) open.push(group)
        continue
      }
      // A folded Workspace renders neither rows nor the host's own overflow
      // button, so React unmounts those — but the plugin's button is a DOM
      // patch sitting beside them, and React only removes the nodes it owns.
      // Skipping the group (as an earlier revision did) therefore left a
      // "show more" under a Workspace the user had just closed, offering to
      // expand a list that is not there.
      //
      // Only this instance's own button, matched by the token it wired it with:
      // a successor instance may already have published one for this group, and
      // removing that would take down a live control (same rule as `style-node`).
      const orphan = ownButtonNode(group)
      if (orphan !== null && orphan.getAttribute(OWNER_ATTR) === token) orphan.remove()
      // Folding resets the BLOCK but not the REQUIREMENT — the trim and the
      // touched mark go, `SELECTION_ATTR` stays.
      //
      // Folding a Workspace means "collapse this list" for the presses the user
      // spent on it, and that half has to come back compact: reported
      // 2026-09-28, press "show more" a few times, fold the Workspace, reopen
      // it, and a list the user was done with came back fully expanded. But the
      // block a SELECTED row forced open cannot be recomputed after a fold at
      // all — the host reopens a folded group at its own five-row limit, so the
      // selected row is usually not in the DOM, and a requirement that is
      // dropped there can never be measured again (the same day's earlier
      // report: the fifteenth session's twenty-one-row block came back as
      // seven). So the presses reset and the requirement does not; the reopen
      // grows the host back to `max(configured, requirement)` and the ordinary
      // rules take over once the row is rendered again.
      clearAttr(group, TRIM_ATTR)
      clearAttr(group, TOUCHED_ATTR)
      clearAttr(group, TOTAL_ATTR)
      // A press queued behind a running pass is dropped with the trim it was
      // computed from: `servePendingPress` skips a group with no rows, and this
      // makes sure the slot is empty even if nothing releases `busy` again
      // before the group comes back.
      pendingPress.delete(group)
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
        await syncGroup(group, config, clicker, isAlive, token)
      } catch {
        ok = false
        // Same reasoning as `runSync`'s catch: a throwing pass must not
        // abandon the groups still queued behind it. `ok` keeps the fingerprint
        // from being recorded, so the next sweep retries this group.
      } finally {
        busy.delete(group)
      }
      // The re-arm exists for a sweep that arrived while this group was busy
      // and skipped it: the finished state — the button label above all — has
      // to be written by a sweep that can see the group idle.
      //
      // A `short` outcome re-arms too, and that is the half this branch used
      // to refuse. Not re-arming left the retry budget with nothing to spend
      // it on: the fingerprint goes unrecorded precisely so a later sweep will
      // take the group again, and on a sidebar that had just gone still no
      // later sweep was coming — the group sat on a fold short of its own
      // target, which is the freeze `recordSettled`'s note describes. The
      // budget is what makes re-arming safe, and a `failed` pass is the one
      // outcome that must not be re-armed (it would re-throw from here).
      if (recordSettled(group, ok) !== 'failed') schedule()
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
  // The observer also applies the trim itself, before it schedules anything,
  // because the marks have to land in the SAME microtask as the mutation that
  // would expose a row: a `MutationObserver` callback is a microtask and the
  // microtask checkpoint runs before the frame is painted, so a row marked
  // here is never presented. The sweep cannot be trusted with that — it skips
  // any group holding `busy`, so a host render landing inside a running pass
  // (the locate button pressing the overflow, the host's own reveal) stayed
  // unmarked until that pass's closing settle. Measured 2026-09-27, the host
  // taking a group to twenty rows while the pass sat in its 300ms tail:
  // nineteen rows stayed visible for ~155ms with the marks arriving at
  // dt=184ms — the flash reported on "定位会话". Trimming here instead marks
  // the same five rows at dt=9ms and the visible count never moves.
  //
  // Unconditional on purpose. A raised trim target inherits stale hidden marks
  // from the previous, smaller trim — they ride out the host's keyed re-render
  // on the row elements that survive it — and gating the clear on
  // `count > target` let them be cleaned up only by the last press of a
  // multi-press grow, which popped a row into the middle of the already-grown
  // list one press late: the flash on every second expansion. `applyTrim` is
  // change-guarded, so against a settled tree it writes nothing, and the
  // records its own writes queue are no-ops in the next delivery — the chain
  // ends after one pass.
  //
  // The observer is fed by the tweak's own writes for the same reason every
  // other value written here is change-guarded: an unconditional write would
  // queue another delivery, which would write again, and the sidebar would
  // spin the main thread. An earlier revision did exactly that.
  const observer = new MutationObserver((records) => {
    if (disposed) return
    /**
     * Groups this delivery has already trimmed.
     *
     * The trim is per GROUP, not per record, and one host commit arrives as
     * many records — every inserted row, plus the attribute writes that ride
     * with it. Without the set, a batch touching two Workspaces would trim only
     * the first one it met: the callback used to `return` on the first hit, so
     * the second group's rows were left to the sweep `schedule()` queues. That
     * sweep is still a microtask (so still pre-paint) EXCEPT when the group
     * holds `busy` — a pass in flight skips its own group — which is precisely
     * the window the inline trim exists to cover. Trimming every group in the
     * batch closes it.
     */
    const trimmed = new Set<Element>()
    let pending = false
    for (const record of records) {
      const target = record.target
      if (!(target instanceof Element)) continue
      const group = target.closest(GROUP_SELECTOR)
      if (group !== null) {
        // Reads the trim per callback rather than capturing it: a press that
        // lands mid-pass rewrites the target before its own pass queues behind
        // the running one, and the rows arriving after that must already obey
        // the new value. `aria-selected` is in the filter below because the
        // visible block is measured up to the selected row — a reveal that only
        // moves the marker still has to move the fold, in the same frame.
        if (!trimmed.has(group)) {
          trimmed.add(group)
          // Skipped when nothing a pass would read or write has moved since
          // that group's last settled pass — the same test the sweep's own
          // fingerprint check makes (see `sweep`). It is safe HERE for the
          // reason it is safe there: the signature carries the row count, the
          // last and first-HIDDEN row keys, the selected key, the trim, the
          // remembered selection and the host's label, so a matching
          // fingerprint means the marks on the rows are already the ones this
          // call would write. The mutations that do reach a group — a live
          // session's own row ticking over roughly once a second — carry a
          // signature identical to the last pass, and without this test each of
          // them bought a full `applyTrim` over the whole group (a
          // `querySelectorAll` of every row, a second query for the selection,
          // and an attribute write-check per row) inside a pre-paint microtask.
          // A mutation that DOES change the fold — a row inserted, or
          // `aria-selected` moving — moves the signature with it, so the trim
          // still lands in the microtask the change arrived in.
          //
          // Only the trim is gated, never `pending` below: the plugin's own
          // button is a DOM patch the host's re-render drops without touching
          // any value the signature measures, and the sweep that rebuilds it
          // has to keep being scheduled for that.
          if (settled.get(group) !== stateSignature(group)) {
            applyTrim(group, trimOf(group, config), config)
          }
        }
        pending = true
        continue
      }
      if (target.matches(`${LIST_SELECTOR}, ${SESSION_ROW_SELECTOR}`)) pending = true
    }
    // One schedule per delivery, and only when something in scope moved —
    // `schedule` is idempotent, so hoisting it out of the loop changes nothing
    // about pacing, only about how many times it is asked.
    if (pending) schedule()
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [HIDDEN_ATTR, 'aria-selected', 'aria-expanded', 'data-row-key'],
  })

  /**
   * Undo the DOM patches, but KEEP the layout latches on the groups.
   *
   * This runs on every settings change, one microtask before the next instance
   * mounts, and the latches are the only record of how wide each list is:
   * `trimOf` falls back to the configured initial count, so clearing them here
   * folded every expanded Workspace back to that count on ANY save — measured
   * 2026-09-26, a fifteen-row block was five rows with `trim` back to `null`
   * within 250ms of a save, which is the "改设置就把列表收起来" report. The
   * pressed mark goes with the trim: it is what keeps the plugin's own button
   * (the one that folds the list back) on screen.
   *
   * Switching the feature OFF is the reset, and only the caller knows when that
   * happened — the mount loop calls
   * {@link resetSidebarSessionCountLayout} for it.
   */
  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    // Only the buttons THIS instance wired. Every live button carries the token
    // of the mount that published it, so a disposer that lands after a successor
    // has already claimed a group cannot remove the successor's control — the
    // same identity rule `style-node.ts` applies to injected stylesheets. A
    // leftover from a dead instance is replaced by that successor when it next
    // publishes (see {@link ownButton}), so nothing here has to hunt for one.
    for (const button of document.querySelectorAll(`[${OWN_BUTTON_ATTR}]`)) {
      if (button.getAttribute(OWNER_ATTR) === token) button.remove()
    }
    for (const row of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) clearAttr(row, HIDDEN_ATTR)
    for (const group of document.querySelectorAll(GROUP_SELECTOR)) {
      const host = hostButton(group)
      if (host !== null) setStyle(host, 'display', '')
    }
    removeStyles()
  }
  return cleanup
}

/**
 * Forget every group's latched layout: the block width the user opened, the
 * requirement a selected row forced, the pressed mark and the cached total.
 *
 * The mount loop calls this when the feature is switched OFF, and on plugin
 * teardown — never on the remount that a settings change performs, which has to
 * leave the lists on screen exactly as they are (see `cleanup`). With the
 * feature off the latches are inert: the marks that hide rows went with the
 * stylesheet — but a switch-off that kept them would bring a long-expanded list
 * back the next time the feature came on, which is not what "off" means.
 */
export function resetSidebarSessionCountLayout(): void {
  for (const group of document.querySelectorAll(GROUP_SELECTOR)) {
    clearAttr(group, TRIM_ATTR)
    clearAttr(group, TOUCHED_ATTR)
    clearAttr(group, TOTAL_ATTR)
    clearAttr(group, SELECTION_ATTR)
  }
}
