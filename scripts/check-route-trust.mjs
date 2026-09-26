/**
 * dsh-style-tweaks — request-trust check for the Settings route.
 *
 * The plugin's route (`/_dsh/style-tweaks/settings`) delegates admission to the
 * host's own browser fence (`ctx.connection.requestRejection`) and keeps a
 * Desktop carrier bypass of its own; see `refuseRequest` in `src/web.ts`. This
 * script fires the requests that fence is supposed to refuse, straight at a
 * running `dsh web`, and reports what each one came back with.
 *
 * It forges the `Host` header, which a browser cannot do and which is exactly
 * the header DNS rebinding cannot forge — the point of the fence. A rebound
 * page reaches this port with `Host: <attacker domain>` and an `Origin` that
 * matches it, so `Origin === Host` (the old check) proved nothing; the fence
 * must refuse on the Host alone.
 *
 * Usage — this one needs a **running instance**, so it cannot be a build step:
 *
 *   pnpm build                                   # so the instance serves this build
 *   dsh web --no-open                            # in another terminal
 *   pnpm verify:route:live                       # defaults to port 3080
 *   pnpm verify:route:live -- 3099               # or name the port
 *
 * `pnpm verify:route` (the fence script) is the offline half of the same
 * question: it drives the built route on a throwaway server, while this one
 * asks whether the fence answers correctly once cordis, the host's Connection
 * service and a real socket are in the way. A build can pass the first and
 * still fail here, which is the only reason both exist.
 *
 * Note that the port must be an instance serving the build under test — a
 * `dsh web` started before the last `pnpm build` will answer with whatever it
 * loaded, and the cases below will describe that, not this commit.
 *
 * Exit status: 0 when every case matched its expectation, 1 otherwise. The two
 * failure modes it separates are the ones a restart experiment has to tell
 * apart: a `served` case that came back anything else means the route is not
 * registered on the running instance at all, while a `refused` case that came
 * back answered means the fence let it through.
 */

import { request as httpRequest } from 'node:http'

const port = Number(process.argv[2] ?? 3080)
const ROUTE = '/_dsh/style-tweaks/settings'
const HOST = `127.0.0.1:${port}`
const REBOUND = `evil.example:${port}`

/** Cases: `expect` is 'served' (the settings document) or 'refused' (admission denied). */
const CASES = [
  {
    label: 'GET  loopback Host (the GUI itself)',
    request: { host: HOST, secFetchSite: 'same-origin', path: ROUTE },
    expect: 'served',
  },
  {
    label: 'GET  rebinding: evil Host, no Origin',
    request: { host: REBOUND, path: ROUTE },
    expect: 'refused',
  },
  {
    label: 'GET  rebinding: evil Host + matching Origin',
    request: { host: REBOUND, origin: `http://${REBOUND}`, secFetchSite: 'same-origin', path: ROUTE },
    expect: 'refused',
  },
  {
    label: 'POST cross-site Origin',
    request: { host: HOST, origin: 'http://evil.example', secFetchSite: 'cross-site', method: 'POST', path: ROUTE, body: '{}' },
    expect: 'refused',
  },
  {
    label: 'POST other-loopback-port Origin',
    request: { host: HOST, origin: 'http://127.0.0.1:9999', secFetchSite: 'same-site', method: 'POST', path: ROUTE, body: '{}' },
    expect: 'refused',
  },
  {
    label: 'POST rebinding Host',
    request: { host: REBOUND, origin: `http://${REBOUND}`, secFetchSite: 'same-origin', method: 'POST', path: ROUTE, body: '{}' },
    expect: 'refused',
  },
  {
    label: 'POST loopback Host without the Desktop marker',
    request: { host: HOST, origin: 'null', method: 'POST', path: ROUTE, body: '{}' },
    expect: 'refused',
  },
]

/** The host fence's own refusal body — it answers before the route is reached. */
const FENCE_REFUSAL = 'forbidden'

/** The codes `refuseRequest` in `src/web.ts` refuses with, in its own shape. */
const ROUTE_REFUSALS = new Set(['origin-rejected', 'authentication-required', 'host-rejected'])

/** A request that must not hang forever if the port answers but never replies. */
const TIMEOUT_MS = 5000

function send({ host, origin, secFetchSite, method = 'GET', path, body }) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host }
    if (origin !== undefined) headers.Origin = origin
    if (secFetchSite !== undefined) headers['Sec-Fetch-Site'] = secFetchSite
    if (method === 'POST') headers['Content-Type'] = 'application/json'
    const request = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      let text = ''
      response.on('data', (chunk) => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body: text }))
    })
    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy(new Error(`no answer within ${TIMEOUT_MS}ms`))
    })
    request.on('error', reject)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

/** @returns The parsed JSON body, or undefined when it is empty or not JSON. */
function readJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Which fence, if any, stopped the request.
 *
 * Admission is the only thing that answers 401/403 — the host's own fence
 * (`ctx.connection.requestRejection`, which the webserver layer surfaces as a
 * bare `forbidden`) and the route's own `refuseRequest` (a JSON error body).
 * Both mean the request never reached the settings handler, which is exactly
 * the property under test. A 4xx from the handler itself — 400 on a bad body,
 * 409 on a stale revision, 413 on an oversize one — means admission let the
 * request through and the route did its work, so it is `answered`: counting it
 * as `refused` would let a broken delegation pass by accident.
 * @param outcome - Status plus raw body, as `send` resolves it.
 * @returns 'refused' when admission denied it, 'served' when the settings
 *   document came back, 'answered' for anything else.
 */
function classify({ status, body }) {
  if (status === 401 || status === 403) return 'refused'
  if (status === 200 && readJson(body)?.ok === true) return 'served'
  return 'answered'
}

/**
 * Name the fence that refused, so a report says which half of the delegation
 * is answering.
 * @param body - Raw refusal body.
 * @returns A short label for the report line.
 */
function refusalSource(body) {
  if (body.trim() === FENCE_REFUSAL) return 'host fence'
  const code = readJson(body)?.error?.code
  return typeof code === 'string' && ROUTE_REFUSALS.has(code) ? `route fence (${code})` : 'unrecognised 401/403'
}

let failures = 0
let unregistered = 0
for (const testCase of CASES) {
  let outcome
  try {
    outcome = await send(testCase.request)
  } catch (error) {
    console.log(`FAIL ${testCase.label}\n     request failed: ${error.message}`)
    failures += 1
    continue
  }
  const actual = classify(outcome)
  const detail = `${outcome.status} ${JSON.stringify(outcome.body.slice(0, 60))}`
  const ok = actual === testCase.expect
  if (!ok) failures += 1
  if (testCase.expect === 'served' && actual !== 'served') unregistered += 1
  // A refused case reports which fence stopped it; the rest report the outcome.
  const verdict = ok && actual === 'refused' ? refusalSource(outcome.body) : actual
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.label.padEnd(48)} ${verdict.padEnd(9)} ${detail}`)
}

if (failures === 0) {
  console.log('\n[check-route-trust] ok — the route is registered, and it refuses the rebinding and cross-site cases')
} else if (unregistered > 0) {
  console.log(`\n[check-route-trust] the route is NOT registered on port ${port} — the GUI's own request got no settings document. A 404/405 here is the host answering for a route that was never mounted, not a fence decision: the running instance is not serving the build under test, so restart \`dsh web\` before reading anything else into the refused cases.`)
} else {
  console.log(`\n[check-route-trust] ${failures} case(s) did not match. The route answers them, so admission is letting them through — the fence is not doing its job on this instance.`)
}
process.exit(failures === 0 ? 0 : 1)
