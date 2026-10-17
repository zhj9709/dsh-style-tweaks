/**
 * dsh-style-tweaks — shared cache-hit formatting for the stats tweaks.
 *
 * Both stats tweaks need the exact prompt-bucket math over the `tokenUsage`
 * projection: the pills-replacement always formats at two decimals, and the
 * legacy stats line formats at two decimals while `pillsCacheHitDecimals` is
 * on and at integer precision (0.1.2 behavior) while it is off. The rounding
 * algorithm is ported verbatim from dsh-client-ui-chat's `token-format.ts`
 * (0.1.2-rc.1) and generalized from `0 | 1` to `0 | 1 | 2` decimal places —
 * the hundredths mode changes only the unit scale; the "would round to 100%
 * honesty tail" construction is precision-independent and always yields at
 * least `decimalPlaces` fractional digits (a hit that rounds to a full 100%
 * at the requested precision shows its true tail, e.g. `99.97`).
 *
 * @module dsh-style-tweaks/client/tweaks/stats-cache-hit
 */

import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import { reportOnce } from '../report-once.ts'

/** The three disjoint prompt-side billing buckets. */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Render `units` (whole units per 10^decimalPlaces percent) as percent text. */
function displayPercentUnits(units: number, decimalPlaces: 0 | 1 | 2): string {
  if (decimalPlaces === 0) return String(units)
  const scale = 10 ** decimalPlaces
  const whole = Math.floor(units / scale)
  const frac = units % scale
  if (decimalPlaces === 1) return frac === 0 ? String(whole) : `${whole}.${frac}`
  return `${whole}.${String(frac).padStart(2, '0')}`
}

/**
 * Report once per page that a cache-hit reading had to be dropped.
 *
 * The callers hand these two fields straight through from the host's token
 * projection, so an impossible pair means the host changed what those fields
 * mean or how they are aggregated. Dropping the number silently would take
 * the percentage out of the stats cell with nothing anywhere saying why;
 * once per page, because the stats row re-renders on every streamed frame
 * with the same unusable reading in hand.
 * @param cacheReadTokens - The read share that came in.
 * @param promptTokens - The billed prompt total it was measured against.
 */
function reportUnusableReading(cacheReadTokens: number, promptTokens: number): void {
  reportOnce('cache-hit-reading', () => {
    console.error(
      `[dsh-style-tweaks] cache-hit reading dropped — cacheRead=${cacheReadTokens} against prompt=${promptTokens} is not a usable pair; the host's token projection changed shape`,
    )
  })
}

/**
 * Display-ready cache-hit share without rounding a partial hit to 100%:
 * exact percentage at the requested precision while it stays below 100,
 * otherwise the minimum additional precision that still rounds below 100.
 * @param cacheReadTokens - exact prompt tokens served from cache.
 * @param promptTokens - exact aggregate prompt tokens (all billed buckets).
 * @param decimalPlaces - ordinary precision; the would-be-full-hit tail
 *   keeps one extra honest digit beyond this when needed.
 * @returns percentage text, or null when there was no billed prompt input or
 *   the counts are not a usable pair (the latter is reported once per page).
 */
export function formatCacheHitPercent(
  cacheReadTokens: number,
  promptTokens: number,
  decimalPlaces: 0 | 1 | 2,
): string | null {
  // `promptTokens === 0` is the ordinary "no billed prompt input" case: there
  // is simply nothing to read, so it stays silent. Everything caught below is
  // a reading that cannot be believed — a negative or non-finite count, or a
  // read share larger than the prompt it came out of — and each of those is
  // reported. Null means "nothing to show" to every caller (the cell drops
  // the field), so an unusable reading degrades to a missing number rather
  // than a wrong one.
  if (promptTokens === 0) return null
  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(cacheReadTokens) ||
    promptTokens < 0 ||
    cacheReadTokens < 0 ||
    cacheReadTokens > promptTokens
  ) {
    reportUnusableReading(cacheReadTokens, promptTokens)
    return null
  }
  const missedInputTokens = promptTokens - cacheReadTokens
  if (missedInputTokens === 0) return '100'

  // Round the read ratio to 10^d units per percent with positive ties up:
  // binary-search the largest candidate whose (2c-1)-scaled half-open
  // threshold the numerator reaches.
  const unitsPerPercent = 10 ** decimalPlaces
  const scale = unitsPerPercent * 100
  const denominatorQuotient = Math.floor(promptTokens / (scale * 2))
  const denominatorRemainder = promptTokens % (scale * 2)
  let lower = 0
  let upper = scale
  while (lower < upper) {
    const candidate = Math.floor((lower + upper + 1) / 2)
    const factor = candidate * 2 - 1
    const threshold = factor * denominatorQuotient
      + Math.ceil(factor * denominatorRemainder / (scale * 2))
    if (cacheReadTokens >= threshold) lower = candidate
    else upper = candidate - 1
  }
  if (lower < scale) return displayPercentUnits(lower, decimalPlaces)

  // The requested precision would read 100: widen precision until one unit
  // of the last shown place exceeds the miss, then keep the tail honest.
  // The seed 1 is precision-independent: the tail only fires for misses far
  // below one requested-precision unit, so the loop always climbs past
  // `decimalPlaces` digits on its own (d=2 tails carry ≥ 3 decimals).
  let distinguishingPlaces = 1
  let scaledDoubleGap = missedInputTokens * 200
  const denominatorTens = Math.floor(promptTokens / 10)
  while (scaledDoubleGap <= denominatorTens) {
    scaledDoubleGap *= 10
    distinguishingPlaces += 1
  }
  const denominatorOnes = promptTokens % 10
  let roundedLoss = 5
  for (let loss = 1; loss < 5; loss += 1) {
    const factor = loss * 2 + 1
    const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10)
    if (scaledDoubleGap <= threshold) {
      roundedLoss = loss
      break
    }
  }
  return `99.${'9'.repeat(distinguishingPlaces - 1)}${10 - roundedLoss}`
}
