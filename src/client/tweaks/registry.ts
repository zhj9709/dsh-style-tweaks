/**
 * dsh-style-tweaks — tweak registry.
 *
 * Central catalogue of all CSS tweaks the plugin can inject. Each tweak is
 * described once here; the client iterates this list to (a) render Settings
 * panel toggles and (b) mount / unmount the corresponding styles live.
 */

export interface TweakDescriptor {
  /** Unique id, e.g. "stable-table". Doubles as the DOM data-tweak id. */
  readonly id: string
  /** Settings document field name, e.g. "stableTable". */
  readonly settingKey: string
  /** Default value when the field is absent from the settings document. */
  readonly defaultEnabled: boolean
  /** i18n key for the toggle label in the Settings panel. */
  readonly titleKey: string
  /** i18n key for the one-line description shown next to the toggle. */
  readonly descriptionKey: string
}

/** All tweaks, in display order. Add new entries here. */
export const TWEAKS: readonly TweakDescriptor[] = [
  {
    id: 'stable-table',
    settingKey: 'stableTable',
    // Off: DSH 0.1.6-alpha.1 fixed the hover reflow upstream.
    defaultEnabled: false,
    titleKey: 'tweak.stableTable.title',
    descriptionKey: 'tweak.stableTable.description',
  },
  {
    id: 'stable-turn-rail',
    settingKey: 'stableTurnRail',
    defaultEnabled: true,
    titleKey: 'tweak.stableTurnRail.title',
    descriptionKey: 'tweak.stableTurnRail.description',
  },
  {
    id: 'keep-turn-rail',
    settingKey: 'keepTurnRail',
    defaultEnabled: false,
    titleKey: 'tweak.keepTurnRail.title',
    descriptionKey: 'tweak.keepTurnRail.description',
  },
  {
    id: 'code-block-flush-top',
    settingKey: 'codeBlockFlushTop',
    defaultEnabled: true,
    titleKey: 'tweak.codeBlockFlushTop.title',
    descriptionKey: 'tweak.codeBlockFlushTop.description',
  },
  {
    id: 'project-running-indicator',
    settingKey: 'projectRunningIndicator',
    defaultEnabled: true,
    titleKey: 'tweak.projectRunningIndicator.title',
    descriptionKey: 'tweak.projectRunningIndicator.description',
  },
  {
    id: 'locate-current-session',
    settingKey: 'locateCurrentSession',
    defaultEnabled: true,
    titleKey: 'tweak.locateCurrentSession.title',
    descriptionKey: 'tweak.locateCurrentSession.description',
  },
  {
    id: 'settings-nav-scroll',
    settingKey: 'settingsNavScroll',
    defaultEnabled: true,
    titleKey: 'tweak.settingsNavScroll.title',
    descriptionKey: 'tweak.settingsNavScroll.description',
  },
  {
    id: 'sidebar-middle-click-close',
    settingKey: 'sidebarMiddleClickClose',
    defaultEnabled: true,
    titleKey: 'tweak.sidebarMiddleClickClose.title',
    descriptionKey: 'tweak.sidebarMiddleClickClose.description',
  },
  {
    id: 'legacy-stats-line',
    settingKey: 'legacyStatsLine',
    defaultEnabled: false,
    titleKey: 'tweak.legacyStatsLine.title',
    descriptionKey: 'tweak.legacyStatsLine.description',
  },
  {
    id: 'pills-cache-hit-decimals',
    settingKey: 'pillsCacheHitDecimals',
    defaultEnabled: false,
    titleKey: 'tweak.pillsCacheHitDecimals.title',
    descriptionKey: 'tweak.pillsCacheHitDecimals.description',
  },
  {
    id: 'turn-speed-metrics',
    settingKey: 'turnSpeedMetrics',
    defaultEnabled: false,
    titleKey: 'tweak.turnSpeedMetrics.title',
    descriptionKey: 'tweak.turnSpeedMetrics.description',
  },
  {
    id: 'workspace-close',
    settingKey: 'workspaceClose',
    defaultEnabled: false,
    titleKey: 'tweak.workspaceClose.title',
    descriptionKey: 'tweak.workspaceClose.description',
  },
]
