/**
 * dsh-style-tweaks — mirror & registry consistency check.
 *
 * The client cannot import the server's config module (see the header of
 * `src/client/tweak-config.ts`: `rootDir: src/client` makes even a type-only
 * import fail TS6059), so the configuration surface is mirrored by hand in
 * four places. Nothing in the type system links them, and the failure mode is
 * always the same silent one: a field the panel can write but the client never
 * reads, a default that drifted on one side, or a registry entry whose mount
 * function was never written. This script turns each of those into a non-zero
 * exit.
 *
 * Checks, in order:
 *   1. Field names agree across `FIELDS` (server schema), the client type
 *      mirror, and the client runtime resolver.
 *   2. Every `.default(CONST)` in `FIELDS` names a constant that exists on BOTH
 *      sides with the same literal value.
 *   3. The client resolver for that field actually falls back to that constant
 *      (directly, or through one local `resolveX` helper).
 *   4. Every registry `settingKey` / `hiddenWhen.field` is a declared field.
 *   5. Every `TWEAKS` id has a `TWEAK_INJECTORS` entry and vice versa.
 *   6. Every registry `titleKey` / `descriptionKey` exists in both locale
 *      tables (`en` and `zh`).
 *
 * Run it as part of `typecheck` / `build`; it takes no arguments and reads
 * nothing but the source files it is checking.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

const problems = []
const fail = (message) => { problems.push(message) }

/** Read a source file relative to the repo root. */
async function source(relativePath) {
  return await readFile(join(root, relativePath), 'utf8')
}

/** The text between `start` and the next line that is exactly `end`. */
function block(text, start, end = '}') {
  const from = text.indexOf(start)
  if (from === -1) return ''
  const to = text.indexOf(`\n${end}`, from)
  return to === -1 ? text.slice(from) : text.slice(from, to)
}

/** Keys of a flat object literal body, for both quoted and bare keys. */
function objectKeys(body) {
  return [...body.matchAll(/^\s{2}'?([\w.-]+)'?:\s/gmu)].map(match => match[1])
}

/**
 * `const NAME = <literal>` declarations, with any type annotation stripped.
 *
 * The value is read by scanning to the point where its brackets balance rather
 * than by matching to end-of-line. A line-anchored regex truncates a multi-line
 * array or object at its first line, so a default written across three lines
 * compares as `[` on both sides — which makes the drift check below pass for
 * any multi-line constant while appearing to work. Quotes and comments are
 * tracked so that brackets inside them do not move the depth.
 * @param {string} text - Source to scan.
 * @returns {Map<string, string>} Constant name to its whitespace-normalised value.
 */
function literals(text) {
  const found = new Map()
  const declaration = /^export const (\w+)(?::[^=]+)?\s*=\s*/gmu
  for (const match of text.matchAll(declaration)) {
    found.set(match[1], readLiteral(text, match.index + match[0].length))
  }
  return found
}

/** Read one literal value from `from`, normalising whitespace and dropping comments. */
function readLiteral(text, from) {
  let depth = 0
  let quote = ''
  let out = ''
  for (let index = from; index < text.length; index += 1) {
    const char = text[index]
    const pair = text.slice(index, index + 2)
    if (quote === '') {
      if (pair === '//') {
        const stop = text.indexOf('\n', index)
        index = (stop === -1 ? text.length : stop) - 1
        continue
      }
      if (pair === '/*') {
        const stop = text.indexOf('*/', index + 2)
        index = (stop === -1 ? text.length : stop + 1)
        continue
      }
      if (char === '\'' || char === '"' || char === '`') { quote = char; continue }
      if (char === '(' || char === '[' || char === '{') depth += 1
      else if (char === ')' || char === ']' || char === '}') depth -= 1
      else if (depth === 0 && char === '\n') break
    } else if (char === '\\') {
      index += 1
    } else if (char === quote) {
      quote = ''
      continue
    }
    if (quote !== '' || depth > 0 || !/\s/u.test(char)) out += char
  }
  return out
}

/** The body of one top-level `function NAME(...)` declaration. */
function functionBody(text, name) {
  const signature = new RegExp(`^(?:export\\s+)?function ${name}\\(`, 'mu')
  const match = signature.exec(text)
  if (match === null) return ''
  const end = text.indexOf('\n}', match.index)
  return end === -1 ? text.slice(match.index) : text.slice(match.index, end)
}

// ── sources ───────────────────────────────────────────────────────────────
const configText = await source('src/config.ts')
const runtimeMirrorText = await source('src/client/tweak-config.ts')
const typeMirrorText = await source('src/client/tweak-types.ts')
const clientText = await source('src/client/index.tsx')
const i18nText = await source('src/client/i18n.ts')
const registryText = await source('src/client/tweaks/registry.ts')

// ── 1. field names, three ways ────────────────────────────────────────────
const fieldsBody = block(configText, 'const FIELDS = {')
const schemaFields = []
const schemaDefaults = new Map()
for (const match of fieldsBody.matchAll(/^\s{2}(\w+):\s*(.+?),\s*$/gmu)) {
  const [, name, schema] = match
  schemaFields.push(name)
  const declared = /\.default\(([^)]*)\)/u.exec(schema)
  if (declared !== null) {
    // `[...DEFAULT_CLOSED_WORKSPACES]` is the array spelling of the same thing.
    schemaDefaults.set(name, declared[1].replace(/^\[\.\.\./u, '').replace(/\]$/u, ''))
  }
}

const typeMirrorFields = objectKeys(block(
  typeMirrorText,
  'export interface ResolvedStyleTweaksConfig {',
))

const resolverBody = block(
  runtimeMirrorText,
  'export function resolveClientConfig(',
)
const resolverFields = []
const resolverExpressions = new Map()
for (const match of resolverBody.matchAll(/^\s{4}(\w+):\s*(.+?),\s*$/gmu)) {
  resolverFields.push(match[1])
  resolverExpressions.set(match[1], match[2])
}

const expectedFields = schemaFields.join(', ')
for (const [label, names] of [
  ['src/client/tweak-types.ts (type mirror)', typeMirrorFields],
  ['src/client/tweak-config.ts resolveClientConfig (runtime mirror)', resolverFields],
]) {
  const missing = schemaFields.filter(name => !names.includes(name))
  const extra = names.filter(name => !schemaFields.includes(name))
  for (const name of missing) fail(`${label} is missing field "${name}" (declared in src/config.ts FIELDS)`)
  for (const name of extra) fail(`${label} declares "${name}", which FIELDS does not`)
}
if (schemaFields.length === 0) fail('could not parse any field from src/config.ts FIELDS')

// ── 2 & 3. defaults: same constant, same value, and actually used ─────────
const serverConstants = literals(configText)
const clientConstants = literals(runtimeMirrorText)

for (const [field, constant] of schemaDefaults) {
  if (!clientConstants.has(constant)) {
    fail(`default for "${field}" is ${constant}, which src/client/tweak-config.ts does not declare`)
    continue
  }
  const serverValue = serverConstants.get(constant)
  if (serverValue === undefined) {
    fail(`default for "${field}" is ${constant}, which src/config.ts does not declare as a constant`)
  } else if (serverValue !== clientConstants.get(constant)) {
    fail(`constant ${constant} drifted: src/config.ts has ${serverValue}, src/client/tweak-config.ts has ${clientConstants.get(constant)}`)
  }

  // The client must actually read that constant for this field — directly, or
  // through one local `resolveX` helper (the numeric fields).
  //
  // The direct read is matched on identifier boundaries, not by substring: the
  // defaults deliberately share prefixes (`DEFAULT_HISTORY_PAGE_SIZE` and
  // `DEFAULT_HISTORY_PAGE_SIZE_COLD_START`), so `includes` would accept a
  // resolver reading the wrong one — a boolean default sitting where a number
  // belongs — and report nothing.
  const expression = resolverExpressions.get(field) ?? ''
  if (new RegExp(`\\b${constant}\\b`, 'u').test(expression)) continue
  const helper = /^(\w+)\(/u.exec(expression)
  const helperBody = helper === null ? '' : functionBody(runtimeMirrorText, helper[1])
  const returned = [...helperBody.matchAll(/return\s+(DEFAULT_\w+)/gu)].map(match => match[1])
  if (!returned.includes(constant)) {
    fail(`"${field}" does not fall back to ${constant} on the client (resolver expression: ${expression})`)
  }
}

// ── 4. registry keys are declared fields ──────────────────────────────────
const registryBody = block(registryText, 'export const TWEAKS: readonly TweakDescriptor[] = [', ']')
const settingKeys = [...registryBody.matchAll(/settingKey:\s*'([^']+)'/gu)].map(m => m[1])
const hiddenFields = [...registryBody.matchAll(/field:\s*'([^']+)'/gu)].map(m => m[1])
for (const key of new Set([...settingKeys, ...hiddenFields])) {
  if (!schemaFields.includes(key)) {
    fail(`registry references "${key}", which FIELDS does not declare`)
  }
}
if (settingKeys.length === 0) fail('could not parse any settingKey from registry.ts')

const duplicateKeys = settingKeys.filter((key, index) => settingKeys.indexOf(key) !== index)
for (const key of new Set(duplicateKeys)) fail(`registry declares settingKey "${key}" more than once`)

// ── 5. registry ids ↔ mount functions ─────────────────────────────────────
const injectorBody = block(clientText, 'const TWEAK_INJECTORS: Record<string,', '}')
const injectorIds = objectKeys(injectorBody)
const registryIds = [...registryBody.matchAll(/id:\s*'([^']+)'/gu)].map(m => m[1])
for (const id of registryIds.filter(id => !injectorIds.includes(id))) {
  fail(`TWEAKS declares "${id}" but TWEAK_INJECTORS has no mount function — it would silently never mount`)
}
for (const id of injectorIds.filter(id => !registryIds.includes(id))) {
  fail(`TWEAK_INJECTORS declares "${id}" but TWEAKS has no entry — dead mount function`)
}

// ── 6. registry copy exists in both locales ───────────────────────────────
const copyKeys = [...registryBody.matchAll(/(?:titleKey|descriptionKey):\s*'([^']+)'/gu)].map(m => m[1])
const locales = {
  en: objectKeys(block(i18nText, 'const en = {')),
  zh: objectKeys(block(i18nText, 'const zh: Record<LocaleKey, string> = {')),
}
for (const [locale, keys] of Object.entries(locales)) {
  if (keys.length === 0) fail(`could not parse the "${locale}" locale table from src/client/i18n.ts`)
  for (const key of copyKeys.filter(key => !keys.includes(key))) {
    fail(`registry needs i18n key "${key}", missing from the "${locale}" table`)
  }
}

// ── report ────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error('[check-mirrors] the server/client mirrors disagree:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(`\n[check-mirrors] ${problems.length} problem(s). Fields checked: ${expectedFields}`)
  process.exit(1)
}
console.log(`[check-mirrors] ok — ${schemaFields.length} fields, ${settingKeys.length} registry keys, ${registryIds.length} mounts, ${copyKeys.length} i18n keys`)
