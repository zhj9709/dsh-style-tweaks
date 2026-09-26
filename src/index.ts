/**
 * dsh-style-tweaks — server half.
 *
 * Declares the `style-tweaks` settings namespace so users can
 * toggle conversation-view CSS tweaks from the Settings panel — or, on DSH
 * 0.1.7+, by hand-editing `<profile>/.dsh-style-tweaks/store.json` (this fork's
 * fast path stores the values there; see `src/store.ts`). All rendering
 * work happens in the browser bundle (`src/client`), which reads and writes
 * this namespace through the same-origin route mounted here — the Web
 * settings RPC only exposes a fixed allowlist of namespaces since rc.6, so a
 * custom route is the supported way for a plugin to own a configuration page.
 * @module dsh-style-tweaks
 */

import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  STYLE_TWEAKS_SETTINGS_NAMESPACE,
  Config,
} from './config.ts'
import { STORE_DIRNAME, STORE_FILENAME } from './store.ts'
import { StyleTweaksWebBackend, installStyleTweaksWeb } from './web.ts'

export const name = 'dsh-style-tweaks'

/**
 * The entry's Config schema. Exported so the Loader validates the profile
 * patch's `config` against it and — on DSH 0.1.7+ — so the settings service
 * can still project the entry (Plugins page), while this plugin's own store
 * (`src/store.ts`) keeps the live values: since that line the namespace IS
 * the entry, addressed by the entry id, but only the store is read after the
 * first seed.
 */
export { Config }

/**
 * Required services: the settings seam is the whole server-side surface.
 *
 * Deliberately NOT the `web` service (the host's search/fetch capability seam,
 * `ctx.web` in `dsh-web`). Nothing here reads it, and requiring it would mean a
 * host without search/fetch providers could not load the settings namespace at
 * all — a capability this plugin does not have. The HTTP route is not covered by
 * this list either: it attaches through its own optional
 * `ctx.inject(['webServer'], …)` inside `installStyleTweaksWeb`, so a host with
 * no webserver still gets the namespace and simply mounts no route.
 */
export const inject = ['settings']

/**
 * The two settings-service shapes this plugin spans: `register` owned a
 * namespace up to DSH 0.1.6, and `configure` sets the page policy for the
 * entry Config that owns it from 0.1.7 on (where `register` is gone).
 * `documentPath` (0.1.7+) anchors the own store beside the profile patch.
 */
interface SettingsSeam {
  register?(namespace: string, schema: unknown, options: { applies: 'live' }): void
  configure?(presentation: { auto?: boolean }, owner: unknown): () => void
  /** Absolute path of the active profile patch; absent on pre-0.1.7 hosts. */
  documentPath?: string
}

/**
 * Resolve the store path beside the profile patch. Any failure — older host
 * without the getter, a throwing accessor — yields `undefined`, which selects
 * the legacy settings backend rather than breaking the plugin.
 * @param settings - The host settings seam.
 * @returns Absolute store path, or undefined to fall back.
 */
function resolveStorePath(settings: SettingsSeam): string | undefined {
  try {
    const patch = settings.documentPath
    if (typeof patch !== 'string' || patch.length === 0) return undefined
    return join(dirname(patch), STORE_DIRNAME, STORE_FILENAME)
  } catch {
    return undefined
  }
}

export function apply(ctx: Context): void {
  const settings = ctx.settings as unknown as SettingsSeam
  let storePath: string | undefined
  if (typeof settings.register === 'function') {
    // Pre-0.1.7: the settings document owns the namespace and is fast as-is
    // (in-memory CAS), so the store would add risk without buying anything.
    settings.register(STYLE_TWEAKS_SETTINGS_NAMESPACE, Config, { applies: 'live' })
  } else {
    // The entry Config is the namespace here. `auto: false` keeps the Plugins
    // page from generating a second form beside this plugin's own Settings
    // section, which stays the curated surface (labels, dependent rows).
    ctx.effect(() => {
      const dispose = settings.configure?.({ auto: false }, ctx.fiber)
      return () => { dispose?.() }
    })
    storePath = resolveStorePath(settings)
  }

  // The browser Settings panel talks to the namespace through this same-origin
  // route (the Web settings RPC only exposes a fixed allowlist since rc.6).
  installStyleTweaksWeb(ctx, new StyleTweaksWebBackend(ctx, storePath))

  const mode = typeof settings.register === 'function'
    ? 'legacy settings register'
    : storePath !== undefined
      ? `own store ${storePath}`
      : 'settings fallback (profile patch path unresolved)'
  ctx.logger.info('[dsh-style-tweaks] settings namespace declared and Web routes mounted (%s)', mode)
}
