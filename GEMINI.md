You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "C:\Users\57092\iCloudDrive\iCloud~md~obsidian\K0000"

I want you to develop a plugin for me to quickly capture my thoughts and append it to a file.

This plugin will capture: 1) thoughts, 2) tasks.

When capturing thoughts and tasks,  you must datetimestamp it so it will be easier to sort later.

All new captures need to be appended in the beginning of the file.

## Current Implementation

The "MINA V2" plugin has been developed with the following features and implementations:

1. **User Interface (UI) & Aesthetics**
   - **Tabbed Navigation:** Six tabs with short labels: **Th** (Thoughts), **Ta** (Tasks), **Ai** (AI Chat), **Du** (Dues), **Vo** (Voice), **Se** (Settings).
   - **Modern Card-Based Layout:** Thoughts and tasks are displayed in responsive "cards" with rounded corners and dynamic backgrounds.
     - **Dark Mode:** Transparent white background (`rgba(255, 255, 255, 0.05)`).
     - **Light Mode:** Subtle grey background (`rgba(0, 0, 0, 0.05)`).
   - **Integrated Capture Area:**
     - The capture input is docked directly inside both the Thoughts and Tasks tabs for instant entry.
     - **Threaded Thoughts:** Support for hierarchical replies. Each thought can be replied to using the `↩️` button, creating a nested thread.
     - **Visual Indicators:** Thoughts with replies show a **reply count badge** and a collapse/expand chevron (▶/▼).
     - **Inline Sync:** The "Sync" button sits next to the text area for a compact, chat-like feel.
     - **Context-Aware:** Automatically hides "As Task" in Thoughts tab and forces task mode with a due date picker in Tasks tab.
     - **Visibility Toggle:** A "Capture" toggle in the header allows hiding/showing the input section.
   - **Streamlined Header:** 
     - Filters (Status, Context, Date) and Toggles (History, Capture) are combined into a single compact, rounded bar.
     - **Centered Filters:** Text in filter dropdowns is centered for improved readability.
   - **Contemporary Controls:**
     - **Toggle Switches:** Pill-shaped toggle switches for task status, History, and Capture visibility.
     - **Brain/Dragon Avatar:** Root thoughts are marked with a circular brain SVG icon (red outline, Lucide-style); replies are streamlined without the icon.
     - **Brain Ribbon Icon:** The Obsidian sidebar ribbon uses the same brain SVG as the plugin icon.
   - **Desktop Optimization:** 
     - Standalone windows hide native tab headers and include a dedicated **drag handle** at the top.
     - **Separate Windows:** Tabs can be opened into a separate window altogether via a pop-out button (⧉) in the navigation bar.
   - **Mobile Optimization:**
     - **Opens as Main Tab:** On mobile, MINA opens as a full workspace tab (not a sidebar).
     - **Vertical Reordering:** Toggles (History/Capture) move above filters on mobile for easier thumb access.
     - **Adaptive Indentation:** Thread nesting is reduced on mobile to preserve horizontal space.
     - **Responsive Modals:** Popups anchor to the top and shrink with the `visualViewport` to stay above the virtual keyboard. Auto-scroll focuses inputs into view.
     - **Keyboard / Black-Bar Fix:** Uses `position: fixed` + `visualViewport` `resize`/`scroll` listeners to prevent iOS WebKit from sliding the container off-screen when the keyboard appears.
     - **Context Picker via `#` Button (mobile phone only):** On mobile phones, context pills are hidden to save space. A `#` button is absolutely positioned in the lower-right corner of the textarea (next to `📎`). Tapping it toggles a context panel below the input containing:
       - A **2-row horizontally scrollable grid** (`grid-template-rows: repeat(2, auto)`, `grid-auto-flow: column`, `overflow-x: auto`) — swipe left/right to browse all contexts; selected pills show accent background + ✓.
       - A **bottom action row**: `[New context… input]` `[＋]` `[Done]` — type a name and tap ＋ (or press Enter) to save a new context to settings and auto-select it; Done closes the panel.
       - Selection is **fully reset after each Sync** — both `this.selectedContexts = []` and `plugin.settings.selectedContexts = []` are cleared and saved before `renderView()` so re-initialization starts fresh.
     - **File Attachment Button (`📎`):** Absolutely positioned in the textarea, shifted left to make room for the `#` button. Triggers a hidden `<input type="file" multiple>` to attach images or files.
     - **Left-Aligned Due Date Selector:** On mobile, the task due date selector is left-aligned (no `margin-left: auto`).
   - **Scroll Padding:** All five main scrollable tab areas (Thoughts, Tasks, AI Chat, Dues, Voice) have `padding-bottom: 200px` so the last row is never flush against the bottom of the viewport.

2. **Review & Management**
   - **Modification Tracking:** Every entry tracks its **Modified Date** and **Modified Time**.
   - **Advanced Thread Sorting:** 
     - History is sorted by the latest activity. 
     - **Bubble-up Logic:** Adding a reply or editing a child thought automatically updates the parent's modification time, moving the entire thread to the top.
   - **Interactive Filters:** Status, dynamic Context tags, and Date presets (Today, This Week, Next Week, Overdue Only, Today + Overdue, Custom Range).
   - **Thoughts Default Filter:** Opens to **"Last 5 Days"** — entries from the past 5 days.
   - **Tasks Default Filter:** Opens to **"Today + Overdue"** — pending tasks due today or past-due. Overdue rows show a red left border and a `⚠ OVERDUE` badge.
   - **Tasks Tab — No History Toggle:** The History toggle has been removed from the Tasks tab. Task date filtering uses the date dropdown exclusively.
   - **Tasks Tab — "No Due Date" Filter:** A dedicated filter option shows tasks with no due date assigned.
   - **Tasks Date Filter:** Fully functional filter on `entry.due` field for all options: Today, This Week, Next Week, Overdue Only, Today + Overdue, No Due Date, Custom Range.
   - **History Toggle (Thoughts only):** Instantly switch between full history and strictly **"Today's"** entries.
   - **Advanced Editing:** 
     - Double-click or use `✏️` to open a movable Modal for full text and context editing.
     - **Full Context Management:** Edit modal shows all contexts (plugin settings + entry's own). Click to toggle on/off. Type a new context in the input and press Enter or tap Done/Go on mobile keyboard. A `+` button is also available. New contexts are saved to plugin settings immediately.
     - **Thread Protection:** Deletion (`🗑️`) is restricted for entries that have active replies to prevent orphaned threads.
   - **Convert Thought to Task:** `📋` button in the thought hover overlay opens `ConvertToTaskModal` with a due date picker and preview. Creates a task entry and tags the original thought with `#converted_to_tasks` context.
   - **File & Image Support:** Paste images or drag files directly into capture areas or edit modals.
   - **Smart Autocomplete:** Typing `\` opens a fuzzy search for vault note referencing.
     - If the typed name does not match any existing note, a **`＋ Create "name"`** option appears at the top of the list.
     - Selecting it creates `<New Note Folder>/<name>.md` (auto-creates the folder if missing) and inserts `[[name]]` into the thought.
   - **Internal Link Navigation:** Clicking `[[note]]` links inside thought/task cards opens the linked note — new window on desktop, new tab on mobile.
   - **Image Zoom Lightbox:** Clicking any image in a thought/task card opens a full-screen overlay.
     - Desktop: mouse-wheel zoom (0.2×–8×), drag to pan when zoomed, Escape to close.
     - Mobile: pinch-to-zoom, single-finger drag to pan, tap outside (when not zoomed) to close.
   - **Inline Checklists (Thoughts tab):**
     - Type `** item text` in the capture textarea (or edit modal) — it auto-converts to `- [ ] item text` on the fly.
     - Checklist items render as interactive **circle toggles** (accent-colored circle with ✓ glyph when checked).
     - Clicking a circle immediately toggles the checked state and persists to the markdown file without re-rendering the whole list.
     - Works in both the capture textarea and the EditEntryModal textarea.
   - **Context Tag Placement:**
     - **Thoughts:** Context pills render at the **bottom of the card body text** (inline, with `margin-top: 5px`).
     - **Tasks:** Context pills render **right-aligned** in a meta row below the body. Due date appears **left-aligned** on the same meta row.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Fully tracked with Git.
   - **Advanced Table-Based Storage:**
     - **Thoughts:** `| ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |`
     - **Tasks:** `| Status | Date | Time | Modified Date | Modified Time | Due Date | Task | Context |`
   - **Stable IDs:** Uses robust unique IDs for new thoughts and **content-based stable hashing** for legacy 4-column entries.
   - **Automatic Context Discovery:** Scans files on load to extract unique tags, preserving casing and multi-word contexts.
   - **Settings Protection:** Iron-clad lock mechanism prevents configuration loss during sync or updates.
   - **English-locale Timestamps:** All stored timestamps use `moment().locale('en').format(...)` wrapped with `toAsciiDigits()` to prevent non-ASCII numerals on devices with non-English locale settings.
   - **Settings Corruption Guard:** `loadSettings()` validates `timeFormat` (must contain H/h/k) and `dateFormat` (must contain Y/M/D); resets to defaults if corrupted.
   - **Rendering Safety:** Each thought row renders independently — a bad entry logs an error and shows a placeholder without stopping subsequent entries from rendering.
   - **`<br>` Decoding:** Stored `<br>` line-break tokens are decoded to real newlines before markdown rendering, so checklist syntax (`- [ ] `) parses correctly.

4. **Settings Tab (Inline)**
   - **Capture Folder:** Target directory for all MINA files.
   - **Thoughts/Tasks File Names:** Fully customizable storage paths.
   - **Date/Time Formats:** User-configurable moment.js formats.
   - **New Note Folder:** Folder where notes created via the `\` link picker are saved. Default: `000 Bin`. Also exposed in Obsidian's plugin settings page.
   - **Voice Memo Folder:** Folder where recorded voice notes are stored. Default: `000 Bin/MINA V2 Voice`.
   - **Transcription Language:** Target language for audio transcription/translation. Default: `English`.
   - **Gemini API Key:** Stored securely (password field).
   - **Gemini Model:** Dropdown to select from available Gemini models. Default: `gemini-2.5-flash`.
   - **Max Output Tokens:** User-configurable `maxOutputTokens` for Gemini API (range: 256–65536, default: 65536). Prevents incomplete AI responses.
   - **Settings Scroll Padding:** `padding-bottom: 200px` on the settings scroll container for comfortable mobile scrolling.

5. **MINA AI Chat Tab (Ai)**
   - Embedded AI assistant powered by Google Gemini.
   - Sends recent thoughts (up to 50), tasks file, and dues data as context on every message.
   - **Multi-turn History:** Full `chatHistory` array sent to Gemini as `contents` (role: user/model) on every request for coherent multi-turn conversations.
   - **Markdown Rendering:** Assistant responses rendered via `MarkdownRenderer.render()` — supports headers, lists, bold, code, tables, etc.
   - **Mobile Table Fix:** Tables in AI responses wrapped in `overflow-x: auto` scrollable divs with `white-space: nowrap` on cells.
   - **Layout — Desktop:** Grounded notes bar at top → chat history → input row at bottom.
   - **Layout — Mobile:** Grounded notes bar (with brain toggle icon) at top → input area (toggled) → chat history with 130px bottom padding.
   - **Mobile Input via Brain Icon:** A brain icon (accent circle, 28px) sits at the end of the grounded notes bar. Tapping it opens an inline textarea (4 rows) below the bar. Tapping again or sending closes it. Zero absolute/fixed positioning — fully in document flow.
   - **Grounded Notes Bar:** Horizontal scrollable chip strip showing default context chips (Th, Ta, Du), any user-pinned vault notes, and the 🌐 Web toggle.
   - **🌐 Web Search Toggle:** Chip in the grounded bar. When active, sends `tools: [{ googleSearch: {} }]` to Gemini API for real-time web-grounded responses.
   - **`\` Note Grounding:** Typing `\` in the chat textarea opens the note picker. Selected notes are pinned as chips in the grounded bar and their full content (+ linked/backlinked notes up to depth 1) is sent as context.
   - **Save Session (`📥`):** Saves full chat to `MINA Chat YYYY-MM-DD HHmm.md` in the thoughts folder using `**You:** / **MINA:**` format.
   - **New Chat (`🗒️`):** Clears chat history with a confirmation modal.
   - **Recall Session (`📂`):** Opens `ChatSessionPickerModal` (FuzzySuggestModal) to reload a saved chat file. `parseChatSession()` parses the saved format back into `chatHistory`.
   - **Save as Thought (`💾`):** Icon-only button overlaid `position:absolute; bottom:6px; right:6px` inside each assistant bubble. Shows `✓` on save, reverts after 2 seconds.
   - **Chat Order:** Oldest messages at top, newest at bottom (natural chronological order). Auto-scrolls to bottom after each render.
   - **"MINA is thinking…"** indicator shown while awaiting Gemini response.
   - **Enter to send; Shift+Enter for newline.**
   - **Response Parsing:** Joins ALL `parts[].text` from Gemini response (not just `parts[0]`) to handle web-search multi-part responses.
   - **Max Output Tokens:** Raised to 65536 (configurable in settings) to prevent truncated responses.

6. **Dues Tab (Du)**
   - Scans all vault notes for frontmatter `category: recurring payment` (supports plain string, comma-separated, or YAML list) and `active_status: true`.
   - **Table columns:** Payable (clickable note link), Due Date (overdue = red ⚠, today = accent), Last Payment, Pay button.
   - Sorted by Due Date ascending; undated entries go to bottom.
   - **Pay Modal:** Records a payment against a recurring due.
     - Payment date picker (defaults to today).
     - Combined notes/snippet/reference textarea — paste images from clipboard (Ctrl+V) with thumbnail preview and ✕ removal.
     - Multi-file attachment picker.
     - Updates `last_payment` and `next_duedate` (+1 month) in the note's frontmatter via `processFrontMatter`.
     - Appends a `## Payment — YYYY-MM-DD` log entry with notes and embedded attachments to the note body.
     - Refreshes the Dues table automatically after saving.
     - **Mobile:** Anchored to top, centered via parent overlay flex, shrinks with visualViewport.
   - **Add Recurring Due Modal:** Creates a new vault note pre-filled with all required frontmatter.
     - Fields: Payable Name (→ filename), Save folder, Next Due Date, Last Payment Date, Amount, Notes.
     - Frontmatter written: `category`, `active_status`, `next_duedate`, `last_payment`, `amount`.
     - **Mobile:** Same top-anchored, keyboard-aware layout as Pay modal.

7. **Voice Notes Tab (Vo)**
   - **Recording UI:** Large central record button (●) with a running timer and status indicator.
   - **Intelligent Media Recording:** 
     - Automatically detects supported MIME types (`webm` on desktop/Android, `mp4/m4a` on iOS) for cross-platform playback compatibility.
     - Saves files with timestamped names (e.g., `voice-YYYYMMDD-HHmmss.m4a`) to the configured `voiceMemoFolder`.
   - **Voice Memo Cards:** Vertical stack layout showing Date/Time, native `<audio controls>` player, and action buttons.
   - **Gemini Transcription & Translation:** 
     - Uses Gemini 1.5 Flash (or user-selected model) to transcribe audio.
     - **Two-Step Prompt:** "First, transcribe the audio in its original language. Second, translate the transcribed text into [Language]."
     - Transcription saves as a new thought, tagged with `#transcribed` and `#voice-note`, and contains a link back to the audio file (e.g., `[[voice-20260329-103000.m4a]]`).
   - **Transcription Status:** Backlink detection automatically marks recordings with a "✅ Transcribed" badge if they are linked from any file in the thoughts folder.
   - **Management:** 
     - **Native Playback:** Uses HTML5 `<audio>` element with `getResourcePath` for reliable performance on all platforms.
     - **Internal Deletion:** `🗑️` button triggers a `ConfirmModal` (not a native browser popup) to safely remove recordings from the vault.

## Data Schema

### Thoughts file (`mina_1.md` by default)
```
| ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <id> | <parent_id_or_empty> | [[YYYY-MM-DD]] | HH:mm | [[YYYY-MM-DD]] | HH:mm | thought text | #tag1 #tag2 |
```
- Multi-line content stored with `<br>` as line separator (decoded back to `\n` at render time).
- Checklist items stored as `- [ ] item` / `- [x] item` within the Thought column.
- Legacy formats (4-column, 6-column) are read-only compatible and handled via column-count detection.

### Tasks file (`mina_2.md` by default)
```
| Status | Date | Time | Modified Date | Modified Time | Due Date | Task | Context |
| :---: | --- | --- | --- | --- | --- | --- | --- |
| [ ] | [[YYYY-MM-DD]] | HH:mm | [[YYYY-MM-DD]] | HH:mm | [[YYYY-MM-DD]] | task text | #tag1 |
```

### Recurring Due Note frontmatter
```yaml
---
category: recurring payment
active_status: true
next_duedate: YYYY-MM-DD
last_payment: YYYY-MM-DD
amount: 0.00
---
```

## Build & Deploy

```bash
npm run build
# compiles: tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
# then copy main.js to vault:
cp main.js "C:/Users/57092/iCloudDrive/iCloud~md~obsidian/K0000/.obsidian/plugins/mina_v2/main.js"
```

## Known Column Index Rules (critical for edit save logic)

When splitting a markdown table row by `|`, the part indices are:

| Schema | parts.length | ID | text col | context col |
|---|---|---|---|---|
| Thoughts 8-col (new) | ≥ 9 | parts[1] | parts[7] | parts[8] |
| Thoughts 6-col (old) | ≥ 7 | parts[1] | parts[5] | parts[6] |
| Thoughts 4-col (legacy) | < 7 | — | parts[3] | parts[4] |
| Tasks 8-col (new) | ≥ 10 | — | parts[7] | parts[8] |
| Tasks 6-col (mid) | ≥ 8 | — | parts[5] | parts[6] |
| Tasks 4-col (legacy) | < 8 | — | parts[4] | parts[5] |

## Key Technical Notes

- **Mobile keyboard fix:** `position: fixed` + `top: vv.offsetTop` + `left: vv.offsetLeft` + `width/height: vv.width/height` on `visualViewport` `resize` and `scroll` events. Cleaned up in `async onClose()`.
- **`#` context button (mobile phone):** Positioned `position:absolute; bottom:6px; right:6px` inside `textAreaWrapper`. The `📎` attach button shifts to `right:34px`. Tapping toggles `ctxPanelEl`. Panel layout: 2-row horizontal scroll grid of `inline-flex` pills + a bottom row with text input, `＋` add button, and Done button. `renderCtxPanel()` rebuilds the entire panel. `hideCtxPanel()` removes it. After Sync on mobile phone: `this.selectedContexts = []`, `this.plugin.settings.selectedContexts = []`, `await this.plugin.saveSettings()`, then `hideCtxPanel()` + `renderView()`.
- **`\` note linker with create:** `FileSuggestModal` extends `SuggestModal<TFile | string>`. `getSuggestions(query)` returns fuzzy-matched files + a leading `string` entry (the raw query) when no exact basename match exists. `renderSuggestion` styles the string entry with a `＋` prefix in accent color. `onChooseSuggestion` for a string: ensures folder exists via `vault.getAbstractFileByPath` + `vault.createFolder`, then calls `vault.create(folder/name.md, '')`.
- **`📎` attach button:** Absolutely positioned at `bottom:6px; right:34px` in `textAreaWrapper` (shifted left from `right:6px` to make room for `#` button on mobile). Hidden `<input type="file">` lives inside `textAreaWrapper`.
- **Scroll padding:** `padding-bottom: 200px` applied to all five tab scroll containers: `reviewThoughtsContainer`, `reviewTasksContainer`, `chatContainer`, the Dues `wrap` div, and the Voice `wrap` div. AI chat container uses 130px bottom padding on mobile.
- **Task card layout:** Two-row flex column. Top row: `toggleContainer` + `content (flex:1)` + `actions`. Bottom `metaRow`: `dueLeft` (due date + overdue badge) left-aligned, `ctxRight` (context pills) right-aligned, separated by `justify-content: space-between`.
- **Thought context placement:** Context pills appended as a `div` (flex row, `gap:4px`, `margin-top:5px`) directly inside `renderTarget` (the card body) after `MarkdownRenderer.render`.
- **`hookImageZoom`:** `position:fixed; inset:0` overlay. Mouse drag via `mousedown` on image + `mousemove`/`mouseup` on document.
- **`hookCheckboxes`:** Replaces each `<input type="checkbox">` rendered by `MarkdownRenderer` with a custom `<span>` circle using `insertBefore` + `removeChild`. Checked state tracked via `data-checked` attribute. Fully wrapped in try/catch to prevent one bad checkbox from killing all entry rendering.
- **Overdue indicator:** `renderTaskRow` checks `dueDateRaw` against `moment().startOf('day')`. Sets `el.style.borderLeft = '3px solid var(--text-error)'` and appends `⚠ OVERDUE` badge. Completed tasks are never flagged.
- **`toAsciiDigits()`:** Module-level helper covering U+0660–U+0669 (Arabic-Indic), U+06F0–U+06F9 (Persian), U+0966–U+096F (Devanagari), U+09E6–U+09EF (Bengali), U+0E50–U+0E59 (Thai).
- **`onClose()` in MinaView must be `async`** — TypeScript requires it to match ItemView's `() => Promise<void>` signature.
- **Default Gemini model:** `gemini-2.5-flash` (set in `DEFAULT_SETTINGS` and as the dropdown fallback).
- **Brain SVG:** `KATANA_ICON_SVG` (inner content for `addIcon`, 100×100 viewBox) uses `<g transform="translate(2,2) scale(4)">` to scale Lucide brain paths (24×24) up. `NINJA_AVATAR_SVG` is a full `<svg viewBox="0 0 24 24">` with the same paths, used inline. Both use `stroke="#c0392b"` (red), `fill="none"`, `stroke-width="2"`.
- **AI chat multi-turn:** `callGemini()` builds Gemini `contents` array from full `chatHistory` (role: user/model). Current user message is pushed to `chatHistory` before calling `callGemini`, so the API receives the complete conversation.
- **AI response parsing:** Joins ALL `parts[].text` from response candidates (not just `parts[0]`) to handle web-search multi-part responses. `maxOutputTokens` defaults to 65536, configurable in settings.
- **AI chat mobile input:** Brain icon (28px accent circle with `NINJA_AVATAR_SVG`) appended inside `refreshGroundedBar()` as last item when `isMobilePhone`. Clicking toggles `mobileInputArea` visibility. `mobileInputArea` is a normal `flex-shrink:0` div inserted via `wrapper.insertBefore(mobileInputArea, this.chatContainer)` — no absolute positioning needed.
- **`refreshGroundedBar()`:** Called on init and whenever `groundedNotes` or `webSearchEnabled` changes. On mobile, also re-appends the brain icon button. The `mobileInputArea` reference is declared before `refreshGroundedBar` is defined so the closure can capture it.
- **Save-as-Thought button in AI chat:** `position:absolute; bottom:6px; right:6px` inside assistant bubble (which has `position:relative; padding-bottom:24px`). Icon-only `💾`, shows `✓` on success, reverts after 2s.
- **Tasks date filter logic:** `updateReviewTasksList()` filters `entry.due` (plain `YYYY-MM-DD` string, brackets stripped during parse) against current date using `moment()`. All filter options (Today, This Week, Next Week, Overdue Only, Today + Overdue, No Due Date, Custom Range) implemented as explicit date comparisons.
- **Thoughts default filter:** `thoughtsFilterDate` defaults to `'last-5-days'`. Filter: `entryDay >= moment().subtract(4, 'days').startOf('day')`.
- **Chat session save format:** `**You:** message\n\n**MINA:** response\n\n`. Parsed back by `parseChatSession()` line-by-line into `chatHistory` array.
- **`ChatSessionPickerModal`:** Extends `FuzzySuggestModal<TFile>`. Lists files matching `MINA Chat *.md` in thoughts folder, sorted by `stat.mtime` descending.
- **Desktop Flex Layout:** The main container on desktop is explicitly set to `display: flex` and `flex-direction: column` with `height: 100%`. This ensures that child elements with `flex-grow: 1` (like the AI chat history) correctly expand to fill the available space and push input areas (like the AI chat input) to the bottom of the window.
- **Separate Window State:** `getState()` and `setState()` are implemented in `MinaView` to persist the `activeTab`. This allows Obsidian to restore the correct tab when a view is opened in a separate window or after a restart.
- **Dynamic MIME Recording:** `MediaRecorder` checks `isTypeSupported` to choose between `webm` and `mp4/m4a` (iOS), ensuring playable files across all devices.
- **Transcription Translation:** `transcribeAudio` uses a two-step prompt ("Transcribe then Translate") to ensure voice notes are converted to the user's preferred language.
- **Internal Confirmation:** Plugin uses its own `ConfirmModal` for voice note deletion to maintain a consistent UI and stay within the application flow.
