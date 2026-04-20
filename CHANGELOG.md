# Changelog

All notable changes to MINA V2 will be documented in this file.

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
