/**
 * dsh-style-tweaks — client-side constants & resolvers.
 *
 * Mirror of the runtime values in `src/config.ts`. Duplicated because the
 * client tsconfig sets `rootDir: src/client`: importing the parent directory
 * at all — a value import OR a type-only one — is rejected, so this file and
 * the type mirror in `tweak-types.ts` both exist for that single reason.
 * (Measured 2026-09-25: `import type { … } from '../config.ts'` fails TS6059
 * "File is not under 'rootDir'" under the emitting config AND under the
 * `--noEmit` config `pnpm typecheck` uses.)
 *
 * Keep the DEFAULTS in lock-step with `src/config.ts`'s `FIELDS` table: it is
 * the source of truth for field names, types and defaults, and
 * `scripts/check-mirrors.mjs` (wired into `pnpm typecheck`) fails when the two
 * sets diverge. The normalisation below has NO server-side counterpart — it is
 * the only place a stored value is made safe, since the store backend returns
 * the persisted document exactly as written and every read goes through
 * `resolveClientConfig`.
 */

import type { ResolvedStyleTweaksConfig } from './tweak-types.ts'

// ── Column-width constants (mirror src/config.ts) ───────────────────────
/** Dialog width min px. */
export const MIN_DIALOG_WIDTH = 600
/** Dialog width max px. */
export const MAX_DIALOG_WIDTH = 1600
/** Stock DSH column width. */
export const DEFAULT_DIALOG_WIDTH = 748
/** Plugin width control default (must match server; see config.ts). */
export const DEFAULT_USE_PLUGIN_WIDTH = false
/** Default side margin in px. */
export const DEFAULT_SIDE_MARGIN = 50
/** Minimum side margin in px. */
export const MIN_SIDE_MARGIN = 32
/** localStorage slot the native handle reads. */
export const CONVERSATION_WIDTH_STORAGE_KEY = 'dsh.conversation.contentWidth'

// ── CSS tweak constants (mirror src/config.ts) ──────────────────────────
/** Default state of the stable-session-title tweak (off: the hover reveal stays). */
export const DEFAULT_STABLE_SESSION_TITLE = false
/** Default state of the hide-session-hover-actions tweak (off: the host's hover buttons stay). */
export const DEFAULT_HIDE_SESSION_HOVER_ACTIONS = false
/** Default state of the keep-turn-rail tweak (off: the host's 900px container query stands). */
export const DEFAULT_KEEP_TURN_RAIL = false
/** Default state of the code-block-flush-top tweak. */
export const DEFAULT_CODE_BLOCK_FLUSH_TOP = true
/** Default state of the project-running-indicator tweak. */
export const DEFAULT_PROJECT_RUNNING_INDICATOR = true
/** Default state of the locate-current-session tweak. */
export const DEFAULT_LOCATE_CURRENT_SESSION = true
/** Default state of the settings-nav-scroll tweak. */
export const DEFAULT_SETTINGS_NAV_SCROLL = true
/** Default state of the sidebar middle-click close tweak (on: browser-tab convention). */
export const DEFAULT_SIDEBAR_MIDDLE_CLICK_CLOSE = true
/** Default state of the legacy-stats-line tweak (off: the host's new pills stay). */
export const DEFAULT_LEGACY_STATS_LINE = false
/** Default state of the pills-cache-hit-decimals tweak (off: integer percent, as shipped). */
export const DEFAULT_PILLS_CACHE_HIT_DECIMALS = false
/** Default state of the turn-time-pill tweak (off: the 0.1.7 tail stays as shipped). */
export const DEFAULT_TURN_TIME_PILL = false
/** Default state of the turn-process-counts tweak (on: restore the 0.1.6 tally). */
export const DEFAULT_TURN_PROCESS_COUNTS = true
/** Default state of the running-status tweak (on: restore the 0.1.6 live-tail line). */
export const DEFAULT_RUNNING_STATUS = true
/** Default state of the opaque-stat-dialogs tweak (off: the 0.1.7 frosted material stays). */
export const DEFAULT_OPAQUE_STAT_DIALOGS = false
/** Default state of the context-pill-no-tooltip tweak (off: the shipped tooltip stays). */
export const DEFAULT_CONTEXT_PILL_NO_TOOLTIP = false
/** Default state of the legacy-context-meter tweak (off: the alpha.2 capsule stays). */
export const DEFAULT_LEGACY_CONTEXT_METER = false
/** Default state of the workspace-close tweak (off: the stock Workspace list stays complete). */
export const DEFAULT_WORKSPACE_CLOSE = false
/** Default state of the Desktop-only external Settings launcher (off). */
export const DEFAULT_DESKTOP_SETTINGS_LAUNCHER = false
/** No Workspace is closed until the user closes one. */
export const DEFAULT_CLOSED_WORKSPACES: readonly string[] = []
/** Default state of the right-Sidebar initial-width tweak (off: the host keeps its own 45%). */
export const DEFAULT_RIGHTBAR_INITIAL_WIDTH = false
/** Default right Sidebar first-open width percentage (equals the host's 45%). */
export const DEFAULT_RIGHTBAR_WIDTH_PERCENT = 45
/** Minimum configurable right Sidebar width percentage. */
export const MIN_RIGHTBAR_WIDTH_PERCENT = 15
/** Maximum configurable right Sidebar width percentage (= the host's 70% cap). */
export const MAX_RIGHTBAR_WIDTH_PERCENT = 70

// ── History page-size constants (mirror src/config.ts) ──────────────────
/** Whether the custom history page size is active. */
export const DEFAULT_HISTORY_PAGE_SIZE_ENABLED = false
/** Default page size once the control is enabled. */
export const DEFAULT_HISTORY_PAGE_SIZE = 500
/** Whether opening a session (cold start) also uses the exact page size. */
export const DEFAULT_HISTORY_PAGE_SIZE_COLD_START = true
/** Minimum configurable page size, matching the host's ordinary page floor. */
export const MIN_HISTORY_PAGE_SIZE = 50
/** Maximum messages per page (UI guardrail; see src/config.ts). */
export const MAX_HISTORY_PAGE_SIZE = 1000
/** Step for the page-size stepper. */
export const STEP_HISTORY_PAGE_SIZE = 50

/**
 * Normalize a boolean flag to a real boolean.
 *
 * `value?.flag ?? DEFAULT_FLAG` is not enough for the 22 on/off fields: it
 * keeps any truthy value the store happened to hand over. Nothing on the read
 * path type-checks a stored document — `readStore` only validates the
 * document's shape (`isStoreDoc`: a `revision` plus a `values` object), and
 * the panel's own writes are the sole reason a field is normally a boolean.
 * So a store written by hand or by an older version can hold
 * `"stableSessionTitle": "false"`, and the nullish coalescing keeps that
 * string: `"false"` is truthy, and the tweak the user switched off comes back.
 * Only `true` is on.
 * @param value - Raw stored value, of unknown shape.
 * @param fallback - The field's default, used for anything that is not a boolean.
 * @returns The stored boolean, or the default.
 */
export function resolveFlag(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Normalize a dialog width value (legacy strings included) to px.
 * The only definition — the server normalises nothing (see the header).
 */
export function resolveDialogWidth(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, Math.round(value)))
  }
  return DEFAULT_DIALOG_WIDTH
}

/**
 * Normalize a side-margin value (legacy strings included) to px.
 * The only definition — the server normalises nothing (see the header).
 */
export function resolveSideMargin(value: number | undefined): number {
  if (typeof value === 'number') return Math.max(MIN_SIDE_MARGIN, Math.round(value))
  return DEFAULT_SIDE_MARGIN
}

/**
 * Normalize a right-Sidebar width percentage.
 * The only definition — the server normalises nothing (see the header).
 */
export function resolveRightbarPercent(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_RIGHTBAR_WIDTH_PERCENT, Math.max(MIN_RIGHTBAR_WIDTH_PERCENT, Math.round(value)))
  }
  return DEFAULT_RIGHTBAR_WIDTH_PERCENT
}

/**
 * Normalize the history page size to a whole number of messages.
 * The only definition — the server normalises nothing (see the header).
 */
export function resolveHistoryPageSize(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(MIN_HISTORY_PAGE_SIZE, Math.round(value)))
  }
  return DEFAULT_HISTORY_PAGE_SIZE
}

/**
 * Normalize the closed-Workspace id list: keep non-empty strings only.
 * The only definition — the server normalises nothing (see the header).
 */
export function resolveClosedWorkspaces(value: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(value)) return DEFAULT_CLOSED_WORKSPACES
  const ids = value.filter((id): id is string => typeof id === 'string' && id !== '')
  return ids.length === 0 ? DEFAULT_CLOSED_WORKSPACES : ids
}

/**
 * Build a fully-defaulted ResolvedStyleTweaksConfig from any
 * partial input. The single runtime resolver for this plugin.
 */
export function resolveClientConfig(
  value: Partial<ResolvedStyleTweaksConfig> | undefined,
): ResolvedStyleTweaksConfig {
  return {
    dialogWidth: resolveDialogWidth(value?.dialogWidth),
    usePluginWidth: resolveFlag(value?.usePluginWidth, DEFAULT_USE_PLUGIN_WIDTH),
    sideMargin: resolveSideMargin(value?.sideMargin),
    stableSessionTitle: resolveFlag(value?.stableSessionTitle, DEFAULT_STABLE_SESSION_TITLE),
    hideSessionHoverActions: resolveFlag(value?.hideSessionHoverActions, DEFAULT_HIDE_SESSION_HOVER_ACTIONS),
    keepTurnRail: resolveFlag(value?.keepTurnRail, DEFAULT_KEEP_TURN_RAIL),
    codeBlockFlushTop: resolveFlag(value?.codeBlockFlushTop, DEFAULT_CODE_BLOCK_FLUSH_TOP),
    projectRunningIndicator: resolveFlag(value?.projectRunningIndicator, DEFAULT_PROJECT_RUNNING_INDICATOR),
    locateCurrentSession: resolveFlag(value?.locateCurrentSession, DEFAULT_LOCATE_CURRENT_SESSION),
    settingsNavScroll: resolveFlag(value?.settingsNavScroll, DEFAULT_SETTINGS_NAV_SCROLL),
    sidebarMiddleClickClose: resolveFlag(value?.sidebarMiddleClickClose, DEFAULT_SIDEBAR_MIDDLE_CLICK_CLOSE),
    legacyStatsLine: resolveFlag(value?.legacyStatsLine, DEFAULT_LEGACY_STATS_LINE),
    pillsCacheHitDecimals: resolveFlag(value?.pillsCacheHitDecimals, DEFAULT_PILLS_CACHE_HIT_DECIMALS),
    turnTimePill: resolveFlag(value?.turnTimePill, DEFAULT_TURN_TIME_PILL),
    turnProcessCounts: resolveFlag(value?.turnProcessCounts, DEFAULT_TURN_PROCESS_COUNTS),
    runningStatus: resolveFlag(value?.runningStatus, DEFAULT_RUNNING_STATUS),
    opaqueStatDialogs: resolveFlag(value?.opaqueStatDialogs, DEFAULT_OPAQUE_STAT_DIALOGS),
    contextPillNoTooltip: resolveFlag(value?.contextPillNoTooltip, DEFAULT_CONTEXT_PILL_NO_TOOLTIP),
    legacyContextMeter: resolveFlag(value?.legacyContextMeter, DEFAULT_LEGACY_CONTEXT_METER),
    workspaceClose: resolveFlag(value?.workspaceClose, DEFAULT_WORKSPACE_CLOSE),
    desktopSettingsLauncher: resolveFlag(value?.desktopSettingsLauncher, DEFAULT_DESKTOP_SETTINGS_LAUNCHER),
    closedWorkspaces: resolveClosedWorkspaces(value?.closedWorkspaces),
    rightbarInitialWidth: resolveFlag(value?.rightbarInitialWidth, DEFAULT_RIGHTBAR_INITIAL_WIDTH),
    rightbarWidthPercent: resolveRightbarPercent(value?.rightbarWidthPercent),
    historyPageSizeEnabled: resolveFlag(value?.historyPageSizeEnabled, DEFAULT_HISTORY_PAGE_SIZE_ENABLED),
    historyPageSize: resolveHistoryPageSize(value?.historyPageSize),
    historyPageSizeColdStart: resolveFlag(value?.historyPageSizeColdStart, DEFAULT_HISTORY_PAGE_SIZE_COLD_START),
  }
}