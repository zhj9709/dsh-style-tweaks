/**
 * dsh-style-tweaks — running-status tweak.
 *
 * Through DSH 0.1.6, `ChatView` rendered a dedicated `TurnStatus` after the
 * transcript. While a turn was open it stayed at the live tail — immediately
 * above the composer — with the brand-blue shimmer and, after fifteen seconds,
 * a quiet elapsed-time clock.
 *
 * DSH 0.1.7's grouped-work-details refactor removed that React-owned tail.
 * The running wording survives only in `TurnProcessNodeView`: the process
 * control carries a visually-hidden `role="status"` announcement and a visible
 * elapsed-time label, but that control sits at the beginning of the always-open
 * running process group. As reasoning and tool rows grow, the label moves away
 * from the composer and effectively disappears from the user's reading position.
 *
 * This tweak restores the 0.1.6 presentation without patching DSH source or
 * moving any host-owned node. It recognizes a 0.1.7 process control whose
 * adjacent accessibility announcement is a non-settled running state, then
 * appends one namespaced visual-only row to the owning `[data-chat-flow]`. The
 * announcement text is used as-is, so a locale or companion plugin may replace
 * `Deep diving` with wording such as `Deep sleep` without disabling the tweak.
 * The host keeps its announcement and process-group header; the inserted row is
 * `aria-hidden`, so it neither duplicates speech nor becomes a second
 * tab/live-region target.
 *
 * The elapsed value is not hard-coded by language. The host label is matched
 * against the same `message.turnProcess.deepDivingFor` template used to render
 * it, with a private marker substituted for `{duration}`; the text between the
 * template's prefix and suffix supplies the numeric clock. The value is then
 * rendered through 0.1.6's padded duration format, so the original
 * fifteen-second gate and clock typography also survive a mid-turn reload. If
 * a companion plugin changes that template or the wording, the complete
 * customized host label is shown as one blue line instead.
 *
 * Hosts through 0.1.6 already render their own tail and do not put the
 * accessibility announcement beside a process disclosure, so this tweak stays
 * inert there. The same is true on a future host that changes either structural
 * anchor.
 *
 * @module dsh-style-tweaks/client/tweaks/running-status
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the Context declaration merges and the `chat`
// namespace key map this file reads through.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** The host chat vocabulary, including both running-state strings. */
type ChatTranslate = TranslateNS<'chat'>

/** Stable structural anchors written by DSH itself. */
const PROCESS_BUTTON = 'button[data-turn-process]'
const PROCESS_FLOW_ITEM = '[data-chat-flow-kind="turn-process"]'
const PROCESS_STATUS = '[role="status"][aria-live="polite"]'
const PROCESS_LABEL = 'button[data-turn-process] > span:first-child'
const CHAT_FLOW = '[data-chat-flow]'

/** The old TurnStatus delayed its clock until this point. */
const CLOCK_DELAY_MS = 15_000

/** Attributes that can change visibility or the active process identity. */
const OBSERVED_ATTRIBUTES = [
  'hidden',
  'data-chat-flow',
  'data-chat-flow-kind',
  'data-chat-turn',
  'data-turn-process',
  'data-turn-process-hidden',
  'aria-live',
  'role',
] as const

/** Plugin-owned nodes and stylesheet. */
const STATUS_CLASS = 'cst-running-status'
const LABEL_CLASS = 'cst-running-status-label'
const CLOCK_CLASS = 'cst-running-status-clock'
const RUNNING_STATUS_CSS_ID = 'cst-running-status'
const STYLE_OWNER_ATTR = 'data-cst-running-status-owner'

interface LiveDuration {
  readonly elapsedMs: number
  readonly clockText: string
}

interface RunningControl {
  readonly button: HTMLButtonElement
  readonly flow: HTMLElement
  readonly announcement: string
  readonly displayText: string
  readonly label: string
  readonly duration: LiveDuration | null
}

type DurationField = 'hours' | 'minutes' | 'seconds'

interface DurationFormat {
  readonly key: 'duration.hours' | 'duration.minutes' | 'duration.seconds'
  readonly fields: readonly DurationField[]
}

const DURATION_FORMATS: readonly DurationFormat[] = [
  { key: 'duration.hours', fields: ['hours', 'minutes', 'seconds'] },
  { key: 'duration.minutes', fields: ['minutes', 'seconds'] },
  { key: 'duration.seconds', fields: ['seconds'] },
]

// `ctx.locale.bind` returns formatted text rather than raw `{hours}` /
// `{minutes}` templates. Private-use markers survive interpolation, letting the
// parser split the localized result back into numeric fields.
const DURATION_MARKERS: Readonly<Record<DurationField, string>> = {
  hours: '\uE001',
  minutes: '\uE002',
  seconds: '\uE003',
}

/**
 * The host's screen-reader announcement beside one process button.
 *
 * `TurnProcessNodeView` returns a fragment containing the announcement and the
 * disclosure button, so they are siblings under the same `conversation.chat.node`
 * slot. Looking only at the button's direct parent keeps unrelated retry and
 * tool status regions out of the match.
 */
function processAnnouncement(button: HTMLButtonElement): string | null {
  const parent = button.parentElement
  if (parent === null) return null
  const status = parent.querySelector<HTMLElement>(':scope > [role="status"][aria-live="polite"]')
  const announcement = status?.textContent?.trim() ?? ''
  return announcement === '' ? null : announcement
}

/** The three non-running states emitted by 0.1.7's process control. */
const SETTLED_STATUS_KEYS = [
  'message.stopped',
  'message.turnProcess.failed',
  'message.turnProcess.worked',
] as const

function settledAnnouncements(t: ChatTranslate): ReadonlySet<string> {
  return new Set(SETTLED_STATUS_KEYS.map(key => t(key).trim()))
}

/** The host label, excluding any tally appended by another plugin. */
function processLabel(button: HTMLButtonElement): string {
  return button.querySelector<HTMLElement>(':scope > span:first-child')?.textContent?.trim() ?? ''
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse the host's localized duration text back into milliseconds.
 *
 * The host exposes no elapsed-time attribute, so the same duration templates
 * used to render the label are used as pattern sources here. This keeps the
 * clock gate language-neutral and lets a mid-turn reload show the clock at the
 * same point as the old React component.
 */
function durationMilliseconds(value: string, t: ChatTranslate): number | null {
  for (const format of DURATION_FORMATS) {
    const template = t(format.key, DURATION_MARKERS)
    const fields = format.fields.map((field) => {
      const marker = DURATION_MARKERS[field]
      return { field, marker, at: template.indexOf(marker) }
    })
    if (fields.some(({ marker, at }) =>
      at < 0 || template.indexOf(marker, at + marker.length) >= 0,
    )) continue

    // Custom locales may order the fields differently. Build capture groups in
    // the template's actual order, then map each group back to its field name.
    fields.sort((left, right) => left.at - right.at)
    let source = '^'
    let cursor = 0
    for (const { marker, at } of fields) {
      source += escapeRegExp(template.slice(cursor, at))
      source += '(\\d+)'
      cursor = at + marker.length
    }
    source += escapeRegExp(template.slice(cursor)) + '$'

    const match = new RegExp(source, 'u').exec(value)
    if (match === null) continue
    const values: Partial<Record<DurationField, number>> = {}
    let valid = true
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index]?.field
      const parsed = Number(match[index + 1])
      if (field === undefined || !Number.isSafeInteger(parsed) || parsed < 0) {
        valid = false
        break
      }
      values[field] = parsed
    }
    if (!valid) continue

    const hours = values.hours ?? 0
    const minutes = values.minutes ?? 0
    const seconds = values.seconds ?? 0
    const total = ((hours * 60 + minutes) * 60 + seconds) * 1000
    return Number.isSafeInteger(total) ? total : null
  }
  return null
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Match 0.1.6's `formatRunDuration`, including padded minute/second fields. */
function formatClockDuration(elapsedMs: number, t: ChatTranslate): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return t('duration.hours', {
      hours,
      minutes: pad2(minutes),
      seconds: pad2(seconds),
    })
  }
  return minutes > 0
    ? t('duration.minutes', { minutes, seconds: pad2(seconds) })
    : t('duration.seconds', { seconds })
}

/**
 * Extract the live duration from the host's localized process label.
 *
 * Substituting a private-use marker into the same template the host used gives
 * us its literal prefix and suffix. This remains correct when the duration is
 * not last and avoids a zh/en string table inside the plugin.
 */
function liveDuration(label: string, t: ChatTranslate): LiveDuration | null {
  const marker = '\uE000'
  const template = t('message.turnProcess.deepDivingFor', { duration: marker })
  const markerAt = template.indexOf(marker)
  if (markerAt < 0 || template.indexOf(marker, markerAt + 1) >= 0) return null

  const prefix = template.slice(0, markerAt)
  const suffix = template.slice(markerAt + marker.length)
  if (!label.startsWith(prefix)) return null
  if (suffix !== '' && !label.endsWith(suffix)) return null

  const text = label
    .slice(prefix.length, suffix === '' ? label.length : label.length - suffix.length)
    .trim()
  if (text === '') return null
  const elapsedMs = durationMilliseconds(text, t)
  if (elapsedMs === null) return null
  return {
    elapsedMs,
    clockText: formatClockDuration(elapsedMs, t),
  }
}

/** The one open process control in the mounted chat, if there is one. */
function findRunningControl(t: ChatTranslate): RunningControl | null {
  const settled = settledAnnouncements(t)
  let active: RunningControl | null = null
  for (const button of document.querySelectorAll<HTMLButtonElement>(PROCESS_BUTTON)) {
    if (!button.isConnected) continue
    const announcement = processAnnouncement(button)
    const flow = button.closest<HTMLElement>(CHAT_FLOW)
    // DSH keeps some historical chat seats mounted under a hidden ancestor;
    // never attach the live-tail clone to one of those instead of the visible
    // conversation.
    if (announcement === null || flow === null || flow.closest('[hidden]') !== null) continue
    if (settled.has(announcement)) continue
    const label = processLabel(button)
    const duration = liveDuration(label, t)
    active = {
      button,
      flow,
      announcement,
      // A companion text-replacement plugin may change the host label without
      // preserving our duration template. In that case keep the complete
      // customized label visible instead of silently falling back to English /
      // Chinese stock wording.
      displayText: duration === null && label !== '' ? label : announcement,
      label,
      duration,
    }
  }
  return active
}

/** Update the visual clone without replacing unchanged nodes. */
function paintStatus(root: HTMLElement, control: RunningControl): void {
  root.dataset.cstRunningTurn = control.button.dataset.turnProcess ?? ''
  let label = root.querySelector<HTMLElement>(`:scope > .${LABEL_CLASS}`)
  if (label === null) {
    root.replaceChildren()
    label = document.createElement('span')
    label.className = LABEL_CLASS
    root.appendChild(label)
  }
  if (label.textContent !== control.displayText) label.textContent = control.displayText

  let clock = root.querySelector<HTMLElement>(`:scope > .${CLOCK_CLASS}`)
  if (control.duration === null || control.duration.elapsedMs < CLOCK_DELAY_MS) {
    clock?.remove()
    return
  }
  if (clock === null) {
    clock = document.createElement('span')
    clock.className = CLOCK_CLASS
    root.appendChild(clock)
  }
  if (clock.textContent !== control.duration.clockText) clock.textContent = control.duration.clockText
}

function isProcessTextOwner(element: Element): boolean {
  return element.closest(PROCESS_STATUS) !== null || element.closest(PROCESS_LABEL) !== null
}

function containsProcessButton(node: Node): boolean {
  if (!(node instanceof Element)) return false
  return node.matches(PROCESS_BUTTON) || node.querySelector(PROCESS_BUTTON) !== null
}

function containsProcessControl(node: Node): boolean {
  if (!(node instanceof Element)) return false
  return containsProcessButton(node)
    || node.matches(PROCESS_STATUS)
    || node.querySelector(PROCESS_STATUS) !== null
    || isProcessTextOwner(node)
}

function containsOwnStatus(node: Node): boolean {
  return node instanceof HTMLElement
    && (node.classList.contains(STATUS_CLASS) || node.querySelector(`.${STATUS_CLASS}`) !== null)
}

/**
 * Whether a mutation can change which process control is open, its label, or
 * the identity of the chat flow. Ordinary tool-row streaming is intentionally
 * ignored; only the host status/label and process-button structure trigger a
 * scan.
 */
function touchesRunningControl(record: MutationRecord): boolean {
  if (record.type === 'characterData') {
    const parent = record.target instanceof CharacterData ? record.target.parentElement : null
    return parent !== null
      && parent.closest(PROCESS_FLOW_ITEM) !== null
      && isProcessTextOwner(parent)
  }

  if (record.type === 'attributes') {
    if (!(record.target instanceof Element)) return false
    if (record.attributeName === 'hidden') {
      return record.target.matches(CHAT_FLOW)
        || record.target.closest(PROCESS_FLOW_ITEM) !== null
        || record.target.querySelector(PROCESS_BUTTON) !== null
    }
    return record.target.closest(PROCESS_FLOW_ITEM) !== null
      || record.target.matches(PROCESS_BUTTON)
      || record.target.matches(CHAT_FLOW)
  }

  if (record.type !== 'childList') return false
  // React may remove the unmanaged row while reconciling the flow. Re-sync on
  // removal, but ignore the row's own append so the observer does not feed
  // itself.
  if ([...record.removedNodes].some(containsOwnStatus)) return true
  if (
    record.target instanceof Element
    && (
      record.target.matches(PROCESS_STATUS)
      || record.target.closest(PROCESS_LABEL) !== null
      || record.target.matches(PROCESS_BUTTON)
    )
  ) return true

  return [...record.addedNodes, ...record.removedNodes].some(containsProcessControl)
}

/**
 * HMR duplicate-setup guard. A hot reload can evaluate the new bundle before
 * the previous effect's cleanup runs; invoking the old owner first prevents two
 * observers and two injected rows from stacking. The v2 key is deliberately
 * separate from the original key: a late cleanup from the old bundle can clear
 * its own legacy slot without clearing this bundle's ownership marker.
 */
const GLOBAL_KEY = '__cst_running_status_cleanup_v2__'
const LEGACY_GLOBAL_KEY = '__cst_running_status_cleanup__'
function getGlobalCleanup(key: string): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[key] as (() => void) | undefined
}
function setGlobalCleanup(key: string, cleanup: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[key] = cleanup
}

/**
 * Mount the restored live-tail row. Returns a disposer that removes the row,
 * its stylesheet, and the observer.
 */
export function setupRunningStatus(ctx: ClientContext): () => void {
  const previous = getGlobalCleanup(GLOBAL_KEY) ?? getGlobalCleanup(LEGACY_GLOBAL_KEY)
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(LEGACY_GLOBAL_KEY, undefined)
    setGlobalCleanup(GLOBAL_KEY, undefined)
  }

  const t = ctx.locale.bind('chat')
  const removeStyles = injectRunningStatusStyles()
  let mounted: { readonly root: HTMLElement, readonly flow: HTMLElement } | undefined
  let disposed = false

  const sync = (): void => {
    if (disposed) return
    // Query the live DOM instead of maintaining a structural cache. React can
    // mount or replace the active process control before this tweak's observer
    // starts, and a cached button set then never discovers the current control.
    const control = findRunningControl(t)
    if (control === null) {
      mounted?.root.remove()
      mounted = undefined
      return
    }

    let root = mounted?.root
    if (root === undefined || mounted?.flow !== control.flow || !root.isConnected) {
      mounted?.root.remove()
      root = document.createElement('div')
      root.className = STATUS_CLASS
      root.setAttribute('aria-hidden', 'true')
      control.flow.appendChild(root)
      mounted = { root, flow: control.flow }
    } else if (control.flow.lastElementChild !== root) {
      // React may append a newly admitted echo after our unmanaged node. Keep
      // the restored row at the live tail; `order` in the stylesheet also makes
      // that placement stable for the duration of the current flex layout.
      control.flow.appendChild(root)
    }
    paintStatus(root, control)
  }

  let scheduled = false
  const observer = new MutationObserver((records) => {
    if (!records.some(touchesRunningControl) || scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (disposed) return
      sync()
    })
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...OBSERVED_ATTRIBUTES],
  })

  // Covers setup while a turn is already open, including a bundle reload.
  sync()

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    mounted?.root.remove()
    mounted = undefined
    removeStyles()
    // A late cleanup from an older bundle must not clear the new owner's
    // duplicate-setup guard.
    if (getGlobalCleanup(GLOBAL_KEY) === cleanup) setGlobalCleanup(GLOBAL_KEY, undefined)
  }
  setGlobalCleanup(GLOBAL_KEY, cleanup)
  return cleanup
}

/**
 * DSH 0.1.6's `TurnStatus` skin: a one-line brand-blue shimmer at the live tail,
 * with the elapsed clock in the ordinary caption colour after fifteen seconds.
 * Reduced-motion keeps the highlight static, exactly as 0.1.6 did.
 */
const RUNNING_STATUS_CSS = `
[data-chat-flow] > .${STATUS_CLASS}{
  order:2147483647;
  margin-top:var(--dsh-chat-flow-gap,16px);
  align-self:flex-start;
  flex:none;
  display:inline-flex;
  align-items:center;
  height:calc(26px + var(--dsh-content-font-delta,0px));
  font:var(--dsw-font-s-strong-14);
  font-size:var(--dsh-content-font-size,14px);
  line-height:calc(22px + var(--dsh-content-font-delta,0px));
  white-space:nowrap;
  background:linear-gradient(90deg,var(--dsw-static-deepseek-500) 0%,var(--dsw-static-deepseek-500) 40%,var(--dsw-static-deepseek-200) 50%,var(--dsw-static-deepseek-500) 60%,var(--dsw-static-deepseek-500) 100%);
  background-position:100% 0;
  background-size:250% 100%;
  background-clip:text;
  color:transparent;
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  animation:cst-running-status-shimmer 1.8s linear infinite;
  pointer-events:none;
}
.${STATUS_CLASS} > .${LABEL_CLASS}{font:inherit}
.${STATUS_CLASS} > .${CLOCK_CLASS}{
  margin-left:8px;
  font:var(--dsw-font-xs-13);
  font-size:var(--dsh-content-font-size-secondary,13px);
  line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));
  font-weight:400;
  font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-caption);
  -webkit-text-fill-color:var(--dsw-alias-label-caption);
}
@keyframes cst-running-status-shimmer{to{background-position:0 0}}
@media (prefers-reduced-motion:reduce){.${STATUS_CLASS}{background-position:0 0;background-size:100% 100%;animation:none}}
`

const STYLE_OWNER_COUNTER_KEY = '__cst_running_status_style_owner_counter__'

function nextStyleOwner(): string {
  const globals = window as unknown as Record<string, unknown>
  const previous = globals[STYLE_OWNER_COUNTER_KEY]
  const next = (typeof previous === 'number' && Number.isSafeInteger(previous) ? previous : 0) + 1
  globals[STYLE_OWNER_COUNTER_KEY] = next
  return String(next)
}

function injectRunningStatusStyles(): () => void {
  const owner = nextStyleOwner()
  const style = document.createElement('style')
  style.dataset.tweak = 'cst'
  style.dataset.tweakCss = RUNNING_STATUS_CSS_ID
  style.setAttribute(STYLE_OWNER_ATTR, owner)
  style.textContent = RUNNING_STATUS_CSS
  document.head.appendChild(style)
  // Always create a fresh node: an older bundle's cleanup may still hold the
  // previous node and must not be able to remove this instance's stylesheet.
  return () => {
    if (style.getAttribute(STYLE_OWNER_ATTR) === owner) style.remove()
  }
}
