/**
 * dsh-style-tweaks — conversation-width override (browser half).
 *
 * When the user turns "plugin width control" on, this module:
 *
 * 1. Hides DSH's native 40 px hover drag handles. The handles live in a
 *    CSS-Modules file (`ConversationRoot.module.css`) whose class names are
 *    build-time-hashed, so a global stylesheet cannot target them by class —
 *    it MUST use the stable `data-width-handle` attribute selector.
 *
 * 2. Drives DSH's own shared width axis instead of forking it. The
 *    conversation root declares the single source of truth
 *    (`ConversationRoot.module.css`, `.root`):
 *
 *        --dsh-chat-content-width: var(--dsh-chat-user-width, clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * 0.64), 920px));
 *        --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);
 *
 *    Every consumer — the transcript column (`data-chat-flow`), message
 *    bubbles, wide-table bleed, the back-to-bottom control, the composer
 *    card, and the dock/stats line — reads those two variables, so forcing
 *    `--dsh-chat-user-width` keeps the input card and the conversation area
 *    in lockstep by construction. The plugin never sets max-widths itself.
 *
 * 3. Reproduces DSH's narrow-viewport clamp in CSS. Natively
 *    (`ConversationRoot.tsx`, `resolveContentWidth`) a stored preference is
 *    re-clamped against the live column width — published as
 *    `--dsh-conversation-column-width` by a ResizeObserver — so opening the
 *    sidebar narrows the content instead of letting it overflow. This module
 *    declares the same clamp declaratively on the conversation root:
 *
 *        --dsh-chat-user-width: min(<width>px, max(640px, calc(var(--dsh-conversation-column-width, 99999px) - 2 * <sideMargin>px)));
 *
 *    i.e. the column never claims more than the dialog width, and never
 *    leaves less than `sideMargin` of whitespace on either side; 640px is
 *    DSH's own content floor (CONTENT_MIN). The var() substitution happens
 *    on the conversation root — the same element DSH writes the live column
 *    width on — so the clamp tracks sidebar toggles and window resizes with
 *    zero JS. The declaration is `!important` so it also beats DSH's inline
 *    re-publication of `--dsh-chat-user-width` on the same element.
 *
 * 4. Mirrors the chosen px into the shared localStorage slot
 *    (`dsh.conversation.contentWidth`) so toggling plugin-width OFF surfaces
 *    the user's last choice in the native drag handles — the switch is
 *    value-preserving in both directions.
 *
 * When the user turns the feature OFF, the installer disposes: the handle
 * rule and the width-axis override are removed and the native handles take
 * over from whatever px the user last picked.
 *
 * The conversation root cannot be targeted by a stable attribute of its own
 * (it only carries `data-phase`), so the override anchors on the stable
 * `data-conversation-scroll` descendant: `div:has([data-conversation-scroll])`
 * matches exactly the ancestors of the scroll body, and the innermost
 * declaration that matters — the conversation root — is where DSH publishes
 * the live column width.
 *
 * ## Live-update contract
 *
 * `installConversationWidthStyles` returns a controller. `setWidth` mutates
 * the same `<style>` element in place (no reinstall, no flicker) and is what
 * the live settings subscription in `index.tsx` calls on every change. The
 * `apply` effect MUST keep the same controller alive across settings
 * changes — tearing it down and reinstalling on every tick would race with
 * the user's viewport-driven sidebar drag and miss the very first frame.
 * @module dsh-style-tweaks/client/conversation-width
 */

import { CONVERSATION_WIDTH_STORAGE_KEY } from './tweak-config.ts'
import { claimStyleNode, releaseStyleNode } from './style-node.ts'

/** Stable attribute selector for the native WidthHandle strips (CSS-Modules-hashed class). */
const HANDLE_HIDE_RULE = '[data-width-handle]{display:none !important}'

/** DSH's own content floor (`ConversationRoot.tsx` CONTENT_MIN). */
const CONTENT_MIN_PX = 640

/**
 * CSS injected into <head> while plugin-width is on:
 * - hide the native handles (hashed class → attribute selector)
 * - clamp DSH's user-width preference to the plugin's dialog width, keeping
 *   at least `sideMargin` of whitespace per side as the live column narrows
 * - mirror the raw px on :root (`--dsh-dialog-width-chat-width`) for any
 *   consumer that reads the legacy var from the document root.
 */
function buildWidthCss(widthPx: number, sideMargin: number): string {
  return `
${HANDLE_HIDE_RULE}
div:has([data-conversation-scroll]){--dsh-chat-user-width:min(${widthPx}px, max(${CONTENT_MIN_PX}px, calc(var(--dsh-conversation-column-width, 99999px) - ${sideMargin * 2}px))) !important}
:root{--dsh-dialog-width-chat-width:${widthPx}px}
`
}

export interface ConversationWidthController {
  /** Update the applied width / side margin (px) without reinstalling the stylesheet. */
  setWidth(widthPx: number, sideMargin: number): void
  /** Remove the injected stylesheet + clear the :root var. */
  dispose(): void
}

/**
 * Install the width-override stylesheet. Idempotent: a second call with the
 * same id returns the existing controller.
 * @param widthPx - the plugin's chosen column width in px.
 * @param sideMargin - whitespace in px to keep on each side of the column.
 * @returns a controller exposing `setWidth` + `dispose`.
 */
export function installConversationWidthStyles(widthPx: number, sideMargin: number): ConversationWidthController {
  const id = 'dsh-style-tweaks-conversation-width'
  let style = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${id}"]`)
  if (style === null) {
    style = document.createElement('style')
    style.dataset.plugin = 'dsh-style-tweaks'
    style.dataset.pluginCss = id
    document.head.appendChild(style)
  }
  const owner = claimStyleNode(style)

  // Persist to the shared storage slot so toggling plugin-width off surfaces
  // the user's last choice in the native drag handles.
  try { localStorage.setItem(CONVERSATION_WIDTH_STORAGE_KEY, `${widthPx}`) } catch { /* storage may be disabled; ignore */ }

  // Track the latest applied width so dispose() can seed the conversation
  // root with the value the user most recently picked, not the value at
  // install time (setWidth mutates this; the constructor's widthPx would
  // otherwise be stale across stepper clicks).
  let currentWidth = widthPx

  const apply = (px: number, margin: number): void => {
    style!.textContent = buildWidthCss(px, margin)
    // Belt-and-suspenders: also set the var directly on :root in case any
    // consumer reads the legacy var via JS rather than via CSS cascade.
    document.documentElement.style.setProperty('--dsh-dialog-width-chat-width', `${px}px`)
  }
  apply(widthPx, sideMargin)

  return {
    setWidth: (px: number, margin: number): void => {
      currentWidth = px
      apply(px, margin)
      try { localStorage.setItem(CONVERSATION_WIDTH_STORAGE_KEY, `${px}`) } catch { /* ignore */ }
    },
    dispose: (): void => {
      // Before removing the !important clamp rule, seed --dsh-chat-user-width
      // directly on the conversation root so the column keeps the user's
      // chosen width instead of falling back to DSH's adaptive clamp
      // (resolveContentWidth would otherwise shrink it to fit the live
      // column, which is wrong when the user explicitly chose a wider value
      // and just wants to hand control back to the native drag handles).
      // The root is identified by [data-phase] (ConversationRoot.tsx) and is
      // the same element DSH writes the var on in publishWidths().
      const root = document.querySelector('[data-conversation-scroll]')?.closest<HTMLElement>('[data-phase]') ?? null
      if (root !== null) {
        root.style.setProperty('--dsh-chat-user-width', `${currentWidth}px`)
      }
      releaseStyleNode(style, owner)
      document.documentElement.style.removeProperty('--dsh-dialog-width-chat-width')
    },
  }
}