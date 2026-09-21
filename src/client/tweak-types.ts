/**
 * dsh-style-tweaks — client-side type mirror.
 *
 * Mirror of the type definitions in `src/config.ts`. Duplicated because the
 * client tsconfig has `rootDir: src/client`, so even `import type` from a
 * parent directory is rejected by TS6059 ("file is not under rootDir").
 * Keep these in lock-step with `src/config.ts`.
 *
 * The runtime values (constants, resolvers) live in `tweak-config.ts`.
 */

/** Configuration after static validation, with every default materialized. */
export interface ResolvedStyleTweaksConfig {
  /** Dialog width in px (748 = the stock DSH column). */
  dialogWidth: number
  /** Whether the plugin's width control owns the column (vs. native handles). */
  usePluginWidth: boolean
  /** Side margin in px applied to both sides of the conversation column. */
  sideMargin: number
  /** Whether the think (reasoning) body is capped at a fixed height. */
  thinkFixedHeight: boolean
  /** Think body display height in px while `thinkFixedHeight` is on. */
  thinkHeight: number
  /** Whether the stable-table tweak is enabled. */
  stableTable: boolean
  /** Whether the stable-turn-rail tweak is enabled. */
  stableTurnRail: boolean
  /** Whether the session titles stay put with their ellipsis on hover. */
  stableSessionTitle: boolean
  /** Whether the keep-turn-rail tweak is enabled. */
  keepTurnRail: boolean
  /** Whether the code-block-flush-top tweak is enabled. */
  codeBlockFlushTop: boolean
  /** Whether the project-running-indicator tweak is enabled. */
  projectRunningIndicator: boolean
  /** Whether the locate-current-session tweak is enabled. */
  locateCurrentSession: boolean
  /** Whether the settings-nav-scroll tweak is enabled. */
  settingsNavScroll: boolean
  /** Whether the sidebar middle-click close tweak is enabled. */
  sidebarMiddleClickClose: boolean
  /** Whether the legacy-stats-line tweak is enabled. */
  legacyStatsLine: boolean
  /** Whether the pills-cache-hit-decimals tweak is enabled. */
  pillsCacheHitDecimals: boolean
  /** Whether the turn-speed-metrics tweak is enabled. */
  turnSpeedMetrics: boolean
  /** Whether the context capsule's hover tooltip is suppressed. */
  contextPillNoTooltip: boolean
  /** Whether the pre-alpha.2 context ring is rendered inside the input card. */
  legacyContextMeter: boolean
  /** Whether the user can close (hide) Workspaces without deleting them. */
  workspaceClose: boolean
  /** Ids of the Workspaces currently closed (hidden but fully retained). */
  closedWorkspaces: readonly string[]
  /** Whether the right Sidebar's first-open width is owned by the plugin. */
  rightbarInitialWidth: boolean
  /** Right Sidebar first-open width as a percentage of the session frame. */
  rightbarWidthPercent: number
  /** Whether the custom history page size is active. */
  historyPageSizeEnabled: boolean
  /** History page size requested per pagination round (used while enabled). */
  historyPageSize: number
  /** Whether the cold-open first screen uses `historyPageSize` too. */
  historyPageSizeColdStart: boolean
}