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
 * The one anchor is the host's own `data-turn-process` marker on the disclosure
 * button, plus the three count attributes it already publishes. The tally's
 * class is namespaced (`cst-tp-counts`). The only CSS-modules-hash hook is the
 * chevron's `_chevron` suffix, and that rule is a nicety: a host that renames
 * it can at worst place the chevron after the tally, never lose the label.
 *
 * @module dsh-style-tweaks/client/tweaks/turn-process-counts
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the Context declaration merges and the `chat`
// namespace key map this file reads through.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** The host `chat` vocabulary, which still carries the whole tally group. */
type ChatTranslate = TranslateNS<'chat'>

/** One key of that vocabulary, so the tally table's keys stay checked. */
type ChatKey = Parameters<ChatTranslate>[0]

/** The host's disclosure button — the tweak's only anchor. */
const PROCESS_BUTTON = 'button[data-turn-process]'
/** The appended tally (namespaced, like every `cst-*` class in this plugin). */
const TALLY_CLASS = 'cst-tp-counts'

/**
 * The three tallies in 0.1.6's label order: the button attribute carrying the
 * count and the singular/plural vocabulary the host still ships for it.
 */
const TALLIES: readonly { readonly attribute: string; readonly one: ChatKey; readonly other: ChatKey }[] = [
  {
    attribute: 'data-turn-process-tool-calls',
    one: 'message.turnProcess.toolCalls.one',
    other: 'message.turnProcess.toolCalls.other',
  },
  {
    attribute: 'data-turn-process-messages',
    one: 'message.turnProcess.messages.one',
    other: 'message.turnProcess.messages.other',
  },
  {
    attribute: 'data-turn-process-subagents',
    one: 'message.turnProcess.subagents.one',
    other: 'message.turnProcess.subagents.other',
  },
]

/**
 * The tally the button should carry right now, or `null` when it has nothing
 * to append. Ported from the 0.1.6 `TurnProcessNodeView` label: a zero (or
 * absent) count is left out, and the parts are joined with the host's own
 * separator. The separator leads the string so the tally reads as a
 * continuation of the host's label (`用时 9分09秒` + ` · 55 次工具调用`), which
 * also keeps it attached to the tally when a narrow row truncates the label.
 * That leading space only survives because the tally's skin sets
 * `white-space: pre` — see the stylesheet below.
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
  if (parts.length === 0) return null
  const separator = t('message.turnProcess.separator')
  return separator + parts.join(separator)
}

/**
 * Bring one header button in line with its counts: append the tally, update it
 * in place, or take it off once the turn has no counted work left to report.
 * @param button - One `data-turn-process` disclosure button.
 * @param t - Translate seat over the host `chat` vocabulary.
 */
function syncButton(button: HTMLElement, t: ChatTranslate): void {
  const text = tallyText(button, t)
  // The host's own children are never touched: the tally is looked up as a
  // direct child, wherever React has since put the chevron around it.
  const existing = button.querySelector<HTMLElement>(`:scope > .${TALLY_CLASS}`)
  if (text === null) {
    existing?.remove()
    return
  }
  if (existing !== null) {
    if (existing.textContent !== text) existing.textContent = text
    return
  }
  const tally = document.createElement('span')
  tally.className = TALLY_CLASS
  tally.textContent = text
  button.appendChild(tally)
}

/**
 * The buttons one mutation batch can have changed: the target of a count
 * attribute (a tool call or message settled) and every button inside an added
 * subtree (a turn mounted, or React replaced its header). Removals need no
 * work — a tally goes with its button.
 * @param records - The batch handed to the observer callback.
 * @returns Buttons to re-sync, deduplicated.
 */
function touchedButtons(records: readonly MutationRecord[]): Set<HTMLElement> {
  const touched = new Set<HTMLElement>()
  for (const record of records) {
    if (record.type === 'attributes') {
      // The observer's filter names the three count attributes, so this is a
      // button in practice; the test keeps a stray carrier out of the sweep.
      if (record.target instanceof HTMLElement && record.target.matches(PROCESS_BUTTON)) {
        touched.add(record.target)
      }
      continue
    }
    for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.matches(PROCESS_BUTTON)) touched.add(node)
      for (const nested of node.querySelectorAll<HTMLElement>(PROCESS_BUTTON)) touched.add(nested)
    }
  }
  return touched
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
 * Mount the tally: append the 0.1.6 counts to every process-group header the
 * host renders, and keep them in step with the turn. Returns the disposer,
 * which removes every tally and restores the stock 0.1.7 header.
 */
export function setupTurnProcessCounts(ctx: ClientContext): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  const t = ctx.locale.bind('chat')
  const removeStyles = injectTurnProcessCountsStyles()

  const sync = (): void => {
    for (const button of document.querySelectorAll<HTMLElement>(PROCESS_BUTTON)) syncButton(button, t)
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
      for (const button of touchedButtons(settled)) syncButton(button, t)
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

  // Turns already in the transcript when the tweak mounts (a toggle click, or
  // a bundle reload).
  sync()

  const cleanup = (): void => {
    observer.disconnect()
    batch = []
    for (const tally of document.querySelectorAll(`.${TALLY_CLASS}`)) tally.remove()
    removeStyles()
    setGlobalCleanup(undefined)
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
 */
const TURN_PROCESS_COUNTS_CSS = `
button[data-turn-process] > .cst-tp-counts{flex:none;order:1;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:pre;font-variant-numeric:tabular-nums}
button[data-turn-process] > [class$="_chevron"],button[data-turn-process] > svg{order:2}
`

export const TURN_PROCESS_COUNTS_CSS_ID = 'cst-turn-process-counts'

function injectTurnProcessCountsStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${TURN_PROCESS_COUNTS_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = TURN_PROCESS_COUNTS_CSS_ID
    style.textContent = TURN_PROCESS_COUNTS_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}
