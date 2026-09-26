/**
 * dsh-style-tweaks — own settings store (DSH 0.1.7+ fast path).
 *
 * Values for the `style-tweaks` namespace live here, in
 * `<profile>/.dsh-style-tweaks/store.json`, instead of the host's settings
 * pipeline: that pipeline costs 905–1114ms per write (3× describe + 2×
 * full-tree reconcile + uncached profile reads — measured 2026-09-23, see
 * `.docs/PLAN-DIAGNOSIS-index.md`), while every field in this namespace is
 * consumed by the browser only (see `src/index.ts`), so the composition work
 * bought nothing. A read here is one file parse; a write is a CAS check plus
 * an atomic rename — both single-digit milliseconds.
 *
 * Semantics kept identical to the old route so the client needs no changes:
 * a monotonically compared `revision` for optimistic concurrency (409 on
 * mismatch, same `SettingsConflictError` name the wire layer already maps),
 * and `{ revision, value }` shaped so a hand edit of this file is picked up
 * on the next request.
 *
 * The entry Config (`cordis.patch.yml`'s `config` row for this plugin) is
 * demoted to the SEED SOURCE: a missing store file is seeded once from its
 * user layer (explicitly written fields only — defaults stay unmaterialised
 * so future schema default bumps still land). Hand edits to `cordis.patch.yml`
 * no longer reach the route; hand edits to this file do.
 * @module dsh-style-tweaks/store
 */

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Directory owning this plugin's store, created on first write as needed. */
export const STORE_DIRNAME = '.dsh-style-tweaks'
/** Store file name inside {@link STORE_DIRNAME}. */
export const STORE_FILENAME = 'store.json'
/** Prefix for atomic-write temp files; distinctive so a stray one is recognisable. */
const TMP_PREFIX = '.style-tweaks.store'

/** On-disk document: values plus the CAS token compared per write. */
export interface StoreDoc {
  /** Monotonic write counter; every successful POST bumps it by one. */
  revision: number
  /** Namespace value as the panel's resolver expects it (partial is fine). */
  value: Record<string, unknown>
}

/**
 * CAS failure. `name` MUST stay `'SettingsConflictError'`: the wire layer
 * recognises the host's class across package copies by that name (cross-copy
 * `instanceof` is always false), and the store speaks the same wire.
 */
export class StoreConflictError extends Error {
  override name = 'SettingsConflictError'
  /** Revision the request sent. */
  readonly expected: number
  /** Revision the store holds now. */
  readonly actual: number
  constructor(expected: number, actual: number) {
    super(`style-tweaks store changed since it was read (expected revision ${String(expected)}, now ${String(actual)})`)
    this.expected = expected
    this.actual = actual
  }
}

/**
 * Seeding failed (settings service unavailable or shape unusable). Distinct
 * from a validation/conflict failure: the wire maps it to 503 so the client's
 * retry ladder rides out a boot-window outage instead of reporting a bad write.
 */
export class StoreSeedError extends Error {
  override name = 'SettingsSeedError'
}

/** Whether a parsed document is a structurally valid store. */
export function isStoreDoc(value: unknown): value is StoreDoc {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const doc = value as Record<string, unknown>
  return (
    typeof doc.revision === 'number'
    && Number.isSafeInteger(doc.revision)
    && doc.revision >= 0
    && typeof doc.value === 'object'
    && doc.value !== null
    && !Array.isArray(doc.value)
  )
}

/**
 * Read the store; `undefined` only for a clean miss (no file yet — the caller
 * seeds). A present-but-corrupt file THROWS: silently reseeding over it would
 * discard whatever the user (or a partial write) put there, and the route
 * turns this into a visible 503 instead.
 * @param path - Absolute store path.
 * @returns The document, or undefined when the file does not exist.
 */
export async function readStore(path: string): Promise<StoreDoc | undefined> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`style-tweaks store is not valid JSON: ${path}`)
  }
  if (!isStoreDoc(parsed)) throw new Error(`style-tweaks store has an unexpected shape: ${path}`)
  return parsed
}

/**
 * Write the store atomically: a same-directory temp file, then `rename` over
 * the destination — a reader never observes a half-written document.
 * @param path - Absolute store path.
 * @param doc - Next document (caller has already bumped the revision).
 */
export async function writeStore(path: string, doc: StoreDoc): Promise<void> {
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `${TMP_PREFIX}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  try {
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
}

/**
 * In-process write serialisation: every store mutation (seed included) rides
 * one promise chain, so concurrent requests in this host — multi-tab windows,
 * a GET seeding under a POST — cannot interleave read-modify-write. A prior
 * failure never poisons the chain.
 *
 * **This does not reach across processes.** Two hosts sharing one profile
 * directory (a Desktop app and a `dsh web` on the same profile) each hold their
 * own chain, and the revision CAS does not close that either: it detects a write
 * based on a *stale read*, so two processes that both read `revision: N` both
 * pass it and both write `N+1`, last writer winning, and neither sees a 409.
 * Closing it needs a cross-process file lock around read → merge → rename.
 * @param fn - Critical section; runs when the previous turn has settled.
 * @returns The section's result.
 */
export function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn)
  chain = run.then(() => undefined, () => undefined)
  return run
}

/** Tail of the in-process write chain. */
let chain: Promise<unknown> = Promise.resolve()
