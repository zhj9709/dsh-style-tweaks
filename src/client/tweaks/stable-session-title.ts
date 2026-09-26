/**
 * dsh-style-tweaks — stable-session-title tweak.
 *
 * Restores the session-row title behaviour DSH shipped through
 * 0.1.6-alpha.1: an overlong title keeps its resting ellipsis at the start
 * of the text and never moves. 0.1.6-alpha.2 added a hover reveal — while
 * the pointer rests on a session row, `Rows.tsx`'s `revealClippedTitle`
 * scrolls the clipping title element to its end (`.sessionRow .title`
 * glides there through `scroll-behavior: smooth`) and drops the ellipsis
 * on hover (`.sessionRow:hover .title { text-overflow: clip }`); leaving
 * the row snaps the title back. The glide is the "title moves when I hover
 * a session" motion this tweak turns off.
 *
 * ## Mechanism
 *
 * One CSS rule turns the title element from a scroll container into a
 * clipped, non-scrollable one — `overflow: clip` and `text-overflow:
 * ellipsis`, both `!important`:
 *
 * `overflow: clip` is not a scrolling box, so the host's programmatic
 * `scrollLeft`/`scrollTo` assignment becomes a no-op (the resting position
 * stays 0) — the host JS keeps running untouched and simply has nothing to
 * move. `text-overflow: ellipsis` out-specifies the host's
 * `.sessionRow:hover .title` (a specificity tie at 0,3,0, where
 * `!important` decides) so the hover state no longer drops the ellipsis,
 * matching alpha.1's always-ellipsis look.
 *
 * A second rule turns off the marquee's edge fade masks. The host publishes
 * them as `data-scrolled` (left edge fades in over 12px once the marquee has
 * left the start) and `data-clipped` (right edge fades while text remains
 * beyond the cell) on the title span, but `Rows.tsx`'s `placeTitle` sets them
 * from the position the marquee *asked* for, not from the element's actual
 * `scrollLeft`. With the title pinned at the start, `data-scrolled` still
 * arrives, so the left fade lands on the title's own first characters — the
 * text under the pointer starts out smudged and the smudge stays for as long
 * as the row is hovered. Neither edge has a legitimate fade to draw while the
 * title never moves, so both are switched off.
 *
 * ## Selector safety
 *
 * The scoping is structural: session rows are the workspace browser's
 * `role="treeitem"` elements WITHOUT `aria-expanded` (workspace rows carry
 * it), and the title is the span whose CSS-Modules class ends in `_title`
 * (hashed as `<hash>_title`; the `hoverTitle` of the row's hover card ends
 * in a different local name and does not match). An `overflow: clip` box
 * lays out identically to the shipped `overflow: hidden` (both clip in
 * place), so rows whose titles never scroll — the majority — are visually
 * untouched. On 0.1.6-alpha.1 and earlier hosts the rule is harmless: those
 * titles already sit at scroll position 0 and clip in place, so the same
 * declarations change nothing.
 */

import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

const STABLE_SESSION_TITLE_CSS = `
[role="treeitem"]:not([aria-expanded]) [class$="_title"] {
  overflow: clip !important;
  text-overflow: ellipsis !important;
}

[role="treeitem"]:not([aria-expanded]) [class$="_title"][data-scrolled],
[role="treeitem"]:not([aria-expanded]) [class$="_title"][data-clipped] {
  mask-image: none !important;
}
`

export const STABLE_SESSION_TITLE_CSS_ID = 'cst-stable-session-title'

export function injectStableSessionTitleStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${STABLE_SESSION_TITLE_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = STABLE_SESSION_TITLE_CSS_ID
    style.textContent = STABLE_SESSION_TITLE_CSS
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style)
  return () => { releaseStyleNode(style, owner) }
}
