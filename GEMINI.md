You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "C:\Users\57092\OneDrive\wFiles\1 Obsidian\K0000\K0000"

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
     - **Daily Mode:** A dedicated command "Daily Mode" opens the dashboard in a high-focus view. Uses a custom **Sun** icon.
     - **Task Mode:** A dedicated command "Task Mode" opens the Tasks tab in a high-focus view.
     - **AI Mode:** A dedicated command "AI Mode" opens the AI Chat in a high-focus view. Uses a custom **Robot** icon.
     - **Journal Mode:** A dedicated command and ribbon icon (**Pen**) opens the Journal in a high-focus view. 
       - **Auto-Tagging:** All entries captured in this mode (text, images, documents) are strictly tagged with the `#journal` context.
       - **Smart FAB Capture:** To maintain maximum focus, the inline capture area is removed. Any capture initiated via the FAB (thoughts, tasks, or voice memos) is automatically tagged with the `#journal` context.
       - **Persistent Reordering:** Supports drag-and-drop reordering of journal entries, which is saved and persisted across app reloads.
       - **Streamlined UI:** Hides header, close button, avatars, and context tags.
     - **Focus Mode:** A dedicated command and ribbon icon (**Target**) opens the Focus Mode.
       - **Pinned-Only:** Displays strictly only notes that are pinned (`pinned: true`).
       - **High-Focus UI:** Hides the header, close button, and capture area.
       - **Persistent Reordering:** Supports drag-and-drop to reorder pinned notes.
     - **Grundfos Mode:** A dedicated command and ribbon icon (**Pump**) opens Grundfos Mode in a high-focus view.
       - **Context-Specific:** Displays notes with the "Grundfos" context/tag.
       - **Smart FAB Capture:** To maintain maximum focus, the inline capture area is removed. Any capture initiated via the FAB (thoughts, tasks, or voice memos) is automatically tagged with the "Grundfos" context.
       - **Persistent Reordering:** Supports drag-and-drop reordering.
     - **Memento Mori:** A dedicated command and ribbon icon (**Hourglass**) opens a life visualization grid.
       - **Life Visualization:** Displays a grid of 90 years (rows) by 52 weeks (boxes).
       - **Visual Progress:** Color-coded boxes represent past (consumed), current (highlighted), and future (remaining) weeks.
       - **Life Stats:** Displays real-time calculations: Age, total weeks lived, and % of life consumed.
       - **Fixed Layout:** One year per row across all devices (Desktop, Mobile, Tablet).
     - **Timeline View:** A chronological list of thoughts and tasks. Uses a custom **Clock** icon.
     - **Custom Modes:** Users can build their own high-focus modes directly in the settings.
       - **Dynamic Configuration:** Define Name, Context (dropdown), Keywords (including exclusion support), and Icon (dropdown).
       - **Smart Filtering:** Modes can filter by a primary context tag and/or multiple keywords (supports `[[Note Links]]` and `-exclude` logic).
       - **Full Feature Set:** Custom modes automatically inherit persistent reordering, smart FAB capture, contextual search, and universal blur.
     - **Floating Action Button (FAB):** A movable circular button with the alien avatar icon. Positioned in the **bottom-right corner** on desktop.
   - **Modern Card-Based Layout:** Thoughts and tasks are displayed in responsive "cards" with rounded corners.
   - **Compact View Mode:** A toggleable layout optimized for scanning many entries.
     - **Line Clamping:** Cards are height-restricted to approximately 4 lines of text.
     - **Visual Feedback:** Includes a subtle fade-out effect at the bottom of compact cards to indicate truncated content.
     - **Inline Expansion:** Each card features a "Show more/less" toggle to expand content instantly.
     - **Global Commands:** `Enable Compact View` and `Enable Full View` to switch layouts globally.
     - **Persistence:** Layout preferences are saved and applied automatically across all modes.
   - **Privacy & Confidentiality:**
     - **Universal Blur:** Note-by-note sensitivity blurring available across all modes via 👁️/👁️‍🗨️ toggle.
     - **Strict Privacy:** Blurred notes remain fully obscured (no hover-to-peek).
     - **Persistent State:** Individual blur preferences and reordering are persisted across app reloads.
   - **Contextual Search:** A powerful search system integrated into every mode.
     - **"AND" Logic:** Supports multi-token search; notes only appear if they contain all typed words (e.g., "Grundfos invoice").
     - **Instant Filtering:** Results update in real-time as you type.
     - **Mode-Specific:** Automatically scoped to the current view (e.g., searching in Focus Mode only searches pinned notes).
     - **Mobile Optimization:** On mobile, the search bar is hidden by default to save space and can be toggled via the FAB menu (**Show/Hide Search**).
     - **Persistent Query:** The search query remains active as you switch between different tabs and modes.
   - **Desktop Optimization:** 
     - Standalone windows hide native tab headers and include a dedicated **drag handle** at the top.
     - **Seamless Transitions:** Robust handling of mode switching.
   - **Mobile Optimization:**
     - **Dynamic Headers:** The topmost center title follows the format **"MINA - {mode}"** and updates reactively as you switch contexts.
     - **Opens as Main Tab:** MINA opens as a full workspace tab.
     - **Context Picker via `#` Trigger:** Typing `#` opens a suggest modal for contexts.
     - **File Attachment Button (`📎`):** Triggers file upload.
   - **Scroll Padding:** All main scrollable tab areas have `padding-bottom: 200px`.

4. **Settings Tab (Inline)**
   - **Capture Folders:** Configure storage paths for thoughts, tasks, and attachments.
   - **Date/Time Formats:** Customizable moment.js formats.
   - **Gemini AI Settings:** Securely store API key, model selection, and max tokens.
   - **Custom Mode Management:** Create, edit, and delete user-defined high-focus modes with a dedicated UI, including context dropdowns and keyword filtering.
   - **Memento Mori:** Configure Birth Date and Life Expectancy for life visualization.
   - **Transcription:** Set target language for voice note processing.

2. **Review & Management**
   - **Modification Tracking:** Every entry tracks its **Modified Date** and **Modified Time**.
   - **Advanced Thread Sorting:** History is sorted by the latest activity with bubble-up logic.
   - **Interactive Filters:** Status, dynamic Context tags, and Date presets.
   - **Advanced Editing:** 
     - Double-click or use `✏️` to open a Modal for full text and context editing.
     - **Attachment Support:** Insert pictures, files, and clipboard images directly into the edit modal via the 📎 button, drag-and-drop, or pasting.
     - **Full Context Management:** Edit modal shows all contexts (plugin settings + entry's own). Click to toggle on/off. Type a new context in the input and press Enter or tap Done/Go on mobile keyboard. A `+` button is also available. New contexts are saved to plugin settings immediately.
   - **Convert Thought to Task:** `📋` button converts thoughts to tasks.
   - **Image Zoom Lightbox:** Clicking any image opens a full-screen overlay.
   - **Inline Checklists:** Type `+ item` to auto-convert to `- [ ] item`.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Fully tracked with Git.
   - **Hybrid Storage:** Markdown tables and individual Markdown files with YAML frontmatter.
   - **Automatic Context Discovery:** Scans files on load to extract unique tags.
   - **Settings Protection:** Iron-clad lock mechanism prevents configuration loss.

4. **MINA AI Chat Tab (Ai)**
   - Embedded AI assistant powered by Google Gemini.
   - **Automatic Session Saving:** Persisted to timestamped Markdown files.
   - **Multimodal Grounding:** Supports images and file grounding.
   - **Numeric Citations:** AI responses include hyperlinked numeric tags (e.g., `[1]`).
   - **File Creation:** Can autonomously create files using tool-calling.

## Project Architecture (Modular)

- **`src/main.ts`**: Plugin entry point and lifecycle management.
- **`src/view.ts`**: Main `MinaView` managing the interface.
- **`src/settings.ts`**: `MinaSettingTab` implementation.
- **`src/types.ts`**: Centralized TypeScript interfaces.
- **`src/constants.ts`**: Shared constants and SVG icons.
- **`src/modals/`**: Specialized modal implementations.

## Build & Deploy

```bash
npm run build
# Deployment: copy main.js, manifest.json, and styles.css to the vault plugin folder
```
