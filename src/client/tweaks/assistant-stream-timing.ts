/**
 * dsh-style-tweaks — per-turn latency/throughput rebuilt from the session
 * log's embedded model streams.
 *
 * ## Why this module exists
 *
 * Session format v2 (0.1.5) embeds each model attempt's exact timed stream
 * inside its durable settlement (`assistant/message` carries
 * `data.stream: AssistantStreamRecord[]`), but the Chat UI's cold
 * presentation builds settled output directly from the assembled message and
 * does not replay the stream ("Cold settled presentation therefore does not
 * reconstruct per-token timing", see the v2-embedded-assistant-streams
 * architecture note). The turn footer's own fold reads `node.timing`, whose
 * `firstTokenTime` only survives in-memory live-chunk folding — so every
 * settled turn loses its 输出速度 (TPS) and 首 token 用时 (TTFT), and the
 * "本轮用时和速度" dialog keeps only the wall-clock duration. This module is
 * the consumer the note anticipates: it reads the settlements out of the
 * session binding's event window (`binding.eventSource`, the documented
 * Conversation-assembly feed) and rebuilds the two figures.
 *
 * The compact record readers are ported verbatim from
 * `@deepseek-ai/dsh-llm`'s `assistant-stream.ts` (first-token walk over
 * packed runs with `time0` + `dt` gap reconstruction), and the per-turn fold
 * from 0.1.5's `contract/turn-metrics.ts` (`deriveTurnMetrics`): TTFT is the
 * lowest step's request-dispatch-to-first-token delta, throughput divides
 * summed output tokens by summed decode wall time over steps carrying both.
 * Only steps whose settlement stream actually contains a token contribute.
 *
 * Everything reads structurally: the window entries arrive as opaque host
 * objects (this module imports no host event types), so the entries and
 * their settlement payloads are narrowed through local structural views
 * instead of the host's event types.
 *
 * @module dsh-style-tweaks/client/tweaks/assistant-stream-timing
 */

/** Compact timed model-stream record embedded in a settled assistant event. */
export type AssistantStreamRecord =
  | {
    readonly type: 'text-chunks'
    readonly time0: number
    readonly texts: readonly unknown[]
    readonly dt: readonly unknown[]
  }
  | {
    readonly type: 'reasoning-chunks'
    readonly time0: number
    readonly texts: readonly unknown[]
    readonly dt: readonly unknown[]
  }
  | {
    readonly type: 'tool-call-chunks'
    readonly time0: number
    readonly name?: string
    readonly args: readonly unknown[]
    readonly dt: readonly unknown[]
  }
  | {
    readonly type: 'chunk'
    readonly time: number
    readonly chunk: {
      readonly type: string
      readonly text?: unknown
      readonly argumentsDelta?: unknown
      readonly name?: unknown
    }
  }

/** One step's rebuilt latency facts; null marks a figure this step cannot support. */
interface StepReading {
  /** step/start → first token delta, in ms. */
  readonly firstTokenTime: number | null
  /** First token delta → settlement, in ms. */
  readonly decodeMs: number | null
  /** Provider-reported output tokens from the settlement's usage. */
  readonly outputTokens: number | null
}

/** Latency and decode-throughput readings for one settled turn's footer. */
export interface TurnSpeedMetrics {
  /** First-step TTFT in ms; absent when no step carries a recorded timing. */
  ttftMs?: number
  /** Decode throughput over steps carrying both timing and provider usage. */
  tokensPerSecond?: number
}

/** One packed delta run: every compact record except a raw `chunk`. */
export type AssistantStreamRun = Exclude<AssistantStreamRecord, { readonly type: 'chunk' }>

/** Whether one chunk carries the model's first output token (ported `isTokenDelta`). */
function isTokenDelta(chunk: {
  readonly type: string
  readonly text?: unknown
  readonly argumentsDelta?: unknown
  readonly name?: unknown
}): boolean {
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return chunk.text === '' ? false : typeof chunk.text === 'string'
    case 'tool-call-delta':
      return chunk.argumentsDelta !== '' || chunk.name !== undefined
    default:
      return false
  }
}

/** Member time of the first fragment in one packed run the predicate accepts. */
function firstRunMemberTime(
  time0: number,
  dt: readonly unknown[],
  fragments: readonly unknown[],
  predicate: (fragment: unknown) => boolean,
): number | undefined {
  let time = time0
  for (let index = 0; index < fragments.length; index += 1) {
    if (index > 0) time += (dt[index - 1] as number | undefined) ?? 0
    if (predicate(fragments[index] as unknown)) return time
  }
  return undefined
}

/**
 * Time of the first token in one packed run: a name-bearing tool-call run
 * starts at its first member, otherwise the first non-empty fragment
 * (ported `runFirstTokenTime`).
 */
function runFirstTokenTime(run: AssistantStreamRun): number | undefined {
  if (run.type === 'tool-call-chunks') {
    if (run.name !== undefined) return run.time0
    return firstRunMemberTime(run.time0, run.dt, run.args, fragment => fragment !== '')
  }
  return firstRunMemberTime(run.time0, run.dt, run.texts, fragment => fragment !== '')
}

/**
 * Time of the first token in one compact stream, read from the records
 * themselves (ported `assistantStreamFirstTokenTime`).
 * @param stream - compact records from one durable assistant settlement.
 * @returns The first token's time, or undefined when the stream carries no token.
 */
export function assistantStreamFirstTokenTime(
  stream: readonly AssistantStreamRecord[],
): number | undefined {
  for (const record of stream) {
    const time = record.type === 'chunk'
      ? (isTokenDelta(record.chunk) ? record.time : undefined)
      : runFirstTokenTime(record)
    if (time !== undefined) return time
  }
  return undefined
}

/** Narrow one event-window entry to its durable event, structurally. */
function entryEvent(entry: unknown): {
  readonly type: string
  readonly time: number
  readonly data: unknown
} | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined
  const candidate = entry as { readonly type?: unknown; readonly event?: unknown }
  if (candidate.type !== 'event') return undefined
  const event = candidate.event as {
    readonly type?: unknown
    readonly time?: unknown
    readonly data?: unknown
  } | undefined
  if (
    typeof event !== 'object' || event === null
    || typeof event.type !== 'string'
    || typeof event.time !== 'number'
  ) return undefined
  return { type: event.type, time: event.time, data: event.data }
}

/**
 * Resolve the turn whose closing message carries a given id, by scanning the
 * window's settled assistant messages (the actions-row entry keys on the
 * closing message id; this recovers the fold target).
 * @param entries - The binding event window's entries (any version's shape).
 * @param messageId - The closing message id from the slot owner.
 * @returns The owning turn number, or undefined when the window holds no
 *   matching settlement (older page not loaded, or entry evicted).
 */
export function turnOfClosingMessage(entries: readonly unknown[], messageId: string): number | undefined {
  for (const entry of entries) {
    const event = entryEvent(entry)
    if (event === undefined || event.type !== 'assistant/message') continue
    const data = event.data as {
      readonly turn?: unknown
      readonly message?: { readonly id?: unknown } | undefined
    }
    if (typeof data.message?.id === 'string' && data.message.id === messageId && typeof data.turn === 'number') {
      return data.turn
    }
  }
  return undefined
}

/**
 * Rebuild one settled turn's footer metrics from the event window.
 *
 * Ported from 0.1.5's `deriveTurnMetrics` with the per-step reading taken
 * from the settlement's embedded stream instead of the node's in-memory
 * timing: first-token time comes from the stream walk, the decode window
 * ends at the settlement's own timestamp, and output tokens come from the
 * settlement's `usage` — all durable, so history loads get the same figures
 * a live session did.
 * @param entries - The binding event window's entries (any version's shape).
 * @param turn - The turn number to fold.
 * @returns The turn's metrics; undefined when no figure is derivable.
 */
export function deriveTurnSpeedMetrics(
  entries: readonly unknown[],
  turn: number,
): TurnSpeedMetrics | undefined {
  const stepStarts = new Map<number, number>()
  const readings = new Map<number, StepReading>()
  for (const entry of entries) {
    const event = entryEvent(entry)
    if (event === undefined) continue
    if (event.type === 'step/start') {
      const data = event.data as { readonly turn?: unknown; readonly step?: unknown }
      if (data.turn === turn && typeof data.step === 'number') {
        stepStarts.set(data.step, event.time)
      }
      continue
    }
    if (event.type !== 'assistant/message') continue
    const data = event.data as {
      readonly turn?: unknown
      readonly step?: unknown
      readonly stream?: unknown
      readonly usage?: { readonly outputTokens?: unknown } | undefined
    }
    if (data.turn !== turn || typeof data.step !== 'number' || !Array.isArray(data.stream)) continue
    const firstTokenTime = assistantStreamFirstTokenTime(data.stream as readonly AssistantStreamRecord[]) ?? null
    readings.set(data.step, {
      firstTokenTime,
      decodeMs: firstTokenTime !== null ? Math.max(0, event.time - firstTokenTime) : null,
      outputTokens: typeof data.usage?.outputTokens === 'number'
        && Number.isFinite(data.usage.outputTokens)
        && data.usage.outputTokens >= 0
        ? data.usage.outputTokens
        : null,
    })
  }
  let firstStep = Number.POSITIVE_INFINITY
  let firstStepTtftMs: number | null = null
  let decodeMsSum = 0
  let outputTokensSum = 0
  let sampled = false
  for (const [step, reading] of readings) {
    if (step < firstStep) {
      firstStep = step
      const stepStart = stepStarts.get(step)
      firstStepTtftMs = reading.firstTokenTime !== null && stepStart !== undefined
        ? Math.max(0, reading.firstTokenTime - stepStart)
        : null
    }
    if (reading.decodeMs !== null && reading.outputTokens !== null) {
      decodeMsSum += reading.decodeMs
      outputTokensSum += reading.outputTokens
      sampled = true
    }
  }
  const metrics: TurnSpeedMetrics = {}
  if (firstStepTtftMs !== null) metrics.ttftMs = firstStepTtftMs
  if (sampled && decodeMsSum > 0) metrics.tokensPerSecond = outputTokensSum / (decodeMsSum / 1000)
  return metrics.ttftMs !== undefined || metrics.tokensPerSecond !== undefined
    ? metrics
    : undefined
}

/**
 * One turn's wall-clock run time from the event window: its `turn/end`
 * timestamp minus its `turn/start` timestamp — the figure 0.1.6's footer
 * printed as "用时 …" (`turn.end.time - turn.start.time` over the Chat
 * snapshot's turn location).
 *
 * A turn with no `turn/end` in the loaded window (interrupted before it
 * settled, or an end event evicted by the window's cap) falls back to the last
 * event the window holds for that turn, so the pill still carries a duration
 * instead of vanishing; the value can only be short by the tail of the turn,
 * never inflated.
 * @param entries - The binding event window's entries (any version's shape).
 * @param turn - The turn number to measure.
 * @returns The run time in ms, or undefined when the window holds no start.
 */
export function deriveTurnRunMs(entries: readonly unknown[], turn: number): number | undefined {
  let start: number | undefined
  let end: number | undefined
  let last: number | undefined
  for (const entry of entries) {
    const event = entryEvent(entry)
    if (event === undefined) continue
    const data = event.data as { readonly turn?: unknown } | undefined
    if (data === undefined || data.turn !== turn) continue
    if (event.type === 'turn/start') {
      if (start === undefined) start = event.time
      continue
    }
    if (event.type === 'turn/end') {
      end = event.time
      continue
    }
    if (last === undefined || event.time > last) last = event.time
  }
  if (start === undefined) return undefined
  const finish = end ?? last
  if (finish === undefined) return undefined
  return Math.max(0, finish - start)
}
