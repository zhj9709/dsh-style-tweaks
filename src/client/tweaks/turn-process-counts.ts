/**
 * dsh-style-tweaks — turn-process-counts tweak.
 *
 * Through 0.1.6 the header of a folded process group — the disclosure that
 * merges a turn's reasoning and its tool calls — was a tally:
 * `55 次工具调用 · 10 条消息`, plus `· 1 个 subagent` when the turn spawned
 * one. `TurnProcessNodeView` built that label from `node.data.toolCallCount` /
 * `messageCount` / `subagentCount`, joining the non-zero parts with
 * `message.turnProcess.separator` and falling back to `thoughtForAWhile`
 * ("已思考") when all three were zero. 0.1.7-alpha.1's performance-and-usage
 * preference replaced the label with the elapsed time: the header now reads
 * `用时 9分09秒` on a settled turn (`message.turnProcess.took`),
 * `深度求索中，用时…` while it runs (`deepDivingFor`), and `处理失败` /
 * `已停止` / `已完成工作` for the other endings.
 *
 * The counts themselves survived that commit — the node data still carries all
 * three, the button still publishes them as `data-turn-process-tool-calls` /
 * `-messages` / `-subagents`, and the whole `message.turnProcess.*` tally
 * vocabulary is still in the shipped `chat` dictionary. Only the label stopped
 * reading them. This tweak appends 0.1.6's tally to whatever the header already
 * says, so a settled turn reads
 * `用时 9分09秒 · 55 次工具调用 · 10 条消息`: the host's own label untouched,
 * the tally after it, both halves live (the counts grow as a running turn calls
 * its tools, and every other header state reads the same way).
 *
 * ## Two anchors, because 0.2.0 moved half of this
 *
 * 0.2.0-rc.1 narrowed when the disclosure exists at all: `TurnProcessNodeView`
 * now returns `null` unless the turn is closed, so a running turn no longer has
 * a button to append to. It renders `RunningStatus` instead
 * (`div[data-chat-running]`, "深度求索中，用时 4分13秒 ···"), which carries no
 * counts at all. The button path therefore covers settled turns and the
 * indicator path covers running ones, and the second one takes its numbers
 * from `turn-count-stream.ts` — this plugin folding the same Session events the
 * host's own tally folds, since 0.2.0 publishes that pipeline as a plugin
 * contract. Together the two read the way 0.1.7 did, including the one step
 * where the message tally is recomputed as the final answer lands.
 *
 * ## Why the header is patched in the DOM
 *
 * The process disclosure is a transcript node view, not a slot, so a plugin has
 * no render seat inside it. The tally is therefore one extra child
 * (`span.cst-tp-counts`) appended to the button the host marks with
 * `data-turn-process`; the host's own children are never touched.
 *
 * Ordering is fixed in CSS rather than by insertion position. The tally must
 * read after the host's label and before the chevron, and the chevron is
 * conditional (`canCollapse` is false for a turn with nothing to expand): when
 * React adds it later it appends to the end of the button, which would land it
 * after the tally. So the tally carries `order:1` and the chevron `order:2` on
 * the button's own flex row, and the display order holds however React
 * re-inserts its children.
 *
 * A turn with no tool call and no message gets no tally (0.1.6 omitted zero
 * counts the same way), and a host build without the count attributes leaves
 * the tweak inert.
 *
 * ## Selector safety
 *
 * The anchors are the host's own `data-turn-process` marker on the disclosure
 * button (with the three count attributes it already publishes) and its
 * `data-chat-running` marker on the running indicator. The tally's class is
 * namespaced (`cst-tp-counts`).
 *
 * There are two CSS-modules-hash hooks and neither is load-bearing. The
 * chevron's `_chevron` suffix only orders the chevron: a host that renames it
 * can at worst place the chevron after the tally, never lose the label. The
 * indicator's `_runningContent` suffix picks the row the tally joins; a host
 * that renames it lands the tally on the indicator element instead, which the
 * stylesheet covers for that reason.
 *
 * @module dsh-style-tweaks/client/tweaks/turn-process-counts
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the Context declaration merges and the `chat`
// namespace key map this file reads through.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { claimNode, claimStyleNode, releaseNode, releaseStyleNode } from '../style-node.ts'
import {
  currentTurnCounts,
  registerTurnCountStream,
  subscribeTurnCounts,
  type TurnCounts,
} from './turn-count-stream.ts'

/** The host `chat` vocabulary, which still carries the whole tally group. */
type ChatTranslate = TranslateNS<'chat'>

/** One key of that vocabulary, so the tally table's keys stay checked. */
type ChatKey = Parameters<ChatTranslate>[0]

/** The host's disclosure button — one of the tweak's two anchors. */
const PROCESS_BUTTON = 'button[data-turn-process]'
/**
 * 0.2.0's running Turn indicator, the second anchor: `TurnProcessNodeView`
 * now returns `null` until the Turn is closed, so a running Turn shows this
 * component (`RunningStatus`, "深度求索中，用时 4分13秒 ···") beside an empty
 * process group. It carries no counts of its own — they come from
 * `turn-count-stream.ts`, which folds the same events the host's own tally does.
 */
const RUNNING_HOST = '[data-chat-running]'
/**
 * Where the tally goes inside `RunningStatus`: the flex row holding the whale
 * icon and the shimmering label, so the counts read on the same line as the
 * elapsed time. Appended last, which needs no `order` — unlike the disclosure
 * button, this row has no conditional trailing child to outrank.
 *
 * `class*=` rather than `class$=`: a suffix match anchors the whole attribute
 * value, so a host that adds a second class to that row would silently drop
 * every running tally. The CSS Modules hash is a prefix, and the `_runningContent`
 * local name is the stable part.
 */
const RUNNING_ROW = '[class*="_runningContent"]'
/** The appended tally (namespaced, like every `cst-*` class in this plugin). */
const TALLY_CLASS = 'cst-tp-counts'

/**
 * The three tallies in 0.1.6's label order: the button attribute carrying the
 * count, the stream-side field carrying the same count while the turn is still
 * running, and the singular/plural vocabulary the host still ships for it.
 */
const TALLIES: readonly {
  readonly attribute: string
  readonly field: keyof TurnCounts
  readonly one: ChatKey
  readonly other: ChatKey
}[] = [
  {
    attribute: 'data-turn-process-tool-calls',
    field: 'toolCallCount',
    one: 'message.turnProcess.toolCalls.one',
    other: 'message.turnProcess.toolCalls.other',
  },
  {
    attribute: 'data-turn-process-messages',
    field: 'messageCount',
    one: 'message.turnProcess.messages.one',
    other: 'message.turnProcess.messages.other',
  },
  {
    attribute: 'data-turn-process-subagents',
    field: 'subagentCount',
    one: 'message.turnProcess.subagents.one',
    other: 'message.turnProcess.subagents.other',
  },
]

/**
 * Join counted parts into the string to append, or `null` when nothing counts.
 * Ported from the 0.1.6 `TurnProcessNodeView` label: a zero count is left out,
 * and the parts are joined with the host's own separator. The separator leads
 * the string so the tally reads as a continuation of the host's label
 * (`用时 9分09秒` + ` · 55 次工具调用`), which also keeps it attached to the
 * tally when a narrow row truncates the label. That leading space only survives
 * because the tally's skin sets `white-space: pre` — see the stylesheet below.
 * @param parts - The counted parts, in label order.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @returns The text to append, or `null` for a turn with no counted work.
 */
function joinTally(parts: readonly string[], t: ChatTranslate): string | null {
  if (parts.length === 0) return null
  const separator = t('message.turnProcess.separator')
  return separator + parts.join(separator)
}

/**
 * The tally a settled turn's disclosure button should carry right now, read
 * from the host's own count attributes.
 * @param button - One `data-turn-process` disclosure button.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @returns The text to append, or `null` for a turn with no counted work.
 */
function tallyText(button: HTMLElement, t: ChatTranslate): string | null {
  const parts: string[] = []
  for (const tally of TALLIES) {
    const raw = button.getAttribute(tally.attribute)
    const count = raw === null ? Number.NaN : Number(raw)
    if (!Number.isFinite(count) || count <= 0) continue
    parts.push(t(count === 1 ? tally.one : tally.other, { count }))
  }
  return joinTally(parts, t)
}

/**
 * The tally a running turn's indicator should carry right now, read from the
 * event stream. Same vocabulary, same order, same zero-skipping as the settled
 * path — the two differ only in where the numbers come from.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @returns The text to append, or `null` while no turn is running.
 */
function runningTallyText(t: ChatTranslate): string | null {
  const counts = currentTurnCounts()
  if (counts === null) return null
  const parts: string[] = []
  for (const tally of TALLIES) {
    const count = counts[tally.field]
    if (count <= 0) continue
    parts.push(t(count === 1 ? tally.one : tally.other, { count }))
  }
  return joinTally(parts, t)
}

/**
 * Bring one tally slot in line with its text: append the tally, update it in
 * place, or take it off once there is nothing to report.
 *
 * Shared by both anchors because the ownership rules are the hard part and they
 * are identical: a tally found in place is adopted and re-stamped with THIS
 * instance's token, and a tally is removed only while this instance still owns
 * it. A document-wide `.cst-tp-counts` sweep would delete a successor
 * instance's tallies too (same reasoning as `style-node.ts`).
 * @param row - The element the tally is a direct child of.
 * @param text - The text to show, or `null` to show nothing.
 * @param owned - Tally → the token stamped on it by whichever instance last
 *   claimed it. The disposer removes a tally only while that token still stands,
 *   which is what keeps a handover from deleting a successor's node.
 */
function applyTally(row: HTMLElement, text: string | null, owned: Map<HTMLElement, string>): void {
  // The host's own children are never touched: the tally is looked up as a
  // direct child, wherever React has since put the chevron around it.
  const existing = row.querySelector<HTMLElement>(`:scope > .${TALLY_CLASS}`)
  if (text === null) {
    const token = existing === null ? undefined : owned.get(existing)
    if (existing !== null && token !== undefined) {
      releaseNode(existing, token)
      owned.delete(existing)
    }
    return
  }
  if (existing !== null) {
    // Adopt whatever is already there — a bundle handover can leave the previous
    // instance's tally in place — and re-stamp it with THIS instance's token.
    // Without the re-stamp the tally would still carry the old owner, so the old
    // disposer (which runs second, after this instance adopted it) would remove
    // the node this instance is now responsible for.
    owned.set(existing, claimNode(existing))
    if (existing.textContent !== text) existing.textContent = text
    return
  }
  const tally = document.createElement('span')
  tally.className = TALLY_CLASS
  tally.textContent = text
  owned.set(tally, claimNode(tally))
  row.appendChild(tally)
}

/**
 * Bring a settled turn's header button in line with the counts the host
 * published on it.
 * @param button - One `data-turn-process` disclosure button.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @param owned - Tally ownership map (see {@link applyTally}).
 */
function syncButton(button: HTMLElement, t: ChatTranslate, owned: Map<HTMLElement, string>): void {
  applyTally(button, tallyText(button, t), owned)
}

/**
 * Bring every running turn's indicator in line with the streamed counts.
 *
 * The host mounts one `RunningStatus` per chat view, so a page holding more
 * than one conversation has more than one indicator; all of them are stepped
 * here rather than only the first, which would leave the rest bare.
 *
 * A host that drops the `runningContent` row still gets a tally — appended to
 * the host element itself, which is the flex column the row lives in. The
 * stylesheet covers that shape too; see the note above the rules.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @param owned - Tally ownership map (see {@link applyTally}).
 */
function syncRunning(t: ChatTranslate, owned: Map<HTMLElement, string>): void {
  for (const host of document.querySelectorAll<HTMLElement>(RUNNING_HOST)) {
    // Direct child, like the button path: a descendant match would pick up a
    // lookalike row nested inside another conversation's column.
    const row = host.querySelector<HTMLElement>(`:scope > ${RUNNING_ROW}`) ?? host
    applyTally(row, runningTallyText(t), owned)
  }
}

/** What one mutation batch can have changed, deduplicated. */
interface TouchedSlots {
  /** Disclosure buttons whose count attributes or subtree changed. */
  readonly buttons: Set<HTMLElement>
  /** Whether a running indicator appeared, disappeared, or was re-rendered. */
  readonly running: boolean
}

/**
 * The slots one mutation batch can have changed: the target of a count
 * attribute (a tool call or message settled), every button inside an added
 * subtree (a turn mounted, or React replaced its header), and — the case that
 * makes a tally vanish for good — the *target* of a childList record.
 *
 * That last one matters because a removal is not always a button going away.
 * When the host re-renders a button that stays, the record's target is that
 * live button and the removed node is the tally this tweak injected; scanning
 * added nodes alone finds nothing to re-sync, and since the full sweep only
 * runs at setup, the count bar would stay gone until some unrelated count
 * attribute happened to change. Removals of whole buttons still need no work
 * of their own — a button that left the document has nothing to re-sync — and
 * the same reasoning covers a running indicator that mounted, unmounted, or
 * lost its children to a re-render.
 * @param records - The batch handed to the observer callback.
 * @returns The slots to re-sync.
 */
function touchedSlots(records: readonly MutationRecord[]): TouchedSlots {
  const buttons = new Set<HTMLElement>()
  let running = false
  for (const record of records) {
    // Both checks are properties of the record, not of the nodes in it: the
    // target is where the host edited, and a childList record on the indicator
    // itself is how a re-render inside it is reported (the removed node is the
    // tally this tweak injected). The observer's attribute filter names the
    // three count attributes, so an attributes record's target is a button in
    // practice; the test keeps a stray carrier out of the sweep either way.
    if (record.target instanceof HTMLElement) {
      if (record.target.matches(PROCESS_BUTTON)) buttons.add(record.target)
      if (record.type === 'childList' && record.target.matches(RUNNING_HOST)) running = true
    }
    if (record.type === 'attributes') continue
    for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.matches(PROCESS_BUTTON)) buttons.add(node)
      for (const nested of node.querySelectorAll<HTMLElement>(PROCESS_BUTTON)) buttons.add(nested)
      if (node.matches(RUNNING_HOST) || node.querySelector(RUNNING_HOST) !== null) running = true
    }
    // A whole indicator that left the document takes its tally with it, and the
    // next sync only has to notice the slot is gone.
    for (const node of record.removedNodes) {
      if (node instanceof HTMLElement && node.matches(RUNNING_HOST)) running = true
    }
  }
  return { buttons, running }
}

/**
 * HMR duplicate-setup guard (same pattern as the other DOM-patching tweaks): a
 * hot reload can run setup again before the previous effect's cleanup ran, so
 * the stale cleanup is invoked first and two observers never stack.
 */
const GLOBAL_KEY = '__cst_turn_process_counts_cleanup__'
function getGlobalCleanup(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[GLOBAL_KEY] as (() => void) | undefined
}
function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[GLOBAL_KEY] = fn
}

/**
 * Mount the tally: append 0.1.6's counts to every process-group header the host
 * renders, and to the running indicator while a turn is in flight. Returns the
 * disposer, which removes every tally and leaves the host's own header and
 * indicator text as shipped.
 */
export function setupTurnProcessCounts(ctx: ClientContext): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  const t = ctx.locale.bind('chat')
  const removeStyles = injectTurnProcessCountsStyles()

  let disposed = false
  /**
   * Tallies this instance appended, and therefore the only ones it may remove.
   *
   * The previous disposer swept the document for `.cst-tp-counts`, which is
   * only correct while one instance is alive: it also deleted nodes a newer
   * instance had just appended during the handover in `getGlobalCleanup()`.
   * The value is the claim token `claimNode` stamped on that tally, so removal
   * is identity-checked — see `style-node.ts` for why the no-op is the point.
   */
  const owned = new Map<HTMLElement, string>()

  const sync = (): void => {
    for (const button of document.querySelectorAll<HTMLElement>(PROCESS_BUTTON)) syncButton(button, t, owned)
    syncRunning(t, owned)
    pruneDetachedTallies(owned)
  }

  /**
   * Forget tallies the host unmounted along with their host — a button's on a
   * transcript edit, the indicator's when the Turn closes.
   *
   * A separate function rather than a line inside `sync()`: `sync()` runs once,
   * at mount, when nothing is detached yet, and the per-slot paths below
   * (`syncButton` / `syncRunning` in the observer and the stream subscription)
   * are what run afterwards. A prune reachable only from `sync()` would never
   * fire, and each unmount would pin a detached node and its token in `owned`
   * for the rest of the session.
   * @param owned - Tally ownership map, pruned in place.
   */
  function pruneDetachedTallies(owned: Map<HTMLElement, string>): void {
    for (const [tally] of owned) if (!tally.isConnected) owned.delete(tally)
  }

  // The running indicator's text is written from the event stream, not from a
  // DOM mutation, so it gets its own coalesced write. The stream fires on
  // every folded event; a tool-call burst is one microtask, not one write each.
  let countsScheduled = false
  const scheduleRunningSync = (): void => {
    if (countsScheduled || disposed) return
    countsScheduled = true
    queueMicrotask(() => {
      countsScheduled = false
      if (disposed) return
      syncRunning(t, owned)
      pruneDetachedTallies(owned)
    })
  }

  // Coalesce a burst of DOM mutations into one sweep per microtask: the
  // observer spans `document.body` and every streaming chunk lights up its
  // child list, but a batch is only walked for added subtrees and the three
  // count attributes, so a sweep costs what the batch touched rather than
  // what the document holds.
  let batch: MutationRecord[] = []
  let scheduled = false
  const observer = new MutationObserver((records) => {
    batch.push(...records)
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      const settled = batch
      batch = []
      // A microtask already queued when the disposer ran must not touch the
      // DOM afterwards; draining `batch` first leaves nothing behind it.
      if (disposed) return
      const touched = touchedSlots(settled)
      for (const button of touched.buttons) syncButton(button, t, owned)
      if (touched.running) syncRunning(t, owned)
      pruneDetachedTallies(owned)
    })
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    // Only the counts move the tally; `data-open` / `aria-expanded` / class
    // churn on the same button must not schedule a sweep.
    attributeFilter: TALLIES.map(tally => tally.attribute),
  })

  // Registered before the first sweep so a Turn already running at mount time
  // has tallies to paint: the stream folds the loaded history for open Turns
  // (see `turn-count-stream.ts`), and a host without the Conversation contract
  // simply hands back an inert disposer.
  const disposeStream = registerTurnCountStream(ctx)
  const unsubscribeCounts = subscribeTurnCounts(scheduleRunningSync)

  // Turns already in the transcript when the tweak mounts (a toggle click, or
  // a bundle reload).
  sync()

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    batch = []
    unsubscribeCounts()
    disposeStream()
    // Identity-checked, not a blanket sweep: `applyTally` adopts leftovers, and
    // a disposer that removed unconditionally would take down a tally a newer
    // instance had already re-stamped as its own.
    for (const [tally, token] of owned) releaseNode(tally, token)
    owned.clear()
    removeStyles()
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}

/**
 * The tally's skin: the label's own type scale, plus the row's fixed order.
 *
 * `white-space: pre` rather than `nowrap` for one reason: the tally's text
 * LEADS with the host separator. As its own flex item the tally is a block,
 * and CSS drops collapsible white space at the start of a block — which
 * silently ate the space before the first dot, rendering
 * `用时 9分09秒· 55 次工具调用`. `pre` is not collapsible, so the string
 * renders exactly as the host vocabulary spells it, and it does not wrap
 * either: same nowrap behaviour, space kept.
 *
 * The second rule is the running indicator's copy, where there is nothing to
 * order around: that row already ends with the shimmer, and the tally lands
 * after it. The line-height matches the indicator's own text rather than the
 * disclosure's taller row, so the appended counts do not change that row's
 * height.
 *
 * It carries BOTH shapes `syncRunning` can append to — the `runningContent`
 * row, and the indicator element itself when a host has no such row. Scoping it
 * to the row alone would leave the fallback tally unstyled, and unstyled means
 * without `white-space: pre`, which is exactly the leading-space collapse
 * documented above. And the selector is a direct child rather than a bare
 * descendant, matching where the code appends, so it cannot reach a disclosure
 * tally nested inside an indicator and hand that one `line-height:inherit`.
 */
const TURN_PROCESS_COUNTS_CSS = `
button[data-turn-process] > .cst-tp-counts{flex:none;order:1;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:pre;font-variant-numeric:tabular-nums}
button[data-turn-process] > [class$="_chevron"],button[data-turn-process] > svg{order:2}
[data-chat-running] > [class*="_runningContent"] > .cst-tp-counts,
[data-chat-running] > .cst-tp-counts{flex:none;font-size:var(--dsh-content-font-size-secondary,13px);line-height:inherit;white-space:pre;font-variant-numeric:tabular-nums}
`

export const TURN_PROCESS_COUNTS_CSS_ID = 'cst-turn-process-counts'

function injectTurnProcessCountsStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${TURN_PROCESS_COUNTS_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = TURN_PROCESS_COUNTS_CSS_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, TURN_PROCESS_COUNTS_CSS)
  return () => { releaseStyleNode(style, owner) }
}
