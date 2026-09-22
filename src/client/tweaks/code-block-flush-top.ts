/**
 * DSH-style-tweaks — code-block-flush-top tweak.
 *
 * Removes the 16 px of top whitespace above and inside every highlighted
 * code block so the highlighted box sits flush with the preceding
 * paragraph, list item, or heading *and* the first line of code sits flush
 * with the top edge of the box. The right, bottom, and left sides keep
 * 16 px so a code block still breathes inside its parent column and the
 * code itself still has lateral breathing room.
 *
 * ## Symptom
 *
 * DSH renders every markdown code fence through `CodeBlock`
 * (`packages/client/ui-primitives/src/markdown/CodeBlock.tsx:60`), which
 * wraps the highlighted `<pre>` in a banner + `<pre>` pair:
 *
 *   <div className={clsx(css.block, 'md-code-block', className)}>
 *     <div className={css.bannerWrap}> ... language / copy button ... </div>
 *     <pre className="shiki css-variables"> ... highlighted code ... </pre>
 *   </div>
 *
 * Two 16 px gaps stack vertically to create the "blank space above the
 * code" the user sees:
 *
 *   1. The wrapper `.block` carries `margin: 16px 0` (DSH's
 *      `CodeBlock.module.css:13`), so the highlighted code is offset 16 px
 *      from preceding content (paragraph, list item, heading, ...).
 *   2. The inner `<pre>` carries `padding: 16px` (CodeBlock.module.css:73),
 *      so the first line of code sits 16 px below the banner / box edge.
 *
 * Chrome DevTools exposes these on two different elements — clicking on the
 * `<pre class="shiki css-variables">` shows `padding: 16px`, clicking on
 * the `<div class="_block_xxxxx md-code-block">` wrapper shows
 * `margin: 16px`. Both need to go for the code to sit flush.
 *
 * ## Fix
 *
 * Two rules on the stable `.md-code-block` hook (one of the hand-written
 * classes DSH reserves for plugins and extensions, like `.md-table-wide`):
 *
 *   - `.md-code-block { margin-top: 0 !important }` collapses the outer
 *     gap above the box. Only `margin-top` is touched: writing a full
 *     `margin: 0 16px 16px 16px` would add 16 px of left/right margin to
 *     the wrapper, shrinking the visible code box by 32 px (a regression
 *     reported by the user as "the box shrinks by a ring"). The wrapper's
 *     horizontal sizing is owned by the conversation column — there is no
 *     left/right margin on `.block` to preserve.
 *   - `.md-code-block pre { padding: 0 16px 16px 16px !important }`
 *     collapses the inner gap above the code. The streaming arm of
 *     `CodeBlock.tsx:130` mounts `<pre>` as a direct child of the wrapper;
 *     the settled arm (`CodeBlock.tsx:166`) wraps it in an anonymous
 *     `<div>` for the `dangerouslySetInnerHTML` sink. A descendant selector
 *     matches both arms identically.
 *
 * ## Specificity
 *
 * DSH's rules in play:
 *
 *   .block                                  { margin: 16px 0 }        (0,0,1,0)
 *   .block:not(:last-child)                 { margin-bottom: 11px }   (0,0,2,0)
 *   .block :where(pre)                      { padding: 16px }         (0,0,2,0)
 *
 * A plain `.md-code-block { ... !important }` is (0,0,1,0) and would lose
 * to `.block:not(:last-child)` on the trailing-edge specificity tiebreak
 * (the :not() pseudo-class adds one to specificity). Doubling the class —
 * .md-code-block.md-code-block — reaches (0,0,2,0) and ties; !important
 * then takes precedence on importance, leaving us in control of all four
 * edges.
 *
 * The inner-pre selector uses .md-code-block.md-code-block pre, which is
 * (0,0,2,1) — that strictly beats DSH's .block :where(pre) (0,0,2,0) on
 * total specificity. The !important is belt-and-suspenders, but the
 * specificity win alone is enough.
 *
 * ## Scope safety
 *
 * `.md-code-block` is set in exactly one place in DSH's source
 * (`CodeBlock.tsx:170`); DSH reserves it for plugins/extensions so future
 * code does not collide. The empty-fence branch (`renderCode` in
 * `packages/client/ui-primitives/src/markdown/render.tsx:312-321`) renders a
 * bare `<pre>` without `.md-code-block`, so empty fences are untouched —
 * they have no banner/wrapper anyway.
 *
 * Streaming and settled arms of `CodeBlock` (`CodeBlock.tsx:130` streaming
 * `<pre>`, `:166` settled `<div dangerouslySetInnerHTML>`) share the same
 * wrapper class, so both arms are affected uniformly by the descendant
 * selector.
 */

const CODE_BLOCK_FLUSH_TOP_CSS = `
/* Outer gap above the highlighted box: DSH's wrapper rule (.block { margin:
 * 16px 0 }, CodeBlock.module.css:13) sets the wrapper's top/bottom margin
 * via a single-class selector hashed by CSS Modules (specificity 0,0,1,0).
 * DSH also tightens the trailing edge with .block:not(:last-child) {
 * margin-bottom: 11px } — that one has specificity 0,0,2,0. We double-up
 * .md-code-block (the stable hand-written hook reserved for plugins,
 * CodeBlock.tsx:170) to reach 0,0,2,0 + !important so we beat the
 * trailing-edge tightening on the importance tiebreak.
 *
 * Only margin-top is reset: writing margin: 0 16px 16px 16px !important
 * would add 16 px of left/right margin to the wrapper, shrinking the
 * visible code box by 32 px (the user reported the box "shrinks by a
 * ring"). Setting just margin-top: 0 !important collapses the gap above
 * the box while preserving DSH's natural horizontal margin (zero on the
 * wrapper itself — its width comes from the conversation column). */
.md-code-block,
.md-code-block.md-code-block {
  margin-top: 0 !important;
}

/* Inner gap above the highlighted code itself: DSH's .block :where(pre)
 * rule sets padding: 16px on the pre element (CodeBlock.module.css:71-74).
 * That padding puts the first line of code 16px below the banner / box
 * edge, which reads as "extra blank space inside the box above the code".
 * We collapse only the top edge so the code still breathes laterally.
 *
 * Specificity note: DSH's selector is .block :where(pre) which is
 * (0,0,2,0) (one class + the :where() pseudo-class contributes nothing).
 * A plain descendant selector .md-code-block pre is (0,0,1,1) and DSH
 * still wins on total specificity. So we double-up the class:
 * .md-code-block.md-code-block pre is (0,0,2,1) and beats DSH.
 *
 * The streaming arm of CodeBlock (line 130) mounts pre as a direct child
 * of .md-code-block; the settled arm (line 166) wraps the pre in an extra
 * anonymous div for the dangerouslySetInnerHTML sink. Descendant selection
 * matches both arms identically. */
.md-code-block.md-code-block pre,
.md-code-block.md-code-block pre.shiki {
  padding: 0 16px 16px 16px !important;
}
`

export const CODE_BLOCK_FLUSH_TOP_CSS_ID = 'cst-code-block-flush-top'

export function injectCodeBlockFlushTopStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${CODE_BLOCK_FLUSH_TOP_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = CODE_BLOCK_FLUSH_TOP_CSS_ID
    style.textContent = CODE_BLOCK_FLUSH_TOP_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}