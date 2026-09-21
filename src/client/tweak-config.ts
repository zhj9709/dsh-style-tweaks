/**
 * dsh-style-tweaks — client-side constants & resolvers.
 *
 * Mirror of the runtime values in `src/config.ts`. Duplicated because the
 * client tsconfig has `rootDir: src/client` (and explicitly excludes parent
 * dirs), so a runtime `import` from `../config` is a compile-time error.
 * Keep these in lock-step with `src/config.ts` — the server's schemastery
 * `Config` object is the source of truth for defaults / clamps.
 *
 * Types are still pulled from `src/config.ts` via `import type`, which the
 * rootDir restriction allows (no runtime reference is emitted).
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
/** Default: off — expanded think bodies keep growing with their content. */
export const DEFAULT_THINK_FIXED_HEIGHT = false
/** Default think body height in px while the cap is on. */
export const DEFAULT_THINK_HEIGHT = 300
/** Minimum think body height in px. */
export const MIN_THINK_HEIGHT = 120
/** Maximum think body height in px. */
export const MAX_THINK_HEIGHT = 1200
/** localStorage slot the native handle reads. */
export const CONVERSATION_WIDTH_STORAGE_KEY = 'dsh.conversation.contentWidth'

// ── CSS tweak constants (mirror src/config.ts) ──────────────────────────
/** Default state of the stable-table tweak (off: fixed upstream in DSH 0.1.6-alpha.1). */
export const DEFAULT_STABLE_TABLE = false
/** Default state of the stable-turn-rail tweak. */
export const DEFAULT_STABLE_TURN_RAIL = true
/** Default state of the stable-session-title tweak (off: the hover reveal stays). */
export const DEFAULT_STABLE_SESSION_TITLE = false
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
/** Default state of the turn-speed-metrics tweak (off: the stock footer keeps its shipped shape). */
export const DEFAULT_TURN_SPEED_METRICS = false
/** Default state of the context-pill-no-tooltip tweak (off: the shipped tooltip stays). */
export const DEFAULT_CONTEXT_PILL_NO_TOOLTIP = false
/** Default state of the legacy-context-meter tweak (off: the alpha.2 capsule stays). */
export const DEFAULT_LEGACY_CONTEXT_METER = false
/** Default state of the workspace-close tweak (off: the stock Workspace list stays complete). */
export const DEFAULT_WORKSPACE_CLOSE = false
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
export const DEFAULT_HISTORY_PAGE_SIZE = 200
/** Whether opening a session (cold start) also uses the raised page size. */
export const DEFAULT_HISTORY_PAGE_SIZE_COLD_START = true
/** Minimum individual page size; below this there is nothing to raise. */
export const MIN_HISTORY_PAGE_SIZE = 50
/** Maximum messages per page (UI guardrail; see src/config.ts). */
export const MAX_HISTORY_PAGE_SIZE = 1000
/** Step for the page-size stepper. */
export const STEP_HISTORY_PAGE_SIZE = 50

/**
 * Normalize a dialog width value (legacy strings included) to px.
 * Must match `resolveDialogWidth` in src/config.ts.
 */
export function resolveDialogWidth(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, Math.round(value)))
  }
  return DEFAULT_DIALOG_WIDTH
}

/**
 * Normalize a side-margin value (legacy strings included) to px.
 * Must match `resolveSideMargin` in src/config.ts.
 */
export function resolveSideMargin(value: number | undefined): number {
  if (typeof value === 'number') return Math.max(MIN_SIDE_MARGIN, Math.round(value))
  return DEFAULT_SIDE_MARGIN
}

/**
 * Normalize a think-body height value to px.
 * Must match `resolveThinkHeight` in src/config.ts.
 */
export function resolveThinkHeight(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_THINK_HEIGHT, Math.max(MIN_THINK_HEIGHT, Math.round(value)))
  }
  return DEFAULT_THINK_HEIGHT
}

/**
 * Normalize a right-Sidebar width percentage.
 * Must match `resolveRightbarPercent` in src/config.ts.
 */
export function resolveRightbarPercent(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_RIGHTBAR_WIDTH_PERCENT, Math.max(MIN_RIGHTBAR_WIDTH_PERCENT, Math.round(value)))
  }
  return DEFAULT_RIGHTBAR_WIDTH_PERCENT
}

/**
 * Normalize the history page size to a whole number of messages.
 * Must match `resolveHistoryPageSize` in src/config.ts.
 */
export function resolveHistoryPageSize(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(MIN_HISTORY_PAGE_SIZE, Math.round(value)))
  }
  return DEFAULT_HISTORY_PAGE_SIZE
}

/**
 * Normalize the closed-Workspace id list: keep non-empty strings only.
 * Must match `resolveClosedWorkspaces` in src/config.ts.
 */
export function resolveClosedWorkspaces(value: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(value)) return DEFAULT_CLOSED_WORKSPACES
  const ids = value.filter((id): id is string => typeof id === 'string' && id !== '')
  return ids.length === 0 ? DEFAULT_CLOSED_WORKSPACES : ids
}

/**
 * Build a fully-defaulted ResolvedStyleTweaksConfig from any
 * partial input. Mirror of `resolveConfig` in src/config.ts.
 */
export function resolveClientConfig(
  value: Partial<ResolvedStyleTweaksConfig> | undefined,
): ResolvedStyleTweaksConfig {
  return {
    dialogWidth: resolveDialogWidth(value?.dialogWidth),
    usePluginWidth: value?.usePluginWidth ?? DEFAULT_USE_PLUGIN_WIDTH,
    sideMargin: resolveSideMargin(value?.sideMargin),
    thinkFixedHeight: value?.thinkFixedHeight ?? DEFAULT_THINK_FIXED_HEIGHT,
    thinkHeight: resolveThinkHeight(value?.thinkHeight),
    stableTable: value?.stableTable ?? DEFAULT_STABLE_TABLE,
    stableTurnRail: value?.stableTurnRail ?? DEFAULT_STABLE_TURN_RAIL,
    stableSessionTitle: value?.stableSessionTitle ?? DEFAULT_STABLE_SESSION_TITLE,
    keepTurnRail: value?.keepTurnRail ?? DEFAULT_KEEP_TURN_RAIL,
    codeBlockFlushTop: value?.codeBlockFlushTop ?? DEFAULT_CODE_BLOCK_FLUSH_TOP,
    projectRunningIndicator: value?.projectRunningIndicator ?? DEFAULT_PROJECT_RUNNING_INDICATOR,
    locateCurrentSession: value?.locateCurrentSession ?? DEFAULT_LOCATE_CURRENT_SESSION,
    settingsNavScroll: value?.settingsNavScroll ?? DEFAULT_SETTINGS_NAV_SCROLL,
    sidebarMiddleClickClose: value?.sidebarMiddleClickClose ?? DEFAULT_SIDEBAR_MIDDLE_CLICK_CLOSE,
    legacyStatsLine: value?.legacyStatsLine ?? DEFAULT_LEGACY_STATS_LINE,
    pillsCacheHitDecimals: value?.pillsCacheHitDecimals ?? DEFAULT_PILLS_CACHE_HIT_DECIMALS,
    turnSpeedMetrics: value?.turnSpeedMetrics ?? DEFAULT_TURN_SPEED_METRICS,
    contextPillNoTooltip: value?.contextPillNoTooltip ?? DEFAULT_CONTEXT_PILL_NO_TOOLTIP,
    legacyContextMeter: value?.legacyContextMeter ?? DEFAULT_LEGACY_CONTEXT_METER,
    workspaceClose: value?.workspaceClose ?? DEFAULT_WORKSPACE_CLOSE,
    closedWorkspaces: resolveClosedWorkspaces(value?.closedWorkspaces),
    rightbarInitialWidth: value?.rightbarInitialWidth ?? DEFAULT_RIGHTBAR_INITIAL_WIDTH,
    rightbarWidthPercent: resolveRightbarPercent(value?.rightbarWidthPercent),
    historyPageSizeEnabled: value?.historyPageSizeEnabled ?? DEFAULT_HISTORY_PAGE_SIZE_ENABLED,
    historyPageSize: resolveHistoryPageSize(value?.historyPageSize),
    historyPageSizeColdStart: value?.historyPageSizeColdStart ?? DEFAULT_HISTORY_PAGE_SIZE_COLD_START,
  }
}