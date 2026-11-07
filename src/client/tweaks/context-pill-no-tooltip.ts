/**
 * dsh-style-tweaks — context-pill-no-tooltip tweak.
 *
 * Suppresses the hover info bubble of the composer's context capsule (the
 * ContextMeter pill under the input card, DSH 0.1.6-alpha.2+): hovering the
 * pill no longer floats the "上下文已用 13%" tooltip. The pill's own hover
 * highlight and its click-open breakdown dialog are untouched — the full
 * figures stay one click away.
 *
 * ## Selector
 *
 * The bubble is Tooltip's own product: `useAnchoredPosition`-driven
 * primitives render it as a `span[role="tooltip"]` sibling immediately after
 * the anchor it clones, so the bubble of the capsule is exactly "the tooltip
 * span that follows the capsule trigger button". The trigger is identified
 * structurally — it is the only button in the client UI that mounts
 * `> svg[viewBox="0 0 14 14"] > circle` (the ring gauge; every circle-bearing
 * icon in ui-primitives is a 16×16 viewBox, and TodoPanel's 14×14 glyphs are
 * path/rect, not circles). No CSS-module hashes, no text matching, and it
 * cannot catch any other tooltip: the `+` sibling only binds a bubble to its
 * own anchor, and the anchors of every other Tooltip in the composer (the +
 * attach circle, the send button, the tweak rows' own tooltips) have no
 * such svg.
 *
 * The rule hides the bubble whenever it renders, keyboard focus included
 * (the focus bubble is the same element; hiding it spares nothing the
 * dialog doesn't show). On hosts without the ContextMeter (0.1.6-alpha.1
 * and earlier) the selector matches nothing and the tweak is inert.
 *
 * ## The ported bubble (0.2.2+)
 *
 * The sibling rule above only covers a bubble that renders next to its
 * anchor. The 0.2.2 host portals the capsule's bubble to `document.body`
 * (`Tooltip` gained `portal: true`), so the bubble is no longer a sibling of
 * the trigger and the rule matches nothing — the very bubble the switch is
 * supposed to suppress keeps showing. A portaled bubble carries no link back
 * to its anchor (no id, no `aria-describedby`), so it cannot be selected
 * structurally; what can be selected is the *anchor*, and the state that
 * follows from the pointer or the keyboard focus sitting on it.
 *
 * So the bubble is suppressed by state instead of by structure: while the
 * ring-gauge trigger is hovered or focused, the document body carries
 * `cst-ctxpill-tooltip-armed`, and the armed rule hides every tooltip in the
 * document. The pointer and the focus are tracked separately (a mouse that
 * leaves the trigger while the keyboard focus stays on it keeps the bubble
 * hidden), and both are tracked through delegated listeners, so a trigger
 * React re-renders needs no rebinding.
 */

import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

const CONTEXT_PILL_NO_TOOLTIP_CSS = `
button:has(> svg[viewBox="0 0 14 14"] > circle) + span[role="tooltip"] {
  display: none;
}
body.cst-ctxpill-tooltip-armed [role="tooltip"] {
  display: none;
}
`

export const CONTEXT_PILL_NO_TOOLTIP_CSS_ID = 'cst-context-pill-no-tooltip'

/** Body class marking "the ring-gauge trigger is hovered or focused". */
const ARMED_CLASS = 'cst-ctxpill-tooltip-armed'

/**
 * The ring-gauge trigger, identified the same way the sibling rule above
 * identifies it: the only button that mounts a 14×14 viewBox svg holding a
 * circle (the ring gauge).
 */
const RING_TRIGGER_SELECTOR = 'button:has(> svg[viewBox="0 0 14 14"] > circle)'

/**
 * Whether a node is (or is inside) the ring-gauge trigger.
 */
function isRingTrigger(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(RING_TRIGGER_SELECTOR) !== null
}

/**
 * Arm the armed state while the ring-gauge trigger is hovered or focused, so
 * the portaled bubble (0.2.2+) never reaches the screen.
 *
 * The pointer and the focus are tracked apart: a pointer that leaves the
 * trigger does not re-show a bubble the keyboard focus still owns, and a
 * focus that leaves the trigger does not keep a bubble the pointer still
 * owns hidden.
 */
function armWhileTriggerEngaged(): () => void {
  let hovering = false
  let focused = false
  const update = (): void => {
    document.body.classList.toggle(ARMED_CLASS, hovering || focused)
  }
  const onPointerOver = (e: PointerEvent): void => { hovering = isRingTrigger(e.target); update() }
  const onPointerOut = (e: PointerEvent): void => { hovering = isRingTrigger(e.relatedTarget); update() }
  const onFocusIn = (e: FocusEvent): void => { focused = isRingTrigger(e.target); update() }
  const onFocusOut = (e: FocusEvent): void => { focused = isRingTrigger(e.relatedTarget); update() }
  document.addEventListener('pointerover', onPointerOver, true)
  document.addEventListener('pointerout', onPointerOut, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', onFocusOut, true)
  return () => {
    document.removeEventListener('pointerover', onPointerOver, true)
    document.removeEventListener('pointerout', onPointerOut, true)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('focusout', onFocusOut, true)
    document.body.classList.remove(ARMED_CLASS)
  }
}

export function injectContextPillNoTooltipStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${CONTEXT_PILL_NO_TOOLTIP_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = CONTEXT_PILL_NO_TOOLTIP_CSS_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, CONTEXT_PILL_NO_TOOLTIP_CSS)
  const disposeArm = armWhileTriggerEngaged()
  return () => {
    disposeArm()
    releaseStyleNode(style, owner)
  }
}
