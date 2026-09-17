/**
 * dsh-style-tweaks — legacy-stats-line tweak.
 *
 * Restores the composer stats presentation DSH shipped through
 * 0.1.2-rc.1 (`StatsLine`): one centered, pipe-separated text line under the
 * composer card — turn/step counts, LLM and tool wall times, TTFT average,
 * output speed, cache hit, and input/output tokens — truncating with an
 * ellipsis and revealing the full line in a hover tooltip. 0.1.5-alpha.1
 * replaced that line with icon pills that open dialogs (`StatsPills`);
 * this tweak mounts the old presentation back on top of the new one.
 * 0.1.6-alpha.2 then moved the dock output into a centered flex row beside
 * the new ContextMeter capsule (the context pill); the row skins adapt to
 * both dock generations at mount time (see `composer-dock.ts`).
 *
 * ## Why slot shadowing
 *
 * Both presentations mount the same way: a `list` entry on the
 * `conversation.composer.dock` slot under the id `stats`. A list cell
 * renders its lowest-priority live entry (see `SlotCore.register`), so
 * re-registering `id: 'stats'` at `priority: -2` shadows the shipped pills
 * for exactly as long as the registration lives; disposing it hands the
 * cell straight back — no CSS hiding, no DOM patching, and a crashed entry
 * retires itself so the pills reappear. The `pills-cache-hit-decimals`
 * tweak shadows the same cell one step higher (`-1`), so with both tweaks
 * on, this line wins; that row then sits shadowed (unrendered) and takes
 * the cell back when this tweak is turned off.
 *
 * ## Data plane
 *
 * The same durable projections the pills read: `sessionStats`
 * (whole-log turn/step counts and wall times) and `tokenUsage` (billing
 * buckets), so every figure matches the new UI. The old component's
 * whole-window fallback fold (`deriveStats`, for assemblies without the
 * session-stats unit) is dropped: without the projection the line renders
 * nothing, matching the old line's "no data, no row" rule.
 *
 * The cache-hit share follows the `pillsCacheHitDecimals` setting — two
 * decimals while it is on, DSH's integer rounding while off. The flag is
 * captured when the tweak mounts; any settings change remounts every tweak
 * (the live-sync effect), so the line always renders with the current value.
 *
 * Copy lives in the plugin's own locale namespace (`style-tweaks`,
 * `legacyStats.*` keys) — DSH removed the old `stats.llm` family from its
 * dictionaries in 0.1.5, so the plugin carries its own.
 *
 * @module dsh-style-tweaks/client/tweaks/legacy-stats-line
 */

import { Fragment, memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the client-service Context declarations and the
// slot/projection declaration merges this file reads through.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { probeComposerDockLayout } from './composer-dock.ts'
import { billedInputTokens, formatCacheHitPercent } from './stats-cache-hit.ts'

/** The slot machinery's translate seat for the plugin namespace. */
type LegacyTranslate = PropsLocale<'style-tweaks'>['t']

/**
 * Compact token count: 517 / 12.2K / 1.2M — the shared `number.*` templates,
 * carried in the plugin namespace so the line does not lean on the host's
 * common vocabulary.
 */
function formatTokens(value: number, t: LegacyTranslate): string {
  const scaled = (candidate: number): string => candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('legacyStats.number.thousand', { value: scaled(value / 1_000) })
  return t('legacyStats.number.million', { value: scaled(value / 1_000_000) })
}

/** Compact duration: 45.2s under a minute, 2m42s from there on. */
function formatDuration(ms: number, t: LegacyTranslate): string {
  const s = ms / 1_000
  if (s < 60) return t('legacyStats.duration.seconds', { seconds: Math.round(s * 10) / 10 })
  const whole = Math.round(s)
  return t('legacyStats.duration.minutes', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
}

/**
 * Tokens per second without the unit: one decimal below 10, integral above.
 */
function formatTokensPerSecond(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}

/** Truncating stats row: the pipe-separated line, with the full text as a hover tooltip. */
const StatsRow = memo(function StatsRow({ groups, line }: {
  readonly groups: readonly string[]
  readonly line: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [truncated, setTruncated] = useState(false)
  const measure = useCallback(() => {
    const el = rootRef.current
    if (el === null) return
    const next = el.scrollWidth > el.clientWidth
    setTruncated(current => current === next ? current : next)
  }, [])
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [measure])
  useLayoutEffect(measure, [line, measure])
  // Which dock the host ships decides the skin: a column-flex parent means
  // this row hangs directly under the composer card (pre-0.1.6-alpha.2,
  // where it must self-pad and span the column); a row flex container is
  // alpha.2's `.dock` wrapper (padded and centered by the host). Gated
  // before first paint, so the skin never flashes.
  useLayoutEffect(() => {
    probeComposerDockLayout(rootRef.current)
  }, [])
  return (
    <Tooltip label={line} side="top" delayMs={500} disabled={!truncated}>
      {/* data-composer-stats: pre-0.1.6-alpha.2 hosts tighten their InputBar's
          own 8px bottom clearance to 4px around any mounted stats row
          (`.root:has([data-composer-stats])`) — without the marker the
          composer keeps 8px and toggling the tweak shifts the column by 2px.
          alpha.2 dropped that rule (its root carries a fixed 4px bottom pad),
          where the attribute is inert. The row's vertical padding lives in
          the `[data-cst-dock-legacy]` branch only: the alpha.2 dock wrapper
          owns the 4px top clearance, and the row must bring none of its own. */}
      <div ref={rootRef} className="cst-legacy-stats" data-composer-stats>
        {groups.map((group, i) => (
          <Fragment key={group}>
            {i > 0 && <><span className="cst-legacy-stats-sep" aria-hidden>|</span>{' '}</>}
            <span>{group}</span>
          </Fragment>
        ))}
      </div>
    </Tooltip>
  )
})

/**
 * Full props of the shadowing dock entry: the standard kit, the plugin
 * locale seat, and the registration's injected business face (`twoDecimals`
 * is the `pillsCacheHitDecimals` setting; see the module doc).
 */
type LegacyStatsLineProps = PropsRuntime<'conversation.composer.dock'>
  & PropsLocale<'style-tweaks'>
  & { readonly twoDecimals: boolean }

/**
 * The 0.1.2-rc.1 stats line over the durable projections. Renders nothing
 * until a figure exists, and drops a group whole when its data is absent.
 * `twoDecimals` bakes the cache-hit precision in, arriving through the
 * entry's inject face (driven by the `pillsCacheHitDecimals` setting).
 */
export const LegacyStatsLine = memo(function LegacyStatsLine({
  useProjection,
  t,
  twoDecimals,
}: LegacyStatsLineProps) {
  const stats = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')

  // Pipe-separated groups (figma stats strip); a group with no data drops out whole.
  const groups: string[] = []
  if (stats !== undefined && stats.steps > 0) {
    groups.push(t('legacyStats.counts', { turns: stats.turns, steps: stats.steps }))
    const durations: string[] = []
    if (stats.llmMs > 0) durations.push(t('legacyStats.llm', { duration: formatDuration(stats.llmMs, t) }))
    if (stats.toolMs > 0) durations.push(t('legacyStats.toolCall', { duration: formatDuration(stats.toolMs, t) }))
    if (durations.length > 0) groups.push(durations.join(' · '))
    const speeds: string[] = []
    if (stats.ttftSteps > 0) {
      speeds.push(t('legacyStats.ttftAverage', { duration: formatDuration(stats.ttftMs / stats.ttftSteps, t) }))
    }
    if (stats.decodeMs > 0) {
      speeds.push(t('legacyStats.tokensPerSecond', {
        throughput: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1_000)),
      }))
    }
    if (speeds.length > 0) groups.push(speeds.join(' · '))
  }
  // Billing rides the durable projection, so these survive paging and
  // compaction. Gated on actual token activity: a session whose steps all
  // settled without billing (e.g. every request failed) shows its counts
  // without a zero-token group.
  if (usage !== undefined && (billedInputTokens(usage) > 0 || usage.outputTokens > 0)) {
    const cacheHit = formatCacheHitPercent(usage.cacheReadTokens, billedInputTokens(usage), twoDecimals ? 2 : 0)
    if (cacheHit !== null) groups.push(t('legacyStats.cacheHit', { percent: cacheHit }))
    groups.push(t('legacyStats.tokens', {
      input: formatTokens(billedInputTokens(usage), t),
      output: formatTokens(usage.outputTokens, t),
    }))
  }
  if (groups.length === 0) return null
  return <StatsRow groups={groups} line={groups.join(' | ')} />
})

/**
 * Row skin, ported from 0.1.2-rc.1's `StatsLine.module.css`: 13/20 tertiary
 * text under the composer. Base rules are the 0.1.6-alpha.2 dock skin — a
 * content-sized flex item inside the host's centered dock wrapper, which
 * owns the 4px top clearance and the fixed 4px root bottom pad, so the row
 * brings no vertical padding and the dock's height stays at the capsule's
 * 22px whatever renders inside. The `[data-cst-dock-legacy]` branch
 * restores the pre-alpha.2 skin: a full-column centered block with the row
 * carrying 4px top + 2px bottom pads so its total matches the pills row's
 * 22px pill box (26px row + 4px host clearance on both sides of the
 * toggle). Token fallbacks keep the row readable if a host build renames a
 * token.
 */
const LEGACY_STATS_CSS = `
.cst-legacy-stats{display:block;max-width:min(var(--dsh-chat-content-width,748px),100%);min-width:0;box-sizing:border-box;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cst-legacy-stats[data-cst-dock-legacy]{width:100%;margin:0 auto;text-align:center;padding:4px calc(var(--dsh-composer-side-clearance,16px) + 16px) 2px}
.cst-legacy-stats-sep{color:var(--dsw-alias-separator-primary);margin:0 10px}
`

function installLegacyStatsStyles(): () => void {
  const id = 'dsh-style-tweaks-legacy-stats'
  let style = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.plugin = 'dsh-style-tweaks'
    style.dataset.pluginCss = id
    style.textContent = LEGACY_STATS_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}

/**
 * Mount the legacy line: inject the row skin, then shadow the shipped
 * `stats` dock entry (same id; the lowest live priority in the cell renders,
 * and `-2` also outranks the pills-cache-hit-decimals row at `-1` when both
 * tweaks are on). `twoDecimals` is the `pillsCacheHitDecimals` setting,
 * passed through the registration's inject face — the live-sync effect
 * remounts every tweak on any settings change, so the registration (and the
 * flag with it) always reflects the current value. The `slots.inject`
 * controller re-registers across slot re-declarations (composer remounts,
 * HMR) and its disposer restores the shipped pills.
 */
export function setupLegacyStatsLine(ctx: ClientContext, twoDecimals: boolean): () => void {
  const disposeStyles = installLegacyStatsStyles()
  const disposeShadow = ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'stats',
      priority: -2,
      locale: 'style-tweaks',
      inject: () => ({ twoDecimals }),
    }, LegacyStatsLine))
  return () => {
    disposeShadow()
    disposeStyles()
  }
}
