/**
 * dsh-style-tweaks — server half.
 *
 * Declares the `style-tweaks` settings namespace so users can
 * toggle conversation-view CSS tweaks either from the Settings panel or by
 * editing the plugin entry's `config` in the profile patch. All rendering
 * work happens in the browser bundle (`src/client`), which reads and writes
 * this namespace through the same-origin route mounted here — the Web
 * settings RPC only exposes a fixed allowlist of namespaces since rc.6, so a
 * custom route is the supported way for a plugin to own a configuration page.
 * @module dsh-style-tweaks
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  STYLE_TWEAKS_SETTINGS_NAMESPACE,
  Config,
} from './config.ts'
import { StyleTweaksWebBackend, installStyleTweaksWeb } from './web.ts'

export const name = 'dsh-style-tweaks'

/**
 * The entry's Config schema. Exported so the Loader validates the profile
 * patch's `config` against it and — on DSH 0.1.7+ — so the settings service
 * has a schema to project this plugin's form from: since that line a plugin's
 * settings namespace IS its own entry Config, addressed by the entry id.
 */
export { Config }

/** Required services: the settings seam is the whole server-side surface. */
export const inject = ['settings', 'web']

/**
 * The two settings-service shapes this plugin spans: `register` owned a
 * namespace up to DSH 0.1.6, and `configure` sets the page policy for the
 * entry Config that owns it from 0.1.7 on (where `register` is gone).
 */
interface SettingsSeam {
  register?(namespace: string, schema: unknown, options: { applies: 'live' }): void
  configure?(presentation: { auto?: boolean }, owner: unknown): () => void
}

export function apply(ctx: Context): void {
  const settings = ctx.settings as unknown as SettingsSeam
  if (typeof settings.register === 'function') {
    settings.register(STYLE_TWEAKS_SETTINGS_NAMESPACE, Config, { applies: 'live' })
  } else {
    // The entry Config is the namespace here. `auto: false` keeps the Plugins
    // page from generating a second form beside this plugin's own Settings
    // section, which stays the curated surface (labels, dependent rows).
    ctx.effect(() => {
      const dispose = settings.configure?.({ auto: false }, ctx.fiber)
      return () => { dispose?.() }
    })
  }

  // The browser Settings panel talks to the namespace through this same-origin
  // route (the Web settings RPC only exposes a fixed allowlist since rc.6).
  installStyleTweaksWeb(ctx, new StyleTweaksWebBackend(ctx))

  ctx.logger.info('[dsh-style-tweaks] settings namespace declared and Web routes mounted')
}
