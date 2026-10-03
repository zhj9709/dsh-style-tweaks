/**
 * dsh-style-tweaks — locate-current-session tweak.
 *
 * Adds a "locate current session" button to the left of the native search
 * button in the sidebar's "工作区" (workspaces) section header. Clicking it:
 *
 *   1. Reads the current session's **id** off the conversation header.
 *   2. Scrolls its sidebar row to the center of the sidebar's visible area,
 *      when that row is mounted.
 *   3. Otherwise resolves the session's workspace from the app stores and
 *      opens that workspace's group — including the "show more" overflow —
 *      until the row exists, then scrolls it to the center. The user can
 *      then confirm "this is where I am" without hunting for it.
 *
 * ## Why DOM patching
 *
 * DSH's `sidebar.workspaces` slot is a single owner (the workspace browser)
 * and exposes no public sub-slot for the section header row. There is also
 * no plugin-callable service that scrolls a sidebar row into view. The
 * plugin therefore decorates the DOM from outside, exactly the way
 * `project-running-indicator.ts` decorates project header rows.
 *
 * Stable anchors (CSS-Modules hashes rotate per build):
 *   • Native search button: the `searchButton` class fragment first, with
 *     the localized `aria-label` (locale service, `workspace` ns, key
 *     `search.sessions.aria`) only as a fallback for a build that renames
 *     the fragment.
 *   • Breadcrumb: the same order (`crumbs` fragment; label fallback from
 *     `conversation` ns, key `session.hierarchy`). It is both where the
 *     title fallback is read and the entry point for the id walk below.
 *   • Current session id: the `sessionId` prop the conversation header
 *     memoizes, read off the fiber chain starting at that breadcrumb nav
 *     (see `headerSessionId`).
 *   • Selected session row: `[role="treeitem"][aria-selected="true"]`
 *     (ARIA `aria-selected` is part of the WAI-ARIA tree pattern, DSH
 *     uses it to mark the active row.)
 *   • Session rows: `props.node.id`, which their `SessionNodeItem` memoizes —
 *     the same identity the header carries, so a row is matched by id rather
 *     than by whatever label it renders.
 *   • Workspace group container: closest element whose class attribute
 *     contains the substring `groupSection` (a semantic fragment DSH
 *     keeps even when its hashed prefix changes).
 *   • Workspace header row: `[role="treeitem"][aria-expanded]` inside the
 *     same group container, identified by the `WorkspaceId` its
 *     `ProjectRowItem` memoizes (`props.group.key`, read off the fiber
 *     chain) — never by its visible label, which two Workspaces may share
 *     when their directories are both named e.g. `pi-web`.
 *   • Search **slot**: `div[class*="searchSlot"]`, the button's only legal
 *     home. Required, not inferred — see {@link SEARCH_SLOT_SELECTOR} for
 *     why the collapsed rail's own search button must be refused.
 *
 * ## Lifecycle
 *
 * `setupLocateCurrentSession` returns a disposer that removes the button
 * and disconnects the observer. The caller in `index.tsx` mounts/unmounts
 * it on every settings change, exactly like the other JS-level tweaks —
 * disabling the toggle in Settings causes the button to disappear with no
 * page refresh.
 *
 * @module dsh-style-tweaks/client/tweaks/locate-current-session
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { touchesScope } from '../mutation-scope.ts'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

/** App-side store shapes consumed via `ctx.get('sessions' | 'workspaces').list`. */
interface SessionListShape {
  getSnapshot(): { byId: Record<string, { title?: string } | undefined> }
}
interface WorkspaceListShape {
  getSnapshot(): { items: ReadonlyArray<{ workspaceId: string, title: string, sessionIds: readonly string[] }> }
}



/** Stable hook for the currently selected session row. */
const SELECTED_SESSION_SELECTOR = '[role="treeitem"][aria-selected="true"]'

/**
 * Class fragment selector for the workspace group container. DSH marks
 * each workspace's group block with a class whose name contains
 * `groupSection`; the rest of the class name is a CSS-Modules hash.
 * Attribute-substring matching is more durable than a fixed-class match.
 */
const GROUP_SELECTOR = '[class*="groupSection"]'

/** Stable hook for a workspace header row inside the group. */
const PROJECT_ROW_SELECTOR = '[role="treeitem"][aria-expanded]'

/**
 * Translate functions bound to DSH's locale namespaces, resolved once at
 * setup via `ctx.locale.bind(ns)`. The bound `t` reads the active locale at
 * every call, so anchor strings follow live language switches without
 * rebinding. Undefined when the locale service is unavailable (host build
 * without it) — callers then fall back to structural anchors.
 */
type Translate = (key: string) => string
let tWorkspace: Translate | undefined
let tConversation: Translate | undefined

/**
 * The localized aria-label DSH paints on the sidebar search button
 * (namespace `workspace`, key `search.sessions.aria`: zh `搜索会话`,
 * en `Search sessions`). Read as the FALLBACK anchor only: the label
 * matches while DSH keeps painting that key's value on that button, and a
 * label is a value several buttons may share (the sidebar search, a
 * picker's search), where the class fragment below belongs to this one
 * button alone. DSH resolves a missing key to the key itself rather than
 * to `undefined`, so a label that stops resolving degrades to a query
 * that silently matches nothing instead of reporting anything.
 */
function searchButtonLabel(): string | undefined {
  return tWorkspace?.('search.sessions.aria')
}

/**
 * The localized aria-label of the breadcrumb nav that carries the current
 * session title (namespace `conversation`, key `session.hierarchy`). Same
 * fallback-only role as {@link searchButtonLabel}.
 */
function breadcrumbLabel(): string | undefined {
  return tConversation?.('session.hierarchy')
}

/** Primary anchor for the sidebar search button: the class fragment
 * `searchButton` survives builds (CSS-Modules names are `<hash>_<semantic>`
 * and only the hash rotates), so a substring match is build-durable where
 * the full class is not — and unlike an aria-label it never depends on the
 * active language. */
const SEARCH_BUTTON_SELECTOR = 'button[class*="searchButton"]'

/**
 * The container the button has to land in: the section header's `searchSlot`
 * (same CSS-Modules reasoning as {@link SEARCH_BUTTON_SELECTOR} — the
 * semantic suffix survives, the hash prefix rotates).
 *
 * Matching `searchButton` alone does **not** identify the wide header. DSH
 * paints a *second* search button for the collapsed 56px rail — same
 * `searchButton` class, same `search.sessions.aria` label, icon at 18px
 * instead of 14px — but hung straight off the workspace browser's root:
 *
 *   wide: `root > sectionHeader > searchSlot > search > searchButton`
 *   rail: `root > search > searchButton`
 *
 * Two parents up from the rail's button is therefore `root`, not `searchSlot`.
 * Injecting there puts a fifth icon in the rail, and — because React only
 * removes fibers it created — the button outlives the rail's own teardown as
 * an orphan child of `root` that no later re-render clears, so it lingers
 * over the expanded sidebar until the page is reloaded. Requiring the slot
 * refuses the rail outright, which also matches what the injected CSS
 * (`…searchSlot:has(> button.cst-locate-btn)`) and the disposer assume.
 */
const SEARCH_SLOT_SELECTOR = 'div[class*="searchSlot"]'

/** Our own button, by the class `buildButton` puts on it. */
const OUR_BUTTON_SELECTOR = 'button.cst-locate-btn'

/** Primary anchor for the breadcrumb nav (`css.crumbs`), same reasoning. */
const BREADCRUMB_NAV_SELECTOR = 'nav[class*="crumbs"]'

/** Every labelled button / nav, scanned by the localized fallback. */
const LABELLED_BUTTON_SELECTOR = 'button[aria-label]'
const LABELLED_NAV_SELECTOR = 'nav[aria-label]'

/**
 * Exact-`aria-label` lookup over a pre-filtered candidate set.
 *
 * Comparing the attribute directly beats interpolating the label into a
 * selector (`button[aria-label="${label}"]`): a translation carrying a
 * quote, a bracket or a backslash would break the selector, and the value
 * would be spliced into a CSS query besides.
 */
function elementByAriaLabel<T extends Element>(candidates: string, label: string): T | null {
  for (const el of document.querySelectorAll<T>(candidates)) {
    if (el.getAttribute('aria-label') === label) return el
  }
  return null
}

/**
 * Resolve one anchor: the structural selector first, the localized
 * `aria-label` second. The fallback exists for a DSH build that renames the
 * class fragment; it is deliberately second, so the ordinary path carries
 * no translation dependency at all.
 * @param structural - build-durable class-fragment selector.
 * @param candidates - the labelled elements the fallback scans.
 * @param label - the localized aria-label, or undefined without a locale service.
 * @returns the anchor, or null when neither selector matches.
 */
function anchorElement(structural: string, candidates: string, label: string | undefined): HTMLElement | null {
  const direct = document.querySelector<HTMLElement>(structural)
  if (direct !== null) return direct
  return label === undefined ? null : elementByAriaLabel<HTMLElement>(candidates, label)
}

/**
 * Inline SVG icon for the locate button.
 *
 * A stroke-based target / crosshair glyph in the host's own 16×16 viewBox.
 * `currentColor` lets the button recolor on hover like the natives, and the
 * colour token is already right — the button, the native search button and
 * the native header icon buttons all resolve to
 * `var(--dsw-alias-label-secondary)`, verified as an identical computed
 * `rgb(97,102,107)`. What read as "darker than the others" was **weight**,
 * not colour, so the glyph is tuned against measured ink instead:
 *
 *   DSH's own `IconSearchOutlineRegular` / `IconProjectAddOutlineRegular`
 *   are the same 16-unit viewBox at `stroke-width: 1` (dsh-client-ui-
 *   primitives/lib/index.js), rendered at 14px and 16px. This button is a
 *   16px cell, so its stroke is matched to the 16px native's — `1`, not the
 *   1.1 this used to draw at, which was 26% heavier on screen than the 14px
 *   search glyph right next to it.
 *
 * The 0.85 scale is the second half of the same measurement. Ink coverage
 * (alpha summed over a 64×64 raster of each glyph) is 632 for the host's
 * search, 1224 for its add, and 970 for this one unscaled — heavier than the
 * lighter neighbour it sits beside, which is what the eye reports. At 0.85
 * it lands at 645, between the two natives, and the filled centre dot stays
 * because it is the glyph's anchor: it is what makes the mark read as a
 * target rather than a plain circle.
 */
const PIN_ICON_SVG = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none"><g transform="translate(1.2 1.2) scale(0.85)" stroke-width="1"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-linecap="round" fill="none"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" stroke-linecap="round" fill="none"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/></g></svg>'

/** CSS injected once per tweak-enable cycle; lives until the cycle disables. */
const LOCATE_CSS_ID = 'cst-locate-current-session'

const LOCATE_CSS = `
/* Injected button: visually consistent with the native search button.
 * Key styles matched from DSH's native icon buttons:
 *   - corner-shape: superellipse(1) — creates the smooth circular hover
 *     background (border-radius alone is not enough)
 *   - display: flex — native buttons use flex, not grid (granted by the
 *     searchSlot child rule below, not by the base rule)
 *   - Spacing comes from the search slot's flex gap (see the slot rule
 *     below), matching the section header's native 4px icon gap
 *
 * The display:none default is NOT a state: visibility is granted below to
 * exactly one parent — the host's searchSlot. That makes the rule structural
 * rather than conditional, so a button that ever lands anywhere else is not
 * painted and takes no space. This is the CSS half of the same invariant
 * mountButton asserts in JS (SEARCH_SLOT_SELECTOR), and it is what keeps the
 * collapsed rail clean: the host hangs its rail search block straight off the
 * workspace browser's root, so a button parented there is not a searchSlot
 * child and disappears instead of becoming a stray icon in the 56px rail. The
 * JS guard stops such a button from being created; this rule guarantees the
 * outcome even if one is — React will not remove a node it did not create, so
 * a stray would otherwise outlive the state that produced it and survive
 * until the next page load. */
button.cst-locate-btn {
  flex: none;
  display: none;
  place-items: center;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  corner-shape: superellipse(1);
  background: transparent;
  color: var(--dsw-alias-label-secondary, currentColor);
  cursor: pointer;
  position: relative;
  z-index: 0;
  transition: background-color .15s ease, color .15s ease;
}
div[class*="searchSlot"] > button.cst-locate-btn {
  display: flex;
}
button.cst-locate-btn > svg {
  width: 16px;
  height: 16px;
  display: block;
}
button.cst-locate-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.06));
  color: var(--dsw-alias-label-primary, currentColor);
}
button.cst-locate-btn:disabled {
  opacity: .35;
  cursor: default;
}

/* Hover tooltip bubble, mirrored from DSH's own Tooltip primitive
 * (ui-primitives/src/Tooltip.module.css): fixed-position span, theme
 * tokens, 150ms fade-in. Kept as plain CSS so the injected button —
 * which lives outside React — renders the exact same visual. */
.cst-locate-tooltip {
  position: fixed;
  z-index: 100;
  width: max-content;
  max-width: 50vw;
  padding: 3px 7px;
  border-radius: 8px;
  background: var(--dsw-alias-tooltip-bg, rgba(0, 0, 0, 0.85));
  color: var(--dsw-static-neutral-bluish-00, #fff);
  font-size: 13px;
  line-height: 20px;
  white-space: pre-line;
  overflow-wrap: break-word;
  pointer-events: none;
  animation: cst-tooltip-in 150ms var(--ds-ease-in-out, ease-in-out);
}
.cst-locate-tooltip[data-side='bottom'] {
  transform: translateX(-50%);
}
.cst-locate-tooltip[data-side='top'] {
  transform: translate(-50%, -100%);
}
@keyframes cst-tooltip-in {
  from { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cst-locate-tooltip {
    animation: none;
  }
}
/* The locate button is mounted as a left sibling of the search container
 * inside the search slot. Force the slot into a right-aligned flex row
 * with the same 4px gap the section header uses, so all four icons
 * (locate / search / view options / add workspace) are evenly spaced.
 * justify-content: flex-end keeps the group pinned to the right edge
 * exactly as DSH's native layout does.
 *
 * Anchors use semantic CSS-Modules fragments ("searchSlot" survives as a
 * suffix after the per-build hash prefix), never full hashed names. */
div[class*="searchSlot"]:has(> button.cst-locate-btn) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}
/* The search container directly follows our button in the slot. */
button.cst-locate-btn + * {
  flex: none;
}

`

/**
 * Install the locate-current-session stylesheet into <head>. Idempotent: a
 * second call returns no-op (the existing <style> is reused). The caller
 * keeps the disposer alive while the tweak is enabled and disposes it when
 * the user disables the tweak.
 */
export function injectLocateCurrentSessionStyles(): () => void {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${LOCATE_CSS_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = LOCATE_CSS_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, LOCATE_CSS)
  return () => { releaseStyleNode(style, owner) }
}

/**
 * The breadcrumb nav carrying the current session's lineage, resolved
 * structurally first and through its localized `aria-label` only as a
 * fallback — see {@link anchorElement}.
 */
function breadcrumbNav(): HTMLElement | null {
  return anchorElement(BREADCRUMB_NAV_SELECTOR, LABELLED_NAV_SELECTOR, breadcrumbLabel())
}

/**
 * The id of the conversation on screen, read from the conversation header's
 * own `sessionId` prop. Every header component between the breadcrumb nav and
 * the app frame memoizes it (`ConversationSessionHeader`, `ConversationHeader`,
 * `ConversationRoot`), so the nearest one walking up belongs to the session
 * whose header this is — the same identity the sidebar row carries as
 * `props.node.id`, which is what lets a row be found by id.
 *
 * This is the anchor that replaced reading the title: a crumb is a *label*
 * (two sessions may share one, and a session with no recorded ancestry is
 * painted as its raw id instead of a title), while the id is what the sidebar
 * and the session store both key on.
 *
 * Undefined when no session is open (no header) or the props are unavailable;
 * {@link currentSessionId} then falls back to the title.
 */
function headerSessionId(): string | undefined {
  const nav = breadcrumbNav()
  if (nav === null) return undefined
  return readUpFiberChain(nav, (props) => {
    const id = props.sessionId
    return typeof id === 'string' ? id : undefined
  })
}

/**
 * Read the current session's title from the top breadcrumb — the fallback
 * path, for a build whose header does not hand us an id.
 *
 * Through 0.1.6 the current crumb was a `button[disabled]` (DSH disables the
 * current crumb so it cannot be re-entered as a navigation target). From
 * 0.1.7-alpha.1 onward it is a plain `<span class="…crumbCurrent">`: a button
 * there subtracts itself from the desktop window's drag band, which would
 * leave the title inert for dragging too (harness 92101e1a5b). Both shapes
 * are read, the span first, because that is what current builds paint.
 * @returns the trimmed title text, or null when no session is open.
 */
function readCurrentSessionTitle(): string | null {
  const nav = breadcrumbNav()
  const crumb = nav?.querySelector<HTMLElement>('[class*="crumbCurrent"]')
    ?? nav?.querySelector<HTMLButtonElement>('button[disabled]')
    ?? null
  const text = crumb?.textContent?.trim()
  return text !== undefined && text.length > 0 ? text : null
}

/** Stable hook for one session row (project header rows carry `aria-expanded`). */
const SESSION_ROW_SELECTOR = '[role="treeitem"]:not([aria-expanded])'

/**
 * Everything the observer's callback reads, as one `touchesScope` selector
 * list: the sidebar's rows (both kinds of `treeitem` — the `aria-selected`
 * attribute that drives the button's enabled state lives on a session row, the
 * `aria-expanded` that reveals one on a project row), the search slot the
 * button is injected beside, the conversation header the session id is read
 * from, and the injected button itself so that churn around it (the host
 * rebuilding the slot) still re-syncs once it is mounted.
 *
 * The structural fragments here are the same anchors `anchorElement` resolves,
 * so a DSH build that renames them breaks both together rather than silently
 * freezing the gate.
 */
const OBSERVED_SCOPE = `[role="treeitem"],${SEARCH_BUTTON_SELECTOR},${BREADCRUMB_NAV_SELECTOR},button.cst-locate-btn`

/**
 * Find the sidebar treeitem rendering the given session inside one group,
 * matched by the id its row memoizes ({@link sessionIdOfRow}) rather than by
 * its label: two sessions may share a title, and the row appends a relative
 * time ("1天" / "20小时") to whatever it shows. Scoped to the group the
 * session's workspace resolved to, since a group renders only its own rows.
 *
 * Returns null when the group is collapsed (`aria-expanded="false"` — DSH then
 * renders no session rows at all) or when the row hides behind the group's
 * "show more" overflow cap.
 */
function findSessionRow(sessionId: string, group: HTMLElement): HTMLElement | null {
  if (group.querySelector<HTMLElement>(PROJECT_ROW_SELECTOR)?.getAttribute('aria-expanded') !== 'true') {
    return null
  }
  for (const row of group.querySelectorAll<HTMLElement>(SESSION_ROW_SELECTOR)) {
    if (sessionIdOfRow(row) === sessionId) return row
  }
  return null
}

/**
 * The sidebar row DSH itself marks as the current session, when it really is
 * the session we are looking for. The `aria-selected` marker is what makes
 * this the O(1) fast path; the id check is what keeps it honest — a marker
 * left on another row is not a hit.
 */
function activeSessionRow(sessionId: string): HTMLElement | null {
  const row = document.querySelector<HTMLElement>(SELECTED_SESSION_SELECTOR)
  return row !== null && sessionIdOfRow(row) === sessionId ? row : null
}

/**
 * The session id behind a title, via `ctx.get('sessions').list.byId`
 * (id → {title}). Only the title fallback needs this — the id path already
 * holds the identity and skips both the store and the ambiguity. A title two
 * sessions share resolves to whichever comes first, which is the best a
 * title-keyed lookup can do.
 */
function sessionIdByTitle(title: string, sessionList: SessionListShape | undefined): string | null {
  if (sessionList === undefined) return null
  for (const [id, summary] of Object.entries(sessionList.getSnapshot().byId)) {
    if (summary?.title === title) return id
  }
  return null
}

/**
 * The session the user is looking at, as an **id**: the conversation header's
 * own prop first ({@link headerSessionId}), the breadcrumb title resolved
 * through the session store second. Null when no session is open at all —
 * which is also what disables the button.
 */
function currentSessionId(sessionList: SessionListShape | undefined): string | null {
  const direct = headerSessionId()
  if (direct !== undefined) return direct
  const title = readCurrentSessionTitle()
  return title === null ? null : sessionIdByTitle(title, sessionList)
}

/**
 * Resolve the **workspace id** owning a session, from
 * `ctx.get('workspaces').list.items[*].sessionIds`. Matched by id rather than
 * by searching the sidebar for a label, because `WorkspaceView.title` defaults
 * to the directory basename: two Workspaces under different parents can share
 * one (the Host only rejects a colliding *rename*, `workspace/name-conflict`),
 * and a label-keyed search then opens whichever of the two comes first.
 *
 * Returns null when the store is unavailable or the session is in no workspace
 * at all (ungrouped / archived) — there is nothing for the sidebar to reveal
 * then.
 */
function workspaceOf(sessionId: string, workspaceList: WorkspaceListShape | undefined): string | null {
  if (workspaceList === undefined) return null
  for (const ws of workspaceList.getSnapshot().items) {
    if (ws.sessionIds.includes(sessionId)) return ws.workspaceId
  }
  return null
}

/** Minimal shape of React's internal fiber node, for the props walks only. */
interface FiberLike {
  readonly memoizedProps?: unknown
  readonly return?: FiberLike | null | undefined
}

/** Component props, as far as the two identity walks below need them. */
interface FiberProps {
  readonly sessionId?: unknown
  readonly node?: { readonly id?: unknown } | null
  readonly group?: { readonly key?: unknown } | null
}

/** React keys its internal fiber on the DOM node with this prefix. */
const FIBER_KEY_PREFIX = '__reactFiber$'
/** Cap the upward walk; every component read here sits a handful of levels above its DOM node. */
const FIBER_WALK_LIMIT = 32
/** Node element → its (stable) React fiber key. Cached because `Object.keys` allocates. */
const fiberKeys = new WeakMap<Element, string>()

/** Root fiber of one element, or undefined when React did not attach one. */
function rootFiberOf(el: Element): FiberLike | undefined {
  let key = fiberKeys.get(el)
  if (key === undefined) {
    key = Object.keys(el).find(candidate => candidate.startsWith(FIBER_KEY_PREFIX))
    if (key === undefined) return undefined
    fiberKeys.set(el, key)
  }
  return (el as unknown as Record<string, FiberLike | undefined>)[key]
}

/**
 * Walk up from an element to the nearest fiber whose props satisfy `read`.
 * Deliberately forgiving, the same way `project-running-indicator.ts` reads
 * rows: a missing fiber, a renamed component or a recycled node all read as
 * `undefined`, and the caller then finds nothing rather than the wrong thing.
 */
function readUpFiberChain<T>(el: Element, read: (props: FiberProps) => T | undefined): T | undefined {
  let fiber = rootFiberOf(el)
  for (let depth = 0; fiber != null && depth < FIBER_WALK_LIMIT; depth++) {
    const value = read((fiber.memoizedProps ?? {}) as FiberProps)
    if (value !== undefined) return value
    fiber = fiber.return ?? undefined
  }
  return undefined
}

/**
 * The session id behind one sidebar session row: `SessionNodeItem` memoizes
 * `props.node.id`. Undefined for a project header row, which memoizes
 * `props.group.key` instead — the two walks never read each other's rows.
 */
function sessionIdOfRow(row: Element): string | undefined {
  return readUpFiberChain(row, (props) => {
    const id = props.node?.id
    return typeof id === 'string' ? id : undefined
  })
}

/**
 * Group key behind one project header row: `ProjectRowItem` memoizes
 * `props.group.key`, which is the `WorkspaceId` (or `''` for the Ungrouped
 * bucket; `''` is a value, not a miss, hence the string test). Read for the
 * same reason {@link sessionIdOfRow} exists: the rendered label is not a
 * usable identity — two Workspaces may share one.
 */
function groupKeyOfRow(row: Element): string | undefined {
  return readUpFiberChain(row, (props) => {
    const key = props.group?.key
    return typeof key === 'string' ? key : undefined
  })
}

/**
 * Find the sidebar projectRow carrying the given workspace id, plus its
 * enclosing groupSection. The id comes off the row's own fiber props, so a
 * row is only ever returned when it belongs to exactly the requested
 * workspace — unlike a text comparison, which cannot tell two same-named
 * Workspaces apart.
 */
function findProjectRowByGroupKey(workspaceId: string): { group: HTMLElement, projectRow: HTMLElement } | null {
  for (const group of document.querySelectorAll<HTMLElement>(GROUP_SELECTOR)) {
    const projectRow = group.querySelector<HTMLElement>(PROJECT_ROW_SELECTOR)
    if (projectRow === null) continue
    if (groupKeyOfRow(projectRow) === workspaceId) {
      return { group, projectRow }
    }
  }
  return null
}

/**
 * Overflow presses one locate may spend, one per frame, before giving up.
 *
 * The host's overflow hands over five rows per press (and jumps to
 * "everything" once five or fewer are left), so a session past the first step
 * is not rendered until several presses have gone through. Pressing once per
 * locate is what left the button needing repeated clicks — the row appeared
 * only after enough of them, five rows at a time. Every measured reveal lands
 * a frame or two after the press that produces it, so this cap only bounds a
 * host that keeps a pressable button without ever handing the row over: 64
 * presses is 320 rows past the first step, still about a second at 60fps.
 */
const REVEAL_PRESSES = 64

/**
 * Press a group's "expand remaining sessions" overflow button when DSH
 * caps the group's rendered session rows (default 5) and hides the rest
 * behind it. The button carries `aria-expanded` matching its state and a
 * semantic `sessionOverflowButton` class fragment that survives the
 * per-build hash prefix. Nothing is pressed when the button is absent or
 * already expanded — an expanded button is the host's COLLAPSE, so pressing
 * it would fold the list instead of extending it.
 *
 * @returns Whether a press was made, i.e. whether the group still has rows it
 *   has not handed over.
 */
function pressOverflow(group: HTMLElement): boolean {
  const btn = group.querySelector<HTMLElement>(
    'button[class*="sessionOverflowButton"][aria-expanded="false"]',
  )
  if (btn === null) return false
  btn.click()
  return true
}

/**
 * Duration of the locate's own scroll, in milliseconds — the animated half of
 * the sidebar session list's animation switch (see {@link scrollRowIntoView}).
 *
 * The locate cannot use `scrollIntoView({ behavior: 'smooth' })`: on a machine
 * that reports `prefers-reduced-motion: reduce` — this one does — Chromium
 * makes that call an instant jump, and the jump is the flash the user reported.
 * Measured 2026-09-27: a "smooth" scroll of the sidebar list went 0 → 568px in
 * one frame, landing in the same frame as the row reveal, so the whole sidebar
 * teleported. This loop is the locate's own, so it runs either way — under the
 * section's master switch, which `index.tsx` folds into `animate`.
 */
const SCROLL_MS = 280

/** Ticket of the newest scroll animation; older loops stop on their next frame. */
let scrollTicket = 0

/** The nearest ancestor that can scroll vertically, or null when none can. */
function scrollableAncestor(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) return node
  }
  return null
}

/**
 * Scroll the row to the middle of its scroller.
 *
 * `animate` is the sidebar session list's animation switch, threaded in from the
 * mount ALREADY combined with that section's master switch (see
 * `setupLocateCurrentSession`). On, the scroll is driven here rather than by the
 * browser (see {@link SCROLL_MS}); off, the row is put in place in a single frame
 * with `behavior: 'instant'`, which is the switch's promise — no transition, and
 * no dependence on the platform's motion preference, which is exactly what made
 * the old `behavior: 'smooth'` call land instantly here and smoothly elsewhere.
 * Off is also what the master switch means for this button: with the custom row
 * count off, the sidebar is DSH's own and this tweak adds no motion to it.
 *
 * The animated target is re-read every frame, because the reveal that just put
 * this row in the DOM is still growing: the session-count tweak eases the rows
 * it un-hides back in over ~160ms, so the row keeps moving down while the
 * scroll runs. A target captured once — all `scrollIntoView` can do — lands
 * short by exactly that growth. The loop stops on the last frame, when the row
 * leaves the DOM, or when a newer locate takes the ticket.
 */
function scrollRowIntoView(row: HTMLElement, animate: boolean): void {
  if (!animate) {
    // Land at once, in this very task: the switch's promise is no transition,
    // and there is nothing here that needs a frame's worth of settling — the
    // reveal that produced this row has already been applied by the trim
    // (instantly, when this branch is taken), and `scrollIntoView` forces the
    // layout it measures. Deferring it to a frame would only make "instant"
    // depend on the renderer still producing frames at all.
    //
    // Deliberately reached WITHOUT looking for a scroller first. `scrollable-
    // Ancestor` reads `scrollHeight`/`clientHeight`, and each read forces a
    // synchronous layout of the sidebar; on the DEFAULT setting (the switch is
    // off) its answer is never used, because `scrollIntoView` finds the scroller
    // itself. Asking first made every locate pay a layout flush for a value it
    // threw away.
    row.scrollIntoView({ block: 'center', behavior: 'instant' })
    return
  }
  const scroller = scrollableAncestor(row)
  if (scroller === null) {
    // Nothing to drive: the row already fits, or no ancestor scrolls. Same
    // landing as above, minus the wasted search.
    row.scrollIntoView({ block: 'center', behavior: 'instant' })
    return
  }
  scrollTicket += 1
  const ticket = scrollTicket
  const start = scroller.scrollTop
  const startedAt = performance.now()
  const step = (): void => {
    if (!row.isConnected || ticket !== scrollTicket) return
    const box = scroller.getBoundingClientRect()
    const rect = row.getBoundingClientRect()
    const max = scroller.scrollHeight - scroller.clientHeight
    const target = Math.max(
      0,
      Math.min(max, scroller.scrollTop + (rect.top - box.top) - (scroller.clientHeight - rect.height) / 2),
    )
    const progress = Math.min(1, (performance.now() - startedAt) / SCROLL_MS)
    const eased = 1 - (1 - progress) ** 3
    scroller.scrollTop = start + (target - start) * eased
    if (progress < 1) window.requestAnimationFrame(step)
  }
  window.requestAnimationFrame(step)
}

/**
 * Perform the locate action. Steps:
 *   1. Read the current session id from the conversation header — the anchor
 *      that survives a sidebar rebuild, since the sidebar's own row may not
 *      exist at all while the header always does.
 *   2. Fast path: when the sidebar renders that row (DSH marks the current one
 *      `aria-selected`), scroll to it. Covers the common "workspace open, row
 *      in sight" case in O(1).
 *   3. Slow path: resolve the session's workspace from the app stores, find
 *      that workspace's projectRow in the sidebar and click it open, so DSH
 *      mounts the group's session rows on the next render.
 *   4. Scroll the row into view, pressing the group's overflow once per frame
 *      while the group caps its rows and the current session is still behind
 *      them, then scrolling whatever the last press produced.
 */
function performLocate(
  sessionList: SessionListShape | undefined,
  workspaceList: WorkspaceListShape | undefined,
  animate: boolean,
): void {
  const sessionId = currentSessionId(sessionList)
  if (sessionId === null) return
  const scroll = (row: HTMLElement): void => { scrollRowIntoView(row, animate) }

  // Fast path: the row is mounted, so the selection marker finds it.
  const mounted = activeSessionRow(sessionId)
  if (mounted !== null) {
    scroll(mounted)
    return
  }

  // Slow path: the row is not in the DOM. Resolve the owning workspace, then
  // open whatever is hiding the group's rows.
  const workspaceId = workspaceOf(sessionId, workspaceList)
  if (workspaceId === null) {
    // The session is in no workspace the sidebar lists (archived, say).
    // Nothing to reveal.
    return
  }
  const hit = findProjectRowByGroupKey(workspaceId)
  if (hit === null) return
  const { projectRow, group } = hit

  /**
   * The row we are after, or null while something still hides it.
   *
   * "Hides it" means only "has not rendered it". A row found here may be in the
   * DOM yet trimmed away by the session-count tweak (`display: none`), and
   * `scrollIntoView` on a `display: none` element scrolls nothing — so with
   * that tweak on and the row past its block, one locate can land without
   * moving the list. It is left as a recorded gap rather than patched here,
   * because the obvious patch is worse (see below).
   *
   * It is also self-correcting in the case that was actually observed: the
   * count tweak raises the block to the next configured size as soon as the
   * app marks the row `aria-selected`, and this locate's animated scroll
   * re-reads its target every frame, so it rides the row down as the block
   * grows. The instant branch has no such re-read, which is why the gap is
   * narrowest on the default setting.
   *
   * Why skipping trimmed rows is NOT the fix: a press on the host's overflow
   * only makes the HOST render more rows — it does not raise this plugin's
   * block, which moves for the `aria-selected` mark alone. A loop that treated
   * a trimmed row as "still hidden" would therefore press to its 64-press cap
   * with nothing to show for it, turning one click into 320 rows of churn.
   */
  const findRow = (): HTMLElement | null => activeSessionRow(sessionId) ?? findSessionRow(sessionId, group)

  /**
   * Press the group's "show more" overflow until the row exists, then scroll
   * it into view.
   *
   * One press per press of this button was the bug: the host hands over five
   * rows at a time, so a session past the first step stayed unrendered and the
   * user had to click locate again and again, watching the list grow five rows
   * per click. A press re-renders synchronously, so one rAF (which runs after
   * that paint) is enough to see what it produced — the loop just keeps
   * pressing while the row is missing and the group still offers rows.
   */
  const revealAndScroll = (): void => {
    let presses = 0
    const attempt = (): void => {
      const row = findRow()
      if (row !== null) {
        scroll(row)
        return
      }
      if (presses >= REVEAL_PRESSES || !pressOverflow(group)) return
      presses += 1
      requestAnimationFrame(attempt)
    }
    attempt()
  }

  if (projectRow.getAttribute('aria-expanded') === 'false') {
    // The click runs DSH's expand handler, which mounts the session rows.
    projectRow.click()
    requestAnimationFrame(revealAndScroll)
    return
  }
  // Workspace already open: scan its group by id, and fall through to the
  // overflow presses when the row is behind the group's row cap.
  const row = findSessionRow(sessionId, group)
  if (row !== null) scroll(row)
  else revealAndScroll()
}



/** Build the button element. Reused across mount calls. The click
 * handler is wired separately in `setupLocateCurrentSession` so it can
 * capture the live session/workspace store references at click time.
 *
 * We use the `title` attribute for the tooltip — this triggers the
 * browser-native tooltip which has the same black background as the
 * tooltips on DSH's other native icon buttons (search, view options,
 * add workspace). This keeps the tooltip style consistent without
 * custom CSS. */
function buildButton(): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'cst-locate-btn'
  btn.dataset.cstLocateBtn = ''
  const { label } = buttonCopy()
  btn.setAttribute('aria-label', label)
  // No `title` while enabled — the custom bubble below plays the native
  // Tooltip's role instead; a title would double up with it.
  btn.innerHTML = PIN_ICON_SVG
  attachTooltip(btn)
  return btn
}

/** Is the active DSH locale a Chinese one? Read from `<html lang>`, which
 * the locale service keeps synced to the active locale (`zh-CN`, `en`, …).
 * Used only for our own button copy — DSH's own strings go through `t`. */
function isZhLocale(): boolean {
  return (document.documentElement.lang ?? '').toLowerCase().startsWith('zh')
}

/** Localized copy for the injected button (enabled + disabled states). */
function buttonCopy(): { label: string, disabled: string } {
  return isZhLocale()
    ? { label: '定位当前会话', disabled: '请先打开一个会话' }
    : { label: 'Locate current session', disabled: 'Open a session first' }
}

/**
 * Hover tooltip, replicating DSH's native `<Tooltip>` primitive for our
 * non-React button: 500ms hover delay, `position: fixed` bubble appended
 * to `<body>` (escapes ancestor overflow clipping without a portal),
 * bottom placement with the same viewport-fit moves — horizontal slide
 * back inside near the edges, vertical flip above when there is no room
 * below. The single live bubble lives in a module variable; the button is
 * remounted by DSH on view transitions, so a shared instance survives.
 */
const TOOLTIP_DELAY_MS = 500
const EDGE_MARGIN = 12
let liveBubble: HTMLSpanElement | null = null

function hideTooltip(): void {
  liveBubble?.remove()
  liveBubble = null
}

function showTooltip(anchor: HTMLElement, text: string): void {
  hideTooltip()
  const r = anchor.getBoundingClientRect()
  const bubble = document.createElement('span')
  bubble.className = 'cst-locate-tooltip'
  bubble.setAttribute('role', 'tooltip')
  bubble.textContent = text
  bubble.dataset.side = 'bottom'
  bubble.style.left = `${r.left + r.width / 2}px`
  bubble.style.top = `${r.bottom + 8}px`
  document.body.appendChild(bubble)
  liveBubble = bubble
  // Viewport fit, same moves as DSH's fit pass.
  const b = bubble.getBoundingClientRect()
  let dx = 0
  if (b.right > window.innerWidth - EDGE_MARGIN) dx = window.innerWidth - EDGE_MARGIN - b.right
  if (b.left + dx < EDGE_MARGIN) dx = EDGE_MARGIN - b.left
  bubble.style.left = `${r.left + r.width / 2 + dx}px`
  const fitsBelow = r.bottom + 8 + b.height <= window.innerHeight - EDGE_MARGIN
  const fitsAbove = r.top - 8 - b.height >= EDGE_MARGIN
  if (!fitsBelow && fitsAbove) {
    bubble.dataset.side = 'top'
    bubble.style.top = `${r.top - 8}px`
  }
}

/**
 * Wire the tooltip triggers on a mounted button, chaining the DSH
 * semantics: hover delayed, keyboard focus immediate, either leaving
 * hides. A disabled button fires no mouse events, so the disabled hint
 * rides the `title` attribute instead (browser-native, still works).
 */
function attachTooltip(btn: HTMLButtonElement): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null }
  }
  btn.addEventListener('mouseenter', () => {
    if (btn.disabled) return
    cancel()
    timer = setTimeout(() => {
      timer = null
      // Teardown can land inside this delay: a settings publish re-mounts the
      // whole tweak, and the disposer runs `hideTooltip()` then detaches the
      // button. A bubble appended after that would never be hidden again —
      // the only thing that hides it is `mouseleave`, and a detached button
      // never fires one — so it would sit on screen for the rest of the page
      // load. The anchor's own connectivity is the cheapest identity check.
      if (!btn.isConnected) return
      showTooltip(btn, buttonCopy().label)
    }, TOOLTIP_DELAY_MS)
  })
  btn.addEventListener('mouseleave', () => { cancel(); hideTooltip() })
  btn.addEventListener('blur', () => { cancel(); hideTooltip() })
  btn.addEventListener('focus', () => {
    if (btn.disabled) return
    cancel()
    showTooltip(btn, buttonCopy().label)
  })
}

/**
 * Reflect current-session availability on the injected button.
 *   - Has a session  → enabled, aria-label stays "定位当前会话".
 *   - No session     → disabled, aria-label becomes "请先打开一个会话".
 *
 * We swap the aria-label (not `title`) when disabled because:
 *   - DSH's native icon buttons don't use `title` — they rely on
 *     aria-label only, and any tooltip layer DSH paints is keyed off
 *     aria-label.
 *   - Setting `title` would summon the browser-native tooltip, which
 *     has a different visual style from the rest of the sidebar.
 *
 * The "has session" check is {@link currentSessionId} — the conversation
 * header's own session id, NOT the sidebar's `aria-selected` row. The header
 * survives sidebar rebuilds AND survives the workspace being collapsed (the
 * selected treeitem itself is removed from the DOM in that case).
 */
function syncButtonEnabledState(btn: HTMLButtonElement, sessionList: SessionListShape | undefined): void {
  const hasSession = currentSessionId(sessionList) !== null
  const { label, disabled } = buttonCopy()
  btn.disabled = !hasSession
  if (hasSession) {
    btn.removeAttribute('data-cst-locate-disabled')
    btn.setAttribute('aria-label', label)
    // Enabled: the custom hover bubble carries the hint; a title would
    // summon the browser tooltip on top of it.
    btn.removeAttribute('title')
  } else {
    btn.dataset.cstLocateDisabled = ''
    btn.setAttribute('aria-label', disabled)
    // Disabled buttons fire no mouse events, so the custom bubble can't
    // trigger — fall back to the browser-native title tooltip.
    btn.setAttribute('title', disabled)
  }
}

/**
 * Whether a mutation batch took a locate button out of the document — the
 * host unmounting the whole `searchSlot` takes the button with it.
 *
 * That path skips the only thing that normally hides the hover bubble:
 * `mouseleave`. A removed element emits no pointer events, so a bubble
 * opened over the button (or focused via keyboard) would stay on screen for
 * the rest of the page load. The keyboard route is the reachable one —
 * collapsing the sidebar by its shortcut needs no pointer movement, so
 * `mouseleave` never fires even when the mouse was never over the button.
 * @param records - The batch handed to the observer.
 * @returns Whether any removed node is, or contains, one of our buttons.
 */
function removedOurButton(records: readonly MutationRecord[]): boolean {
  for (const record of records) {
    for (const node of record.removedNodes) {
      if (!(node instanceof Element)) continue
      if (node.matches(OUR_BUTTON_SELECTOR)) return true
      if (node.querySelector(OUR_BUTTON_SELECTOR) !== null) return true
    }
  }
  return false
}

/**
 * Remove every locate button that is not sitting in a `searchSlot` — the one
 * shape the injected CSS styles, and the only one React's own teardown can
 * be expected to reason about.
 *
 * The guard in {@link mountButton} already refuses to create such a button,
 * so this is the invariant's enforcer rather than its cause: a button
 * stranded in a React-owned container is invisible to every other check
 * here (`mountButton` only looks inside the slot it is about to fill, the
 * disposer only walks the buttons this instance wired), and a host that ever
 * reshapes the header again would reproduce exactly the orphan described on
 * {@link SEARCH_SLOT_SELECTOR} — invisible in the rail, still there after the
 * sidebar comes back. Sweeping the strays on each sync turns that from a
 * page-lifetime leftover into a one-tick repair.
 *
 * Safe against a successor instance: that instance's button is always in a
 * slot, which is precisely the set this leaves alone.
 */
function pruneStrayButtons(): void {
  let pruned = false
  for (const btn of document.querySelectorAll<HTMLButtonElement>(OUR_BUTTON_SELECTOR)) {
    if (btn.parentElement?.matches(SEARCH_SLOT_SELECTOR) === true) continue
    btn.remove()
    pruned = true
  }
  // A stray is a real 28px hover target, so it can own the live bubble —
  // and a removed anchor never fires the mouseleave that would hide it.
  if (pruned) hideTooltip()
}

/**
 * Mount the injected button into the search slot, immediately to the left
 * of the native search container, or refresh the enabled state of an
 * already-mounted one. Returns the button element, or null if the search
 * button is absent (caller should retry on the next DOM mutation).
 *
 * Anchors resolve from the structural `button[class*="searchButton"]`
 * fragment (CSS-Modules hashes like `bhn1Oq_*` rotate per DSH build, the
 * semantic suffix does not), then from the localized aria-label for a build
 * that renames the fragment. From there we walk up: search container →
 * search slot. The button is inserted into the
 * slot as a left sibling of the container — NOT inside the container,
 * which is a 28px round cell with `overflow: hidden` that would both
 * clip the button and break the header's even 4px icon spacing. CSS
 * turns the slot into a right-aligned flex row with `gap: 4px`, so the
 * four header icons (locate / search / view options / add workspace)
 * share the native spacing.
 *
 * The walk is verified, not assumed: the container two levels up must be
 * the `searchSlot` itself, or nothing is mounted. The collapsed rail paints
 * a second search button of the same class and label one level shallower
 * ({@link SEARCH_SLOT_SELECTOR}), and the header simply has no locate
 * button while the sidebar is a rail — an inert tweak there, rather than an
 * icon injected into a container React will not clean up for us.
 *
 * `refresh` is the cheap path called from the observer: re-sync the existing
 * button's enabled state on every tick. The microtask coalesces a burst
 * of mutations into one re-sync.
 *
 * `sessionList` is only consulted by the enabled-state check's title fallback
 * ({@link currentSessionId}); undefined simply means that fallback is skipped.
 */
function mountButton(refresh: boolean = false, sessionList?: SessionListShape): HTMLButtonElement | null {
  // Enforce the "a locate button lives in a searchSlot, and nowhere else"
  // invariant before resolving anything, so strays are swept even on a tick
  // where no anchor resolves at all (rail mode has no slot to find).
  pruneStrayButtons()
  // Anchor: the structural class fragment first (no translation in the
  // path), the localized aria-label second — re-evaluated per call, so a
  // live locale switch re-resolves the fallback on the next observer tick.
  const searchBtn = anchorElement(SEARCH_BUTTON_SELECTOR, LABELLED_BUTTON_SELECTOR, searchButtonLabel())
  if (searchBtn === null) return null
  const searchContainer = searchBtn.parentElement
  const slot = searchContainer?.parentElement
  if (searchContainer == null || slot == null) return null
  // Not the wide section header — the collapsed rail's own search button.
  if (!slot.matches(SEARCH_SLOT_SELECTOR)) return null
  // Idempotency: refresh an existing button in place instead of re-mounting.
  const existing = slot.querySelector<HTMLButtonElement>(OUR_BUTTON_SELECTOR)
  if (existing !== null) {
    if (refresh) syncButtonEnabledState(existing, sessionList)
    return existing
  }
  const btn = buildButton()
  syncButtonEnabledState(btn, sessionList)
  slot.insertBefore(btn, searchContainer)
  return btn
}

/**
 * HMR duplicate-setup guard, the pattern every JS-level tweak here uses
 * (see `settings-nav-scroll`): a hot reload can run setup again before the
 * previous effect's cleanup ran, so run the stale cleanup first and let two
 * drivers never fight over one button.
 *
 * It is also this tweak's only external proof of life. The mount is
 * deliberately silent when the host reshapes its header — the `searchSlot`
 * assertion makes a mismatch mean "no button", not "a button in the wrong
 * place" — and an `undefined` guard is what tells a reader that the tweak
 * never mounted at all, as documented for `__cst_*_cleanup__` in README.md.
 */
const GLOBAL_KEY = '__cst_locate_current_session_cleanup__'
function getGlobalCleanup(): (() => void) | undefined {
  return (window as unknown as Record<string, unknown>)[GLOBAL_KEY] as (() => void) | undefined
}
function setGlobalCleanup(fn: (() => void) | undefined): void {
  ;(window as unknown as Record<string, unknown>)[GLOBAL_KEY] = fn
}

/**
 * Setup the live tweak. Returns a disposer that removes the button and
 * the observer. Safe to call when the search button never appears — the
 * tweak then stays inert until the next observer tick finds one.
 *
 * `animateScroll` is the "expansion animation" switch of the Sidebar session
 * list section, ALREADY combined with that section's master switch by
 * `index.tsx`: this tweak glides only while the custom row count is on AND the
 * animation switch is on. The gate is the section's, not this button's — with
 * the count feature off the sidebar is DSH's own again and this button must not
 * add motion to it. Both inputs are captured at mount (index.tsx re-mounts every
 * tweak on any settings change, and `sidebarSessionCountEnabled` is not one of
 * the exempt keys, so the capture cannot go stale). It gates only this tweak's
 * scroll; DSH's own row animations are not ours to gate.
 */
export function setupLocateCurrentSession(ctx: ClientContext, animateScroll: boolean): () => void {
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }

  // Own stylesheet lives and dies with the tweak itself, so index.tsx can
  // register this setup like any plain injector.
  const removeStyles = injectLocateCurrentSessionStyles()

  // Bind the locale namespaces the anchors need. `bind` returns a t that
  // reads the active locale on every call, so language switches propagate
  // with no rebind — the next observer tick re-resolves the aria-label
  // fallback through the same functions. The structural anchors do not need
  // this at all; without a locale service the fallback is simply skipped,
  // exactly like the store lookups below.
  try {
    const locale = (ctx as unknown as { locale?: { bind(ns: string): Translate } }).locale
    if (locale !== undefined && typeof locale.bind === 'function') {
      tWorkspace = locale.bind('workspace')
      tConversation = locale.bind('conversation')
    }
  } catch {
    tWorkspace = undefined
    tConversation = undefined
  }

  // Pull the app's own stores the same way project-running-indicator does,
  // so we can locate the current session's workspace even when its sidebar
  // group is collapsed (and therefore the session treeitem itself is not
  // in the DOM). The two store getters are typed via the project's own
  // `import type` so a host build without them still compiles.
  let sessionList: SessionListShape | undefined
  let workspaceList: WorkspaceListShape | undefined
  try {
    sessionList = (ctx.get('sessions') as { list?: unknown })?.list as SessionListShape | undefined
    workspaceList = (ctx.get('workspaces') as { list?: unknown })?.list as WorkspaceListShape | undefined
    if (sessionList === undefined || workspaceList === undefined
      || typeof sessionList.getSnapshot !== 'function'
      || typeof workspaceList.getSnapshot !== 'function') {
      throw new Error('unexpected store shape')
    }
  } catch {
    sessionList = undefined
    workspaceList = undefined
  }

  // Wire the click handler on every button we mount (including re-mounts
  // after a sidebar rebuild). The handler reads the live store snapshots
  // at click time, so session/workspace changes propagate without rebind.
  const onClick = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    performLocate(sessionList, workspaceList, animateScroll)
  }

  /** Buttons this instance wired; the disposer takes down only its own. */
  const wired = new Set<HTMLButtonElement>()

  /**
   * Bind the click handler to a button exactly once, marked by
   * `data-cst-locate-wired`. The synchronous first mount and the observer's
   * ticks both land here, and the marker is what keeps the second one from
   * binding the same element twice — a duplicate would run `performLocate`
   * twice per click and leave a listener behind on disposal.
   */
  const wire = (btn: HTMLButtonElement | null): void => {
    if (btn === null || btn.dataset.cstLocateWired !== undefined) return
    btn.addEventListener('click', onClick)
    btn.dataset.cstLocateWired = '1'
    wired.add(btn)
  }

  // Try once synchronously so the first paint already shows the button.
  wire(mountButton(false, sessionList))

  // Watch for the search button to appear / be replaced (DSH rebuilds the
  // sidebar header on width toggle, workspace switch, and other view
  // transitions). Collapsing the sidebar is the sharpest case: the whole
  // `searchSlot` — our button inside it — is unmounted, and a fresh slot is
  // mounted when it comes back, so the button is re-created rather than
  // re-found. MutationObserver coalesces a burst of changes into one
  // microtask. We also listen for attribute changes so the enabled state
  // tracks the current `aria-selected` row as the user switches sessions
  // without DSH rebuilding the tree.
  let disposed = false
  let scheduled = false
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      // A microtask already queued when the disposer ran must not re-mount.
      if (disposed) return
      // refresh=true re-syncs the existing button's enabled state on every
      // tick; mountButton falls back to a no-op mount when the button is
      // already there. The microtask coalesces the burst into one re-sync.
      wire(mountButton(true, sessionList))
    })
  }
  const observer = new MutationObserver((records) => {
    // Checked before the gate, and independently of it: a bubble anchored to
    // a button the host just unmounted has to die with it, whether or not the
    // batch is one this tweak otherwise cares about.
    if (removedOurButton(records)) hideTooltip()
    // The gate names what this tweak actually reads: the sidebar rows (whose
    // aria-selected drives the button's enabled state), the search slot it
    // injects beside, the conversation header the session id comes from, and
    // its own button once mounted. Without it the body-wide observer would
    // re-run `mountButton` on every frame of a streaming answer.
    if (!touchesScope(records, OBSERVED_SCOPE)) return
    schedule()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-expanded'] })

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    // Only clear the marker while it is still ours: a successor instance that
    // already claimed the key must keep its own guard visible.
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
    observer.disconnect()
    hideTooltip()
    removeStyles()
    // Only the buttons this instance wired: a document-wide sweep over
    // `button.cst-locate-btn` would delete a successor instance's button too.
    for (const btn of wired) {
      btn.removeEventListener('click', onClick)
      btn.remove()
    }
    wired.clear()
  }
  setGlobalCleanup(cleanup)
  return cleanup
}
