/**
 * dsh-style-tweaks — configuration.
 *
 * Owns the `style-tweaks` settings namespace. Two feature
 * areas:
 *   1. Column-width control (ported from dsh-dialog-width): a px input
 *      (600–1600) with presets, a plugin-vs-native toggle, and side margin.
 *   2. Opt-in CSS tweaks (stable-table layout on hover, with more added
 *      over time). Each tweak is a boolean field.
 * @module dsh-style-tweaks/config
 */

import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'

/** Settings document namespace owned by this plugin. */
export const STYLE_TWEAKS_SETTINGS_NAMESPACE = 'style-tweaks'

/** Raw user-facing configuration (partial inputs receive schema defaults). */
export interface StyleTweaksConfig {
  // ── Column-width control (ported from dsh-dialog-width) ──────────────
  /**
   * Conversation column width in px. The plugin's own width input / preset
   * row reads & writes this field while "plugin width control" is on (see
   * `usePluginWidth`); the value is kept while the switch is off (the field
   * is hidden from the panel) so flipping it back on restores the same px.
   * Clamped to [600, 1600] on read.
   */
  dialogWidth?: number
  /**
   * Whether the plugin's own column-width input owns the conversation width
   * axis. On: the plugin writes `--dsh-chat-user-width` directly and hides
   * the native 40 px hover handles. Off (default): the native drag handles
   * own the axis (clamp(680, col×0.64, 920)) and the width field is hidden
   * from the settings panel. The last plugin width stays in the field so
   * flipping the switch back on restores the same px.
   */
  usePluginWidth?: boolean
  /**
   * Whitespace in px kept on each side of the conversation area. The width
   * axis is clamped to min(dialogWidth, liveColumn − 2 × sideMargin), so the
   * content narrows — together with the composer card — when the sidebar
   * opens or the window shrinks, never hugging the edges. Minimum 32 px.
   */
  sideMargin?: number
  /**
   * Cap the expanded think (reasoning) body — the text under the 深度思考
   * disclosure row — at a fixed height and scroll the overflow, so a long
   * thinking trace stops pushing the rest of the conversation out of view.
   * Off (default): the body keeps growing with its content, as shipped.
   */
  thinkFixedHeight?: boolean
  /**
   * Display height in px for the think body while `thinkFixedHeight` is on.
   * Clamped to [120, 1200] on read.
   */
  thinkHeight?: number
  /**
   * Own the right Sidebar's first-open width (host 0.1.5+). Off (default):
   * the host's own 45% default owns the axis. On: the plugin writes the
   * width once — the first time the right Sidebar opens during this page
   * load — as `rightbarWidthPercent` of the session frame, and then leaves
   * it alone. A manual drag, and every later open/close, keeps the user's
   * own value for the rest of the load; a reload drops both the store and
   * the one-shot marker, so the percentage applies again. Host builds
   * without the 0.1.5 right Sidebar leave the tweak inert.
   */
  rightbarInitialWidth?: boolean
  /**
   * The right Sidebar's first-open width as a percentage of the session
   * frame. Clamped to [15, 70] on read; the host then clamps the resulting
   * px into its own range ([300 px, frame × 70%]), so a conversion landing
   * under 300 px renders 300 px wide.
   */
  rightbarWidthPercent?: number

  // ── CSS tweaks ───────────────────────────────────────────────────────
  /**
   * Lock markdown table layout on hover so the table does not reflow and push
   * surrounding content around. Fixes the "text jumps when I hover a table"
   * layout-shift bug reported against the stock conversation view. Only
   * needed on hosts older than DSH 0.1.6-alpha.1, which fixed the bug
   * upstream; off by default.
   */
  stableTable?: boolean
  /**
   * Keep the turn-navigation rail at a stable position when scrolling up
   * past the first message into the system-prompt area. Without this fix
   * the rail drops by 16px (the chat scroll container's `padding-top`)
   * because the rail slot is `position: sticky; top: 0` inside that
   * padded container.
   */
  stableTurnRail?: boolean
  /**
   * Restore the session-row title behaviour shipped through DSH
   * 0.1.6-alpha.1: an overlong title keeps its ellipsis and never moves.
   * 0.1.6-alpha.2 added a hover reveal (the clipping title smoothly scrolls
   * to its end while the row is hovered, and drops the ellipsis); this
   * tweak makes the title element non-scrollable again and keeps the
   * ellipsis on hover. Off (default): the hover reveal stays.
   */
  stableSessionTitle?: boolean
  /**
   * Keep DSH's turn-navigation rail visible after the right Sidebar is
   * widened far enough to hide it. The host's `TurnNavigator.module.css`
   * hides the rail with `@container (max-width:900px)` measured against the
   * chat scrollport's content box; `ui-layout` lets a wide right panel
   * squeeze the center column down to 400px, so the rail disappears over
   * almost the panel's whole usable range. On: the rail stays at every chat
   * width (at narrow widths it sits in the scrollport gutter and its hover
   * preview covers part of the transcript). Off (default): the host's own
   * responsive behaviour stands.
   */
  keepTurnRail?: boolean
  /**
   * Remove the 16 px gap above highlighted code blocks so the highlighted
   * box sits flush with the preceding paragraph, list item, or heading.
   * The wrapper (`.md-code-block` in `CodeBlock.module.css`) ships with
   * `margin: 16px 0`; this tweak overrides only the top edge.
   */
  codeBlockFlushTop?: boolean
  /**
   * Show the conversation title's animated running dot in the sidebar, so
   * work in flight stays visible: on the right side of every project
   * directory header row (visible even when its group is collapsed), and in
   * a session row's status slot when the app left it empty (which is what a
   * background job produces — the run outlives its turn). Rows are matched
   * by workspace id / session id read off React's fiber chain, never by the
   * display label, which two Workspaces may share. The dot is DSH's own
   * `StateDot` (shared instance) driven by the app's sessions/workspaces
   * stores — pendingInteraction (amber) needs the ui-session service face
   * and is out of scope; only ongoing shows.
   */
  projectRunningIndicator?: boolean
  /**
   * Add a "locate" button next to the sidebar search box; clicking it
   * expands the current session's workspace and scrolls the session into
   * view. Client-side toggle only: the browser bundle reads this field and
   * mounts / unmounts the button live.
   */
  locateCurrentSession?: boolean
  /**
   * Let the settings dialog's left nav column scroll once its section list
   * outgrows the fixed-height panel, instead of the panel's
   * `overflow: hidden` clipping the bottom entries (unreachable when enough
   * plugins register settings sections).
   */
  settingsNavScroll?: boolean
  /**
   * Let a middle mouse click on a right-Sidebar tab chip close that tab
   * (docked or floating), the way browser tabs behave. The gesture goes
   * through the host's own `ctx.sidebarRight` close face, so the native
   * rules stay in force (the guide standing as the sole docked tab cannot
   * be closed; the last docked tab closes with the column's collapse, as
   * its close button does). The press itself is also kept away from the
   * docking kit's drag gesture and from the browser's middle-click
   * autoscroll, so a held middle button can neither drag nor float a tab.
   * Host builds without the 0.1.5 right Sidebar leave the tweak inert.
   */
  sidebarMiddleClickClose?: boolean
  /**
   * Restore the composer stats display DSH shipped through 0.1.2-rc.1
   * (`StatsLine`): one centered pipe-separated text line under the composer
   * card (turn/step counts, LLM & tool wall times, TTFT average, output
   * speed, cache hit, input/output tokens) with the full line on hover.
   * 0.1.5-alpha.1 replaced it with icon pills that open dialogs
   * (`StatsPills`); while this tweak is on, the plugin shadows the shipped
   * `stats` entry on the `conversation.composer.dock` slot (same id, lower
   * priority) and the pills give way. Default off: the new pills stay.
   */
  legacyStatsLine?: boolean
  /**
   * Show the cache-hit share of the composer stats with two decimal places
   * (`87.35%`) instead of DSH's integer rounding — whichever presentation
   * is mounted: the new pills (`StatsPills`, re-rendered by this plugin
   * with dialogs included) or the legacy text line (`legacyStatsLine`).
   * The legacy line wins the cell when both toggles are on and renders
   * with this flag's decimals.
   */
  pillsCacheHitDecimals?: boolean
  /**
   * Suppress the context capsule's hover info bubble (host 0.1.6-alpha.2+):
   * hovering the ContextMeter pill under the composer no longer floats the
   * "上下文已用 13%" tooltip. The pill's hover highlight and its click-open
   * breakdown dialog are untouched; hosts without the ContextMeter leave
   * the tweak inert. Off (default): the shipped tooltip stays.
   */
  contextPillNoTooltip?: boolean
  /**
   * Restore the pre-0.1.6-alpha.2 context meter presentation (host
   * 0.1.6-alpha.2+): a 28px ring button inside the input card's trailing
   * toolbar row, left of the send button, instead of the ring-and-percent
   * capsule in the dock below the card. The port rides the same
   * `contextPressure` / `contextBreakdown` projections and keeps the hover
   * reading and the click-open breakdown; the shipped capsule stays hidden
   * while this is on. Hosts before alpha.2 keep their native ring and leave
   * the tweak inert. Off (default): the shipped capsule stays.
   */
  legacyContextMeter?: boolean
  /**
   * Rebuild the turn footer's 输出速度 (TPS) and 首 token 用时 (TTFT) — the
   * two "本轮用时和速度" figures session format v2 (0.1.5) dropped from cold
   * presentation: the Chat UI no longer replays the model stream embedded in
   * each durable settlement, so only the wall-clock duration survives a
   * reload. While this tweak is on, the plugin reads the settlements out of
   * the session's event window (the documented Conversation-assembly feed)
   * and shows the two figures in each settled turn's action row. Default
   * off: the stock footer keeps its shipped shape.
   */
  turnSpeedMetrics?: boolean
  /**
   * Let the user "close" a Workspace — hide it from the sidebar browser and
   * the New Session picker without deleting anything. Off (default): the
   * stock list stays complete. On: the Workspace disappears from every
   * surface that derives from the Host Workspace list, its Sessions are
   * hidden with it (the derived snapshot merges their ids into the
   * archived-session set, so they never surface under Ungrouped and the
   * search derivations stop listing them), and the registry row, its
   * `sessionIds` account, and the files on disk all stay untouched.
   * Restoring means re-adding the same folder (the Host resolves it by
   * canonical path and returns the same id) or using the recovery list in
   * the Settings panel.
   */
  workspaceClose?: boolean
  /**
   * Ids of the Workspaces currently closed. Internal data: the Settings
   * panel renders them as a recovery list, never as an ordinary toggle.
   * Ids whose Workspace no longer exists in the Host registry are pruned.
   */
  closedWorkspaces?: string[]
}

// ── Column-width constants ───────────────────────────────────────────────
/** Dialog width in px. 600 is the chat-column minimum, 1600 the soft cap. */
export const MIN_DIALOG_WIDTH = 600
export const MAX_DIALOG_WIDTH = 1600
/** 748 matches the stock DSH column. */
export const DEFAULT_DIALOG_WIDTH = 748
/**
 * Plugin width control defaults to OFF: DSH's native drag handles own the
 * column until the user opts in — the stock behavior wins by default.
 */
export const DEFAULT_USE_PLUGIN_WIDTH = false
/** Default side margin in px — 50 gives a comfortable gap on each side. */
export const DEFAULT_SIDE_MARGIN = 50
/** Minimum side margin in px — below 32 the gap becomes too tight. */
export const MIN_SIDE_MARGIN = 32
/** Default: off — expanded think bodies keep growing with their content. */
export const DEFAULT_THINK_FIXED_HEIGHT = false
/** Default think body height in px while the cap is on (≈15 body lines). */
export const DEFAULT_THINK_HEIGHT = 300
/** Minimum think body height in px — below this the window is too cramped to read. */
export const MIN_THINK_HEIGHT = 120
/** Maximum think body height in px — past this, uncapped growth is the better tool. */
export const MAX_THINK_HEIGHT = 1200
/**
 * localStorage slot the native WidthHandle reads/writes; kept here so a
 * future rename of the host key only needs touching one place. We mirror
 * the plugin's chosen px value here too so toggling plugin-width off
 * surfaces the user's last choice in the native handle.
 */
export const CONVERSATION_WIDTH_STORAGE_KEY = 'dsh.conversation.contentWidth'

// ── CSS tweak constants ─────────────────────────────────────────────────
/**
 * Default: off — DSH 0.1.6-alpha.1 fixed the hover reflow upstream, so the
 * tweak is only needed on older hosts.
 */
export const DEFAULT_STABLE_TABLE = false
/** Default: every shipped tweak is on. */
export const DEFAULT_STABLE_TURN_RAIL = true
/**
 * Default: off — the hover title reveal is 0.1.6-alpha.2's shipped
 * affordance; restoring the pre-alpha.1 resting title is opt-in.
 */
export const DEFAULT_STABLE_SESSION_TITLE = false
/**
 * Default: off — the host's own 900px container query stands until the user
 * opts into keeping the rail at every chat width.
 */
export const DEFAULT_KEEP_TURN_RAIL = false
/** Default: every shipped tweak is on. */
export const DEFAULT_CODE_BLOCK_FLUSH_TOP = true
/** Default: every shipped tweak is on. */
export const DEFAULT_PROJECT_RUNNING_INDICATOR = true
/** Default: every shipped tweak is on. */
export const DEFAULT_LOCATE_CURRENT_SESSION = true
/** Default: every shipped tweak is on. */
export const DEFAULT_SETTINGS_NAV_SCROLL = true
/**
 * Default: on — middle-click-to-close is the convention users bring from
 * every browser tab strip, and the host itself ships no middle-click route.
 */
export const DEFAULT_SIDEBAR_MIDDLE_CLICK_CLOSE = true
/** Default: off — the legacy stats line is opt-in, the new pills stay. */
export const DEFAULT_LEGACY_STATS_LINE = false
/** Default: off — integer cache-hit percent, as shipped. */
export const DEFAULT_PILLS_CACHE_HIT_DECIMALS = false
/** Default: off — the turn footer keeps its shipped shape. */
export const DEFAULT_TURN_SPEED_METRICS = false
/**
 * Default: off — the context capsule keeps its shipped hover tooltip until
 * the user opts into hiding it.
 */
export const DEFAULT_CONTEXT_PILL_NO_TOOLTIP = false
/**
 * Default: off — the capsule is 0.1.6-alpha.2's shipped presentation; the
 * pre-alpha.2 in-card ring is opt-in.
 */
export const DEFAULT_LEGACY_CONTEXT_METER = false
/**
 * Default: off — hiding a Workspace is a new capability rather than a fix,
 * so the stock list stays complete until the user opts in.
 */
export const DEFAULT_WORKSPACE_CLOSE = false
/** No Workspace is closed until the user closes one. */
export const DEFAULT_CLOSED_WORKSPACES: readonly string[] = []
/**
 * Default: off — the host keeps its own 45% first-open width until the user
 * opts in, so the plugin never takes over an axis the user did not ask about.
 */
export const DEFAULT_RIGHTBAR_INITIAL_WIDTH = false
/** Right Sidebar first-open width as a percentage of the frame (= the host's 45%). */
export const DEFAULT_RIGHTBAR_WIDTH_PERCENT = 45
/** Minimum configurable percentage — below this the panel is unusably cramped. */
export const MIN_RIGHTBAR_WIDTH_PERCENT = 15
/** Maximum configurable percentage (= the host's `RIGHTBAR_MAX_RATIO`). */
export const MAX_RIGHTBAR_WIDTH_PERCENT = 70

/** Configuration schema with documented defaults. */
export const Config: Schema<StyleTweaksConfig> = z.object({
  dialogWidth: z.number().min(MIN_DIALOG_WIDTH).max(MAX_DIALOG_WIDTH).default(DEFAULT_DIALOG_WIDTH),
  usePluginWidth: z.boolean().default(DEFAULT_USE_PLUGIN_WIDTH),
  sideMargin: z.number().min(MIN_SIDE_MARGIN).default(DEFAULT_SIDE_MARGIN),
  thinkFixedHeight: z.boolean().default(DEFAULT_THINK_FIXED_HEIGHT),
  thinkHeight: z.number().min(MIN_THINK_HEIGHT).max(MAX_THINK_HEIGHT).default(DEFAULT_THINK_HEIGHT),
  stableTable: z.boolean().default(DEFAULT_STABLE_TABLE),
  stableTurnRail: z.boolean().default(DEFAULT_STABLE_TURN_RAIL),
  stableSessionTitle: z.boolean().default(DEFAULT_STABLE_SESSION_TITLE),
  keepTurnRail: z.boolean().default(DEFAULT_KEEP_TURN_RAIL),
  codeBlockFlushTop: z.boolean().default(DEFAULT_CODE_BLOCK_FLUSH_TOP),
  projectRunningIndicator: z.boolean().default(DEFAULT_PROJECT_RUNNING_INDICATOR),
  locateCurrentSession: z.boolean().default(DEFAULT_LOCATE_CURRENT_SESSION),
  settingsNavScroll: z.boolean().default(DEFAULT_SETTINGS_NAV_SCROLL),
  sidebarMiddleClickClose: z.boolean().default(DEFAULT_SIDEBAR_MIDDLE_CLICK_CLOSE),
  legacyStatsLine: z.boolean().default(DEFAULT_LEGACY_STATS_LINE),
  pillsCacheHitDecimals: z.boolean().default(DEFAULT_PILLS_CACHE_HIT_DECIMALS),
  turnSpeedMetrics: z.boolean().default(DEFAULT_TURN_SPEED_METRICS),
  contextPillNoTooltip: z.boolean().default(DEFAULT_CONTEXT_PILL_NO_TOOLTIP),
  legacyContextMeter: z.boolean().default(DEFAULT_LEGACY_CONTEXT_METER),
  workspaceClose: z.boolean().default(DEFAULT_WORKSPACE_CLOSE),
  closedWorkspaces: z.array(z.string()).default([...DEFAULT_CLOSED_WORKSPACES]),
  rightbarInitialWidth: z.boolean().default(DEFAULT_RIGHTBAR_INITIAL_WIDTH),
  rightbarWidthPercent: z.number().min(MIN_RIGHTBAR_WIDTH_PERCENT).max(MAX_RIGHTBAR_WIDTH_PERCENT).default(DEFAULT_RIGHTBAR_WIDTH_PERCENT),
})

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
  /** Whether the plugin owns the right Sidebar's first-open width. */
  rightbarInitialWidth: boolean
  /** Right Sidebar first-open width as a percentage of the session frame. */
  rightbarWidthPercent: number
}

/** Resolve a partial config into a fully defaulted value. */
export function resolveConfig(config: StyleTweaksConfig = {}): ResolvedStyleTweaksConfig {
  return {
    dialogWidth: resolveDialogWidth(config.dialogWidth),
    usePluginWidth: config.usePluginWidth ?? DEFAULT_USE_PLUGIN_WIDTH,
    sideMargin: config.sideMargin ?? DEFAULT_SIDE_MARGIN,
    thinkFixedHeight: config.thinkFixedHeight ?? DEFAULT_THINK_FIXED_HEIGHT,
    thinkHeight: resolveThinkHeight(config.thinkHeight),
    stableTable: config.stableTable ?? DEFAULT_STABLE_TABLE,
    stableTurnRail: config.stableTurnRail ?? DEFAULT_STABLE_TURN_RAIL,
    stableSessionTitle: config.stableSessionTitle ?? DEFAULT_STABLE_SESSION_TITLE,
    keepTurnRail: config.keepTurnRail ?? DEFAULT_KEEP_TURN_RAIL,
    codeBlockFlushTop: config.codeBlockFlushTop ?? DEFAULT_CODE_BLOCK_FLUSH_TOP,
    projectRunningIndicator: config.projectRunningIndicator ?? DEFAULT_PROJECT_RUNNING_INDICATOR,
    locateCurrentSession: config.locateCurrentSession ?? DEFAULT_LOCATE_CURRENT_SESSION,
    settingsNavScroll: config.settingsNavScroll ?? DEFAULT_SETTINGS_NAV_SCROLL,
    sidebarMiddleClickClose: config.sidebarMiddleClickClose ?? DEFAULT_SIDEBAR_MIDDLE_CLICK_CLOSE,
    legacyStatsLine: config.legacyStatsLine ?? DEFAULT_LEGACY_STATS_LINE,
    pillsCacheHitDecimals: config.pillsCacheHitDecimals ?? DEFAULT_PILLS_CACHE_HIT_DECIMALS,
    turnSpeedMetrics: config.turnSpeedMetrics ?? DEFAULT_TURN_SPEED_METRICS,
    contextPillNoTooltip: config.contextPillNoTooltip ?? DEFAULT_CONTEXT_PILL_NO_TOOLTIP,
    legacyContextMeter: config.legacyContextMeter ?? DEFAULT_LEGACY_CONTEXT_METER,
    workspaceClose: config.workspaceClose ?? DEFAULT_WORKSPACE_CLOSE,
    closedWorkspaces: resolveClosedWorkspaces(config.closedWorkspaces),
    rightbarInitialWidth: config.rightbarInitialWidth ?? DEFAULT_RIGHTBAR_INITIAL_WIDTH,
    rightbarWidthPercent: resolveRightbarPercent(config.rightbarWidthPercent),
  }
}

/** Normalize a dialog width value (legacy strings included) to px. */
export function resolveDialogWidth(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, Math.round(value)))
  }
  return DEFAULT_DIALOG_WIDTH
}

/** Normalize a side-margin value (legacy strings included) to px. */
export function resolveSideMargin(value: number | undefined): number {
  if (typeof value === 'number') return Math.max(MIN_SIDE_MARGIN, Math.round(value))
  return DEFAULT_SIDE_MARGIN
}

/** Normalize a think-body height value to px. */
export function resolveThinkHeight(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_THINK_HEIGHT, Math.max(MIN_THINK_HEIGHT, Math.round(value)))
  }
  return DEFAULT_THINK_HEIGHT
}

/** Normalize a right-Sidebar width percentage. */
export function resolveRightbarPercent(value: number | undefined): number {
  if (typeof value === 'number') {
    return Math.min(MAX_RIGHTBAR_WIDTH_PERCENT, Math.max(MIN_RIGHTBAR_WIDTH_PERCENT, Math.round(value)))
  }
  return DEFAULT_RIGHTBAR_WIDTH_PERCENT
}

/**
 * Normalize the closed-Workspace id list. Non-string and empty entries are
 * dropped so a hand-edited settings document cannot leak a non-string into
 * the id comparison; an empty result reuses the shared default array.
 */
export function resolveClosedWorkspaces(value: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(value)) return DEFAULT_CLOSED_WORKSPACES
  const ids = value.filter((id): id is string => typeof id === 'string' && id !== '')
  return ids.length === 0 ? DEFAULT_CLOSED_WORKSPACES : ids
}
