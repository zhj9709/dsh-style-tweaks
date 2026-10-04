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

import type { Context as ClientContext } from '@deepseek-ai/cordis'

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

/** Dock entry id the stats pills occupied through 0.2.0 (one entry, both pills). */
const SINGLE_STATS_ID = 'stats'

/** Dock entry ids 0.2.1-alpha.1 split that one entry into (`activity`, `usage`). */
const SPLIT_STATS_IDS = ['activity', 'usage'] as const

/** One composer-dock stats cell: the entry id to claim and the dock's own order for it. */
export interface ComposerStatsCell {
  readonly id: string
  readonly order: number
}

/** The cells a host ships: never empty, so a caller may take the first unconditionally. */
export type ComposerStatsCells = readonly [ComposerStatsCell, ...ComposerStatsCell[]]

/**
 * The composer-dock stats cells the host ships, in display order.
 *
 * 0.2.1-alpha.1 split the single `stats` list entry into one entry per pill —
 * `activity` (order 0: counts and speed) and `usage` (order 1: tokens and
 * cache hit) — and its README states the replacement contract: claim the same
 * id at the same `order` and win the cell with a lower `priority`. A tweak
 * that shadows "the stats row" therefore has to claim whichever cells the
 * host actually registered, which is what this resolver reads off the slot
 * ledger.
 *
 * The host's own registrations are the priority-0 occupants: registering the
 * same id at the same priority throws (`SlotCore.register`), so at priority 0
 * a cell can only be the host's, never another plugin's or this one's (the
 * shadows here all sit lower). `order` is carried through so a replacement
 * keeps the dock's arrangement.
 *
 * Hosts through 0.2.0 keep the single `stats` cell, and so does a host whose
 * stats entries are not on the ledger yet. That second case is the resolver's
 * one assumption, and two facts keep it from firing on a split host:
 *
 *   • Boot — the client loads the shipped packages before plugin bundles, so
 *     the host's entries are registered before any tweak's `slots.inject`
 *     callback runs (the callback then runs synchronously, the dock already
 *     being declared). Measured on 0.2.1-alpha.1: the first paint resolves
 *     the split pair.
 *   • Re-declaration — `slots.inject` reconciles through
 *     `subscribeDeclaration`, whose listeners are a `Set` walked in
 *     installation order: the host's own injected registrations (installed
 *     with the app, before this plugin's) re-register first, so by the time
 *     this callback re-runs the entries are back on the ledger.
 */
export function composerStatsCells(ctx: ClientContext): ComposerStatsCells {
  const occupant = (id: string): ComposerStatsCell | null => {
    for (const entry of ctx.slots.entries('conversation.composer.dock')) {
      if ((entry.options.priority ?? 0) !== 0) continue
      if (entry.options.id !== id) continue
      return { id, order: entry.options.order ?? 0 }
    }
    return null
  }
  const [split, ...rest] = SPLIT_STATS_IDS
    .map(occupant)
    .filter((cell): cell is ComposerStatsCell => cell !== null)
  if (split !== undefined) return [split, ...rest]
  return [{ id: SINGLE_STATS_ID, order: occupant(SINGLE_STATS_ID)?.order ?? 0 }]
}
