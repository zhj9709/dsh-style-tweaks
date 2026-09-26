/**
 * dsh-style-tweaks — browser half (entry point).
 *
 * Wires the plugin into the client runtime and owns the settings panel's
 * mount loop. The bulk of the work lives in siblings:
 *
 *   • `i18n.ts`            — both locale tables and the registry key check.
 *   • `settings-value.ts`  — the settings document and the one resolver.
 *   • `settings-client.ts` — the same-origin `/_dsh/style-tweaks/settings` client.
 *   • `panel.tsx`          — the `settings.section` page itself.
 *   • `mutation-scope.ts`  — the region gate every DOM observer shares.
 *   • `tweaks/*`           — one module (or one CSS injector) per tweak, with
 *                          `tweaks/registry.ts` as the roster.
 *
 * What stays here: the tweak-id → mount-function table, the base stylesheet,
 * and the effect that re-mounts every enabled tweak whenever the settings
 * document changes.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports activate the client-service Context declarations.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { installConversationWidthStyles } from './conversation-width.ts'
import { claimStyleNode, releaseStyleNode } from './style-node.ts'
import { setupSettingsNavIcon } from './settings-nav-icon.ts'
import { setupDesktopSettingsLauncher } from './tweaks/desktop-settings-launcher.ts'
import { DEFAULT_USE_PLUGIN_WIDTH, DEFAULT_DESKTOP_SETTINGS_LAUNCHER, resolveDialogWidth, resolveSideMargin } from './tweak-config.ts'
import { TWEAKS } from './tweaks/registry.ts'
import { assertTweakI18nComplete, en, zh } from './i18n.ts'
import { SettingsClient } from './settings-client.ts'
import { SettingsSection } from './panel.tsx'
import { isDesktopRuntime, resolveValue, sameMountInputs, type ResolvedTweaks } from './settings-value.ts'
import { installHistoryPageSizeTransport, resetHistoryPageSizeTargets, setHistoryPageSizeTargets } from './tweaks/history-page-size.ts'
import { installRightbarInitialWidth } from './tweaks/rightbar-initial-width.ts'
import { injectStableSessionTitleStyles } from './tweaks/stable-session-title.ts'
import { injectHideSessionHoverActionsStyles } from './tweaks/hide-session-hover-actions.ts'
import { injectOpaqueStatDialogsStyles } from './tweaks/opaque-stat-dialogs.ts'
import { injectKeepTurnRailStyles } from './tweaks/keep-turn-rail.ts'
import { injectCodeBlockFlushTopStyles } from './tweaks/code-block-flush-top.ts'
import { setupProjectRunningIndicator } from './tweaks/project-running-indicator.ts'
import { setupLocateCurrentSession } from './tweaks/locate-current-session.ts'
import { setupSettingsNavScroll } from './tweaks/settings-nav-scroll.ts'
import { setupSidebarMiddleClickClose } from './tweaks/sidebar-middle-click-close.ts'
import { setupLegacyStatsLine } from './tweaks/legacy-stats-line.tsx'
import { setupPillsCacheHitDecimals } from './tweaks/pills-cache-hit-decimals.tsx'
import { setupTurnTimePill } from './tweaks/turn-time-pill.tsx'
import { setupTurnProcessCounts } from './tweaks/turn-process-counts.ts'
import { setupRunningStatus } from './tweaks/running-status.ts'
import { injectContextPillNoTooltipStyles } from './tweaks/context-pill-no-tooltip.ts'
import { setupLegacyContextMeter } from './tweaks/legacy-context-meter.tsx'
import { setupWorkspaceClose } from './tweaks/workspace-close.ts'

const NS = 'style-tweaks'

/**
 * Maps a tweak id to its mount function. Add new tweaks here. Pure-CSS
 * injectors ignore the context and the resolved values; JS-level tweaks
 * (DOM patching driven by app stores) receive the context to read services
 * like `sessions` / `workspaces`, and tweaks whose render depends on other
 * settings read the resolved snapshot (captured at mount — any settings
 * change remounts every tweak, so the capture never goes stale).
 */
const TWEAK_INJECTORS: Record<string, (ctx: ClientContext, resolved: ResolvedTweaks, settings: SettingsClient) => () => void> = {
  'stable-session-title': () => injectStableSessionTitleStyles(),
  'hide-session-hover-actions': () => injectHideSessionHoverActionsStyles(),
  'opaque-stat-dialogs': () => injectOpaqueStatDialogsStyles(),
  'keep-turn-rail': () => injectKeepTurnRailStyles(),
  'code-block-flush-top': () => injectCodeBlockFlushTopStyles(),
  'project-running-indicator': setupProjectRunningIndicator,
  'locate-current-session': setupLocateCurrentSession,
  'settings-nav-scroll': setupSettingsNavScroll,
  'sidebar-middle-click-close': setupSidebarMiddleClickClose,
  'legacy-stats-line': (ctx, resolved) => setupLegacyStatsLine(ctx, resolved.pillsCacheHitDecimals),
  'pills-cache-hit-decimals': setupPillsCacheHitDecimals,
  'turn-time-pill': setupTurnTimePill,
  'turn-process-counts': setupTurnProcessCounts,
  'running-status': setupRunningStatus,
  'context-pill-no-tooltip': () => injectContextPillNoTooltipStyles(),
  'legacy-context-meter': setupLegacyContextMeter,
  'workspace-close': (ctx, resolved, settings) => setupWorkspaceClose(ctx, resolved, settings),
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
.cst-alert-detail{margin-top:4px;font-family:var(--dsw-alias-font-mono,monospace);font-size:11px;line-height:1.45;opacity:.85;overflow-wrap:anywhere}
.cst-btn{margin-top:8px;padding:5px 12px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:11.5px;font-weight:500;cursor:pointer}
.cst-btn:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
.cst-btn:active{background:color-mix(in srgb,currentColor 18%,transparent)}
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
  const owner = claimStyleNode(style)
  return () => { releaseStyleNode(style, owner) }
}

/** Required client services: slots (settings.section), locale, and the app stores the JS-level tweaks read. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

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

  // The Desktop launcher is opt-in. Keep it out of the DOM until the settings
  // snapshot has resolved true, and tear it down immediately when the user
  // turns it back off so the host's native More → Settings path is restored.
  ctx.effect(() => {
    let cleanup: (() => void) | undefined
    const sync = (): void => {
      const value = controller.getSnapshot().value
      const enabled = isDesktopRuntime()
        && (value === undefined
          ? DEFAULT_DESKTOP_SETTINGS_LAUNCHER
          : resolveValue(value).desktopSettingsLauncher)
      if (enabled && cleanup === undefined) {
        cleanup = setupDesktopSettingsLauncher(
          () => t('desktopSettingsLabel'),
          () => t('desktopSettingsHint'),
        )
      } else if (!enabled && cleanup !== undefined) {
        cleanup()
        cleanup = undefined
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    return () => {
      unsubscribe()
      cleanup?.()
    }
  }, 'dsh-style-tweaks: desktop settings launcher')

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
    /** Prevent a queued settings callback from remounting after teardown. */
    let disposed = false
    /** Dispose every mount even when one cleanup happens to throw. */
    const disposeMounts = (): void => {
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop()
        try {
          cleanup?.()
        } catch (error) {
          console.error('[dsh-style-tweaks] tweak cleanup failed', error)
        }
      }
    }
    /** The resolved input the live mounts were built from. */
    let mounted: ResolvedTweaks | undefined
    const sync = (): void => {
      if (disposed) return
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
      // master switch off passes a null target, so DSH's native request values
      // stand whatever the stored size says; the stored size survives for a
      // re-enable. The cold-start flag is masked by the same switch, so an off
      // feature skips the `session/follow` frame parse as well as the rewrite.
      installHistoryPageSizeTransport()
      if (value !== undefined) {
        setHistoryPageSizeTargets(
          resolved.historyPageSizeEnabled ? resolved.historyPageSize : null,
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
      disposeMounts()
      for (const tweak of TWEAKS) {
        const enabled = (resolved as unknown as Record<string, boolean>)[tweak.settingKey] ?? tweak.defaultEnabled
        if (!enabled) continue
        const injector = TWEAK_INJECTORS[tweak.id]
        if (injector === undefined) continue
        cleanups.push(injector(ctx, resolved, controller))
      }
      // Right Sidebar initial width: a layout feature with a numeric
      // parameter — not a registry boolean, so it mounts outside the TWEAKS
      // loop (like the width axis above). Re-mounted on every settings
      // change, which is also what makes the live preview work while the
      // sidebar is open.
      if (resolved.rightbarInitialWidth) {
        cleanups.push(installRightbarInitialWidth(ctx, resolved.rightbarWidthPercent))
      }
    }
    sync()
    const unsubscribe = controller.subscribe(sync)
    // Plugin teardown (disable, or a bundle reload in the same page): the
    // history transport wrappers stay installed for the page lifetime by
    // design, but every tweak mount owned by this effect must be released.
    // The history-target release is ownership-checked on shared state, so a
    // teardown that lands after the next instance took over cannot wipe it.
    return () => {
      if (disposed) return
      disposed = true
      unsubscribe()
      disposeMounts()
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
