/**
 * dsh-style-tweaks — project-running-indicator tweak.
 *
 * The first non-pure-CSS tweak: it renders the *app's own* `StateDot`
 * (the animated pixel-chase shown left of a running conversation's title,
 * `ui-primitives/src/StateDot.tsx`) in two places in the sidebar, so work in
 * flight stays visible:
 *
 *   - on the right side of every project directory header row, so a busy
 *     conversation stays visible even when its group is collapsed;
 *   - in the status slot of a session row the app left empty (`slot` before
 *     the title). That empty slot is exactly what a background job produces:
 *     the run outlives the turn that started it, `SessionSummary.running`
 *     goes back to false, and the app's own `sessionStatuses`
 *     (`ui-workspace/src/client/rows/Rows.tsx:231`) then computes `done` —
 *     which renders no dot unless the session is also an unviewed completion.
 *
 * ## Why DOM patching
 *
 * DSH's project header (`ProjectRowItem`, `ui-workspace/src/client/rows/
 * Rows.tsx:112`) and its session row (`SessionNodeItem`, same file:379)
 * expose no plugin slot, and the `sidebar.workspaces` seat is already
 * occupied by the stock browser — so the rows can only be decorated from
 * outside, via a MutationObserver. Consistent with this repo's selector
 * philosophy, the engine anchors exclusively on hand-written DOM facts that
 * survive CSS-Modules hashing:
 *
 *   - group header rows are the only `role="treeitem"` elements carrying
 *     `aria-expanded` (session rows and flat-list rows never have it),
 *     including the Ungrouped bucket's;
 *   - session rows are the `role="treeitem"` elements whose class carries the
 *     CSS-Modules local name `sessionRow` — the search-result rows are
 *     `searchResultRow`, which does not contain that fragment.
 *
 * Neither row type carries its identity in the DOM — and the header's visible
 * label is not usable as one, since two Workspaces may share it — so both are
 * read off the React fiber chain — `SessionNodeItem` memoizes `props.node`
 * (whose `id` is the `SessionId`) and `ProjectRowItem` memoizes `props.group`
 * (whose `key` is the `WorkspaceId`, or `''` for the Ungrouped bucket). The
 * walks are defensive (a missing fiber, a renamed component, or a reused row
 * all read as "unknown") and re-checked every pass, because a recycled row
 * can hold a different session/group than it did last time.
 *
 * ## Data source
 *
 * Running state is read from the app's own stores, not inferred from the
 * DOM (a collapsed group hides its child rows, so the DOM cannot answer):
 *
 *   - `ctx.get('sessions').list` — snapshot store of `SessionSummary`s
 *     (`byId[id].running`) plus `jobsBySession`, the browser-safe
 *     `SessionJob` rows mirrored from Session Controller's control stream;
 *   - `ctx.get('workspaces').list` — `WorkspaceSnapshot.items`, each
 *     `WorkspaceView.sessionIds` mapping sessions to directories.
 *
 * A session is busy when any of these holds:
 *
 *   - its own agent is executing a turn (`Summary.running`);
 *   - it owns a live background job — `SessionJob.status` of `running` or
 *     `stopping`, the same predicate `ui-jobs`' own `JobListAction` calls
 *     `isLive`. A `run_in_background` shell command outlives the turn that
 *     started it, so without this the group goes dark while work is still
 *     running (and the job's completion notice is what eventually wakes the
 *     session again);
 *   - a running subagent sits below it in the lineage (the same walk as
 *     `indexSubagentDescendants`), which is what the title's own dot shows.
 *
 * Membership is computed from the workspace arrays (mirroring
 * `deriveGroups` in `ui-workspace/src/client/tree.ts`): archived and blank
 * sessions are skipped, sessions not in any workspace count toward the
 * "Ungrouped" bucket.
 *
 * Header rows are matched to workspaces by group key (the `WorkspaceId`), not
 * by title text: `GroupNode.label` is the directory basename
 * (`workspaceLabel`), and nothing forbids two Workspaces from sharing one —
 * the Host only rejects a *rename* that collides (`workspace/name-conflict`),
 * so adding `…\a\pi-web` and `…\b\pi-web` yields two groups labelled
 * "pi-web". Matching on that label would light both the moment either went
 * busy. The key is unique by construction, and it also removes the need for
 * the negative "label matches no workspace title" test that used to identify
 * the Ungrouped bucket: its key is `UNGROUPED_KEY` (`''`), straight from
 * `GroupNode.key`.
 *
 * ## Rendering
 *
 * The dot is the real `StateDot` imported from
 * `@deepseek-ai/dsh-client-ui-primitives`. That package is in the client
 * shell's `PLATFORM_MODULES` baseline, so at runtime the import resolves to
 * the app's shared instance — its CSS module and theme tokens are already
 * loaded, and the dot is pixel-identical to the one on session titles. The dot
 * is mounted with a `react-dom/client` root per decorated row and unmounted
 * whenever the row goes idle, the row leaves the DOM, or the tweak is
 * disabled.
 *
 * One deliberate departure from the host's own look: every ongoing StateDot in
 * the app is redrawn as the eight-spoke spinner ZCode uses — lucide's `loader`
 * icon, eight evenly spaced radial spokes turned at a constant 1s per
 * revolution — instead of the host's breathing ring. The redraw is
 * unconditional, i.e. it does not hang off the reduced-motion preference that
 * 0.1.7 answers by freezing the host's ring; that preference is why the
 * override exists at all, since a still ring cannot say "work in flight", which
 * is this tweak's only job. It covers the two dots injected here and the app's
 * own, wherever the component is used, and stops there — the host's other
 * reduced-motion answers (tool-row sweeps, text shimmers, progress bars) are
 * left alone.
 *
 * A session row is only decorated while its slot is empty: the moment the app
 * renders its own dot there (the session started a turn, a subagent is
 * running, an interaction is pending, or an unviewed completion is showing),
 * the injected dot steps aside instead of doubling up. Group headers have no
 * such slot, so they carry the dot unconditionally while their group is busy.
 */

import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only imports activate the client-service Context declarations
// (`ctx.get('sessions')` / `ctx.get('workspaces')` keys).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** Structural view of the app's session-list snapshot store (read face only). */
interface SnapshotStoreLike<S> {
  getSnapshot(): S
  subscribe(listener: () => void): () => void
}

/** Fields of `SessionSummary` the lineage/status walk needs. */
interface SessionSummaryLike {
  readonly id: string
  readonly running: boolean
  readonly blank: boolean
  readonly parentId?: string | undefined
  readonly origin?: 'subagent' | undefined
}

interface SessionListStateLike {
  /** Host-list order; breadcrumb-only subagent rows are excluded. */
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>
  /**
   * Background jobs per session, mirrored last-wins from Session
   * Controller's control baseline and `jobs` frames. Optional because a
   * host build without the `jobs` service simply never fills it (and an
   * older host may not carry the field at all) — both read as "no jobs".
   */
  readonly jobsBySession?: Readonly<Record<string, readonly SessionJobLike[] | undefined>> | undefined
}

/** Fields of `SessionJob` the live-job check needs. */
interface SessionJobLike {
  readonly status: 'running' | 'stopping' | 'completed' | 'killed' | 'failed'
}

/** Fields of `WorkspaceView` the membership mapping needs. */
interface WorkspaceViewLike {
  readonly workspaceId: string
  readonly sessionIds: readonly string[]
}

interface WorkspaceSnapshotLike {
  readonly items: readonly WorkspaceViewLike[]
  readonly archivedSessionIds: readonly string[]
}

/** Which rows must currently show a dot. */
interface BusyState {
  /**
   * Workspace ids with at least one busy member session. Keyed by id, never by
   * the display label, which two Workspaces may share.
   */
  readonly busyWorkspaceIds: ReadonlySet<string>
  readonly ungroupedBusy: boolean
  /**
   * Sessions holding a live background job. Session rows decorate on this
   * alone: every other busy case already has the app's own dot in the slot.
   */
  readonly liveJobIds: ReadonlySet<string>
}

const INDICATOR_CSS = `
span[data-cst-proj-indicator] {
  display: inline-flex;
  align-items: center;
  flex: none;
  margin-left: 2px;
  pointer-events: none;
}
span[data-cst-session-indicator] {
  display: inline-flex;
  align-items: center;
  flex: none;
  pointer-events: none;
}
/* The running indicator is redrawn as ZCode's spinner: the eight evenly spaced
 * spokes of lucide's loader icon, turned at a constant 1s per revolution. The
 * host's own ongoing dot is a breathing ring, and since 0.1.7 it is frozen
 * outright whenever the system asks for reduced motion — a still ring cannot
 * say "work in flight", which is this tweak's only job, so the redraw is
 * deliberately unconditional.
 *
 * CSS can only reach the host's svg, g and two circles, so the spokes are a
 * mask on the svg element: the mask is lucide's own loader path data, verbatim
 * (8 lines, radius 6..10 of a 24 viewBox, 2 units thick, round caps), which
 * rasterises exactly like the icon ZCode draws. The svg itself is filled with
 * currentColor, so the dot keeps whatever colour the host's CSS module gave it
 * (tertiary grey), and everything the host draws inside it is switched off —
 * the whole child list, not just today's two circles, so a host that redraws
 * its spinner with other elements stays covered. :has() keeps the rule to svgs
 * that actually contain the host's spinner. */
svg[data-state="ongoing"]:has([class*="spinnerMotion"]) {
  transform-origin: 50% 50%;
  background: currentColor;
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M12 2v4'/%3E%3Cpath d='m16.2 7.8 2.9-2.9'/%3E%3Cpath d='M18 12h4'/%3E%3Cpath d='m16.2 16.2 2.9 2.9'/%3E%3Cpath d='M12 18v4'/%3E%3Cpath d='m4.9 19.1 2.9-2.9'/%3E%3Cpath d='M2 12h4'/%3E%3Cpath d='m4.9 4.9 2.9 2.9'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M12 2v4'/%3E%3Cpath d='m16.2 7.8 2.9-2.9'/%3E%3Cpath d='M18 12h4'/%3E%3Cpath d='m16.2 16.2 2.9 2.9'/%3E%3Cpath d='M12 18v4'/%3E%3Cpath d='m4.9 19.1 2.9-2.9'/%3E%3Cpath d='M2 12h4'/%3E%3Cpath d='m4.9 4.9 2.9 2.9'/%3E%3C/svg%3E");
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  animation: cst-state-dot-spokes 1s linear infinite;
}
svg[data-state="ongoing"]:has([class*="spinnerMotion"]) > * {
  display: none;
}
@keyframes cst-state-dot-spokes {
  to { transform: rotate(360deg); }
}
`

const INDICATOR_CSS_ID = 'cst-project-running-indicator'
/** Group header rows are the only treeitems with aria-expanded (Rows.tsx:143). */
const HEADER_SELECTOR = '[role="treeitem"][aria-expanded]'
/** Session rows carry the CSS-Modules local name `sessionRow` (search rows do not). */
const SESSION_ROW_SELECTOR = '[role="treeitem"][class*="sessionRow"]'
/** `GroupNode.key` of the bucket holding sessions outside every Workspace (tree.ts). */
const UNGROUPED_KEY = ''

function installIndicatorStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${INDICATOR_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = INDICATOR_CSS_ID
    style.textContent = INDICATOR_CSS
    document.head.appendChild(style)
  }
  return () => { style?.remove() }
}

/**
 * Derive which rows must show a dot. Mirrors `deriveGroups` membership rules:
 * archived and blank sessions never render as rows, and subagent rows belong
 * to their top-level ancestor's group.
 */
function computeBusy(
  sessions: SnapshotStoreLike<SessionListStateLike>,
  workspaces: SnapshotStoreLike<WorkspaceSnapshotLike>,
): BusyState {
  const list = sessions.getSnapshot()
  const snapshot = workspaces.getSnapshot()
  const archived = new Set(snapshot.archivedSessionIds)

  const jobsBySession = list.jobsBySession

  // A live background job keeps its owner visibly busy: `run_in_background`
  // work outlives the turn that started it, and only its settlement notice
  // wakes the session again — so the group must not go dark in between.
  // Same `isLive` predicate as ui-jobs' own `JobListAction`.
  const hasLiveJob = (id: string): boolean =>
    (jobsBySession?.[id] ?? []).some(job => job.status === 'running' || job.status === 'stopping')

  // Session rows are keyed by session id, and a session may hold a job that
  // the host's own row status does not reflect — collect those ids once.
  const liveJobIds = new Set<string>()
  for (const id of Object.keys(jobsBySession ?? {})) {
    if (hasLiveJob(id)) liveJobIds.add(id)
  }

  const isSelfBusy = (id: string): boolean => {
    const summary = list.byId[id]
    if (summary === undefined) return false
    return summary.running || hasLiveJob(id)
  }

  // Busy subagents light up their top-level ancestor (Rows.tsx
  // sessionStatuses shows 'ongoing' for runningSubagentCount > 0). A
  // subagent that is only holding a live background job counts too.
  const busyAncestors = new Set<string>()
  for (const summary of Object.values(list.byId)) {
    if (summary === undefined) continue
    if (summary.origin !== 'subagent' || !isSelfBusy(summary.id)) continue
    const seen = new Set<string>()
    let current: SessionSummaryLike | undefined = summary
    while (current?.origin === 'subagent' && current.parentId !== undefined && !seen.has(current.id)) {
      seen.add(current.id)
      current = list.byId[current.parentId]
    }
    if (current !== undefined && current.origin !== 'subagent') busyAncestors.add(current.id)
  }
  const isBusy = (id: string): boolean => isSelfBusy(id) || busyAncestors.has(id)

  const busyWorkspaceIds = new Set<string>()
  const grouped = new Set<string>()
  for (const workspace of snapshot.items) {
    for (const id of workspace.sessionIds) {
      grouped.add(id)
      if (archived.has(id)) continue
      const summary = list.byId[id]
      // Blank sessions are hidden from the browser (tree.ts deriveGroups).
      if (summary === undefined || summary.blank) continue
      if (isBusy(id)) busyWorkspaceIds.add(workspace.workspaceId)
    }
  }

  // Ungrouped bucket: host-list rows in no workspace (ids excludes the
  // breadcrumb-only subagent routes that byId additionally carries).
  let ungroupedBusy = false
  for (const id of list.ids) {
    if (grouped.has(id) || archived.has(id)) continue
    const summary = list.byId[id]
    if (summary === undefined || summary.blank || summary.origin === 'subagent') continue
    if (isBusy(id)) { ungroupedBusy = true; break }
  }

  return { busyWorkspaceIds, ungroupedBusy, liveJobIds }
}

/** Minimal shape of React's internal fiber node, for the props walks only. */
interface FiberLike {
  readonly memoizedProps?: unknown
  readonly return?: FiberLike | null | undefined
}

/** The only props fields the walks read, on whichever component carries them. */
interface FiberProps {
  readonly node?: { readonly id?: unknown } | null | undefined
  readonly group?: { readonly key?: unknown } | null | undefined
}

/** React keys its internal fiber on the DOM node with this prefix. */
const FIBER_KEY_PREFIX = '__reactFiber$'
/** Cap the upward walk; both row components sit a handful of levels above the row. */
const FIBER_WALK_LIMIT = 32
/** Row element → its (stable) React fiber key. Cached because `Object.keys` allocates. */
const fiberKeys = new WeakMap<Element, string>()

/** Root fiber of one row, or `undefined` when React did not attach one. */
function rootFiberOf(row: Element): FiberLike | undefined {
  let key = fiberKeys.get(row)
  if (key === undefined) {
    key = Object.keys(row).find(candidate => candidate.startsWith(FIBER_KEY_PREFIX))
    if (key === undefined) return undefined
    fiberKeys.set(row, key)
  }
  return (row as unknown as Record<string, FiberLike | undefined>)[key]
}

/**
 * Walk up from a row to the nearest fiber whose props satisfy `read`. Both
 * walks are deliberately forgiving: a build without a React fiber, a renamed
 * component, a recycled row, or any other surprise yields `undefined` and the
 * row is then simply left alone (it is re-resolved every pass, never trusted).
 */
function readUpFiberChain<T>(row: Element, read: (props: FiberProps) => T | undefined): T | undefined {
  let fiber = rootFiberOf(row)
  for (let depth = 0; fiber != null && depth < FIBER_WALK_LIMIT; depth++) {
    const value = read((fiber.memoizedProps ?? {}) as FiberProps)
    if (value !== undefined) return value
    fiber = fiber.return ?? undefined
  }
  return undefined
}

/**
 * Session id behind one session row: `SessionNodeItem` memoizes
 * `props.node.id`.
 */
function sessionIdOfRow(row: Element): string | undefined {
  return readUpFiberChain(row, (props) => {
    const id = props.node?.id
    return typeof id === 'string' ? id : undefined
  })
}

/**
 * Group key behind one project header row: `ProjectRowItem` memoizes
 * `props.group.key`, which is the `WorkspaceId` or `UNGROUPED_KEY` (`''`).
 * `''` is a value, not a miss — hence the string test rather than a
 * truthiness one.
 */
function groupKeyOfRow(row: Element): string | undefined {
  return readUpFiberChain(row, (props) => {
    const key = props.group?.key
    return typeof key === 'string' ? key : undefined
  })
}

/** The session row's status slot: the leading span the app's own StateDot lives in. */
function sessionSlot(row: Element): Element | null {
  return row.querySelector(':scope > [class*="slot"]')
}

interface Indicator {
  host: HTMLSpanElement
  root: Root
  shown: boolean
}

/**
 * Mount/unmount the live tweak. Returns the disposer; safe to call when the
 * app stores are absent (unknown host build) — the tweak then stays inert.
 *
 * HMR-safe: the guard lives on `window` so it survives module reloads. A
 * hot-reload that calls this again before the previous cleanup runs will
 * tear down the stale instance first instead of stacking two
 * MutationObservers / two dots per row.
 */
const GLOBAL_KEY = '__cst_project_running_indicator_cleanup__'
function getGlobalCleanup(): (() => void) | undefined {
  return (window as any)[GLOBAL_KEY]
}
function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as any)[GLOBAL_KEY] = fn
}
export function setupProjectRunningIndicator(ctx: ClientContext): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  const removeStyles = installIndicatorStyles()

  let sessionList: SnapshotStoreLike<SessionListStateLike>
  let workspaceList: SnapshotStoreLike<WorkspaceSnapshotLike>
  try {
    // The services expose their state as snapshot stores: `sessions.list`
    // (SessionListState) and `workspaces.list` (WorkspaceSnapshot).
    sessionList = (ctx.get('sessions') as { list: unknown }).list as SnapshotStoreLike<SessionListStateLike>
    workspaceList = (ctx.get('workspaces') as { list: unknown }).list as SnapshotStoreLike<WorkspaceSnapshotLike>
    if (typeof sessionList?.subscribe !== 'function' || typeof workspaceList?.subscribe !== 'function') {
      throw new Error('unexpected store shape')
    }
  } catch {
    // Unknown host build without the expected services: keep the CSS inert.
    return () => { removeStyles() }
  }

  const indicators = new Map<Element, Indicator>()
  const sessionIndicators = new Map<Element, Indicator>()

  const removeIndicator = (map: Map<Element, Indicator>, row: Element): void => {
    const indicator = map.get(row)
    if (indicator === undefined) return
    map.delete(row)
    indicator.root.unmount()
    indicator.host.remove()
    // After this point the entry is gone from its map and the host is
    // detached, so the React root and DOM node are both GC-eligible. Do not
    // call `indicator.root.render(...)` past here — it's a defunct handle.
  }

  const syncHeaderRow = (row: Element, busy: BusyState): void => {
    // Resolved per pass, never cached: a row can be recycled onto another
    // group, and the key is what keeps two same-named Workspaces apart.
    const key = groupKeyOfRow(row)
    if (key === undefined) return
    const active = key === UNGROUPED_KEY
      ? busy.ungroupedBusy
      : busy.busyWorkspaceIds.has(key)
    let indicator = indicators.get(row)
    if (!active) {
      // Group went idle (or the row lost its identity): unmount the dot.
      if (indicator !== undefined) removeIndicator(indicators, row)
      return
    }
    if (indicator === undefined) {
      const host = document.createElement('span')
      host.dataset.cstProjIndicator = ''
      row.insertBefore(host, row.lastElementChild)
      indicator = { host, root: createRoot(host), shown: false }
      indicators.set(row, indicator)
    } else if (!indicator.host.isConnected) {
      // Don't re-render on reattach — `shown` stays true and the root keeps
      // its existing vDOM, so the StateDot's animation continues uninterrupted
      // when the row leaves and re-enters the DOM.
      row.insertBefore(indicator.host, row.lastElementChild)
    }
    if (!indicator.shown) {
      indicator.shown = true
      indicator.root.render(createElement(StateDot, { state: 'ongoing' }))
    }
  }

  /**
   * One session row known to hold a live background job. The app's own status
   * dot never covers that case, so the row's slot is empty — which is exactly
   * where the dot belongs. A slot the app has taken back is left untouched.
   */
  const mountSessionIndicator = (row: Element): void => {
    const slot = sessionSlot(row)
    if (slot === null) return
    // Never share the slot: a row whose app dot is already showing (turn
    // running, subagent running, interaction pending, unviewed completion) is
    // already saying something, and doubling it up would only confuse.
    if (slot.firstElementChild !== null) return
    const host = document.createElement('span')
    host.dataset.cstSessionIndicator = ''
    slot.prepend(host)
    const indicator = { host, root: createRoot(host), shown: false }
    sessionIndicators.set(row, indicator)
    indicator.shown = true
    indicator.root.render(createElement(StateDot, { state: 'ongoing' }))
  }

  /**
   * Retire every decorated session row this pass no longer justifies: the row
   * was detached or recycled onto another session, its job settled, or the app
   * took the slot back. Runs before the mount sweep so a recycled row can never
   * keep a dot belonging to its previous tenant.
   */
  const pruneSessionIndicators = (liveJobIds: ReadonlySet<string>): void => {
    for (const row of [...sessionIndicators.keys()]) {
      const indicator = sessionIndicators.get(row)
      if (indicator === undefined) continue
      if (!row.isConnected) { removeIndicator(sessionIndicators, row); continue }
      const id = sessionIdOfRow(row)
      const slot = id !== undefined && liveJobIds.has(id) ? sessionSlot(row) : null
      const taken = slot === null
        || [...slot.children].some(child => child !== indicator.host)
      if (id === undefined || !liveJobIds.has(id) || taken) {
        removeIndicator(sessionIndicators, row)
      }
    }
  }

  const sync = (): void => {
    // Rows removed from the document: their entries must go (Map, not
    // WeakMap, because we need isConnected checks + explicit removal).
    for (const row of [...indicators.keys()]) {
      if (!row.isConnected) removeIndicator(indicators, row)
    }
    const busy = computeBusy(sessionList, workspaceList)
    for (const row of document.querySelectorAll(HEADER_SELECTOR)) {
      syncHeaderRow(row, busy)
    }
    pruneSessionIndicators(busy.liveJobIds)
    // Zero-cost when no session holds a job, which is the ordinary case: the
    // row sweep below then has nothing to match against.
    if (busy.liveJobIds.size === 0) return
    for (const row of document.querySelectorAll(SESSION_ROW_SELECTOR)) {
      if (sessionIndicators.has(row)) continue
      const id = sessionIdOfRow(row)
      if (id === undefined || !busy.liveJobIds.has(id)) continue
      mountSessionIndicator(row)
    }
  }

  // Coalesce a burst of DOM mutations into one scan per microtask: the
  // observer spans `document.body` and every streaming chunk lights it up
  // for a few ticks, but they all settle before the microtask queue drains.
  let syncScheduled = false
  const scheduleSync = (): void => {
    if (syncScheduled) return
    syncScheduled = true
    queueMicrotask(() => {
      syncScheduled = false
      sync()
    })
  }

  const observer = new MutationObserver(() => { scheduleSync() })
  observer.observe(document.body, { childList: true, subtree: true })

  const unsubscribeSessions = sessionList.subscribe(() => { scheduleSync() })
  const unsubscribeWorkspaces = workspaceList.subscribe(() => { scheduleSync() })
  sync()

  const cleanup = (): void => {
    unsubscribeSessions()
    unsubscribeWorkspaces()
    observer.disconnect()
    for (const row of [...indicators.keys()]) removeIndicator(indicators, row)
    for (const row of [...sessionIndicators.keys()]) removeIndicator(sessionIndicators, row)
    removeStyles()
    setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}
