/**
 * dsh-style-tweaks — opaque-stat-dialogs tweak.
 *
 * 0.1.7-alpha.1 redefined the elevated menu/card material (its own design note
 * "Compact translucent menu surfaces", 2026-09-17): `--dsw-specific-menu` went
 * from 0.1.6's opaque `var(--dsw-alias-bg-layer-3)` to a translucent fill —
 * `rgba(248, 249, 250, 0.58)` light, `rgba(48, 49, 54, 0.5)` dark — paired with
 * a new `--dsw-menu-backdrop-filter: blur(40px) saturate(150%)` that every
 * surface painting that fill applies. Nothing else about those surfaces
 * changed: same shape, padding, shadow and hairline stroke, only the fill
 * stopped being opaque (the macOS Electron window keeps a near-opaque 0.94
 * fill because window vibrancy disables backdrop filtering; a browser keeps
 * the 0.58 fill plus the blur).
 *
 * This tweak restores the opaque fill on exactly the five click-open readout
 * dialogs that carry the numbers a user reads at a glance — the host's own
 * name for them is the `stat-dialog` seat, rendered by `StatsPills` (the
 * composer cards, which ui-chat's README calls 统计交互卡片 / "interactive
 * statistic dialogs") and by `TurnUsagePanel` (the turn-tail usage pill), plus
 * the ContextMeter breakdown panel:
 *
 *   1. the turn-tail usage pill's dialog (本轮用量),
 *   2. the restored turn-time pill's dialog (本轮用时和速度),
 *   3. the composer stats pill's dialog (会话统计),
 *   4. the composer usage pill's dialog (Token 用量),
 *   5. the context capsule's breakdown panel (上下文已用).
 *
 * Every other surface keeps the shipped translucent material: the shared
 * dropdowns (`Menu`'s session / workspace `...` menus, the model selector, the
 * composer's `/` and `@` menus, popup selects) and the panel family (Todo,
 * Jobs, Goal, Queue, dock). That is a deliberate scope: those are surfaces a
 * user looks *through* while they sit over other content, and the frosted
 * material is what 0.1.7 designed for them, while the five readout cards are
 * dense walls of figures where a see-through card is just harder to read.
 *
 * ## How each of the five is targeted
 *
 * 1 / 3 / 4 (and the shipped pills behind 3 / 4 whenever this plugin's own
 * pills are not the ones rendering) are the host's `stat-dialog` panel — one
 * component, `ui-chat/src/client/chat/stat-dialog.module.css`, whose direct
 * children are `.title`, `.titleRule` and `.details`. 5 is the ContextMeter
 * panel, whose direct children are `.header`, `.bar` and `.rows`.
 *
 * The host marks no data attribute on either, and both land on the same
 * CSS-modules shape — a class ending in `_panel` with `role="dialog"` — which
 * is also what several UNRELATED dialogs use (`SettingsRoot.panel`, the
 * document preview's `FontNotice.panel`, the agent team's `TeamAction.panel`,
 * and the memory-save modal). The two are therefore told apart by their own
 * children, through `:has(> …)` on the direct child's local name, which is the
 * same structural-hook discipline the rest of this plugin uses (compare
 * `[class$="_timeEnd"]` and `[data-turn-tail]` in `turn-time-pill.tsx`) and is
 * what keeps the settings panel and the other dialogs out.
 *
 * 2 and 3 / 4's plugin-rendered halves are this plugin's own ported panels
 * (`.cst-ttp-panel`, `.cst-pilldlg-panel`) — plain namespaced classes, no
 * guessing needed.
 *
 * ## Why not the `--dsw-specific-menu` token
 *
 * Because the token *is* the whole elevation family: re-pointing it repaints
 * every menu and panel in the client, which is wider than the five cards this
 * tweak is for. (That was the first cut of this tweak; the scope was narrowed
 * after the frosted material turned out to be wanted everywhere else.)
 *
 * The `backdrop-filter` declarations are left alone either way: an opaque fill
 * covers the blur, so the property is invisible, and keeping it preserves the
 * host's own isolation / containing-block semantics for the surfaces that rely
 * on it.
 *
 * ## Specificity
 *
 * The host's own rule is `.panel` (0,1,0) and the plugin's ports are
 * `.cst-ttp-panel` / `.cst-pilldlg-panel` (0,1,0), so every rule here carries
 * a `body` element prefix: one extra element selector settles both ties
 * without `!important` and without depending on which of the plugin's
 * stylesheets happens to be injected last. The dark theme needs no separate
 * value — layer-3 is the theme's own dark surface color. Hosts before
 * 0.1.7-alpha.1 already paint the opaque value, making this a same-value no-op
 * there.
 */

import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

const OPAQUE_STAT_DIALOGS_CSS = `
/* The host's stat dialogs (turn-tail usage pill + composer stats / usage pills). */
body [class$="_panel"][role="dialog"]:has(> [class$="_details"]),
/* The context capsule's breakdown panel (ContextMeter). */
body [class$="_panel"][role="dialog"]:has(> [class$="_rows"]),
/* This plugin's ports of two of them (the restored time pill's dialog, and the
   ported composer pills' dialog while the decimals tweak is the one rendering). */
body .cst-ttp-panel,
body .cst-pilldlg-panel {
  background: var(--dsw-alias-bg-layer-3);
}
`

export const OPAQUE_STAT_DIALOGS_CSS_ID = 'cst-opaque-stat-dialogs'

export function injectOpaqueStatDialogsStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${OPAQUE_STAT_DIALOGS_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = OPAQUE_STAT_DIALOGS_CSS_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, OPAQUE_STAT_DIALOGS_CSS)
  return () => { releaseStyleNode(style, owner) }
}
