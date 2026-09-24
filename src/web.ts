/**
 * dsh-style-tweaks — optional Web routes.
 *
 * The browser Settings panel reads and writes the `style-tweaks`
 * namespace through this same-origin route, because the Web settings RPC only
 * exposes a fixed allowlist of namespaces (hardcoded in dsh-host-apiproxy
 * since rc.6). Two backends serve it, selected when the backend is built:
 *
 *   - **store** (DSH 0.1.7+, when the profile patch path resolves): values
 *     live in the plugin's own `<profile>/.dsh-style-tweaks/store.json`
 *     (`src/store.ts`) — one file parse to read, CAS + atomic rename to
 *     write, both single-digit milliseconds. The host's settings pipeline
 *     this route used to ride costs 905–1114ms per write (3× describe + 2×
 *     full-tree reconcile; measured 2026-09-23, `.docs/PLAN-DIAGNOSIS-index.md`).
 *     The entry Config is demoted to seed source: a missing store is seeded
 *     once from its user layer, after which hand edits to `cordis.patch.yml`
 *     no longer reach this route — edit the store file instead.
 *   - **settings** (hosts with `ctx.settings.register`, or when the store
 *     path cannot resolve): the original path — the host settings document
 *     stays the single source of truth and hand edits keep working.
 *
 * The request/response shapes, same-origin gate, and the HTTP mapping
 * (409 conflict via the `SettingsConflictError` name, 409/400/503 codes)
 * are shared by both, so the browser client is backend-agnostic.
 * @module dsh-style-tweaks/web
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
// Type-only import activates the optional webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import { STYLE_TWEAKS_SETTINGS_NAMESPACE, StyleTweaksFields } from './config.ts'
import {
  StoreConflictError,
  StoreSeedError,
  readStore,
  withStoreLock,
  writeStore,
  type StoreDoc,
} from './store.ts'

/** Exact route used by the browser Settings page. */
export const SETTINGS_ROUTE = '/_dsh/style-tweaks/settings'

/**
 * Desktop serves its renderer from `file://` and carries fetch over Electron
 * IPC, so the HTTP request cannot be same-origin with the app's loopback
 * listener. This marker is a non-simple header: an ordinary web page cannot
 * add it cross-origin without a CORS preflight, which this route does not
 * answer. The Electron-runtime and loopback checks below therefore admit the
 * trusted Desktop bridge without weakening Web's Origin fence.
 */
const DESKTOP_WRITE_HEADER = 'x-dsh-style-tweaks-write'
const DESKTOP_WRITE_VALUE = '1'

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

/** One `describe()` row as this route consumes it (`user` exists on 0.1.7+). */
interface DescribeRow {
  ns: string
  value: unknown
  revision: number
  /** Profile-patch override: fields written explicitly (the seed source). */
  user?: unknown
}

function isLoopbackAuthority(authority: string): boolean {
  try {
    const { hostname } = new URL(`http://${authority}`)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * Accept state-changing requests from the DSH application. Web uses the
 * normal Origin/Host equality check. Desktop is a special carrier: its page
 * origin is `file:` (often serialized as `null`) while the IPC bridge calls
 * the loopback HTTP listener, so accept that shape only inside Electron, only
 * for loopback, and only with the client's non-simple marker header.
 */
export function sameOriginPost(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (
    typeof process !== 'undefined'
    && typeof process.versions.electron === 'string'
    && host !== undefined
    && isLoopbackAuthority(host)
    && req.headers[DESKTOP_WRITE_HEADER] === DESKTOP_WRITE_VALUE
    && (origin === undefined || origin === 'null' || /^file:/iu.test(origin))
  ) {
    return true
  }

  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite === 'cross-site') return false
  if (origin === undefined) return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
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

/**
 * Value-validation table: `StyleTweaksFields` — the same field declarations
 * as `Config`, but not run through `live()`.
 *
 * Validation must NOT use `Config.dict`. `live()` marks every field
 * `meta.volatile`, and `Schema.resolve` treats a volatile schema as a
 * runtime-provided value: it resolves the data and then wraps the result in
 * `createVolatile(...)`, a wrapper that JSON-encodes as `{}`. Both entry
 * points below are affected equally — a bare `node(value)` call and
 * `node['~standard'].validate(value)` both route through `Schema.resolve` — so
 * a boolean write persisted `{}`, which the browser read as truthy and flipped
 * straight back On (observed 2026-09-23). The fix is the unwrapped table, not
 * a different call shape. `~standard.validate` reports failures as `issues`.
 */
type StandardResult = { value?: unknown; issues?: ReadonlyArray<{ message?: string }> }
type StandardValidatable = { '~standard'?: { validate(input: unknown): StandardResult } }

const CONFIG_FIELDS = (StyleTweaksFields as unknown as {
  dict?: Record<string, StandardValidatable>
}).dict

/** Same-origin Settings read/write handler. */
export class StyleTweaksWebBackend {
  /** @param ctx - Plugin context (settings service + logger).
   *  @param storePath - Absolute own-store path; undefined selects the
   *   legacy/fallback settings backend (0.1.6 register hosts, or when the
   *   profile patch path could not be resolved). */
  constructor(private readonly ctx: Context, private readonly storePath?: string) {}

  // ── settings backend (legacy hosts & store-path fallback) ──────────────

  private descriptor(): DescribeRow {
    const row = this.ctx.settings.describe().find(candidate => candidate.ns === STYLE_TWEAKS_SETTINGS_NAMESPACE)
    if (row === undefined) throw new Error('style-tweaks settings namespace is not registered')
    return row as DescribeRow
  }

  private snapshot(): StyleTweaksSnapshot {
    const descriptor = this.descriptor()
    return {
      writable: this.ctx.settings.writable,
      value: descriptor.value,
      revision: descriptor.revision,
    }
  }

  /** One settings-backend write: host CAS + pipeline, then its fresh snapshot. */
  private async settingsWrite(parsed: StyleTweaksRequest): Promise<StyleTweaksSnapshot> {
    if (parsed.action === 'set') {
      await this.ctx.settings.update(STYLE_TWEAKS_SETTINGS_NAMESPACE, { [parsed.field]: parsed.value }, parsed.expectedRevision)
    } else {
      await this.ctx.settings.mutate(STYLE_TWEAKS_SETTINGS_NAMESPACE, [{ op: 'unset', path: [parsed.field] }], parsed.expectedRevision)
    }
    return this.snapshot()
  }

  // ── store backend (DSH 0.1.7+ fast path) ───────────────────────────────

  /** Current store snapshot (read path; seeds on a clean miss). */
  private async storeSnapshot(): Promise<StyleTweaksSnapshot> {
    return await withStoreLock(async () => {
      const doc = await this.loadOrSeedLocked()
      return { writable: true, value: doc.value, revision: doc.revision }
    })
  }

  /** One store write: CAS → validate → merge → revision+1 → atomic rename. */
  private async storeWrite(parsed: StyleTweaksRequest): Promise<StyleTweaksSnapshot> {
    return await withStoreLock(async () => {
      const doc = await this.loadOrSeedLocked()
      if (doc.revision !== parsed.expectedRevision) {
        throw new StoreConflictError(parsed.expectedRevision, doc.revision)
      }
      const value: Record<string, unknown> = { ...doc.value }
      if (parsed.action === 'set') {
        value[parsed.field] = validateField(parsed.field, parsed.value)
      } else {
        assertKnownField(parsed.field)
        delete value[parsed.field]
      }
      const next: StoreDoc = { revision: doc.revision + 1, value }
      await writeStore(this.storePath!, next)
      return { writable: true, value: next.value, revision: next.revision }
    })
  }

  /**
   * Read the store; on a clean miss seed it from the entry Config's USER
   * layer (explicitly written fields — defaults stay unmaterialised so a
   * future schema default bump still reaches the panel). Callers hold the
   * store lock, so a seed under concurrent requests happens exactly once.
   */
  private async loadOrSeedLocked(): Promise<StoreDoc> {
    const existing = await readStore(this.storePath!)
    if (existing !== undefined) return existing
    const seeded = await this.seed()
    await writeStore(this.storePath!, seeded)
    this.ctx.logger.info('[dsh-style-tweaks] seeded settings store at %s (%d fields)', this.storePath, Object.keys(seeded.value).length)
    return seeded
  }

  /** Build the seed document from the host's view of the entry Config. */
  private async seed(): Promise<StoreDoc> {
    let row: DescribeRow | undefined
    try {
      row = this.ctx.settings.describe().find(candidate => candidate.ns === STYLE_TWEAKS_SETTINGS_NAMESPACE)
    } catch (error) {
      throw new StoreSeedError(`style-tweaks settings unavailable for seeding: ${messageOf(error)}`)
    }
    if (row === undefined) throw new StoreSeedError('style-tweaks settings namespace is not registered')
    // `user` is the profile-patch override (explicit fields); `value` keeps a
    // hand-rolled or older-shape describe from seeding an empty document.
    const source = row.user ?? row.value
    let value: Record<string, unknown>
    try {
      // Round trip detaches host objects and drops any non-JSON edge (a Date
      // or getter from a hand-edited patch) instead of corrupting the file.
      value = JSON.parse(JSON.stringify(source ?? {})) as unknown as Record<string, unknown>
    } catch {
      throw new StoreSeedError('style-tweaks seed value is not JSON-serializable')
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) value = {}
    return { revision: 0, value }
  }

  // ── shared handling ────────────────────────────────────────────────────

  /** Handle the exact Settings route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      try {
        const value = this.storePath !== undefined ? await this.storeSnapshot() : this.snapshot()
        json(res, 200, { ok: true, value })
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
      const value = this.storePath !== undefined
        ? await this.storeWrite(parsed)
        : await this.settingsWrite(parsed)
      json(res, 200, { ok: true, value })
    } catch (error) {
      const name = error instanceof Error ? error.name : undefined
      // Boot-window seeding failure: transient, not a rejected write — the
      // client's 502/503 ladder rides it out instead of surfacing an error.
      if (name === 'SettingsSeedError') {
        this.ctx.logger.warn('dsh-style-tweaks store seeding failed: %s', messageOf(error))
        requestError(res, 503, 'settings-unavailable', 'Style tweaks are unavailable')
        return
      }
      // The Host bundle and this plugin may each resolve their own copy of
      // `@deepseek-ai/dsh-settings` (package duplication): a cross-copy
      // `instanceof` is always false, so a plain revision conflict used to
      // fall through as 400 `settings-rejected` — and conflict-aware
      // clients (HTTP 409 = "re-read and retry") never recovered, leaving a
      // page whose revision went stale failing every save until reload.
      // The conflict class carries `name`, which survives copy duplication
      // (the store's own `StoreConflictError` spells the same name), so
      // accept either identity.
      const conflict = error instanceof SettingsConflictError
        || name === 'SettingsConflictError'
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
 * Validate one `set` against the raw field table (`StyleTweaksFields` — the
 * declarations before `live()`): unknown fields are refused (the host's
 * `isVolatilePath` did the same for undeclared paths) and values are
 * type/range-checked, so a bad write is a 400 here, not a corrupted store.
 * Errors ride out as `TypeError` → 400 `settings-rejected`.
 * @param field - Field name from the request.
 * @param value - Raw request value.
 * @returns The schema-parsed value to persist.
 */
function validateField(field: string, value: unknown): unknown {
  const node = CONFIG_FIELDS?.[field]
  if (node === undefined) throw new TypeError(`Config field "${field}" is not a style-tweaks setting`)
  const standard = node['~standard']
  if (standard === undefined) throw new TypeError(`Config field "${field}" has no validation entry`)
  try {
    const result = standard.validate(value)
    if (result.issues !== undefined && result.issues.length > 0) {
      const detail = result.issues.map(issue => issue.message ?? 'invalid').join('; ')
      throw new TypeError(detail)
    }
    return result.value
  } catch (error) {
    throw new TypeError(`Config field "${field}" rejected: ${messageOf(error)}`)
  }
}

/** Refuse `unset` of a field the schema never declared. */
function assertKnownField(field: string): void {
  if (CONFIG_FIELDS?.[field] === undefined) throw new TypeError(`Config field "${field}" is not a style-tweaks setting`)
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
