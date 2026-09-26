/**
 * dsh-style-tweaks — turn-time-pill tweak.
 *
 * DSH through 0.1.6 printed two stat pills at the end of a settled turn, right
 * of the branch action: the usage pill and the time pill, each click-opening
 * its own dialog ("本轮用量" / "本轮用时和速度"). 0.1.7-alpha.1's
 * performance-and-usage preference commit (`feat(ui-chat): add performance and
 * usage display preference`) dropped the time half: `TurnTimePanel` went away,
 * the tail's `usageAction` prop lost its sibling, and `message.ranFor` plus the
 * whole `message.turnTime.*` group left the `chat` vocabulary. This tweak puts
 * the pill back — its seat, its label, and its dialog with all three rows.
 *
 * ## Where the pill comes from
 *
 * The tail's action row is host-rendered chrome, not a slot, so the pill is
 * mounted the only way a plugin can reach inside it: an entry on the
 * `conversation.chat.assistant-actions` list slot (whose list renders between
 * the copy and branch controls) provides an invisible anchor, and the visible
 * pill is portaled from that anchor into the row's own trailing cluster — the
 * span the host wraps `usageAction` and the clock in, found structurally as
 * the last child of the row marked `data-clock="end"`.
 *
 * The portal lands last in that cluster, so two rules restore the 0.1.6
 * seating: the clock (the cluster's `_timeEnd` span — the one element the
 * portal follows) is ordered after the pill, and the 8px flex gap against the
 * usage pill is rebated by 6px, which is 0.1.6's own `.root + .root` pairing
 * (there the two pills were siblings of one flat row). The row then reads
 * usage → time → clock, exactly the cluster 0.1.6 printed, and CSS `order`
 * keeps that placement stable no matter how React inserts the host's own
 * children. A cluster without the usage pill keeps the plain 8px rhythm (the
 * rebate is scoped to a preceding element that is not the clock); one without
 * a clock ends with the pill.
 *
 * ## Where the figures come from
 *
 * 0.1.6 read the three figures off the Chat snapshot's turn location
 * (`turn.end.time - turn.start.time`) and the node's in-memory timing. Neither
 * survives in 0.1.7's node data, so the tweak folds them out of the session
 * event window instead, which is also the only feed that makes them durable:
 * `deriveTurnRunMs` over `turn/start` → `turn/end` for the wall time, and
 * `deriveTurnSpeedMetrics` over the settlements' embedded model streams for
 * output speed and TTFT (see `assistant-stream-timing.ts`, the consumer the
 * session-format-v2 architecture note anticipates). History loads therefore
 * show the same figures a live session did. The tail only exists for a settled
 * turn, so the values are final; a turn whose `turn/end` has not landed in the
 * window yet (or was evicted) is watched for through the source's own
 * subscription and the pill appears the moment the wall time does. When the
 * window holds no start for the turn, the pill renders nothing — the stock
 * row, exactly as 0.1.7 ships it.
 *
 * ## Dialog
 *
 * The dialog is this module's own port of the host's stat-dialog seat: the
 * same public primitives the host itself uses (`useAnchoredPosition` for the
 * clamped above-the-trigger placement, `useDismissOnOutsidePointer` for
 * outside-pointer dismissal) plus the Escape handler, over a ported copy of
 * the shared surface skin and of 0.1.6's `TurnTimePanel` markup, down to its
 * `data-turn-time-details` marker. Rows appear only when their figure is
 * known: a turn whose settlement stream carries no token keeps just the
 * duration row, as 0.1.6 did. Nothing is appended after the panel mounts, so
 * the dialog is measured — and painted — at its final height.
 *
 * ## Selector safety
 *
 * Every hook is structural: the footer by `data-turn-tail`, the row by
 * `data-clock="end"`, the cluster as that row's last element child, the clock
 * by the host's `timeEnd` class suffix, the dialog grid by
 * `data-turn-time-details`. The pill's own classes are namespaced
 * (`cst-ttp-*`). Host builds without the tail attributes leave the tweak
 * inert; a host that renames `timeEnd` degrades to the pill simply ending the
 * row.
 *
 * @module dsh-style-tweaks/client/tweaks/turn-time-pill
 */

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconClockOutlineRegular, useAnchoredPosition, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the Context declaration merges this file reads
// through: the assistant-actions list slot (ui-chat) and the session
// standard props.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveTurnRunMs, deriveTurnSpeedMetrics } from './assistant-stream-timing.ts'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

/** Full props of the actions-row entry (owner + session kit + plugin locale seat). */
type TurnTimePillProps = PropsRuntime<'conversation.chat.assistant-actions'> & PropsLocale<'style-tweaks'>

/** The host `chat` vocabulary, which still carries the duration templates. */
type ChatTranslate = TranslateNS<'chat'>

/** A settled turn's figures: its wall time plus whatever the log can rebuild. */
interface TurnStats {
  /** `turn/start` → `turn/end` delta, the pill's label. */
  readonly runMs: number
  /** Turn decode throughput, a dialog row when known. */
  readonly tokensPerSecond?: number | undefined
  /** First-step TTFT in ms, a dialog row when known. */
  readonly ttftMs?: number | undefined
}

/** Two-digit unit padding for the minute/second fields (ported from the host). */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/**
 * Localized elapsed-time label, ported verbatim from 0.1.6's `message-chrome`:
 * whole seconds below a minute, minutes and seconds from a minute on, hours
 * with the smaller units zero-padded from an hour on.
 * @param ms - Elapsed duration in milliseconds (negatives clamp to zero).
 * @param t - Translate seat over the host `chat` vocabulary.
 * @returns The duration text, e.g. `1分12秒` / `1h 02m 03s`.
 */
function formatRunDuration(ms: number, t: ChatTranslate): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  if (hours > 0) {
    return t('duration.hours', { hours, minutes: pad2(minutes), seconds: pad2(seconds) })
  }
  return minutes > 0
    ? t('duration.minutes', { minutes, seconds: pad2(seconds) })
    : t('duration.seconds', { seconds })
}

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
 * The ported pill and dialog skin: 0.1.6's `TurnUsagePanel.module.css` trigger
 * geometry (so the restored pill measures exactly like the usage pill beside
 * it, including the pair's padding rebate and the narrow-viewport collapse)
 * over 0.1.7's `stat-dialog.module.css` surface, plus the two cluster rules
 * that seat the pill between the usage pill and the clock.
 */
const TURN_TIME_PILL_CSS = `
.cst-ttp-root{display:inline-flex;min-width:0}
[class$="_endInfo"] > [class$="_timeEnd"]{order:1}
[class$="_endInfo"] > *:not([class$="_timeEnd"]) ~ .cst-ttp-root{margin-left:-6px}
.cst-ttp-trigger{display:inline-flex;align-items:center;gap:4px;min-width:0;height:calc(28px + var(--dsh-content-font-delta,0px));padding:6px 8px;border:none;border-radius:28px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);font-variant-numeric:tabular-nums;line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:nowrap;cursor:pointer}
.cst-ttp-trigger:hover,.cst-ttp-trigger[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}
.cst-ttp-trigger svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px));flex:none}
.cst-ttp-label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.cst-ttp-panel{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(300px,calc(100vw - 24px));max-width:min(440px,calc(100vw - 24px));padding:16px;border:0;border-radius:12px;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:default}
.cst-ttp-title{display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary);font-weight:500}
.cst-ttp-titleLabel{display:inline-flex;align-items:center;gap:6px;min-width:0}
.cst-ttp-titleLabel svg{width:14px;height:14px;flex:none}
.cst-ttp-rule{margin-bottom:10px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.cst-ttp-details{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--dsw-alias-label-tertiary)}
.cst-ttp-details dt,.cst-ttp-details dd{min-width:0;margin:0}
.cst-ttp-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}
@media (max-width:480px){.cst-ttp-trigger{justify-content:center;width:calc(28px + var(--dsh-content-font-delta,0px));padding:6px}.cst-ttp-label{display:none}[class$="_endInfo"] > *:not([class$="_timeEnd"]) ~ .cst-ttp-root{margin-left:0}}
`

/** Install the ported skin (idempotent). */
function installTurnTimePillStyles(): () => void {
  const id = 'dsh-style-tweaks-turn-time-pill'
  let style = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.plugin = 'dsh-style-tweaks'
    style.dataset.pluginCss = id
    style.textContent = TURN_TIME_PILL_CSS
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style)
  return () => { releaseStyleNode(style, owner) }
}

/**
 * Unplaced portal panel: hidden but laid out so the clamp measures real
 * dimensions (the host's own first-paint measure pass).
 */
const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 } as const

/** Viewport margin the placement clamp keeps (the host's stat-dialog value). */
const PANEL_MARGIN = 12
/** Distance between the trigger's top edge and the panel's bottom. */
const PANEL_GAP = 8

/** Open state, refs and clamped placement for one pill dialog (ported seat). */
function usePillDialog() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Same placement and dismissal rules as the host's stat dialogs, through the
  // same public primitives: fixed above the trigger, clamped into the
  // viewport, re-placed on scroll/resize while open.
  const pos = useAnchoredPosition({
    open, anchorRef: rootRef, panelRef, side: 'top', gap: PANEL_GAP, margin: PANEL_MARGIN,
  })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])
  return { open, setOpen, rootRef, panelRef, pos }
}

/**
 * The restored time pill: a clock glyph plus the turn's wall time, click-opening
 * the ported 本轮用时和速度 dialog.
 * @param props - The turn's figures, the host vocabulary seat, the plugin seat.
 * @returns The trigger and, while open, its portaled dialog above the trigger.
 */
function TurnTimePillButton({ stats, hostT, t }: {
  stats: TurnStats
  hostT: ChatTranslate
  t: TurnTimePillProps['t']
}) {
  const { open, setOpen, rootRef, panelRef, pos } = usePillDialog()
  const duration = formatRunDuration(stats.runMs, hostT)
  const title = t('tweak.turnTimePill.pillTitle')
  return (
    <span ref={rootRef} className="cst-ttp-root">
      <button
        type="button"
        className="cst-ttp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <IconClockOutlineRegular />
        <span className="cst-ttp-label">{t('tweak.turnTimePill.label', { duration })}</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="cst-ttp-panel"
          role="dialog"
          aria-label={title}
          style={pos ?? MEASURE_STYLE}
        >
          <div className="cst-ttp-title">
            <span className="cst-ttp-titleLabel">
              <IconClockOutlineRegular />
              {title}
            </span>
          </div>
          <div className="cst-ttp-rule" aria-hidden />
          {/* 0.1.6's own grid and marker, with the same row order and the same
              "only when known" rule: a turn whose settlement stream carries no
              token keeps the duration row alone. The labels come from this
              plugin's seat because the host's surviving pair is worded for the
              composer's whole-session dialog (`stats.dialog.ttft` reads
              "首 token 平均（TTFT）", an average that does not hold for one
              turn); the values keep the host's surviving unit templates. */}
          <dl className="cst-ttp-details" data-turn-time-details>
            <dt>{t('tweak.turnTimePill.duration')}</dt>
            <dd>{duration}</dd>
            {stats.tokensPerSecond !== undefined && (
              <>
                <dt>{t('tweak.turnTimePill.speed')}</dt>
                <dd>{hostT('message.tokensPerSecond', { tps: formatTokensPerSecond(stats.tokensPerSecond) })}</dd>
              </>
            )}
            {stats.ttftMs !== undefined && (
              <>
                <dt>{t('tweak.turnTimePill.ttft')}</dt>
                <dd>{hostT('duration.seconds', { seconds: formatLatencySeconds(stats.ttftMs) })}</dd>
              </>
            )}
          </dl>
        </div>,
        document.body,
      )}
    </span>
  )
}

/**
 * The row's trailing cluster: the span the host wraps the usage pill and the
 * clock in — the last element child of the actions row, which the host marks
 * with `data-clock="end"` on assistant tails.
 * @param anchor - This entry's invisible anchor inside that row.
 * @returns The cluster to portal into, or the row itself when it has no child.
 */
function trailingClusterOf(anchor: HTMLElement): HTMLElement | null {
  const row = anchor.closest<HTMLElement>('[data-clock="end"]')
  if (row === null) return null
  const last = row.lastElementChild
  return last instanceof HTMLElement ? last : row
}

/**
 * Build the per-turn cell: an invisible anchor that hands the visible pill to
 * the row's trailing cluster and folds the turn's figures out of the session
 * event window. Renders the pill only once both are known.
 */
function createTurnTimePill(ctx: ClientContext) {
  const hostT = ctx.locale.bind('chat')
  return memo(function TurnTimePill({ sessionId, t }: TurnTimePillProps) {
    const anchorRef = useRef<HTMLSpanElement | null>(null)
    const [cluster, setCluster] = useState<HTMLElement | null>(null)
    const [stats, setStats] = useState<TurnStats | undefined>(undefined)

    // The anchor sits in the row React just rendered, so the cluster is
    // resolvable in the same commit — before the browser paints.
    useLayoutEffect(() => {
      const anchor = anchorRef.current
      setCluster(anchor === null ? null : trailingClusterOf(anchor))
    }, [])

    useEffect(() => {
      const anchor = anchorRef.current
      const footer = anchor?.closest<HTMLElement>('[data-turn-tail]') ?? null
      const raw = footer?.getAttribute('data-turn-tail') ?? null
      const turn = raw === null ? undefined : Number(raw)
      if (turn === undefined || !Number.isFinite(turn)) return
      const source = ctx.sessions.binding(sessionId)?.eventSource
      if (source === undefined) return
      let stop: (() => void) | undefined
      // The wall time is the gate: it is what the pill needs to exist at all,
      // and the settlements the other two figures come from always precede
      // the `turn/end` that resolves it.
      const derive = (): boolean => {
        const entries = source.getSnapshot().entries
        const runMs = deriveTurnRunMs(entries, turn)
        if (runMs === undefined) return false
        const metrics = deriveTurnSpeedMetrics(entries, turn)
        setStats({ runMs, tokensPerSecond: metrics?.tokensPerSecond, ttftMs: metrics?.ttftMs })
        return true
      }
      if (derive()) return
      // This turn's `turn/end` may not have reached the window yet: watch the
      // feed until the figure lands, then stop — a settled turn never changes.
      stop = source.subscribe(() => {
        if (!derive()) return
        stop?.()
        stop = undefined
      })
      return () => { stop?.() }
    }, [sessionId])

    return (
      <>
        <span ref={anchorRef} hidden />
        {cluster !== null && stats !== undefined
          ? createPortal(<TurnTimePillButton stats={stats} hostT={hostT} t={t} />, cluster)
          : null}
      </>
    )
  })
}

/**
 * Mount the tweak: inject the ported skin, then register the cell on the
 * assistant-actions list slot. The `slots.inject` controller re-registers
 * across slot re-declarations (chat remounts, HMR) and its disposer removes
 * the entry and the skin, restoring the stock 0.1.7 tail.
 */
export function setupTurnTimePill(ctx: ClientContext): () => void {
  const disposeStyles = installTurnTimePillStyles()
  const disposeEntry = ctx.slots.inject('conversation.chat.assistant-actions', () =>
    ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'turn-time-pill',
      locale: 'style-tweaks',
    }, createTurnTimePill(ctx)))
  return () => {
    disposeEntry()
    disposeStyles()
  }
}
