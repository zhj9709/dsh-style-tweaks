/**
 * dsh-style-tweaks — ownership for the plugin's injected `<style>` nodes.
 *
 * Every style injector finds-or-creates one shared `<style>` keyed by
 * `data-tweak-css`, and used to hand back a disposer that removed it
 * unconditionally. That is wrong across bundle instances: the client-plugin HMR
 * receiver can evaluate a new bundle before the previous instance's disposer
 * has run, the new instance's `querySelector` adopts the node the old one
 * created, and the old disposer then deletes the stylesheet the new instance is
 * using — that tweak's CSS silently disappears until the next reload.
 *
 * Ownership is therefore stamped on the node when an instance adopts it, and
 * checked before removal, the same shape `running-status` uses for its own
 * stylesheet.
 *
 * The counter lives on `globalThis` on purpose. A fresh bundle instance starts
 * with fresh module state, so a module-level counter would hand the second
 * instance the same token as the first and the check would never fire.
 */

/** Attribute carrying the token of the instance that last adopted the node. */
const OWNER_ATTR = 'data-cst-style-owner'

/** `globalThis` key of the adoption counter (see the module doc). */
const OWNER_SEQ_KEY = '__cst_style_owner_seq__'

/**
 * Stamp `node` as adopted by the caller, returning the token that identifies
 * this adoption.
 * @param node - The stylesheet node the caller is about to use.
 * @returns The token to hand back to {@link releaseStyleNode}.
 */
export function claimStyleNode(node: HTMLStyleElement): string {
  const store = globalThis as unknown as Record<string, number | undefined>
  const next = (store[OWNER_SEQ_KEY] ?? 0) + 1
  store[OWNER_SEQ_KEY] = next
  const token = String(next)
  node.setAttribute(OWNER_ATTR, token)
  return token
}

/**
 * Remove a stylesheet, but only while the caller still owns it. A no-op once a
 * newer instance has adopted the node, and once the node is already detached.
 * @param node - The node the caller adopted.
 * @param token - The token {@link claimStyleNode} returned for this instance.
 */
export function releaseStyleNode(node: HTMLStyleElement | null | undefined, token: string): void {
  if (node === null || node === undefined) return
  if (node.getAttribute(OWNER_ATTR) === token) node.remove()
}
