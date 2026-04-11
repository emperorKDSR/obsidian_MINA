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
   - **Tabbed Navigation:** Seven tabs with short labels: **Da** (Daily), **Th** (Thoughts), **Ta** (Tasks), **Ai** (AI Chat), **Du** (Dues), **Vo** (Voice), **Se** (Settings).
   - **Daily Tab (Da):** A high-focus dashboard with five foldable sections. **Note:** This tab is hidden in "Full Mode" and is primarily accessed via "Daily Mode" or "Timeline Mode".
     - **Persistent Section State:** Sections (`details` elements) now remember their collapsed or expanded state across refreshes and restarts.
     - **Individual Visibility Toggles:** Five pill-shaped toggles in the header (**Cl**, **Ta**, **Du**, **Pi**, **Th**) allow showing/hiding specific dashboard sections.
     - **Auto-Refresh:** Automatically reloads the view whenever thoughts or tasks are updated while the Daily tab is active.
     - **Daily Mode:** A dedicated command "Daily Mode" opens the dashboard in a high-focus view. On desktop, this is a standalone pop-out window. On mobile, it's a full-screen view with both native and plugin navigation hidden for maximum space. Includes a **✕ (Close)** button to exit the focused view.
     - **Task Mode:** A dedicated command "Task Mode" opens the Tasks tab in a high-focus view (standalone window on desktop, full-screen on mobile). Features a simplified layout where contexts are hidden and due dates are placed inline after the task text for maximum focus. Includes its own header.
     - **AI Mode:** A dedicated command "AI Mode" opens the AI Chat in a high-focus view (pop-out window on desktop, full-screen on mobile). Features a clean interface with a close button and is focused exclusively on AI interactions.
     - **Gemini Tool Conflict:** Due to API limitations, **🌐 Web Search** and **File Creation** are mutually exclusive. When Web search is active, the AI cannot create files. Disable Web search to enable autonomous file creation.
     - **Detailed Error Reporting:** AI Chat now displays specific error messages from the Gemini API (e.g., rate limits, invalid keys) to facilitate troubleshooting.
     - **Journal Mode:** A dedicated command and ribbon icon (**Pen**) opens the Journal in a high-focus view. 
       - **Auto-Tagging:** All entries captured in this mode (text, images, documents) are strictly tagged with the `#journal` context.
       - **Voice Memo Integration:** Recording a voice memo via the FAB while in Journal Mode automatically creates a linked thought entry tagged `#journal`.
       - **Streamlined UI:** To maximize focus, Journal Mode hides the header, close button, avatars, and context tags, presenting a clean, chronological text-only feed.
     - **Full Mode:** Opens the complete plugin interface in a high-focus, standalone window. Features a clean interface with a dedicated header, close button, and internal tab navigation (**Th**, **Ta**, **Ai**, etc.). The "Daily" tab is hidden in this mode. Native Obsidian tab headers are hidden for a truly clean look.
     - **Timeline View:** A chronological list of thoughts and tasks accessible via the "Open timeline" command.
       - **Horizontal Date Carousel:** A scrollable date strip at the top for quick navigation. Selected date is centered, highlighted, and bolded.
       - **Infinite Vertical Scroll:** Chronological list of tasks and thoughts that dynamically loads more days as you scroll.
       - **Visual Structure:** Each date is separated by a thin horizontal divider with the full date overlaid in a clean, non-bold font. **Context and due dates are hidden in this view for a cleaner look.**
       - **Exclusions:** Automatically excludes thoughts tagged with the `journal` context.
       - **Dedicated Mode:** Opens in a high-focus view (pop-out on desktop, full-screen on mobile) with navigation tabs hidden.
     - **Floating Action Button (FAB):** A movable circular button with the alien avatar icon available in all views.
       - **Movable:** Can be dragged and repositioned anywhere within the plugin view.
       - **Quick Actions:** Clicking the FAB opens a menu with options to quickly "Add thought", "Add task", or "Add voice memo".
       - **Voice Memo Modal:** Selecting "Add voice memo" opens a specialized movable modal for recording audio, featuring a central record toggle, live timer, and instant saving to the vault.
     - **Mobile-Optimized Header:** In "Daily Mode" on mobile, the header is streamlined to show only the date and the close button on one row, with section toggles on a second row.
     - **TODAY'S CHECKLIST (Cl):** A compact, one-line list of all open to-dos (`- [ ]`) extracted from your entire thought history. Interactive checkboxes update source notes instantly.
     - **PENDING TASKS (Ta):** A compact rollup of open tasks from your tasks index that are due today or overdue.
     - **PENDING DUES (Du):** A rollup of recurring payments that are due today or overdue, featuring an inline "Pay" button.
     - **PINNED THOUGHTS (Pi):** A rollup of any thought note marked as `pinned: true` in its frontmatter.
     - **TODAY'S THOUGHTS (Th):** A full card-based view of thoughts captured today or containing today's date link. Avatars, context tags, and due dates are hidden here to maximize space and focus.
   - **Modern Card-Based Layout:** Thoughts and tasks are displayed in responsive "cards" with rounded corners and dynamic backgrounds.
     - **Dark Mode:** Transparent white background (`rgba(255, 255, 255, 0.05)`).
     - **Light Mode:** Subtle grey background (`rgba(0, 0, 0, 0.05)`).
   - **Integrated Capture Area:**
     - The capture input is docked inside both the Thoughts and Tasks tabs but is **hidden by default** to maximize viewing space.
     - **Threaded Thoughts:** Support for hierarchical replies. Each thought can be replied to using the `↩️` button, creating a nested thread.
     - **Visual Indicators:** Thoughts with replies show a **reply count badge** and a collapse/expand chevron (▶/▼).
     - **Inline Sync:** The "Sync" button sits next to the text area for a compact, chat-like feel.
     - **Context-Aware:** Automatically hides "As Task" in Thoughts tab and forces task mode with a due date picker in Tasks tab.
     - **Visibility Toggle:** A "Capture" toggle in the header allows hiding/showing the input section (default is hidden).
   - **Streamlined Header:** 
     - Filters (Status, Context, Date) and Toggles (History, Capture) are combined into a single compact, rounded bar.
     - **Centered Filters:** Text in filter dropdowns is centered for improved readability.
   - **Contemporary Controls:**
     - **Toggle Switches:** Pill-shaped toggle switches for task status, History, and Capture visibility.
     - **Alien Avatar:** Root thoughts are marked with a circular alien head SVG icon using the theme's accent color (currentColor).
     - **Alien Ribbon Icon:** The Obsidian sidebar ribbon uses the same alien SVG as the plugin icon.
   - **Desktop Optimization:** 
     - Standalone windows (Full Mode, Daily Mode, Timeline, AI Mode) hide native tab headers and include a dedicated **drag handle** at the top.
     - **Seamless Transitions:** Robust handling of mode switching by identifying and reusing existing windows or sidebar leaves.
   - **Mobile Optimization:**
     - **Opens as Main Tab:** On mobile, MINA opens as a full workspace tab (not a sidebar).
     - **Vertical Reordering:** Toggles (History/Capture) move above filters on mobile for easier thumb access.
     - **Adaptive Indentation:** Thread nesting is reduced on mobile to preserve horizontal space.
     - **Responsive Modals:** Popups anchor to the top and shrink with the `visualViewport` to stay above the virtual keyboard. Auto-scroll focuses inputs into view.
     - **Keyboard / Black-Bar Fix:** Uses `position: fixed` + `visualViewport` `resize`/`scroll` listeners to prevent iOS WebKit from sliding the container off-screen when the keyboard appears.
     - **Context Picker via `#` Trigger (Unified):** Typing `#` in any capture textarea (Thoughts, Tasks, or Edit Modal) instantly opens a search-and-select suggest modal for contexts.
       - **Fuzzy Filtering:** The list automatically filters as you type.
       - **Auto-Creation:** If a context doesn't exist, a **`＋ Create "name"`** option allows adding it to settings and the current entry in one click.
       - **Clean Input:** Upon selection, the trigger `#` is removed from the text, and the context is added to the entry's metadata, keeping the body text clean.
       - **UI Simplification:** All old static context pills, manual "add" inputs, and mobile-specific popup panels have been removed in favor of this unified trigger.
     - **File Attachment Button (`📎`):** Absolutely positioned in the textarea. Triggers a hidden `<input type="file" multiple>` to attach images or files.
     - **Left-Aligned Due Date Selector:** On mobile, the task due date selector is left-aligned (no `margin-left: auto`).
   - **Scroll Padding:** All main scrollable tab areas have `padding-bottom: 200px` so the last row is never flush against the bottom of the viewport.

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
   - **Smart Autocomplete:** Typing `[[` opens a fuzzy search for vault note referencing.
     - If the typed name does not match any existing note, a **`＋ Create "name"`** option appears at the top of the list.
     - Selecting it creates `<New Note Folder>/<name>.md` (auto-creates the folder if missing) and inserts `[[name]]` into the thought.
   - **Internal Link Navigation:** Clicking `[[note]]` links inside thought/task cards opens the linked note — new window on desktop, new tab on mobile.
   - **Image Zoom Lightbox:** Clicking any image in a thought/task card opens a full-screen overlay.
     - Desktop: mouse-wheel zoom (0.2×–8×), drag to pan when zoomed, Escape to close.
     - Mobile: pinch-to-zoom, single-finger drag to pan, tap outside (when not zoomed) to close.
   - **Inline Checklists:**
     - Type `+ item text` in the capture textarea (or edit modal) — it auto-converts to `- [ ] item text` on the fly.
     - Checklist items render as interactive **circle toggles** (accent-colored circle with ✓ glyph when checked).
     - Clicking a circle immediately toggles the checked state and persists to the markdown file without re-rendering the whole list.
     - Works in both the capture textarea and the EditEntryModal textarea.
   - **Natural Language Dates:**
     - Type `@date text ` (e.g., `@March 9 ` or `@tomorrow `) in any capture textarea or edit modal.
     - It automatically converts to an Obsidian date link (e.g., `[[2026-03-09]] `) as soon as you type a space or newline after the date text.
   - **Context Tag Placement:**
     - **Thoughts:** Context pills render at the **bottom of the card body text** (inline, with `margin-top: 5px`).
     - **Tasks:** Context pills render **right-aligned** in a meta row below the body. Due date appears **left-aligned** on the same meta row.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Fully tracked with Git.
   - **Hybrid Storage:**
     - **Table-Based:** `mina_v2.md` (thoughts) and `mina_2.md` (tasks) store data in structured Markdown tables.
     - **File-Based:** Individual Markdown files with YAML frontmatter in `thoughtsFolder` and `tasksFolder`.
   - **Deep Metadata Extraction:** 
     - Scans the **entire content** of notes (not just frontmatter) for date links in the `[[YYYY-MM-DD]]` format.
     - This allows the Daily tab to rollup any thought that mentions a specific day, regardless of when the note was created.
   - **Stable IDs:** Uses robust unique IDs for new thoughts and **content-based stable hashing** for legacy 4-column entries.
   - **Automatic Context Discovery:** Scans files on load to extract unique tags, preserving casing and multi-word contexts.
   - **Settings Protection:** Iron-clad lock mechanism prevents configuration loss during sync or updates.
   - **English-locale Timestamps:** All stored timestamps use `moment().locale('en').format(...)` wrapped with `toAsciiDigits()` to prevent non-ASCII numerals on devices with non-English locale settings.
   - **Settings Corruption Guard:** `loadSettings()` validates `timeFormat` (must contain H/h/k) and `dateFormat` (must contain Y/M/D); resets to defaults if corrupted.
   - **Seamless Mode Transitions:** Switching between "Full Mode", "Daily Mode", and "Timeline Mode" is handled automatically. The plugin identifies existing instances and updates their state or window/sidebar placement in a single action.
   - **Simultaneous Instances:** Users can now open different modes at the same time (e.g., Timeline in one window and Daily Focus in another). The plugin identifies unique instances by their mode and active tab, allowing multiple MINA views to coexist without interference.
   - **Rendering Safety:** Each thought row renders independently — a bad entry logs an error and shows a placeholder without stopping subsequent entries from rendering.
   - **`<br>` Decoding:** Stored `<br>` line-break tokens are decoded to real newlines before markdown rendering, so checklist syntax (`- [ ] `) parses correctly.

4. **Settings Tab (Inline)**
   - **Capture Folder:** Target directory for all MINA files.
   - **Thoughts/Tasks File Names:** Fully customizable storage paths.
   - **Date/Time Formats:** User-configurable moment.js formats.
   - **New Note Folder:** Folder where notes created via the `[[` link picker are saved. Default: `000 Bin`.
   - **Voice Memo Folder:** Folder where recorded voice notes are stored. Default: `000 Bin/MINA V2 Voice`.
   - **AI Chat Folder:** Folder where AI chat sessions are automatically saved. Default: `000 Bin/MINA V2 AI Chat`.
   - **Transcription Language:** Target language for audio transcription/translation. Default: `English`.
   - **Gemini API Key:** Stored securely (password field).
   - **Gemini Model:** Dropdown to select from available Gemini models. Default: `gemini-2.5-pro`.
   - **Max Output Tokens:** User-configurable `maxOutputTokens` for Gemini API (range: 256–65536, default: 65536).

- **MINA AI Chat Tab (Ai)**
  - Embedded AI assistant powered by Google Gemini.
  - **High-Focus Mode:** Dedicated "AI Mode" opens a standalone, distraction-free window (pop-out on desktop, full-screen on mobile).
    - **Unified Interface:** The chat input is always visible at the bottom on desktop and at the **top (below the grounding bar)** on mobile to ensure it remains accessible when the virtual keyboard is open.
    - **Optimized Scrolling:** The mobile view includes 120px of extra bottom padding to ensure the last responses are easily scrollable and visible.
  - **Automatic Session Saving:** Every conversation is automatically persisted to a timestamped Markdown file in the `000 Bin/MINA V2 AI Chat` folder.
  - **Multimodal Grounding:**
    - **Image Support:** Ground images via pasting from clipboard, drag-and-drop, or the upload button (`📎`). Grounded images are automatically saved to the vault's `998 Attachments` folder.
    - **File Grounding:** Ground any vault file (Markdown, CSV, etc.) for context. Grounded objects appear as interactive chips in the grounding bar.
    - **Understanding:** Gemini "sees" and understands the content of grounded images when answering.
  - **Numeric Citations:** AI responses include hyperlinked numeric tags (e.g., `[1]`). Clicking a citation instantly opens the source note or image in your vault.
  - **Grounded Notes Bar:** Horizontal scrollable chip strip showing context chips (Th, Ta, Du), grounded files/images (click to open), and the 🌐 Web toggle.
  - **Message Actions:** Hover over chat bubbles to access:
    - **Copy (`📋`):** Copy raw message text to clipboard.
    - **Save as Thought (`💾`):** Instantly save an assistant response as a new MINA thought (tagged `#ai-response`).
  - **Session Controls (Reorganized):** Buttons follow a logical sequence for a smooth workflow: Attach (`📎`), Save (`📥`), Open (`📂`), Enter (`↑`), and New Session (`🗒️`).
    - **New Chat (`🗒️`):** Resets the session and starts a new save file.
    - **Save Session (`📥`):** Manually trigger a save of the current history.
    - **Recall Session (`📂`):** Select and reload a previously saved chat file back into the window.
  - **Grounded Note Opening:** Click any grounded chip (🖼️ Image or 📄 File) to render it in a new window.
  - **File Creation:** MINA AI can autonomously create files in your vault (CSV, MD, TXT, etc.) using tool-calling.
  - **Default Grounding:** Automatically sends up to 50 of your most recent thoughts (excluding `#journal`) as context.
  - **`[[` Note Grounding:** Typing `[[` in the chat textarea opens the note picker to pin context.
  - **🌐 Web Search Toggle:** Chip in the grounded bar for real-time web-grounded responses.

6. **Dues Tab (Du)**
   - Scans all vault notes for frontmatter `category: recurring payment` and `active_status: true`.
   - **Table columns:** Payable (clickable note link), Due Date, Last Payment, Pay button.
   - **Pay Modal:** Records a payment against a recurring due, updates frontmatter, and appends a payment log to the note body.
   - **Add Recurring Due Modal:** Creates a new vault note pre-filled with all required frontmatter.

7. **Voice Notes Tab (Vo)**
   - **Recording UI:** Large central record button (●) with a running timer and status indicator.
   - **Intelligent Media Recording:** Automatically detects supported MIME types (`webm` on desktop/Android, `mp4/m4a` on iOS).
   - **Gemini Transcription & Translation:** Uses Gemini to transcribe and translate audio into the configured target language.
   - **Transcription Status:** Backlink detection automatically marks recordings with a "✅ Transcribed" badge.

## Project Architecture (Modular)

The project has been modularized into the `src/` directory for better maintainability:

- **`src/main.ts`**: Plugin entry point, lifecycle management (`onload`, `onunload`), and core service methods.
- **`src/view.ts`**: Main `MinaView` class managing the tabbed interface and high-level UI layout.
- **`src/settings.ts`**: `MinaSettingTab` implementation for plugin configuration.
- **`src/types.ts`**: Centralized TypeScript interfaces and type definitions (`MinaSettings`, `ThoughtEntry`, etc.).
- **`src/constants.ts`**: Shared constants, SVG icons, and `DEFAULT_SETTINGS`.
- **`src/utils.ts`**: Global utility functions (`toAsciiDigits`, `isTablet`).
- **`src/modals/`**: Specialized modal implementations (e.g., `EditEntryModal.ts`, `PaymentModal.ts`).

## Data Schema

### Table Storage (Legacy/Capture)
```
| ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |
| --- | --- | --- | --- | --- | --- | --- | --- |
| <id> | <parent_id_or_empty> | [[YYYY-MM-DD]] | HH:mm | [[YYYY-MM-DD]] | HH:mm | thought text | #tag1 #tag2 |
```

### File Storage (New)
Thoughts and tasks are also stored as individual `.md` files with YAML frontmatter:
```yaml
---
title: "First line of text"
created: YYYY-MM-DD HH:mm:ss
modified: YYYY-MM-DD HH:mm:ss
day: "[[YYYY-MM-DD]]"
area: MINA or MINA_TASKS
status: open or done (tasks only)
due: "[[YYYY-MM-DD]]" (tasks only)
context:
  - tag1
  - tag2
---
Body text here...
```

## Build & Deploy

```bash
npm run build
# Compiles src/main.ts and bundles to main.js using esbuild
# Deployment: copy main.js and manifest.json to the vault plugin folder
```

## Key Technical Notes (Modular Updates)

- **Entry Point:** The build system now points to `src/main.ts` as the primary entry point.
- **Componentization:** Each tab's logic is contained within `MinaView` but utilizes specialized modals from `src/modals/` for complex interactions.
- **State Management:** `getState()` and `setState()` in `MinaView` ensure the `activeTab` persists across window pops and Obsidian restarts.
- **Mobile Keyboard Fix:** Optimized `visualViewport` listeners are maintained in `MinaView` to handle iOS WebKit layout shifts.
- **Deep Metadata Parsing:** The `allDates` array in `ThoughtEntry` captures every date link found in the entire file, enabling rich daily rollups.
- **Layout Isolation:** Daily tab sections use `flex-shrink: 0` and `block` content layouts to prevent distortion during expansion/collapse.
