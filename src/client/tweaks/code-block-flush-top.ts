/**
 * DSH-style-tweaks — code-block-flush-top tweak.
 *
 * Collapses the padding above the first line of code inside every
 * highlighted code block, so the code sits flush with the top edge of its
 * box — in the card form the chat renders today, flush with the card's
 * header row.
 *
 * ## Scope: the inside of the box only
 *
 * The space *around* a code block — between the box and the preceding
 * paragraph, list item, or heading, and between the box and whatever
 * follows — is deliberately left exactly as the host draws it. An earlier
 * version of this tweak also pulled the box itself up against the text
 * above; that was reverted (2026-10-04, at the user's request) because this
 * setting must not change the spacing between the code block and the
 * surrounding text.
 *
 * The margins are left alone for a mechanical reason too: the visible gap
 * above a box is a *collapsed* margin. The box's own `margin-top: 16px`
 * (`.block`, CodeBlock.module.css) collapses with the preceding block's
 * bottom margin (`p` / `ul` / `ol` 16 px, `h1`–`h3` 16 px, `hr` 32 px, all
 * in MarkdownText.module.css), and the larger of the two wins — so zeroing
 * the box's own margin alone never moved anything. Removing that gap for
 * real requires a sibling rule that zeroes the *preceding element's* bottom
 * margin, which is precisely the change that alters the spacing to the text
 * above. Do not re-add either.
 *
 * ## Symptom
 *
 * DSH renders every markdown code fence through `CodeBlock`
 * (`packages/client/ui-primitives/src/markdown/CodeBlock.tsx:188`), which
 * wraps a header row and the highlighted code in one box:
 *
 *   <div className="… _block_… md-code-block [_card_…]">
 *     <div className="… _bannerWrap_…"> header / language / copy button </div>
 *     <div className="… _content_…" data-code-block-content>   <pre class="shiki"> …
 *
 * The space inside the box above the first line of code comes from the
 * inner `<pre>`:
 *
 *   - banner arm (no `toolbarLabels`): `.block :where(pre) { padding: 16px }`
 *   - card arm (`CodeBlock.tsx:188` adds `css.card` when `toolbarLabels` is
 *     passed; the chat markdown path has passed it since 0.1.7-alpha.2):
 *     `.card :where(pre) { padding: 6px 22px 20px }`
 *
 * ## Fix
 *
 * One rule on the stable `.md-code-block` hook (one of the hand-written
 * classes DSH reserves for plugins, like `.md-table-wide`):
 *
 *   `.md-code-block.md-code-block pre { padding-top: 0 !important }`
 *
 * Only the top edge is collapsed. The host's lateral and bottom insets
 * survive — the card arm keeps its 22 px sides and 20 px bottom, so the
 * code stays aligned with the header above it — and the box's own margins
 * are untouched, so the spacing to the text before and after it is exactly
 * what it is with the tweak off. The streaming arm of `CodeBlock.tsx`
 * mounts `<pre>` as a direct child of the wrapper; the settled arm wraps it
 * in the `display: contents` content div. A descendant selector matches
 * both arms identically.
 *
 * ## Specificity
 *
 * DSH's rules in play:
 *
 *   .block          { margin: 16px 0 }   (0,0,1,0)   — untouched, see above
 *   .block :where(pre)  { padding: 16px }        (0,0,1,0)   (:where adds 0)
 *   .card :where(pre)   { padding: 6px 22px 20px }   (0,0,1,0)
 *   .markdown pre       { margin: 16px 0; … }        (0,0,1,1)
 *
 * `.md-code-block.md-code-block pre` is (0,0,2,1) and strictly beats all of
 * them — one more class than `.markdown pre`, two more than the two
 * `:where(pre)` rules. The !important is belt-and-suspenders.
 *
 * ## Scope safety
 *
 * `.md-code-block` is set in exactly one place in DSH's source
 * (`CodeBlock.tsx:188`); DSH reserves it for plugins/extensions so future
 * code does not collide. The empty-fence branch (`renderCode` in
 * `packages/client/ui-primitives/src/markdown/render.tsx`) renders a bare
 * `<pre>` without `.md-code-block`, so empty fences are untouched — they
 * have no banner/wrapper anyway.
 */

import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

const CODE_BLOCK_FLUSH_TOP_CSS = `
/* Inner gap above the highlighted code itself: the banner arm sets
 * padding: 16px on <pre>, the card arm sets 6px 22px 20px. Collapsing only
 * the top edge keeps the host's lateral and bottom insets, so the card's
 * code stays aligned with its header row.
 *
 * Specificity: .md-code-block.md-code-block pre is (0,0,2,1) and beats
 * DSH's .block :where(pre) and .card :where(pre) (both (0,0,1,0), :where
 * adds nothing) as well as .markdown pre (0,0,1,1); !important is belt and
 * suspenders. Descendant (not >) selection covers the streaming arm's
 * direct <pre> and the settled arm's content div alike.
 *
 * Nothing outside the box is touched: no margin rules here, on purpose —
 * the gap above a box is a collapsed margin owned by the preceding
 * element, and zeroing it would change the spacing between the code block
 * and the surrounding text. */
.md-code-block.md-code-block pre,
.md-code-block.md-code-block pre.shiki {
  padding-top: 0 !important;
}
`

export const CODE_BLOCK_FLUSH_TOP_CSS_ID = 'cst-code-block-flush-top'

export function injectCodeBlockFlushTopStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${CODE_BLOCK_FLUSH_TOP_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = CODE_BLOCK_FLUSH_TOP_CSS_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, CODE_BLOCK_FLUSH_TOP_CSS)
  return () => { releaseStyleNode(style, owner) }
}
