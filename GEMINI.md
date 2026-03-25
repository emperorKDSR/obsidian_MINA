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
     - **Thinking Icon:** Root thoughts are marked with a 💭 icon; replies are streamlined without the icon.
   - **Desktop Optimization:** Standalone windows hide native tab headers and include a dedicated **drag handle** at the top.
   - **Mobile Optimization:**
     - **Vertical Reordering:** Toggles (History/Capture) move above filters on mobile for easier thumb access. These toggles are now explicitly left-aligned and rendered at the top of the header section on mobile devices.
     - **Adaptive Indentation:** Thread nesting is reduced on mobile to preserve horizontal space.
     - **Responsive Modals:** Popups use `95vw` and anchor to the top to avoid virtual keyboard overlap.

2. **Review & Management**
   - **Modification Tracking:** Every entry tracks its **Modified Date** and **Modified Time**.
   - **Advanced Thread Sorting:** 
     - History is sorted by the latest activity. 
     - **Bubble-up Logic:** Adding a reply or editing a child thought automatically updates the parent's modification time, moving the entire thread to the top.
   - **Interactive Filters:** Status, dynamic Context tags, and Date presets (Today, This Week, Next Week, Overdue, Custom Range).
   - **History Toggle:** Instantly switch between full history and strictly **"Today's"** entries.
   - **Advanced Editing:** 
     - Double-click or use `✏️` to open a movable Modal for full text and context editing.
     - **Thread Protection:** Deletion (`🗑️`) is restricted for entries that have active replies to prevent orphaned threads.
   - **File & Image Support:** Paste images or drag files directly into capture areas or edit modals.
   - **Smart Autocomplete:** Typing `\` opens a fuzzy search for vault note referencing.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Fully tracked with Git.
   - **Advanced Table-Based Storage:**
     - **Thoughts:** `| ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |`
     - **Tasks:** `| Status | Date | Time | Modified Date | Modified Time | Due Date | Task | Context |`
   - **Stable IDs:** Uses robust unique IDs for new thoughts and **content-based stable hashing** for legacy 4-column entries.
   - **Automatic Context Discovery:** Scans files on load to extract unique tags, preserving casing and multi-word contexts.
   - **Settings Protection:** Iron-clad lock mechanism prevents configuration loss during sync or updates.

4. **Settings Tab**
   - **Capture Folder:** Target directory for all MINA files.
   - **Thoughts/Tasks File Names:** Fully customizable storage paths.
   - **Date/Time Formats:** User-configurable moment.js formats.
