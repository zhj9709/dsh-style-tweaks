/**
 * dsh-style-tweaks — history page-size transport tweak.
 *
 * DSH chooses the native history page size in its session-controller client.
 * The current 0.1.7 line asks for up to 500 messages on a cold open and on
 * "Load earlier", while a turn jump additionally asks for at least 200
 * messages through `turnWindow.minMessages`.
 *
 * The page size is a client-side request parameter, not a host setting. This
 * tweak rewrites the outgoing requests in the browser so an enabled setting
 * is the EXACT value used (not merely a lower bound):
 *
 *   - `session/page` (unary POST /api/session/page): the "Load earlier"
 *     pagination and the turn-jump loader.
 *   - `session/follow` (Gateway WebSocket mux open frame): the first screen
 *     a session opens with. Only rewritten when the user opts in, because a
 *     different first-page size trades cold-start work against how much
 *     history appears immediately.
 *
 * The configured value is also written to `turnWindow.minMessages`: that
 * window is the host's early-stop boundary, so leaving its native 50-message
 * minimum in place would still truncate a 1000-message page after two turns.
 * The host requires that minimum not to exceed `maxMessages`.
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
 *   - Module state would give each instance its own targets, so an old layer
 *     could keep applying a stale value after a newer bundle instance changed
 *     it. One shared object makes every layer read the same target; the first
 *     layer applies it and later layers see the same valid value, so wrapping
 *     twice is genuinely idempotent.
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
  /** Exact `maxMessages` value; null leaves every native request untouched. */
  pageSize: number | null
  /** Whether the `session/follow` cold-open first screen uses it too. */
  coldStart: boolean
}

interface HistoryRequest {
  maxMessages?: number
  turnWindow?: {
    minMessages?: number
    minTurns?: number
  }
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
    targets: { pageSize: null, coldStart: false },
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
export function setHistoryPageSizeTargets(pageSize: number | null, coldStart: boolean): void {
  const state = sharedState()
  if (state.owner !== myGeneration) return
  state.targets = {
    pageSize: pageSize === null ? null : clampPageSize(pageSize),
    coldStart,
  }
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
  state.targets = { pageSize: null, coldStart: false }
}

/** Load the persisted seed, replacing the targets from scratch. */
function seedTargetsFromStorage(state: HistoryPageSizeState): void {
  state.targets = { pageSize: null, coldStart: false }
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

/**
 * Apply the configured value exactly to both request limits.
 *
 * `maxMessages` is only the hard cap. DSH also stops at a turn boundary once
 * `turnWindow.minMessages` is reached, so leaving the native 50-message
 * minimum in place would still cut a 1000-message request off after two turns
 * when each turn is large. Aligning the window minimum with the target makes
 * the configured page size effective; the host still requires this minimum not
 * to exceed `maxMessages`.
 */
function applyPageSize(request: HistoryRequest, targets: HistoryPageSizeTargets): boolean {
  const target = targets.pageSize
  if (target === null || typeof request.maxMessages !== 'number') return false
  let changed = false
  if (request.maxMessages !== target) {
    request.maxMessages = target
    changed = true
  }
  const turnWindow = request.turnWindow
  if (
    turnWindow !== undefined &&
    typeof turnWindow.minMessages === 'number' &&
    turnWindow.minMessages !== target
  ) {
    turnWindow.minMessages = target
    changed = true
  }
  return changed
}

/** Rewrite the `session/page` request body; `null` = no change. */
function rewritePageBody(body: string, targets: HistoryPageSizeTargets): string | null {
  try {
    const msg = JSON.parse(body) as {
      payload?: { args?: { request?: HistoryRequest } }
    }
    const request = msg?.payload?.args?.request
    if (request === undefined || !applyPageSize(request, targets)) return null
    return JSON.stringify(msg)
  } catch {
    return null
  }
}

/** Rewrite a `session/follow` mux open frame; `null` = no change. */
function rewriteFollowFrame(data: string, targets: HistoryPageSizeTargets): string | null {
  if (!targets.coldStart || targets.pageSize === null) return null
  try {
    const msg = JSON.parse(data) as {
      type?: string
      endpoint?: string
      payload?: { args?: HistoryRequest & { request?: HistoryRequest } }
    }
    if (msg?.type !== 'open' || msg.endpoint !== 'session/follow') return null
    const args = msg.payload?.args
    if (args === undefined) return null
    // The wire shape wraps the follow request one level down:
    //   payload.args = { request: { address, assistantStream, maxMessages } }
    // (verified against a live 0.1.6-alpha.2 frame). The flat spelling is the
    // fallback, not the other way round.
    const holder = typeof args.maxMessages === 'number' ? args : (args.request ?? undefined)
    if (holder === undefined || !applyPageSize(holder, targets)) return null
    return JSON.stringify(msg)
  } catch {
    return null
  }
}
