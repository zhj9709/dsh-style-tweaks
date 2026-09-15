/**
 * dsh-style-tweaks — stable-table tweak.
 *
 * Backport of DSH 0.1.6-alpha.1's upstream fix for the "text jumps when I
 * hover a table" bug (PR #4133, commit 55a17d2e57, MarkdownText.module.css):
 * on hover the wide-table wrapper goes `overflow-x: auto` + `padding-bottom:
 * 0`, and on a table that fits (`auto` paints no scrollbar) removing the
 * padding shrinks the wrapper by ~8 px and shoves every sibling below it.
 * Upstream fixed this by switching the hover value to `scroll`, whose
 * reserved scrollbar slot exactly replaces the removed padding.
 *
 * This tweak applies exactly that switch, so it works on both generations:
 * on hosts < 0.1.6-alpha.1 it upgrades their `auto` to `scroll` and fixes the
 * jump; on 0.1.6-alpha.1+ it duplicates the upstream rule and is a no-op
 * (forcing `auto`-era padding pinning here instead would *add* the scrollbar
 * slot on top of the upstream `scroll` slot and re-create the jump, 8 px in
 * the opposite direction). Also suppresses non-background transitions as
 * belt-and-braces in case future DSH versions add inner-cell hover effects.
 *
 * Selectors use stable hooks only — `.md-table-wide` is a hand-written
 * class DSH reserves for plugins/extensions; CSS Modules-generated names
 * like `_tableScroll_177e0_174` are intentionally avoided.
 */
const STABLE_TABLE_CSS = `
/* Force the upstream-fixed hover behavior: 'scroll' reserves the scrollbar
 * slot even when the table fits, so on hover that slot exactly replaces the
 * padding DSH removes and the wrapper's outer height never changes. On hosts
 * that already ship this rule (0.1.6-alpha.1+) this is a harmless duplicate.
 *
 * Specificity note: DSH's own rule is something like
 *   .[css-modules].md-table-wide:hover, ...:focus-visible { overflow-x: ... }
 * which has specificity (0, 0, 3, 0). A plain .md-table-wide:hover would only
 * be (0, 0, 2, 0), so even with !important DSH wins on the specificity
 * tiebreak. We double-up the .md-table-wide class to match (and exceed) DSH's
 * specificity. */
.md-table-wide.md-table-wide:hover,
.md-table-wide.md-table-wide:focus-visible {
  overflow-x: scroll !important;
}

/* Belt-and-braces: no animated transitions on geometry properties — even
 * if DSH sets transition: all 0.15s, the value oscillates within a zero
 * range so the user never sees motion. Background-color / color keep
 * transitioning for any highlight effect. */
.md-table-wide table * {
  transition-property: background-color, color !important;
}
`

export const STABLE_TABLE_CSS_ID = 'cst-stable-table'

export function injectStableTableStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${STABLE_TABLE_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = STABLE_TABLE_CSS_ID
    style.textContent = STABLE_TABLE_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}