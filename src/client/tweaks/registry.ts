/**
 * dsh-style-tweaks — tweak registry.
 *
 * Central catalogue of all CSS tweaks the plugin can inject. Each tweak is
 * described once here; the client iterates this list to (a) render Settings
 * panel toggles and (b) mount / unmount the corresponding styles live.
 */

export interface TweakDescriptor {
  /** Unique id, e.g. "stable-turn-rail". Doubles as the DOM data-tweak id. */
  readonly id: string
  /** Settings document field name, e.g. "stableTurnRail". */
  readonly settingKey: string
  /** Default value when the field is absent from the settings document. */
  readonly defaultEnabled: boolean
  /** i18n key for the toggle label in the Settings panel. */
  readonly titleKey: string
  /** i18n key for the one-line description shown next to the toggle. */
  readonly descriptionKey: string
  /**
   * Optional Settings-row gate: while the named field holds this value, the
   * row is not rendered at all (hidden, never greyed out — the same rule the
   * dependent numeric fields follow). The stored value keeps working: the
   * live mount still keys off `settingKey`, only the row disappears.
   */
  readonly hiddenWhen?: {
    readonly field: string
    readonly value: boolean
  }
}

/** All tweaks, in display order. Add new entries here. */
export const TWEAKS: readonly TweakDescriptor[] = [
  {
    id: 'stable-turn-rail',
    settingKey: 'stableTurnRail',
    defaultEnabled: true,
    titleKey: 'tweak.stableTurnRail.title',
    descriptionKey: 'tweak.stableTurnRail.description',
  },
  {
    id: 'stable-session-title',
    settingKey: 'stableSessionTitle',
    // Off: the hover reveal is 0.1.6-alpha.2's shipped affordance; opting
    // back into the pre-alpha.1 always-ellipsis resting title is opt-in.
    defaultEnabled: false,
    titleKey: 'tweak.stableSessionTitle.title',
    descriptionKey: 'tweak.stableSessionTitle.description',
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
    id: 'legacy-context-meter',
    settingKey: 'legacyContextMeter',
    // Off: the capsule is 0.1.6-alpha.2's shipped affordance; the pre-alpha.2
    // in-card ring is opt-in.
    defaultEnabled: false,
    titleKey: 'tweak.legacyContextMeter.title',
    descriptionKey: 'tweak.legacyContextMeter.description',
  },
  {
    id: 'context-pill-no-tooltip',
    settingKey: 'contextPillNoTooltip',
    defaultEnabled: false,
    titleKey: 'tweak.contextPillNoTooltip.title',
    descriptionKey: 'tweak.contextPillNoTooltip.description',
    // Dependent row: the switch names the capsule, which the legacy ring
    // replaces (and hides) — with the ring on there is no capsule left to
    // govern, so the row is hidden. The stored value still applies: it
    // suppresses the ported ring's hover reading too, and comes back into
    // view (with that value) the moment the ring is turned off.
    hiddenWhen: { field: 'legacyContextMeter', value: true },
  },
  {
    id: 'workspace-close',
    settingKey: 'workspaceClose',
    defaultEnabled: false,
    titleKey: 'tweak.workspaceClose.title',
    descriptionKey: 'tweak.workspaceClose.description',
  },
]
