/**
 * dsh-style-tweaks — composer dock layout probe.
 *
 * 0.1.6-alpha.2 rebuilt the composer dock: the `conversation.composer.dock`
 * slot output is no longer a free row under the composer card (a direct
 * child of InputBar's column-flex root) but a member of a new row-flex
 * `.dock` wrapper that also carries the ContextMeter capsule (the context
 * pill). The stats rows therefore need two skins: content-sized with no
 * vertical padding on alpha.2 (the wrapper owns the 4px top pad and the
 * root's bottom clearance is a fixed 4px), and the old self-padded,
 * full-column-centered skin on pre-alpha.2 hosts (where the row must bring
 * its own 4px top pad, carry the `data-composer-stats` marker that tightens
 * the root's 8px bottom clearance, and sum to the 26px the shipped pills
 * row occupies). Both skins live in one stylesheet, gated on an attribute
 * that the row sets at mount time by probing its layout parent: a column
 * flex container means the row sits directly under the card (pre-alpha.2);
 * anything else (the row-flex wrapper among them) takes the alpha.2 skin.
 */

/** Attribute gating the pre-alpha.2 dock skin on a stats row root. */
export const DOCK_LEGACY_ATTR = 'data-cst-dock-legacy'

/**
 * Probe the row's layout parent and gate the legacy skin attribute
 * accordingly. Runs from a layout effect, so the attribute lands before the
 * first paint and the skin never flashes.
 */
export function probeComposerDockLayout(el: HTMLElement | null): void {
  if (el === null) return
  const parent = el.parentElement
  const legacy = parent !== null && getComputedStyle(parent).flexDirection === 'column'
  el.toggleAttribute(DOCK_LEGACY_ATTR, legacy)
}
