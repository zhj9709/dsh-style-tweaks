/**
 * dsh-style-tweaks — the 0.1.6 process-group tally, spelled once.
 *
 * Two tweaks show the same three numbers in the same order with the same
 * vocabulary: `turn-process-counts` appends them to a settled turn's disclosure
 * header, and `legacy-running-header` puts them on the 0.1.7-style row it
 * injects above a running turn's work. Both read from the same table here so
 * the separator, the singular/plural keys and the zero-skipping rule cannot
 * drift apart — a difference between the two would read as the host changing
 * its numbers mid-turn.
 *
 * Ported from the 0.1.6 `TurnProcessNodeView` label: a zero (or absent) count is
 * left out, and the parts are joined with the host's own separator. The
 * separator leads the string so a tally reads as a continuation of whatever
 * label precedes it (`用时 9分09秒` + ` · 55 次工具调用`), which also keeps it
 * attached to the tally when a narrow row truncates the label. That leading
 * space only survives because the tally's skin sets `white-space: pre`.
 *
 * @module dsh-style-tweaks/client/tweaks/turn-tally
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Activates the `chat` namespace key map. Without it `TranslateNS<'chat'>`
// resolves to nothing and a `ctx.locale.bind('chat')` would need an `as` cast
// to compile — which is exactly how a renamed key or a dictionary that stopped
// being reachable would slip through green. This file OWNS that type, so it
// imports the augmentation itself instead of depending on a sibling doing it.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { LocaleKey } from '../i18n.ts'
import type { TurnCounts } from './turn-count-stream.ts'

/** The host `chat` vocabulary, which still carries the whole tally group. */
export type ChatTranslate = TranslateNS<'chat'>

/**
 * The keys this plugin's own seat is asked for, and what each interpolates.
 *
 * This is a THIRD list of key names, alongside `en` and `zh` in `i18n.ts`, and
 * nothing ties the three together: a placeholder renamed on one side compiles
 * and then prints the raw key at runtime — the failure mode
 * {@link formatLiveDuration}'s own comment was written about. Keep the names and
 * the parameter sets here identical to both locale tables.
 */
interface StyleTweaksTexts {
  readonly legacyRunningHeader: { readonly duration: string }
  readonly durationHours: { readonly hours: number; readonly minutes: number; readonly seconds: number }
  readonly durationMinutes: { readonly minutes: number; readonly seconds: number }
  readonly durationSeconds: { readonly seconds: number }
}

/**
 * This plugin's own locale seat, narrowed to the keys the elapsed clock reads.
 * The panel binds `style-tweaks` and hands the seat in, the same way the other
 * tweaks that need it are mounted (see `index.tsx`).
 *
 * The `LocaleKey` half of the intersection is what keeps the two lists honest:
 * `StyleTweaksTexts` above is a hand-written second list of key names, so
 * without it a key renamed in `i18n.ts` would still compile and then print the
 * key name at runtime — the exact failure the duration templates were moved off
 * the host seat to avoid. Intersecting keeps this seat's own parameter types
 * (the framework's `Record<string, unknown>` params would otherwise drop them)
 * AND ties every key back to the plugin's dictionary.
 */
export type StyleTweaksTranslate = <Key extends keyof StyleTweaksTexts & LocaleKey>(
  key: Key,
  params: StyleTweaksTexts[Key],
) => string

/** One key of that vocabulary, so the tally table's keys stay checked. */
type ChatKey = Parameters<ChatTranslate>[0]

/** The appended tally's class (namespaced, like every `cst-*` class here). */
export const TALLY_CLASS = 'cst-tp-counts'

/**
 * The three tallies in 0.1.6's label order: the button attribute carrying the
 * count, the stream-side field carrying the same count while the turn is still
 * running, and the singular/plural vocabulary the host still ships for it.
 */
export const TALLIES: readonly {
  readonly attribute: string
  readonly field: keyof TurnCounts
  readonly one: ChatKey
  readonly other: ChatKey
}[] = [
  {
    attribute: 'data-turn-process-tool-calls',
    field: 'toolCallCount',
    one: 'message.turnProcess.toolCalls.one',
    other: 'message.turnProcess.toolCalls.other',
  },
  {
    attribute: 'data-turn-process-messages',
    field: 'messageCount',
    one: 'message.turnProcess.messages.one',
    other: 'message.turnProcess.messages.other',
  },
  {
    attribute: 'data-turn-process-subagents',
    field: 'subagentCount',
    one: 'message.turnProcess.subagents.one',
    other: 'message.turnProcess.subagents.other',
  },
]

/**
 * Join counted parts into the string to append, or `null` when nothing counts.
 * @param parts - The counted parts, in label order.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @returns The text to append, or `null` for a turn with no counted work.
 */
export function joinTally(parts: readonly string[], t: ChatTranslate): string | null {
  if (parts.length === 0) return null
  const separator = t('message.turnProcess.separator')
  return separator + parts.join(separator)
}

/**
 * The tally for a running turn, from the event stream.
 * @param counts - The stream's tallies, or `null` while no turn is running.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @returns The text to append, or `null` when there is nothing to count.
 */
export function countsTallyText(counts: TurnCounts | null, t: ChatTranslate): string | null {
  if (counts === null) return null
  const parts: string[] = []
  for (const tally of TALLIES) {
    const count = counts[tally.field]
    if (count <= 0) continue
    parts.push(t(count === 1 ? tally.one : tally.other, { count }))
  }
  return joinTally(parts, t)
}

/**
 * The tally for a settled turn, from the count attributes the host publishes on
 * its disclosure button.
 * @param button - One `data-turn-process` disclosure button.
 * @param t - Translate seat over the host `chat` vocabulary.
 * @returns The text to append, or `null` for a turn with no counted work.
 */
export function buttonTallyText(button: HTMLElement, t: ChatTranslate): string | null {
  const parts: string[] = []
  for (const tally of TALLIES) {
    const raw = button.getAttribute(tally.attribute)
    const count = raw === null ? Number.NaN : Number(raw)
    if (!Number.isFinite(count) || count <= 0) continue
    parts.push(t(count === 1 ? tally.one : tally.other, { count }))
  }
  return joinTally(parts, t)
}

/**
 * Elapsed time, spelled the way 0.2.0's LIVE row spells it.
 *
 * The units and the thresholds are the host's own `formatRunDuration` (rc.2,
 * which returns an array of parts): hours when there are any, minutes once the
 * total reaches a minute, seconds always — and NO zero padding, so a long turn
 * reads `1小时5分9秒`, not `1小时05分9秒`.
 *
 * The two departures from the host, both deliberate:
 *
 * - The three templates are read from THIS plugin's seat. 0.1.7 had
 *   `duration.hours` / `.minutes` / `.seconds` as whole strings; 0.2.0-rc.2
 *   deleted all three (0.2.0-rc.1 still carried them alongside the new bare
 *   `duration.hourUnit` / `.minuteUnit` / `.secondUnit` plus
 *   `duration.compact*`) and made `formatRunDuration` return parts, so asking
 *   the bound `chat` seat for an old key returns the key name itself. That is
 *   what the first run of this printed — and the build stayed green, because
 *   devDependencies are pinned to 0.2.0-rc.1, whose `ChatKey` still lists them.
 * - No zero padding, unlike 0.1.7's `formatLiveRunDuration`, which did pad.
 *   This is the opposite trade from the heading's margin: there the old rule
 *   merely made the row heavier, here the two clocks sit on screen together and
 *   `05` next to the host's `5` reads as the same number having two values. The
 *   row the host itself shows while a turn runs is the one this is compared
 *   against, so it wins.
 * @param ms - Elapsed milliseconds; negatives clamp to zero.
 * @param label - This plugin's locale seat.
 * @returns The duration string, e.g. `42秒`, `7分5秒`, `1小时50分26秒`.
 */
export function formatLiveDuration(ms: number, label: StyleTweaksTranslate): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const seconds = total % 60
  if (hours > 0) return label('durationHours', { hours, minutes, seconds })
  // `total >= 60`, not `minutes > 0`: identical here, but the host's condition
  // is stated in total seconds and this mirrors it rather than coinciding.
  return total >= 60 ? label('durationMinutes', { minutes, seconds }) : label('durationSeconds', { seconds })
}
