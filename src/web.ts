/**
 * dsh-style-tweaks — optional Web routes.
 *
 * The browser Settings panel reads and writes the `style-tweaks`
 * namespace through this same-origin route, because the Web settings RPC only
 * exposes a fixed allowlist of namespaces (hardcoded in dsh-host-apiproxy
 * since rc.6). The route proxies to the real `ctx.settings` service, so the
 * settings document (settings.yaml) stays the single source of truth and
 * hand edits keep working.
 * @module dsh-style-tweaks/web
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the optional webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import { STYLE_TWEAKS_SETTINGS_NAMESPACE } from './config.ts'

/** Exact route used by the browser Settings page. */
export const SETTINGS_ROUTE = '/_dsh/style-tweaks/settings'

/** Public Settings snapshot; no secrets exist in this namespace. */
export interface StyleTweaksSnapshot {
  writable: boolean
  value: unknown
  revision: number
}

interface SetRequest {
  action: 'set'
  field: string
  value: unknown
  expectedRevision: number
}

interface UnsetRequest {
  action: 'unset'
  field: string
  expectedRevision: number
}

type StyleTweaksRequest = SetRequest | UnsetRequest

type JsonResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

/** Accept state-changing requests only from the DSH Web application's origin. */
export function sameOriginPost(req: IncomingMessage): boolean {
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
  const host = req.headers.host
  if (host === undefined) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function json<T>(res: ServerResponse, status: number, body: JsonResponse<T>): void {
  const bytes = Buffer.from(JSON.stringify(body))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.writeHead(status)
  res.end(bytes)
}

export function requestError(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { ok: false, error: { code, message } })
}

export async function readJson(req: IncomingMessage, maxBytes = 16 * 1024): Promise<unknown> {
  const contentType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new TypeError('Content-Type must be application/json')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += part.length
    if (bytes > maxBytes) throw new RangeError(`request body exceeds ${maxBytes} bytes`)
    chunks.push(part)
  }
  if (chunks.length === 0) throw new TypeError('request body is empty')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function parseRequest(value: unknown): StyleTweaksRequest {
  if (!isRecord(value) || typeof value.action !== 'string') throw new TypeError('action is required')
  if (typeof value.expectedRevision !== 'number' || !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0) {
    throw new TypeError('expectedRevision must be a non-negative integer')
  }
  const field = value.field
  if (typeof field !== 'string' || field.length === 0) throw new TypeError('field must be a non-empty string')
  if (value.action === 'unset') {
    return { action: 'unset', field, expectedRevision: value.expectedRevision as number }
  }
  if (value.action === 'set') {
    return { action: 'set', field, value: value.value, expectedRevision: value.expectedRevision as number }
  }
  throw new TypeError(`unsupported action: ${value.action}`)
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Same-origin Settings read/write handler. */
export class StyleTweaksWebBackend {
  constructor(private readonly ctx: Context) {}

  private descriptor() {
    const row = this.ctx.settings.describe().find(candidate => candidate.ns === STYLE_TWEAKS_SETTINGS_NAMESPACE)
    if (row === undefined) throw new Error('style-tweaks settings namespace is not registered')
    return row
  }

  private snapshot(): StyleTweaksSnapshot {
    const descriptor = this.descriptor()
    return {
      writable: this.ctx.settings.writable,
      value: descriptor.value,
      revision: descriptor.revision,
    }
  }

  /** Handle the exact Settings route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      try {
        json(res, 200, { ok: true, value: this.snapshot() })
      } catch (error) {
        this.ctx.logger.warn('dsh-style-tweaks Settings snapshot failed: %s', messageOf(error))
        requestError(res, 503, 'settings-unavailable', 'Style tweaks are unavailable')
      }
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      requestError(res, 405, 'method-not-allowed', 'Use GET or POST')
      return
    }
    if (!sameOriginPost(req)) {
      requestError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application')
      return
    }
    let parsed: StyleTweaksRequest
    try {
      parsed = parseRequest(await readJson(req))
    } catch (error) {
      requestError(res, error instanceof RangeError ? 413 : 400, 'invalid-request', messageOf(error))
      return
    }
    try {
      if (parsed.action === 'set') {
        await this.ctx.settings.update(STYLE_TWEAKS_SETTINGS_NAMESPACE, { [parsed.field]: parsed.value }, parsed.expectedRevision)
      } else {
        await this.ctx.settings.mutate(STYLE_TWEAKS_SETTINGS_NAMESPACE, [{ op: 'unset', path: [parsed.field] }], parsed.expectedRevision)
      }
      json(res, 200, { ok: true, value: this.snapshot() })
    } catch (error) {
      // The Host bundle and this plugin may each resolve their own copy of
      // `@deepseek-ai/dsh-settings` (package duplication): a cross-copy
      // `instanceof` is always false, so a plain revision conflict used to
      // fall through as 400 `settings-rejected` — and conflict-aware
      // clients (HTTP 409 = "re-read and retry") never recovered, leaving a
      // page whose revision went stale failing every save until reload.
      // The Host's conflict class carries `name`, which survives copy
      // duplication, so accept either identity.
      const conflict = error instanceof SettingsConflictError
        || (error instanceof Error && error.name === 'SettingsConflictError')
      requestError(
        res,
        conflict ? 409 : 400,
        conflict ? 'settings-conflict' : 'settings-rejected',
        messageOf(error),
      )
    }
  }
}

/**
 * Attach the Settings route whenever a webServer service is present.
 * @param ctx - plugin context owning route effects.
 * @param backend - Settings handler.
 */
export function installStyleTweaksWeb(ctx: Context, backend: StyleTweaksWebBackend): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      return webCtx.webServer.register({
        kind: 'exact',
        path: SETTINGS_ROUTE,
        handler: (req, res) => backend.handle(req, res),
      })
    }, 'dsh-style-tweaks: Web routes')
  })
}
