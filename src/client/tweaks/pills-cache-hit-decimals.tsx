/**
 * dsh-style-tweaks — pills-cache-hit-decimals tweak.
 *
 * Shows the NEW composer stats presentation (0.1.5's `StatsPills`: the gauge
 * and database pills with their click-open dialogs) with one change: the
 * cache-hit share is formatted with two decimal places (`87.35%`) instead of
 * DSH's integer rounding (`87%`).
 *
 * ## Why the row is re-rendered rather than patched
 *
 * The pills' percent comes from a module-internal formatter in
 * dsh-client-ui-chat — not reachable from a plugin. The row mounts on the
 * same `conversation.composer.dock` list-slot cell as the shipped pills
 * (id `stats`), so the plugin re-renders it (a faithful port of the pills
 * and their dialog surface, riding the same projections) and lets the slot
 * system's own shadowing do the replacing: a registration at `priority: -1`
 * wins the cell from the shipped `priority: 0` entry; disposing restores
 * the shipped pills.
 *
 * ## Layering with the legacy-stats-line tweak
 *
 * Both tweaks shadow the same cell, so the legacy line registers one step
 * lower (`priority: -2`) and wins whenever both are on — the pills row here
 * then sits shadowed (unrendered, zero cost) and takes the cell back the
 * moment the legacy line is turned off. The toggle stays visible in Settings
 * either way: the legacy line reads the same flag for its own cache-hit
 * decimals.
 *
 * Fidelity notes: data rides the same durable projections (`sessionStats`,
 * `tokenUsage`) — no window fold, so without the projection the row renders
 * nothing, like the legacy line. The dialog surface and placement reuse
 * DSH's own primitives (`useAnchoredPosition`, `useDismissOnOutsidePointer`)
 * and the ported `stat-dialog` skin. Copy lives in the plugin namespace
 * (`pills.*` keys). The root keeps the `data-composer-stats` marker so
 * pre-0.1.6-alpha.2 hosts' bottom-clearance rule engages exactly as it does
 * for the shipped row (alpha.2 dropped the rule; the attribute is inert
 * there). The row skin follows the dock generation the host ships — see
 * `composer-dock.ts` for the two-skin arrangement.
 *
 * @module dsh-style-tweaks/client/tweaks/pills-cache-hit-decimals
 */

import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType, type ReactNode, type RefObject } from 'react'
import * as dshPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import {
  IconClockOutlineRegular,
  IconDatabaseOutlineRegular,
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the client-service Context declarations and the
// slot/projection declaration merges this file reads through.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { probeComposerDockLayout } from './composer-dock.ts'
import { billedInputTokens, formatCacheHitPercent } from './stats-cache-hit.ts'

/** The slot machinery's translate seat for the plugin namespace. */
type PillsTranslate = PropsLocale<'style-tweaks'>['t']

/**
 * The gauge icon the shipped pills use. Primitives only gained it in 0.1.3,
 * so it is looked up on the host's primitives at runtime; the clock icon
 * stands in on hosts that predate it. 0.1.7 renamed the 16px artwork from the
 * size suffix to stroke-weight names (`Regular` = 1px, `Medium` = 1.3px), and
 * the shipped pills moved to `IconGaugeOutlineRegular`, so both spellings are
 * probed.
 */
const TimePillIcon = (dshPrimitives as { IconGaugeOutlineRegular?: ComponentType }).IconGaugeOutlineRegular
  ?? (dshPrimitives as { IconGaugeOutline16?: ComponentType }).IconGaugeOutline16
  ?? IconClockOutlineRegular

/** Whole-log figures served by the `sessionStats` projection (see dsh-session-stats). */
interface SessionStats {
  readonly turns: number
  readonly steps: number
  readonly llmMs: number
  readonly toolMs: number
  readonly ttftMs: number
  readonly ttftSteps: number
  readonly decodeMs: number
  readonly decodeTokens: number
}

/**
 * Compact token count: 517 / 12.2K / 1.2M — the shared `number.*` templates,
 * carried in the plugin namespace.
 */
function formatTokens(value: number, t: PillsTranslate): string {
  const scaled = (candidate: number): string => candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('pills.number.thousand', { value: scaled(value / 1_000) })
  return t('pills.number.million', { value: scaled(value / 1_000_000) })
}

/**
 * Exact integer token count with locale-owned digit grouping.
 */
function formatExactTokens(value: number, t: PillsTranslate): string {
  const digits = String(value)
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end))
  }
  return groups.join(t('pills.number.groupSeparator'))
}

/** Compact duration: 45.2s under a minute, 2m42s from there on. */
function formatDuration(ms: number, t: PillsTranslate): string {
  const s = ms / 1_000
  if (s < 60) return t('pills.duration.seconds', { seconds: Math.round(s * 10) / 10 })
  const whole = Math.round(s)
  return t('pills.duration.minutes', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
}

/** Tokens per second without the unit: one decimal below 10, integral above. */
function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

// ── Trigger-anchored stat dialog seat (ported from stat-dialog.ts) ────────

/** Viewport margin the placement clamp keeps (the Menu portal margin). */
const PANEL_MARGIN = 12
/** Distance between the trigger's top edge and the panel's bottom. */
const PANEL_GAP = 8

/**
 * Unplaced portal panel: hidden but laid out so the clamp measures real
 * dimensions (the `useAnchoredPosition` measure pass).
 */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/** External open state one pill's dialog reads and writes (the row's exclusive slot). */
type PillDialog = Pick<StatDialogSeat, 'open' | 'setOpen'>

/** Open state, refs, and clamped placement for one stat dialog. */
interface StatDialogSeat {
  open: boolean
  setOpen: (open: boolean) => void
  rootRef: RefObject<HTMLSpanElement>
  panelRef: RefObject<HTMLDivElement>
  pos: CSSProperties | null
}

/**
 * One trigger-anchored dialog seat: open state, viewport-clamped placement,
 * outside-close (ported verbatim from stat-dialog.ts over the same
 * primitives; the seat does not own state — the row's exclusive slot does).
 */
function useStatDialog(controlled: PillDialog): StatDialogSeat {
  const { open, setOpen } = controlled
  const rootRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const pos = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'top',
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
  })

  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, setOpen])

  return { open, setOpen, rootRef, panelRef, pos }
}

/** Dialog surface with the shared heading + rule, over the ported panel skin. */
function StatDialogPanel({ seat, label, titleIcon, titleValue, rows }: {
  seat: StatDialogSeat
  label: string
  titleIcon: ReactNode
  titleValue?: string
  rows: ReactNode
}): ReactNode {
  return (
    <div
      ref={seat.panelRef}
      className="cst-pilldlg-panel"
      role="dialog"
      aria-label={label}
      style={seat.pos ?? MEASURE_STYLE}
    >
      <div className="cst-pilldlg-title">
        <span className="cst-pilldlg-titleLabel">{titleIcon}{label}</span>
        {titleValue !== undefined && <span className="cst-pilldlg-titleValue">{titleValue}</span>}
      </div>
      <div className="cst-pilldlg-titleRule" aria-hidden />
      <dl className="cst-pilldlg-details">{rows}</dl>
    </div>
  )
}

// ── The two pills (ported from StatsPills.tsx) ────────────────────────────

/** Gauge pill: turn/step counts + output speed; opens the time-and-speed dialog. */
function TimePill({ stats, t, dialog }: {
  stats: SessionStats
  t: PillsTranslate
  dialog: PillDialog
}) {
  const seat = useStatDialog(dialog)
  const counts = t('pills.counts', { turns: stats.turns, steps: stats.steps })
  const tps = stats.decodeMs > 0
    ? t('pills.tokensPerSecond', {
      tps: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000)),
    })
    : null
  const label = (
    <span className="cst-pills-label">
      {counts}
      {tps !== null && (
        <>
          <span className="cst-pills-sep" aria-hidden>·</span>
          {tps}
        </>
      )}
    </span>
  )
  // A window without one timed figure has no dialog rows to show, so the pill
  // stays a plain reading instead of a button opening an empty dialog.
  if (stats.llmMs <= 0 && stats.toolMs <= 0 && stats.ttftSteps <= 0 && stats.decodeMs <= 0) {
    return (
      <span className="cst-pills-anchor">
        <span className="cst-pills-pill">
          <TimePillIcon />
          {label}
        </span>
      </span>
    )
  }
  return (
    <span ref={seat.rootRef} className="cst-pills-anchor">
      <button
        type="button"
        className="cst-pills-pill"
        aria-haspopup="dialog"
        aria-expanded={seat.open}
        aria-label={tps === null ? counts : `${counts} · ${tps}`}
        onClick={() => { seat.setOpen(!seat.open) }}
      >
        <TimePillIcon />
        {label}
      </button>
      {seat.open && (
        <StatDialogPanel
          seat={seat}
          label={t('pills.dialog.title')}
          titleIcon={<TimePillIcon />}
          rows={(
            <>
              {stats.llmMs > 0 && (
                <>
                  <dt>{t('pills.dialog.llmTime')}</dt>
                  <dd>{formatDuration(stats.llmMs, t)}</dd>
                </>
              )}
              {stats.toolMs > 0 && (
                <>
                  <dt>{t('pills.dialog.toolTime')}</dt>
                  <dd>{formatDuration(stats.toolMs, t)}</dd>
                </>
              )}
              {stats.ttftSteps > 0 && (
                <>
                  <dt>{t('pills.dialog.ttft')}</dt>
                  <dd>{formatDuration(stats.ttftMs / stats.ttftSteps, t)}</dd>
                </>
              )}
              {stats.decodeMs > 0 && (
                <>
                  <dt>{t('pills.dialog.speed')}</dt>
                  <dd>{t('pills.tokensPerSecond', {
                    tps: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000)),
                  })}</dd>
                </>
              )}
            </>
          )}
        />
      )}
    </span>
  )
}

/** Database pill: total tokens + cache hit at two decimals; opens the usage dialog. */
function UsagePill({ usage, t, dialog }: {
  usage: TokenUsageProjection
  t: PillsTranslate
  dialog: PillDialog
}) {
  const seat = useStatDialog(dialog)
  const billed = billedInputTokens(usage)
  const total = billed + usage.outputTokens
  const totalText = t('pills.turnUsage.count', { count: formatTokens(total, t) })
  // The one change vs. the shipped pills: the cache hit at two decimals
  // (the honesty tail below a would-be-full hit keeps its extra digit).
  const cacheHit = formatCacheHitPercent(usage.cacheReadTokens, billed, 2)
  const cacheHitText = cacheHit !== null ? t('pills.cacheHit', { percent: cacheHit }) : null
  const exactCount = (value: number): string => t('pills.turnUsage.count', { count: formatExactTokens(value, t) })
  return (
    <span ref={seat.rootRef} className="cst-pills-anchor">
      <button
        type="button"
        className="cst-pills-pill"
        aria-haspopup="dialog"
        aria-expanded={seat.open}
        aria-label={cacheHitText === null ? totalText : `${totalText} · ${cacheHitText}`}
        onClick={() => { seat.setOpen(!seat.open) }}
      >
        <IconDatabaseOutlineRegular />
        <span className="cst-pills-label">
          {totalText}
          {cacheHitText !== null && (
            <>
              <span className="cst-pills-sep" aria-hidden>·</span>
              {cacheHitText}
            </>
          )}
        </span>
      </button>
      {seat.open && (
        <StatDialogPanel
          seat={seat}
          label={t('pills.dialog.usageTitle')}
          titleIcon={<IconDatabaseOutlineRegular />}
          titleValue={exactCount(total)}
          rows={(
            <>
              {cacheHit !== null && (
                <>
                  <dt>{t('pills.turnUsage.cacheHit')}</dt>
                  <dd>{`${cacheHit}%`}</dd>
                </>
              )}
              <dt>{t('pills.turnUsage.input')}</dt>
              <dd>{exactCount(usage.uncachedInputTokens)}</dd>
              <dt>{t('pills.turnUsage.cacheRead')}</dt>
              <dd>{exactCount(usage.cacheReadTokens)}</dd>
              <dt>{t('pills.turnUsage.cacheWrite')}</dt>
              <dd>{exactCount(usage.cacheWriteTokens)}</dd>
              <dt>{t('pills.turnUsage.output')}</dt>
              <dd>{exactCount(usage.outputTokens)}</dd>
            </>
          )}
        />
      )}
    </span>
  )
}

/** Full props of the shadowing dock entry (standard kit + plugin locale seat). */
type LegacyStatsPillsProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'style-tweaks'>

/**
 * The 0.1.5 pills row with the cache hit at two decimals. Renders nothing
 * until a figure exists (no projection → no row, like the legacy line).
 */
export const LegacyStatsPills = memo(function LegacyStatsPills({ useProjection, t }: LegacyStatsPillsProps) {
  const stats = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')
  // One exclusive slot for both dialogs: opening either pill closes the other.
  const [openPill, setOpenPill] = useState<'time' | 'usage' | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Gate the dock-generation skin attribute before first paint (composer-dock.ts).
  useLayoutEffect(() => {
    probeComposerDockLayout(rootRef.current)
  }, [])
  // Gated on actual token activity: a session whose steps all settled without
  // billing (e.g. every request failed) shows its counts without a usage pill.
  const hasTokens = usage !== undefined
    && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)
  if ((stats === undefined || stats.steps === 0) && !hasTokens) return null
  return (
    <div ref={rootRef} className="cst-pills-root" data-composer-stats>
      {stats !== undefined && stats.steps > 0 && (
        <TimePill
          stats={stats}
          t={t}
          dialog={{
            open: openPill === 'time',
            setOpen: (open) => { setOpenPill(open ? 'time' : null) },
          }}
        />
      )}
      {hasTokens && usage !== undefined && (
        <UsagePill
          usage={usage}
          t={t}
          dialog={{
            open: openPill === 'usage',
            setOpen: (open) => { setOpenPill(open ? 'usage' : null) },
          }}
        />
      )}
    </div>
  )
})

// ── Row + dialog skin (ported from StatsPills.module.css / stat-dialog.module.css) ──

/**
 * Base rules port the 0.1.6-alpha.2 shipped `.root` verbatim: a content-sized
 * flex item inside the host's centered dock wrapper (which owns the 4px top
 * clearance; the composer root's bottom pad is a fixed 4px there), so the
 * row brings no vertical padding and the dock's height stays at the context
 * capsule's 22px whatever renders inside. The `[data-cst-dock-legacy]`
 * branch restores the pre-alpha.2 skin — full-column centered block with a
 * 4px top pad, riding the host's `.root:has([data-composer-stats])`
 * bottom-clearance tightening — so toggle-height parity holds on those
 * hosts exactly as before.
 */
const PILLS_CSS = `
.cst-pills-root{display:flex;justify-content:center;gap:12px;min-width:0;max-width:100%;box-sizing:border-box;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}
.cst-pills-root[data-cst-dock-legacy]{width:100%;max-width:var(--dsh-chat-content-width,748px);margin:0 auto;padding:4px calc(var(--dsh-composer-side-clearance,16px) + 16px) 0}
.cst-pills-anchor{display:inline-flex;min-width:0}
.cst-pills-pill{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;max-width:100%;padding:1px 8px;border:none;border-radius:24px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap}
.cst-pills-pill svg{width:14px;height:14px;flex:none}
button.cst-pills-pill{cursor:pointer}
button.cst-pills-pill:hover,button.cst-pills-pill[aria-expanded='true']{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.cst-pills-label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.cst-pills-sep{color:var(--dsw-alias-separator-primary);margin:0 6px}
.cst-pilldlg-panel{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(300px,calc(100vw - 24px));max-width:min(440px,calc(100vw - 24px));padding:16px;border:0;border-radius:12px;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:default}
.cst-pilldlg-title{display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary);font-weight:500}
.cst-pilldlg-titleRule{margin-bottom:10px;border-top:.5px solid var(--dsw-alias-border-l2)}
.cst-pilldlg-titleValue{font-variant-numeric:tabular-nums}
.cst-pilldlg-titleLabel{display:inline-flex;align-items:center;gap:6px;min-width:0}
.cst-pilldlg-titleLabel svg{width:14px;height:14px;flex:none}
.cst-pilldlg-details{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--dsw-alias-label-tertiary)}
.cst-pilldlg-details dt,.cst-pilldlg-details dd{min-width:0;margin:0}
.cst-pilldlg-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}
`

function installPillsStyles(): () => void {
  const id = 'dsh-style-tweaks-pills-decimals'
  let style = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.plugin = 'dsh-style-tweaks'
    style.dataset.pluginCss = id
    style.textContent = PILLS_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}

/**
 * Mount the two-decimal pills row: inject the ported skin, then shadow the
 * shipped `stats` dock entry one priority step above the legacy line (which
 * sits at -2 and wins when both tweaks are on). The `slots.inject`
 * controller re-registers across slot re-declarations and its disposer
 * restores the shipped pills.
 */
export function setupPillsCacheHitDecimals(ctx: ClientContext): () => void {
  const disposeStyles = installPillsStyles()
  const disposeShadow = ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'stats',
      priority: -1,
      locale: 'style-tweaks',
    }, LegacyStatsPills))
  return () => {
    disposeShadow()
    disposeStyles()
  }
}
