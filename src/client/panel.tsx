/**
 * dsh-style-tweaks — the Settings panel.
 *
 * One `settings.section` page: the column-width control, the opt-in tweak
 * toggles (generated from the registry), the right-sidebar and history
 * axes, and the closed-Workspace list. Rendered as a plugin slot; all of its
 * state comes from the {@link SettingsClient} it is handed.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocaleKey, Translate } from './i18n.ts'
import { SettingsClient } from './settings-client.ts'
import { isDesktopRuntime, resolveValue } from './settings-value.ts'
import { MIN_DIALOG_WIDTH, MAX_DIALOG_WIDTH, MIN_SIDE_MARGIN, MIN_RIGHTBAR_WIDTH_PERCENT, MAX_RIGHTBAR_WIDTH_PERCENT, MIN_HISTORY_PAGE_SIZE, MAX_HISTORY_PAGE_SIZE, STEP_HISTORY_PAGE_SIZE } from './tweak-config.ts'
import { TWEAKS, type TweakDescriptor } from './tweaks/registry.ts'
import { closedWorkspaceEntries, restoreClosedWorkspace } from './tweaks/workspace-close.ts'

/**
 * Hover/focus hint: a small ⓘ next to the field label; the hint text renders
 * in a fixed-position bubble portaled to <body> (so panel `overflow:hidden`
 * can never clip it), measured in a layout effect to prefer the space above
 * the anchor and flip below near the viewport top. No layout shift: hints
 * never occupy flow height.
 */
function Hint({ text }: { text: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const pop = popRef.current
    if (anchor === undefined || pop === null) return
    let left = Math.min(Math.max(8, anchor.left), window.innerWidth - pop.offsetWidth - 8)
    let top = anchor.top - pop.offsetHeight - 8
    if (top < 8) top = anchor.bottom + 8
    setPos({ top, left })
  }, [open])
  return (
    <>
      <span
        ref={anchorRef}
        className="cst-hint"
        role="note"
        aria-label={text}
        tabIndex={0}
        onMouseEnter={() => { setOpen(true) }}
        onMouseLeave={() => { setOpen(false) }}
        onFocus={() => { setOpen(true) }}
        onBlur={() => { setOpen(false) }}
      >i</span>
      {open && createPortal(
        <div ref={popRef} className="cst-hint-pop" style={{ top: pos.top, left: pos.left }}>{text}</div>,
        document.body,
      )}
    </>
  )
}

type SettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'style-tweaks'> & {
  controller: SettingsClient
  t: Translate
}

export function SettingsSection({ controller, t }: SettingsSectionProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const resolved = resolveValue(state.value)
  const writable = state.writable
  /** Save feedback for the top-of-panel pill; `seq` re-arms the auto-dismiss on every save. */
  const [snack, setSnack] = useState<{ kind: 'saving' | 'applied' | 'unavailable'; seq: number } | undefined>(undefined)
  const [savingShown, setSavingShown] = useState(false)
  const latestSave = useRef(0)

  useEffect(() => { if (state.status === 'loading' && state.value === undefined) void controller.load() }, [controller, state.status, state.value])
  // "Saving…" only appears once the request actually lags (the 502/503 retry
  // window); a fast round-trip jumps straight to the terminal state.
  useEffect(() => {
    if (snack?.kind !== 'saving') { setSavingShown(false); return }
    const timer = setTimeout(() => { setSavingShown(true) }, 350)
    return () => { clearTimeout(timer) }
  }, [snack])
  useEffect(() => {
    if (snack === undefined || snack.kind === 'saving') return
    const timer = setTimeout(() => { setSnack(undefined) }, 1800)
    return () => { clearTimeout(timer) }
  }, [snack])

  const save = (field: string, value: unknown): void => {
    const seq = ++latestSave.current
    setSnack({ kind: 'saving', seq })
    controller.set(field, value).then(() => {
      // A newer save supersedes this one's outcome.
      if (seq === latestSave.current) setSnack({ kind: 'applied', seq })
    }).catch(() => {
      if (seq === latestSave.current) setSnack({ kind: 'unavailable', seq })
    })
  }

  const [widthDraft, setWidthDraft] = useState<string>(String(resolved.dialogWidth))
  const [marginDraft, setMarginDraft] = useState<string>(String(resolved.sideMargin))
  const [rightbarWidthDraft, setRightbarWidthDraft] = useState<string>(String(resolved.rightbarWidthPercent))
  const [historyPageSizeDraft, setHistoryPageSizeDraft] = useState<string>(String(resolved.historyPageSize))

  useEffect(() => { setWidthDraft(String(resolved.dialogWidth)) }, [resolved.dialogWidth])
  useEffect(() => { setMarginDraft(String(resolved.sideMargin)) }, [resolved.sideMargin])
  useEffect(() => { setRightbarWidthDraft(String(resolved.rightbarWidthPercent)) }, [resolved.rightbarWidthPercent])
  useEffect(() => { setHistoryPageSizeDraft(String(resolved.historyPageSize)) }, [resolved.historyPageSize])

  const commitDialogWidth = (raw: string): void => {
    setWidthDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, Math.round(parsed)))
    setWidthDraft(String(clamped))
    save('dialogWidth', clamped)
  }

  const stepDialogWidth = (delta: number): void => {
    const next = Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, resolved.dialogWidth + delta))
    setWidthDraft(String(next))
    save('dialogWidth', next)
  }

  const applyWidthPreset = (width: number): void => {
    setWidthDraft(String(width))
    save('dialogWidth', width)
  }

  const setUsePluginWidth = (value: boolean): void => {
    save('usePluginWidth', value)
  }

  const commitSideMargin = (raw: string): void => {
    setMarginDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.max(MIN_SIDE_MARGIN, Math.round(parsed))
    setMarginDraft(String(clamped))
    save('sideMargin', clamped)
  }

  const stepSideMargin = (delta: number): void => {
    const next = Math.max(MIN_SIDE_MARGIN, resolved.sideMargin + delta)
    setMarginDraft(String(next))
    save('sideMargin', next)
  }

  const setRightbarInitialWidth = (value: boolean): void => {
    save('rightbarInitialWidth', value)
  }

  const commitRightbarWidth = (raw: string): void => {
    setRightbarWidthDraft(raw)
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.min(MAX_RIGHTBAR_WIDTH_PERCENT, Math.max(MIN_RIGHTBAR_WIDTH_PERCENT, Math.round(parsed)))
    setRightbarWidthDraft(String(clamped))
    save('rightbarWidthPercent', clamped)
  }

  const stepRightbarWidth = (delta: number): void => {
    const next = Math.min(MAX_RIGHTBAR_WIDTH_PERCENT, Math.max(MIN_RIGHTBAR_WIDTH_PERCENT, resolved.rightbarWidthPercent + delta))
    setRightbarWidthDraft(String(next))
    save('rightbarWidthPercent', next)
  }

  const applyRightbarWidthPreset = (percent: number): void => {
    setRightbarWidthDraft(String(percent))
    save('rightbarWidthPercent', percent)
  }

  const commitHistoryPageSize = (raw: string): void => {
    setHistoryPageSizeDraft(raw)
    // An emptied field — or one typed below the floor — must not silently
    // commit the minimum: 50 is not just the smallest page here, it is the
    // host's own native value (`applyPageSize` in tweaks/history-page-size.ts
    // sets `maxMessages` and `turnWindow.minMessages` to the target; 50 is the
    // 50-message minimum DSH already sent), so committing it asks for exactly
    // what the host was doing anyway and the feature reads ON while changing
    // nothing. A half-typed "3" on the way to "300" would look like the tweak
    // had switched itself off. Revert to the stored size instead. (Unlike the
    // other numeric fields, clamping is not a harmless no-op here — that is the
    // whole difference.) The cold-start row below is NOT part of this: it is
    // gated by `historyPageSizeEnabled` alone, never by the size.
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed < MIN_HISTORY_PAGE_SIZE) {
      setHistoryPageSizeDraft(String(resolved.historyPageSize))
      return
    }
    const clamped = Math.min(MAX_HISTORY_PAGE_SIZE, Math.round(parsed))
    setHistoryPageSizeDraft(String(clamped))
    save('historyPageSize', clamped)
  }

  const stepHistoryPageSize = (delta: number): void => {
    const next = Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(MIN_HISTORY_PAGE_SIZE, resolved.historyPageSize + delta))
    setHistoryPageSizeDraft(String(next))
    save('historyPageSize', next)
  }

  const setHistoryPageSizeColdStart = (value: boolean): void => {
    save('historyPageSizeColdStart', value)
  }

  const setTweak = (tweak: TweakDescriptor, value: boolean): void => {
    save(tweak.settingKey, value)
  }

  if (state.status === 'loading' && state.value === undefined) {
    return <div className="cst-settings"><div className="cst-loading">{t('loading')}</div></div>
  }
  if (state.status === 'error') {
    // The real reason is shown, not just "unavailable": the failure this branch
    // most often catches is a route that was not registered yet, and that is
    // worth saying out loud. A retry is offered because the failure window is
    // transient by nature — `load()` re-arms on call, and a success clears the
    // error with it, so the panel is not stuck until the page is reloaded.
    return (
      <div className="cst-settings">
        <div className="cst-alert error">
          <div>{t('unavailable')}</div>
          {state.error === undefined ? null : <div className="cst-alert-detail">{state.error}</div>}
          <button type="button" className="cst-btn" onClick={() => { void controller.load() }}>{t('retry')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cst-settings">
      <header className="cst-settings-header">
        <div className="cst-logo">🎨</div>
        <div>
          <h2>{t('settingsTitle')}</h2>
          <p>{t('settingsIntro')}</p>
        </div>
      </header>
      <div className="cst-status">
        {snack === undefined || (snack.kind === 'saving' && !savingShown) ? null : (
          <div className={'cst-snack cst-snack-' + snack.kind} role="status" aria-live="polite">
            <span className="cst-snack-dot" aria-hidden="true" />
            <span>{t(snack.kind)}</span>
          </div>
        )}
      </div>
      {!writable ? <div className="cst-alert warning">{t('readOnly')}</div> : null}

      <section className="cst-panel">
        <div className="cst-section-label">{t('sectionLayout')}</div>
        <div className="cst-field">
          <div className="cst-field-top">
            <span className="cst-label">{t('usePluginWidth')}<Hint text={t('usePluginWidthHint')} /></span>
            <div className="cst-controls">
              <div className="cst-seg">
                <button type="button" className={resolved.usePluginWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setUsePluginWidth(true) }}>{t('usePluginWidthOn')}</button>
                <button type="button" className={!resolved.usePluginWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setUsePluginWidth(false) }}>{t('usePluginWidthOff')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.usePluginWidth ? (
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('dialogWidth')}<Hint text={t('dialogWidthHint')} /></span>
              <div className="cst-controls">
                <div className="cst-stepper">
                  <button type="button" aria-label="−" disabled={!writable || resolved.dialogWidth <= MIN_DIALOG_WIDTH} onClick={() => { stepDialogWidth(-20) }}>−</button>
                  <input
                    type="number"
                    min={MIN_DIALOG_WIDTH}
                    max={MAX_DIALOG_WIDTH}
                    step={20}
                    value={widthDraft}
                    disabled={!writable}
                    onChange={(event) => { setWidthDraft(event.target.value) }}
                    onBlur={(event) => { commitDialogWidth(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitDialogWidth((event.target as HTMLInputElement).value) }}
                  />
                  <button type="button" aria-label="+" disabled={!writable || resolved.dialogWidth >= MAX_DIALOG_WIDTH} onClick={() => { stepDialogWidth(20) }}>+</button>
                </div>
              </div>
            </div>
            <div className="cst-presets">
              <div className="cst-seg">
                <button type="button" className={resolved.dialogWidth === 880 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(880) }}>{t('presetWide')} · 880</button>
                <button type="button" className={resolved.dialogWidth === 1024 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(1024) }}>{t('presetWideXl')} · 1024</button>
                <button type="button" className={resolved.dialogWidth === 748 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyWidthPreset(748) }}>{t('presetDefault')} · 748</button>
              </div>
            </div>
          </div>
        ) : null}
        {resolved.usePluginWidth ? (
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('sideMargin')}<Hint text={t('sideMarginHint')} /></span>
              <div className="cst-controls">
                <div className="cst-stepper">
                  <button type="button" aria-label="−" disabled={!writable || resolved.sideMargin <= MIN_SIDE_MARGIN} onClick={() => { stepSideMargin(-4) }}>−</button>
                  <input
                    type="number"
                    min={MIN_SIDE_MARGIN}
                    step={4}
                    value={marginDraft}
                    disabled={!writable}
                    onChange={(event) => { setMarginDraft(event.target.value) }}
                    onBlur={(event) => { commitSideMargin(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitSideMargin((event.target as HTMLInputElement).value) }}
                  />
                  <button type="button" aria-label="+" disabled={!writable} onClick={() => { stepSideMargin(4) }}>+</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="cst-field">
          <div className="cst-field-top">
            <span className="cst-label">{t('rightbarInitialWidth')}<Hint text={t('rightbarInitialWidthHint')} /></span>
            <div className="cst-controls">
              <div className="cst-seg">
                <button type="button" className={resolved.rightbarInitialWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setRightbarInitialWidth(true) }}>{t('tweakOn')}</button>
                <button type="button" className={!resolved.rightbarInitialWidth ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setRightbarInitialWidth(false) }}>{t('tweakOff')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.rightbarInitialWidth ? (
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('rightbarWidthPercent')}<Hint text={t('rightbarWidthPercentHint')} /></span>
              <div className="cst-controls">
                <div className="cst-stepper">
                  <button type="button" aria-label="−" disabled={!writable || resolved.rightbarWidthPercent <= MIN_RIGHTBAR_WIDTH_PERCENT} onClick={() => { stepRightbarWidth(-5) }}>−</button>
                  <input
                    type="number"
                    min={MIN_RIGHTBAR_WIDTH_PERCENT}
                    max={MAX_RIGHTBAR_WIDTH_PERCENT}
                    step={5}
                    value={rightbarWidthDraft}
                    disabled={!writable}
                    onChange={(event) => { setRightbarWidthDraft(event.target.value) }}
                    onBlur={(event) => { commitRightbarWidth(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitRightbarWidth((event.target as HTMLInputElement).value) }}
                  />
                  <button type="button" aria-label="+" disabled={!writable || resolved.rightbarWidthPercent >= MAX_RIGHTBAR_WIDTH_PERCENT} onClick={() => { stepRightbarWidth(5) }}>+</button>
                </div>
              </div>
            </div>
            <div className="cst-presets">
              <div className="cst-seg">
                <button type="button" className={resolved.rightbarWidthPercent === 30 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(30) }}>30%</button>
                <button type="button" className={resolved.rightbarWidthPercent === 40 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(40) }}>40%</button>
                <button type="button" className={resolved.rightbarWidthPercent === 45 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(45) }}>{t('presetDefault')} · 45%</button>
                <button type="button" className={resolved.rightbarWidthPercent === 55 ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { applyRightbarWidthPreset(55) }}>55%</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {isDesktopRuntime() ? (
        <section className="cst-panel">
          <div className="cst-section-label">{t('sectionDesktop')}</div>
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('desktopSettingsLauncher')}<Hint text={t('desktopSettingsLauncherHint')} /></span>
              <div className="cst-controls">
                <div className="cst-seg">
                  <button type="button" className={resolved.desktopSettingsLauncher ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { save('desktopSettingsLauncher', true) }}>{t('tweakOn')}</button>
                  <button type="button" className={!resolved.desktopSettingsLauncher ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { save('desktopSettingsLauncher', false) }}>{t('tweakOff')}</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="cst-panel">
        <div className="cst-section-label">{t('sectionHistory')}</div>
        <div className="cst-field">
          <div className="cst-field-top">
            <span className="cst-label">{t('historyPageSizeEnabled')}<Hint text={t('historyPageSizeEnabledHint')} /></span>
            <div className="cst-controls">
              <div className="cst-seg">
                <button type="button" className={resolved.historyPageSizeEnabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { save('historyPageSizeEnabled', true) }}>{t('tweakOn')}</button>
                <button type="button" className={!resolved.historyPageSizeEnabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { save('historyPageSizeEnabled', false) }}>{t('tweakOff')}</button>
              </div>
            </div>
          </div>
        </div>
        {resolved.historyPageSizeEnabled ? (
          <>
            <div className="cst-field">
              <div className="cst-field-top">
                <span className="cst-label">{t('historyPageSize')}<Hint text={t('historyPageSizeHint')} /></span>
                <div className="cst-controls">
                  <div className="cst-stepper">
                    <button type="button" aria-label="−" disabled={!writable || resolved.historyPageSize <= MIN_HISTORY_PAGE_SIZE} onClick={() => { stepHistoryPageSize(-STEP_HISTORY_PAGE_SIZE) }}>−</button>
                    <input
                      type="number"
                      min={MIN_HISTORY_PAGE_SIZE}
                      max={MAX_HISTORY_PAGE_SIZE}
                      step={STEP_HISTORY_PAGE_SIZE}
                      value={historyPageSizeDraft}
                      disabled={!writable}
                      onChange={(event) => { setHistoryPageSizeDraft(event.target.value) }}
                      onBlur={(event) => { commitHistoryPageSize(event.target.value) }}
                      onKeyDown={(event) => { if (event.key === 'Enter') commitHistoryPageSize((event.target as HTMLInputElement).value) }}
                    />
                    <button type="button" aria-label="+" disabled={!writable || resolved.historyPageSize >= MAX_HISTORY_PAGE_SIZE} onClick={() => { stepHistoryPageSize(STEP_HISTORY_PAGE_SIZE) }}>+</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="cst-field">
              <div className="cst-field-top">
                <span className="cst-label">{t('historyPageSizeColdStart')}<Hint text={t('historyPageSizeColdStartHint')} /></span>
                <div className="cst-controls">
                  <div className="cst-seg">
                    <button type="button" className={resolved.historyPageSizeColdStart ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setHistoryPageSizeColdStart(true) }}>{t('tweakOn')}</button>
                    <button type="button" className={!resolved.historyPageSizeColdStart ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setHistoryPageSizeColdStart(false) }}>{t('tweakOff')}</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="cst-panel">
        <div className="cst-section-label">{t('sectionTweaks')}</div>
        {TWEAKS.map(tweak => {
          const enabled = (resolved as unknown as Record<string, boolean>)[tweak.settingKey] ?? tweak.defaultEnabled
          // Dependent rows drop out of the panel entirely while their gate
          // holds (hidden, never greyed out — the rule the dependent numeric
          // fields already follow). The stored value is untouched.
          if (
            tweak.hiddenWhen !== undefined
            && (resolved as unknown as Record<string, boolean>)[tweak.hiddenWhen.field] === tweak.hiddenWhen.value
          ) {
            return null
          }
          return (
            <div className="cst-field" key={tweak.id}>
              <div className="cst-field-top">
                <span className="cst-label">{t(tweak.titleKey as LocaleKey)}<Hint text={t(tweak.descriptionKey as LocaleKey)} /></span>
                <div className="cst-controls">
                  <div className="cst-seg">
                    <button type="button" className={enabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setTweak(tweak, true) }}>{t('tweakOn')}</button>
                    <button type="button" className={!enabled ? 'cst-seg-active' : ''} disabled={!writable} onClick={() => { setTweak(tweak, false) }}>{t('tweakOff')}</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {resolved.workspaceClose && resolved.closedWorkspaces.length > 0 && (
        <section className="cst-panel">
          <div className="cst-section-label">{t('workspaceCloseClosedSection')}</div>
          <div className="cst-field">
            <div className="cst-field-top">
              <span className="cst-label">{t('workspaceCloseClosedSectionHint')}</span>
            </div>
          </div>
          {closedWorkspaceEntries().map(entry => (
            <div className="cst-field" key={entry.workspaceId}>
              <div className="cst-field-top">
                <span className="cst-label">
                  {entry.title}
                  {/* Same hint affordance as the tweak rows: two Workspaces
                      can share a folder basename, so the folder is what
                      actually tells them apart when restoring. */}
                  {entry.path !== undefined ? <Hint text={entry.path} /> : null}
                </span>
                <div className="cst-controls">
                  <div className="cst-seg">
                    <button
                      type="button"
                      disabled={!writable}
                      onClick={() => {
                        // Local-first, like the close path: the live tweak drops
                        // the id and notifies at once, then persists. `save` is
                        // only the fallback for a window where it is unmounted.
                        if (restoreClosedWorkspace(entry.workspaceId)) return
                        save('closedWorkspaces', resolved.closedWorkspaces.filter(id => id !== entry.workspaceId))
                      }}
                    >{t('workspaceCloseRestore')}</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

/**
 * Sanity-check that every tweak in the registry has matching `titleKey` /
 * `descriptionKey` strings in both `en` and `zh`. Catches "added a tweak
 * but forgot the i18n strings" at apply time instead of as an untranslated
 * label visible to users.
 */
