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
 * The `--trusted-host` authorities of the running invocation.
 *
 * The web app provides it as an ordinary service (`WEB_STARTUP_SERVICE` in
 * `dsh-web-app/lib/startup.js`) holding exactly what the command line named, so
 * the deployment's own notion of which authorities it serves is readable from
 * here without inventing one. Absent — a host that publishes no invocation, or
 * a composition booted without the web command — it is `undefined`, and the
 * fence below then admits loopback only, which is the narrow end of the range.
 */
interface WebStartup {
  trustedHosts?: readonly string[]
}

/** @returns The invocation's `--trusted-host` values, empty when unavailable. */
function trustedHostsOf(ctx: Context): readonly string[] {
  const startup = ctx.reflect?.get('webStartup', false) as WebStartup | undefined
  return startup?.trustedHosts ?? []
}

/**
 * Whether this deployment legitimately serves `authority` — a `Host` header.
 *
 * This is the check `sameOriginRequest` below cannot make. A page on
 * `http://evil.example` whose name resolves to `127.0.0.1` sends
 * `Origin: http://evil.example` *and* `Host: evil.example`, so origin-equals-host
 * holds, and the browser also reports `Sec-Fetch-Site: same-origin` because it
 * believes it is still on the same origin. Only the `Host` itself gives the
 * attack away, and only the deployment knows which non-loopback names it
 * answers to.
 *
 * The rule is the host's own (`isTrustedApiRequest` in
 * `dsh-client-connection`): loopback always, otherwise an explicit entry — an
 * entry carrying a port must match the authority exactly, one without a port
 * matches the hostname on any port, because the listening port is assigned at
 * bind time and an operator naming a host means the host, not one port of it.
 * @param authority - The `Host` header value.
 * @param trustedHosts - `--trusted-host` entries for this invocation.
 * @returns Whether the authority may reach this route at all.
 */
function isTrustedAuthority(authority: string, trustedHosts: readonly string[]): boolean {
  if (isLoopbackAuthority(authority)) return true
  const request = splitAuthority(authority)
  if (request === undefined) return false
  // This listener is HTTP, so a `Host` with no port is port 80 — the same
  // default a `--trusted-host example.com:80` entry is naming explicitly.
  const requestedPort = request.port === '' ? '80' : request.port
  return trustedHosts.some((entry) => {
    const named = splitAuthority(entry)
    if (named === undefined || named.hostname !== request.hostname) return false
    // An entry that named no port claims the whole host, on any port: the
    // listening port is assigned at bind time, so an operator naming a host
    // means the host rather than one port of it.
    return named.port === '' || named.port === requestedPort
  })
}

/**
 * Split one authority — a `Host` header or a `--trusted-host` entry — into its
 * normalized hostname and the port it *explicitly* named.
 *
 * The port cannot be read off `URL.port`, because WHATWG drops the default port
 * for the scheme: `new URL('http://example.com:80').port` is `''`, byte-for-byte
 * what an entry naming no port at all produces. Trusting that field would turn
 * `--trusted-host example.com:80` — a claim about one listener — into "any port
 * on example.com", which is the opposite of what the operator wrote. So the
 * explicit port is read from the entry text before normalization discards it,
 * and a missing one stays missing.
 *
 * A scheme, path, query or fragment is tolerated by being dropped: an operator
 * who writes `https://box/x` means the host `box`. Anything that will not parse
 * as an authority at all yields `undefined`, and the caller treats that entry
 * as naming nothing.
 * @param authority - The authority text.
 * @returns The normalized hostname plus the explicitly written port, or
 *   undefined when the text is not an authority.
 */
function splitAuthority(authority: string): { hostname: string; port: string } | undefined {
  const afterScheme = authority.replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '')
  const bare = afterScheme.split(/[/?#]/u)[0] ?? ''
  if (bare === '') return undefined
  let hostname: string
  try {
    hostname = new URL(`http://${bare}`).hostname
  } catch {
    return undefined
  }
  // An IPv6 authority is bracketed, so its port separator is the last colon
  // *after* the closing bracket; for anything else the last colon is the port.
  const colon = bare.lastIndexOf(':')
  const port = colon > bare.lastIndexOf(']') ? bare.slice(colon + 1) : ''
  return { hostname, port }
}

/** The slice of the host's Connection service this route needs. */
interface ConnectionAdmission {
  /** 401/403 when the request must be refused; undefined when it may proceed. */
  requestRejection(request: { headers: IncomingMessage['headers'] }): number | undefined
}

/** One way this route can refuse a request, in its own error shape. */
interface Refusal {
  status: number
  code: string
  message: string
}

/**
 * Whether this request arrives over the Electron Desktop bridge.
 *
 * Desktop serves its renderer from `file://` and carries fetch over IPC, so the
 * request carries no page origin the host fence could compare it against
 * (`Origin: null`). That shape is the one thing `requestRejection` cannot
 * express — its `Origin` parse fails and answers 403 — so this route keeps a
 * predicate of its own for it. Everything else is delegated.
 *
 * The marker header is non-simple: a plain web page cannot add it to a
 * cross-origin request without a CORS preflight, which this route does not
 * answer.
 * @param req - Incoming request.
 * @param requireMarker - Whether the Desktop marker header must be present
 *   (state-changing requests; a read has nothing to forge).
 */
function isDesktopCarrier(req: IncomingMessage, requireMarker: boolean): boolean {
  if (typeof process === 'undefined' || typeof process.versions.electron !== 'string') return false
  const host = req.headers.host
  if (host === undefined || !isLoopbackAuthority(host)) return false
  if (requireMarker && req.headers[DESKTOP_WRITE_HEADER] !== DESKTOP_WRITE_VALUE) return false
  const origin = req.headers.origin
  return origin === undefined || origin === 'null' || /^file:/iu.test(origin)
}

/**
 * The route's own browser fence, used only when the host has no Connection
 * service to delegate to.
 *
 * It is a genuine check — `Sec-Fetch-Site: cross-site` is refused, and a stated
 * `Origin` must equal the `Host` — but it cannot see DNS rebinding: a page on
 * `http://evil.example` whose name resolves to `127.0.0.1` sends
 * `Origin: http://evil.example` and `Host: evil.example`, so the equality holds
 * and the browser also reports `Sec-Fetch-Site: same-origin`. The Host itself
 * is the one header rebinding cannot forge, and only the host's own fence
 * (`requestRejection`) knows which non-loopback authorities this deployment
 * legitimately serves.
 * @param req - Incoming request.
 */
function sameOriginRequest(req: IncomingMessage): boolean {
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

/**
 * The composition's Connection service, when the host has one.
 *
 * Read through `ctx.reflect.get(name, false)` — never as `ctx.connection` and
 * never as `Reflect.get(ctx, name)`. A plain read goes through the Context
 * proxy's get trap, which answers any service the fiber did not declare in its
 * own `inject` with `cannot get property "connection" without inject`, and this
 * plugin declares `['settings', 'web']`. `reflect.get` is the documented way to
 * take a service out of the store *without* that requirement; it resolves the
 * same isolation key the host's own `provide` used, so it finds the service
 * from any scope below the root.
 *
 * This is measured, not theoretical. With the trap-based read, a real `dsh web`
 * boot resolves `connection` to `undefined`, the route falls back to its own
 * fence, and the rebinding hole the host fence exists to close stays open — the
 * only symptom being one `warn` line the default log level swallows. Against a
 * live instance the difference is the whole point: `Host: evil.example` answers
 * `403` once this returns the service, and `200` carrying the full settings
 * document when it does not.
 *
 * `strict: false` takes the service as soon as it is provided rather than only
 * while its own fiber is active, so boot order cannot decide whether this route
 * ends up fenced.
 * @param ctx - Context whose store is searched.
 * @returns The host Connection service, or undefined when the host has none.
 */
function connectionOf(ctx: Context): ConnectionAdmission | undefined {
  const service = ctx.reflect.get('connection', false) as ConnectionAdmission | undefined
  return typeof service?.requestRejection === 'function' ? service : undefined
}

/**
 * Decide whether a request may reach the Settings handler.
 *
 * The order matters, and it is the order of how much each layer actually knows.
 * Desktop first, because the host fence rejects its `file://` carrier outright.
 * Then the host's own fence, where a host has one — it knows this deployment's
 * `trustedHosts` and the browser session, and every `/api` request already
 * passes it. Then **this route's own `Host` fence**, which is not a fallback
 * but the layer that carries the weight on a stock `dsh web`: measured on
 * `0.1.7-rc.2`, that composition provides no `connection` service at all (87
 * services in the root store, none of them that one), so the host's fence is
 * simply absent and an origin-only check would leave DNS rebinding wide open.
 * The origin/`Sec-Fetch-Site` equality is last: it is what catches a cross-site
 * page aimed at a perfectly legitimate `Host`, which the `Host` fence cannot.
 * @param connection - Host Connection service, when the composition has one.
 * @param trustedHosts - `--trusted-host` authorities of this invocation.
 * @param req - Incoming request.
 * @returns The refusal to answer with, or undefined when the request may proceed.
 */
export function refuseRequest(
  connection: ConnectionAdmission | undefined,
  trustedHosts: readonly string[],
  req: IncomingMessage,
): Refusal | undefined {
  if (isDesktopCarrier(req, req.method === 'POST')) return undefined
  if (connection !== undefined) {
    const rejection = connection.requestRejection(req)
    if (rejection === undefined) return undefined
    if (rejection === 401) {
      return {
        status: 401,
        code: 'authentication-required',
        message: 'Reopen the URL printed by dsh web to authenticate this browser',
      }
    }
    return {
      status: 403,
      code: 'origin-rejected',
      message: 'The request must originate from this DSH Web application',
    }
  }
  const host = req.headers.host
  if (host === undefined || !isTrustedAuthority(host, trustedHosts)) {
    return {
      status: 403,
      code: 'host-rejected',
      message: 'This DSH instance does not answer to that host name',
    }
  }
  if (sameOriginRequest(req)) return undefined
  return {
    status: 403,
    code: 'origin-rejected',
    message: 'The request must originate from this DSH Web application',
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

/**
 * A write the route refused on its own terms: an undeclared field, or a value
 * the schema rejected. Distinct from every other failure because it is the one
 * class the response may echo (the message is built here, from the caller's own
 * field name and a schemastery issue) and the one class that is the caller's
 * fault rather than the host's — see the mapping in `handle`.
 */
class FieldRejectionError extends TypeError {}

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
    // Validate here, exactly as the store backend does, rather than letting the
    // host discover a bad field name. The host answers an unknown field with its
    // own plain `Error`, which is not a `FieldRejectionError` and so falls
    // through to the catch-all and leaves as a 503 — a caller who typed a field
    // that does not exist would be told the service is unavailable, and the
    // client's retry ladder would spend ~5s riding out a request that can never
    // succeed. Validating first makes the two backends answer identically, and
    // sends the schema-parsed value rather than the raw one, as the store path
    // does.
    if (parsed.action === 'set') {
      const value = validateField(parsed.field, parsed.value)
      await this.ctx.settings.update(STYLE_TWEAKS_SETTINGS_NAMESPACE, { [parsed.field]: value }, parsed.expectedRevision)
    } else {
      assertKnownField(parsed.field)
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
    // `user` is the profile-patch override — only the fields written by hand.
    // It is `projectForm(form, override)` on the host side, and the host builds
    // `override` as `structuredClone(patch?.config ?? {})`, so a plugin with no
    // profile patch seeds from `{}`, NOT from `undefined`: the empty seed is the
    // normal outcome, and the client's `resolveClientConfig` then materialises
    // every default. That is the point — a stored default would shadow a later
    // `FIELDS` default bump, and the panel would keep offering the old value.
    // The `?? row.value` arm is therefore a shape guard, not a second live
    // source: `value` is the RESOLVED config with defaults already materialised,
    // so it is only taken if some host stops emitting `user` at all, and a seed
    // from it is deliberately preferred over an empty document.
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
      if (conflict) {
        requestError(res, 409, 'settings-conflict', messageOf(error))
        return
      }
      // The only 4xx this route raises itself, and the only message it is safe
      // to echo: `FieldRejectionError` is built here from the field name the
      // caller sent plus a schemastery issue, so it carries nothing local. The
      // panel shows it beside the control that was rejected.
      if (error instanceof FieldRejectionError) {
        requestError(res, 400, 'settings-rejected', messageOf(error))
        return
      }
      // Everything else is a SERVER-side failure: a corrupt store document, a
      // permission or space error from the filesystem, a host settings fault.
      // Two things must not happen to one of those:
      //
      //   - It must not be reported as a malformed request. The client's retry
      //     ladder (`apiRequest`) only rides out 502/503, so a 400 here ends a
      //     write that a retry would have landed — and this plugin restarts on
      //     every profile-patch write, which is exactly when a transient I/O
      //     fault shows up.
      //   - Its message must not go out. Node's fs errors embed the absolute
      //     store path (`EACCES: permission denied, open 'C:\Users\…'`), as do
      //     this plugin's own corrupt-store errors. Log the full text, answer
      //     with fixed copy.
      this.ctx.logger.error('dsh-style-tweaks settings write failed: %s', messageOf(error))
      requestError(res, 503, 'settings-unavailable', 'Style tweaks are unavailable')
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
  const node = declaredField(field)
  if (node === undefined) throw new FieldRejectionError(notASetting(field))
  const standard = node['~standard']
  if (standard === undefined) throw new FieldRejectionError(`Config field "${field}" has no validation entry`)
  try {
    const result = standard.validate(value)
    if (result.issues !== undefined && result.issues.length > 0) {
      const detail = result.issues.map(issue => issue.message ?? 'invalid').join('; ')
      throw new FieldRejectionError(detail)
    }
    return result.value
  } catch (error) {
    throw new FieldRejectionError(`Config field "${field}" rejected: ${messageOf(error)}`)
  }
}

/** Refuse `unset` of a field the schema never declared. */
function assertKnownField(field: string): void {
  if (declaredField(field) === undefined) throw new FieldRejectionError(notASetting(field))
}

/**
 * The declaration for one field name, or undefined when the schema never
 * declared it.
 *
 * `Object.hasOwn`, not a plain read: a bare `CONFIG_FIELDS[field]` resolves
 * through the prototype chain, so `"toString"` / `"constructor"` / `"__proto__"`
 * all came back as an inherited function instead of undefined and passed the
 * check — enough to make an `unset` of a non-setting bump the revision.
 * The `undefined` guard is load-bearing too: `Object.hasOwn(undefined, …)`
 * throws.
 */
function declaredField(field: string): StandardValidatable | undefined {
  if (CONFIG_FIELDS === undefined || !Object.hasOwn(CONFIG_FIELDS, field)) return undefined
  return CONFIG_FIELDS[field]
}

/** The one field-rejection message shape, so callers share the wording. */
function notASetting(field: string): string {
  return `Config field "${field}" is not a style-tweaks setting`
}

/**
 * Attach the Settings route whenever a webServer service is present.
 *
 * Request admission lives here rather than in `handle()`, so the handler stays
 * a pure settings surface and there is exactly one gate for reads and writes
 * alike. The gate is applied before the method check, so a cross-origin
 * `OPTIONS` preflight is refused instead of being told which methods exist.
 *
 * **Nothing runs in the injection callback before `webCtx.effect(…)`.** That is
 * a structural rule, not a style preference. Anything that throws between the
 * callback entering and the route being registered leaves the route missing
 * while the plugin still looks healthy: every request then answers the host's
 * empty-bodied `404`, including the panel's own same-origin read, so the panel
 * reports "settings unavailable" and nothing says the plugin failed to mount.
 * The Connection lookup therefore happens inside the effect, once, guarded —
 * not as a statement in the callback.
 * @param ctx - plugin context owning route effects.
 * @param backend - Settings handler.
 */
export function installStyleTweaksWeb(ctx: Context, backend: StyleTweaksWebBackend): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      // Read the host services here, not above, and never let it throw: a
      // missing or unreadable service must degrade to a narrower fence, never
      // to an unregistered route.
      let connection: ConnectionAdmission | undefined
      let trustedHosts: readonly string[] = []
      try {
        connection = connectionOf(webCtx)
        trustedHosts = trustedHostsOf(webCtx)
      } catch (error) {
        webCtx.logger?.warn('dsh-style-tweaks: reading the host admission services failed (%s); using the route’s own fences', error instanceof Error ? error.message : String(error))
      }
      if (connection === undefined) {
        // Not an error — a stock `dsh web` has no Connection service — but the
        // route's own `Host` fence is then the only thing standing between a
        // rebound name and the settings document, so say so out loud.
        webCtx.logger?.warn('dsh-style-tweaks Settings route is running on its own fences (no host Connection service); trusted authorities are loopback plus %s', trustedHosts.length === 0 ? 'no --trusted-host entries' : trustedHosts.join(', '))
      }
      return webCtx.webServer.register({
        kind: 'exact',
        path: SETTINGS_ROUTE,
        handler: (req, res) => {
          const refusal = refuseRequest(connection, trustedHosts, req)
          if (refusal !== undefined) {
            requestError(res, refusal.status, refusal.code, refusal.message)
            return
          }
          return backend.handle(req, res)
        },
      })
    }, 'dsh-style-tweaks: Web routes')
  })
}
