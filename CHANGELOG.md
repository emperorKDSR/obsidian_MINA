# Changelog

All notable changes to MINA V2 will be documented in this file.

## [1.2.4] - 2026-04-20
### Patch — Task/thought folder collision fix & checkbox immediate feedback

#### Fixed
- **Quick-add task no longer creates a phantom thought** — Root cause: `isThoughtFile()` used a bare `path.startsWith(folder)` check. Since `thoughtsFolder` (`'000 Bin/MINA V2'`) is a string prefix of `tasksFolder` (`'000 Bin/MINA V2 Tasks'`), every task file path returned `true` for `isThoughtFile`. The vault `create` event therefore called `indexThoughtFile` for new task files, adding them to `thoughtIndex` and making them appear in the left writing panel. Fixed by appending a trailing `/` to the folder prefix in both `isThoughtFile` and `isTaskFile`.
- **Checkbox completes task immediately** — `toggleTask` writes the file but `metadataCache` updates asynchronously. The previous 200ms `setTimeout` re-render saw stale index data and re-rendered the task as still open. Fixed by directly mutating the `taskIndex` entry's `status` and `modified` fields right after `toggleTask` resolves, followed by `rebuildCalculatedState()` and a synchronous re-render. Same fix applied to the mobile peek-bar checkbox.


### Patch — Daily Workspace quick-add reliability & panel separation

#### Fixed
- **Quick-add task list updates immediately** — root cause was `indexTaskFile()` relying on `metadataCache.getFileCache()` which returns `null` right after file creation. Fixed by directly injecting a `TaskEntry` into `taskIndex` with the known data (title, body, day, status) immediately after `createTaskFile()` resolves, bypassing the async metadataCache pipeline entirely. `rebuildCalculatedState()` is called to keep radar queue consistent. The metadataCache event still runs later and overwrites with the full parsed entry as expected.
- **Left panel shows only thoughts** — the writing surface (left pane) was incorrectly showing both thoughts and tasks, creating confusing duplicate visibility (tasks appeared in left entry list AND right task panel). Left panel now shows today's thoughts only. Tasks created via quick-add or the main capture bar remain exclusively in the right task panel where they belong.

## [1.2.2] - 2026-04-20
### Patch — Daily Workspace quick-add refresh & delete entries

#### Fixed
- **Quick-add task auto-refresh** — adding a task via the Quick Add input now clears the field immediately, disables it while saving, and re-renders the task list after 500ms (up from 200ms) to give IndexService time to pick up the new file. The task reliably appears in the sidebar after Enter.
- **Delete entries from workspace** — a 🗑 delete button now appears on hover alongside the edit pencil for every thought and task entry. Tapping it opens a confirmation prompt; on confirm the file is moved to trash and the entry list re-renders in place. No tab navigation required.

## [1.2.1] - 2026-04-20
### Patch — Daily Workspace inline edit

#### Fixed
- **Inline note editing in Daily Workspace** — clicking the ✏️ edit button on any entry now opens `EditEntryModal` directly within the workspace instead of navigating away to the Thoughts or Tasks review tab. Both thought and task entries are handled — the modal pre-fills text, contexts, and due date, saves back via `editThought()`/`editTask()`, and re-renders the workspace in place. Zero context-switching, no lost flow.

## [1.2.0] - 2026-04-20
### 🚀 Minor Release — Daily Workspace Tab

#### New Features
- **Daily Workspace tab** — freeform daily capture space accessible from Command Center nav and command palette (`Open MINA Daily Workspace`)
- **Split-pane layout (desktop)** — writing surface with sticky capture bar on the left, task sidebar (overdue/today/upcoming) on the right via container queries
- **Toggle-pane layout (mobile)** — WRITE | TASKS segmented toggle with persistent task peek bar at bottom
- **Capture bar** — auto-expanding textarea for quick thought/task capture with Thought/Task mode toggle, inline triggers (@date, [[link, #tag)
- **Chronological entry list** — daily thoughts and tasks rendered with timestamps, tags, and hover action buttons
- **Task sidebar** — open tasks grouped by overdue, today, and upcoming sections with inline checkbox completion
- **Task peek bar (mobile)** — always-visible bottom bar showing next actionable task with one-tap completion
- **Date navigation** — arrow-based day navigation with Today shortcut button
- **Keyboard shortcuts** — Ctrl+N (new capture), Ctrl+T (toggle panels), Escape (cancel)
- **Storage** — reuses existing MINA V2 folder via VaultService (no new directories)

## [1.1.2] - 2026-04-20
### Patch - Command Center capture input auto-grows with note length

#### Changed
- **Command Center capture textarea** - the inline input now auto-resizes as you type so longer notes expand the input area instead of staying fixed-height
- **Desktop and mobile capture flows** - both Command Center capture paths now share the same autosize behavior on open, input, trigger-driven text changes, and reset
- **Capture shell height caps** - expanded desktop and mobile capture bodies now allow taller note input before clipping

## [1.1.1] - 2026-04-20
### Patch - EditEntryModal aligned with Command Center capture bar

#### Changed
- **EditEntryModal desktop layout** - rewrote the desktop path to use semantic CSS classes instead of inline styles so it matches the Command Center capture surface
- **Edit modal textareas** - both mobile and desktop paths now use Calibri to align with the capture bar input styling
- **Mode toggle active state** - mobile float and desktop modal toggles now use the accent-filled active treatment
- **Mobile action row** - Cancel and Capture now share the same pill shape and equal sizing
- **Desktop modal workflow** - added the Thought/Task segmented toggle to desktop and switched due-date controls to the shared `_buildDateStrip()` flow
- **Desktop save behavior** - save button disable/enable behavior now mirrors the mobile modal
- **Mobile chip strip** - removed the inline `+` tag picker from the modal and restored the `# to tag` empty hint when no contexts are selected

#### Removed
- **Inline modal tag picker** - deleted the unused `_toggleInlineTagPicker()` mobile helper and the matching `.mina-tag-picker-*` CSS block

## [1.1.0] - 2026-04-20
### 🚀 Minor Release — Bill Overview & Capture Bar Overhaul

#### New Features
- **Bill Overview (Finance Tab redesign)** — complete rebuild of the Financial Ledger into a dedicated "Bill Overview" experience:
  - **Summary strip** — 4 live metric chips (Overdue, Due Today, Upcoming, Total/Mo) with danger/accent tinting when counts are non-zero
  - **Smart status cards** — each bill card carries a 4px left stripe and 4% background tint keyed to status: `is-overdue` (red), `is-today` (accent), `is-soon` (amber, ≤7d), `is-upcoming` (neutral), `is-inactive` (desaturated)
  - **Status badges** — inline pill badges per card: `OVERDUE`, `DUE TODAY`, `In Xd / Tomorrow`, `↻ Recurring`, `PAID`
  - **Active/All History toggle** — full-width segmented pill on mobile, compact fit-content on desktop via container query
  - **FAB (mobile) / inline "+ New Bill" (desktop)** — CSS-only visibility swap using Obsidian's `.is-mobile` / `.is-desktop` body classes; FAB respects `env(safe-area-inset-bottom)` for iOS home indicator
  - **Tap-to-open** — card body opens the vault note directly (`Platform.isMobile ? 'tab' : 'window'`); pay button isolated with `e.stopPropagation()` and a 60×60px invisible tap zone via `::before`
  - **Empty state** — copy adapts to Active vs All History filter mode; CTA opens `NewDueModal`
  - **CSS container queries** (`@container mina-bills`) — layout responds to Obsidian panel width, not viewport — 2→4 column summary, full→fit-content toggle, 2→1 line bill name clamp
  - **RGB fallback tokens** — `--mina-bills-error-rgb` and `--mina-bills-warning-rgb` added to `:root`; Obsidian themes are not guaranteed to expose `--text-error-rgb` / `--text-warning-rgb`
  - **Mobile-first touch UX** — 44px minimum tap targets throughout; CSS-only ripple on `:active::after`; `-webkit-tap-highlight-color: transparent`; `scale(0.91)` press feedback on pay button; no `mouseenter`/`mouseleave` hover-only states

- **`#` tag trigger in capture bar** — typing `#` in the capture textarea opens a native `SuggestModal` (`ContextSuggestModal`) pre-filtered by typed text, identical UX to Obsidian's `[[` link trigger. `+ Create "#tag"` option available for new tags. Replaces the broken inline DOM-based pill panel.

- **Timeline infinite scroll** — feed loads stacked day sections; `IntersectionObserver` sentinels auto-load ±2 days on scroll; spotlight carousel syncs to currently visible day; prepend preserves scroll position.

- **Timeline perspective carousel** — 5-item header carousel with scale/opacity depth; center item 72px accent; swipe/drag navigation with velocity-based day jumping (Pointer Events API, `touch-action: pan-y`).

#### Fixed
- **Desktop: letter 'C' blocked in capture textarea** — `onKey` shortcut guard now checks `cap.hasClass('is-expanded')` first; when bar is open no shortcut ever fires
- **Capture re-render suppression** — `_capturePending` flag prevents `notifyRefresh()` from wiping the DOM during active capture
- **Tag autocomplete null crash** — `null` entries in `settings.contexts` no longer crash `getSuggestions()`
- **Timeline — frozen carousel header** — `mina-tl-wrap` uses `position: absolute; inset: 0` + `min-height: 0` on feed flex child
- **Timeline — deleted entry re-appears** — trash-renamed files excluded from `isThoughtFile()` / `isTaskFile()` path guards

#### Changed
- Capture textarea font → Calibri; padding reduced; `min-height` 72px
- Cancel + Capture buttons → equal `flex: 1` size; accent color on active mode toggle
- `# to tag` static hint removed from chip strip


### Added
- **Bill Overview — `is-soon` card status** — Bills due within 7 days now receive the `is-soon` CSS class (previously all future bills got `is-upcoming`). Cards with this status show a warning-amber left stripe and a 4% amber background tint for clear visual urgency differentiation.
- **Bill Overview — card background tints** — Status-aware subtle background washes added: overdue → 4% red, due today → 4% accent, due soon (≤7d) → 4% amber. Inactive/upcoming cards retain neutral background.
- **Bill Overview — RGB fallback tokens** — Added `--mina-bills-error-rgb: 239, 68, 68` and `--mina-bills-warning-rgb: 245, 158, 11` to `:root`. These ensure `rgba()` tints and stripe colors work correctly across all Obsidian themes regardless of whether `--text-error-rgb` / `--text-warning-rgb` are defined by the theme.

## [1.0.13] - 2026-04-20
### Fixed
- **Desktop: letter 'C' blocked in capture textarea** — `onKey` document-level shortcut listener was intercepting every `C` keypress using `document.activeElement` (global scope), which could diverge from `parent.ownerDocument.activeElement` inside Obsidian's rendering context. Fixed by adding `if (cap.hasClass('is-expanded')) return` as the first guard — when the capture bar is already open, the shortcut never fires regardless of focus state.

### Changed
- **Capture input — reduced padding** — `.mina-capture-inline-canvas` padding reduced from `14px 16px` to `8px 12px`; textarea `min-height` reduced from 96px to 72px; textarea `padding-top` set to `0` for a tighter, denser input area
- **Capture toggle — accent color on both desktop & mobile** — `.mina-capture-inline-toggle .mina-seg-btn.is-active` uses `var(--interactive-accent)` background. Desktop `toggleBar` now also carries the `mina-capture-inline-toggle` class so the accent rule applies consistently across both layouts
- **Cancel / Capture buttons — equal size** — both buttons now use `flex: 1` (previously `flex: 1` / `flex: 2`), rendering as identical-width pills in the action row
- **Removed `# to tag` hint** — chip strip no longer shows the static hint text when no tags are selected; strip is simply empty until a tag is added via `#` trigger

## [1.0.12] - 2026-04-20
### Changed
- **Capture textarea — Calibri font** — `font-family` on `.mina-capture-inline-textarea` changed from `var(--font-text)` to `'Calibri', var(--font-text), sans-serif` for both desktop and mobile capture bars
- **Capture textarea — removed top padding** — `padding: 12px 0 0 0` reduced to `padding: 0`; text now starts flush at the top of the input area
- **Mobile capture — CANCEL pill matches CAPTURE shape** — `.mina-capture-inline-cancel` redesigned as a ghost pill: `border-radius: 10px`, `border: 1.5px solid var(--background-modifier-border-faint)`, `min-height: 44px`, uppercase 800-weight label — visually identical shape to the CAPTURE button. Both buttons use `flex: 1` / `flex: 2` ratio so CAPTURE stays dominant. Active state transitions border and text color instead of the old plain text fade.

## [1.0.11] - 2026-04-20
### Fixed
- **`#` tag trigger — replaced broken inline suggest panel with native `SuggestModal`** — the inline DOM-based pill panel was unreliable due to overflow clipping, focus loss, and re-render collisions. Replaced entirely with `ContextSuggestModal` (Obsidian `SuggestModal`) opened immediately when `#` is typed at the start of text or after whitespace — identical UX to `[[`. The `#` is stripped from the textarea, the modal opens pre-filtered, and selecting a tag fires `onContext(tag)` to add a chip. `+ Create "#tag"` option shown when the typed name is new.
- **Tag autocomplete — null crash** — a `null` entry in `settings.contexts` (from malformed YAML `context:` frontmatter) caused `ctx.toLowerCase()` to throw inside `getSuggestions()`, silently returning zero results. Fix: `loadSettings()` now strips null/non-string entries on startup; `scanForContexts()` guards nulls on accumulation; `ContextSuggestModal.getSuggestions()` filters defensively before any string ops.
- **Capture bar re-render suppression** — `saveSettings()` was being called inside the `onContext` callback during live capture (writing `data.json` → vault `modify` event → `notifyRefresh()` → 400 ms debounce → full `renderView()` → DOM wipe). Fix: `onContext` only mutates `plugin.settings.contexts` in memory; `saveSettings()` is deferred to `handleSave` (after capture success). Added `_capturePending` flag to `MinaView` (mirrors existing `_taskTogglePending` pattern); set to `1` on capture bar expand and `0` on collapse; `notifyRefresh()` skips `renderView()` while `_capturePending > 0`.
- **`attachInlineTriggers` shared utility** — added optional `getContexts?: () => string[]` 5th parameter; both `CommandCenterTab` and `EditEntryModal` now pass `() => plugin.settings.contexts ?? []` so `ContextSuggestModal` receives the live list at modal-open time.

## [1.0.10] - 2026-04-21
### Fixed
- **Desktop capture bar — inline triggers** (`@date`, `[[`, `+`) now work correctly in the inline expand bar. Logic extracted from `EditEntryModal._attachInlineTriggers` into shared `attachInlineTriggers(app, textarea, setDueDate)` utility in `utils.ts`. Wired to the desktop expand textarea in `CommandCenterTab`. `@date` trigger also auto-switches capture mode to Task.

## [1.0.9] - 2026-04-21

### Changed
- **Timeline — spotlight carousel header** — replaced the flat horizontal date strip with a 5-item perspective carousel merged into the header; the center (spotlight) item is large (72 px) with accent background and drop shadow; ±1 items are scaled to 0.9 at 70% opacity; ±2 items are scaled to 0.76 at 38% opacity; a full-date subtitle (`MONDAY, APRIL 21 · 2026`) sits below the carousel
- **Timeline — swipe/drag navigation** — added horizontal swipe on the carousel track using the Pointer Events API (unified mouse-drag + touch-swipe handler); velocity-based day jumping: slow (<0.45 px/ms) = 1 day, medium = 2–3 days, fast (>1.5 px/ms) = 4 days; 25 px minimum threshold prevents micro-movement triggers; `setPointerCapture` keeps tracking if pointer leaves the element; `touch-action: pan-y` preserves native vertical scroll on mobile
- **Timeline — infinite vertical scroll** — feed now loads multiple day sections stacked vertically with sticky day headers; `IntersectionObserver` sentinels at top/bottom boundaries auto-load 2 more days as user scrolls; a second `IntersectionObserver` on each day header syncs the spotlight carousel to the currently visible day; prepend operations preserve scroll position via `scrollTop` + `scrollHeight` delta; `navigateToDate()` performs partial updates (header-only re-render + smooth scroll to target day) without destroying the feed

### Fixed
- **Timeline — carousel scrolls out of view** — `.mina-tl-wrap` switched from `height: 100%` to `position: absolute; inset: 0; overflow: hidden` so it reliably fills Obsidian's view container; `.mina-tl-feed` gained `min-height: 0` (critical flexbox fix — without it a flex child won't constrain its height and the whole page scrolls instead of just the feed); the header slot now stays frozen at the top at all times

## [1.0.8] - 2026-04-20

### Fixed
- **Timeline — deleted entry re-appears after deletion** — `VaultService.deleteFile()` renames to a `/trash/` subfolder rather than hard-deleting, which fires a vault `'rename'` event. Because `/trash/` lives inside the thoughts/tasks folder, `isThoughtFile()` / `isTaskFile()` returned `true` for the trash path, causing the renamed file to be immediately re-indexed and re-appear in the timeline. Fix: exclude paths containing `/trash/` in `isThoughtFile()` and `isTaskFile()` in `IndexService`.

## [1.0.7] - 2026-04-20

### Fixed
- **Timeline — delete not reflected in view** — after confirming a delete, the entry was still visible because `renderTimeline()` ran before the async vault `'delete'` event could update the index. Fix: eagerly remove the entry from `thoughtIndex` / `taskIndex` before calling `renderTimeline()`, matching the same eager-purge pattern used in `main.ts`'s vault event handler

## [1.0.6] - 2026-04-20

### Changed
- **Timeline — full redesign** — complete architectural and visual overhaul of the Timeline tab:
  - **Header bar**: Home icon + "TIMELINE" label + "+ NEW" accent FAB button for quick capture
  - **Date carousel**: horizontal scroll with 75-day range (60 back, 14 forward); activity dots on dates with entries; TODAY pill with accent ring; active pill with accent fill; auto-scrolls to selected date on render
  - **Entry feed**: vertical spine layout — left accent line with node dots per entry; cards distinguish THOUGHT (accent) vs TASK (amber) via colored left-border and type badge
  - **Entry cards**: meta row (type badge + timestamp), body text rendered as Markdown, footer with due-date chip + context pills, hover-reveal Edit + Delete action buttons
  - **Empty state**: centered glyph + message + ghost "Capture a thought" CTA
  - **New entry capture**: "+ NEW" FAB and empty-state CTA both open the standard `EditEntryModal`
  - All inline styles replaced with semantic CSS classes (`.mina-tl-*`); 323 lines of new CSS added to `styles.css`

## [1.0.5] - 2026-04-20

### Fixed
- **Navigation — new window renders correct tab** — `MinaView` now overrides `getState()` and `setState()` so Obsidian correctly applies `activeTab` and `isDedicated` when a new window leaf is created via `setViewState()`; previously the new window always rendered the Command Center (home) regardless of which button was clicked

## [1.0.4] - 2026-04-20

### Changed
- **Navigation — new-window mode** — clicking any ACTION, MANAGEMENT, or SYSTEM button in the Command Center footer now opens the target mode in a **new window** (desktop) or new tab (mobile) instead of replacing the current view
- **activateView — exact tab match** — the leaf-reuse logic now matches by `activeTab` for all leaves (dedicated and non-dedicated), so clicking the same nav button a second time focuses the existing window rather than spawning a duplicate

## [1.0.3] - 2026-04-20

### Changed
- **Command Center — Intelligence hidden** — hid the Intelligence section from the Command Center UI for now without removing the underlying AI implementation
- **Command Center — center strip removed** — removed the remaining section between the Weekly/Monthly goals block and the footer button clusters so the layout flows directly into navigation

## [1.0.2] - 2026-04-20

### Changed
- **Tasks — merged open queue** — merged the separate Inbox and Due filters into one `Open` view that groups tasks by Overdue, Today, Upcoming, and No Date while preserving `No Date` as a focused subset filter

## [1.0.1] - 2026-04-20

### Added
- **Checklist — Refresh button** — ↻ icon in CHECKLIST header re-indexes `thoughtChecklistIndex` from vault and re-renders the view on demand
- **IndexService — `thoughtDoneChecklistIndex`** — new index populated with `- [x]` lines from MINA V2 files modified today; cleared on each `buildThoughtIndex` rebuild

### Changed
- **Checklist — section order** — CHECKLIST now renders above the Overdue task group in the Command Center TO DO area
- **Checklist — tick behaviour** — ticking an item instantly moves it to the bottom of the list via local re-render (no full view re-render); item is sourced from vault truth (`thoughtDoneChecklistIndex`) after re-index, with `checklistCompletedToday` as the optimistic 400 ms window
- **Checklist — drag reorder** — all items (open and done) are now draggable; `checklistOrder` tracks the full combined list; deduplication prevents double entries after vault re-index
- **Checklist — done items source** — done items shown in CHECKLIST are now read directly from the vault (`- [x]` in today's files) rather than session state alone
- **CommandCenterTab — inline triggers** — `@word ` resolves to `[[YYYY-MM-DD]]` via NLP date parsing; `+` at line start inserts `- [ ] `; `[[` opens file suggester
- **IndexService — YAML field fixes** — `context:` (singular) read correctly; `[[YYYY-MM-DD]]` wikilink strings stripped before date comparison
- **Commands** — removed all plugin commands except "MINA: Open Command Center"
- **Navigation** — removed all plugin ribbon icons except the Command Center entry

## [1.0.0] - 2026-04-19

### Added
- **Command Center** — primary hub with Tactical Core, Zen Mode focus toggle, and reactive nerve system
- **Thought Capture** — instant modal with YAML-based metadata, context tagging, and auto-linking
- **Task Ledger** — YAML-native task files with status, due date, and project fields
- **AI Chat (AiTab)** — grounded chat against vault thoughts via Gemini API with citation support
- **Voice Memos (VoiceTab)** — in-browser MediaRecorder with transcription via Gemini
- **Financial Ledger (DuesTab)** — obligation tracking with payment recording and next-due management
- **Habits System** — daily habit files with streak tracking
- **Synthesis Mode (SynthesisTab)** — zero-inbox triage for unprocessed thoughts
- **Weekly Review / Quarterly Compass** — GTD-style review cadence with North Star goals
- **Projects** — tag-based project grouping across thoughts and tasks
- **Daily View** — aggregated daily dashboard across tasks, dues, thoughts, and habits
- **IndexService** — O(1) in-memory indices for all entity types with reactive file-watcher updates
- **VaultService** — unified file I/O with YAML injection-safe frontmatter builders
- **AiService** — Gemini integration with chunked base64, injection boundary markers, model allowlist, and API key header security
- **17 tabs, 17 modals** — full Personal OS feature set
