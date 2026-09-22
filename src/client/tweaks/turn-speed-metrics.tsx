/**
 * dsh-style-tweaks — turn-speed-metrics tweak.
 *
 * Since session format v2 (0.1.5), cold sessions cannot rebuild per-token
 * timing (the Chat UI builds settled output straight from the assembled
 * message and never replays the embedded stream), so the turn footer's
 * "本轮用时和速度" dialog keeps only the wall-clock duration — the 输出速度
 * (TPS) and 首 token 用时 (TTFT) rows are gone. This tweak restores those
 * two rows INTO the same dialog: opening the time pill's dialog refills the
 * panel with the figures rebuilt from the model streams embedded in the
 * session log (see `assistant-stream-timing.ts` — the consumer the v2
 * architecture note anticipates). History loads get the same figures a live
 * session did; turns whose settlement stream carries no timing keep the
 * stock dialog.
 *
 * ## Why the rows are injected from a MutationObserver
 *
 * The dialog belongs to `TurnTimePanel`, which offers no slot — the row's
 * `conversation.chat.assistant-actions` list slot (additive, no election
 * race) mounts an invisible controller inside the same footer instead. The
 * dialog itself is portaled to `<body>` and opens through React's own click
 * handling, so refill is driven by one shared body-wide `MutationObserver`:
 * the panel enters the DOM inside the commit task, and the observer callback
 * is a microtask that runs before the next task and before the next frame's
 * rendering steps — appending the rows there means the FIRST layout/paint
 * already contains them, no matter when React chose to commit (a
 * click-scheduled `requestAnimationFrame` can fire before a late commit and
 * miss the panel entirely). A per-footer capture click listener only hands
 * the clicked footer to the observer, because a portaled panel cannot reach
 * its footer through `closest()`.
 *
 * ## Why the card is pre-lifted
 *
 * `useAnchoredPosition` measures the panel in the mount commit (one row) and
 * repositions through a `ResizeObserver` → `setState`, whose render lands in
 * a task AFTER the next paint: growing the panel by two rows would otherwise
 * paint one frame at the stale `top` (48 px too low) before snapping up —
 * the flash this tweak shipped with. The refill therefore lifts the card by
 * the added height in the same microtask, which is exactly the value the
 * host's own reposition later computes (the dialog hangs from the trigger's
 * top edge, so its bottom edge stays put) — the first paint is already final
 * and the host's write becomes a no-op. Hiding the card until the host
 * repainted was tried and rejected: it turns a correct instant open into a
 * visible late pop for every turn. The shift is skipped when it would push
 * the card above the viewport, the one case where the host keeps a clamped
 * `top`.
 *
 * The panel is found by its stable `data-turn-time-details` marker, and the
 * rows are `<dt>/<dd>` pairs after the duration row — the dialog's own
 * `.details dt/.details dd` element rules style them, and the row labels
 * come from DSH's surviving `chat` vocabulary (`stats.dialog.speed` /
 * `stats.dialog.ttft` / `message.tokensPerSecond` / `duration.seconds`),
 * so the refilled dialog reads exactly like the 0.1.2 one. 0.1.7 renamed the
 * first two from the old `message.turnTime.*` pair; they are otherwise the
 * same words, so the rows still read as the host's own. The rows are
 * plain DOM children of the React-owned `<dl>`: they die with the panel
 * (open/unmount per open), and re-opening re-injects.
 *
 * @module dsh-style-tweaks/client/tweaks/turn-speed-metrics
 */

import { memo, useEffect, useRef } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the Context declaration merges this file reads
// through: the assistant-actions list slot (ui-chat) and the session
// standard props.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveTurnSpeedMetrics } from './assistant-stream-timing.ts'

/** Full props of the actions-row entry (owner + session kit + plugin locale seat). */
type TurnSpeedMetricsProps = PropsRuntime<'conversation.chat.assistant-actions'> & PropsLocale<'style-tweaks'>

/** Sub-turn latency figure: one decimal under ten seconds, whole beyond (ported message-chrome). */
function formatLatencySeconds(ms: number): string {
  const s = Math.max(0, ms) / 1000
  return s < 10 ? String(Math.round(s * 10) / 10) : String(Math.round(s))
}

/** Decode-throughput figure: whole tokens from ten up, one decimal below (ported message-chrome). */
function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

/**
 * The stable marker DSH puts on the turn-time dialog's details grid; the
 * shared observer claims freshly opened panels by it.
 */
const TIME_DETAILS_SELECTOR = '[data-turn-time-details]'
/**
 * Injection claim marker (dataset form: `data-cst-turn-speed-filled`), so one
 * panel is only ever refilled once.
 */
const INJECTED_MARKER = 'cstTurnSpeedFilled'

/** The footer whose time pill opened the dialog now being mounted. */
let pendingFooter: HTMLElement | null = null
/** Per-footer refill, registered while the footer's controller is mounted. */
const refills = new Map<HTMLElement, (panel: HTMLElement) => void>()
/** The one body-wide observer driving every refill. */
let sharedObserver: MutationObserver | null = null

/**
 * The fixed-position dialog card around the portaled panel — the element the
 * host anchors with inline `left`/`top`.
 */
function fixedCardOf(panel: HTMLElement): HTMLElement | null {
  let element = panel.parentElement
  while (element !== null && element !== document.body) {
    if (getComputedStyle(element).position === 'fixed') return element
    element = element.parentElement
  }
  return null
}

/**
 * Lift the card by the height the appended rows added, so its first paint is
 * already at the final position. The dialog hangs from the trigger's top edge
 * (`stat-dialog`: `side: 'top'`), so keeping the card's bottom edge fixed is
 * exactly what the host's own `place()` computes for the taller panel — it
 * only lands through `ResizeObserver` → `setState` one paint later, which is
 * the frame this pre-shift removes. The only case where the host would not
 * move the card is a placement clamped against the viewport (it then keeps
 * the clamped `top`); the shift is skipped when it would push the card past
 * the viewport's top edge, which is that case.
 */
function preLiftCard(card: HTMLElement | null, beforeHeight: number, beforeTop: number): void {
  if (card === null) return
  const delta = card.offsetHeight - beforeHeight
  if (delta <= 0) return
  const target = beforeTop - delta
  if (target >= 0) card.style.top = `${Math.round(target)}px`
}

/**
 * Install the shared body observer (idempotent). Panels are portaled to
 * `<body>`; the microtask callback runs before the next rendering update, so
 * rows appended there are part of the panel's first layout and first paint.
 */
function ensureSharedObserver(): void {
  if (sharedObserver !== null) return
  sharedObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const element = node as Element
        const panel = element.matches(TIME_DETAILS_SELECTOR)
          ? (element as HTMLElement)
          : element.querySelector<HTMLElement>(TIME_DETAILS_SELECTOR)
        if (panel === null || panel.dataset[INJECTED_MARKER] !== undefined) continue
        const footer = pendingFooter
        pendingFooter = null
        if (footer === null) continue
        refills.get(footer)?.(panel)
      }
    }
  })
  sharedObserver.observe(document.body, { childList: true, subtree: true })
}

/**
 * Build the per-turn controller: an invisible anchor in the actions row that
 * hands its footer to the shared observer and refills the opened dialog with
 * the rebuilt 输出速度 / 首 token rows. Renders nothing visible.
 */
function createTurnSpeedMetrics(ctx: ClientContext) {
  // The host chat vocabulary still carries the original row labels; binding
  // it once per mount keeps the refilled dialog textually identical to 0.1.2.
  const hostT = ctx.locale.bind('chat')
  return memo(function TurnSpeedMetrics({ sessionId }: TurnSpeedMetricsProps) {
    const anchorRef = useRef<HTMLSpanElement>(null)
    useEffect(() => {
      const anchor = anchorRef.current
      if (anchor === null) return
      const footer = anchor.closest<HTMLElement>('[data-turn-tail]')
      if (footer === null) return
      const refill = (panel: HTMLElement): void => {
        panel.dataset[INJECTED_MARKER] = 'true'
        const turnText = footer.getAttribute('data-turn-tail')
        const turn = turnText === null ? undefined : Number(turnText)
        if (turn === undefined || !Number.isFinite(turn)) return
        const binding = ctx.sessions.binding(sessionId)
        const window = binding?.eventSource.getSnapshot()
        const metrics = deriveTurnSpeedMetrics(window?.entries ?? [], turn)
        if (metrics === undefined) return
        const rows: Array<[string, string]> = []
        if (metrics.tokensPerSecond !== undefined) {
          rows.push([
            hostT('stats.dialog.speed'),
            hostT('message.tokensPerSecond', { tps: formatTokensPerSecond(metrics.tokensPerSecond) }),
          ])
        }
        if (metrics.ttftMs !== undefined) {
          rows.push([
            hostT('stats.dialog.ttft'),
            hostT('duration.seconds', { seconds: formatLatencySeconds(metrics.ttftMs) }),
          ])
        }
        // A fresh-session turn whose live timing survived already renders its
        // own rows — skip labels the stock dialog shows anyway.
        const existingLabels = new Set(
          Array.from(panel.querySelectorAll('dt'), dt => dt.textContent ?? ''),
        )
        const missing = rows.filter(([label]) => !existingLabels.has(label))
        if (missing.length === 0) return
        // The card hangs above the pill and was measured with the one-row
        // panel; appending two more rows would paint this next frame at that
        // stale `top` and only then snap up. Capture the card's geometry,
        // append, and lift it in the same microtask so the first paint is
        // already final (see `preLiftCard`).
        const card = fixedCardOf(panel)
        const beforeHeight = card === null ? 0 : card.offsetHeight
        const beforeTop = card === null ? 0 : card.getBoundingClientRect().top
        // Insert after the duration row (the grid's first dt/dd pair), in
        // 0.1.2's order: duration, speed, TTFT.
        const insertBefore = panel.children[2] ?? null
        for (const [label, value] of missing) {
          const dt = document.createElement('dt')
          dt.textContent = label
          const dd = document.createElement('dd')
          dd.textContent = value
          panel.insertBefore(dt, insertBefore)
          panel.insertBefore(dd, insertBefore)
        }
        preLiftCard(card, beforeHeight, beforeTop)
      }
      refills.set(footer, refill)
      ensureSharedObserver()
      const onFooterClick = (): void => {
        pendingFooter = footer
      }
      footer.addEventListener('click', onFooterClick, { capture: true })
      return () => {
        footer.removeEventListener('click', onFooterClick, { capture: true })
        refills.delete(footer)
        if (refills.size === 0 && sharedObserver !== null) {
          sharedObserver.disconnect()
          sharedObserver = null
        }
      }
    }, [sessionId])
    return <span ref={anchorRef} hidden />
  })
}

/**
 * Mount the controller: join the actions-row list with an invisible entry.
 * The `slots.inject` controller re-registers across slot re-declarations
 * (chat remounts, HMR) and its disposer removes the entry, restoring the
 * stock dialog behaviour.
 */
export function setupTurnSpeedMetrics(ctx: ClientContext): () => void {
  const disposeEntry = ctx.slots.inject('conversation.chat.assistant-actions', () =>
    ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'turn-speed-metrics',
      locale: 'style-tweaks',
    }, createTurnSpeedMetrics(ctx)))
  return () => {
    disposeEntry()
  }
}
