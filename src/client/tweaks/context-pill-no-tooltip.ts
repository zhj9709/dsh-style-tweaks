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
 */

const CONTEXT_PILL_NO_TOOLTIP_CSS = `
button:has(> svg[viewBox="0 0 14 14"] > circle) + span[role="tooltip"] {
  display: none;
}
`

export const CONTEXT_PILL_NO_TOOLTIP_CSS_ID = 'cst-context-pill-no-tooltip'

export function injectContextPillNoTooltipStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${CONTEXT_PILL_NO_TOOLTIP_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = CONTEXT_PILL_NO_TOOLTIP_CSS_ID
    style.textContent = CONTEXT_PILL_NO_TOOLTIP_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}
