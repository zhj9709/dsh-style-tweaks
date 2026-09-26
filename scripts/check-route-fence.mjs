/**
 * dsh-style-tweaks — Settings route check that needs no running DSH.
 *
 * `scripts/check-route-trust.mjs` fires the fence cases at a live `dsh web`, so
 * it can only run after a restart. This one covers the same ground against the
 * build under test directly: it serves the route that `lib/web.js` registers
 * from a throwaway `http.Server`, and it borrows the host's REAL admission
 * method (`HostConnectionService.prototype.requestRejection`) rather than a
 * transcription of it, so a drift in the host fence cannot hide behind a stale
 * copy here.
 *
 * Both halves of the route are exercised over real `http.IncomingMessage` /
 * `ServerResponse` objects and a real store file:
 *
 *   1. Admission — `refuseRequest`: DNS rebinding, cross-site, foreign port,
 *      `Origin: null`, the browser-auth 401, `trustedHosts`, the no-Connection
 *      fallback, and the ordering claim that the gate runs *before* the method
 *      check.
 *   2. Grading — `handle`: unknown/ill-typed fields, prototype keys, stale
 *      revisions, malformed bodies, and the fixed-copy 503 (plus the assertion
 *      that a filesystem error's absolute path never reaches the client).
 *
 * Note on what a refusal looks like here. In a live `dsh web` the host's own
 * HTTP layer refuses first, with a bare `403 forbidden` — that is what
 * `check-route-trust.mjs` keys on. Calling the route directly (as this script
 * does) reaches the plugin's *second*, independent check, which refuses in the
 * route's own error shape: `403 origin-rejected` / `401 authentication-required`.
 * Both are refusals; the distinction the live script needs is "the host fence
 * said no", and the distinction this one needs is "the route said no".
 *
 * Usage:
 *
 *   pnpm build && pnpm verify:route
 *
 * The build is not optional. This script grades `lib/`, and `lib/` older than
 * `src/` is refused up front rather than quietly passing — see `staleBuildMessage`.
 *
 * Exit status: 0 when every case matched, 1 otherwise.
 */

import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { SETTINGS_ROUTE, StyleTweaksWebBackend, installStyleTweaksWeb } from '../lib/web.js'
import { STYLE_TWEAKS_SETTINGS_NAMESPACE, StyleTweaksFields } from '../lib/config.js'

/** Field names the schema declares, read from the built product rather than restated. */
const DECLARED_FIELDS = new Set(Object.keys(StyleTweaksFields.dict))

const root = fileURLToPath(new URL('..', import.meta.url))
/** Sources whose compiled output these cases actually exercise. */
const SOURCES = ['web.ts', 'config.ts', 'store.ts', 'index.ts']
/** Their compiled counterparts, which the imports above pull in. */
const PRODUCTS = ['web.js', 'config.js', 'store.js', 'index.js']

/**
 * Refuse to grade a build that is older than the source it came from.
 *
 * `pnpm verify:route` does not build, and a stale `lib/` is the quiet failure
 * mode of a check like this one: every case passes, describing code that is no
 * longer the code in the tree. Comparing the oldest product against the newest
 * source catches "you edited `web.ts` and ran the check anyway", which is the
 * case that matters, and it fails loudly instead of rebuilding behind the
 * caller's back.
 * @returns A message when the build is stale, otherwise undefined.
 */
async function staleBuildMessage() {
  const mtime = async (path) => (await stat(path)).mtimeMs
  let newestSource = 0
  for (const name of SOURCES) {
    newestSource = Math.max(newestSource, await mtime(join(root, 'src', name)))
  }
  let oldestProduct = Infinity
  for (const name of PRODUCTS) {
    oldestProduct = Math.min(oldestProduct, await mtime(join(root, 'lib', name)))
  }
  if (oldestProduct >= newestSource) return undefined
  return 'lib/ is older than src/ — these cases would grade a build that is no longer in the tree.\n'
    + '       Run `pnpm build` first, then re-run this check.'
}

/** The genuine host fence. Invoked with a stand-in carrying its two inputs. */
const hostRequestRejection = HostConnectionService.prototype.requestRejection

/**
 * A Connection service whose admission is the host's own method. `trustedHosts`
 * and `browserAuth.isAuthenticated` are the only things that method reads.
 */
function connection({ trustedHosts = [], authenticated = true } = {}) {
  return {
    trustedHosts,
    browserAuth: { isAuthenticated: () => authenticated },
    requestRejection: hostRequestRejection,
  }
}

/**
 * The store lookup both host services go through.
 *
 * The route reads `connection` and `webStartup` with `ctx.reflect.get(name,
 * false)` — deliberately, because a plain read goes through the Context proxy's
 * get trap and this plugin's fiber injects neither. A stand-in that hung the
 * services off the context directly would let a route that cannot see them in
 * production pass here, which is exactly the gap this script was built to
 * close: on a real `0.1.7-rc.2` boot the root store holds 87 services and none
 * of them is `connection`, so the honest double is "no Connection service" plus
 * a `webStartup` carrying the invocation's `--trusted-host` values.
 * @param services - Service name to value; anything absent reads as undefined.
 * @returns The `reflect` slice of a context.
 */
function storeOf(services) {
  return { get: (name) => services[name] }
}

/** A plugin context that records the route `installStyleTweaksWeb` registers. */
function hostContext({ conn, describe, trustedHosts = [], settings } = {}) {
  const registered = {}
  const logger = { info() {}, warn() {}, error() {} }
  const child = {
    logger,
    reflect: storeOf({ webStartup: { trustedHosts } }),
    effect(fn) { registered.dispose = fn(); },
    webServer: { register(route) { registered.route = route; return () => {} } },
  }
  if (conn !== undefined) child.reflect = storeOf({ connection: conn, webStartup: { trustedHosts } })
  return {
    registered,
    ctx: {
      inject(_names, callback) { callback(child); },
      logger,
      reflect: child.reflect,
      // A caller can hand in a whole settings service to stand in for the
      // legacy backend, whose rejections come from the host rather than from
      // this plugin's own validation.
      settings: settings ?? {
        writable: true,
        describe,
        update: async () => {},
        mutate: async () => {},
      },
    },
  }
}

/** A context whose settings namespace is registered and empty (the seeded case). */
const seededRows = () => [{ ns: STYLE_TWEAKS_SETTINGS_NAMESPACE, value: {}, user: {} }]

/** Send one request with a forged `Host`, and collect status + body. */
function send(port, { host, origin, secFetchSite, method = 'GET', body, headers: extra }) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host }
    if (origin !== undefined) headers.Origin = origin
    if (secFetchSite !== undefined) headers['Sec-Fetch-Site'] = secFetchSite
    if (method === 'POST') headers['Content-Type'] = 'application/json'
    if (extra !== undefined) Object.assign(headers, extra)
    const req = httpRequest({ host: '127.0.0.1', port, method, path: SETTINGS_ROUTE, headers }, (res) => {
      let text = ''
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(text) } catch { parsed = undefined }
        resolve({ status: res.statusCode, text, json: parsed })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

/** A refusal is the route's own shape; anything else means the handler ran. */
/**
 * Whether admission denied the request.
 *
 * Admission is the only thing that answers 401/403, and each layer has its own
 * shape: the host fence's bare body, the route's `origin-rejected` /
 * `authentication-required` when it delegates, and its own `host-rejected` when
 * it does not. A 4xx from the handler instead (400 on a bad body, 409 on a
 * stale revision) means admission let the request through, so `answered` must
 * not be a bare status check — that is what made a fallback look like a pass.
 */
const refused = (r) => (r.status === 403 || r.status === 401) && r.json?.error?.code !== undefined
const answered = (r) => !refused(r)

// ── cases ────────────────────────────────────────────────────────────────────

/** `expect` receives the response; helpers `refused` / `answered` are passed in. */
const admissionCases = (port) => [
  {
    label: 'GET  loopback Host (the GUI itself)',
    send: { host: `127.0.0.1:${port}`, secFetchSite: 'same-origin' },
    expect: (r) => r.status === 200 && r.json?.ok === true,
    because: 'the same-origin browser that owns the settings panel must be admitted',
  },
  {
    label: 'GET  loopback Host, no Origin at all',
    send: { host: `127.0.0.1:${port}` },
    expect: (r) => r.status === 200,
    because: 'a non-browser client on loopback carries no Origin; the fence admits it',
  },
  {
    label: 'GET  rebinding: evil Host, no Origin',
    send: { host: `evil.example:${port}` },
    expect: (r) => refused(r),
    because: 'Host is the header rebinding cannot forge, so it alone must refuse',
  },
  {
    label: 'GET  rebinding: evil Host + matching Origin',
    send: { host: `evil.example:${port}`, origin: `http://evil.example:${port}`, secFetchSite: 'same-origin' },
    expect: (r) => refused(r),
    because: 'Origin === Host is exactly what a rebound page sends, so the equality proves nothing',
  },
  {
    label: 'GET  rebinding: evil Host over an https Origin',
    send: { host: `evil.example:${port}`, origin: `https://evil.example:${port}`, secFetchSite: 'same-origin' },
    expect: (r) => refused(r),
    because: 'a scheme change must not buy a pass either',
  },
  {
    label: 'POST cross-site Origin',
    send: { host: `127.0.0.1:${port}`, origin: 'http://evil.example', secFetchSite: 'cross-site', method: 'POST', body: '{}' },
    expect: (r) => refused(r),
    because: 'Sec-Fetch-Site: cross-site is refused by the host fence',
  },
  {
    label: 'POST other-loopback-port Origin',
    send: { host: `127.0.0.1:${port}`, origin: 'http://127.0.0.1:9999', secFetchSite: 'same-site', method: 'POST', body: '{}' },
    expect: (r) => refused(r),
    because: 'same-site is not same-origin: another port on this machine is a different origin',
  },
  {
    label: 'POST rebinding Host',
    send: { host: `evil.example:${port}`, origin: `http://evil.example:${port}`, secFetchSite: 'same-origin', method: 'POST', body: '{}' },
    expect: (r) => refused(r),
    because: 'a rebound page must not reach the write path either',
  },
  {
    label: 'POST Origin: null (the Desktop file:// carrier shape)',
    send: { host: `127.0.0.1:${port}`, origin: 'null', method: 'POST', body: '{}' },
    expect: (r) => refused(r),
    because: 'outside Electron this shape is refused; the carrier bypass is inert here',
  },
  {
    label: 'OPTIONS cross-site is refused, not told the methods',
    send: { host: `127.0.0.1:${port}`, origin: 'http://evil.example', secFetchSite: 'cross-site', method: 'OPTIONS' },
    expect: (r) => refused(r),
    because: 'the gate runs before the method check, so a preflight learns nothing',
  },
  {
    label: 'OPTIONS same-origin still gets 405 + Allow',
    send: { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, secFetchSite: 'same-origin', method: 'OPTIONS' },
    expect: (r) => r.status === 405 && r.json?.error?.code === 'method-not-allowed',
    because: 'an admitted request still gets the method contract',
  },
]

/** Cases that need their own registration, because they change the environment. */
const environmentCases = (adopt) => [
  {
    label: 'unauthenticated browser gets 401 authentication-required',
    async run(port) {
      adopt({ conn: connection({ authenticated: false }) })
      const r = await send(port, { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, secFetchSite: 'same-origin' })
      return { response: r, because: 'a trusted Host without a session must be told to re-authenticate' }
    },
    expect: (r) => r.status === 401 && r.json?.error?.code === 'authentication-required',
  },
  {
    label: 'trustedHosts admits a LAN deployment the host accepts',
    async run(port) {
      adopt({ conn: connection({ trustedHosts: ['workstation.local'] }) })
      const r = await send(port, { host: 'workstation.local:3080', origin: 'http://workstation.local:3080', secFetchSite: 'same-origin' })
      return { response: r, because: 'a loopback-only patch would break this deployment' }
    },
    expect: (r) => r.status === 200,
  },
  {
    label: 'no Connection service: same-origin still served, cross-site refused',
    async run(port) {
      adopt({ conn: undefined })
      const sameOrigin = await send(port, { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, secFetchSite: 'same-origin' })
      const crossSite = await send(port, { host: `127.0.0.1:${port}`, origin: 'http://evil.example', secFetchSite: 'cross-site' })
      const rebound = await send(port, { host: `evil.example:${port}`, origin: `http://evil.example:${port}`, secFetchSite: 'same-origin' })
      return { response: sameOrigin, also: { crossSite, rebound }, because: 'a stock dsh web provides no Connection service, so this is the production path' }
    },
    // The rebound Host MUST be refused here. It used to reach the handler, and
    // that was the rebinding hole: origin equals host and the browser calls it
    // same-origin, so only the Host itself gives the attack away.
    expect: (r, extra) => answered(r) && refused(extra.crossSite) && refused(extra.rebound),
  },
  {
    label: 'no Connection service: a rebound Host is named as such',
    async run(port) {
      adopt({ conn: undefined })
      const r = await send(port, { host: `evil.example:${port}`, origin: `http://evil.example:${port}`, secFetchSite: 'same-origin' })
      return { response: r, because: 'the refusal has to say which fence decided, or a fallback reads as a pass' }
    },
    expect: (r) => r.status === 403 && r.json?.error?.code === 'host-rejected',
  },
  {
    label: 'no Connection service: --trusted-host admits the named deployment',
    async run(port) {
      adopt({ conn: undefined, trustedHosts: ['workstation.local'] })
      const named = await send(port, { host: `workstation.local:${port}`, origin: `http://workstation.local:${port}`, secFetchSite: 'same-origin' })
      const other = await send(port, { host: `evil.example:${port}`, origin: `http://evil.example:${port}`, secFetchSite: 'same-origin' })
      const loopback = await send(port, { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, secFetchSite: 'same-origin' })
      return { response: named, also: { other, loopback }, because: 'naming a host must not become naming every host' }
    },
    expect: (r, extra) => answered(r) && refused(extra.other) && answered(extra.loopback),
  },
  {
    label: 'a --trusted-host entry with a port must match that port',
    async run(port) {
      adopt({ conn: undefined, trustedHosts: [`workstation.local:${port}`] })
      const same = await send(port, { host: `workstation.local:${port}`, origin: `http://workstation.local:${port}`, secFetchSite: 'same-origin' })
      const other = await send(port, { host: 'workstation.local:9999', origin: 'http://workstation.local:9999', secFetchSite: 'same-origin' })
      return { response: same, also: { other }, because: 'an explicit port is a claim about one listener, not the name' }
    },
    expect: (r, extra) => answered(r) && refused(extra.other),
  },
  {
    label: 'a --trusted-host entry on port 80 must not admit other ports',
    async run(port) {
      adopt({ conn: undefined, trustedHosts: ['workstation.local:80'] })
      // `new URL('http://workstation.local:80').port` is `''` — identical to an
      // entry naming no port — so reading the port off the URL would quietly
      // widen "only port 80" into "any port". This case is the regression guard.
      const onEighty = await send(port, { host: 'workstation.local', origin: 'http://workstation.local', secFetchSite: 'same-origin' })
      const elsewhere = await send(port, { host: `workstation.local:${port}`, origin: `http://workstation.local:${port}`, secFetchSite: 'same-origin' })
      return { response: onEighty, also: { elsewhere }, because: 'the default port must be read from the entry text, not from URL normalization' }
    },
    expect: (r, extra) => answered(r) && refused(extra.elsewhere),
  },
  {
    label: 'a --trusted-host entry written as a URL still names its host',
    async run(port) {
      adopt({ conn: undefined, trustedHosts: ['https://workstation.local/some/path'] })
      const named = await send(port, { host: `workstation.local:${port}`, origin: `http://workstation.local:${port}`, secFetchSite: 'same-origin' })
      const other = await send(port, { host: `evil.example:${port}`, origin: `http://evil.example:${port}`, secFetchSite: 'same-origin' })
      return { response: named, also: { other }, because: 'a scheme and path are noise around the authority, not a wider claim' }
    },
    expect: (r, extra) => answered(r) && refused(extra.other),
  },
  {
    label: 'a --trusted-host entry naming no port covers every port',
    async run(port) {
      adopt({ conn: undefined, trustedHosts: ['workstation.local'] })
      const one = await send(port, { host: `workstation.local:${port}`, origin: `http://workstation.local:${port}`, secFetchSite: 'same-origin' })
      const two = await send(port, { host: 'workstation.local:9999', origin: 'http://workstation.local:9999', secFetchSite: 'same-origin' })
      return { response: one, also: { two }, because: 'the listening port is assigned at bind time, so naming a host means the host' }
    },
    expect: (r, extra) => answered(r) && answered(extra.two),
  },
]

// ── grading cases (real store, real writes) ─────────────────────────────────

const GRADING = [
  {
    label: 'POST an undeclared field',
    body: { action: 'set', field: 'notAField', value: 1, expectedRevision: 0 },
    expect: (r) => r.status === 400 && r.json?.error?.code === 'settings-rejected',
  },
  {
    label: 'POST a string into a boolean field',
    body: { action: 'set', field: 'stableSessionTitle', value: 'false', expectedRevision: 0 },
    expect: (r) => r.status === 400 && r.json?.error?.code === 'settings-rejected',
  },
  {
    label: 'POST a number out of range',
    body: { action: 'set', field: 'dialogWidth', value: 99999, expectedRevision: 0 },
    expect: (r) => r.status === 400 && r.json?.error?.code === 'settings-rejected',
  },
  {
    label: 'POST the __proto__ key',
    body: { action: 'set', field: '__proto__', value: { polluted: true }, expectedRevision: 0 },
    expect: (r) => r.status === 400,
    after: () => ({}).polluted === undefined,
  },
  {
    label: 'POST the constructor key',
    body: { action: 'set', field: 'constructor', value: 1, expectedRevision: 0 },
    expect: (r) => r.status === 400,
  },
  {
    label: 'POST an unknown action',
    body: { action: 'drop', field: 'dialogWidth', value: 1, expectedRevision: 0 },
    expect: (r) => r.status === 400 && r.json?.error?.code === 'invalid-request',
  },
  {
    label: 'POST malformed JSON',
    raw: '{not json',
    expect: (r) => r.status === 400 && r.json?.error?.code === 'invalid-request',
  },
  {
    label: 'POST a stale revision',
    body: { action: 'set', field: 'dialogWidth', value: 900, expectedRevision: 41 },
    expect: (r) => r.status === 409 && r.json?.error?.code === 'settings-conflict',
  },
  {
    label: 'POST an oversize body',
    raw: JSON.stringify({ action: 'set', field: 'closedWorkspaces', value: ['x'.repeat(40_000)] }),
    expect: (r) => r.status === 413,
  },
  {
    label: 'POST unset of an undeclared field',
    body: { action: 'unset', field: 'notAField', expectedRevision: 0 },
    expect: (r) => r.status === 400,
  },
]

// ── runner ──────────────────────────────────────────────────────────────────

let failures = 0
const report = (ok, label, detail, because) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${detail}${because === undefined ? '' : `\n     ↳ ${because}`}`)
}

const stale = await staleBuildMessage()
if (stale !== undefined) {
  console.error(`[check-route-fence] ${stale}`)
  process.exit(1)
}

const dir = await mkdtemp(join(tmpdir(), 'style-tweaks-fence-'))
let server
try {
  const storePath = join(dir, 'store.json')
  const main = hostContext({ conn: connection(), describe: seededRows })
  installStyleTweaksWeb(main.ctx, new StyleTweaksWebBackend(main.ctx, storePath))

  /** Install a different route onto the server for one case, then restore. */
  const adopt = ({ conn, storePath: path = storePath, describe = seededRows, trustedHosts = [] }) => {
    const ctxPair = hostContext({ conn, describe, trustedHosts })
    installStyleTweaksWeb(ctxPair.ctx, new StyleTweaksWebBackend(ctxPair.ctx, path))
    main.registered.route = ctxPair.registered.route
    return ctxPair
  }

  server = createServer((req, res) => { main.registered.route.handler(req, res) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  console.log(`[check-route-fence] built route on 127.0.0.1:${port}; host fence borrowed from @deepseek-ai/dsh-client-connection\n`)

  // ── 1. admission ─────────────────────────────────────────────────────────
  for (const testCase of admissionCases(port)) {
    const r = await send(port, testCase.send)
    report(testCase.expect(r), testCase.label, `${r.status} ${JSON.stringify(r.text.slice(0, 48))}`, testCase.because)
  }

  for (const testCase of environmentCases(adopt)) {
    const outcome = await testCase.run(port)
    report(testCase.expect(outcome.response, outcome.also), testCase.label, `${outcome.response.status} ${JSON.stringify(outcome.response.text.slice(0, 48))}`, outcome.because)
    if (outcome.also !== undefined) {
      console.log(`       ↳ cross-site ${outcome.also.crossSite?.status ?? '—'} (refused: ${outcome.also.crossSite === undefined ? '—' : refused(outcome.also.crossSite)}), rebound Host ${outcome.also.rebound?.status ?? outcome.also.other?.status ?? '—'} (refused: ${outcome.also.rebound === undefined ? (outcome.also.other === undefined ? '—' : refused(outcome.also.other)) : refused(outcome.also.rebound)})`)
    }
  }
  adopt({ conn: connection() })

  // ── 2. grading ──────────────────────────────────────────────────────────
  console.log('')
  for (const testCase of GRADING) {
    const payload = testCase.raw ?? JSON.stringify(testCase.body)
    const r = await send(port, {
      host: `127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
      secFetchSite: 'same-origin',
      method: 'POST',
      body: payload,
    })
    const clean = testCase.after === undefined ? true : testCase.after()
    report(testCase.expect(r) && clean, testCase.label, `${r.status} ${JSON.stringify(r.text.slice(0, 48))}`)
  }

  // The legacy backend (`storePath === undefined`: a pre-0.1.7 host, or a
  // profile patch whose path does not resolve) has to grade a bad field the
  // same way the store backend does. It used not to: the field went straight to
  // the host, whose plain `Error` for an unknown name fell through to the
  // catch-all and left as a 503 — which reads as "the service is down" and makes
  // the client retry a request that can never succeed. The stand-in below throws
  // the way the real host does, so a regression here is the 503 coming back.
  const hostRejectsUnknownField = {
    writable: true,
    describe: seededRows,
    update: async (_namespace, patch) => {
      for (const field of Object.keys(patch)) {
        if (!DECLARED_FIELDS.has(field)) throw new Error(`Config field "${field}" is not volatile`)
      }
    },
    mutate: async () => { throw new Error('Config field is not volatile') },
  }
  const legacy = hostContext({ conn: undefined, describe: seededRows, settings: hostRejectsUnknownField })
  installStyleTweaksWeb(legacy.ctx, new StyleTweaksWebBackend(legacy.ctx, undefined))
  const storeRoute = main.registered.route
  main.registered.route = legacy.registered.route
  for (const [label, payload, expect] of [
    ['legacy: undeclared field is 400, not 503', { action: 'set', field: 'notAField', value: 1, expectedRevision: 0 }, (r) => r.status === 400 && r.json?.error?.code === 'settings-rejected'],
    ['legacy: ill-typed value is 400, not 503', { action: 'set', field: 'dialogWidth', value: 'wide', expectedRevision: 0 }, (r) => r.status === 400 && r.json?.error?.code === 'settings-rejected'],
    ['legacy: prototype key is 400, not 503', { action: 'set', field: '__proto__', value: 1, expectedRevision: 0 }, (r) => r.status === 400 && r.json?.error?.code === 'settings-rejected'],
    ['legacy: unset of an undeclared field is 400', { action: 'unset', field: 'notAField', expectedRevision: 0 }, (r) => r.status === 400 && r.json?.error?.code === 'settings-rejected'],
  ]) {
    const r = await send(port, {
      host: `127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
      secFetchSite: 'same-origin',
      method: 'POST',
      body: JSON.stringify(payload),
    })
    report(expect(r), label, `${r.status} ${JSON.stringify(r.text.slice(0, 48))}`, 'the legacy backend must not answer a caller error as a service outage')
  }
  main.registered.route = storeRoute

  const after = await send(port, { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, secFetchSite: 'same-origin' })
  const revision = after.json?.value?.revision
  const write = await send(port, {
    host: `127.0.0.1:${port}`,
    origin: `http://127.0.0.1:${port}`,
    secFetchSite: 'same-origin',
    method: 'POST',
    body: JSON.stringify({ action: 'set', field: 'dialogWidth', value: 900, expectedRevision: revision }),
  })
  report(
    write.json?.value?.revision === revision + 1 && write.json?.value?.value?.dialogWidth === 900,
    'a valid write lands and bumps the revision',
    `${write.status} revision ${revision} → ${write.json?.value?.revision}`,
  )

  const onDisk = JSON.parse(await readFile(storePath, 'utf8'))
  report(
    onDisk.revision === revision + 1 && onDisk.value.dialogWidth === 900,
    'the store file itself carries the write',
    `revision ${onDisk.revision}, dialogWidth ${onDisk.value.dialogWidth}`,
  )

  // ── 3. fixed-copy 503, with no path leakage ─────────────────────────────
  // Two shapes of server-side failure, because they carry different text: a
  // Node errno (whose message embeds the absolute path) and an error this plugin
  // builds itself (which also embeds it). Neither may reach the client.
  //
  // The leak probe matches on the temp directory's BASENAME, not the full path:
  // a response body is JSON, so a Windows path arrives with its separators
  // escaped (`C:\\Users\\…`) and a substring test on the raw path would miss a
  // leak that is really there. The basename has no separators, so escaping
  // cannot hide it.
  const dirTag = basename(dir)
  const leaked = (body) => body.includes(dirTag)

  const blocker = join(dir, 'blocker')
  await writeFile(blocker, 'this is a regular file, not a directory', 'utf8')
  const leaky = join(blocker, 'store.json')
  adopt({ storePath: leaky })
  const failed = await send(port, { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, secFetchSite: 'same-origin' })
  const expected = JSON.stringify({ ok: false, error: { code: 'settings-unavailable', message: 'Style tweaks are unavailable' } })
  report(
    failed.status === 503 && failed.text === expected,
    'an unreadable store answers fixed 503 copy',
    `${failed.status} ${JSON.stringify(failed.text.slice(0, 60))}`,
  )
  report(
    !leaked(failed.text),
    'the filesystem error path never reaches the client',
    leaked(failed.text) ? `LEAKED ${dirTag}: ${failed.text.slice(0, 140)}` : 'no path fragment in the body',
  )

  const corruptPath = join(dir, 'corrupt.json')
  await writeFile(corruptPath, '{ this is not json', 'utf8')
  adopt({ storePath: corruptPath })
  const corrupt = await send(port, { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, secFetchSite: 'same-origin' })
  report(
    corrupt.status === 503 && corrupt.text === expected,
    'a corrupt store answers the same fixed 503 copy',
    `${corrupt.status} ${JSON.stringify(corrupt.text.slice(0, 60))}`,
  )
  report(
    !leaked(corrupt.text),
    'the corrupt-document message never reaches the client',
    leaked(corrupt.text) ? `LEAKED ${dirTag}: ${corrupt.text.slice(0, 140)}` : 'no path fragment in the body',
  )
} finally {
  server?.close()
  await rm(dir, { recursive: true, force: true })
}

console.log(failures === 0
  ? '\n[check-route-fence] ok — admission and grading both hold against the built route'
  : `\n[check-route-fence] ${failures} case(s) did not match.`)
process.exit(failures === 0 ? 0 : 1)
