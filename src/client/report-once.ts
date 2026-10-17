/**
 * dsh-style-tweaks — once-per-page diagnostics for the tweaks.
 *
 * Several tweaks report a failure that, if it is real, repeats: a wire shape
 * that no longer parses rejects the same request again on the next attempt,
 * and a host call that throws throws on every press. One line per occurrence
 * turns a useful signal into console noise, so the report is gated by a
 * `globalThis` flag — the first caller to reach a given topic reports, every
 * later one stays silent, and the caller keeps deciding what (if anything) a
 * known-benign rejection deserves.
 *
 * The flag lives on `globalThis` rather than in module state for the same
 * reason `style-node.ts`'s counter does: a hot reload evaluates this module
 * again with fresh module state, so a module-level flag would let the page
 * report all over again on every rebuild.
 *
 * The topic is part of the flag's name, so independent failures keep their own
 * one-shot: a drift in one host frame must not silence the report for another
 * shape that drifts later.
 *
 * @module dsh-style-tweaks/client/report-once
 */

/** `globalThis` key prefix of the reported flags. */
const REPORTED_PREFIX = '__cst_reported__'

/**
 * Run `report` at most once per page for `topic`.
 * @param topic - Stable identifier of the failure being reported.
 * @param report - The logging call to run on the first occurrence.
 */
export function reportOnce(topic: string, report: () => void): void {
  const host = globalThis as unknown as Record<string, boolean | undefined>
  const key = `${REPORTED_PREFIX}${topic}__`
  if (host[key] === true) return
  host[key] = true
  report()
}
