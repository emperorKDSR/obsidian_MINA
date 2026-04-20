# Changelog

All notable changes to MINA V2 will be documented in this file.

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
