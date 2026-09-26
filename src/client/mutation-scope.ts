/**
 * dsh-style-tweaks — narrow a document-wide `MutationObserver` to one region.
 *
 * Every tweak here decorates DOM the host owns, and the host's React tree
 * mutates constantly: streaming one answer rewrites the transcript for
 * hundreds of frames, and each of those frames is a batch of records on a
 * `document.body` observer. A callback that then runs
 * `document.querySelectorAll` pays a **document-wide** query per frame for a
 * change that has nothing to do with the tweak.
 *
 * `touchesScope` is the cheap gate in front of that work. It answers the only
 * question that matters — "did this batch touch the region I decorate?" — from
 * the records themselves, in O(records) `matches` calls, with no walk of the
 * untouched document.
 *
 * ## What counts as touching
 *
 *   • A record whose **target** is inside the region (or is the region):
 *     text/child/attribute churn within a row, a cell, a menu.
 *   • A record whose **added or removed** node is, or contains, the region:
 *     the host mounting or dropping the whole region in one commit — the
 *     common case, because React appends a portal wrapper holding the region
 *     rather than the region element itself.
 *
 * Removals are included on purpose: a disposer that detaches a listener from
 * the region it tracked (see `settings-nav-scroll`) must still hear about the
 * region leaving, or it keeps the listener and the reference alive.
 *
 * ## What it deliberately does not do
 *
 * It is conservative in exactly one direction: **false positives are free**
 * (the caller re-runs its idempotent sync), while a false negative is a
 * missed update. So a batch that only *might* matter is let through, and the
 * `querySelector` for a descendant is skipped as soon as one node matches.
 *
 * The one case it used to get wrong was a `characterData` record, whose target
 * is a `Text` node: not an `Element`, so `closest` could not run, and the
 * add/remove lists are empty for that record type — all three checks fell
 * through and the batch was dropped. That is a false negative in the one
 * direction this function promises never to fail, so a non-Element target now
 * lets the record through. None of the current callers subscribe to
 * `characterData` (`running-status` does, and it uses its own predicate), so
 * this changes nothing observable today; it is here so the next caller that
 * adds the option inherits the conservative reading rather than the bug.
 *
 * @param records - The batch handed to a `MutationObserver` callback.
 * @param scope - A CSS selector list naming the region(s) the caller decorates.
 * @returns Whether the batch can affect that region.
 */
export function touchesScope(records: readonly MutationRecord[], scope: string): boolean {
  for (const record of records) {
    const target = record.target
    // Not `if (target instanceof Element && …)`: a `characterData` target is a
    // Text node, and skipping it is exactly the silent drop described above.
    if (!(target instanceof Element)) return true
    if (target.closest(scope) !== null) return true
    if (nodesTouch(record.addedNodes, scope)) return true
    if (record.removedNodes.length > 0 && nodesTouch(record.removedNodes, scope)) return true
  }
  return false
}

/** Whether any element in a mutation node list is, or contains, the region. */
function nodesTouch(nodes: NodeList, scope: string): boolean {
  for (const node of nodes) {
    if (!(node instanceof Element)) continue
    if (node.matches(scope)) return true
    if (node.querySelector(scope) !== null) return true
  }
  return false
}
