/**
 * dsh-style-tweaks — legacy-context-meter tweak.
 *
 * 0.1.6-alpha.2 moved the composer's context meter (ContextMeter) out of the
 * input card: the ring-and-percent capsule now sits in a new `.dock` wrapper
 * BELOW the card, next to the composer stats row. This tweak restores the
 * pre-alpha.2 presentation: a 28px circular ring button inside the card's
 * trailing toolbar row — between the model chip and the stop/send cluster,
 * exactly where alpha.1 rendered it — with the hover reading and the
 * click-open context breakdown intact.
 *
 * ## Why the meter is re-rendered rather than moved
 *
 * The native capsule is a React-owned node. Moving it into the toolbar row
 * with plain DOM operations desynchronizes React's host-sibling bookkeeping:
 * when the slot machinery later commits a node into the `.dock` wrapper, it
 * picks its `insertBefore` reference by walking the fiber tree
 * (`getHostSibling`) — not the DOM — and the insertion does not verify that
 * the reference is still a child of the container. A stats row mounting at
 * that moment would throw NotFoundError inside the commit and take the whole
 * app down. The plugin therefore does what `pills-cache-hit-decimals` does:
 * it renders its own faithful port of the alpha.1 meter on the
 * `conversation.input.right` list slot — a cell inside `.trailing`, in
 * normal flex flow, wrapping and reflowing exactly like the native ring
 * always did — and hides the dock capsule with one CSS rule. React never
 * sees a moved node.
 *
 * ## Host gating
 *
 * The port rides the same `contextPressure` / `contextBreakdown` projections
 * the shipped meter consumes, so the figures are the provider-exact ones.
 * The cell probes its own composer once per mount (layout effect, so the
 * answer lands before the first paint): a `div` child of the InputBar root
 * whose hashed class carries the `_dock` local name is the alpha.2+ dock
 * generation, and the port renders there. Earlier hosts have no dock — their
 * native ring already lives in the trailing row — so the probe answers false
 * and the cell renders only its hidden ref-holder: the tweak is fully inert
 * on 0.1.6-alpha.1 and earlier.
 *
 * ## Ordering
 *
 * `conversation.input.right` cells render before the model chip, but
 * alpha.1's ring sat after it. Two `order` rules on the trailing row fix the
 * seat: the ring gets `order: 1` and the two `Tooltip`-cloned `_primary`
 * buttons get `order: 2`, everything else keeps the default 0. The slot
 * wrappers are `display: contents` anchors, so the actual flex items — ring
 * span, model trigger, stop and send buttons — are addressed directly. Both
 * rules are gated on an ancestor that owns a dock child, so on pre-alpha.2
 * hosts — where the native ring already holds the seat — they never enter
 * the cascade at all.
 *
 * ## Layering with context-pill-no-tooltip
 *
 * That tweak's rule hides any tooltip bubble that follows a ring-gauge
 * anchor, so it suppresses this port's hover reading too — one switch
 * covering both presentations of the same affordance.
 *
 * @module dsh-style-tweaks/client/tweaks/legacy-context-meter
 */

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only imports activate the client-service Context declarations and the
// slot/projection declaration merges this file reads through.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ContextPressureProjection } from '@deepseek-ai/dsh-token-meter/client'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

/** The slot machinery's translate seat for the plugin namespace. */
type MeterTranslate = PropsLocale<'style-tweaks'>['t']

/** Ring geometry: 14px viewBox, 2px stroke. */
const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Marker the localized occupancy sentence is split on, so the panel headline
 * keeps the reading in its own tone while each locale still owns the word
 * order (`45% of context used` / `上下文已用 45%`).
 */
const READING_SLOT = '\u0000'

/** Panel legend rows, in bar-segment order; each row carries its segment tint class. */
const ROWS = [
  { key: 'systemTokens', label: 'meter.system', color: 'cst-ctxm-cSystem' },
  { key: 'toolsTokens', label: 'meter.tools', color: 'cst-ctxm-cTools' },
  { key: 'messageTokens', label: 'meter.messages', color: 'cst-ctxm-cMessages' },
] as const

/** Occupancy figures the shipped meter derives from the pressure projection. */
interface ContextOccupancy {
  percent: number
  usedTokens: number
  contextWindow: number
}

/**
 * Resolve bounded display occupancy from independently updated pressure
 * fields (port of ui-conversation's context-occupancy.ts).
 */
function contextOccupancy(pressure: ContextPressureProjection | undefined): ContextOccupancy | null {
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  if (usedTokens === undefined || pressure?.contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
    usedTokens,
    contextWindow: pressure.contextWindow,
  }
}

/**
 * Compact token count: 517 / 12.2K / 1.2M — the shared `number.*` templates,
 * carried in the plugin namespace (same as the pills row).
 */
function formatTokens(value: number, t: MeterTranslate): string {
  const scaled = (candidate: number): string => candidate >= 100
    ? String(Math.round(candidate))
    : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('pills.number.thousand', { value: scaled(value / 1_000) })
  return t('pills.number.million', { value: scaled(value / 1_000_000) })
}

/**
 * Detect the dock generation from the cell's own position: walk up past the
 * slot machinery's `display: contents` anchor to the trailing row, reach the
 * composer card through it, and look for a `div` child of the InputBar root
 * whose hashed class carries the `_dock` local name — the alpha.2+ dock
 * wrapper. False on earlier hosts, whose InputBar renders no dock at all.
 *
 * The class test is a fragment match rather than a strict suffix (a host
 * build that joins another class onto the wrapper keeps working), and it is
 * safe to loosen because the two other guards carry the precision: the match
 * is scoped to the InputBar root's own children — the dock is the card's
 * sibling — and the InputBar root never holds another `_dock` element (the
 * QueueDock / GoalBar `.dock` local names live in their own containers).
 */
function probeDockGeneration(el: HTMLElement | null): boolean {
  let node = el === null ? null : el.parentElement
  while (node !== null && getComputedStyle(node).display === 'contents') {
    node = node.parentElement
  }
  if (node === null) return false
  const card = node.closest('[data-composer-card]')
  const root = card?.parentElement
  if (root === null || root === undefined) return false
  for (const child of root.children) {
    if (child.tagName === 'DIV' && typeof child.className === 'string' && child.className.includes('_dock')) {
      return true
    }
  }
  return false
}

/** Full props of the porting cell (standard kit + plugin locale seat). */
type LegacyContextMeterProps = PropsRuntime<'conversation.input.right'> & PropsLocale<'style-tweaks'>

/**
 * The alpha.1 context meter, ported: ring-only 28px trigger, absolute 264px
 * breakdown panel above-right, outside-click + Escape close. Renders nothing
 * until a provider reports pressure and a route capacity — and nothing at
 * all on hosts without the dock wrapper, where the native ring covers the
 * seat.
 */
export const LegacyContextMeterCell = memo(function LegacyContextMeterCell({ useProjection, t }: LegacyContextMeterProps) {
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const [open, setOpen] = useState(false)
  const [alpha2, setAlpha2] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const context = contextOccupancy(pressure)
  const available = context !== null

  useLayoutEffect(() => {
    setAlpha2(probeDockGeneration(rootRef.current))
  }, [])

  // A model switch can temporarily remove capacity while this component stays
  // mounted. Close the now-unavailable panel instead of preserving stale UI.
  useEffect(() => {
    if (!available && open) setOpen(false)
  }, [available, open])

  // Outside click / Escape close, one document listener while open (Menu's pattern).
  useEffect(() => {
    if (!open || !available) return
    const onPointerDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target) === true) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [available, open])

  if (!alpha2 || context === null) {
    // No figures yet, or a pre-alpha.2 host: keep the ref-holding wrapper in
    // the DOM (the probe needs it) but out of layout — a zero-size flex item
    // would still spend a row gap.
    return (
      <span ref={rootRef} className="cst-ctxm-root" style={{ display: 'none' }} />
    )
  }
  const percent = context.percent
  const reading = `${percent}%`
  const [headBefore = '', headAfter = ''] = t('meter.aria', { percent: READING_SLOT })
    .split(READING_SLOT)
    .map(part => part.trim())

  // The bar's overall length stays the provider-exact percent; the heuristic
  // breakdown only proportions its colored parts. A zero-width part is dropped
  // instead of rendered: the segment min-width keeps a hairline part visible,
  // which at 0% occupancy would draw a filled bar over an empty context.
  const breakdownTotal = breakdown === undefined
    ? 0
    : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
  const parts = breakdown === undefined || breakdownTotal === 0
    ? [{ key: 'total', color: undefined, width: percent }]
    : ROWS.map(row => ({ key: row.key, color: row.color, width: percent * breakdown[row.key] / breakdownTotal }))
  const segments = parts.filter(part => part.width > 0)

  return (
    <span ref={rootRef} className="cst-ctxm-root">
      <Tooltip label={t('meter.aria', { percent: reading })} side="top" delayMs={200} disabled={open}>
        <button
          type="button"
          className="cst-ctxm-trigger"
          aria-label={t('meter.aria', { percent: reading })}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
        >
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
            <circle className="cst-ctxm-track" cx="7" cy="7" r={RADIUS} />
            <circle
              className="cst-ctxm-fill"
              cx="7"
              cy="7"
              r={RADIUS}
              strokeDasharray={`${CIRCUMFERENCE * percent / 100} ${CIRCUMFERENCE}`}
              transform="rotate(-90 7 7)"
            />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className="cst-ctxm-panel" role="dialog" aria-label={t('meter.used')}>
          <div className="cst-ctxm-header">
            {/* Empty sides collapse through the `:empty` rule so the locale
                that needs no leading (or trailing) text spends no gap. */}
            <span className="cst-ctxm-headline">{headBefore}</span>
            <span className="cst-ctxm-percent">{reading}</span>
            <span className="cst-ctxm-headline">{headAfter}</span>
            {/* `~`: usedTokens prefers projectedTokens, whose surface delta is
                heuristically repriced on top of the provider-anchored sample. */}
            <span className="cst-ctxm-figures">
              {`~${formatTokens(context.usedTokens, t)} / ${formatTokens(context.contextWindow, t)}`}
            </span>
          </div>
          <div className="cst-ctxm-bar">
            {segments.map(segment => (
              <div
                key={segment.key}
                className={segment.color === undefined ? 'cst-ctxm-segment' : `cst-ctxm-segment ${segment.color}`}
                style={{ width: `${segment.width}%` }}
              />
            ))}
          </div>
          {breakdown !== undefined && (
            <dl className="cst-ctxm-rows">
              {ROWS.map(row => (
                <div key={row.key} className="cst-ctxm-row">
                  <dt>
                    <span className={`cst-ctxm-swatch ${row.color}`} aria-hidden />
                    {t(row.label)}
                  </dt>
                  <dd>{`~${formatTokens(breakdown[row.key], t)}`}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </span>
  )
})

/**
 * Port of the alpha.1 ContextMeter skin (ContextMeter.module.css), the
 * hiding rule for the dock capsule, and the two seat rules. The seat rules
 * are gated on an ancestor that owns a dock child, so on pre-alpha.2 hosts —
 * where the native ring already holds the seat — they are provably absent
 * from the cascade rather than merely restating the native order.
 *
 * The capsule hides through `visibility`, not `display`: its 22px box stays
 * in the dock as a height floor, which is what the shipped capsule provided
 * (the stats rows are 20px and 22px tall, so with the box gone every
 * toggle of the stats presentation — or a session with no stats at all —
 * changes the composer's height and slides the whole input area). The box
 * itself collapses to zero width, with the dock's 12px gap cancelled, so the
 * stats row keeps sitting exactly on the card's centre line the way the
 * pre-alpha.2 line did; `visibility: hidden` also keeps the capsule out of
 * hit-testing and the accessibility tree. Nothing here hard-codes the
 * capsule's height — the real element still measures itself, so a font-size
 * preference that changes the trigger's line height is followed for free.
 */
const METER_CSS = `
.cst-ctxm-root{position:relative;display:inline-flex}
.cst-ctxm-trigger{display:grid;place-items:center;flex:none;width:28px;height:28px;border:none;border-radius:999px;corner-shape:round;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.cst-ctxm-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cst-ctxm-track{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:2}
.cst-ctxm-fill{fill:none;stroke:var(--dsw-alias-label-tertiary);stroke-width:2;stroke-linecap:round}
.cst-ctxm-panel{position:absolute;bottom:calc(100% + 8px);right:0;z-index:100;box-sizing:border-box;width:264px;padding:12px;border:0;border-radius:12px;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);cursor:default}
.cst-ctxm-header{display:flex;align-items:center;gap:6px}
.cst-ctxm-figures{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.cst-ctxm-percent{font-weight:500;color:var(--dsw-alias-label-primary)}
.cst-ctxm-headline{color:var(--dsw-alias-label-tertiary)}
.cst-ctxm-headline:empty{display:none}
.cst-ctxm-bar{display:flex;gap:1px;margin:10px 0 12px;height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}
.cst-ctxm-segment{flex:none;min-width:2px;height:100%;border-radius:1px;background:var(--meter-tint,var(--dsw-alias-label-tertiary))}
.cst-ctxm-swatch{display:inline-block;margin-right:6px;width:8px;height:8px;border-radius:2px;background:var(--meter-tint);vertical-align:baseline}
.cst-ctxm-cSystem{--meter-tint:var(--dsw-static-neutral-bluish-400)}
.cst-ctxm-cTools{--meter-tint:rgb(167,139,250)}
.cst-ctxm-cMessages{--meter-tint:var(--dsw-static-blue-450)}
.cst-ctxm-rows{margin:6px 0 0}
.cst-ctxm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0}
.cst-ctxm-row dt{color:var(--dsw-alias-label-secondary)}
.cst-ctxm-row dd{margin:0;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
[class*="_dock"] > span:has(> button > svg[viewBox="0 0 14 14"] > circle){visibility:hidden;width:0;margin-left:-12px}
div:has(> div[class*="_dock"]) [class*="_trailing"] span:has(> button > svg[viewBox="0 0 14 14"] > circle){order:1}
div:has(> div[class*="_dock"]) [class*="_trailing"] > button[class*="_primary"]{order:2}
`

function installMeterStyles(): () => void {
  const id = 'dsh-style-tweaks-legacy-context-meter'
  let style = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.plugin = 'dsh-style-tweaks'
    style.dataset.pluginCss = id
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, METER_CSS)
  return () => { releaseStyleNode(style, owner) }
}

/**
 * Mount the legacy context meter: inject the ported skin, then register the
 * porting cell on the `conversation.input.right` list slot. The
 * `slots.inject` controller re-registers across slot re-declarations and its
 * disposer unmounts the cell (the dock capsule takes the old seat back).
 */
export function setupLegacyContextMeter(ctx: ClientContext): () => void {
  const disposeStyles = installMeterStyles()
  const disposeCell = ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register({
      name: 'conversation.input.right',
      id: 'legacy-context-meter',
      priority: 0,
      locale: 'style-tweaks',
    }, LegacyContextMeterCell))
  return () => {
    disposeCell()
    disposeStyles()
  }
}
