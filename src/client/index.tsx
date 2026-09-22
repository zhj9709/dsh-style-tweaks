/**
 * dsh-style-tweaks — browser half.
 *
 * Owns the runtime CSS that drives two feature areas under one Settings
 * panel:
 *   1. Column-width control (ported from dsh-dialog-width): px stepper,
 *      presets, plugin-vs-native toggle, side margin.
 *   2. Opt-in CSS tweaks: small fixes for the sidebar and the settings
 *      panel (e.g. holding the turn-navigation rail in place), with more
 *      added over time. Each tweak is a boolean field.
 *
 * Reads and writes the `style-tweaks` settings namespace via
 * the same-origin route served by the server half.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the client-service Context declarations.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { installConversationWidthStyles } from './conversation-width.ts'
import { setupSettingsNavIcon } from './settings-nav-icon.ts'
import {
  DEFAULT_USE_PLUGIN_WIDTH,
  MAX_DIALOG_WIDTH,
  MAX_HISTORY_PAGE_SIZE,
  MAX_RIGHTBAR_WIDTH_PERCENT,
  MAX_THINK_HEIGHT,
  MIN_DIALOG_WIDTH,
  MIN_HISTORY_PAGE_SIZE,
  MIN_RIGHTBAR_WIDTH_PERCENT,
  MIN_SIDE_MARGIN,
  MIN_THINK_HEIGHT,
  STEP_HISTORY_PAGE_SIZE,
  resolveClientConfig,
  resolveDialogWidth,
  resolveSideMargin,
} from './tweak-config.ts'
import type { ResolvedStyleTweaksConfig } from './tweak-types.ts'
import { TWEAKS, type TweakDescriptor } from './tweaks/registry.ts'
import { injectStableSessionTitleStyles } from './tweaks/stable-session-title.ts'
import { injectHideSessionHoverActionsStyles } from './tweaks/hide-session-hover-actions.ts'
import { injectStableTurnRailStyles } from './tweaks/stable-turn-rail.ts'
import { injectKeepTurnRailStyles } from './tweaks/keep-turn-rail.ts'
import { injectCodeBlockFlushTopStyles } from './tweaks/code-block-flush-top.ts'
import { setupProjectRunningIndicator } from './tweaks/project-running-indicator.ts'
import { setupLocateCurrentSession } from './tweaks/locate-current-session.ts'
import { setupSettingsNavScroll } from './tweaks/settings-nav-scroll.ts'
import { setupSidebarMiddleClickClose } from './tweaks/sidebar-middle-click-close.ts'
import { installThinkingScrollStyles } from './tweaks/thinking-scroll.ts'
import { installRightbarInitialWidth } from './tweaks/rightbar-initial-width.ts'
import { setupLegacyStatsLine } from './tweaks/legacy-stats-line.tsx'
import { setupPillsCacheHitDecimals } from './tweaks/pills-cache-hit-decimals.tsx'
import { setupTurnTimePill } from './tweaks/turn-time-pill.tsx'
import { injectContextPillNoTooltipStyles } from './tweaks/context-pill-no-tooltip.ts'
import { setupLegacyContextMeter } from './tweaks/legacy-context-meter.tsx'
import { closedWorkspaceEntries, restoreClosedWorkspace, setupWorkspaceClose } from './tweaks/workspace-close.ts'
import {
  installHistoryPageSizeTransport,
  resetHistoryPageSizeTargets,
  setHistoryPageSizeTargets,
} from './tweaks/history-page-size.ts'

const NS = 'style-tweaks'
const SETTINGS_ROUTE = '/_dsh/style-tweaks/settings'

/**
 * Maps a tweak id to its mount function. Add new tweaks here. Pure-CSS
 * injectors ignore the context and the resolved values; JS-level tweaks
 * (DOM patching driven by app stores) receive the context to read services
 * like `sessions` / `workspaces`, and tweaks whose render depends on other
 * settings read the resolved snapshot (captured at mount — any settings
 * change remounts every tweak, so the capture never goes stale).
 */
const TWEAK_INJECTORS: Record<string, (ctx: ClientContext, resolved: ResolvedTweaks, settings: SettingsClient) => () => void> = {
  'stable-turn-rail': () => injectStableTurnRailStyles(),
  'stable-session-title': () => injectStableSessionTitleStyles(),
  'hide-session-hover-actions': () => injectHideSessionHoverActionsStyles(),
  'keep-turn-rail': () => injectKeepTurnRailStyles(),
  'code-block-flush-top': () => injectCodeBlockFlushTopStyles(),
  'project-running-indicator': setupProjectRunningIndicator,
  'locate-current-session': setupLocateCurrentSession,
  'settings-nav-scroll': setupSettingsNavScroll,
  'sidebar-middle-click-close': setupSidebarMiddleClickClose,
  'legacy-stats-line': (ctx, resolved) => setupLegacyStatsLine(ctx, resolved.pillsCacheHitDecimals),
  'pills-cache-hit-decimals': setupPillsCacheHitDecimals,
  'turn-time-pill': setupTurnTimePill,
  'context-pill-no-tooltip': () => injectContextPillNoTooltipStyles(),
  'legacy-context-meter': setupLegacyContextMeter,
  'workspace-close': (ctx, resolved, settings) => setupWorkspaceClose(ctx, resolved, settings),
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
type TweaksValue = Partial<ResolvedStyleTweaksConfig>
type ResolvedTweaks = ResolvedStyleTweaksConfig

interface Snapshot {
  writable: boolean
  value: TweaksValue
  revision: number
}

interface ApiSuccess<T> { ok: true; value: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }

/**
 * Failure carrying the server's machine-readable status/code, so callers can
 * act on the class of failure (e.g. "lost a revision race") instead of
 * parsing messages. `apiRequest` raises it for every parsed non-success
 * response; a fetch-level error (offline, CORS) keeps its plain identity.
 */
class SettingsApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const en = {
  nav: 'Style tweaks',
  settingsTitle: 'Style tweaks',
  settingsIntro: 'Opt-in style tweaks for DSH: precise conversation column-width control (with presets and side margin), a fixed-height scrolling window for the think (reasoning) body, and a set of small fixes for the sidebar and the settings panel. Each toggle applies immediately and persists to your settings document.',
  sectionLayout: 'Layout',
  sectionTweaks: 'Tweaks',
  dialogWidth: 'Dialog width',
  dialogWidthHint: 'Number between 600 and 1600 px; 748 is DSH\'s default column width, larger values widen it.',
  presetDefault: 'Default',
  presetWide: 'Wide',
  presetWideXl: 'Extra wide',
  usePluginWidth: 'Plugin width control',
  usePluginWidthHint: 'When ON, the width input / presets below drive the column and DSH\'s native drag handles are hidden. When OFF (default), DSH\'s native handles own the column and the width & side-margin settings are hidden; the last values are kept for when you switch back on.',
  usePluginWidthOn: 'On',
  usePluginWidthOff: 'Off',
  sideMargin: 'Side margin',
  sideMarginHint: 'Whitespace in px kept on each side of the conversation area while plugin width control is on. The column is clamped to the dialog width and narrows when the sidebar opens or the window shrinks, never hugging the edges. Minimum 32 px.',
  thinkFixedHeight: 'Fixed think height',
  thinkFixedHeightHint: 'Cap the expanded think (reasoning) body at a fixed height and scroll the overflow, so a long thinking trace stops pushing the rest of the conversation out of view. Folding the row back to one line keeps working as usual. While a trace is still streaming, the window shows its top and you scroll for the tail.',
  thinkHeight: 'Think height',
  thinkHeightHint: 'Height of the fixed think body in px, between 120 and 1200.',
  rightbarInitialWidth: 'Right sidebar initial width',
  rightbarInitialWidthHint: 'Own the right sidebar\'s first-open width. OFF by default, which leaves DSH\'s own 45% in charge. When ON, the plugin writes the width once — the first time the sidebar opens in this page load — as a percentage of the session frame; a manual drag, and every later open, keeps your own width. Reload the page to apply the percentage again.',
  rightbarWidthPercent: 'Right sidebar width',
  rightbarWidthPercentHint: 'First-open width of the right sidebar as a percentage of the session frame, between 15 and 70. DSH clamps the result into its own range (at least 300 px, at most 70% of the frame), so a conversion below 300 px renders 300 px wide.',
  sectionHistory: 'History loading',
  historyPageSizeEnabled: 'Custom history page size',
  historyPageSizeEnabledHint: 'DSH pages conversation history at a fixed 50 messages per request: the first screen when a session opens, and every click of "Load earlier". When ON, the browser asks for more messages per request so walking back through a long session takes fewer clicks. OFF (default) keeps DSH\'s own behaviour and hides the size rows below.',
  historyPageSize: 'Messages per history page',
  historyPageSizeHint: 'Messages requested per history page while the control above is on. Larger values mean fewer clicks (and fewer round trips), at the cost of bigger single responses. A save applies to the next request. Page sizes are only ever raised, never lowered: "Load earlier" asks for the stock 50 and the turn-jump loader asks for 200, so both follow this value once it exceeds theirs — above 200, every turn jump gets heavier too.',
  historyPageSizeColdStart: 'Apply to session open too',
  historyPageSizeColdStartHint: 'When ON (default), opening a session (its first screen) also requests the larger page: history appears with fewer "Load earlier" clicks, but the initial load carries more data, so cold starts get slower. OFF keeps the stock 50-message first screen; the size then only affects "Load earlier" clicks. Hidden while the page size is 50 (nothing to apply).',
  defaultAction: 'Default',
  saving: 'Saving…',
  applied: 'Applied',
  unavailable: 'Settings unavailable.',
  loading: 'Loading…',
  readOnly: 'The active Settings provider is read-only.',
  tweakOn: 'On',
  tweakOff: 'Off',
  'tweak.stableTurnRail.title': 'Stable turn-navigation rail',
  'tweak.stableTurnRail.description': 'Keep the turn-navigation rail at a stable position when scrolling up past the first message into the system prompt ("the rail jumps down by ~16 px when I scroll up after clicking the first turn").',
  'tweak.stableSessionTitle.title': 'Stable session titles',
  'tweak.stableSessionTitle.description': 'Restores the pre-0.1.6-alpha.2 session rows: a title too long for its row keeps its ellipsis and never moves — the hover state no longer smoothly slides it to reveal the clipped tail. The row\'s hover card (hover a moment) still shows the full title.',
  'tweak.hideSessionHoverActions.title': 'Hide session hover buttons',
  'tweak.hideSessionHoverActions.description': 'Hovering a session row floats the Archive and Pin icon buttons into its trailing cell. This hides them: the row keeps only the "..." menu button while hovered, where both actions stay available — so no one-click archive sits under the pointer.',
  'tweak.keepTurnRail.title': 'Always show turn navigation',
  'tweak.keepTurnRail.description': 'DSH hides the turn-navigation rail once the chat column\'s content box reaches 900 px (a container query in TurnNavigator.module.css) — which is what widening the right sidebar does, since the center column may be squeezed down to 400 px. This keeps the rail at every chat width. At narrow widths the rail sits in the scrollport\'s right gutter and its hover preview covers part of the transcript.',
  'tweak.codeBlockFlushTop.title': 'Flush code-block top',
  'tweak.codeBlockFlushTop.description': 'Remove the 16 px gap above highlighted code blocks so the code sits flush with the preceding paragraph, list item, or heading.',
  'tweak.projectRunningIndicator.title': 'Project running indicator',
  'tweak.projectRunningIndicator.description': 'Show the conversation title\'s animated running dot in the sidebar: on the right side of each project directory (so a busy conversation stays visible even when the directory is collapsed), and in a session row\'s status slot whenever that session holds a background job the app\'s own dot does not cover.',
  'tweak.locateCurrentSession.title': 'Locate current session',
  'tweak.locateCurrentSession.description': 'Add a "locate" button next to the sidebar search box. Click it to expand the current session\'s workspace and scroll the session into view.',
  'tweak.settingsNavScroll.title': 'Scrollable settings nav',
  'tweak.settingsNavScroll.description': 'Let the settings dialog\'s left menu scroll when its entries outgrow the panel, instead of silently clipping the ones at the bottom.',
  'tweak.sidebarMiddleClickClose.title': 'Middle-click closes sidebar tabs',
  'tweak.sidebarMiddleClickClose.description': 'Since 0.1.5 the right sidebar is a tabbed panel. Close any of its tabs — docked or floating — with a middle mouse click on the tab, the way browser tabs behave. A held middle button can no longer drag or float a tab, and middle-click autoscroll is suppressed over the strips.',
  'tweak.legacyStatsLine.title': 'Legacy stats line',
  'tweak.legacyStatsLine.description': 'Show the composer stats the way DSH did before 0.1.5: one centered text line under the input box (turns/steps, LLM & tool time, TTFT, speed, tokens, cache hit) instead of the new icon pills. Full line on hover.',
  'tweak.pillsCacheHitDecimals.title': 'Cache hit with two decimals',
  'tweak.pillsCacheHitDecimals.description': 'Show the composer stats\' cache-hit share with two decimal places (87.35%) instead of integer rounding — applies to the new icon pills and the legacy text line alike, whichever is showing.',
  'tweak.turnTimePill.title': 'Turn time pill',
  'tweak.turnTimePill.description': 'Through 0.1.6 a settled turn ended with two stat pills: usage and time, each opening its own dialog. 0.1.7-alpha.1 dropped the time half. This puts it back right of the usage pill, with its 本轮用时和速度 dialog: the turn\'s total run time, plus output speed (TPS) and time to first token (TTFT), rebuilt from the model stream embedded in the session log — so history loads show them too.',
  'tweak.turnTimePill.label': 'Ran for {duration}',
  'tweak.turnTimePill.pillTitle': 'Turn time and speed',
  'tweak.turnTimePill.duration': 'Total run time',
  'tweak.turnTimePill.speed': 'Tokens per second (TPS)',
  'tweak.turnTimePill.ttft': 'Time to first token (TTFT)',
  'tweak.contextPillNoTooltip.title': 'No context pill hover info',
  'tweak.contextPillNoTooltip.description': 'Hovering the context capsule under the input box (DSH 0.1.6-alpha.2+) no longer floats the "13% of context used" tooltip. The capsule\'s hover highlight and its click-open breakdown dialog are untouched; hosts without the capsule leave this inert.',
  'tweak.legacyContextMeter.title': 'Context ring in the input card',
  'tweak.legacyContextMeter.description': 'Restores the pre-0.1.6-alpha.2 context meter: a 28px ring button inside the input card\'s toolbar row, left of the send button, instead of the capsule below the card. The hover reading and the click-open context breakdown are kept; the shipped capsule stays hidden while this is on.',
  'tweak.workspaceClose.title': 'Closable workspaces',
  'tweak.workspaceClose.description': 'Hide a Workspace from the sidebar and the New Session picker without deleting it — its sessions are hidden with it (they never fall into Ungrouped), while the registry entry, the session account and the files on disk are all kept. Restore it by re-adding the same folder, or from the recovery list in this panel.',
  workspaceCloseMenu: 'Close workspace',
  workspaceCloseConfirmTitle: 'Close workspace',
  workspaceCloseConfirmBody: 'This hides “{name}” from the Workspace list. The folder, its files and every session record are kept — re-add the same folder, or use the recovery list in Style tweaks settings, to show it again.',
  workspaceCloseConfirmOk: 'Close workspace',
  workspaceCloseCancel: 'Cancel',
  workspaceCloseBusy: 'Closing workspace…',
  workspaceCloseClosedSection: 'Closed workspaces',
  workspaceCloseClosedSectionHint: 'These Workspaces are hidden from the sidebar and the New Session picker. Their folders, files and sessions are untouched.',
  workspaceCloseRestore: 'Restore',
  'legacyStats.counts': '{turns} turns · {steps} steps',
  'legacyStats.llm': 'LLM {duration}',
  'legacyStats.toolCall': 'Tool call {duration}',
  'legacyStats.ttftAverage': 'TTFT avg {duration}',
  'legacyStats.tokensPerSecond': '{throughput} tok/s',
  'legacyStats.cacheHit': 'Cache hit {percent}%',
  'legacyStats.tokens': 'Input {input} tok · Output {output} tok',
  'legacyStats.number.thousand': '{value}K',
  'legacyStats.number.million': '{value}M',
  'legacyStats.duration.seconds': '{seconds}s',
  'legacyStats.duration.minutes': '{minutes}m{seconds}s',
  'pills.counts': '{turns} turns {steps} steps',
  'pills.tokensPerSecond': '{tps} tok/s',
  'pills.cacheHit': 'Cache hit {percent}%',
  'pills.dialog.title': 'Session statistics',
  'pills.dialog.usageTitle': 'Token usage',
  'pills.dialog.llmTime': 'LLM time',
  'pills.dialog.toolTime': 'Tool time',
  'pills.dialog.ttft': 'Avg time to first token (TTFT)',
  'pills.dialog.speed': 'Tokens per second (TPS)',
  'pills.turnUsage.count': '{count} tok',
  'pills.turnUsage.cacheHit': 'Cache hit',
  'pills.turnUsage.input': 'Uncached input',
  'pills.turnUsage.cacheRead': 'Cached input',
  'pills.turnUsage.cacheWrite': 'Cache write',
  'pills.turnUsage.output': 'Output',
  'pills.number.thousand': '{value}K',
  'pills.number.million': '{value}M',
  'pills.number.groupSeparator': ',',
  'pills.duration.seconds': '{seconds}s',
  'pills.duration.minutes': '{minutes}m{seconds}s',
  'meter.aria': '{percent} of context used',
  'meter.used': 'of context used',
  'meter.system': 'System prompt',
  'meter.tools': 'Tool definitions',
  'meter.messages': 'Messages',
} as const

type LocaleKey = keyof typeof en

const zh: Record<LocaleKey, string> = {
  nav: '样式调整',
  settingsTitle: '样式调整',
  settingsIntro: 'DSH 界面的可选样式调整：对话列宽精确控制（含预设与两侧边距）、思考内容固定高度滚动，以及侧边栏与设置面板的一组小幅修复。每个开关立即生效并持久化到设置文档。',
  sectionLayout: '布局',
  sectionTweaks: '调整项',
  dialogWidth: '对话框宽度',
  dialogWidthHint: '取值 600–1600 px；748 为 DSH 默认列宽，数字越大越宽。',
  presetDefault: '默认',
  presetWide: '稍宽',
  presetWideXl: '更宽',
  usePluginWidth: '插件宽度控制',
  usePluginWidthHint: '开启时，下方宽度输入 / 预设驱动列宽，并隐藏 DSH 原生的拖拽手柄；关闭时（默认），DSH 原生手柄接管列宽，宽度与两侧边距设置一并隐藏，已设置的值会保留，重新开启即恢复。',
  usePluginWidthOn: '开启',
  usePluginWidthOff: '关闭',
  sideMargin: '两侧边距',
  sideMarginHint: '插件宽度控制开启时，对话区域两侧保留的空白（px）。列宽被钳制为对话框宽度，侧边栏打开或窗口缩小时内容会收窄，不会贴住边缘。最低 32 px；关闭插件宽度控制后边距不生效，保持 DSH 原生行为。',
  thinkFixedHeight: '思考内容固定高度',
  thinkFixedHeightHint: '展开"深度思考"正文时限制为固定高度，超出部分滚动查看，很长的思考不再把后面的回复顶出视野；收起后照旧恢复为一行摘要。思考仍在生成时窗口显示开头，可滚动查看后续内容。',
  thinkHeight: '思考内容高度',
  thinkHeightHint: '思考内容的显示高度（px，120–1200）。',
  rightbarInitialWidth: '右侧边栏初始宽度',
  rightbarInitialWidthHint: '接管右侧边栏首次打开时的宽度。默认关闭，此时保持 DSH 自身的 45% 不变；开启后仅在本次页面加载后的第一次打开时按会话窗口的百分比写入一次，之后手动拖拽、关闭再打开都保留你自己拖出来的宽度，刷新页面后该百分比会重新生效。',
  rightbarWidthPercent: '右侧边栏宽度',
  rightbarWidthPercentHint: '右侧边栏首次打开时占会话窗口宽度的百分比，取值 15–70。DSH 会把结果钳制到它自己的范围内（最小 300 px、最大窗口的 70%），因此换算结果不足 300 px 时会按 300 px 显示。',
  sectionHistory: '历史加载',
  historyPageSizeEnabled: '自定义历史分页大小',
  historyPageSizeEnabledHint: 'DSH 每次请求固定只加载 50 条对话消息：打开会话的首屏和每次点击「加载更早」都是 50。开启后浏览器会在每次请求时携带更大的条数，回看长会话需要的点击更少。关闭时（默认）保持 DSH 原生行为，下方条数设置行一并隐藏。',
  historyPageSize: '每次加载的历史消息数',
  historyPageSizeHint: '上方开关开启时，每次历史请求携带的消息条数。调大后回看长会话需要的点击次数（和请求往返次数）更少，代价是单次响应更大。保存后对下一次请求生效。分页只升不降：「加载更早」原生请求 50 条、轮次跳转加载器原生请求 200 条，设置值超过它们时都会按设置值放大——超过 200 时每次轮次跳转也会一并变重。',
  historyPageSizeColdStart: '打开会话时同样生效',
  historyPageSizeColdStartHint: '开启时（默认），打开会话（首屏）也按调大后的页数请求：历史出现得更完整、「加载更早」点得更少，但首次加载携带的数据更多，冷启动会变慢。关闭时首屏保持原生的 50 条，页数只影响「加载更早」。页数为 50 时本项隐藏（无可生效）。',
  defaultAction: '默认',
  saving: '保存中…',
  applied: '已应用',
  unavailable: '设置暂不可用。',
  loading: '加载中…',
  readOnly: '当前设置提供方为只读。',
  tweakOn: '开启',
  tweakOff: '关闭',
  'tweak.stableTurnRail.title': '轮次导航栏稳定',
  'tweak.stableTurnRail.description': '向上滚动到第一条消息上方的系统提示词区域时，让右侧轮次导航栏保持在原位（不再下移约 16 像素）。',
  'tweak.stableSessionTitle.title': '会话标题悬停稳定',
  'tweak.stableSessionTitle.description': '0.1.6-alpha.2 起，悬停会话行时超宽的标题会平滑滑动到末尾、亮出被裁剪的部分，移开又弹回。开启本项恢复 0.1.6-alpha.2 之前的行为：标题保持原位、始终显示省略号；停顿悬停出现的信息卡片仍会展示完整标题。',
  'tweak.hideSessionHoverActions.title': '隐藏会话悬停按钮',
  'tweak.hideSessionHoverActions.description': '鼠标移到会话行上时，行尾会浮出「归档」和「置顶」两个图标按钮。开启本项后它们不再出现，悬停时行尾只保留「…」菜单——两个操作在菜单里照常可用，指针下也不会再摆着一个一点即归档的按钮。',
  'tweak.keepTurnRail.title': '轮次导航常显',
  'tweak.keepTurnRail.description': 'DSH 会在聊天列内容盒宽度降到 900 px 时隐藏轮次导航栏（TurnNavigator.module.css 的容器查询）——把右侧边栏拉宽就会触发，中间列最多可被压到 400 px。开启后任何聊天宽度下都保留轮次导航。窄宽度下导航停在滚动区右侧的空隙里，悬停预览会遮住部分正文。',
  'tweak.codeBlockFlushTop.title': '代码块顶部贴齐',
  'tweak.codeBlockFlushTop.description': '去掉高亮代码块上方的 16 px 空白，让代码块紧贴在前面的段落、列表项或标题下方。',
  'tweak.projectRunningIndicator.title': '项目目录运行指示',
  'tweak.projectRunningIndicator.description': '在侧边栏显示与对话标题一致的运行动画圆点：一是项目目录右侧（目录收起时也能一眼看出里面有对话正在进行），二是会话行原本空着的状态槽——会话有后台任务在跑而原生圆点不显示时补上。',
  'tweak.locateCurrentSession.title': '定位当前会话',
  'tweak.locateCurrentSession.description': '在侧边栏搜索框旁边添加一个"定位"按钮。点击后展开当前会话所属的工作区目录，并将该会话滚动到侧边栏视口内。',
  'tweak.settingsNavScroll.title': '设置菜单可滚动',
  'tweak.settingsNavScroll.description': '设置项较多时，让设置面板左侧菜单可以上下滚动，而不是把放不下的项直接裁掉。',
  'tweak.sidebarMiddleClickClose.title': '中键关闭侧边栏标签页',
  'tweak.sidebarMiddleClickClose.description': '0.1.5 起新增的右侧边栏是标签页面板。开启后，鼠标中键点击任一标签页即可关闭它（浮动面板的标签页同样适用），与浏览器标签页的习惯一致；中键按住时也不会再意外拖动 / 浮出标签，条上的中键自动滚动一并抑制。',
  'tweak.legacyStatsLine.title': '经典统计行',
  'tweak.legacyStatsLine.description': '以 0.1.5 之前的样式，在输入框下方显示一行居中的文本统计（轮数/步数、模型与工具耗时、首字延迟、输出速度、Token 用量、缓存命中），替代新版图标胶囊；悬停可查看完整内容。',
  'tweak.pillsCacheHitDecimals.title': '缓存命中两位小数',
  'tweak.pillsCacheHitDecimals.description': '缓存命中率按两位小数显示（如 87.35%），不再取整；无论统计信息以新版图标胶囊还是经典文本行展示，均适用。',
  'tweak.turnTimePill.title': '用时胶囊',
  'tweak.turnTimePill.description': '0.1.6 及之前，一轮结束后行尾有两颗统计胶囊：用量和用时，各自点开一个弹窗；0.1.7-alpha.1 去掉了用时那一颗。开启本项把它加回用量胶囊右边，连同「本轮用时和速度」弹窗：本轮总用时，以及输出速度（TPS）与首 token 用时（TTFT）——后两项由会话日志内嵌的模型流重建，历史会话同样显示。',
  'tweak.turnTimePill.label': '用时 {duration}',
  'tweak.turnTimePill.pillTitle': '本轮用时和速度',
  'tweak.turnTimePill.duration': '本轮总用时',
  'tweak.turnTimePill.speed': '输出速度（TPS）',
  'tweak.turnTimePill.ttft': '首 token 用时（TTFT）',
  'tweak.contextPillNoTooltip.title': '上下文胶囊不显示悬停信息',
  'tweak.contextPillNoTooltip.description': '鼠标移到输入框下方的上下文胶囊上（0.1.6-alpha.2+ 新增）时，不再浮出"上下文已用 13%"的悬停提示。胶囊自身的悬停高亮与点开的明细弹窗不受影响；没有该胶囊的宿主上本项保持惰性。',
  'tweak.legacyContextMeter.title': '上下文圆环回到输入框内',
  'tweak.legacyContextMeter.description': '恢复 0.1.6-alpha.2 之前的上下文指示样式：28px 圆环按钮回到输入框工具行的发送键左侧，而不是卡片下方的胶囊。悬停读数与点击展开的占用明细保持不变；开启期间 DSH 自带的胶囊保持隐藏。',
  'tweak.workspaceClose.title': '工作区可关闭',
  'tweak.workspaceClose.description': '把工作区从侧边栏与新建会话选择器中隐藏，而不是删除：其名下会话一并隐藏（不会落入“未分组”，搜索里也不再出现），而注册记录、会话账目与磁盘文件全部保留。重新添加同一文件夹，或使用本面板中的「已关闭的工作区」列表即可恢复显示。',
  workspaceCloseMenu: '关闭工作区',
  workspaceCloseConfirmTitle: '关闭工作区',
  workspaceCloseConfirmBody: '将把“{name}”从工作区列表中关闭。文件夹、文件与会话记录都会保留；重新添加同一文件夹，或在样式调整设置中使用「已关闭的工作区」列表，即可恢复显示。',
  workspaceCloseConfirmOk: '关闭工作区',
  workspaceCloseCancel: '取消',
  workspaceCloseBusy: '正在关闭工作区…',
  workspaceCloseClosedSection: '已关闭的工作区',
  workspaceCloseClosedSectionHint: '这些工作区已从侧边栏与新建会话选择器中隐藏；其文件夹、文件与会话记录均未改动。',
  workspaceCloseRestore: '恢复',
  'legacyStats.counts': '{turns} 轮 · {steps} 步',
  'legacyStats.llm': 'LLM {duration}',
  'legacyStats.toolCall': '工具调用 {duration}',
  'legacyStats.ttftAverage': '首 token 平均 {duration}',
  'legacyStats.tokensPerSecond': '{throughput} tok/s',
  'legacyStats.cacheHit': '缓存命中 {percent}%',
  'legacyStats.tokens': '输入 {input} tok · 输出 {output} tok',
  'legacyStats.number.thousand': '{value}K',
  'legacyStats.number.million': '{value}M',
  'legacyStats.duration.seconds': '{seconds}秒',
  'legacyStats.duration.minutes': '{minutes}分{seconds}秒',
  'pills.counts': '{turns} 轮 {steps} 步',
  'pills.tokensPerSecond': '{tps} tok/s',
  'pills.cacheHit': '缓存命中 {percent}%',
  'pills.dialog.title': '会话统计',
  'pills.dialog.usageTitle': 'Token 用量',
  'pills.dialog.llmTime': '模型用时',
  'pills.dialog.toolTime': '工具调用用时',
  'pills.dialog.ttft': '首 token 平均（TTFT）',
  'pills.dialog.speed': '输出速度（TPS）',
  'pills.turnUsage.count': '{count} tok',
  'pills.turnUsage.cacheHit': '缓存命中',
  'pills.turnUsage.input': '未缓存输入',
  'pills.turnUsage.cacheRead': '缓存读取',
  'pills.turnUsage.cacheWrite': '缓存写入',
  'pills.turnUsage.output': '输出',
  'pills.number.thousand': '{value}K',
  'pills.number.million': '{value}M',
  'pills.number.groupSeparator': ',',
  'pills.duration.seconds': '{seconds}秒',
  'pills.duration.minutes': '{minutes}分{seconds}秒',
  'meter.aria': '上下文已用 {percent}',
  'meter.used': '上下文已用',
  'meter.system': '系统提示词',
  'meter.tools': '工具定义',
  'meter.messages': '对话消息',
}

type Translate = (key: LocaleKey) => string

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-style-tweaks Settings copy. */
    'style-tweaks': LocaleKey
  }
}

function resolveValue(value: TweaksValue | undefined): ResolvedTweaks {
  // Delegates to the client mirror in tweak-config.ts (itself a mirror of
  // `resolveConfig` in src/config.ts) so there is exactly one place where a
  // missing field falls back to its default. The previous hand-written copy
  // here was a fourth, unverified default site.
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
function sameMountInputs(left: ResolvedTweaks, right: ResolvedTweaks): boolean {
  for (const key of Object.keys(right) as Array<keyof ResolvedTweaks>) {
    if (key === 'closedWorkspaces') continue
    if (key === 'historyPageSizeEnabled' || key === 'historyPageSize' || key === 'historyPageSizeColdStart') continue
    if (left[key] !== right[key]) return false
  }
  return true
}

const BASE_CSS = `
.cst-settings{display:flex;flex-direction:column;gap:8px;max-width:680px;padding:4px 2px 24px;color:var(--dsw-alias-label-primary)}
.cst-settings-header{display:flex;align-items:flex-start;gap:10px;padding:2px 2px 0}
.cst-logo{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:linear-gradient(135deg,color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent),transparent);font-size:15px;line-height:1}
.cst-settings-header h2{font-size:16px;letter-spacing:-.01em;margin:0 0 2px}
.cst-settings-header p{max-width:600px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}
.cst-panel{display:grid;gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv1);overflow:hidden}
.cst-panel+.cst-panel{margin-top:10px}
.cst-section-label{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:9px 16px 4px}
.cst-field{display:grid;gap:6px;padding:7px 16px 10px}
.cst-field+.cst-field{border-top:1px solid var(--dsw-alias-border-l1)}
.cst-field-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.cst-field-top>span{font-size:13.5px;font-weight:600}
.cst-label{display:inline-flex;align-items:center;gap:6px}
.cst-hint{flex:none;display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:9.5px;font-weight:600;font-style:normal;line-height:1;cursor:help;user-select:none;transition:color .15s ease,border-color .15s ease}
.cst-hint:hover,.cst-hint:focus-visible{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}
.cst-hint-pop{position:fixed;z-index:9999;width:max-content;max-width:300px;overflow-wrap:anywhere;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:11.5px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.14);pointer-events:none}
.cst-controls{display:flex;align-items:center;gap:8px}
.cst-stepper{display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.cst-stepper button{width:28px;height:28px;border:none;background:transparent;color:inherit;font-size:15px;font-weight:500;line-height:1;cursor:pointer;display:grid;place-items:center;transition:background .15s ease}
.cst-stepper button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.cst-stepper button:disabled{opacity:.35;cursor:default}
.cst-stepper input{box-sizing:border-box;width:60px;height:28px;border:none;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;font-size:13px;text-align:center;-moz-appearance:textfield}
.cst-stepper input::-webkit-outer-spin-button,.cst-stepper input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.cst-stepper input:focus{outline:none}
.cst-seg{display:inline-flex;padding:3px;gap:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}
.cst-seg button{border:none;border-radius:7px;padding:5px 12px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s ease,color .15s ease}
.cst-seg button:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.cst-seg button.cst-seg-active{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:600;box-shadow:none}
.cst-seg button.cst-seg-active:hover:not(:disabled){color:var(--dsw-alias-state-business-primary)}
.cst-seg button:disabled{opacity:.45;cursor:default}
.cst-presets{display:inline-flex;flex-wrap:wrap;margin-top:2px}
/* Save feedback. A zero-height sticky anchor keeps the pill pinned near the top
 * of the settings content column (the .options scroll container) however far
 * the form is scrolled, without occupying flow space — the pill overlays
 * whatever sits at the top instead of pushing the form around on every save.
 * margin-top cancels the anchor's own flex gap so showing/hiding it never
 * nudges the form. (Flex column, not grid: a grid item's containing block is
 * its own area, which leaves sticky no room to travel.) */
.cst-status{position:sticky;top:8px;z-index:5;height:0;margin-top:-8px;display:flex;align-items:flex-start;justify-content:center;pointer-events:none}
.cst-status:empty{display:none}
.cst-snack{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 4px 14px rgba(0,0,0,.16);color:var(--dsw-alias-label-secondary);font-size:11.5px;font-weight:500;line-height:1;animation:cst-snack-in .22s cubic-bezier(.2,.7,.3,1)}
.cst-snack.cst-snack-applied{color:var(--dsw-alias-state-success-primary)}
.cst-snack.cst-snack-unavailable{color:var(--dsw-alias-state-error-primary)}
.cst-snack-dot{flex:none;width:5px;height:5px;border-radius:50%;background:currentColor}
.cst-snack-saving .cst-snack-dot{animation:cst-snack-pulse 1s ease-in-out infinite}
@keyframes cst-snack-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes cst-snack-pulse{0%,100%{opacity:1}50%{opacity:.25}}
.cst-loading{padding:16px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary)}
.cst-alert{padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.5}
.cst-alert.warning{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-label)}
.cst-alert.error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
`

function installBaseStyles(): () => void {
  const id = 'dsh-style-tweaks-base'
  let style = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.plugin = 'dsh-style-tweaks'
    style.dataset.pluginCss = id
    style.textContent = BASE_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}

/**
 * Settings requests retry briefly on 502/503: writing the profile patch
 * hot-reloads the `web` node and restarts this plugin for a moment (it
 * injects `web`), so a toggle click can land inside that window. The retry
 * rides it out instead of surfacing "settings unavailable" — fetch-level
 * failures (connection refused mid-restart) stay in the loop for the same
 * reason. A definite non-502/503 HTTP status is final: it must surface on
 * the first occurrence (a 409 conflict or a plain 400 idling through six
 * doomed round-trips before anyone sees it is the failure mode to avoid).
 */
async function apiRequest<T>(init?: RequestInit): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 6; attempt++) {
    /** This round ended in a deliberate HTTP status that must not be retried. */
    let fatal = false
    try {
      const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin', ...init })
      const body = await response.json() as ApiSuccess<T> | ApiFailure
      if (response.ok && body.ok) return body.value
      const failure = body as ApiFailure
      fatal = response.status !== 502 && response.status !== 503
      lastError = new SettingsApiError(
        response.status,
        failure.error?.code ?? `http-${response.status}`,
        failure.error?.message ?? `Style tweaks request failed with HTTP ${response.status}`,
      )
    } catch (error) {
      lastError = error
    }
    if (fatal) throw lastError
    await new Promise((resolve) => setTimeout(resolve, attempt * 250))
  }
  throw lastError ?? new Error('Style tweaks request failed')
}

/** Client-side snapshot store fed by the same-origin Settings route. */
interface SettingsState {
  status: 'loading' | 'ready' | 'error'
  writable: boolean
  value: TweaksValue | undefined
  revision: number | undefined
  error?: string
}

/** Small external store shared by the Settings route and the CSS engine. */
export class SettingsClient {
  private state: SettingsState = { status: 'loading', writable: false, value: undefined, revision: undefined }
  private listeners = new Set<() => void>()
  private generation = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): SettingsState => this.state

  private publish(next: SettingsState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  async load(): Promise<void> {
    const generation = ++this.generation
    if (this.state.status === 'loading') this.publish({ ...this.state, status: 'loading' })
    try {
      const snapshot = await apiRequest<Snapshot>()
      if (generation !== this.generation) return
      this.publish({
        status: 'ready',
        writable: snapshot.writable,
        value: snapshot.value,
        revision: snapshot.revision,
      })
    } catch (error) {
      if (generation !== this.generation) return
      this.publish({ ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Write one field. The expected revision is read at build time so the same
   * payload can be rebuilt after a conflict. A save whose expected revision
   * lost the race (another tab writing, or the settings watcher republishing
   * a hand edit) refetches the snapshot once and retries with the fresh
   * revision — bounded to a single attempt, so two racing writers converge
   * while a persistent conflict still surfaces to the caller.
   */
  private async post(build: (revision: number) => unknown, allowConflictRetry = true): Promise<void> {
    const generation = ++this.generation
    let snapshot: Snapshot
    try {
      snapshot = await apiRequest<Snapshot>({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(build(this.state.revision ?? 0)),
      })
    } catch (error) {
      if (!allowConflictRetry
        || !(error instanceof SettingsApiError)
        || (error.status !== 409 && error.code !== 'settings-conflict')) throw error
      // Refetch WITHOUT bumping the generation, so the `!==` check below
      // still tells us whether a newer write superseded us in the meantime.
      const fresh = await apiRequest<Snapshot>()
      if (generation !== this.generation) return
      this.publish({
        status: 'ready',
        writable: fresh.writable,
        value: fresh.value,
        revision: fresh.revision,
      })
      return this.post(build, false)
    }
    if (generation !== this.generation) return
    this.publish({
      status: 'ready',
      writable: snapshot.writable,
      value: snapshot.value,
      revision: snapshot.revision,
    })
  }

  async set(field: string, value: unknown): Promise<void> {
    await this.post((revision) => ({ action: 'set', field, value, expectedRevision: revision }))
  }

  async unset(field: string): Promise<void> {
    await this.post((revision) => ({ action: 'unset', field, expectedRevision: revision }))
  }
}

/** Required client services: slots (settings.section), locale, and the app stores the JS-level tweaks read. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

/**
 * Hover/focus hint: a small ⓘ next to the field label; the hint text renders
 * in a fixed-position bubble portaled to <body> (so panel `overflow:hidden`
 * can never clip it), measured in a layout effect to prefer the space above
 * the anchor and flip below near the viewport top. No layout shift: hints
 * never occupy flow height.
 */
function Hint({ text }: { text: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const pop = popRef.current
    if (anchor === undefined || pop === null) return
    let left = Math.min(Math.max(8, anchor.left), window.innerWidth - pop.offsetWidth - 8)
    let top = anchor.top - pop.offsetHeight - 8
    if (top < 8) top = anchor.bottom + 8
    setPos({ top, left })
  }, [open])
  return (
    <>
      <span
        ref={anchorRef}
        className="cst-hint"
        role="note"
        aria-label={text}
        tabIndex={0}
        onMouseEnter={() => { setOpen(true) }}
        onMouseLeave={() => { setOpen(false) }}
        onFocus={() => { setOpen(true) }}
        onBlur={() => { setOpen(false) }}
      >i</span>
      {open && createPortal(
        <div ref={popRef} className="cst-hint-pop" style={{ top: pos.top, left: pos.left }}>{text}</div>,
        document.body,
      )}
    </>
  )
}

type SettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'style-tweaks'> & {
  controller: SettingsClient
  t: Translate
}

function SettingsSection({ controller, t }: SettingsSectionProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const resolved = resolveValue(state.value)
  const writable = state.writable
  /** Save feedback for the top-of-panel pill; `seq` re-arms the auto-dismiss on every save. */
  const [snack, setSnack] = useState<{ kind: 'saving' | 'applied' | 'unavailable'; seq: number } | undefined>(undefined)
  const [savingShown, setSavingShown] = useState(false)
  const latestSave = useRef(0)

  useEffect(() => { if (state.status === 'loading' && state.value === undefined) void controller.load() }, [controller, state.status, state.value])
  // "Saving…" only appears once the request actually lags (the 502/503 retry
  // window); a fast round-trip jumps straight to the terminal state.
  useEffect(() => {
    if (snack?.kind !== 'saving') { setSavingShown(false); return }
    const timer = setTimeout(() => { setSavingShown(true) }, 350)
    return () => { clearTimeout(timer) }
  }, [snack])
  useEffect(() => {
    if (snack === undefined || snack.kind === 'saving') return
    const timer = setTimeout(() => { setSnack(undefined) }, 1800)
    return () => { clearTimeout(timer) }
  }, [snack])

  const save = (field: string, value: unknown): void => {
    const seq = ++latestSave.current
    setSnack({ kind: 'saving', seq })
    controller.set(field, value).then(() => {
      // A newer save supersedes this one's outcome.
      if (seq === latestSave.current) setSnack({ kind: 'applied', seq })
    }).catch(() => {
      if (seq === latestSave.current) setSnack({ kind: 'unavailable', seq })
    })
  }

  const [widthDraft, setWidthDraft] = useState<string>(String(resolved.dialogWidth))
  const [marginDraft, setMarginDraft] = useState<string>(String(resolved.sideMargin))
  const [thinkHeightDraft, setThinkHeightDraft] = useState<string>(String(resolved.thinkHeight))
  const [rightbarWidthDraft, setRightbarWidthDraft] = useState<string>(String(resolved.rightbarWidthPercent))
  const [historyPageSizeDraft, setHistoryPageSizeDraft] = useState<string>(String(resolved.historyPageSize))

  useEffect(() => { setWidthDraft(String(resolved.dialogWidth)) }, [resolved.dialogWidth])
  useEffect(() => { setMarginDraft(String(resolved.sideMargin)) }, [resolved.sideMargin])
  useEffect(() => { setThinkHeightDraft(String(resolved.thinkHeight)) }, [resolved.thinkHeight])
  useEffect(() => { setRightbarWidthDraft(String(resolved.rightbarWidthPercent)) }, [resolved.rightbarWidthPercent])
  useEffect(() => { setHistoryPageSizeDraft(String(resolved.historyPageSize)) }, [resolved.historyPageSize])

  const commitDialogWidth = (raw: string): void => {
    setWidthDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, Math.round(parsed)))
    setWidthDraft(String(clamped))
    save('dialogWidth', clamped)
  }

  const stepDialogWidth = (delta: number): void => {
    const next = Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, resolved.dialogWidth + delta))
    setWidthDraft(String(next))
    save('dialogWidth', next)
  }

  const applyWidthPreset = (width: number): void => {
    setWidthDraft(String(width))
    save('dialogWidth', width)
  }

  const setUsePluginWidth = (value: boolean): void => {
    save('usePluginWidth', value)
  }

  const commitSideMargin = (raw: string): void => {
    setMarginDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.max(MIN_SIDE_MARGIN, Math.round(parsed))
    setMarginDraft(String(clamped))
    save('sideMargin', clamped)
  }

  const stepSideMargin = (delta: number): void => {
    const next = Math.max(MIN_SIDE_MARGIN, resolved.sideMargin + delta)
    setMarginDraft(String(next))
    save('sideMargin', next)
  }

  const setThinkFixedHeight = (value: boolean): void => {
    save('thinkFixedHeight', value)
  }

  const commitThinkHeight = (raw: string): void => {
    setThinkHeightDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_THINK_HEIGHT, Math.max(MIN_THINK_HEIGHT, Math.round(parsed)))
    setThinkHeightDraft(String(clamped))
    save('thinkHeight', clamped)
  }

  const stepThinkHeight = (delta: number): void => {
    const next = Math.min(MAX_THINK_HEIGHT, Math.max(MIN_THINK_HEIGHT, resolved.thinkHeight + delta))
    setThinkHeightDraft(String(next))
    save('thinkHeight', next)
  }

  const setRightbarInitialWidth = (value: boolean): void => {
    save('rightbarInitialWidth', value)
  }

  const commitRightbarWidth = (raw: string): void => {
    setRightbarWidthDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_RIGHTBAR_WIDTH_PERCENT, Math.max(MIN_RIGHTBAR_WIDTH_PERCENT, Math.round(parsed)))
    setRightbarWidthDraft(String(clamped))
    save('rightbarWidthPercent', clamped)
  }

  const stepRightbarWidth = (delta: number): void => {
    const next = Math.min(MAX_RIGHTBAR_WIDTH_PERCENT, Math.max(MIN_RIGHTBAR_WIDTH_PERCENT, resolved.rightbarWidthPercent + delta))
    setRightbarWidthDraft(String(next))
    save('rightbarWidthPercent', next)
  }

  const applyRightbarWidthPreset = (percent: number): void => {
    setRightbarWidthDraft(String(percent))
    save('rightbarWidthPercent', percent)
  }

  const commitHistoryPageSize = (raw: string): void => {
    setHistoryPageSizeDraft(raw)
    // An emptied field — or one typed below the floor — must not silently
    // commit the minimum: 50 is not just the smallest page here, it is the
    // "feature is a no-op" value, and it also hides the cold-start row, so a
    // half-typed "3" on the way to "300" would look like the feature switched
    // itself off while its master switch still reads ON. Revert to the stored
    // size instead. (Unlike the other numeric fields, clamping is not a
    // harmless no-op here — that is the whole difference.)
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed < MIN_HISTORY_PAGE_SIZE) {
      setHistoryPageSizeDraft(String(resolved.historyPageSize))
      return
    }
    const clamped = Math.min(MAX_HISTORY_PAGE_SIZE, Math.round(parsed))
    setHistoryPageSizeDraft(String(clamped))
    save('historyPageSize', clamped)
  }

  const stepHistoryPageSize = (delta: number): void => {
    const next = Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(MIN_HISTORY_PAGE_SIZE, resolved.historyPageSize + delta))
    setHistoryPageSizeDraft(String(next))
    save('historyPageSize', next)
  }

  const setHistoryPageSizeColdStart = (value: boolean): void => {
    save('historyPageSizeColdStart', value)
  }

  const setTweak = (tweak: TweakDescriptor, value: boolean): void => {
    save(tweak.settingKey, value)
  }

  if (state.status === 'loading' && state.value === undefined) {
    return <div className="cst-settings"><div className="cst-loading">{t('loading')}</div></div>
  }
  if (state.status === 'error') {
    return <div className="cst-settings"><div className="cst-alert error">{t('unavailable')}</div></div>
  }

  return (
    <div className="cst-settings">
      <header className="cst-settings-header">
        <div className="cst-logo">🎨</div>
        <div>
          <h2>{t('settingsTitle')}</h2>
          <p>{t('settingsIntro')}</p>
        </div>
      </header>
      <div className="cst-status">
        {snack === undefined || (snack.kind === 'saving' && !savingShown) ? null : (
          <div className={'cst-snack cst-snack-' + snack.kind} role="status" aria-live="polite">
            <span className="cst-snack-dot" aria-hidden="true" />
            <span>{t(snack.kind)}</span>
          </div>
        )}
      </div>
      {!writable ? <div className="cst-alert warning">{t('readOnly')}</div> : null}

      <section className="cst-panel">
        <div className="cst-section-label">{t('sectionLayout')}</div>
        <div className="cst-field">
          <div className="cst-field-top">
            <span className="cst-label">{t('usePluginWidth')}<Hint text={t('usePluginWidthHint')} /></span>
            <div className="cst-controls">
              <div className="cst-seg">
                <button type="button" className={resolved.usePluginWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setUsePluginWidth(true) }}>{t('usePluginWidthOn')}</button>
                <button type="button" className={!resolved.usePluginWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setUsePluginWidth(false) }}>{t('usePluginWidthOff')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.usePluginWidth ? (
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('dialogWidth')}<Hint text={t('dialogWidthHint')} /></span>
              <div className="cst-controls">
                <div className="cst-stepper">
                  <button type="button" aria-label="−" disabled={!writable || resolved.dialogWidth <= MIN_DIALOG_WIDTH} onClick={() => { stepDialogWidth(-20) }}>−</button>
                  <input
                    type="number"
                    min={MIN_DIALOG_WIDTH}
                    max={MAX_DIALOG_WIDTH}
                    step={20}
                    value={widthDraft}
                    disabled={!writable}
                    onChange={(event) => { setWidthDraft(event.target.value) }}
                    onBlur={(event) => { commitDialogWidth(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitDialogWidth((event.target as HTMLInputElement).value) }}
                  />
                  <button type="button" aria-label="+" disabled={!writable || resolved.dialogWidth >= MAX_DIALOG_WIDTH} onClick={() => { stepDialogWidth(20) }}>+</button>
                </div>
              </div>
            </div>
            <div className="cst-presets">
              <div className="cst-seg">
                <button type="button" className={resolved.dialogWidth === 880 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(880) }}>{t('presetWide')} · 880</button>
                <button type="button" className={resolved.dialogWidth === 1024 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(1024) }}>{t('presetWideXl')} · 1024</button>
                <button type="button" className={resolved.dialogWidth === 748 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(748) }}>{t('presetDefault')} · 748</button>
              </div>
            </div>
          </div>
        ) : null}
        {resolved.usePluginWidth ? (
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('sideMargin')}<Hint text={t('sideMarginHint')} /></span>
              <div className="cst-controls">
                <div className="cst-stepper">
                  <button type="button" aria-label="−" disabled={!writable || resolved.sideMargin <= MIN_SIDE_MARGIN} onClick={() => { stepSideMargin(-4) }}>−</button>
                  <input
                    type="number"
                    min={MIN_SIDE_MARGIN}
                    step={4}
                    value={marginDraft}
                    disabled={!writable}
                    onChange={(event) => { setMarginDraft(event.target.value) }}
                    onBlur={(event) => { commitSideMargin(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitSideMargin((event.target as HTMLInputElement).value) }}
                  />
                  <button type="button" aria-label="+" disabled={!writable} onClick={() => { stepSideMargin(4) }}>+</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="cst-field">
          <div className="cst-field-top">
            <span className="cst-label">{t('thinkFixedHeight')}<Hint text={t('thinkFixedHeightHint')} /></span>
            <div className="cst-controls">
              <div className="cst-seg">
                <button type="button" className={resolved.thinkFixedHeight ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setThinkFixedHeight(true) }}>{t('tweakOn')}</button>
                <button type="button" className={!resolved.thinkFixedHeight ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setThinkFixedHeight(false) }}>{t('tweakOff')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.thinkFixedHeight ? (
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('thinkHeight')}<Hint text={t('thinkHeightHint')} /></span>
              <div className="cst-controls">
                <div className="cst-stepper">
                  <button type="button" aria-label="−" disabled={!writable || resolved.thinkHeight <= MIN_THINK_HEIGHT} onClick={() => { stepThinkHeight(-20) }}>−</button>
                  <input
                    type="number"
                    min={MIN_THINK_HEIGHT}
                    max={MAX_THINK_HEIGHT}
                    step={20}
                    value={thinkHeightDraft}
                    disabled={!writable}
                    onChange={(event) => { setThinkHeightDraft(event.target.value) }}
                    onBlur={(event) => { commitThinkHeight(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitThinkHeight((event.target as HTMLInputElement).value) }}
                  />
                  <button type="button" aria-label="+" disabled={!writable || resolved.thinkHeight >= MAX_THINK_HEIGHT} onClick={() => { stepThinkHeight(20) }}>+</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="cst-field">
          <div className="cst-field-top">
            <span className="cst-label">{t('rightbarInitialWidth')}<Hint text={t('rightbarInitialWidthHint')} /></span>
            <div className="cst-controls">
              <div className="cst-seg">
                <button type="button" className={resolved.rightbarInitialWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setRightbarInitialWidth(true) }}>{t('tweakOn')}</button>
                <button type="button" className={!resolved.rightbarInitialWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setRightbarInitialWidth(false) }}>{t('tweakOff')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.rightbarInitialWidth ? (
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('rightbarWidthPercent')}<Hint text={t('rightbarWidthPercentHint')} /></span>
              <div className="cst-controls">
                <div className="cst-stepper">
                  <button type="button" aria-label="−" disabled={!writable || resolved.rightbarWidthPercent <= MIN_RIGHTBAR_WIDTH_PERCENT} onClick={() => { stepRightbarWidth(-5) }}>−</button>
                  <input
                    type="number"
                    min={MIN_RIGHTBAR_WIDTH_PERCENT}
                    max={MAX_RIGHTBAR_WIDTH_PERCENT}
                    step={5}
                    value={rightbarWidthDraft}
                    disabled={!writable}
                    onChange={(event) => { setRightbarWidthDraft(event.target.value) }}
                    onBlur={(event) => { commitRightbarWidth(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitRightbarWidth((event.target as HTMLInputElement).value) }}
                  />
                  <button type="button" aria-label="+" disabled={!writable || resolved.rightbarWidthPercent >= MAX_RIGHTBAR_WIDTH_PERCENT} onClick={() => { stepRightbarWidth(5) }}>+</button>
                </div>
              </div>
            </div>
            <div className="cst-presets">
              <div className="cst-seg">
                <button type="button" className={resolved.rightbarWidthPercent === 30 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(30) }}>30%</button>
                <button type="button" className={resolved.rightbarWidthPercent === 40 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(40) }}>40%</button>
                <button type="button" className={resolved.rightbarWidthPercent === 45 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(45) }}>{t('presetDefault')} · 45%</button>
                <button type="button" className={resolved.rightbarWidthPercent === 55 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(55) }}>55%</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="cst-panel">
        <div className="cst-section-label">{t('sectionHistory')}</div>
        <div className="cst-field">
          <div className="cst-field-top">
            <span className="cst-label">{t('historyPageSizeEnabled')}<Hint text={t('historyPageSizeEnabledHint')} /></span>
            <div className="cst-controls">
              <div className="cst-seg">
                <button type="button" className={resolved.historyPageSizeEnabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { save('historyPageSizeEnabled', true) }}>{t('tweakOn')}</button>
                <button type="button" className={!resolved.historyPageSizeEnabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { save('historyPageSizeEnabled', false) }}>{t('tweakOff')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.historyPageSizeEnabled ? (
          <>
            <div className="cst-field">
              <div className="cst-field-top">
                <span className="cst-label">{t('historyPageSize')}<Hint text={t('historyPageSizeHint')} /></span>
                <div className="cst-controls">
                  <div className="cst-stepper">
                    <button type="button" aria-label="−" disabled={!writable || resolved.historyPageSize <= MIN_HISTORY_PAGE_SIZE} onClick={() => { stepHistoryPageSize(-STEP_HISTORY_PAGE_SIZE) }}>−</button>
                    <input
                      type="number"
                      min={MIN_HISTORY_PAGE_SIZE}
                      max={MAX_HISTORY_PAGE_SIZE}
                      step={STEP_HISTORY_PAGE_SIZE}
                      value={historyPageSizeDraft}
                      disabled={!writable}
                      onChange={(event) => { setHistoryPageSizeDraft(event.target.value) }}
                      onBlur={(event) => { commitHistoryPageSize(event.target.value) }}
                      onKeyDown={(event) => { if (event.key === 'Enter') commitHistoryPageSize((event.target as HTMLInputElement).value) }}
                    />
                    <button type="button" aria-label="+" disabled={!writable || resolved.historyPageSize >= MAX_HISTORY_PAGE_SIZE} onClick={() => { stepHistoryPageSize(STEP_HISTORY_PAGE_SIZE) }}>+</button>
                  </div>
                </div>
              </div>
            </div>
            {/* Hide only when the size cannot exceed the native 50-message
                first screen — compare against the stock minimum, NOT the
                configurable default (200), or the row would never show. */}
            {resolved.historyPageSize > MIN_HISTORY_PAGE_SIZE ? (
              <div className="cst-field">
                <div className="cst-field-top">
                  <span className="cst-label">{t('historyPageSizeColdStart')}<Hint text={t('historyPageSizeColdStartHint')} /></span>
                  <div className="cst-controls">
                    <div className="cst-seg">
                      <button type="button" className={resolved.historyPageSizeColdStart ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setHistoryPageSizeColdStart(true) }}>{t('tweakOn')}</button>
                      <button type="button" className={!resolved.historyPageSizeColdStart ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setHistoryPageSizeColdStart(false) }}>{t('tweakOff')}</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="cst-panel">
        <div className="cst-section-label">{t('sectionTweaks')}</div>
        {TWEAKS.map(tweak => {
          const enabled = (resolved as unknown as Record<string, boolean>)[tweak.settingKey] ?? tweak.defaultEnabled
          // Dependent rows drop out of the panel entirely while their gate
          // holds (hidden, never greyed out — the rule the dependent numeric
          // fields already follow). The stored value is untouched.
          if (
            tweak.hiddenWhen !== undefined
            && (resolved as unknown as Record<string, boolean>)[tweak.hiddenWhen.field] === tweak.hiddenWhen.value
          ) {
            return null
          }
          return (
            <div className="cst-field" key={tweak.id}>
              <div className="cst-field-top">
                <span className="cst-label">{t(tweak.titleKey as LocaleKey)}<Hint text={t(tweak.descriptionKey as LocaleKey)} /></span>
                <div className="cst-controls">
                  <div className="cst-seg">
                    <button type="button" className={enabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setTweak(tweak, true) }}>{t('tweakOn')}</button>
                    <button type="button" className={!enabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setTweak(tweak, false) }}>{t('tweakOff')}</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {resolved.workspaceClose && resolved.closedWorkspaces.length > 0 && (
        <section className="cst-panel">
          <div className="cst-section-label">{t('workspaceCloseClosedSection')}</div>
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('workspaceCloseClosedSectionHint')}</span>
            </div>
          </div>
          {closedWorkspaceEntries().map(entry => (
            <div className="cst-field" key={entry.workspaceId}>
              <div className="cst-field-top">
                <span className="cst-label">
                  {entry.title}
                  {/* Same hint affordance as the tweak rows: two Workspaces
                      can share a folder basename, so the folder is what
                      actually tells them apart when restoring. */}
                  {entry.path !== undefined ? <Hint text={entry.path} /> : null}
                </span>
                <div className="cst-controls">
                  <div className="cst-seg">
                    <button
                      type="button"
                      disabled={!writable}
                      onClick={() => {
                        // Local-first, like the close path: the live tweak drops
                        // the id and notifies at once, then persists. `save` is
                        // only the fallback for a window where it is unmounted.
                        if (restoreClosedWorkspace(entry.workspaceId)) return
                        save('closedWorkspaces', resolved.closedWorkspaces.filter(id => id !== entry.workspaceId))
                      }}
                    >{t('workspaceCloseRestore')}</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

/**
 * Sanity-check that every tweak in the registry has matching `titleKey` /
 * `descriptionKey` strings in both `en` and `zh`. Catches "added a tweak
 * but forgot the i18n strings" at apply time instead of as an untranslated
 * label visible to users.
 */
function assertTweakI18nComplete(): void {
  const missing = (locale: 'en' | 'zh', table: Record<LocaleKey, string>): string[] => {
    const out: string[] = []
    for (const tweak of TWEAKS) {
      if (table[tweak.titleKey as LocaleKey] === undefined) out.push(`${locale}:${tweak.titleKey}`)
      if (table[tweak.descriptionKey as LocaleKey] === undefined) out.push(`${locale}:${tweak.descriptionKey}`)
    }
    return out
  }
  const problems = [...missing('en', en), ...missing('zh', zh)]
  if (problems.length > 0) {
    console.error('[dsh-style-tweaks] missing i18n keys:', problems)
  }
}

export function apply(ctx: ClientContext): void {
  assertTweakI18nComplete()
  ctx.effect(installBaseStyles, 'dsh-style-tweaks: base styles')
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-style-tweaks: locale')
  const t = ctx.locale.bind(NS)

  // Permanent chrome for this plugin's OWN Settings entry — not a tweak, so
  // it lives outside the TWEAKS loop and has no setting: DSH picks the rail
  // glyph from a hard-coded table that special-cases only `models` /
  // `agent-presets` / `plugins`, and the `settings.section` registration
  // options carry no icon field, so every other section (this one included)
  // is drawn with the same settings gear. The glyph is therefore swapped in
  // the DOM for as long as the plugin is loaded; see `settings-nav-icon.ts`.
  ctx.effect(
    () => setupSettingsNavIcon(() => t('nav')),
    'dsh-style-tweaks: settings nav icon',
  )

  const controller = new SettingsClient()

  // Width-axis override: when plugin-width is on, install the handle-hiding
  // + user-width-clamp CSS once and keep the same controller alive; on
  // every settings change, mutate it in place via `setWidth` (no reinstall,
  // no flicker — DSH's own `publishWidths` races the install on every
  // ResizeObserver tick and would otherwise drop the first frame). When the
  // user toggles plugin-width off, dispose the controller so DSH's native
  // handles take back over.
  ctx.effect(() => {
    let widthController: ReturnType<typeof installConversationWidthStyles> | undefined
    const sync = (): void => {
      const value = controller.getSnapshot().value
      const usePlugin = value?.usePluginWidth ?? DEFAULT_USE_PLUGIN_WIDTH
      const width = resolveDialogWidth(value?.dialogWidth)
      const sideMargin = resolveSideMargin(value?.sideMargin)
      if (usePlugin) {
        if (widthController === undefined) {
          widthController = installConversationWidthStyles(width, sideMargin)
        } else {
          widthController.setWidth(width, sideMargin)
        }
      } else if (widthController !== undefined) {
        widthController.dispose()
        widthController = undefined
      }
    }
    sync()
    void controller.load()
    return controller.subscribe(sync)
  }, 'dsh-style-tweaks: conversation width')

  // Mount / unmount tweak styles live as settings change. The subscribe
  // callback re-runs on every settings change, so all toggles apply live.
  // (Without `controller.subscribe(sync)` returning, sync only runs once at
  // boot — a regression that would let tweak toggles never take effect after
  // the first paint.)
  ctx.effect(() => {
    const cleanups: Array<() => void> = []
    /** The resolved input the live mounts were built from. */
    let mounted: ResolvedTweaks | undefined
    const sync = (): void => {
      const value = controller.getSnapshot().value
      const resolved = resolveValue(value)
      // History page size: a transport feature, so it is handled BEFORE the
      // mount early-return below — `sameMountInputs` excludes the
      // `historyPageSize*` keys, which makes this the only place that can push
      // them. The fetch/WebSocket rewrites install once for the page lifetime
      // (no teardown of the wrappers: unwinding them around other plugins' own
      // wrappers is not worth the risk); every settings change just moves the
      // live targets, so a save applies to the next request without
      // re-patching anything. The targets are only pushed once the settings
      // snapshot has landed: the transport seeds itself from localStorage for
      // the cold window, and publishing the defaults before the first read
      // would clobber that seed. The push carries the EFFECTIVE settings — the
      // master switch off means the stock 50-message pages stand, whatever the
      // stored size says; the stored size survives for a re-enable. The
      // cold-start flag is masked by the same switch, so an off feature skips
      // the `session/follow` frame parse as well and not just the rewrite.
      installHistoryPageSizeTransport()
      if (value !== undefined) {
        setHistoryPageSizeTargets(
          resolved.historyPageSizeEnabled ? resolved.historyPageSize : MIN_HISTORY_PAGE_SIZE,
          resolved.historyPageSizeEnabled && resolved.historyPageSizeColdStart,
        )
      }
      // A settings change that only moves an excluded key (see
      // `sameMountInputs`) needs no re-mount. Everything else re-mounts.
      if (mounted !== undefined && sameMountInputs(mounted, resolved)) {
        mounted = resolved
        return
      }
      mounted = resolved
      // Full remount: simplest, and the per-tweak mounts are cheap and few
      // enough that tearing them all down on every settings change stays
      // imperceptible.
      while (cleanups.length > 0) cleanups.pop()!()
      for (const tweak of TWEAKS) {
        const enabled = (resolved as unknown as Record<string, boolean>)[tweak.settingKey] ?? tweak.defaultEnabled
        if (!enabled) continue
        const injector = TWEAK_INJECTORS[tweak.id]
        if (injector === undefined) continue
        cleanups.push(injector(ctx, resolved, controller))
      }
      // Layout-section feature with a numeric parameter (like the width axis
      // above): not a registry boolean, so it mounts outside the TWEAKS loop.
      if (resolved.thinkFixedHeight) {
        cleanups.push(installThinkingScrollStyles(resolved.thinkHeight))
      }
      // Right Sidebar initial width: a layout feature with a numeric
      // parameter, mounted outside the TWEAKS loop for the same reason as the
      // think cap above. Re-mounted on every settings change, which is also
      // what makes the live preview work while the sidebar is open.
      if (resolved.rightbarInitialWidth) {
        cleanups.push(installRightbarInitialWidth(ctx, resolved.rightbarWidthPercent))
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    // Plugin teardown (disable, or a bundle reload in the same page): the
    // wrappers stay installed for the page lifetime by design, but this
    // instance releases the targets so it stops rewriting. The release is
    // ownership-checked on the shared state, so a teardown that lands after
    // the next instance has already taken over is a no-op rather than a wipe
    // of the new instance's settings.
    return () => {
      unsubscribe()
      resetHistoryPageSizeTargets()
    }
  }, 'dsh-style-tweaks: live tweak styles')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: NS,
    order: 90,
    label: () => t('nav'),
    inject: () => ({ controller, t }),
  }, SettingsSection))
}