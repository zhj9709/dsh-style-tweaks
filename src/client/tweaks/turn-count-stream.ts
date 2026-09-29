/**
 * dsh-style-tweaks — live Turn tallies read from the Session event stream.
 *
 * ## Why this exists
 *
 * 0.2.0-rc.1 changed *when* the process group renders. `TurnProcessNodeView`
 * now opens with
 *
 * ```js
 * const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined
 * if (turn?.status !== 'closed') return null
 * ```
 *
 * where 0.1.7-rc.2 read `if (turn?.start === undefined && turn?.status !== 'closed') return null` — a
 * running Turn still rendered its disclosure, and therefore still published
 * `data-turn-process-tool-calls` / `-messages` / `-subagents` on the button.
 * In 0.2.0 the running Turn is represented by a separate `RunningStatus`
 * component instead (`div[data-chat-running]`, "深度求索中，用时 4分13秒 ···"),
 * and the process-group container is left empty:
 * `<div data-chat-flow-kind="turn-process"><div data-slot="conversation.chat.node" style="display:contents"></div></div>`.
 * `RunningStatus` receives only `startTime`, so while a Turn runs the DOM holds
 * no counts at all and `turn-process-counts.ts` has nothing to append to.
 *
 * ## How this gets them back
 *
 * 0.2.0 made the Event → Node pipeline a published plugin contract:
 * `ctx.uiConversation.events.register(definition)` takes a
 * `ConversationNodeDefinition` whose `match` / `start` / `update` see the raw
 * Session events, and returns an idempotent disposer. This module registers one
 * state-only Definition (no `target`, no `buildViewNode`) and keeps a reducer
 * that counts the way the host's own `turnProcessDefinition` does
 * (`updateProcessState` in `dsh-client-ui-chat`): the same three tallies and the
 * same "a subagent delegation is not a tool call" rule.
 *
 * Two consequences worth stating plainly:
 *
 * - The numbers are the host's numbers, not a DOM estimate. `toolCallCount` and
 *   `subagentCount` are identical on both paths; `messageCount` is the running
 *   total while the Turn is open and is recomputed by the host when the final
 *   answer lands — that one recomputation is a visible step, and 0.1.7 had the
 *   same step, so this restores the historical behaviour rather than inventing
 *   a new one.
 * - The reducer lives here instead of being read from the host because the
 *   host does not export it. `@deepseek-ai/dsh-client-ui-chat` publishes only
 *   its settings surface plus its renderer; the three helpers ported below
 *   (`eventTurn`, `isSubagentDelegationTool`, the visible-reply test) are
 *   private to that bundle. Each is a few lines, and each carries a pointer to
 *   the host code it mirrors so a future host change is traceable.
 *
 * It is a port, not a copy of the whole reducer: the host also keeps
 * `messageCountByStep` and a set of anchor sequences to decide WHERE its process
 * disclosure sits in the transcript. None of that changes a number while a Turn
 * is open — the per-step map is only read by the host's answer-time
 * recomputation — so it is left out here, and the host remains the only thing
 * that decides the settled figures.
 *
 * A host without `uiConversation` (an older or trimmed build) leaves this
 * inert, and the DOM half of the tweak keeps working on settled Turns.
 *
 * @module dsh-style-tweaks/client/tweaks/turn-count-stream
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only imports: the first activates the `Context` declaration merge that
// types `ctx.uiConversation`, the second is the event union the Definition
// contract is written against.
import type {
  ConversationMatchResult,
  ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'

/**
 * The three tallies 0.1.6's process-group label was built from, in its order.
 * Field names match the host's node data so the two paths stay comparable.
 */
export interface TurnCounts {
  /** Appended assistant messages carrying visible reply content. */
  readonly messageCount: number
  /** Tool calls, excluding subagent delegations. */
  readonly toolCallCount: number
  /** Subagent delegations. */
  readonly subagentCount: number
}

/**
 * The Definition's own state: the tallies, plus the sequence number they have
 * been folded through.
 *
 * `foldedThrough` is the guard that makes a reload-safe rebuild safe. `start`
 * folds `context.matches` so a Turn already running when the page loaded does
 * not restart at zero, and the engine may then hand that same evidence window
 * to `update` as well — measured on 0.2.0-rc.1, where a three-call turn
 * reported six and one message reported two. Sequence numbers are monotonic per
 * Session and every event carries one, so dropping a match at or below the
 * watermark is right in both worlds: a genuinely new event is always above it,
 * and a re-delivered one never counts twice.
 */
interface TurnCountState {
  readonly counts: TurnCounts
  readonly foldedThrough: number
}

/** An empty tally set folded through nothing. */
function emptyState(): TurnCountState {
  return { counts: { messageCount: 0, toolCallCount: 0, subagentCount: 0 }, foldedThrough: 0 }
}

/**
 * The Turn whose counts are currently on screen, and the event time that
 * decided it. The DOM half reads this: a settled Turn's counts are the host's
 * own `data-turn-process-*` attributes, so only an open Turn is published.
 *
 * The discriminator is `time`, not the Turn number, and that matters because
 * Turn numbers are per-Session: session A's tenth turn and session B's tenth
 * turn share a number, and a page can hold a running session while the user
 * opens a finished one beside it. Event times are Unix epoch milliseconds and
 * therefore order correctly across sessions, so replaying an older session's
 * history cannot displace the live Turn's tallies.
 */
interface OpenTurnCounts {
  readonly turn: number
  readonly time: number
  readonly counts: TurnCounts
}

/** Notified whenever the running Turn's tallies change. */
export type TurnCountsListener = (counts: TurnCounts | null) => void

/**
 * Module-level so the DOM half reads a plain value: the stream is registered
 * once per bundle instance, and `turn-process-counts.ts` subscribes to it
 * rather than reaching back into the Conversation registries.
 */
let open: OpenTurnCounts | null = null
const listeners = new Set<TurnCountsListener>()

/**
 * Live registrations, so releasing one does not clear the tally while another
 * is still folding.
 *
 * This is not defensive padding: the tweak's setup runs more than once (a
 * settings snapshot arrives after the first mount and remounts it), and the old
 * instance's disposer used to clear `open` unconditionally. The visible result
 * was the running tally blinking out on every settings change and — when the
 * engine did not rebuild the new Definition's Context for the Turn already in
 * flight — never coming back until that Turn ended.
 */
let registrations = 0

/**
 * The running Turn's tallies, or `null` while no Turn is open (before the first
 * `turn/start`, after `turn/end`, and when the stream is not registered).
 * @returns The counts a running process group should display.
 */
export function currentTurnCounts(): TurnCounts | null {
  return open?.counts ?? null
}

/**
 * Observe the running Turn's tallies.
 * @param listener - Called with the new counts, or `null` once none are running.
 * @returns The unsubscribe function.
 */
export function subscribeTurnCounts(listener: TurnCountsListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  const counts = currentTurnCounts()
  for (const listener of [...listeners]) listener(counts)
}

/**
 * The Turn an event belongs to, or `undefined` for an event that carries none.
 * Mirrors the host's `eventTurn`.
 * @param event - One session event.
 * @returns The Turn number, when the event names one.
 */
function eventTurn(event: SessionEventLike): number | undefined {
  const data: unknown = event.data
  if (typeof data !== 'object' || data === null) return undefined
  const turn = (data as { readonly turn?: unknown }).turn
  return typeof turn === 'number' ? turn : undefined
}

/**
 * Whether a tool call creates or forks a subagent. Mirrors the host's
 * `isSubagentDelegationTool` (`dsh-client-ui-chat`): delegation is counted as a
 * subagent, never as a tool call.
 * @param name - Durable tool-call name.
 * @returns Whether the call creates or forks a subagent.
 */
function isSubagentDelegationTool(name: string): boolean {
  return name === 'subagent' || name.startsWith('subagent_')
}

/**
 * One assistant message's content blocks, as far as this plugin can see them.
 *
 * A structural type rather than the host's `ContentBlock`, and the reason is
 * not "the LLM package is not a dependency" (it could be derived from
 * `SessionEventLike`): it is that the CLIENT BUILD cannot resolve the host
 * types behind that alias. `tsconfig.client.json` maps each host subpath
 * explicitly and uses node10 resolution, which ignores package `exports` — so
 * `@deepseek-ai/dsh-session/types`, one hop past
 * `@deepseek-ai/dsh-api-session-controller/client`, resolves to nothing and
 * `SessionEventLike` degrades to `any`. Adding the two missing `paths` entries
 * makes the real union available, and it immediately surfaces an unrelated
 * pre-existing error in `turn-time-pill.tsx` (`Property 'binding' does not
 * exist on type 'SessionStore'`) — so that mapping is a repository-wide
 * decision, not one to smuggle in with a feature.
 *
 * The cost of going structural is that a host that reshapes `text` would still
 * compile here, so the `typeof` guard below is what keeps a reshaped block from
 * throwing inside a reducer rather than merely miscounting.
 * @param content - One assistant message's raw content blocks.
 * @returns Whether the message should raise the message tally.
 */
function hasVisibleReply(content: readonly { readonly type: string; readonly text?: unknown }[]): boolean {
  return content.some(block => {
    if (block.type === 'reasoning' || block.type === 'tool-call') return false
    if (block.type === 'text') return typeof block.text === 'string' && block.text.trim() !== ''
    return true
  })
}

/**
 * Fold one event into the state. The host's `updateProcessState` minus its
 * anchor bookkeeping (`assistantStartByStep`, `controlAnchorSeq`, …) and minus
 * its `messageCountByStep` map, which only feeds the host's answer-time
 * recomputation of `messageCount` — a recomputation that lands at or after
 * `turn/end`, once the host is no longer asking this Definition for anything.
 *
 * The watermark advances for EVERY event, counted or not: "folded through seq
 * N" has to mean "this Context has seen everything up to N", or the invariant
 * quietly depends on a counting event being last in every batch.
 * @param state - State before this event.
 * @param event - The event to fold in.
 * @returns The next state. A new object even when the event carries no count,
 *   because the watermark still has to move.
 */
function foldEvent(state: TurnCountState, event: SessionEventLike): TurnCountState {
  const counts = state.counts
  const foldedThrough = Math.max(state.foldedThrough, event.seq)
  if (event.type === 'assistant/message' && event.surfaceOp === 'append' && hasVisibleReply(event.data.message.content)) {
    return { counts: { ...counts, messageCount: counts.messageCount + 1 }, foldedThrough }
  }
  if (event.type === 'tool/call') {
    const subagent = isSubagentDelegationTool(event.data.name)
    return {
      counts: {
        ...counts,
        toolCallCount: counts.toolCallCount + (subagent ? 0 : 1),
        subagentCount: counts.subagentCount + (subagent ? 1 : 0),
      },
      foldedThrough,
    }
  }
  return { counts, foldedThrough }
}

/**
 * Record the tallies for the Turn an event belongs to, and wake the DOM half
 * when they actually changed.
 *
 * ## What "the running Turn" means here
 *
 * `open` is ONE value for the whole page, which is sound for the host DSH
 * actually ships — one conversation view, one `RunningStatus` — and is a
 * documented simplification beyond that. Two consequences, stated rather than
 * hidden:
 *
 * - Whichever session most recently emitted an event owns `open`, and a second
 *   session's events are dropped by the timestamp guard until this one ends.
 *   Replaying an OLDER session cannot displace the live Turn, but a NEWER one
 *   does, exactly as effectively.
 * - Turn numbers are per-Session, so two sessions can both be on turn 5. A
 *   monotonicity guard ("never let a same-numbered Turn publish a smaller
 *   tally") was tried here and removed: it does not fix the case — it converts
 *   a visible misreport into a silent freeze for the whole of the second
 *   session's turn, which is worse to diagnose than a wrong number that visibly
 *   moves. Its supposed beneficiary turned out not to exist: a Definition
 *   registered mid-Turn is handed the Turn's whole history through `start`, so
 *   it publishes a COMPLETE tally rather than a partial one. Measured on
 *   0.2.0-rc.1 by toggling the setting off and on mid-Turn: the tally came back
 *   to the full current value (34 calls) 343 ms later, not to zero.
 *
 * @param event - The event just folded in.
 * @param state - The state after folding.
 */
function publish(event: SessionEventLike, state: TurnCountState): void {
  const turn = eventTurn(event)
  const counts = state.counts
  if (turn === undefined) return
  // An older session's replay carries older timestamps, and must not win.
  if (open !== null && event.time < open.time) return
  if (event.type === 'turn/end') {
    open = null
    notify()
    return
  }
  if (
    open !== null
    && open.turn === turn
    && open.counts.messageCount === counts.messageCount
    && open.counts.toolCallCount === counts.toolCallCount
    && open.counts.subagentCount === counts.subagentCount
  ) {
    return
  }
  open = {
    turn,
    time: event.time,
    counts: {
      messageCount: counts.messageCount,
      toolCallCount: counts.toolCallCount,
      subagentCount: counts.subagentCount,
    },
  }
  notify()
}

/**
 * `globalThis` key of the registration counter. A fresh bundle instance starts
 * with fresh module state, so this cannot live in module scope — see
 * {@link createDefinition}.
 */
const DEFINITION_SEQ_KEY = '__cst_turn_count_seq__'

/**
 * Build one registration's Definition.
 *
 * A fresh Definition per call, with a `kind` no other registration uses, which
 * is what the contract asks for: `ConversationEventRegistry.register` takes "a
 * uniquely named business Definition", and the engine keys a Context by
 * `conversationContextKey(kind, id)`. This plugin's setup legitimately runs more
 * than once — a settings snapshot arrives after the first mount and remounts
 * the tweak — so two registrations coexisting is a live path, and a shared
 * identity would let them tread on each other's state. A per-registration kind
 * costs nothing: the tally lives in this module, not in the Definition.
 * @returns A Definition that shares no Context with any other registration.
 */
function createDefinition(): ConversationNodeDefinition<TurnCountState> {
  // The counter lives on `globalThis`, not in module scope, and that is the whole
  // point: a hot-reloaded bundle is a FRESH module instance, so a module-level
  // counter hands the second instance the same `cst-turn-counts-1` the first
  // already owns — and the host's `registerDefinition` answers a duplicate kind
  // with `throw new Error('conversation Definition "…" is already registered')`
  // (`dsh-client-ui-conversation/lib/client.js`, `registerDefinition`). The throw
  // is swallowed below, so the whole stream would silently never register and
  // the only trace would be one console line. `style-node.ts` keeps its counter
  // on `globalThis` for exactly this reason; a bundle handover is an ordering
  // the HMR receiver does not document, so it must not be leaned on.
  const counter = globalThis as unknown as Record<string, number | undefined>
  const next = (counter[DEFINITION_SEQ_KEY] ?? 0) + 1
  counter[DEFINITION_SEQ_KEY] = next
  const kind = `cst-turn-counts-${next}`
  return {
    kind,
    // EVERY matched event claims the `start` role, and that is not a
    // simplification — it is what keeps a Turn whose `turn/start` falls outside
    // the loaded window from being counted at all. The engine adopts a start
    // only while `context.start === undefined` (`acceptMatch`: `const starting =
    // role === 'start' && context.start === void 0`), so once the real
    // `turn/start` has arrived every later event falls through to `update`
    // regardless of the role it claims. Without this, a window that begins
    // mid-Turn leaves the Context with no start, and the engine then never
    // calls `update` at all (`else if (context.state !== void 0)`) — the whole
    // Turn stays uncounted while the host counts it through `fallbackState`.
    // The host's own `turnMaxTokensDefinition` claims the same role on a
    // `turn/end` for the same reason.
    match(event): ConversationMatchResult | null {
      if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
      if (event.type === 'assistant/message' || event.type === 'tool/call' || event.type === 'turn/end') {
        const turn = eventTurn(event)
        return turn === undefined ? null : { id: String(turn), role: 'start' }
      }
      return null
    },
    start(context, match): TurnCountState {
      // `context.matches` is every match the engine has collected for this
      // Context, in event order, so folding it back in rebuilds a Turn that was
      // already running when the page loaded — a reload must not restart the
      // tally at zero.
      //
      // The host does NOT do this: its `turnProcessDefinition.start` returns an
      // empty state, and its `fallbackState` is a `context.state ?? …` backstop
      // that only fires when a Context never got one — which is the start-less
      // case this `match` handles above, not this one. Folding here is the
      // deliberate extra step that buys reload-safety, and the `foldedThrough`
      // watermark is its price: `replayContext` hands `matches[1..]` to `update`
      // right after this returns, so without the watermark a three-call turn
      // reports six.
      let state = emptyState()
      for (const evidence of context.matches) state = foldEvent(state, evidence.event)
      // A Turn whose `turn/end` is already inside the window is settled; its
      // numbers belong on the header the host renders, not on the running
      // indicator, and publishing them would park a finished tally there until
      // the next Turn emits.
      const settled = context.matches.some(evidence => evidence.event.type === 'turn/end')
      if (!settled) publish(match.event, state)
      return state
    },
    update(context: ConversationNodeContext<TurnCountState> & { readonly state: TurnCountState }, match) {
      // Evidence `start` already folded, re-delivered by the engine: counting
      // it again is what turned a three-call turn into six. Returning the
      // current state is not an optimisation here, it is the correction.
      if (match.event.seq <= context.state.foldedThrough) return context.state
      const next = foldEvent(context.state, match.event)
      publish(match.event, next)
      return next
    },
  }
}

/**
 * Register the live tally stream on the host's Conversation registry.
 *
 * `ctx.inject`, not a property read: cordis refuses a service the fiber never
 * declared — `cannot get property "uiConversation" without inject` — and
 * declaring it in the plugin's own `inject` export would instead make the WHOLE
 * plugin wait on a service an older host may not have. A local inject is both
 * legal and the inert case this file documents: on a host without the
 * Conversation contract the callback simply never runs, and the disposer is a
 * no-op.
 * @param ctx - Client context owning the Conversation service.
 * @returns The disposer that unregisters the Definition and clears the stream.
 */
export function registerTurnCountStream(ctx: ClientContext): () => void {
  const definition = createDefinition()
  // A list, not a single slot: cordis re-runs an inject callback when the
  // service it waits on is re-provided, and a second run would overwrite the
  // first `dispose` — leaving that registration in the registry forever, with
  // `registrations` already counting it and `open` never cleared again.
  const releases: (() => void)[] = []
  let stopped = false
  const fiber = ctx.inject(['uiConversation'], (child) => {
    let dispose: (() => void) | undefined
    try {
      dispose = child.uiConversation.events.register(definition)
    } catch (error) {
      // A duplicate kind means an earlier bundle instance is still registered.
      // Report it loudly rather than leaving a stream that silently never runs.
      console.error('[dsh-style-tweaks] turn-count-stream registration failed', error)
      return
    }
    registrations += 1
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      dispose?.()
      // Only the LAST release clears the tally: another registration may be
      // folding the same Turn, and clearing under it would blank the running
      // count.
      registrations -= 1
      if (registrations > 0 || open === null) return
      open = null
      notify()
    }
    // The disposer may have run while this callback was still queued. Disposing
    // the fiber below is meant to cancel an un-run callback, but the ordering is
    // not documented, so the callback checks the flag instead of trusting it.
    if (stopped) {
      release()
      return
    }
    releases.push(release)
  })
  return () => {
    if (stopped) return
    stopped = true
    void fiber.dispose()
    while (releases.length > 0) releases.pop()?.()
  }
}
