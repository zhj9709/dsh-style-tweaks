/**
 * dsh-style-tweaks — history page-size transport tweak.
 *
 * DSH pages conversation history at a fixed 50 messages per request
 * (`PAGE_MESSAGES` in the session-controller client): the cold open of a
 * session and every "Load earlier" click ask the host for 50 append messages,
 * so a long agent session needs many clicks to walk back through.
 *
 * The page size is a client-side request parameter, not a host setting: the
 * server validates `maxMessages` as any positive safe integer and answers
 * with whatever page was asked for. This tweak therefore rewrites the
 * outgoing requests in the browser:
 *
 *   - `session/page` (unary POST /api/session/page): the "Load earlier"
 *     pagination and the turn-jump loader. Only raised, never shrunk — the
 *     jump loader asks for `JUMP_PAGE_MESSAGES` (200) per page, so a
 *     configured size above 200 raises the jump pages too and a smaller one
 *     leaves them at 200.
 *   - `session/follow` (Gateway WebSocket mux open frame): the first screen
 *     a session opens with. Only rewritten when the user opts in, because a
 *     larger first page carries more data and slows the cold open — exactly
 *     the trade-off the separate toggle makes explicit.
 *
 * Both transports funnel through browser primitives (`window.fetch` and
 * `WebSocket.prototype.send`), so one idempotent patch per page covers every
 * session, current and future.
 *
 * ## Where the live state lives, and why
 *
 * The targets and the ownership counter live in ONE object parked on
 * `globalThis` (`SHARED_KEY`), not in module state. That matters because a
 * bundle reload in the same page evaluates this module again while the old
 * wrapper — which is never unwound — is still in the `fetch` / `send` chain:
 *
 *   - Module state would give each instance its own targets, so the old layer
 *     would re-raise whatever the new layer just raised (targets only ever go
 *     up: the old 300 would beat the new 200 and the page would keep sending
 *     300 for the rest of its life). One shared object makes every layer read
 *     the same target, and the second layer's `target > current` test is then
 *     false — wrapping twice is genuinely inert.
 *   - `installed` is shared for the same reason: the wrappers are installed
 *     once per page, whichever instance got there first.
 *   - `generation` / `owner` are a monotonic ownership pair. Each instance
 *     claims the next generation on its first install and takes the targets
 *     when its generation is newer than the current owner's, so the newest
 *     instance always wins — even if the previous one is never disposed. Only
 *     the owner may move or release the targets, so a teardown that arrives
 *     late (the runtime is not obliged to dispose the old instance before
 *     applying the new one) cannot zero the fresh instance's settings, and a
 *     stale instance's still-live subscription cannot win the targets back.
 *
 * Two consequences, both deliberate:
 *
 *   - The patch installs whether or not the feature is switched on. The seed
 *     only helps if the rewrite is already in place when the very first
 *     `session/follow` frame leaves — the settings read may well land after
 *     it. With the master switch off the push also clears the cold-start flag,
 *     so an off feature skips the frame parse entirely and the only cost left
 *     is one `includes` + one `JSON.parse` per `session/page` request.
 *   - The wrappers are never unwound (unwinding around other plugins' own
 *     wrappers is not worth the risk). Plugin teardown instead releases
 *     ownership and zeroes the targets, so a disabled instance stops
 *     rewriting without leaving the page patched-but-active.
 */

import { MAX_HISTORY_PAGE_SIZE, MIN_HISTORY_PAGE_SIZE } from '../tweak-config.ts'

const STORAGE_KEY = 'dsh-style-tweaks.history-page-size'

/** Key of the per-page shared state (see the module doc). */
const SHARED_KEY = '__dsh_style_tweaks_history_page_size__'

interface HistoryPageSizeTargets {
  /** Page size to raise `maxMessages` to; 50 (= DSH stock) rewrites nothing. */
  pageSize: number
  /** Whether the `session/follow` cold-open first screen is raised too. */
  coldStart: boolean
}

/** Per-page state shared by every bundle instance loaded into this page. */
interface HistoryPageSizeState {
  /** Whether this page's `fetch` / `WebSocket.send` wrappers are installed. */
  installed: boolean
  /** Highest generation handed out so far; 0 = none. */
  generation: number
  /** Generation currently owning the targets; 0 = released / none. */
  owner: number
  targets: HistoryPageSizeTargets
}

/**
 * This instance's ownership generation, claimed on first install. Module
 * state on purpose: each bundle instance needs its own number, while the
 * counter it is drawn from lives in the shared object.
 */
let myGeneration = 0

/** Read (or create) the shared state. */
function sharedState(): HistoryPageSizeState {
  const host = globalThis as unknown as Record<string, HistoryPageSizeState | undefined>
  const existing = host[SHARED_KEY]
  if (existing !== undefined) return existing
  const created: HistoryPageSizeState = {
    installed: false,
    generation: 0,
    owner: 0,
    targets: { pageSize: MIN_HISTORY_PAGE_SIZE, coldStart: false },
  }
  host[SHARED_KEY] = created
  return created
}

/** Clamp a page size to the same [50, 1000] window the settings enforce. */
function clampPageSize(value: number): number {
  return Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(MIN_HISTORY_PAGE_SIZE, Math.round(value)))
}

/**
 * Update the live rewrite targets. Called by the settings subscription on
 * every settings publish; also persists to localStorage so the next page
 * load can seed the targets before the settings read lands. A no-op once a
 * newer instance owns the targets.
 */
export function setHistoryPageSizeTargets(pageSize: number, coldStart: boolean): void {
  const state = sharedState()
  if (state.owner !== myGeneration) return
  state.targets = { pageSize: clampPageSize(pageSize), coldStart }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.targets))
  } catch {
    // Private-mode / storage-full: the shared state still drives this page.
  }
}

/**
 * Stop this instance from rewriting anything and release ownership. Called on
 * plugin teardown. It deliberately leaves localStorage alone — the seed must
 * survive for the next page load's cold window — and does not unwind the
 * fetch/WebSocket wrappers, which stay for the page lifetime. A late teardown
 * from an instance that has already lost ownership is ignored, so it cannot
 * clear the settings of the instance that replaced it.
 */
export function resetHistoryPageSizeTargets(): void {
  const state = sharedState()
  if (state.owner !== myGeneration) return
  state.owner = 0
  state.targets = { pageSize: MIN_HISTORY_PAGE_SIZE, coldStart: false }
}

/** Load the persisted seed, replacing the targets from scratch. */
function seedTargetsFromStorage(state: HistoryPageSizeState): void {
  state.targets = { pageSize: MIN_HISTORY_PAGE_SIZE, coldStart: false }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return
    const parsed = JSON.parse(raw) as Partial<HistoryPageSizeTargets>
    // Clamp on the way in too: a hand-edited (or older-version) seed must not
    // bypass the [50, 1000] guardrail the settings enforce, and a
    // non-integer would fail the host's "positive safe integer" validation.
    if (typeof parsed.pageSize === 'number' && Number.isFinite(parsed.pageSize)) {
      state.targets.pageSize = clampPageSize(parsed.pageSize)
    }
    if (typeof parsed.coldStart === 'boolean') state.targets.coldStart = parsed.coldStart
  } catch {
    // Corrupt seed: the stock targets stand.
  }
}

/**
 * Install the fetch + WebSocket.send rewrites and claim the targets.
 * Idempotent across instances: the wrappers are installed once per page (the
 * flag is shared) and never unwound, while this instance claims its
 * generation once and takes the targets whenever that generation is newer
 * than the current owner's. Taking the targets restarts them from the
 * localStorage seed — the correct start both for a page load's first sync
 * (no settings snapshot yet) and for a re-enable in the same page (the
 * previous instance's teardown released them).
 */
export function installHistoryPageSizeTransport(): void {
  const state = sharedState()
  if (!state.installed) {
    state.installed = true
    patchTransport(state)
  }
  if (myGeneration === 0) {
    state.generation += 1
    myGeneration = state.generation
  }
  if (state.owner < myGeneration) {
    state.owner = myGeneration
    seedTargetsFromStorage(state)
  }
}

/** Wrap the two browser primitives; every wrapper reads the shared targets. */
function patchTransport(state: HistoryPageSizeState): void {
  const originalFetch = globalThis.fetch
  globalThis.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (init !== undefined && typeof init.body === 'string' && init.body.includes('"session/page"')) {
      const rewritten = rewritePageBody(init.body, state.targets)
      if (rewritten !== null) init = { ...init, body: rewritten }
    }
    return originalFetch.call(this, input, init)
  }

  const originalSend = WebSocket.prototype.send
  WebSocket.prototype.send = function patchedSend(
    this: WebSocket,
    data: string | ArrayBufferLike | Blob | ArrayBufferView,
  ): void {
    if (typeof data === 'string' && data.includes('"session/follow"')) {
      const rewritten = rewriteFollowFrame(data, state.targets)
      if (rewritten !== null) {
        originalSend.call(this, rewritten)
        return
      }
    }
    originalSend.call(this, data)
  }
}

/** Raise a request's page size; `null` leaves the request untouched. */
function raisedCount(targets: HistoryPageSizeTargets, current: number): number | null {
  return targets.pageSize > current ? targets.pageSize : null
}

/** Rewrite the `session/page` request body; `null` = no change. */
function rewritePageBody(body: string, targets: HistoryPageSizeTargets): string | null {
  try {
    const msg = JSON.parse(body) as {
      payload?: { args?: { request?: { maxMessages?: number } } }
    }
    const request = msg?.payload?.args?.request
    if (request === undefined || typeof request.maxMessages !== 'number') return null
    const next = raisedCount(targets, request.maxMessages)
    if (next === null) return null
    request.maxMessages = next
    return JSON.stringify(msg)
  } catch {
    return null
  }
}

/** Rewrite a `session/follow` mux open frame; `null` = no change. */
function rewriteFollowFrame(data: string, targets: HistoryPageSizeTargets): string | null {
  if (!targets.coldStart) return null
  try {
    const msg = JSON.parse(data) as {
      type?: string
      endpoint?: string
      payload?: { args?: { maxMessages?: number; request?: { maxMessages?: number } } }
    }
    if (msg?.type !== 'open' || msg.endpoint !== 'session/follow') return null
    const args = msg.payload?.args
    if (args === undefined) return null
    // The wire shape wraps the follow request one level down:
    //   payload.args = { request: { address, assistantStream, maxMessages } }
    // (verified against a live 0.1.6-alpha.2 frame). The flat `args.maxMessages`
    // branch is the fallback, not the other way round — do not "clean up" the
    // nested lookup, or cold-start rewriting silently stops happening.
    const holder = typeof args.maxMessages === 'number' ? args : (args.request ?? undefined)
    if (holder === undefined || typeof holder.maxMessages !== 'number') return null
    const next = raisedCount(targets, holder.maxMessages)
    if (next === null) return null
    holder.maxMessages = next
    return JSON.stringify(msg)
  } catch {
    return null
  }
}
