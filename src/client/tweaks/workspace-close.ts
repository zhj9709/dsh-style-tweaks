/**
 * dsh-style-tweaks — "close workspace" tweak (JS-level).
 *
 * Hides a Workspace from every surface that derives from the Host Workspace
 * list — the sidebar browser, the New Session picker, search grouping —
 * WITHOUT deleting it: the registry row, its `sessionIds` account and the
 * files on disk all stay put. The single wrapping point is the read face
 * every consumer already goes through, `ctx.get('workspaces').list` — the
 * `ClientWorkspaceModel` instance that `ui-workspace` registers with
 * `slots.provideRoot({ hooks: { workspaces: workspaces.list } })`.
 *
 * Why wrapping is observed at all: the renderer's `bindSnapshotSelector`
 * builds each hook as `getSnapshot = () => w.getSnapshot()`, i.e. it re-reads
 * the method off the instance on every call, so an own-property wrapper
 * installed after the hook was bound is still seen. The instance itself is a
 * `readonly list` field assigned once in the controller's constructor, so the
 * reference never changes.
 *
 * Wrapper contract:
 *   - `getSnapshot` derives `{ ...raw, items: raw.items minus closed }` and
 *     memoizes on (raw snapshot reference, closed-set reference). Reference
 *     stability is mandatory for `useSyncExternalStore`; an empty closed set
 *     returns the raw snapshot object itself, so the common case costs
 *     nothing and cannot perturb any consumer.
 *   - `subscribe` MUST forward to the original. `UiWorkspaceService` drives
 *     its initial Workspace selection from `list.subscribe(reconcile)`, so a
 *     wrapper that swallowed the subscription would break host navigation.
 *     We merely also record the listener so a closed-set change can force a
 *     re-read.
 *   - `create` is wrapped so re-adding a closed Workspace's folder restores
 *     it. The Host resolves by canonical path and returns the same id; that
 *     id must leave the closed set SYNCHRONOUSLY, because `WorkspacePicker`
 *     navigates to the returned id immediately and
 *     `UiWorkspaceService.connectWorkspace` throws "unknown workspace" when
 *     the filtered list does not contain it yet.
 *
 * The closed Workspace's sessions disappear with it: the derived snapshot
 * merges their ids into `archivedSessionIds` — the set the sidebar's three
 * session derivations filter through (`tree.ts:295/337/369`) — so they never
 * surface under Ungrouped. The host's own archive set is left alone.
 *
 * Recovery has two independent routes: re-adding the same folder (above), and
 * the "Closed workspaces" list in the Settings panel, which reads titles
 * through {@link closedWorkspaceEntries} — the un-filtered view published by
 * the live instance (there is no other "everything" entry once the wrapper is
 * installed).
 *
 * Inert by contract: an unrecognized host shape (no `workspaces` service, no
 * `list.getSnapshot` / `list.subscribe`) yields a no-op disposer and touches
 * nothing.
 */

import { createElement, Fragment, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { touchesScope } from '../mutation-scope.ts'
import { resolveClosedWorkspaces } from '../tweak-config.ts'

/** One Workspace row, as far as this tweak reads it. */
interface WorkspaceRowLike {
  readonly workspaceId: string
  readonly title?: string
  readonly path?: string
  readonly sessionIds?: readonly string[]
}

/** The Workspace snapshot, as far as this tweak reads or rewrites it. */
interface WorkspaceSnapshotLike {
  readonly items: readonly WorkspaceRowLike[]
  /**
   * Registry-global archive set. The derived snapshot merges the closed
   * Workspaces' session ids into it, because the sidebar's three session
   * derivations filter through this set (`tree.ts:295` grouping, `:337` flat
   * list, `:369` search) — that is what makes a closed Workspace's sessions
   * disappear instead of falling into Ungrouped. The host's own set is never
   * touched.
   */
  readonly archivedSessionIds?: readonly string[] | undefined
  /** List lifecycle: only `'ready'` licenses pruning the closed set. */
  readonly phase?: string
}

/** The bare observable source the Host exposes as `workspaces.list`. */
interface WorkspaceSourceLike {
  getSnapshot(): WorkspaceSnapshotLike
  subscribe(listener: () => void): () => void
  /**
   * The model doubles as the follow sink; re-publishing one already-present
   * row is the only public call that makes it invalidate its snapshot — and
   * therefore the only way to notify listeners that registered before our
   * wrapper existed. See `pokeHost`.
   */
  upsertView?(workspace: unknown): void
}

/** The Workspace Controller service face this tweak wraps. */
interface WorkspaceServiceLike {
  readonly list?: unknown
  create?: ((input: { path: string }) => Promise<{ readonly workspaceId?: string } | undefined>) | undefined
}

/** Session list store, as far as the open-selection handoff reads it. */
interface SessionListLike {
  getSnapshot(): { readonly current?: string | undefined }
}

/** The navigation face that opens a session (`UiWorkspaceService`). */
interface UiWorkspaceLike {
  startSession?(workspaceId?: string): void
}

/**
 * Settings face this tweak needs: the live closed-id list, a writer, and a
 * subscription so a change that lands without a remount still converges.
 */
export interface WorkspaceCloseSettings {
  getSnapshot(): { readonly value?: { readonly closedWorkspaces?: readonly string[] } | undefined }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

/** One recoverable Workspace, as the Settings panel renders it. */
export interface ClosedWorkspaceEntry {
  readonly workspaceId: string
  readonly title: string
  /**
   * The Workspace's folder, shown as the panel row's hover hint. Optional
   * because the row is read through a narrow shape: a snapshot without `path`
   * still renders the entry, just without the hint.
   */
  readonly path?: string | undefined
}

/** Copy this module renders itself (the panel rows come from the registry). */
const COPY_KEYS = {
  menu: 'workspaceCloseMenu',
  confirmTitle: 'workspaceCloseConfirmTitle',
  confirmBody: 'workspaceCloseConfirmBody',
  confirmOk: 'workspaceCloseConfirmOk',
  cancel: 'workspaceCloseCancel',
  busy: 'workspaceCloseBusy',
} as const

type CopyKey = typeof COPY_KEYS[keyof typeof COPY_KEYS]
type Translate = (key: CopyKey) => string

/**
 * Titles provider published by the live instance. The Settings panel reads
 * through this because the wrapper removed every other route to the
 * un-filtered list. `undefined` while the tweak is unmounted (the panel then
 * renders nothing to recover).
 */
let entriesProvider: (() => readonly ClosedWorkspaceEntry[]) | undefined

/** Closed Workspaces that still exist in the Host registry, for the panel list. */
export function closedWorkspaceEntries(): readonly ClosedWorkspaceEntry[] {
  return entriesProvider?.() ?? []
}

/** Set by the live instance: drop one id locally, notify, then persist. */
let restoreProvider: ((workspaceId: string) => void) | undefined

/**
 * Restore one closed Workspace from the Settings panel. Applies locally first
 * and persists asynchronously — the same optimistic order the close path uses,
 * so the sidebar updates on the click instead of after a settings round-trip.
 * @param workspaceId - the Workspace to bring back.
 * @returns whether the live tweak handled it; `false` means the caller should
 * fall back to writing the settings field itself.
 */
export function restoreClosedWorkspace(workspaceId: string): boolean {
  if (restoreProvider === undefined) return false
  restoreProvider(workspaceId)
  return true
}

/** Sidebar Workspace header row (`ProjectRowItem`); `aria-expanded` excludes the ungrouped bucket's row. */
const HEADER_SELECTOR = '[role="treeitem"][aria-expanded]'
/** The row whose `...` menu is open (the host toggles this class on the row). */
const OPEN_ROW_SELECTOR = `${HEADER_SELECTOR}[class*="menuOpen"]`
/** Host `Menu` list, portaled to `document.body`. */
const MENU_SELECTOR = '[role="menu"]'
/** Host `Menu` entry button. */
const MENU_ITEM_SELECTOR = 'button[role="menuitem"]'
/** The destructive entry, matched by copy in either locale. */
const DELETE_ITEM_PATTERN = /删除|delete/i
/** React keys its internal fiber on the DOM node with this prefix. */
const FIBER_KEY_PREFIX = '__reactFiber$'
/** Cap the upward walk; the row component sits a handful of levels above the row. */
const FIBER_WALK_LIMIT = 32
/** HMR guard: survives module reloads so a re-mount tears down the stale instance. */
const GLOBAL_KEY = '__cst_workspace_close_cleanup__'
/** Marks a menu as already carrying our injected entry. */
const MENU_INJECTED_ATTR = 'data-cst-workspace-close'
/** Viewport gap the host's portal placement keeps on every side (`Menu`'s `MARGIN`). */
const MENU_VIEWPORT_MARGIN = 12

/** Minimal shape of React's internal fiber node, for the props walk only. */
interface FiberLike {
  readonly memoizedProps?: unknown
  readonly return?: FiberLike | null | undefined
}

/** The only props field the walk reads: `ProjectRowItem` memoizes `props.group.key`. */
interface FiberProps {
  readonly group?: { readonly key?: unknown } | null | undefined
}

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
 * Workspace id behind one header row: `props.group.key` is the `WorkspaceId`
 * or `UNGROUPED_KEY` (`''`, which must NOT be closable). A renamed component,
 * a recycled row, or a build without a fiber simply yields `undefined` and
 * the row is left alone.
 */
function workspaceIdOfRow(row: Element): string | undefined {
  let fiber = rootFiberOf(row)
  for (let depth = 0; fiber != null && depth < FIBER_WALK_LIMIT; depth++) {
    const key = ((fiber.memoizedProps ?? {}) as FiberProps).group?.key
    if (typeof key === 'string') return key === '' ? undefined : key
    fiber = fiber.return ?? undefined
  }
  return undefined
}

/**
 * Display title of one Workspace, mirroring the browser's own label chain
 * (`workspace.title`, then the folder basename, then the raw id): a Workspace
 * may legitimately carry a blank title, and the confirmation dialog must never
 * show a bare uuid when a human-readable name exists.
 */
function rowTitle(row: WorkspaceRowLike | undefined, fallbackId: string): string {
  if (row === undefined) return fallbackId
  const title = row.title?.trim() ?? ''
  if (title !== '') return title
  const base = (row.path ?? '').split(/[\\/]/).filter(segment => segment !== '').pop()
  return base === undefined || base === '' ? fallbackId : base
}

/** Confirmation-dialog target. */
interface CloseTarget {
  readonly workspaceId: string
  readonly title: string
}

interface DialogState {
  readonly target: CloseTarget | undefined
  readonly busy: boolean
}

/** Tiny external store bridging the injected menu entry to the React dialog. */
class CloseDialogStore {
  private state: DialogState = { target: undefined, busy: false }
  private confirmTarget: (() => Promise<void>) | undefined
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): DialogState => this.state

  private publish(next: DialogState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }

  /** Open the confirmation for one target. */
  ask(target: CloseTarget, confirm: () => Promise<void>): void {
    this.confirmTarget = confirm
    this.publish({ target, busy: false })
  }

  /** Dismiss without acting. Ignored while a close is in flight. */
  dismiss(): void {
    if (this.state.busy) return
    this.confirmTarget = undefined
    this.publish({ target: undefined, busy: false })
  }

  /** Run the confirmed action once, then close. */
  async confirm(): Promise<void> {
    const action = this.confirmTarget
    if (action === undefined || this.state.busy) return
    this.publish({ ...this.state, busy: true })
    try {
      await action()
      this.confirmTarget = undefined
      this.publish({ target: undefined, busy: false })
    } catch (error) {
      console.warn('[dsh-style-tweaks] close workspace failed:', error)
      this.publish({ ...this.state, busy: false })
    }
  }
}

/** The confirmation modal, rendered into a dedicated host element. */
function CloseDialog({ store, t }: { store: CloseDialogStore, t: Translate }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const target = state.target
  const body = t(COPY_KEYS.confirmBody).replace('{name}', target?.title ?? '')
  return createElement(
    Modal,
    {
      open: target !== undefined,
      onClose: () => { store.dismiss() },
      closeLabel: t(COPY_KEYS.cancel),
      title: t(COPY_KEYS.confirmTitle),
      footer: createElement(
        Fragment,
        null,
        createElement(
          Button,
          { variant: 'outline', disabled: state.busy, onClick: () => { store.dismiss() } },
          t(COPY_KEYS.cancel),
        ),
        createElement(
          Button,
          { variant: 'primary', disabled: state.busy, onClick: () => { void store.confirm() } },
          state.busy ? t(COPY_KEYS.busy) : t(COPY_KEYS.confirmOk),
        ),
      ),
    },
    createElement('div', null, body),
  )
}

/** One injected menu entry plus the React root holding its glyph. */
interface InjectedEntry {
  readonly menu: Element
  readonly entry: HTMLButtonElement
  readonly iconRoot: Root | undefined
}

/**
 * Build the injected menu entry by cloning the host's own destructive entry,
 * so the injected row inherits the host's live menu styling and layout
 * (CSS-module class names are hashed, so cloning beats re-creating the
 * markup). Two deliberate changes: the danger tint is stripped (closing is
 * reversible, deleting is not) and the trash glyph is replaced by a close
 * mark — the caller renders {@link IconCloseOutlineRegular} into the returned
 * `iconHost` once the entry is in the document.
 */
function buildCloseEntry(
  deleteItem: HTMLButtonElement,
  label: string,
  onActivate: () => void,
): { entry: HTMLButtonElement, iconHost: Element | undefined } {
  const entry = deleteItem.cloneNode(true) as HTMLButtonElement
  for (const className of [...entry.classList]) {
    if (/danger/i.test(className)) entry.classList.remove(className)
  }
  const spans = [...entry.querySelectorAll('span')]
  const labelSpan = spans[spans.length - 1]
  // Keep one wrapper as the icon seat: it already carries the host's own icon
  // sizing/colour class, so the replacement glyph lands pre-styled.
  const iconHost = spans.find(span => span !== labelSpan)
  for (const span of spans) {
    if (span !== labelSpan && span !== iconHost) span.remove()
  }
  if (labelSpan === undefined) entry.textContent = label
  else labelSpan.textContent = label
  if (iconHost !== undefined) {
    for (const child of [...iconHost.childNodes]) child.remove()
  }
  entry.disabled = false
  entry.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onActivate()
  })
  return { entry, iconHost }
}

/**
 * Ask the host to re-place a menu whose height this injection just changed.
 *
 * The host's portal placement derives `top` from the anchor rect and clamps it
 * into `[MARGIN, innerHeight - height - MARGIN]`, but it runs in the open
 * commit's layout effect — BEFORE this injection lands, because the
 * MutationObserver that drives us fires in a microtask. It therefore sizes the
 * card at its pre-injection height, and as it listens only for scroll/resize
 * (there is no ResizeObserver on the panel) it never re-measures: for a
 * Workspace row near the viewport bottom the injected row ends up below the
 * fold (measured: a 128px card left at top 845 in a 945px viewport, its last
 * row — "删除工作区" — cut off by 28px).
 *
 * A window `resize` is the host's own re-place trigger, and going through it
 * instead of writing `style.top` here is what makes the correction stick: the
 * coordinates live in the host's React state, so any later re-render would
 * paint a hand-written style back to the stale value.
 *
 * Dispatched only when the card actually overflows — a row with room below is
 * already placed correctly, and the common case should not broadcast an event.
 */
function refitMenuIfOverflowing(menu: Element): void {
  if (menu.getBoundingClientRect().bottom <= window.innerHeight - MENU_VIEWPORT_MARGIN) return
  window.dispatchEvent(new Event('resize'))
}

/**
 * Mount the close-workspace tweak. Returns the disposer; safe on hosts
 * without the expected Workspace service (the tweak then stays inert).
 *
 * HMR-safe: the guard lives on `window`, so a hot-reload that calls this
 * again tears down the stale instance first instead of stacking two
 * observers or two wrappers.
 */
export function setupWorkspaceClose(
  ctx: ClientContext,
  resolved: { readonly closedWorkspaces: readonly string[] },
  settings: WorkspaceCloseSettings,
): () => void {
  const previous = (window as any)[GLOBAL_KEY] as (() => void) | undefined
  if (typeof previous === 'function') {
    previous()
    ;(window as any)[GLOBAL_KEY] = undefined
  }

  // ── Host service resolution (any surprise → inert) ──────────────────────
  let service: WorkspaceServiceLike
  let source: WorkspaceSourceLike
  try {
    service = (ctx.get('workspaces') as WorkspaceServiceLike | undefined) ?? {}
    const list = service.list as WorkspaceSourceLike | undefined
    if (list === undefined
      || typeof list.getSnapshot !== 'function'
      || typeof list.subscribe !== 'function') {
      throw new Error('unexpected workspaces service shape')
    }
    source = list
  } catch {
    return () => {}
  }

  /** The un-filtered read face, retained as the ONLY "everything" entry. */
  const originalGetSnapshot = source.getSnapshot
  const originalSubscribe = source.subscribe
  const originalCreate = typeof service.create === 'function' ? service.create : undefined

  const t = ctx.locale.bind('style-tweaks') as unknown as Translate

  /**
   * Optional faces for the open-selection handoff. Both are resolved once,
   * defensively: a host without them simply keeps the selection cleared.
   */
  const sessionList = ((): SessionListLike | undefined => {
    try {
      const face = ctx.get('sessions') as { list?: unknown } | undefined
      const list = face?.list as SessionListLike | undefined
      return list !== undefined && typeof list.getSnapshot === 'function' ? list : undefined
    } catch {
      return undefined
    }
  })()
  const uiWorkspace = ((): UiWorkspaceLike | undefined => {
    try {
      const face: unknown = ctx.get('uiWorkspace')
      if (face === null || typeof face !== 'object') return undefined
      return typeof (face as UiWorkspaceLike).startSession === 'function'
        ? face as UiWorkspaceLike
        : undefined
    } catch {
      return undefined
    }
  })()

  // ── Closed-set state ───────────────────────────────────────────────────
  let closedIds: readonly string[] = resolveClosedWorkspaces(resolved.closedWorkspaces)
  let closedSet: ReadonlySet<string> = new Set(closedIds)

  /** Listeners registered through our `subscribe` wrapper (forced re-reads). */
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch (error) {
        console.warn('[dsh-style-tweaks] workspace store listener failed:', error)
      }
    }
  }

  // ── Snapshot derivation (memoized on raw snapshot + closed set) ────────
  let memoRaw: WorkspaceSnapshotLike | undefined
  let memoClosed: ReadonlySet<string> | undefined
  let memoDerived: WorkspaceSnapshotLike | undefined

  /**
   * The raw archive set plus every session owned by a closed Workspace.
   * The host's own set is never modified — this only shapes the derived
   * snapshot. De-duplicated on purpose: the host's `installArchived` compares
   * archive arrays length-first, so a repeated id would read as a change.
   * Returns the base array unchanged (same reference) when nothing is added.
   */
  const mergeClosedSessions = (
    raw: WorkspaceSnapshotLike,
    closed: ReadonlySet<string>,
  ): readonly string[] | undefined => {
    const base = raw.archivedSessionIds
    if (base === undefined) return undefined
    const merged = [...base]
    const seen = new Set(base)
    let added = false
    for (const item of raw.items) {
      if (!closed.has(item.workspaceId)) continue
      for (const sessionId of item.sessionIds ?? []) {
        if (seen.has(sessionId)) continue
        seen.add(sessionId)
        merged.push(sessionId)
        added = true
      }
    }
    return added ? merged : base
  }

  const derive = (raw: WorkspaceSnapshotLike): WorkspaceSnapshotLike => {
    if (memoRaw === raw && memoClosed === closedSet && memoDerived !== undefined) return memoDerived
    memoRaw = raw
    memoClosed = closedSet
    if (closedSet.size === 0) {
      memoDerived = raw
      return raw
    }
    const items = raw.items.filter(item => !closedSet.has(item.workspaceId))
    const archivedSessionIds = mergeClosedSessions(raw, closedSet)
    // Nothing left the list and no session was hidden (ids unknown to the
    // list): keep the snapshot identity so no consumer sees a change.
    memoDerived = items.length === raw.items.length && archivedSessionIds === raw.archivedSessionIds
      ? raw
      : { ...raw, items, archivedSessionIds }
    return memoDerived
  }

  /** The raw read, never throwing into a host caller. */
  const readRaw = (): WorkspaceSnapshotLike => originalGetSnapshot.call(source)

  /**
   * Make the host store publish an invalidation of its own.
   *
   * `notify()` only reaches listeners registered through OUR wrapper, and the
   * sidebar registers long before this tweak mounts — so a local
   * close/restore would otherwise leave the sidebar showing stale rows until
   * some unrelated change happened to re-render it (measured: the row stayed
   * put for 11 s, until the settings round-trip landed).
   *
   * `upsertView` with one row already in the list is the model's only public
   * call that ends in `invalidate()` without changing anything: same object,
   * same position, same `updatedAt`, and `committedOrder` already contains it.
   * The model then notifies every listener on the store itself, which is
   * exactly the set we cannot enumerate.
   */
  const pokeHost = (): void => {
    if (typeof source.upsertView !== 'function') return
    try {
      const row = readRaw().items[0]
      if (row !== undefined) source.upsertView(row)
    } catch (error) {
      console.warn('[dsh-style-tweaks] workspace store poke failed:', error)
    }
  }

  // ── Closed-set mutation (declared first: the wrappers close over it) ───
  function applyClosed(next: readonly string[], persist: boolean): void {
    const changed = next.length !== closedIds.length
      || next.some((id, index) => id !== closedIds[index])
    if (!changed) return
    closedIds = next
    closedSet = new Set(next)
    if (persist) {
      void settings.set('closedWorkspaces', [...next]).catch((error: unknown) => {
        console.warn('[dsh-style-tweaks] persisting closed workspaces failed:', error)
      })
    }
    notify()
    // Then make the host store notify its OWN listeners (see `pokeHost`):
    // without this the sidebar waits for an unrelated re-render.
    pokeHost()
  }

  // ── Wrappers ───────────────────────────────────────────────────────────
  const wrappedGetSnapshot = function (this: unknown): WorkspaceSnapshotLike {
    return derive(readRaw())
  }
  const wrappedSubscribe = function (this: unknown, listener: () => void): () => void {
    // Forward first: the host's own navigation reconcile rides this call.
    const unsubscribe = originalSubscribe.call(source, listener)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      unsubscribe()
    }
  }
  source.getSnapshot = wrappedGetSnapshot
  source.subscribe = wrappedSubscribe

  let wrappedCreate: ((this: unknown, input: { path: string }) => Promise<{ readonly workspaceId?: string } | undefined>) | undefined
  if (originalCreate !== undefined) {
    wrappedCreate = function (this: unknown, input: { path: string }) {
      return originalCreate.call(service, input).then((view) => {
        const id = view?.workspaceId
        // Re-adding a closed folder restores it: drop the id SYNCHRONOUSLY so
        // the picker's immediate navigation finds it in the filtered list.
        if (typeof id === 'string' && closedSet.has(id)) {
          applyClosed(closedIds.filter(candidate => candidate !== id), true)
        }
        return view
      })
    }
    service.create = wrappedCreate
  }

  /** Display title of one Workspace, read from the un-filtered list. */
  const titleOf = (workspaceId: string): string => {
    try {
      return rowTitle(readRaw().items.find(item => item.workspaceId === workspaceId), workspaceId)
    } catch {
      return workspaceId
    }
  }

  // ── Recovery list for the Settings panel (un-filtered titles) ──────────
  const provider = (): readonly ClosedWorkspaceEntry[] => {
    let raw: WorkspaceSnapshotLike
    try {
      raw = readRaw()
    } catch {
      return []
    }
    const byId = new Map(raw.items.map(item => [item.workspaceId, item]))
    const out: ClosedWorkspaceEntry[] = []
    for (const id of closedIds) {
      const row = byId.get(id)
      if (row !== undefined) out.push({ workspaceId: id, title: rowTitle(row, id), path: row.path })
    }
    return out
  }
  entriesProvider = provider

  /** Local-first restore, mirroring `closeWorkspace`'s optimistic order. */
  const restore = (workspaceId: string): void => {
    if (!closedSet.has(workspaceId)) return
    applyClosed(closedIds.filter(id => id !== workspaceId), true)
  }
  restoreProvider = restore

  /** Drop ids the Host no longer knows (a Workspace deleted elsewhere). */
  const pruneClosed = (): void => {
    let raw: WorkspaceSnapshotLike
    try {
      raw = readRaw()
    } catch {
      return
    }
    // Only a settled, non-empty list licenses pruning: an empty pending list
    // would otherwise wipe every id.
    if (raw.phase !== undefined && raw.phase !== 'ready') return
    if (raw.items.length === 0) return
    const present = new Set(raw.items.map(item => item.workspaceId))
    const kept = closedIds.filter(id => present.has(id))
    if (kept.length === closedIds.length) return
    applyClosed(kept, true)
  }

  /** Workspace that accounts for one session, read from the un-filtered list. */
  const ownerOf = (sessionId: string): string | undefined => {
    try {
      return readRaw().items.find(item => item.sessionIds?.includes(sessionId))?.workspaceId
    } catch {
      return undefined
    }
  }

  /**
   * Open a fresh session after the host cleared the selection that belonged to
   * the Workspace just closed, so the user lands on a New Session page instead
   * of the no-session empty state. `startSession` picks the target itself (the
   * most recent visible Workspace) and is a no-op when nothing is visible —
   * which is the right behavior there, so no target is ever faked.
   */
  const handOffToNewSession = (): void => {
    if (uiWorkspace === undefined) return
    // Deferred one microtask on purpose: `applyClosed` notifies synchronously
    // and the host's reconcile clears `current` inside that call, while
    // `startSession` reads `current` to choose its fallback. Running after the
    // clear is what lets the fallback (not the dead selection) decide.
    queueMicrotask(() => {
      try {
        uiWorkspace.startSession?.()
      } catch (error) {
        console.warn('[dsh-style-tweaks] opening a new session after close failed:', error)
      }
    })
  }

  const closeWorkspace = (workspaceId: string): Promise<void> => {
    if (closedSet.has(workspaceId)) return Promise.resolve()
    // Read the open selection BEFORE the set changes: once the Workspace is
    // closed the host clears it, and by then the fact is gone.
    const openSessionId = sessionList?.getSnapshot().current
    const carriesOpenSession = openSessionId !== undefined && ownerOf(openSessionId) === workspaceId
    applyClosed([...closedIds, workspaceId], true)
    if (carriesOpenSession) handOffToNewSession()
    return Promise.resolve()
  }

  // ── Settings convergence (a change that lands without a remount) ───────
  /** Set by the disposer; every queued microtask checks it before touching the DOM. */
  let disposed = false
  const unsubscribeSettings = settings.subscribe(() => {
    applyClosed(resolveClosedWorkspaces(settings.getSnapshot().value?.closedWorkspaces), false)
  })

  // ── Host-list convergence (prune ids the registry lost) ────────────────
  let pruneScheduled = false
  const schedulePrune = (): void => {
    if (pruneScheduled) return
    pruneScheduled = true
    queueMicrotask(() => {
      pruneScheduled = false
      if (disposed) return
      pruneClosed()
    })
  }
  const unsubscribeHost = originalSubscribe.call(source, () => { schedulePrune() })

  // ── Injected sidebar entry + confirmation dialog ───────────────────────
  const dialogStore = new CloseDialogStore()
  const dialogHost = document.createElement('div')
  dialogHost.setAttribute('data-cst-workspace-close-host', '')
  document.body.appendChild(dialogHost)
  const dialogRoot: Root = createRoot(dialogHost)
  dialogRoot.render(createElement(CloseDialog, { store: dialogStore, t }))

  /** The row whose menu button was last pressed — fallback when no row is marked open. */
  let lastRow: Element | null = null
  const onPointerDown = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    lastRow = target.closest(HEADER_SELECTOR)
  }
  document.addEventListener('pointerdown', onPointerDown, true)

  const injected = new Set<InjectedEntry>()

  /**
   * Drop entries whose host menu has left the document.
   *
   * The host re-renders its menus, and every re-render abandons the previous
   * element. This set is the only thing keeping that element (and the React
   * root mounted inside it) alive, so without this pass a session of opening
   * and closing menus leaks one root per menu. The attribute goes back off too:
   * if the host ever re-attaches the same node, `injectIntoMenu` must run
   * again rather than find a marked menu with an unmounted icon seat.
   */
  const evictDetached = (): void => {
    for (const item of injected) {
      if (item.entry.isConnected) continue
      item.iconRoot?.unmount()
      item.entry.remove()
      item.menu.removeAttribute(MENU_INJECTED_ATTR)
      injected.delete(item)
    }
  }

  const injectIntoMenu = (menu: Element): void => {
    if (menu.hasAttribute(MENU_INJECTED_ATTR)) return
    const items = [...menu.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR)]
    if (items.length === 0) return
    const deleteItem = items.find(item => DELETE_ITEM_PATTERN.test(item.textContent ?? ''))
    // No recognizable destructive entry: leave the host menu exactly as it is.
    if (deleteItem === undefined) return
    const row = document.querySelector(OPEN_ROW_SELECTOR) ?? lastRow
    const workspaceId = row === null ? undefined : workspaceIdOfRow(row)
    if (workspaceId === undefined) return
    menu.setAttribute(MENU_INJECTED_ATTR, '')
    const { entry, iconHost } = buildCloseEntry(deleteItem, t(COPY_KEYS.menu), () => {
      // Close the host menu by toggling its own anchor button. Dispatching a
      // bubbling Escape also reached every other overlay listening for it —
      // measured: it closed the Settings dialog sitting behind the menu.
      // (`closeOnPointerLeave` stays the backstop when the anchor is gone.)
      row?.querySelector<HTMLButtonElement>('button')?.click()
      dialogStore.ask({ workspaceId, title: titleOf(workspaceId) }, () => closeWorkspace(workspaceId))
    })
    deleteItem.parentElement?.insertBefore(entry, deleteItem)
    // Render the glyph only now that the entry is in the document: the icon
    // seat is a cloned node, and mounting a root on a detached element buys
    // nothing.
    const iconRoot = iconHost === undefined ? undefined : createRoot(iconHost)
    iconRoot?.render(createElement(IconCloseOutlineRegular))
    // Our row is in the document now, so the card is at its final height: let
    // the host re-run its own placement against it (see above).
    refitMenuIfOverflowing(menu)
    injected.add({ menu, entry, iconRoot })
  }

  const syncMenus = (): void => {
    evictDetached()
    const live = new Set<Element>()
    for (const item of injected) live.add(item.menu)
    for (const menu of document.querySelectorAll(MENU_SELECTOR)) {
      if (!menu.isConnected) continue
      // A live tracked entry is the authority, not the marker: a host re-render
      // can rebuild the menu's item list and drop our cloned row while the menu
      // element itself survives, which would leave the marker set with nothing
      // behind it and the entry gone for good. Clearing the marker makes
      // `injectIntoMenu` run again; `live` keeps it to one injection per pass.
      if (live.has(menu)) continue
      menu.removeAttribute(MENU_INJECTED_ATTR)
      injectIntoMenu(menu)
      if (menu.hasAttribute(MENU_INJECTED_ATTR)) live.add(menu)
    }
  }

  let syncScheduled = false
  const scheduleSync = (): void => {
    if (syncScheduled) return
    syncScheduled = true
    queueMicrotask(() => {
      syncScheduled = false
      // Teardown drains the observer, but a microtask already queued when the
      // disposer ran would still inject our entry into every open menu — with
      // no disposer left to take it back out.
      if (disposed) return
      syncMenus()
    })
  }

  const observer = new MutationObserver((records) => {
    // The menus are the only thing `syncMenus` reads. Without the gate, a
    // streaming answer would run a document-wide `[role="menu"]` sweep on every
    // frame for a menu that is not open.
    if (touchesScope(records, MENU_SELECTOR)) scheduleSync()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  syncMenus()
  // Startup pass: an id whose Workspace was deleted while the tweak was off
  // must not linger (the prune itself waits for a settled, non-empty list).
  schedulePrune()

  // ── Teardown ───────────────────────────────────────────────────────────
  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    // Whether our read face differs from the host's own right now. Captured
    // up front: closing never mutates `closedSet`, so this is exactly what
    // the poke below must reflect — and with an empty set the wrapper
    // already returns the raw snapshot object, so no poke is needed.
    const filtering = closedSet.size > 0
    observer.disconnect()
    document.removeEventListener('pointerdown', onPointerDown, true)
    unsubscribeSettings()
    unsubscribeHost()
    for (const item of injected) {
      item.iconRoot?.unmount()
      item.entry.remove()
    }
    injected.clear()
    dialogRoot.unmount()
    dialogHost.remove()
    if (entriesProvider === provider) entriesProvider = undefined
    if (restoreProvider === restore) restoreProvider = undefined
    // Only unwind our own wrappers: another plugin may have wrapped after us.
    if (source.getSnapshot === wrappedGetSnapshot) source.getSnapshot = originalGetSnapshot
    if (source.subscribe === wrappedSubscribe) source.subscribe = originalSubscribe
    if (wrappedCreate !== undefined && service.create === wrappedCreate) service.create = originalCreate
    // Wrappers are gone, so poking the real listeners makes every consumer
    // (React hooks, the host's navigation reconcile) re-read the full list.
    notify()
    // `notify()` only reaches listeners registered through OUR wrapper, and the
    // sidebar registered long before this tweak mounted — so unwinding the
    // wrappers is not enough on its own. Poke the store so every real listener
    // re-reads the now-unfiltered list. Without this, toggling the feature off
    // in Settings leaves the closed Workspaces hidden until an unrelated
    // re-render (the settings dialog closing) happens to refresh the sidebar.
    if (filtering) pokeHost()
    listeners.clear()
    memoRaw = undefined
    memoClosed = undefined
    memoDerived = undefined
    if ((window as any)[GLOBAL_KEY] === cleanup) (window as any)[GLOBAL_KEY] = undefined
  }

  ;(window as any)[GLOBAL_KEY] = cleanup
  // Symmetric with `cleanup`: mounting installs the filtering read face, but
  // the sidebar is already subscribed to the store itself, so it has to be
  // told to re-read — only when the filter actually changes the read face.
  // With an empty closed set the wrapper returns the raw snapshot object
  // unchanged, so nobody needs telling and a poke would just invalidate the
  // store for nothing (mount happens on every unrelated settings change).
  if (closedSet.size > 0) pokeHost()
  return cleanup
}
