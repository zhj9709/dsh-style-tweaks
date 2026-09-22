# dsh-style-tweaks

English | [简体中文](README.md)

> Dependency version: deepseek-harness v0.1.5-rc.1

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) web plugin that bundles a precise conversation column-width control with a collection of opt-in style tweaks for DSH's UI — including small fixes for the sidebar and the settings panel.

## Features

### Layout

- **Plugin width control (default off)** — when ON, the plugin's width input / presets drive the conversation column and DSH's native drag handles are hidden; when OFF (default), DSH's native handles own the column and the dialog-width setting is hidden. The last width is kept, so switching back on restores it.
- **Dialog width** — any value between 600 and 1600 px; includes presets 748 (default) / 880 (Wide) / 1024 (Extra wide). Shown only while plugin width control is on.
- **Side margin** — whitespace in px kept on each side of the conversation area while plugin width control is on. The column is clamped to the dialog width and narrows when the sidebar opens or the window shrinks, never hugging the edges. Minimum 32 px. Shown only while plugin width control is on; when it is off, the margin does not apply and DSH's native behavior stands.
- **Fixed think height (default off)** — caps the expanded think (reasoning) body at a fixed height (default 300 px, adjustable 120–1200) and scrolls the overflow, so a long thinking trace stops pushing the rest of the conversation out of view; while a trace is still streaming, the window shows its top and you scroll for the tail. The wheel chains naturally: when the body hits its top/bottom edge or its content fits the window, the wheel scrolls the conversation instead. Folding the row back to one line keeps working as usual. The window gets an always-visible 4px thin scrollbar (same as the settings nav), with a breathing gap between text and bar.
- **Right sidebar initial width (default off, 45%)** — when ON, owns the right sidebar's first-open width: it is written once, the first time the sidebar opens in a page load, as the session frame's width × a percentage (15–70, with 30 / 40 / 45 / 55 presets). A manual drag, and every later open, keeps your own width; a reload applies the percentage again. OFF by default, which leaves DSH's own 45% completely untouched; once ON, the default percentage is that same 45, so nothing changes until the number is edited. DSH still clamps the result into its own range (at least 300 px, at most 70% of the frame), so a conversion below 300 px renders 300 px wide. On pre-0.1.5 hosts the tweak stays inert.

### Tweaks

- **Stable table layout (default on)** — locks table layout on hover so surrounding content does not reflow ("text jumps when I hover a table").
- **Stable turn-navigation rail (default on)** — keeps the turn-navigation rail at a stable position when scrolling up past the first message into the system prompt area (no longer drops by ~16 px).
- **Stable session titles (default off)** — since 0.1.6-alpha.2, hovering a session row smoothly slides an overlong title to its end to reveal the clipped tail, and it snaps back on leaving. This restores the pre-0.1.6-alpha.2 behaviour: the title stays put with its ellipsis at all times; the row's hover card (pause a moment) still shows the full title.
- **Always show turn navigation (default off)** — DSH hides the turn-navigation rail once the chat column's content box reaches 900 px (a container query in `TurnNavigator.module.css` measured against the chat scrollport). Widening the right sidebar is exactly what triggers it: the center column may be squeezed down to 400 px, so the rail disappears over almost the panel's whole usable range. With this ON the rail stays at every chat width; at narrow widths it sits in the scrollport's right gutter and its hover preview covers part of the transcript.
- **Flush code-block top (default on)** — removes the 16 px gap above highlighted code blocks so the code sits flush with the preceding paragraph, list item, or heading.
- **Project running indicator (default on)** — puts the conversation title's animated running dot into the sidebar. One sits on the right side of each project directory (so a busy conversation stays visible even when its group is collapsed), and one fills a session row's status slot whenever that session holds a background job the app's own dot does not cover (when the app does render its own dot there, the tweak steps aside rather than doubling up). A session counts as busy when it is executing a turn, when a background job is still open under it (a `run_in_background` shell command, lit from launch until the job settles), or when a running subagent sits below it in the lineage.
- **Locate current session (default on)** — adds a "locate" button to the left of the native search button in the sidebar's "Workspaces" section header. Clicking it expands the current session's workspace directory (if collapsed) and its "Show {n} more sessions" overflow, then scrolls the session into the sidebar's visible area. Disabled with the tooltip "Open a session first" when no session is open.
- **Scrollable settings nav (default on)** — lets the settings dialog's left menu scroll when its entries outgrow the panel, instead of silently clipping the ones at the bottom (the panel has a fixed height and `overflow: hidden`; stock CSS only gave the right content column a scroll treatment). The scrollbar is an overlay-style thin strip: parked in the rail's spare right padding so it never squeezes the menu, and visible only while the list is actually scrolling, fading out ~0.8 s after scrolling stops.
- **Middle-click closes sidebar tabs (default on)** — since 0.1.5 the right sidebar is a tabbed panel. A middle mouse click on any of its tabs (docked or floating) closes it, the way browser tabs behave. The close rides the host's public `ctx.sidebarRight` close face, so the native rules stay in force: the guide standing as the sole docked tab cannot be closed, and closing the last docked tab collapses the column exactly as its ✕ does. Middle-click autoscroll is suppressed over the strips, and a held middle button can no longer drag or float a tab. On pre-0.1.5 hosts the tweak stays inert.
- **Legacy stats line (default off)** — since DSH 0.1.5 the stats under the input box are two icon pills that open dialogs; this tweak brings back the pre-0.1.5 centered text line (turns/steps · timings · speed · cache hit · tokens). It reads the same durable projections (`sessionStats` / `tokenUsage`) so every figure matches the pills; an overlong line truncates with an ellipsis and reveals itself on hover, and turning the tweak off hands the row straight back to the pills.
- **Cache hit with two decimals (default off)** — shows the composer stats' cache-hit share with two decimal places (e.g. `87.35%`) instead of integer rounding; the token-usage dialog follows. Applies to both presentations — the new icon pills and the legacy text line alike; with both toggles on, the legacy line renders and takes the flag.
- **Turn speed & TTFT (default off)** — since 0.1.5, cold sessions no longer rebuild per-token timing, so each turn's time dialog keeps only the wall-clock duration. Clicking a turn's time pill refills that dialog with the output speed and TTFT rows, rebuilt from the model stream embedded in the session log; history loads get the same figures a live session did.
- **No context pill hover info (default off)** — the context capsule under the input box (a ring gauge plus percentage, new in 0.1.6-alpha.2) floats a "N% of context used" tooltip when hovered. With this on, the hover tooltip no longer appears; the capsule's own hover highlight and its click-open breakdown dialog are untouched, so the full figures stay one click away. Hosts without the capsule leave this inert.
- **Closable workspaces (default off)** — hide a Workspace from the sidebar list and the New Session picker instead of deleting it: the host registry row, its session account, the files on disk and every session log are all kept, the Workspace and every session keep their account position, and **its sessions are hidden with it** (they never fall into Ungrouped, and search stops listing them); restoring the Workspace brings the whole group back. Restore it by re-adding the same folder (the host resolves it by canonical path and returns the same Workspace) or from the "Closed workspaces" list in the Style tweaks settings panel (each entry reveals its folder on hover). The entry sits in each Workspace row's `...` menu, above "Delete workspace", behind a confirmation that spells out what is kept. Three boundaries: a closed Workspace's manual session order is not preserved (sessions show in host account order); closing the Workspace a session is currently open in hands you straight to a new session (in the most recent visible Workspace); and "New session" triggered from a session inside a closed Workspace falls back to the most recent **visible** Workspace (the host's own fallback).

- **Custom history page size (default off)** — DSH loads history 50 messages at a time (a session's first screen, and every "Load earlier" click), so walking back through a long session takes many clicks. When ON, each request carries the configured size (50–1000, default 200); the rewrite happens on the requests the browser sends — the unary `session/page` shared by "Load earlier" and turn jumps, plus the `session/follow` open frame of a session's first screen. Three boundaries: **page sizes are only ever raised** ("Load earlier" asks for 50 and the turn-jump loader for 200, so both follow this value once it exceeds theirs — above 200 every turn jump gets heavier too); **the first screen has its own "Apply to session open too" toggle (default ON)** — turning it off keeps the stock 50-message first screen so cold starts are unaffected and the size only affects "Load earlier"; **the master switch off restores DSH's own behaviour**, keeping the saved size for the next enable.

```yaml
style-tweaks:
  # Layout
  usePluginWidth: false            # default false; true lets the plugin input/presets own the column
  dialogWidth: 748                 # 600–1600 px; shown/effective only while usePluginWidth is on
  sideMargin: 50                   # ≥ 32 px; shown/effective only while usePluginWidth is on
  thinkFixedHeight: false          # default false; true caps the think body at a fixed height and scrolls it
  thinkHeight: 300                 # 120–1200 px; shown/effective only while thinkFixedHeight is on
  rightbarInitialWidth: false      # default false; true lets the plugin own the right sidebar's first-open width
  rightbarWidthPercent: 45         # 15–70; right sidebar first-open width as a percentage of the session frame
  # History loading
  historyPageSizeEnabled: false    # default false; true sends the size below on every history request (the panel's master switch)
  historyPageSize: 200             # 50–1000; shown/effective only while historyPageSizeEnabled is on
  historyPageSizeColdStart: true   # default true; a session's first screen uses that size too; the row hides while the size is 50
  # Tweaks
  stableTable: true                # default true; false disables the tweak
  stableTurnRail: true             # default true; false disables the tweak
  stableSessionTitle: false        # default false; true keeps session titles put with their ellipsis on hover
  keepTurnRail: false              # default false; true keeps the turn-navigation rail at every chat width
  codeBlockFlushTop: true          # default true; false disables the tweak
  projectRunningIndicator: true    # default true; false disables the tweak
  locateCurrentSession: true       # default true; false hides the sidebar locate button
  settingsNavScroll: true          # default true; false disables the settings-nav scrolling
  sidebarMiddleClickClose: true    # default true; false disables middle-click tab closing
  legacyStatsLine: false           # default false; true swaps the pills for the 0.1.2 text line
  pillsCacheHitDecimals: false     # default false; true shows the cache hit with two decimals (pills and legacy line)
  turnSpeedMetrics: false          # default false; true refills the turn-time dialog with output speed and TTFT
  legacyContextMeter: false        # default false; true puts the context ring back inside the input card (0.1.6-alpha.2+)
  contextPillNoTooltip: false      # default false; true suppresses the context capsule's hover tooltip (0.1.6-alpha.2+; the row hides while the previous toggle is on — the stored value still applies)
  workspaceClose: false            # default false; true enables closing (hiding) a Workspace from its row menu
  closedWorkspaces: []             # ids of closed Workspaces (internal data; managed by the panel's list)
```

Settings entry: **Settings → Style tweaks**.

## Install

```bash
# from npm (recommended, prebuilt)
dsh plugin --profile web add dsh-style-tweaks

# from GitHub (source; runs the self-contained prepare build)
dsh plugin --profile web add github:zhj9709/dsh-style-tweaks
```

The package spec after `add` is forwarded to pnpm verbatim, so versions can be
pinned — `@version` for the npm package, `#tag` for the GitHub source:

```bash
dsh plugin --profile web add dsh-style-tweaks@0.1.4                  # pin the npm version
dsh plugin --profile web add github:zhj9709/dsh-style-tweaks#v0.1.4  # pin a git tag
```

Restart DSH web once after installing (bundle plugins are scanned at process start).

> The commands above assume `dsh` is on your PATH. Without a global install, replace the leading
> `dsh` with `npx -y @deepseek-ai/dsh` — e.g.
> `npx -y @deepseek-ai/dsh plugin --profile web add dsh-style-tweaks`.

## Development

### Build

```bash
pnpm install
pnpm build          # tsc (server) + tsc (client) + bundle lib/client.js
pnpm typecheck
```

Load against a running DSH with an overlay, or install as a symlink:

```bash
dsh web --patch ./cordis.patch.yml      # dev overlay
dsh plugin --profile web add "link:./"  # symlink install (local dev, see below)
```

### Local development (recommended): `link:` symlink + hot reload

While developing, **do not pack the repo into a `.tgz` and install that**, and do not copy files into
the profile by hand after each build. Point the profile's `node_modules/dsh-style-tweaks` at this
checkout with pnpm's `link:` protocol instead — build output then lands on the very path DSH loads,
so a code change needs no copy, no repack, and no reinstall.

`<profile>` below stands for the profile directory:

| Platform | Profile directory |
|---|---|
| macOS / Linux | `~/.dsh/profiles/web` |
| Windows | `%USERPROFILE%\.dsh\profiles\web` |

**One-time install** (run from the repository root; the spec after `add` is forwarded to pnpm verbatim):

```bash
dsh plugin --profile web add "link:./"
```

This writes both the profile's `dependencies` and its `dsh.profile.bundles`, and has pnpm create the
symlink; whether `link:./` ends up recorded as a relative or an absolute path depends on the CLI, so
verify it after installing with the commands below.

> **Creating the symlink requires**: on Windows, **Developer Mode** (Settings → System → For
> developers) or an elevated shell, otherwise pnpm may fail to create a real symlink (some versions
> fall back to a junction, which is functionally equivalent); macOS / Linux have no such restriction.

> **Only needed if this plugin was ever disabled by hand**: DSH composes its tree as
> `dsh.profile.bundles` → `cordis.patch.yml` → `--patch` overlays, so the patch layer is applied last,
> while `dsh plugin add/remove` only maintains `dependencies` and `dsh.profile.bundles` and never
> touches that hand-written file. A leftover `disabled: true` therefore survives a remove → add and
> shows up as "installed, built — and nothing mounts in the page".
>
> The file to edit is the **profile's** `<profile>/cordis.patch.yml`, **not** the same-named file in
> the repository root (that one is this bundle's own patch — a single `insert`, with no `disabled`).
> Check first with:

```bash
grep -n "style-tweaks" ~/.dsh/profiles/web/cordis.patch.yml                     # macOS / Linux
```

```powershell
Select-String "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml" -Pattern style-tweaks
```

> Delete only that entry; keep the other disables (they are deliberate).

Verify the symlink points at this repo:

**macOS / Linux (including WSL and Git Bash)**

```bash
link=~/.dsh/profiles/web/node_modules/dsh-style-tweaks
ls -ld "$link"                  # expect an l... entry whose -> points at this repo
readlink "$link"                # expect the repository root
test -e "$link/src" && echo "src is reachable"
```

**Windows (PowerShell)**

```powershell
$link = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-style-tweaks"
(Get-Item $link).LinkType   # expect SymbolicLink (or Junction)
(Get-Item $link).Target     # expect the repository root
Test-Path "$link\src"       # expect True, proving it really points at the sources
```

**The hot-reload loop after every code change:**

1. **Build**:

   ```bash
   pnpm build
   ```

   This step is not optional. The repo ships **no** `dev` / `watch` script — nothing watches `src/`
   and recompiles for you, so a source change stays invisible until you build by hand (the symptom is
   "I changed it and nothing happened"). Under the symlink, `pnpm build` rewrites `lib/client.js` in
   place — the very file DSH loads — so **no copy into the profile is needed any more**.

2. **Make the page load the bundle again**:

   - **Hard-refresh the GUI page first** — `Ctrl+Shift+R` on Windows / Linux, `Cmd+Shift+R` on macOS
     (or close the tab and reopen it). In practice this is the most common and most reliable step;
     a refresh is enough in the vast majority of cases.
   - Only if a refresh still does not take effect should you restart the `dsh web` process (stop it
     and run it again).

   The claim in older versions of this README — that "DSH's client-plugin HMR receiver detects the
   change and reloads automatically" — **often does not fire on a local setup**: `dsh web` usually runs
   from an installed package rather than a source checkout running `dev:web`, so the page keeps using
   the bundle it already fetched. "No change until I refresh" is therefore normal and does not mean
   your code failed. A symlink only guarantees the file **on disk** is new; it does not guarantee the
   page **fetches it again**.

**How to confirm the new code is really loaded**:

- The page should carry injected styles such as `style[data-tweak-css="cst-*"]`, plus the
  `__cst_*_cleanup__` guards each tweak leaves on `window` (e.g.
  `__cst_project_running_indicator_cleanup__`). A guard that is `undefined` means that tweak never
  mounted.
- To see which build the page actually got: take the full URL of the
  `/plugins/??…dsh-style-tweaks…` entry from `performance.getEntriesByType('resource')`, then
  `fetch(url, { cache: 'no-store' })` and look for an identifier you just added. The page does
  **not** re-request that URL after a build — which is itself a direct way to tell whether HMR fired.
- Overwriting `lib/client.js` exactly while DSH is reading the bundle can produce one bogus
  "the whole plugin is gone" pass (no guards, no styles). A single refresh restores it; don't blame
  your code yet.

**Boundaries**: only the client artifact `lib/client.js` hot-loads this way. Server code
(`src/index.ts` / `src/web.ts` / `src/config.ts` → `lib/index.js`) needs a `dsh web` restart on top of
`pnpm build`; changes to the `apps/web` shell or to a plain package also require rebuilding the
corresponding web artifacts and refreshing the page.

**Back to the published version** (package name, no local path):

```bash
dsh plugin --profile web remove dsh-style-tweaks
dsh plugin --profile web add github:zhj9709/dsh-style-tweaks
```

### Alternative: install from a packed `.tgz` (artifact copy required)

When you would rather not have the profile depend on this repo's path — or want to exercise a real
install end to end — pack the repo into a `.tgz` and install that. The trade-off: the profile's
`node_modules/dsh-style-tweaks` becomes a **real copy** (no longer pointing at the sources), so every
source change has to be copied over — exactly the step the `link:` setup spares you.

```bash
pnpm build
pnpm pack            # produces dsh-style-tweaks-<version>.tgz (gitignored; do not commit)
dsh plugin --profile web add ./dsh-style-tweaks-0.1.4.tgz
```

**Restart `dsh web` once** after installing (bundle plugins are scanned at process start).

Then, after each code change:

1. **Build**:

   ```bash
   pnpm build
   ```

2. **Copy the artifact into the profile** (not needed under `link:`). Delete first rather than
   overwriting in place:

   **macOS / Linux**

   ```bash
   dest=~/.dsh/profiles/web/node_modules/dsh-style-tweaks/lib/client.js
   rm -f "$dest" && cp lib/client.js "$dest"
   ```

   **Windows (PowerShell)**

   ```powershell
   $dest = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-style-tweaks\lib\client.js"
   Remove-Item $dest -Force
   Copy-Item lib/client.js $dest
   ```

3. **Hard-refresh the GUI page**; if that still does not take effect, restart `dsh web`.

> **Why not simply overwrite with `cp -f`**: pnpm links files in `node_modules` to its
> content-addressable store — by **hard link** on Linux and Windows — so an in-place overwrite writes
> through to the store and can corrupt it for other projects sharing those files. macOS defaults to
> APFS clonefile (copy-on-write) and is usually unaffected, but "delete then copy" is safe everywhere.
> On GNU coreutils you can also use `cp --remove-destination`; note that **BSD `cp` on macOS has no
> such option**.

Switching from `link:` back to `.tgz` needs a `remove` first, since the profile already holds a local
path dependency:

```bash
dsh plugin --profile web remove dsh-style-tweaks
dsh plugin --profile web add ./dsh-style-tweaks-0.1.4.tgz
```

The only difference between the two setups is whether the artifact lands in place automatically: both
need `pnpm build` and a page refresh. Use `link:` for day-to-day code changes, and `.tgz` when you want
to verify the published package itself.

## How it works

- **Server** (`src/index.ts`) declares the `style-tweaks` settings namespace and mounts a same-origin route (`/_dsh/style-tweaks/settings`). Since DSH 0.1.7 that namespace IS this plugin's own entry Config (the entry id is the namespace, its fields carry the `.volatile()` marker, and the values live in the profile patch's `config`); older hosts go through `ctx.settings.register` and get the same namespace.
- **Browser** (`src/client/index.tsx`) reads/writes that route, renders the Settings section, and mounts / unmounts each tweak live based on its toggle (pure-CSS tweaks inject runtime `<style>` elements; JS-level tweaks also read the app's own state stores and patch the DOM).
- **Column-width engine** (`src/client/conversation-width.ts`) writes the `--dsh-chat-user-width` CSS variable and hides DSH's native `[data-width-handle]` drag strips while plugin width control is on; the chosen px is also mirrored into the localStorage slot the native handles read, so flipping the switch round-trips cleanly.
- **Tweak registry** (`src/client/tweaks/registry.ts`) centralises each tweak's metadata (id, settings field name, default value, i18n keys); adding a new tweak means appending one entry here and dropping a new injector file under `src/client/tweaks/`.
- **Project running indicator** (`src/client/tweaks/project-running-indicator.ts`) reads session running state and directory membership from `ctx.get('sessions')` / `ctx.get('workspaces')`, and uses a MutationObserver to mount the app's own `StateDot` (re-using `@deepseek-ai/dsh-client-ui-primitives` so the animation keyframes and style tokens are byte-identical to the conversation title's dot) on two kinds of sidebar row: the right side of each project directory header row (`role="treeitem"[aria-expanded]`), and the status slot of a session row (`role="treeitem"` plus the CSS-Modules local name `sessionRow`) that the app left empty. "Busy" merges three sources: the session's own `SessionSummary.running` (a turn in flight); the background jobs under it — `jobsBySession` in the `sessions` store snapshot, mirrored by Session Controller's control stream, where a status of `running` or `stopping` counts (the same `isLive` predicate DSH's own `ui-jobs` session-header action uses, so a `run_in_background` command stays lit from launch to settlement instead of going dark once the turn that started it answers); and a running subagent anywhere below it in the lineage (the same upward walk as `indexSubagentDescendants`). Header rows match workspaces by group key (`ProjectRowItem`'s `props.group.key`, i.e. `GroupNode.key`) rather than by title text: `GroupNode.label` is the directory basename, so two same-named directories under different parents collapse to one shared label (the Host only rejects a colliding *rename*, not a duplicate directory name) and title matching would light both — which is exactly why two `pi-web` directories once showed the indicator together. A session row is only decorated while its slot is empty — the moment the app renders its own dot there (turn running, subagent running, approval or question pending, unviewed completion) the injected dot steps aside instead of sitting next to it. Session rows expose no plugin slot and carry no session id in the DOM, so the id is read off React's fiber chain (`SessionNodeItem`'s `props.node.id`): the walk is defensive (an unreadable id just leaves that row alone) and re-resolved every pass, because the sidebar recycles its row elements. On a host without the `jobs` service `jobsBySession` is absent or empty and the tweak quietly falls back to the two cases the app already covers.
- **Locate current session** (`src/client/tweaks/locate-current-session.ts`) injects a new button into the sidebar's workspaces section header, to the left of the native search button. All anchors are i18n-safe: the search button's aria-label and the breadcrumb nav's aria-label are resolved through `ctx.locale.bind()` (the `workspace` / `conversation` namespace keys DSH itself uses), with structural class-fragment fallbacks (`searchButton`, `crumbs`) when the locale service is unavailable. Clicking it reads the current session title from the breadcrumb's disabled crumb, resolves the parent workspace **id** via `ctx.get('sessions')` / `ctx.get('workspaces')` app stores (works even when the workspace's sidebar group is collapsed), finds the workspace row by that id (`ProjectRowItem`'s `props.group.key`, read off the fiber chain) rather than by exact title match — two Workspaces whose directories share a basename share a label, and a title match then opens whichever one comes first — then pierces both collapse layers — clicking the collapsed workspace row to expand it, and auto-clicking the "Show {n} more sessions" overflow button (`[class*="sessionOverflowButton"][aria-expanded="false"]`) when the target row hides behind it — before `scrollIntoView({ block: 'center' })`. The hover tooltip replicates DSH's native `<Tooltip>` primitive (fixed-position bubble, theme tokens, 500 ms delay, viewport flip) instead of the browser-native `title`. A MutationObserver watches `aria-selected` / `aria-expanded` attribute changes to keep the button's enabled state and mount in sync.
- **Scrollable settings nav** (`src/client/tweaks/settings-nav-scroll.ts`) turns the settings dialog's left nav list into the scroll container of the nav rail: DSH's settings panel (`SettingsRoot`) has one fixed height with `overflow: hidden` and only gave the right content column (`.options`) an `overflow-y: auto`; the left `.navList` has neither `min-height: 0` nor an overflow treatment, so extra entries spill out and get clipped. Two CSS rules plus a small JS driver do it: the base rule `flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 12px; margin-inline-end: -12px` makes the list scrollable and parks the classic scrollbar in the nav rail's full 12px right padding gutter (8px gap + 4px strip), so the thumb floats over the spare padding 8px clear of the entries; a cell cap `max-width: 164px` (DSH's stock 188 nav − 2×12 padding) pins the entries to stock width in every state — bar present or not, hovering or scrolling — and `::-webkit-scrollbar { width: 4px }` is two notches thinner than DSH's global skin. The show timing is JS-driven: the first cut used `:not(:hover)` to blank the thumb, but Chromium does not reliably repaint custom scrollbar pseudo-elements when only the host's `:hover` state changes (in practice the bar appeared when clicking a nav cell — the React re-render forced the repaint), so the driver listens for `scroll` events on the list instead: scrolling adds a `cst-nav-scroll-show` class that reveals the thumb (coloured from the panel's inherited l2 tokens), and the class is removed ~0.8 s after scrolling stops; a MutationObserver re-attaches the listener whenever the dialog unmounts and reopens. The selector pairs the modal structure with a CSS Modules class fragment (DSH hashes classes as `[hash]_[local]`; the `navList` local name is unique across DSH), and needs no `!important`.
- **Middle-click closes sidebar tabs** (`src/client/tweaks/sidebar-middle-click-close.ts`): a right-Sidebar tab chip is `div[role="tab"][data-dockkit-tab="<tabId>"]`, rendered by `ui-dockkit`'s `TabPanel`, and the docking kit is adopted only by the right Sidebar (docked panel plus floating layer), so "chip" is exactly "Sidebar tab". The tweak hangs three listeners on `document` in the capture phase (React 17+ listens at the root container, so document capture precedes the whole React tree and the interception is total): `pointerdown` (middle) stops propagation so the chip's own press→drag gesture never begins — holding the middle button and drifting ≥4px can no longer place, split, or float the tab; `mousedown` (middle) calls `preventDefault()`, suppressing the browser's middle-click autoscroll (the `auxclick` that follows still fires); `auxclick` (middle — browsers deliver non-primary clicks as `auxclick`, never `click`) reads the chip's `TabId` and hands it to `ctx.sidebarRight.close()`, so every closing rule is the host store's own planner's (missing tab → no-op, the sole docked guide is unclosable, closing the last docked tab collapses the column) and the plugin duplicates none of them. `ctx.sidebarRight` only exists on 0.1.5+ hosts, and it is provided by `ui-sidebar-right` in that package's own plugin fiber — a plain property read resolves services only along the ancestor-fiber chain, so from a sibling plugin it throws ("cannot get property … without inject") even on hosts that have the face, while declaring the service in this plugin's `inject` would make it required and dead-lock the boot on pre-0.1.5 hosts; so the face is resolved at every middle close through `ctx.reflect.get('sidebarRight')` — the reflect instance and its store are shared per root and `provide` allocates the isolation key at the root, so `get` reads sibling-provided services across fibers with no inject requirement, and an unprovided name answers `undefined` instead of throwing (pre-0.1.5 hosts → `undefined`, where the tweak keeps its inert form — side-effect suppression only); a `close()` throw with no mounted seat is swallowed. Floating panels render no chip: their middle close forwards to the header's own ✕ control (absent — a no-op — when the embedder's `canCloseTab` withholds it), while the header's dock button is explicitly excluded; a press and a release on different elements hand the `auxclick` to their common ancestor, which answers neither helper and closes nothing.
- **Right sidebar initial width** (`src/client/tweaks/rightbar-initial-width.ts`): the right sidebar's width belongs to the host's `ui-layout` — its `openRightbar` action fills an unset preference with `rightbar ??= max(300, round(viewportWidth × 0.45))` (the `RIGHTBAR_DEFAULT_RATIO` constant), a drag overwrites it through `setRightbar` (clamped to `[300, window × 70%]`), and every later open/close keeps that px; the preference lives only in the in-memory store, so a reload drops it back to `null`. `ctx.layout` exposes only `openRightbar(track, fullscreen)` / `closeRightbar()` / `toggleSidebar()` / `selectPanel()` — the width action lives on the controller's own `panels` set (declared `private` in TypeScript, a plain runtime property). The tweak therefore wraps the controller **instance**'s `openRightbar`: on the FIRST open of a page load it measures the parent of `[data-rightbar-col]` (the very frame `ui-layout` measures for `viewportWidth`), writes `round(width × percent)` through the host's own `panels.setRightbar`, and only then forwards the original call — the write and the open land in the same React commit (never a first frame at 45%); neither the grid template nor the panel's inline width is touched, so the column solve, the drag handle's position and the panel width stay in agreement by construction. Two page-level markers hold the semantics: `__cst_rightbar_initial_width_seeded__` allows one write per load, and `__cst_rightbar_initial_width_dragged__` is set by a **one-shot** probe on the first `pointerdown` over `[data-side="rightbar"]` (the host's right-column drag handle) — once the user has dragged by hand, this tweak writes nothing for the rest of the load, since every settings change re-mounts every tweak and would otherwise overwrite the width just dragged. With the sidebar already open as the tweak mounts (the user editing the percentage in Settings) the new ratio is written immediately — the live preview. It stays inert when the host provides no `layout` service or its controller no longer carries a callable `setRightbar`, and disposal restores the host method only while the installed wrapper is still the current value, so another plugin's wrapper is never clobbered.
- **Legacy stats line** (`src/client/tweaks/legacy-stats-line.tsx`): 0.1.5 replaced the composer stats line (the old `StatsLine`) with icon pills (the new `StatsPills`); both mount the same way — a `list` entry with id `stats` on the `conversation.composer.dock` slot. A list cell renders its lowest-priority live entry (see `SlotCore.register`), so while the tweak is on, the plugin shadows the shipped entry with `id: 'stats'` + `priority: -2` (one step below the pills-decimals row, which it outranks when both are on) — the slot system's own shadowing mechanism, no CSS hiding or DOM patching — and disposing the registration hands the cell straight back; a crashed entry retires itself, restoring the pills. The data plane matches the pills: the durable `sessionStats` (whole-log counts and wall times) and `tokenUsage` (billing buckets) projections, without the old whole-window fallback fold (no projection → no row, matching the old line's "no data, no row" rule). Copy lives in the plugin's own `style-tweaks` namespace (`legacyStats.*` keys) — DSH removed the old `stats.llm` family from its dictionaries in 0.1.5, so the plugin carries its own en/zh strings; the row skin (centered, tertiary text, ellipsis truncation) is ported from 0.1.2's `StatsLine.module.css` with the original tokens plus fallbacks. The row skin adapts to the host's dock generation: 0.1.6-alpha.2 moved the dock slot's output into a centered flex row inside the InputBar (beside the new ContextMeter capsule, the context pill — the slot output is no longer a free row under the input card), and the row root probes its layout parent at mount (walking up past the `display: contents` wrapper the slot machinery inserts — the wrapper generates no box, so its `flexDirection` computes to the initial `row` and a direct read would classify both dock generations as row-flex) — a column flex container (alpha.1 and earlier hosts, where the row hangs directly under the card) takes the old skin: the row root carries the `data-composer-stats` marker, the host InputBar tightens its own 8px bottom clearance to 4px around any mounted stats row (`.root:has([data-composer-stats])`), and the row adds 4px of top + 2px of bottom padding so its total matches the pills row (26px row + 4px host clearance on both presentations); a row flex container (alpha.2's `.dock` wrapper, which owns the 4px top clearance, with a fixed 4px root bottom pad and the `data-composer-stats` rule removed — the marker is inert there) takes the new skin: the row sizes to its content with no vertical padding of its own, centered beside the capsule at the host's native 12px gap — toggling the tweak shifts neither the conversation nor the input box on either generation. The cache-hit share's precision follows the `pillsCacheHitDecimals` flag — two decimals while it is on, 0.1.2's integer rounding while off; the flag is captured at mount, and any settings change remounts every tweak, so the line always renders with the current value.
- **Cache hit with two decimals** (`src/client/tweaks/pills-cache-hit-decimals.tsx`): the pills' percent rounding happens inside a module-internal formatter in dsh-client-ui-chat that a plugin cannot reach, so while the tweak is on, it shadows the same `stats` slot cell (`priority: -1`) with its own render of the whole row — both pills and their click-open dialogs ported style-for-style from 0.1.5's `StatsPills` / `stat-dialog` (placement and outside-close ride the host primitives' own `useAnchoredPosition` / `useDismissOnOutsidePointer`), with the cache hit routed through the plugin's shared `formatCacheHitPercent(…, 2)` (two-decimal rounding; a hit that would read `100%` keeps its honest extra-precision tail, e.g. `99.97`). The dialog rows and pill labels follow. The data plane is the same `sessionStats` / `tokenUsage` projections (no window fold), and the root carries `data-composer-stats` as well (0.1.6-alpha.2 removed the host's bottom-clearance rule behind it; the marker only acts on earlier hosts), with the row skin following the dock generation the same way the legacy line's does (see `composer-dock.ts` and the previous entry). One icon note: the pills' gauge icon only exists in primitives 0.1.3+, so the host's `IconGaugeOutline16` is looked up at runtime and a clock icon stands in on hosts that predate it. Layering with the legacy line: both tweaks write the same slot cell; the legacy line registers at `priority: -2` and renders instead, leaving this row shadowed (unrendered, zero cost) until the legacy line is turned off, and the shipped pills return only when both tweaks are off. The toggle stays visible either way: the legacy line reads the same flag for its own decimals.
- **Turn speed & TTFT** (`src/client/tweaks/turn-speed-metrics.tsx` + `src/client/tweaks/assistant-stream-timing.ts`): session format v2 (0.1.5) embeds each model attempt's exact timed stream inside its durable settlement (`assistant/message`'s `data.stream`), but the Chat UI's cold presentation builds settled output straight from the assembled message and never replays it (the v2 architecture note, verbatim: "Cold settled presentation therefore does not reconstruct per-token timing") — the turn footer's own fold reads the node's in-memory timing, whose `firstTokenTime` only survives live-chunk folding, so every turn's output speed (TPS) and first-token time (TTFT) vanish across a reload and the "turn time & speed" dialog keeps only the wall-clock duration. This tweak is the consumer that note anticipates: it reads the settlements out of the session binding's documented event window (`ctx.sessions.binding(sessionId).eventSource`, the same feed the Conversation assembly consumes), with the compact-stream readers ported verbatim from dsh-llm (`assistantStreamFirstTokenTime`: reconstructs the first token's time inside a packed run from `time0` plus the `dt` gap list) and the fold from 0.1.5's `deriveTurnMetrics` — TTFT is the lowest step's dispatch→first-token delta, TPS is Σ output tokens ÷ Σ decode wall time over the steps carrying both timing and usage. Everything rides the durable log, so history loads and freshly settled turns show identical figures. Display choice: the dialog belongs to `TurnTimePanel`, which offers no slot, so the tweak mounts an invisible controller on the `conversation.chat.assistant-actions` list slot (inside each turn's action row; list entries render additively, no election race with other plugins' entries). A capture click listener on the footer only hands that footer to one shared body-wide `MutationObserver` (the dialog is portaled to `<body>`, so the panel node cannot reach its footer through `closest()`); the observer callback is a microtask that always runs before the next frame's rendering steps, claims the freshly committed panel by its stable `data-turn-time-details` marker, and appends `<dt>/<dd>` pairs after the duration row — labels straight from DSH's surviving `chat` vocabulary (`message.turnTime.speed` / `message.turnTime.ttft` / `message.tokensPerSecond` / `duration.seconds`), values inheriting the dialog's own `.details dt/.details dd` grid rules, so the refilled panel reads exactly like the 0.1.2 one. Appending rows grows the panel, and `useAnchoredPosition` repositions through `ResizeObserver` → `setState`, whose render lands after the next paint — the panel would otherwise paint one frame at its stale `top` (48 px too low) before snapping up, the very flash this tweak shipped with — so the same microtask lifts the fixed-positioned card by the added height: the dialog hangs from the trigger's top edge (`side: 'top'`), so keeping the card's bottom edge fixed is exactly the value the host's own `place()` computes for the taller panel, the first painted frame is already final, and the host's later write becomes a same-value no-op; the lift is skipped only when it would push the card above the viewport (a clamped placement). Hiding the card until the host repainted was tried and rejected — it turns a correct instant open into a visible late pop, making turns that never flashed start flashing. Do not derive the shift from footer geometry either: `data-turn-tail` is the whole turn container, not the action row. Turns whose live timing already survived render their own rows and are skipped by label. The rows are plain DOM inside the React-owned panel: they die with the dialog and re-inject on every open; with no derivable figure (no token in the stream, or the settlement outside the loaded window) nothing is injected, and turning the tweak off restores the stock behaviour.
- **No context pill hover info** (`src/client/tweaks/context-pill-no-tooltip.ts`): the 0.1.6-alpha.2 ContextMeter capsule is wrapped in ui-primitives' `Tooltip`, whose bubble (`span[role="tooltip"]`) is the **adjacent sibling** of the `cloneElement`'d anchor — so one plain CSS rule hides it exactly: `button:has(> svg[viewBox="0 0 14 14"] > circle) + span[role="tooltip"] { display: none }`. The anchor's structural identification is unique across the client UI: every circle-bearing icon in the icon set (gauge, database, …) is a 16×16 viewBox, and the only 14×14 ring with `circle` children is the ContextMeter's gauge (TodoPanel's 14×14 glyphs are path/rect, circle-free), while the `+` adjacent-sibling combinator binds the bubble to its own anchor only — every other Tooltip in the composer (the + attach circle, etc.) and the plugin rows' own hover tooltips carry no such svg and are untouched. The rule covers both the hover and the keyboard-focus trigger (the same bubble element; the click-open breakdown dialog remains the entry to the full figures); the bubble is driven by React state and the hiding happens at the style layer after it renders, so nothing of the host's behaviour changes and no JS listeners are involved. Hosts up to 0.1.6-alpha.1 ship no ContextMeter, the selector matches nothing, and the tweak is inert.
- **Context ring in the input card** (`src/client/tweaks/legacy-context-meter.tsx`): 0.1.6-alpha.2 moved the ContextMeter out of the input card's toolbar row into a new `.dock` wrapper below the card (a ring-and-percent capsule next to the stats row). This tweak restores the pre-alpha.2 presentation: a 28px ring-only button back inside the toolbar row, left of the send button. It deliberately avoids a DOM move — the capsule is a React-owned node, and when React commits an insertion it finds its `insertBefore` reference by walking the fiber tree (`getHostSibling`), not the DOM, without verifying that the reference is still a child of the container — so once the capsule were moved out, a stats row mounting at that moment would throw NotFoundError inside the commit and take the whole app down. Instead it works the way "cache hit with two decimals" does: it registers a cell on the `conversation.input.right` list slot (the toolbar's right group, inside `.trailing` in normal flex flow) with a style-for-style port of the alpha.1 ContextMeter — 28px grid ring, hover reading, the click-open 264px occupancy breakdown, outside-click + Escape close, and the `contextOccupancy` fold ported verbatim — riding the same `contextPressure` / `contextBreakdown` projections, reusing the host primitives' own `Tooltip` for the hover reading, and keeping alpha.1's absolutely-positioned panel skin (anchored above the ring, right-aligned). Host generation is probed by the cell itself (layout effect, settled before the first paint): from its own position it walks past the `display: contents` anchor to its composer card and checks the InputBar root's own children for a `div` whose hashed class carries the `_dock` local name — present means the alpha.2+ generation and the ported ring renders; absent (0.1.6-alpha.1 and earlier) the cell renders only a hidden (`display: none`) ref-holder (the probe needs a mount point; the hidden shell takes no space and adds no row gap), the native ring already holds that seat, and the tweak is fully inert. Three companion CSS rules: `[class*="_dock"] > span:has(> button > svg[viewBox="0 0 14 14"] > circle) { visibility: hidden; width: 0; margin-left: -12px }` hides the shipped capsule — through `visibility` rather than `display`, and collapsing only its width, because the box must stay as a 22px height floor: the two stats presentations are 20px (legacy line) and 22px (pills) tall, so with the capsule's box fully gone every toggle of the stats rows — or a session with no stats at all — changes the composer's height and pushes the whole input area (the shipped capsule always occupied those 22px, which is exactly why stock 0.1.6-alpha.2 does not jump when the stats rows toggle). Keeping the real element means the floor follows a font-size preference for free, with no hard-coded height, while `visibility: hidden` also takes the capsule out of hit-testing and the accessibility tree; the `margin-left: -12px` cancels the dock's 12px gap so the stats row keeps sitting exactly on the card's centre line (the pre-alpha.2 line's position). Two `order` rules place the ported ring after the model chip and before the stop/send cluster (`conversation.input.right` cells render before the model chip; through the `display: contents` anchors the order declarations act on the visible boxes directly), reproducing alpha.1's in-row order exactly; the two are additionally gated on an ancestor that owns a dock child (`div:has(> div[class*="_dock"])`), so they never enter the cascade on earlier hosts rather than merely restating the native order. Layering with "no context pill hover info": that rule's anchor test matches the ported ring as well, so the one switch covers both presentations; that switch's row is a **dependent row** — while this tweak is on the panel no longer renders it (hidden, never greyed out, the rule the dependent numeric fields follow), because the capsule it names has been replaced and hidden and leaving the row would only mislead. The stored value is untouched: turning this tweak off brings the row back with its value.
- **Stable session titles** (`src/client/tweaks/stable-session-title.ts`): 0.1.6-alpha.2 gave session rows a "hover reveal" — `Rows.tsx`'s `revealClippedTitle` scrolls the clipping title element to its far edge while the pointer rests on the row (`.sessionRow .title` gliding there through `scroll-behavior: smooth`) and `@media (hover: hover)`'s `.sessionRow:hover .title { text-overflow: clip }` drops the ellipsis for the reveal, with a one-step snap back on leaving; that glide is the "title moves on hover" motion (pre-alpha.2 builds have no such code — the title always rests at the start). This tweak turns the title from a scroll container into a **non-scrollable** clipped box with one CSS rule: `[role="treeitem"]:not([aria-expanded]) [class$="_title"] { overflow: clip !important; text-overflow: ellipsis !important }` — an `overflow: clip` box is not programmatically scrollable, so the host's `scrollLeft` / `scrollTo` assignments become no-ops (the host JS keeps running and simply has nothing to move), and the `!important` on `text-overflow: ellipsis` wins the importance tie against `.sessionRow:hover .title` (both 0,3,0), keeping the ellipsis on hover. The selector is structurally scoped: session rows are the workspace browser's `role="treeitem"` elements WITHOUT `aria-expanded` (workspace rows carry it), and the title is the span whose CSS-Modules class ends in `_title` (hashed as `<hash>_title`; the row hover card's `hoverTitle` local name differs and never matches). `overflow: clip` lays out identically to the shipped `overflow: hidden` (both clip in place), so rows whose titles never scroll are visually untouched; on 0.1.6-alpha.1 and earlier hosts the titles already rest at scroll position 0, and the same declarations change nothing.

- **History page size** (`src/client/tweaks/history-page-size.ts`): the per-request history size is a client parameter, not a host setting — `PAGE_MESSAGES = 50` is used for opening a session (`events.open`) and for "Load earlier" (`events.prepend`), `JUMP_PAGE_MESSAGES = 200` for the turn-jump loop, and the host only validates `maxMessages` as a positive safe integer. The tweak therefore rewrites the two outgoing requests in the browser: the unary `session/page` POST body (`payload.args.request.maxMessages`) and the Gateway WebSocket `session/follow` open frame (a live 0.1.6-alpha.2 frame nests it at `payload.args.request.maxMessages`; the flat spelling is only a fallback — do not "clean up" the nested lookup). It installs once and then only moves targets: `installHistoryPageSizeTransport()` idempotently wraps `globalThis.fetch` and `WebSocket.prototype.send` (**never unwound** — undoing it inside other plugins' wrappers is not worth the risk), and every settings change just updates the shared target, so a save applies to the next request without re-patching. Rewrites only ever raise, so the jump loader's native 200 is never lowered and a configured size above 200 raises jump pages too. Because the settings read can land after the first follow frame of a load, the targets are seeded from localStorage (`dsh-style-tweaks.history-page-size`) at install time and only overwritten once the settings snapshot arrives (pushing defaults before the first read would clobber the seed back to 50); both the seed and the pushed value are clamped to [50, 1000]. The targets and a monotonic ownership counter (the newest instance holds them) live in one object parked on `globalThis`, not in module state: the wrappers are therefore installed once per page, and every layer a re-evaluated bundle adds reads the same target (re-wrapping cannot amplify anything — the second layer's "raise only if larger" test is then already false). Plugin teardown (disable, or a bundle reload in the same page) releases ownership and zeroes the targets, and only the instance still holding ownership may do so: a teardown arriving after the next instance took over is a no-op instead of a wipe of its settings. Two boundaries: if the settings read never lands (route unavailable, invalid document) the seed drives the whole page lifetime, so "master switch off restores DSH's own behaviour" does not hold within that page (the raise stays clamped to [50, 1000]); and the rewrite only knows the unary `session/page` body and the `session/follow` open frame, so a host that moved pagination to another transport would silently stop being affected. In the panel, the two rows below hide while the master switch is off (the stored size survives), "Apply to session open too" hides while the size is 50 (nothing to apply), and neither emptying the field nor typing a value below the floor silently commits the minimum.

## Acknowledgements

This plugin was inspired by and built with reference to [wlj521/dsh-ui-tweaks](https://github.com/wlj521/dsh-ui-tweaks) — a more comprehensive DSH UI customisation plugin covering fonts, tables, timeline, Git, and more. If this plugin does not cover what you need, check that one out.

## License

MIT