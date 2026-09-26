/**
 * dsh-style-tweaks — ownership for the plugin's injected `<style>` nodes.
 *
 * Every style injector finds-or-creates one shared `<style>` keyed by
 * `data-tweak-css`, and used to hand back a disposer that removed it
 * unconditionally. That is only safe if exactly one instance is ever live. The
 * failure this guards is an instance finding a node another instance created
 * and then having a disposer delete it out from under itself — the CSS of a
 * tweak that is demonstrably enabled silently disappears until the next reload.
 *
 * Ownership is therefore stamped on the node when an instance takes it, and
 * checked before removal, the same shape `running-status` uses for its own
 * stylesheet.
 *
 * **What that is guarding against is an ordering, and the ordering is not the
 * one you would assume.** Measured on 0.1.7-rc.2 (2026-09-26): the client-plugin
 * HMR receiver polls the bundle's mtime every 500 ms, and on a rebuild it
 * disposes the old instance *first* and applies the new one after — a
 * `MutationObserver` on `document.head` records `["removed", "added"]` for a
 * style node across a real handover triggered by `touch lib/client.js`. So that
 * path never has two instances holding the same node, and this mechanism is not
 * what makes hot reload work. What it does cover is any path where the order is
 * the other way: the adoption branch below is live whenever a new instance
 * claims a node the previous one left behind, and the token check is what keeps
 * the previous instance's disposer from taking it away again. Treat the
 * receiver's current ordering as an implementation detail, not a guarantee.
 *
 * The counter lives on `globalThis` on purpose. A fresh bundle instance starts
 * with fresh module state, so a module-level counter would hand the second
 * instance the same token as the first and the check would never fire.
 */

/** Attribute carrying the token of the instance that last adopted a node. */
const OWNER_ATTR = 'data-cst-owner'

/** `globalThis` key of the adoption counter (see the module doc). */
const OWNER_SEQ_KEY = '__cst_owner_seq__'

/**
 * Stamp `node` as adopted by the caller, returning the token that identifies
 * this adoption.
 *
 * Generic on purpose: the same handover problem this solves for stylesheets
 * applies to any node an instance may find already in the document and take
 * responsibility for (`turn-process-counts` adopts a leftover tally), and a
 * second copy of the counter would be a second thing to keep in step.
 * @param node - The node the caller is about to own.
 * @returns The token to hand back to {@link releaseNode}.
 */
export function claimNode(node: Element): string {
  const store = globalThis as unknown as Record<string, number | undefined>
  const next = (store[OWNER_SEQ_KEY] ?? 0) + 1
  store[OWNER_SEQ_KEY] = next
  const token = String(next)
  node.setAttribute(OWNER_ATTR, token)
  return token
}

/**
 * Remove a node, but only while the caller still owns it. A no-op once a newer
 * instance has adopted it, and once the node is already detached.
 *
 * The no-op is the point, not a limitation: during a bundle handover the new
 * instance adopts first and the old disposer runs second, so a disposer that
 * removed unconditionally would delete the node the new instance is using.
 * @param node - The node the caller adopted.
 * @param token - The token {@link claimNode} returned for this instance.
 */
export function releaseNode(node: Element | null | undefined, token: string): void {
  if (node === null || node === undefined) return
  if (node.getAttribute(OWNER_ATTR) === token) node.remove()
}

/**
 * Stamp `node` as adopted by the caller, returning the token that identifies
 * this adoption.
 *
 * When `css` is given, the node's content is (re)written here rather than at
 * creation. Adoption is the whole point of this function, and a node adopted
 * from a previous instance keeps the CSS that instance wrote — so a caller that
 * assigns `textContent` only inside its create branch silently keeps serving
 * stale styles after a hot reload, with nothing to say so. Writing through the
 * claim makes "the node this instance uses carries this instance's CSS" a
 * property of the claim instead of something thirteen call sites each have to
 * remember. The comparison keeps an unchanged stylesheet from touching the DOM
 * on every re-mount.
 * @param node - The stylesheet node the caller is about to use.
 * @param css - The stylesheet text this instance wants the node to carry.
 * @returns The token to hand back to {@link releaseStyleNode}.
 */
export function claimStyleNode(node: HTMLStyleElement, css?: string): string {
  if (css !== undefined && node.textContent !== css) node.textContent = css
  return claimNode(node)
}

/**
 * Remove a stylesheet, but only while the caller still owns it. A no-op once a
 * newer instance has adopted the node, and once the node is already detached.
 * @param node - The node the caller adopted.
 * @param token - The token {@link claimStyleNode} returned for this instance.
 */
export function releaseStyleNode(node: HTMLStyleElement | null | undefined, token: string): void {
  releaseNode(node, token)
}
