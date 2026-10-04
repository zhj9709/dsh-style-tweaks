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
 * same `conversation.composer.dock` list-slot cell as the shipped pills, so
 * the plugin re-renders it (a faithful port of the pills and their dialog
 * surface, riding the same projections) and lets the slot system's own
 * shadowing do the replacing: a registration at a lower `priority` wins the
 * cell from the shipped `priority: 0` entry; disposing restores the shipped
 * pills.
 *
 * ## Which cells to claim (0.2.1-alpha.1 split the row)
 *
 * Through 0.2.0 one `stats` entry carried both pills, so this tweak claimed
 * that one cell and re-rendered the pair. 0.2.1-alpha.1 gave each pill its
 * own dock entry — `activity` (counts, speed) and `usage` (tokens, cache
 * hit) — and documents the replacement contract: claim the same id at the
 * same `order` with a lower `priority` (ui-chat README). The cache-hit share
 * only exists in the `usage` pill, so on those hosts the tweak claims that
 * one cell and leaves the shipped activity pill alone: the smallest shadow
 * that does the job, and no second copy of the host's counts/speed logic to
 * drift. `composerStatsCells` reads which generation the host ships.
 *
 * ## Layering with the legacy-stats-line tweak
 *
 * Both tweaks shadow the same cells, so the legacy line registers one
 * priority step lower (`-2`) and wins whenever both are on — whatever this
 * tweak claimed then sits shadowed (unrendered, zero cost) and takes the
 * cell back the moment the legacy line is turned off. On split hosts the
 * line claims `activity` and suppresses `usage` outright (the line carries
 * the token figures itself), so this tweak's `usage` cell is covered there
 * too. The toggle stays visible in Settings either way: the legacy line
 * reads the same flag for its own cache-hit decimals.
 *
 * Fidelity notes: data rides the same durable projections (`sessionStats`,
 * `tokenUsage`) — no window fold, so without the projection the row renders
 * nothing, like the legacy line. The dialog surface and placement reuse
 * DSH's own primitives (`useAnchoredPosition`, `useDismissOnOutsidePointer`)
 * and the ported `stat-dialog` skin, including 0.2.1's outside-CLICK close
 * (see `useStatDialog`), which is what lets a keyboard activation of the
 * sibling pill swap dialogs instead of stacking them. Copy lives in the
 * plugin namespace (`pills.*` keys). The dialog skin is the plugin's own
 * (`cst-pilldlg-*`), so `opaque-stat-dialogs` covers it by name. The row
 * root keeps the `data-composer-stats` marker so pre-0.1.6-alpha.2 hosts'
 * bottom-clearance rule engages exactly as it does for the shipped row
 * (alpha.2 dropped the rule; the attribute is inert there), while the
 * standalone `usage` entry carries `data-composer-stat="usage"` — the
 * per-pill id 0.2.1's shipped pills wear — instead. The row skin follows the
 * dock generation the host ships — see `composer-dock.ts` for the two-skin
 * arrangement.
 *
 * One known divergence, older than the split: 0.2.0's `performanceUsage`
 * preference (`compact` = plain speed and cache-hit readings, no dialogs) is
 * not mirrored — the port renders the detailed pill on every host, which is
 * also what it did while it owned the whole row. DSH's default is `detailed`.
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
import { composerStatsCells, probeComposerDockLayout } from './composer-dock.ts'
import { billedInputTokens, formatCacheHitPercent } from './stats-cache-hit.ts'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

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
 *
 * The close-on-outside-CLICK listener is 0.2.1's own addition: a keyboard
 * activation of a sibling trigger fires `click` without `pointerdown`, so
 * without it two dialogs could stack (on split hosts the sibling pill is the
 * host's, whose seat closes on that click). The capture phase lets this
 * dialog close before the sibling opens.
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
    const onClick = (e: MouseEvent): void => {
      if (e.target instanceof Node
        && rootRef.current?.contains(e.target) !== true
        && panelRef.current?.contains(e.target) !== true) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick, true)
    }
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
function UsagePill({ usage, t, dialog, entry = false }: {
  usage: TokenUsageProjection
  t: PillsTranslate
  dialog: PillDialog
  /**
   * Render as the standalone `usage` dock entry (0.2.1's split pills) rather
   * than as a pill inside this tweak's own row: the root becomes the entry
   * root, so it carries the dock entry's own text tier and its cell id.
   */
  entry?: boolean
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
    <span
      ref={seat.rootRef}
      className={entry ? 'cst-pills-anchor cst-pills-entry' : 'cst-pills-anchor'}
      {...(entry ? { 'data-composer-stat': 'usage' } : {})}
    >
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

/** Full props of either shadowing dock entry (standard kit + plugin locale seat). */
type StatsDockEntryProps = PropsRuntime<'conversation.composer.dock'> & PropsLocale<'style-tweaks'>

/**
 * The 0.1.5 pills row with the cache hit at two decimals. Renders nothing
 * until a figure exists (no projection → no row, like the legacy line).
 */
export const LegacyStatsPills = memo(function LegacyStatsPills({ useProjection, t }: StatsDockEntryProps) {
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

/**
 * The 0.2.1-alpha.1+ `usage` dock cell: the same two-decimal usage pill, as
 * its own entry in the shipped row. Only this pill is replaced there — the
 * cache hit is the one thing the tweak changes, and the `activity` pill
 * carries none of it, so the shipped counts/speed pill stays as it is. The
 * dialog is this entry's own (the shipped split pills work the same way), so
 * opening it is a state change of one entry, not of a shared row slot.
 */
export const UsageDockEntry = memo(function UsageDockEntry({ useProjection, t }: StatsDockEntryProps) {
  const [open, setOpen] = useState(false)
  const usage = useProjection('tokenUsage')
  // Gated on actual token activity, exactly like the shipped pill: a session
  // whose steps all settled without billing shows no usage pill at all.
  if (usage === undefined || (billedInputTokens(usage) === 0 && usage.outputTokens === 0)) return null
  return <UsagePill usage={usage} t={t} entry dialog={{ open, setOpen }} />
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
/* Standalone dock entry (0.2.1-alpha.1's split pills): the row root that
   carries the text tier in the row layout is not in the tree here, and the
   shipped entry root wears the 12/20 tier itself — the entry must match it
   or the two pills under the composer differ by a pixel of type size. */
.cst-pills-entry{font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}
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
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, PILLS_CSS)
  return () => { releaseStyleNode(style, owner) }
}

/**
 * Mount the two-decimal usage pill: inject the ported skin, then claim the
 * host's stats cells (see `composerStatsCells`) — the `usage` cell alone on
 * 0.2.1-alpha.1's split pills, the combined `stats` cell on earlier hosts —
 * at `priority: -1`, one step above the legacy line (which sits at -2 and
 * wins when both tweaks are on). The `slots.inject` controller re-registers
 * across slot re-declarations (composer remounts, HMR) and its disposer
 * restores the shipped pills.
 */
export function setupPillsCacheHitDecimals(ctx: ClientContext): () => void {
  const disposeStyles = installPillsStyles()
  const disposeShadow = ctx.slots.inject('conversation.composer.dock', () => {
    const cells = composerStatsCells(ctx)
    // A split row (more than one cell) keeps its pill-per-cell shape: claim
    // only the `usage` cell and leave `activity` to the host. One cell means
    // the pre-0.2.1 shape, where this tweak owns the whole row — including
    // the degenerate host that ships a single pill cell under an id this
    // plugin does not know: the row still renders both figures, and no cell
    // is left holding a second copy.
    const usage = cells.length > 1 ? cells.find(cell => cell.id === 'usage') : undefined
    if (usage !== undefined) {
      return ctx.slots.register({
        name: 'conversation.composer.dock',
        id: usage.id,
        order: usage.order,
        priority: -1,
        locale: 'style-tweaks',
      }, UsageDockEntry)
    }
    const single = cells[0]
    return ctx.slots.register({
      name: 'conversation.composer.dock',
      id: single.id,
      order: single.order,
      priority: -1,
      locale: 'style-tweaks',
    }, LegacyStatsPills)
  })
  return () => {
    disposeShadow()
    disposeStyles()
  }
}
