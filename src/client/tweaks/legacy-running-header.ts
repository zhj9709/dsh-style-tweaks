/**
 * dsh-style-tweaks — the 0.1.7 running process-group header, restored.
 *
 * ## What 0.1.7 showed and 0.2.0 does not
 *
 * Through 0.1.7-rc.2 a running turn drew its process group immediately, headed
 * by the disclosure button — and that button was DISABLED: `canCollapse` is
 * `foldable && hasContent && !turnProcessAlwaysOpen(node)`, and
 * `turnProcessAlwaysOpen` is true for every `open` turn. So the row was a
 * heading, not a control: `深度求索中，用时 1小时50分26秒` plus (with the tally
 * tweak) the 0.1.6 counts, sitting above that turn's tool rows, ticking once a
 * second, with no chevron because there was nothing to expand.
 *
 * 0.2.0-rc.1 changed two things at once: `TurnProcessNodeView` returns `null`
 * until the turn is closed, and the running label moved to its own
 * `RunningStatus` row at the live tail (`div[data-chat-running]`, blue, with
 * the whale and the shimmer). The tail row is arguably the better answer to
 * "where is the work right now" — it stays near the composer instead of being
 * pushed away by the very tool output it is reporting. This tweak is for the
 * people whose reading of a conversation is the older one, where the header
 * belongs to the turn it heads rather than to the viewport.
 *
 * ## How a heading that the host refuses to draw gets drawn
 *
 * Two anchors, and neither of them is the host's:
 *
 * - The slot. 0.2.0 still mounts a flow item for the running turn's process
 *   group — `<div data-chat-flow-kind="turn-process">` — and still leaves it
 *   EMPTY, because the node view returned null. The turn's tool rows and
 *   reasoning follow it as siblings, so the empty item sits exactly where the
 *   0.1.7 header used to be. The row is injected into it, into the
 *   `display: contents` slot wrapper the flow item always renders, so the host
 *   owns the surrounding layout and the injected node is the only addition.
 * - The numbers. `turn-count-stream.ts` already folds the same Session events
 *   the host folds, and publishes both the tallies and the turn's
 *   `turn/start` time — so the elapsed clock is computed from an honest origin
 *   rather than scraped out of the host's shimmering label once a second.
 *
 * The row is NOT interactive and does not pretend to be: it is a `<div>`, not
 * the host's `<button>`, carries no `aria-expanded` and no chevron, and does
 * nothing on click. A heading that lied about being a disclosure would be
 * worse than the 0.2.0 presentation it sits next to.
 *
 * ## When it appears, and when it goes away
 *
 * It appears with the turn's first row of work and not before — within the
 * `TICK_MS` of it rather than in the same frame, a lag argued at the ticker. A
 * heading is something you read to know what the rows under it are, so a heading
 * floating over an empty group is heading nothing. Until the first row lands the
 * host's own blue tail row is on screen saying the turn is running, and this
 * tweak leaves it exactly as 0.2.0 draws it — the same thing you would see with
 * this feature off. That is also why nothing in this file touches the tail row:
 * an earlier revision of this file took the duplication between the two rows as
 * a defect to be suppressed and hid the host's row while the turn had produced
 * nothing yet. The user has it the other way round — the tail row is 0.2.0's
 * answer and stays untouched, and it is this heading that waits.
 *
 * As soon as the turn ends the host renders its real disclosure into the same
 * flow item, and this row leaves on the next structural check — 250 ms, not
 * zero, and the earlier draft of this file claimed "never", which was simply
 * untrue: `turn/end` fires before React commits, so there is a real window
 * where the stream already says the turn is closed while the host has not yet
 * drawn the button. The window is a quarter of a second because the check runs
 * on a timer rather than only on stream events, and the host's button is
 * `appendChild`ed after ours rather than replacing it. The row is a static
 * heading, so a brief overlap costs a repeated line and nothing else.
 *
 * ## Two limitations, stated rather than hidden
 *
 * - One heading, page-wide. `runningSlot()` takes the first empty flow item in
 *   the document, and the clock comes from a single page-wide stream, so on a
 *   hypothetical page with two conversation views running at once the second
 *   view's heading would follow the first view's turn. DSH renders one
 *   conversation per page, so this is a simplification rather than a bug — but
 *   it is the same simplification `turn-count-stream.ts` makes, and it is why
 *   that file owns the explanation of the single `open` value.
 * - The tally is gated on `turnProcessCounts`, so the two settings cannot
 *   disagree about the same turn.
 *
 * @module dsh-style-tweaks/client/tweaks/legacy-running-header
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { claimNode, claimStyleNode, releaseNode, releaseStyleNode } from '../style-node.ts'
import {
  currentTurnCounts,
  currentTurnStartedAt,
  registerTurnCountStream,
  subscribeTurnCounts,
} from './turn-count-stream.ts'
import { countsTallyText, formatLiveDuration, type ChatTranslate, type StyleTweaksTranslate } from './turn-tally.ts'

/**
 * The running turn's flow item: the host mounts it and leaves it empty, and it
 * is the only place the 0.1.7 header can go back. `:not(:has(button))` is what
 * separates a running turn's empty item from a settled turn's filled one.
 */
const RUNNING_FLOW_ITEM = 'div[data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process]))'
/** The slot wrapper every flow item renders; `display: contents`, so it is layout-neutral. */
const SLOT_NODE = '[data-slot="conversation.chat.node"]'
/** The injected heading. */
const HEADER_CLASS = 'cst-legacy-running-header'
/**
 * The host's blue tail row. Read only as a gate — `runningSlot()` refuses to
 * paint a heading when no turn is running — and never modified: the row is
 * 0.2.0's own running indicator and this tweak has no business hiding it.
 */
const RUNNING_HOST = '[data-chat-running]'

/**
 * How often the DOM is re-examined. It sets two latencies: after a turn ends,
 * the overlap between this heading and the host's own disclosure; after a turn
 * begins, the gap between the turn's first row landing and the heading joining
 * it. See the ticker in {@link setupLegacyRunningHeader} for why the second one
 * is accepted rather than observed away.
 */
const TICK_MS = 250

/**
 * The empty flow item the running turn's heading belongs in, or `null`.
 *
 * Gated on `[data-chat-running]` existing: without a running turn the empty
 * item means the host has not materialised the group yet, and painting a
 * "deep diving" heading over a turn that is not diving would be a lie.
 *
 * `null` also covers the moment the turn has just ENDED: by then the host has
 * replaced the empty item with a filled one carrying its own disclosure, and
 * `:not(:has(button))` stops matching. React appends that button rather than
 * clearing the slot, so without this check the heading would sit above the
 * host's row until the next tick.
 * @returns The slot to inject into, or `null` when there is nothing running.
 */
function runningSlot(): HTMLElement | null {
  if (document.querySelector(RUNNING_HOST) === null) return null
  const item = document.querySelector<HTMLElement>(RUNNING_FLOW_ITEM)
  if (item === null) return null
  return item.querySelector<HTMLElement>(SLOT_NODE) ?? item
}

/**
 * Whether the running turn has produced a row of its own yet.
 *
 * This is what decides whether the heading is on screen. A turn's first
 * seconds are a stream of empty flow items (`height: 0` by the host's own rule)
 * around the one the heading would sit in, and the members only start painting
 * once there is a row to show — so asking for geometry rather than for a marker
 * class is what lets the answer be "nothing yet" for the case that matters, a
 * turn whose first tool call is still in flight. Until it flips, nothing this
 * tweak adds is on screen: the transcript is what 0.2.0 draws on its own, which
 * is the whole point of waiting.
 *
 * The walk counts THIS turn's rows and nothing else, and every part of that is
 * load-bearing:
 *
 * - The tail row is skipped because `RunningStatus` is itself a child of the
 *   flow column at the end of the turn, so a naive "first visible sibling" walk
 *   runs straight into it and reports a turn with zero output as having output —
 *   the heading would appear over a group that is still empty, which is the one
 *   thing this predicate exists to prevent. (The earlier suppression design
 *   shipped exactly that bug, and its test hid the tail row together with the
 *   content rows, so the assertion could not fail. Exercise this with the tail
 *   row left VISIBLE.)
 * - Membership is `data-chat-turn`, which the host stamps on every flow item
 *   (`data-chat-turn: turn` in `ChatNodeSeat`). `ChatNodeList` appends
 *   queued-message and steering bubbles to the end of the column
 *   (`return [...rows, ...pendingRows]`), and those bubbles are NOT flow items,
 *   so they carry no such attribute — yet they have height, and without the
 *   bound a user who queues a message in the first seconds of a turn would see
 *   the heading appear over a group that is still empty. Anything not annotated
 *   as this turn therefore ends the walk.
 *
 * Nothing here writes to the host's row: a turn that has produced nothing is a
 * state 0.2.0 already draws well on its own.
 * @param item - The flow item that would hold the heading.
 * @returns Whether at least one row of THIS turn is visible below it.
 */
function hasVisibleProcessOutput(item: HTMLElement): boolean {
  const turn = item.getAttribute('data-chat-turn')
  // No boundary to draw from: report "has output", which is the direction that
  // shows the heading rather than the direction that could withhold it.
  if (turn === null) return true
  for (let node = item.nextElementSibling; node !== null; node = node.nextElementSibling) {
    if (node.matches(RUNNING_HOST)) continue
    if (node.getAttribute('data-chat-turn') !== turn) return false
    if (node.getBoundingClientRect().height > 0) return true
  }
  return false
}

/**
 * The heading's text: 0.1.7's running label, then the 0.1.6 tally when there is
 * one AND the tally tweak is on.
 *
 * Both halves come from dictionaries that 0.2.0 moved out from under this
 * plugin. The running wording lost its key (`message.turnProcess.deepDivingFor`
 * is gone), so it is this plugin's `legacyRunningHeader`; the duration lost its
 * three whole-string templates (0.2.0 replaced them with bare unit strings),
 * so `formatLiveDuration` reads this plugin's `durationHours` /
 * `durationMinutes` / `durationSeconds` instead — see `turn-tally.ts`. The
 * tally is the one part the host still owns, and it is read off the same
 * `chat` seat the other tweak uses.
 *
 * The tally is gated on `turnProcessCounts` because that is what the setting
 * promises, and because this tweak registers its OWN stream — the counts are
 * available even with the other tweak off, which is what made the gating
 * necessary rather than incidental. Ungated, a user who turned the counts off
 * would see them on this row mid-turn and then find them gone from the settled
 * header: one turn, two readings.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @param label - This plugin's own locale seat, for the 0.1.7 wording and duration.
 * @param withTally - Whether the 0.1.6 counts belong on the heading.
 * @returns The label text, with the tally appended when the turn has counted work.
 */
function headerText(t: ChatTranslate, label: StyleTweaksTranslate, withTally: boolean): string {
  const startedAt = currentTurnStartedAt()
  // No `turn/start` in the loaded window (see `turn-count-stream.ts`): the turn
  // is real and running, but there is no honest zero for its clock, so the
  // heading shows the bare running wording rather than a made-up elapsed time.
  const duration = startedAt === undefined ? undefined : formatLiveDuration(Date.now() - startedAt, label)
  const head = duration === undefined ? t('chat.deepDiving') : label('legacyRunningHeader', { duration })
  const tally = withTally ? countsTallyText(currentTurnCounts(), t) : null
  return tally === null ? head : `${head}${tally}`
}

/**
 * Take down every heading this instance appended, leaving the transcript as the
 * host rendered it.
 * @param owned - Headings this instance appended, and therefore the only ones
 *   it may remove.
 */
function dropHeadings(owned: Map<HTMLElement, string>): void {
  for (const [node, token] of owned) releaseNode(node, token)
  owned.clear()
}

/**
 * Draw the heading for the running turn, or take it off when the turn has no
 * work to head yet / no longer has a slot of its own.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @param label - This plugin's own locale seat, for the 0.1.7 wording.
 * @param withTally - Whether the 0.1.6 counts belong on the heading.
 * @param owned - Heading → the token stamped on it by this instance.
 */
function syncHeader(
  t: ChatTranslate,
  label: StyleTweaksTranslate,
  withTally: boolean,
  owned: Map<HTMLElement, string>,
): void {
  const slot = runningSlot()
  if (slot === null) {
    // The turn ended, or the session changed under us. Either way the host owns
    // this slot now and ours must not stay in it.
    dropHeadings(owned)
    return
  }
  // The heading arrives with the first row it heads. Until then the host's own
  // tail row is on screen carrying the running wording and the elapsed clock,
  // so an early heading would be a second copy of a line the user can already
  // read — and a caption over an empty group.
  const item = slot.closest<HTMLElement>('[data-chat-flow-kind]') ?? slot
  if (!hasVisibleProcessOutput(item)) {
    dropHeadings(owned)
    return
  }
  const text = headerText(t, label, withTally)
  const existing = slot.querySelector<HTMLElement>(`:scope > .${HEADER_CLASS}`)
  if (existing !== null) {
    // Adopt and re-stamp, the same handover rule the other DOM tweaks use: a
    // bundle reload leaves the previous instance's heading behind, and without
    // the re-stamp the old disposer would remove the node this instance is now
    // responsible for.
    owned.set(existing, claimNode(existing))
    if (existing.textContent !== text) existing.textContent = text
    return
  }
  const header = document.createElement('div')
  // Only the heading's own class. It is NOT a `.cst-tp-counts`: every rule
  // styling that class requires it to be a DIRECT child of a disclosure button
  // or of the running row, so this element matches none of them and the extra
  // name would be inert — while making the heading look like another tweak's
  // tally to any future document-wide query for that class, which is precisely
  // the sweep `turn-process-counts.ts` documents as unsafe.
  header.className = HEADER_CLASS
  header.textContent = text
  owned.set(header, claimNode(header))
  slot.appendChild(header)
}

/**
 * HMR duplicate-setup guard, the same global-key pattern as the other DOM
 * tweaks: a reload can run setup again before the previous effect's cleanup
 * ran, so the stale cleanup is invoked first and two tickers never stack.
 */
const GLOBAL_KEY = '__cst_legacy_running_header_cleanup__'
function getGlobalCleanup(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[GLOBAL_KEY] as (() => void) | undefined
}
function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[GLOBAL_KEY] = fn
}

/**
 * Mount the 0.1.7 running heading. Returns the disposer, which removes the
 * heading and leaves the transcript exactly as the host rendered it.
 * @param ctx - Client context, for the host's chat vocabulary and the stream.
 * @param label - This plugin's locale seat, for the wording 0.2.0 dropped.
 * @param withTally - Whether the 0.1.6 counts belong on the heading; read from
 *   the `turnProcessCounts` setting, which is what the panel text promises.
 * @returns The disposer.
 */
export function setupLegacyRunningHeader(
  ctx: ClientContext,
  label: StyleTweaksTranslate,
  withTally: boolean,
): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  // No cast: `turn-tally.ts` imports the `chat` namespace augmentation, so the
  // key and the parameter shape are both checked here.
  const t: ChatTranslate = ctx.locale.bind('chat')
  const removeStyles = injectLegacyRunningHeaderStyles()

  let disposed = false
  /** Headings this instance appended, and therefore the only ones it may remove. */
  const owned = new Map<HTMLElement, string>()

  const tick = (): void => {
    if (disposed) return
    syncHeader(t, label, withTally, owned)
  }

  // The DOM has to be re-examined on its own clock, not only when the stream
  // speaks, because what puts the heading on screen is a DOM fact the stream
  // never reports: whether the turn's first row has actually landed. The stream
  // knows a tool call was issued well before a row with height exists; the host
  // painting its own disclosure into this slot after the turn ends is a second
  // such fact; and a queued-message bubble can appear or vanish with no event at
  // all.
  //
  // Four checks a second cost three selector queries and one geometry read
  // apiece, and a text write only on the tick that crosses a second boundary —
  // the label itself re-renders at most once a second because that is all the
  // clock's resolution. What the timer costs visibly is lag: the heading can
  // land up to a quarter second after the row it heads, shifting the transcript
  // by the heading's own 33px in a second step. Narrowing the interval is not
  // free (every tick walks the sibling list and forces layout), and observing
  // the mutation instead would put a subtree observer on the flow column for
  // every page with this feature on, so the quarter second is the trade taken.
  const timer = window.setInterval(tick, TICK_MS)
  // Registered before the first draw for the same reason the other stream-backed
  // tweak does: a turn already running at mount time has a history to fold.
  const disposeStream = registerTurnCountStream(ctx)
  const unsubscribe = subscribeTurnCounts(tick)

  tick()

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    window.clearInterval(timer)
    unsubscribe()
    disposeStream()
    dropHeadings(owned)
    removeStyles()
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}

/**
 * The heading's skin: 0.1.7's `TurnProcessNodeView.module.css` restated.
 *
 * Written out rather than borrowed from the host's hashed class names
 * (`l_V-RG_root` and friends), which survive a version but not a rename. The
 * values are the host's 0.1.7 declarations verbatim, minus `cursor: pointer`
 * and the hover colour — a heading that is not clickable should not look
 * clickable — and the theme tokens carry the light/dark adaptation.
 *
 * WITHOUT 0.1.7's `margin-bottom: 8px`, on purpose, and it is the one place
 * this skin knowingly departs from the version it restores. 0.1.7 carried
 * `:not([data-open]) { margin-bottom: 8px }` on the disclosure; 0.2.0 dropped
 * that rule and left the spacing to the flow gap, which is why its own settled
 * disclosure measures 16px above and 16px below (measured on 0.2.0-rc.2 across
 * three settled turns). Copying the old 8px put this heading at 16 above and
 * 24 below — heavier than the host's own header sitting two turns further
 * down the same page, and four times the 6px between ordinary tool rows.
 * Matching 0.2.0 is also what makes the running heading and the settled one
 * read as the same line, which is the point of the tweak.
 */
const LEGACY_RUNNING_HEADER_CSS = `
.${HEADER_CLASS}{box-sizing:border-box;display:flex;align-items:center;width:100%;min-width:0;height:calc(33px + var(--dsh-content-font-delta,0px));padding:0 0 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:pre;font-variant-numeric:tabular-nums}
`

export const LEGACY_RUNNING_HEADER_CSS_ID = 'cst-legacy-running-header'

function injectLegacyRunningHeaderStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${LEGACY_RUNNING_HEADER_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = LEGACY_RUNNING_HEADER_CSS_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, LEGACY_RUNNING_HEADER_CSS)
  return () => { releaseStyleNode(style, owner) }
}
