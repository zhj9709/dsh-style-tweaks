/**
 * dsh-style-tweaks — the trigger-anchored placement both restored stat pills use.
 *
 * ## Why this module exists
 *
 * Through 0.2.2-rc.1 the host's `stat-dialog` seat placed its panel with
 * `useAnchoredPosition` from `@deepseek-ai/dsh-client-ui-primitives`, and both
 * ported seats here (`turn-time-pill.tsx`, `pills-cache-hit-decimals.tsx`)
 * borrowed that hook rather than re-deriving the same clamp.
 *
 * 0.2.2-rc.2 deleted the export. Its own stat dialogs moved to CSS anchor
 * positioning (`useStatDialog` now hands back an `anchorName` instead of a
 * `pos`), and the primitive went with the old implementation. The import in
 * this plugin then evaluated to `undefined`, so calling it threw on every
 * render of either pill — and a slot entry that throws is dropped whole, which
 * is why the turn-time pill and the composer usage pill vanished instead of
 * merely losing their dialogs. Measured live on 0.2.2-rc.3:
 * `TypeError: (0, dsh_client_ui_primitives_1.useAnchoredPosition) is not a
 * function` with `slot entry crashed in 'conversation.chat.assistant-actions'`.
 *
 * ## What replaces it
 *
 * The same placement contract, measured here instead of inherited: fixed
 * above the trigger, left-aligned with it (the primitive's `align: 'start'`
 * default, which the host's own CSS anchor placement also uses), clamped into
 * the viewport by `margin` and flipped below the trigger when it does not fit
 * above. This keeps the plugin working on every host in its supported range —
 * the primitive is gone in rc.2, but CSS anchor positioning is not something an
 * older host (or a browser without it) can be assumed to have, and the panels
 * are portaled to `document.body` anyway.
 *
 * The panel is measured on its first layout pass with the caller's
 * hidden-but-laid-out style (`visibility: hidden; left: 0; top: 0`), which is
 * the host's own measure trick; the returned position then replaces it. A
 * `ResizeObserver` re-measures when the panel resizes, and scroll/resize
 * listeners keep the placement honest while the dialog is open.
 *
 * Dismissal stays on the host primitive that still exists
 * (`useDismissOnOutsidePointer`); each pill keeps its own Escape and
 * outside-click rules beside it.
 *
 * @module dsh-style-tweaks/client/tweaks/stat-panel-placement
 */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/** Viewport margin the placement clamp keeps (the host stat-dialog value). */
export const STAT_PANEL_MARGIN = 12
/** Distance between the trigger edge and the panel. */
export const STAT_PANEL_GAP = 8

/**
 * Unplaced portal panel: hidden but laid out so the placement measures real
 * dimensions on its first pass.
 */
export const STAT_PANEL_MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/** One fixed-position placement, in viewport coordinates. */
export type StatPanelPosition = Pick<CSSProperties, 'left' | 'top'>

/** What the placement needs from the caller. */
export interface StatPanelPlacementOptions {
  /** Whether the panel is mounted; a closed panel has no placement. */
  readonly open: boolean
  /** The trigger the panel is anchored to. */
  readonly anchorRef: RefObject<HTMLElement>
  /** The portaled panel being placed. */
  readonly panelRef: RefObject<HTMLElement>
  /** Viewport margin kept on every side. */
  readonly margin?: number
  /** Distance between the trigger and the panel. */
  readonly gap?: number
}

/**
 * Clamp one panel above its trigger, or below it when it does not fit above.
 * @param anchor - Trigger bounds in viewport coordinates.
 * @param panel - Panel bounds in viewport coordinates.
 * @param gap - Distance between the trigger edge and the panel.
 * @param margin - Viewport margin kept on every side.
 * @returns The fixed-position coordinates for the panel.
 */
function placeAbove(anchor: DOMRect, panel: DOMRect, gap: number, margin: number): StatPanelPosition {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  // Left-aligned with the trigger (the old primitive's `align: 'start'`), then
  // clamped: `max` first so a panel wider than the viewport still starts at the
  // margin instead of going negative.
  const left = Math.min(Math.max(anchor.left, margin), Math.max(margin, viewportWidth - panel.width - margin))
  const above = anchor.top - panel.height - gap
  if (above >= margin) return { left, top: above }
  // The host's own flip: below the trigger, clamped into the viewport on both
  // edges — a trigger scrolled out of view must not take the panel with it.
  const below = anchor.bottom + gap
  return {
    left,
    top: Math.min(Math.max(below, margin), Math.max(margin, viewportHeight - panel.height - margin)),
  }
}

/**
 * Measure and clamp one stat panel against its trigger.
 *
 * The caller renders the panel with {@link STAT_PANEL_MEASURE_STYLE} while
 * `pos` is null; this hook measures it on that first layout pass and returns
 * the placement, then keeps it current while open.
 * @param options - Open state, the two refs, and the clamp distances.
 * @returns The panel's fixed-position coordinates, or null while closed.
 */
export function useStatPanelPlacement({
  open,
  anchorRef,
  panelRef,
  margin = STAT_PANEL_MARGIN,
  gap = STAT_PANEL_GAP,
}: StatPanelPlacementOptions): StatPanelPosition | null {
  const [pos, setPos] = useState<StatPanelPosition | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = (): void => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (anchor === null || panel === null) return
      const next = placeAbove(anchor.getBoundingClientRect(), panel.getBoundingClientRect(), gap, margin)
      setPos(current => current !== null && current.left === next.left && current.top === next.top ? current : next)
    }
    place()
    // The panel's content is final when it mounts, but fonts or a late style
    // pass can still change its height; the observer re-places when it does.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    if (observer !== null && panelRef.current !== null) observer.observe(panelRef.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, panelRef, gap, margin])

  return pos
}
