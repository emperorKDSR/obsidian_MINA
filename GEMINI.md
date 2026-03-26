You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "C:\Users\57092\iCloudDrive\iCloud~md~obsidian\K0000"

I want you to develop a plugin for me to quickly capture my thoughts and append it to a file.

This plugin will capture: 1) thoughts, 2) tasks.

When capturing thoughts and tasks,  you must datetimestamp it so it will be easier to sort later.

All new captures need to be appended in the beginning of the file.

## Current Implementation

The "MINA V1" plugin has been developed with the following features and implementations:

1. **User Interface (UI) & Aesthetics**
   - **Tabbed Navigation:** The MINA V1 window features two primary modes: **Thoughts** and **Tasks**.
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
     - **Iron Man Avatar:** Root thoughts are marked with a circular Iron Man helmet SVG icon; replies are streamlined without the icon.
   - **Desktop Optimization:** Standalone windows hide native tab headers and include a dedicated **drag handle** at the top.
   - **Mobile Optimization:**
     - **Opens as Main Tab:** On mobile, MINA opens as a full workspace tab (not a sidebar).
     - **Vertical Reordering:** Toggles (History/Capture) move above filters on mobile for easier thumb access.
     - **Adaptive Indentation:** Thread nesting is reduced on mobile to preserve horizontal space.
     - **Responsive Modals:** Popups anchor to the top and shrink with the `visualViewport` to stay above the virtual keyboard. Auto-scroll focuses inputs into view.
     - **Keyboard / Black-Bar Fix:** Uses `position: fixed` + `visualViewport` `resize`/`scroll` listeners to prevent iOS WebKit from sliding the container off-screen when the keyboard appears.
     - **Context Picker via `@`:** On mobile, context pills are hidden to save space. Typing `@` in the capture textarea opens a horizontal scrollable pill strip below the input for multi-select context tagging. "Done" dismisses it and strips the `@` token.
     - **File Attachment Button (`📎`):** Absolutely positioned in the lower-right corner of the textarea (does not reduce input real estate). Triggers a hidden `<input type="file" multiple>` to attach images or files.
     - **Left-Aligned Due Date Selector:** On mobile, the task due date selector is left-aligned (no `margin-left: auto`).

2. **Review & Management**
   - **Modification Tracking:** Every entry tracks its **Modified Date** and **Modified Time**.
   - **Advanced Thread Sorting:** 
     - History is sorted by the latest activity. 
     - **Bubble-up Logic:** Adding a reply or editing a child thought automatically updates the parent's modification time, moving the entire thread to the top.
   - **Interactive Filters:** Status, dynamic Context tags, and Date presets (Today, This Week, Next Week, Overdue Only, Today + Overdue, Custom Range).
   - **Tasks Default Filter:** The tasks tab opens to **"Today + Overdue"** — pending tasks due today or past-due. Overdue rows show a red left border and a `⚠ OVERDUE` badge.
   - **History Toggle:** Instantly switch between full history and strictly **"Today's"** entries.
   - **Advanced Editing:** 
     - Double-click or use `✏️` to open a movable Modal for full text and context editing.
     - **Full Context Management:** Edit modal shows all contexts (plugin settings + entry's own). Click to toggle on/off. Type a new context in the input and press Enter or tap Done/Go on mobile keyboard. A `+` button is also available. New contexts are saved to plugin settings immediately.
     - **Thread Protection:** Deletion (`🗑️`) is restricted for entries that have active replies to prevent orphaned threads.
   - **File & Image Support:** Paste images or drag files directly into capture areas or edit modals.
   - **Smart Autocomplete:** Typing `\` opens a fuzzy search for vault note referencing.
   - **Internal Link Navigation:** Clicking `[[note]]` links inside thought/task cards opens the linked note — new window on desktop, new tab on mobile.
   - **Image Zoom Lightbox:** Clicking any image in a thought/task card opens a full-screen overlay.
     - Desktop: mouse-wheel zoom (0.2×–8×), drag to pan when zoomed, Escape to close.
     - Mobile: pinch-to-zoom, single-finger drag to pan, tap outside (when not zoomed) to close.
   - **Inline Checklists (Thoughts tab):**
     - Type `** item text` in the capture textarea (or edit modal) — it auto-converts to `- [ ] item text` on the fly.
     - Checklist items render as interactive **circle toggles** (accent-colored circle with ✓ glyph when checked).
     - Clicking a circle immediately toggles the checked state and persists to the markdown file without re-rendering the whole list.
     - Works in both the capture textarea and the EditEntryModal textarea.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Fully tracked with Git.
   - **Advanced Table-Based Storage:**
     - **Thoughts:** `| ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |`
     - **Tasks:** `| Status | Date | Time | Modified Date | Modified Time | Due Date | Task | Context |`
   - **Stable IDs:** Uses robust unique IDs for new thoughts and **content-based stable hashing** for legacy 4-column entries.
   - **Automatic Context Discovery:** Scans files on load to extract unique tags, preserving casing and multi-word contexts.
   - **Settings Protection:** Iron-clad lock mechanism prevents configuration loss during sync or updates.
   - **English-locale Timestamps:** All stored timestamps use `moment().locale('en').format(...)` wrapped with `toAsciiDigits()` to prevent non-ASCII numerals (Arabic-Indic, Persian, Devanagari, Bengali, Thai) on devices with non-English locale settings.
   - **Settings Corruption Guard:** `loadSettings()` validates `timeFormat` (must contain H/h/k) and `dateFormat` (must contain Y/M/D); resets to defaults if corrupted (e.g., iCloud renaming `data.json` → `data N.json` can cause this).
   - **Rendering Safety:** Each thought row renders independently — a bad entry logs an error and shows a placeholder without stopping subsequent entries from rendering.
   - **`<br>` Decoding:** Stored `<br>` line-break tokens are decoded to real newlines before markdown rendering, so checklist syntax (`- [ ] `) parses correctly.

4. **Settings Tab (Inline)**
   - **Capture Folder:** Target directory for all MINA files.
   - **Thoughts/Tasks File Names:** Fully customizable storage paths.
   - **Date/Time Formats:** User-configurable moment.js formats.
   - **Gemini API Key:** Stored securely (password field).
   - **Gemini Model:** Dropdown to select from 9 available Gemini models. Default: `gemini-2.5-flash`.

5. **MINA AI Chat Tab**
   - Embedded AI assistant powered by Google Gemini.
   - Sends thoughts and tasks file contents as context on every message.
   - **Full Vault Toggle:** Optionally send the entire vault as context instead.
   - **Dues Context:** Recurring dues data is always included as additional context (when Full Vault is off).
   - Chat bubble UI with "MINA is thinking…" indicator.
   - Send with Enter key or ↑ button; Shift+Enter for newline.

6. **Dues Tab**
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
cp main.js "C:/Users/57092/iCloudDrive/iCloud~md~obsidian/K0000/.obsidian/plugins/mina_1/main.js"
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
- **`@` context picker:** Positioned `top: calc(100% + 4px)` below textarea. `textAreaWrapper` must have `position: relative`. `mousedown` used instead of `click` to fire before textarea `blur`. Blur dismissal delayed 150ms. `hideCtxPicker()` splices the `@query` text from textarea using `atStartIndex`.
- **`📎` attach button:** Absolutely positioned in lower-right of `textAreaWrapper`. Hidden `<input type="file">` lives inside `textAreaWrapper`.
- **`hookImageZoom`:** `position:fixed; inset:0` overlay. Mouse drag via `mousedown` on image + `mousemove`/`mouseup` on document.
- **`hookCheckboxes`:** Replaces each `<input type="checkbox">` rendered by `MarkdownRenderer` with a custom `<span>` circle using `insertBefore` + `removeChild` (more DOM-compatible than `replaceWith`). Checked state tracked via `data-checked` attribute. Fully wrapped in try/catch (outer + per-item) to prevent one bad checkbox from killing all entry rendering.
- **Overdue indicator:** `renderTaskRow` checks `dueDateRaw` against `moment().startOf('day')`. Sets `el.style.borderLeft = '3px solid var(--text-error)'` and appends `⚠ OVERDUE` badge. Completed tasks are never flagged.
- **`toAsciiDigits()`:** Module-level helper covering U+0660–U+0669 (Arabic-Indic), U+06F0–U+06F9 (Persian), U+0966–U+096F (Devanagari), U+09E6–U+09EF (Bengali), U+0E50–U+0E59 (Thai).
- **`onClose()` in MinaView must be `async`** — TypeScript requires it to match ItemView's `() => Promise<void>` signature.
- **Default Gemini model:** `gemini-2.5-flash` (set in `DEFAULT_SETTINGS` and as the dropdown fallback).
