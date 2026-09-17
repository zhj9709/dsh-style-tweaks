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
 *
 * The slot machinery renders its cell's output through a `display: contents`
 * wrapper on every host, so `parentElement` itself generates no box and its
 * `flexDirection` computes to the initial `row` regardless of the layout —
 * reading it directly would classify both dock generations as row-flex
 * (which alpha.2 "passed" by coincidence and alpha.1 failed). The probe
 * therefore walks up past every `display: contents` ancestor and reads the
 * flex direction of the first ancestor that actually lays the row out:
 * InputBar's column-flex root on pre-alpha.2 hosts, the row-flex `.dock`
 * wrapper on alpha.2+.
 */
export function probeComposerDockLayout(el: HTMLElement | null): void {
  if (el === null) return
  let node = el.parentElement
  while (node !== null && getComputedStyle(node).display === 'contents') {
    node = node.parentElement
  }
  const legacy = node !== null && getComputedStyle(node).flexDirection === 'column'
  el.toggleAttribute(DOCK_LEGACY_ATTR, legacy)
}
