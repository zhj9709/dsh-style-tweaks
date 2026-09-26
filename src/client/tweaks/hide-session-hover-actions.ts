/**
 * dsh-style-tweaks — hide-session-hover-actions tweak.
 *
 * Hovering a session row floats two icon buttons into its trailing cell: the
 * archive button (the unarchive one on an archived row) and the pin button.
 * Both arrive through the workspace browser's
 * `sidebar.workspaces.session.row.action` slot list (`session-actions/
 * ArchiveSession.tsx`, `PinSession.tsx`), which `Rows.tsx` renders INSIDE the
 * row's `.rowActions` strip, beside the host's own `...` menu button — that
 * button is not part of the list. This tweak hides the slot's wrapper, so the
 * strip keeps only the `...` menu: hovering no longer parks a one-click
 * archive under the pointer, and both actions stay reachable from that menu,
 * whose own rows are registered on `sidebar.workspaces.session.menu.item`.
 *
 * ## Mechanism
 *
 * One rule on the slot wrapper — the structural hook the host itself puts on
 * every injected list entry (`<div data-slot="…" style="display: contents">`).
 * `display: none !important` outranks that inline `display: contents` (an
 * important author declaration beats a non-important inline style), and the
 * rule is unconditional, so the buttons never appear: not on hover, and not
 * while the row's menu is open either — the state in which the host otherwise
 * pins the strip visible for as long as the menu is up. That is deliberate:
 * the menu the strip is pinning is the very place those two actions moved to.
 *
 * ## Selector safety
 *
 * `sidebar.workspaces.session.row.action` is the host's public slot id, so the
 * rule cannot catch the `...` menu button (a sibling, outside the wrapper) or
 * any other trailing cell: workspace rows, search results and the sidebar's
 * other lists never mount that slot. Session rows keep their hover fill, their
 * hover card, their timestamp cell and their menu button untouched. Host
 * builds that do not mark injected entries with `data-slot` leave the tweak
 * inert.
 */

import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

const HIDE_SESSION_HOVER_ACTIONS_CSS = `
[data-slot="sidebar.workspaces.session.row.action"] {
  display: none !important;
}
`

export const HIDE_SESSION_HOVER_ACTIONS_CSS_ID = 'cst-hide-session-hover-actions'

export function injectHideSessionHoverActionsStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${HIDE_SESSION_HOVER_ACTIONS_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = HIDE_SESSION_HOVER_ACTIONS_CSS_ID
    style.textContent = HIDE_SESSION_HOVER_ACTIONS_CSS
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style)
  return () => { releaseStyleNode(style, owner) }
}
