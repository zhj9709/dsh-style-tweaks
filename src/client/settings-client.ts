/**
 * dsh-style-tweaks — the Settings route client.
 *
 * Owns the same-origin HTTP conversation with the plugin's server half: one
 * external store the panel subscribes to, optimistic local application of
 * each write, per-field write coalescing, and the 502/503 retry ladder.
 * Split out of the entry point so the panel imports a client, not the plugin.
 */

import { Snapshot, TweaksValue, resolveValue } from './settings-value.ts'

const SETTINGS_ROUTE = '/_dsh/style-tweaks/settings'

interface ApiSuccess<T> { ok: true; value: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }

/**
 * Failure carrying the server's machine-readable status/code, so callers can
 * act on the class of failure (e.g. "lost a revision race") instead of
 * parsing messages. `apiRequest` raises it for every parsed non-success
 * response; a fetch-level error (offline, CORS) keeps its plain identity.
 */
class SettingsApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Settings requests retry briefly on 502/503: writing the profile patch
 * hot-reloads the `web` node and restarts this plugin for a moment (it
 * injects `web`), so a toggle click can land inside that window. The retry
 * rides it out instead of surfacing "settings unavailable" — fetch-level
 * failures (connection refused mid-restart) stay in the loop for the same
 * reason. A definite non-502/503 HTTP status is final: it must surface on
 * the first occurrence (a 409 conflict or a plain 400 idling through six
 * doomed round-trips before anyone sees it is the failure mode to avoid).
 */
async function apiRequest<T>(init?: RequestInit): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 6; attempt++) {
    /** This round ended in a deliberate HTTP status that must not be retried. */
    let fatal = false
    try {
      const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin', ...init })
      // Read text before parsing. A response with no body at all is a real
      // shape here, not a hypothetical: when the route is not registered the
      // host answers `404` with an empty body, and `response.json()` throws
      // "Unexpected end of JSON input". That throw used to be treated as a
      // transport failure, so the panel retried six times and then reported a
      // parse error — which says nothing about the actual problem. A definite
      // status now wins over the body: the code reports the status, and 404 is
      // fatal on the first round because no retry can conjure the route.
      const raw = await response.text()
      let body: ApiSuccess<T> | ApiFailure | undefined
      if (raw.length > 0) {
        try { body = JSON.parse(raw) as ApiSuccess<T> | ApiFailure } catch { body = undefined }
      }
      if (response.ok && body?.ok === true) return body.value
      const failure = body as ApiFailure | undefined
      fatal = response.status !== 502 && response.status !== 503
      lastError = new SettingsApiError(
        response.status,
        failure?.error?.code ?? `http-${response.status}`,
        failure?.error?.message
          ?? (raw.length === 0
            ? `Style tweaks route answered HTTP ${response.status} with an empty body (is the server half loaded?)`
            : `Style tweaks request failed with HTTP ${response.status}`),
      )
    } catch (error) {
      lastError = error
    }
    if (fatal) throw lastError
    await new Promise((resolve) => setTimeout(resolve, attempt * 250))
  }
  throw lastError ?? new Error('Style tweaks request failed')
}

/** Client-side snapshot store fed by the same-origin Settings route. */
interface SettingsState {
  status: 'loading' | 'ready' | 'error'
  writable: boolean
  value: TweaksValue | undefined
  revision: number | undefined
  error?: string
}

/** One field write already shown locally but not yet confirmed by the Host. */
interface PendingWrite {
  readonly action: 'set' | 'unset'
  readonly field: string
  readonly value: unknown
}

/** One same-field write parked inside the lead-edge coalesce window. */
interface StagedWrite {
  readonly write: PendingWrite
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
  readonly timer: ReturnType<typeof setTimeout>
}

/**
 * Apply one write to a snapshot value. `unset` drops the key, and the resolver
 * below reads a missing key as "the default" — the same meaning the Host gives
 * an unset, so the two agree without carrying a second copy of the defaults.
 */
function applyWrite(value: TweaksValue, write: PendingWrite): TweaksValue {
  const next = { ...value, [write.field]: write.value } as TweaksValue
  if (write.action === 'unset') delete (next as Record<string, unknown>)[write.field]
  return next
}

/**
 * Whether the Host already holds what one write asked for. Used only on the
 * failure path, where a save's answer never arrived: reading the Host back is
 * the only way to tell "committed, response lost" from "never landed".
 *
 * The question is asked by applying the write to the Host's own snapshot and
 * comparing that field THROUGH the resolver, never by hunting for the raw
 * value. The Host's `value` is the resolved config, so an `unset` comes back
 * with the field re-materialised at its default — a bare `undefined` test
 * would brand every successful-but-unanswered unset a failure — while routing
 * `set` through the same resolver keeps both actions on one rule: nothing
 * changes ⇒ the Host already stands where the write wanted it. Arrays compare
 * element-wise (the Host re-reads the document, so its array is always a fresh
 * object); anything else answers `false`, i.e. report a failure rather than a
 * success that was never verified.
 */
function wrote(write: PendingWrite, value: TweaksValue): boolean {
  const read = (candidate: TweaksValue): unknown => (candidate as Record<string, unknown>)[write.field]
  const left = read(resolveValue(value))
  const right = read(resolveValue(applyWrite(value, write)))
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => item === right[index])
  }
  return left === right
}

/** Small external store shared by the Settings route and the CSS engine. */
export class SettingsClient {
  private state: SettingsState = { status: 'loading', writable: false, value: undefined, revision: undefined }
  private listeners = new Set<() => void>()
  private generation = 0
  /** Writes shown locally but still crossing the wire, oldest first. */
  private pending: PendingWrite[] = []
  /** The last document the Host actually confirmed. Kept so a write that has to
   *  be given up on can be taken off the screen instead of waiting for a
   *  snapshot that may never arrive. */
  private lastSnapshot: Snapshot | undefined = undefined
  /** Chains that wire traffic: one request in flight at a time. */
  private tail: Promise<void> = Promise.resolve()
  /** Bumped whenever a queued write publishes the Host's answer for it. A
   *  `load` started before this moved read a document the write has since
   *  changed, so publishing that answer would roll the panel back. */
  private settled = 0
  /** Lead-edge coalesce window (ms): the first same-field write dispatches
   *  immediately; further ones inside the window stage and collapse to the
   *  last value. Never delays a lone click. */
  private static readonly COALESCE_MS = 150
  /** Per-field time of the last dispatch, which arms the coalesce window. */
  private lastDispatch = new Map<string, number>()
  /** Same-field writes waiting out the window; latest wins. */
  private staged = new Map<string, StagedWrite>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): SettingsState => this.state

  private publish(next: SettingsState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  /**
   * Publish a Host snapshot with every still-pending local write re-applied on
   * top of it.
   *
   * Two things depend on that. A response for an EARLIER write must not undo
   * what a later click already showed — those values are optimistic only, so a
   * bare snapshot would drop them until its own response landed. And the
   * snapshot's `revision` has to reach the store while later clicks sit in the
   * queue: each queued request then sends that fresh revision, which is why
   * rapid toggling no longer loses a race into a 409 and a second doomed
   * round-trip.
   */
  private publishFrom(snapshot: Snapshot): void {
    this.lastSnapshot = snapshot
    const value = this.pending.reduce<TweaksValue>((current, write) => applyWrite(current, write), snapshot.value)
    this.publish({ status: 'ready', writable: snapshot.writable, value, revision: snapshot.revision })
  }

  async load(): Promise<void> {
    const generation = ++this.generation
    const settled = this.settled
    // Re-arm on the way in, not only when already loading. This plugin restarts
    // on every profile-patch write, so "the route was not registered" is a
    // window a user can open Settings inside; without re-arming, `status` sticks
    // at 'error' and the panel's retry guard (`status === 'loading'`) can never
    // fire again. Republishing 'loading' does not re-trigger that guard — the
    // effect depends on the status *value*, which does not change here — so
    // there is no retry storm against a host that is genuinely down.
    if (this.state.value === undefined) this.publish({ ...this.state, status: 'loading' })
    try {
      const snapshot = await apiRequest<Snapshot>()
      if (generation !== this.generation || settled !== this.settled) return
      this.publishFrom(snapshot)
    } catch (error) {
      if (generation !== this.generation) return
      this.publish({ ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Show one write locally, synchronously, before anything crosses the wire.
   * This is what makes a toggle flip at click time — and a ± stepper compute
   * its next step from the value it just displayed — instead of waiting out
   * the Host's save path, which on 0.1.7 runs three full `describe()`s and two
   * composition reconciles (~0.9s). No `value` yet means the panel has not
   * loaded: there is nothing to merge into, and the queued request is all that
   * is needed. The `revision` deliberately stays untouched — it is the Host's
   * CAS token and only its answers may move it.
   */
  private publishLocal(write: PendingWrite): void {
    if (this.state.value === undefined) return
    this.publish({ ...this.state, value: applyWrite(this.state.value, write) })
  }

  /** Retire a write: off the pending list, then publish its Host answer. */
  private settle(write: PendingWrite, snapshot: Snapshot): void {
    const index = this.pending.indexOf(write)
    if (index >= 0) this.pending.splice(index, 1)
    this.settled += 1
    this.publishFrom(snapshot)
  }

  /**
   * Give up on a write without an answer.
   *
   * Dropping it from `pending` is only half the job. `pending` is what the next
   * Host snapshot is reduced over, so a dropped write reverts when — and only
   * when — a later snapshot arrives. The reason this path runs is that the Host
   * could not be reached, so there may never be one, and the optimistic value
   * would sit on screen with nothing behind it. Republishing the last confirmed
   * snapshot is what actually takes it back; the guard covers the case where
   * nothing has ever loaded.
   */
  private drop(write: PendingWrite): void {
    const index = this.pending.indexOf(write)
    if (index >= 0) this.pending.splice(index, 1)
    if (this.lastSnapshot !== undefined) this.publishFrom(this.lastSnapshot)
  }

  /**
   * What the Host actually holds now; null when it cannot be read at all.
   *
   * A single attempt, deliberately unlike `apiRequest`: that ladder exists to
   * ride out the restart a settings write triggers, and this read runs only
   * after a write has ALREADY exhausted it — spending another ~5.25s here just
   * delays the failure report and, because the queue is one-at-a-time, every
   * save lined up behind it. A read that fails outright leaves the optimistic
   * value on screen and reports the original error, which is the right answer
   * when the Host cannot be asked at all.
   */
  private async readTruth(): Promise<Snapshot | null> {
    try {
      const response = await fetch(SETTINGS_ROUTE, { credentials: 'same-origin' })
      // Read the body as text first, exactly as `apiRequest` does. `response.json()`
      // throws on the empty-bodied 404 the host answers for an unregistered path,
      // and this bare `catch` would fold that — the single most diagnosable
      // failure there is — into the same `null` as an unreachable network, so the
      // caller cannot tell "the route is not mounted" from "the host is gone".
      const raw = await response.text()
      if (!response.ok || raw.length === 0) return null
      const body = JSON.parse(raw) as ApiSuccess<Snapshot> | ApiFailure
      return body.ok ? body.value : null
    } catch {
      return null
    }
  }

  /**
   * Send one queued write and retire it with the Host's answer, or resolve
   * against what the Host really holds when the answer never arrives.
   *
   * The read-back matters because a save can commit and still fail to answer
   * (the connection cut after the write), and blind rollback would then show
   * "not saved" for a save that happened: a read that already contains the
   * written value completes as a success, any other read publishes the truth so
   * the panel stops claiming something that is not there, and a Host that
   * cannot be read either keeps the optimistic value on screen while the
   * original error is what the caller reports.
   */
  private async send(write: PendingWrite): Promise<void> {
    try {
      const snapshot = await this.post(write)
      this.settle(write, snapshot)
    } catch (error) {
      const truth = await this.readTruth()
      if (truth === null) {
        this.drop(write)
        throw error
      }
      this.settle(write, truth)
      if (wrote(write, truth.value)) return
      throw error
    }
  }

  /**
   * POST one write, re-reading the revision once when the expected one lost a
   * race (another tab writing, or the settings watcher republishing a hand
   * edit) — bounded to a single attempt so a persistent conflict surfaces
   * instead of looping. The refreshed snapshot publishes with `write` STILL
   * pending on top, so the panel keeps showing the value that is about to be
   * written rather than blinking back to the old one between attempts.
   */
  private async post(write: PendingWrite): Promise<Snapshot> {
    try {
      return await this.postOnce(write)
    } catch (error) {
      if (!(error instanceof SettingsApiError)
        || (error.status !== 409 && error.code !== 'settings-conflict')) throw error
      const fresh = await apiRequest<Snapshot>()
      this.publishFrom(fresh)
      return await this.postOnce(write)
    }
  }

  private async postOnce(write: PendingWrite): Promise<Snapshot> {
    const payload = write.action === 'set'
      ? { action: 'set', field: write.field, value: write.value, expectedRevision: this.state.revision ?? 0 }
      : { action: 'unset', field: write.field, expectedRevision: this.state.revision ?? 0 }
    return await apiRequest<Snapshot>({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Desktop's renderer is file:// and reaches this loopback route over
        // Electron IPC. The marker distinguishes that trusted carrier from a
        // normal web origin; the server still requires its Electron/loopback
        // fence before accepting it.
        'X-DSH-Style-Tweaks-Write': '1',
      },
      body: JSON.stringify(payload),
    })
  }

  async set(field: string, value: unknown): Promise<void> {
    return await this.write({ action: 'set', field, value })
  }

  async unset(field: string): Promise<void> {
    return await this.write({ action: 'unset', field, value: undefined })
  }

  /**
   * Local-first write with two cheapening layers ahead of the queue:
   *
   * 1. **No-op skip** — `wrote()` already answers "does the Host, resolved,
   *    stand where this write wants it?"; the snapshot includes pending
   *    optimistic writes, so re-clicking the active option resolves at once
   *    (the applied pill still shows) without a request. Gated on `ready` so
   *    an unloaded panel never guesses.
   * 2. **Lead-edge coalesce** — the first same-field write dispatches
   *    immediately (a lone click is never delayed); further same-field
   *    writes inside COALESCE_MS stage, last one wins: the superseded staged
   *    write leaves `pending` and resolves at once (its pill is masked by
   *    the `latestSave` seq advance), the newest stays in `pending` (so a
   *    foreign response folding through `publishFrom` cannot roll its
   *    optimistic value back) and dispatches on a fixed ≤150ms timer.
   *    Different fields never share a window.
   *
   * The queue behind dispatch is unchanged: one request in flight, so
   * consecutive dispatches never race into a conflict, and a response folds
   * in under whatever is still queued. The promise resolves when the Host
   * has answered — which is what the panel's save feedback reports.
   */
  private write(write: PendingWrite): Promise<void> {
    if (
      this.state.status === 'ready'
      && this.state.value !== undefined
      && wrote(write, this.state.value)
    ) {
      return Promise.resolve()
    }
    const last = this.lastDispatch.get(write.field) ?? Number.NEGATIVE_INFINITY
    const wait = SettingsClient.COALESCE_MS - (Date.now() - last)
    if (wait <= 0) return this.dispatch(write)
    return new Promise<void>((resolve, reject) => {
      const prior = this.staged.get(write.field)
      if (prior !== undefined) {
        clearTimeout(prior.timer)
        const index = this.pending.indexOf(prior.write)
        if (index >= 0) this.pending.splice(index, 1)
        prior.resolve()
      }
      this.pending.push(write)
      this.publishLocal(write)
      const timer = setTimeout(() => {
        const current = this.staged.get(write.field)
        if (current === undefined) return
        this.staged.delete(write.field)
        void this.dispatch(current.write).then(current.resolve, current.reject)
      }, wait)
      this.staged.set(write.field, { write, resolve, reject, timer })
    })
  }

  /**
   * Hand one write to the one-at-a-time queue and arm its field's next
   * coalesce window. The pending/publish steps are idempotent so a staged
   * write that already published while waiting may re-enter safely.
   */
  private dispatch(write: PendingWrite): Promise<void> {
    this.lastDispatch.set(write.field, Date.now())
    if (!this.pending.includes(write)) this.pending.push(write)
    this.publishLocal(write)
    const run = this.tail.then(() => this.send(write))
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }
}
