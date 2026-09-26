/**
 * dsh-style-tweaks — the settings document as this plugin reads it.
 *
 * The wire document (every field optional) and its resolved form, plus the one
 * function that turns the first into the second. Split out of the entry point
 * because three modules need it: the HTTP client, the panel, and the entry
 * point's own mount loop.
 */

import { resolveClientConfig } from './tweak-config.ts'
import type { ResolvedStyleTweaksConfig } from './tweak-types.ts'

/** Whether this page is the Electron Desktop renderer. */
export function isDesktopRuntime(): boolean {
  return typeof globalThis !== 'undefined' && 'dshDesktop' in globalThis
}

/**
 * The settings document as the plugin's own route returns it (every field
 * optional), and the same document with every default materialized.
 *
 * Both are aliases of the mirrors in `tweak-types.ts` instead of second
 * hand-written copies, and `resolveValue` below delegates to
 * `resolveClientConfig` — the one runtime resolver. A field that exists on one
 * side only is therefore a compile error rather than a default that silently
 * drifts.
 */
export type TweaksValue = Partial<ResolvedStyleTweaksConfig>
export type ResolvedTweaks = ResolvedStyleTweaksConfig

/** One settings snapshot as it crosses the wire. */
export interface Snapshot {
  writable: boolean
  value: TweaksValue
  revision: number
}

/** Resolve a wire document (or nothing) into a fully-defaulted one. */
export function resolveValue(value: TweaksValue | undefined): ResolvedTweaks {
  // Delegates to the client mirror in tweak-config.ts so there is exactly one
  // place where a missing field falls back to its default. The previous
  // hand-written copy here was a fourth, unverified default site.
  return resolveClientConfig(value)
}

/**
 * Whether two resolved snapshots would mount the same tweaks with the same
 * captured values. Two groups of keys are deliberately ignored, because
 * neither drives a mount:
 *
 *   - `closedWorkspaces` — only the `workspaceClose` boolean mounts anything,
 *     and the workspace-close tweak holds its own live channel to the settings
 *     client, so it re-filters in place. Excluding it keeps a close/restore —
 *     by far the most frequent settings change this plugin sees — from
 *     re-mounting every tweak.
 *   - `historyPageSize*` — the history page size is a transport feature: its
 *     rewrites install once per page load and `sync` pushes the live targets
 *     itself, above this check. Without the exclusion every ± click on the
 *     stepper would tear down and re-install every tweak.
 *
 * Both exclusions are safe only because `sync` does its transport work before
 * consulting this function — keep that order.
 */
export function sameMountInputs(left: ResolvedTweaks, right: ResolvedTweaks): boolean {
  for (const key of Object.keys(right) as Array<keyof ResolvedTweaks>) {
    if (key === 'closedWorkspaces') continue
    if (key === 'historyPageSizeEnabled' || key === 'historyPageSize' || key === 'historyPageSizeColdStart') continue
    if (left[key] !== right[key]) return false
  }
  return true
}
