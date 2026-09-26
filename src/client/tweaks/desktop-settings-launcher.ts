/**
 * dsh-style-tweaks — Desktop-only external Settings launcher.
 *
 * Desktop's account menu occupies the single `settings.launcher` slot. Its
 * native Settings action therefore lives inside the portalled More menu and
 * there is no public `openSettings` callback for a footer action to call. This
 * module keeps the account menu intact, places a small gear beside it, and
 * uses a short-lived DOM bridge to activate the native menu item. No Electron
 * main/preload API and no private React tree walking is involved.
 *
 * The bridge is deliberately defensive: Desktop builds and CSS module hashes
 * can change, so every structural match is checked and a failed match falls
 * back to the untouched native More menu.
 */

import { touchesScope } from '../mutation-scope.ts'
import { claimStyleNode, releaseStyleNode } from '../style-node.ts'

const LAUNCHER_ATTR = 'data-cst-desktop-settings-launcher'
const AREA_ATTR = 'data-cst-desktop-settings-area'
const ACCOUNT_ATTR = 'data-cst-desktop-settings-account'
const NATIVE_ITEM_ATTR = 'data-cst-desktop-settings-native-item'
const NATIVE_WRAP_ATTR = 'data-cst-desktop-settings-native-wrap'
const NATIVE_ICON_ATTR = 'data-cst-desktop-settings-native-icon'
const PENDING_MENU_ATTR = 'data-cst-desktop-settings-menu-pending'
const STYLE_ID = 'cst-desktop-settings-launcher'
const CLEANUP_KEY = '__cst_desktop_settings_launcher_cleanup__'
const BRIDGE_TIMEOUT_MS = 1_500
const BRIDGE_RETRY_MS = 50

const ACCOUNT_AREA_SELECTOR = '[class*="_settingsArea"]'
const ACCOUNT_TRIGGER_SELECTOR = 'button[aria-haspopup="menu"]'
const NATIVE_ITEM_SELECTOR = 'button[role="menuitem"]'
const NATIVE_LABEL_SELECTOR = '[class*="_itemLabel"]'
/**
 * The regions the observer's callback reads, as one `touchesScope` selector
 * list: the account area (trigger, its anchor/root/container ancestors, and the
 * gear button injected into the container) and the portalled `[role="menu"]`
 * panels. Every node `accountContext`, `findAccountMenu`, `ensureButton` and
 * `processMenu` touches is inside one of the two.
 */
const ACCOUNT_SCOPE = `${ACCOUNT_AREA_SELECTOR},[role="menu"]`

const NATIVE_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" stroke="currentColor" stroke-width="1.3"><path d="M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z" stroke="currentColor"/><path d="M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z" stroke="currentColor" stroke-miterlimit="10"/></svg>'

const STYLE_TEXT = `
[data-cst-desktop-settings-area] {
  display: flex !important;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 4px;
}

[data-cst-desktop-settings-account] {
  flex: 1 1 auto;
  min-width: 0;
}

[${LAUNCHER_ATTR}] {
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-primary);
  background: transparent;
  cursor: pointer;
  font: inherit;
}

[${LAUNCHER_ATTR}]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

[${LAUNCHER_ATTR}]:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

[${LAUNCHER_ATTR}][hidden] {
  display: none;
}

[${LAUNCHER_ATTR}] svg {
  display: block;
  width: 16px;
  height: 16px;
}

[${NATIVE_WRAP_ATTR}] {
  display: none !important;
}

html[${PENDING_MENU_ATTR}] [role="menu"] > [role="presentation"] > :first-child {
  display: none !important;
}
`

interface AccountContext {
  container: HTMLElement
  root: HTMLElement
  trigger: HTMLButtonElement
}

interface HiddenNativeItem {
  item: HTMLButtonElement
  wrapper: HTMLElement
  display: string
  disabled: boolean
  ariaHidden: string | null
  tabIndex: string | null
}

interface PendingBridge {
  trigger: HTMLButtonElement
  knownMenus: Set<Element>
  deadline: number
  timer: number | undefined
}

type Cleanup = () => void

function getGlobalCleanup(): Cleanup | undefined {
  return (window as unknown as Record<string, unknown>)[CLEANUP_KEY] as Cleanup | undefined
}

function setGlobalCleanup(cleanup: Cleanup | undefined): void {
  const target = window as unknown as Record<string, unknown>
  if (cleanup === undefined) delete target[CLEANUP_KEY]
  else target[CLEANUP_KEY] = cleanup
}

function installStyles(): Cleanup {
  let style = document.querySelector<HTMLStyleElement>(`style[data-tweak-css="${STYLE_ID}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.tweak = 'cst'
    style.dataset.tweakCss = STYLE_ID
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style, STYLE_TEXT)
  return () => { releaseStyleNode(style, owner) }
}

function isDesktop(): boolean {
  return typeof globalThis !== 'undefined' && 'dshDesktop' in globalThis
}

function accountContext(): AccountContext | undefined {
  const areas = document.querySelectorAll<HTMLElement>(ACCOUNT_AREA_SELECTOR)
  for (const area of areas) {
    const trigger = area.querySelector<HTMLButtonElement>(ACCOUNT_TRIGGER_SELECTOR)
    if (trigger === null) continue
    // AccountMenu renders Menu's anchor wrapper between its root and the
    // trigger. The root is nested inside SettingsRoot's trigger row, which is
    // the flex container that owns the visible [More] row.
    const menuAnchor = trigger.parentElement
    const root = menuAnchor?.parentElement
    const container = root?.parentElement
    if (root === null || root === undefined || container === null || container === undefined) continue
    if (!area.contains(container)) continue
    return { container, root, trigger }
  }
  return undefined
}

function normalizedText(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function nativeSettingsItem(menu: HTMLElement, label: string): HTMLButtonElement | undefined {
  const wanted = label.trim()
  if (wanted === '') return undefined
  return Array.from(menu.querySelectorAll<HTMLButtonElement>(NATIVE_ITEM_SELECTOR)).find((item) => {
    const itemLabel = item.querySelector<HTMLElement>(NATIVE_LABEL_SELECTOR)
    return normalizedText(itemLabel ?? item) === wanted
  })
}

function copyNativeIcon(button: HTMLButtonElement, item: HTMLButtonElement): void {
  if (button.getAttribute(NATIVE_ICON_ATTR) !== null) return
  const source = item.querySelector('svg')
  if (source === null) return
  const icon = source.cloneNode(true) as SVGElement
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')
  button.replaceChildren(icon)
  button.setAttribute(NATIVE_ICON_ATTR, '')
}

function menuBelongsToTrigger(menu: HTMLElement, trigger: HTMLButtonElement): boolean {
  const menuRect = menu.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  if (menuRect.width <= 0 || menuRect.height <= 0) return false
  const horizontal = menuRect.left <= triggerRect.right + 32 && menuRect.right >= triggerRect.left - 32
  const above = menuRect.bottom <= triggerRect.top + 32 && menuRect.top < triggerRect.bottom
  return horizontal && above
}

function findAccountMenu(context: AccountContext, knownMenus?: Set<Element>): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]')).find((menu) => {
    if (knownMenus?.has(menu) === true) return false
    return menuBelongsToTrigger(menu, context.trigger)
  })
}

function hideNativeItem(item: HTMLButtonElement, hidden: Map<HTMLButtonElement, HiddenNativeItem>): boolean {
  const wrapper = item.parentElement
  if (!(wrapper instanceof HTMLElement)) return false
  if (hidden.has(item)) return true

  const record: HiddenNativeItem = {
    item,
    wrapper,
    display: wrapper.style.display,
    disabled: item.disabled,
    ariaHidden: item.getAttribute('aria-hidden'),
    tabIndex: item.getAttribute('tabindex'),
  }
  hidden.set(item, record)
  item.setAttribute(NATIVE_ITEM_ATTR, '')
  item.setAttribute('aria-hidden', 'true')
  item.tabIndex = -1
  // The Menu keyboard walk filters on :disabled. Temporarily re-enable the
  // detached action in activateNativeItem() so HTMLElement.click() still
  // reaches React's delegated onClick handler.
  item.disabled = true
  wrapper.setAttribute(NATIVE_WRAP_ATTR, '')
  wrapper.style.display = 'none'
  return true
}

function restoreNativeItem(record: HiddenNativeItem): void {
  if (record.wrapper.isConnected) record.wrapper.style.display = record.display
  record.wrapper.removeAttribute(NATIVE_WRAP_ATTR)
  if (!record.item.isConnected) return
  record.item.removeAttribute(NATIVE_ITEM_ATTR)
  record.item.disabled = record.disabled
  if (record.ariaHidden === null) record.item.removeAttribute('aria-hidden')
  else record.item.setAttribute('aria-hidden', record.ariaHidden)
  if (record.tabIndex === null) record.item.removeAttribute('tabindex')
  else record.item.setAttribute('tabindex', record.tabIndex)
}

function activateNativeItem(record: HiddenNativeItem): boolean {
  if (!record.item.isConnected) return false
  const wrapperDisplay = record.wrapper.style.display
  record.wrapper.style.display = ''
  record.item.disabled = false
  try {
    record.item.click()
    return true
  } catch {
    return false
  } finally {
    // The native onSelect normally unmounts the menu synchronously. If a host
    // version keeps it mounted, restore the hidden state instead of flashing a
    // duplicate Settings row back into More.
    if (record.item.isConnected) {
      record.wrapper.style.display = wrapperDisplay
      record.item.disabled = true
    }
  }
}

function updateButton(button: HTMLButtonElement, label: () => string, hint: () => string, collapsed: boolean): void {
  const accessibleLabel = label().trim() || 'Settings'
  button.setAttribute('aria-label', accessibleLabel)
  button.setAttribute('title', hint().trim() || accessibleLabel)
  button.hidden = collapsed
  if (collapsed) button.setAttribute('aria-hidden', 'true')
  else button.removeAttribute('aria-hidden')
}

/**
 * Mount the Desktop-only launcher. The returned disposer is safe to call more
 * than once and restores every host node it touched.
 */
export function setupDesktopSettingsLauncher(label: () => string, hint: () => string): Cleanup {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const previous = getGlobalCleanup()
  if (typeof previous === 'function') {
    previous()
    setGlobalCleanup(undefined)
  }
  if (!isDesktop()) return () => {}
  const observerTarget = document.body ?? document.documentElement
  if (observerTarget === null) return () => {}

  const removeStyles = installStyles()
  const hidden = new Map<HTMLButtonElement, HiddenNativeItem>()
  let disposed = false
  let button: HTMLButtonElement | undefined
  let currentContainer: HTMLElement | undefined
  let currentRoot: HTMLElement | undefined
  let pending: PendingBridge | undefined
  let queued = false
  let menuMarkerTimer: number | undefined
  let suppressNextAccountMarker = false

  const clearMenuMarker = (): void => {
    document.documentElement.removeAttribute(PENDING_MENU_ATTR)
    if (menuMarkerTimer !== undefined) {
      window.clearTimeout(menuMarkerTimer)
      menuMarkerTimer = undefined
    }
  }

  const markMenuPending = (): void => {
    document.documentElement.setAttribute(PENDING_MENU_ATTR, '')
    if (menuMarkerTimer !== undefined) window.clearTimeout(menuMarkerTimer)
    menuMarkerTimer = window.setTimeout(clearMenuMarker, 400)
  }

  const restoreHiddenItems = (): void => {
    for (const record of hidden.values()) restoreNativeItem(record)
    hidden.clear()
  }

  const clearPending = (closeMenu = false): void => {
    clearMenuMarker()
    const current = pending
    pending = undefined
    if (current?.timer !== undefined) window.clearTimeout(current.timer)
    if (closeMenu && current !== undefined && current.trigger.isConnected && current.trigger.getAttribute('aria-expanded') === 'true') {
      suppressNextAccountMarker = true
      try {
        current.trigger.click()
      } finally {
        suppressNextAccountMarker = false
        clearMenuMarker()
      }
    }
  }

  const removeGear = (): void => {
    button?.remove()
    button = undefined
    currentContainer?.removeAttribute(AREA_ATTR)
    currentRoot?.removeAttribute(ACCOUNT_ATTR)
    currentContainer = undefined
    currentRoot = undefined
  }

  const processMenu = (menu: HTMLElement, trigger: HTMLButtonElement): HTMLButtonElement | undefined => {
    if (!menuBelongsToTrigger(menu, trigger)) return undefined
    const item = nativeSettingsItem(menu, label())
    if (item === undefined) return undefined
    if (button !== undefined) copyNativeIcon(button, item)
    hideNativeItem(item, hidden)
    clearMenuMarker()
    return item
  }

  const tryPending = (): void => {
    if (disposed || pending === undefined) return
    const current = pending
    if (Date.now() >= current.deadline) {
      clearPending(true)
      return
    }
    const context = accountContext()
    const menu = context === undefined ? undefined : findAccountMenu({ ...context, trigger: current.trigger }, current.knownMenus)
    if (context !== undefined && menu !== undefined) {
      const item = processMenu(menu, current.trigger)
      const record = item === undefined ? undefined : hidden.get(item)
      if (record !== undefined && activateNativeItem(record)) {
        clearPending()
        return
      }
    }
    current.timer = window.setTimeout(tryPending, BRIDGE_RETRY_MS)
  }

  const ensureButton = (context: AccountContext): void => {
    if (currentContainer !== context.container || currentRoot !== context.root) {
      restoreHiddenItems()
      removeGear()
      currentContainer = context.container
      currentRoot = context.root
      currentContainer.setAttribute(AREA_ATTR, '')
      currentRoot.setAttribute(ACCOUNT_ATTR, '')
    }

    if (button === undefined || !button.isConnected) {
      button = document.createElement('button')
      button.type = 'button'
      button.setAttribute(LAUNCHER_ATTR, '')
      button.innerHTML = NATIVE_ICON_SVG
      button.addEventListener('click', onLauncherClick)
      currentRoot.after(button)
    } else if (button.parentElement !== currentContainer) {
      currentRoot.after(button)
    }
    updateButton(button, label, hint, context.trigger.dataset.collapsed === 'true')
  }

  const sync = (): void => {
    if (disposed) return
    for (const item of hidden.keys()) {
      if (!item.isConnected) hidden.delete(item)
    }
    const context = accountContext()
    if (context === undefined) {
      restoreHiddenItems()
      removeGear()
      return
    }
    ensureButton(context)
    if (context.trigger.getAttribute('aria-expanded') === 'true') {
      const menu = findAccountMenu(context)
      if (menu !== undefined) processMenu(menu, context.trigger)
    }
  }

  const onAccountTriggerClick = (event: Event): void => {
    if (suppressNextAccountMarker) return
    const target = event.target
    if (!(target instanceof Element)) return
    const trigger = target.closest<HTMLButtonElement>(ACCOUNT_TRIGGER_SELECTOR)
    if (trigger === null) return
    const context = accountContext()
    if (context?.trigger !== trigger) return
    // Capture runs before React's delegated onClick, so the first paint of
    // the portalled menu already has its native Settings row suppressed.
    markMenuPending()
  }

  document.addEventListener('click', onAccountTriggerClick, true)

  const onLauncherClick = (): void => {
    if (disposed) return
    const context = accountContext()
    if (context === undefined) return

    // If pointer-down did not already close an open More menu, use its
    // currently mounted native item directly. This avoids toggling it shut.
    const existing = findAccountMenu(context)
    if (existing !== undefined) {
      const item = processMenu(existing, context.trigger)
      const record = item === undefined ? undefined : hidden.get(item)
      if (record !== undefined && activateNativeItem(record)) return
    }

    clearPending()
    pending = {
      trigger: context.trigger,
      knownMenus: new Set(document.querySelectorAll('[role="menu"]')),
      deadline: Date.now() + BRIDGE_TIMEOUT_MS,
      timer: undefined,
    }
    context.trigger.click()
    sync()
    pending.timer = window.setTimeout(tryPending, 0)
  }

  const observer = new MutationObserver((records) => {
    // Both readers (`accountContext`, `findAccountMenu`) are scoped to the
    // account settings area and the portal menus, so a batch that touches
    // neither cannot change what `sync`/`tryPending` would do. Without this the
    // `class` / `style` filter would schedule the pair for any restyle anywhere
    // in the document.
    if (!touchesScope(records, ACCOUNT_SCOPE)) return
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      sync()
      tryPending()
    })
  })

  observer.observe(observerTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'data-collapsed', 'class', 'style'],
  })
  sync()

  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    document.removeEventListener('click', onAccountTriggerClick, true)
    clearPending()
    restoreHiddenItems()
    removeGear()
    removeStyles()
    // Identity-checked: `disposed` guards re-entry of THIS closure, but only
    // the ownership test stops a late cleanup from deleting the marker a
    // successor instance published.
    if (getGlobalCleanup() === cleanup) setGlobalCleanup(undefined)
  }
  setGlobalCleanup(cleanup)
  return cleanup
}
