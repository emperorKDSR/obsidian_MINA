You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "C:\Users\57092\iCloudDrive\iCloud~md~obsidian\K0000"

I want you to develop a plugin for me to quickly capture my thoughts and append it to a file.

This plugin will capture: 1) thoughts, 2) tasks.

When capturing thoughts and tasks,  you must datetimestamp it so it will be easier to sort later.

All new captures need to be appended in the beginning of the file.

## Current Implementation

The "MINA V1" plugin has been developed with the following features and implementations:

1. **User Interface (UI)**
   - **Tabbed Navigation:** The MINA V1 window features three primary modes: **Capture**, **Tasks**, and **Thoughts**.
   - **Capture Mode:**
     - **Input Form:** A text area for quick capture, persistent context tag selection, and a "Sync" button.
     - **Due Date Picker:** When "As Task" is checked, a native calendar date selector appears.
     - **Recent Tasks (List View):** Recent tasks are displayed as a clean list with interactive checkboxes and metadata (Capture Date, Time, Due Date, and Context).
     - **Recent Thoughts (Table View):** Recent thoughts are displayed in a proper HTML table with column headers.
   - **Review Tasks Mode:**
     - **Full Task Review:** A dedicated interface to review ALL tasks from the `mina_2.md` file.
     - **Interactive Filters:**
       - **Status Filter:** Filter by "All Status", "Pending", or "Completed".
       - **Context Filter:** Filter by any dynamic context tags.
       - **Date Filter:** Find tasks due **"Today"**, **"This Week"**, **"Next Week"**, **"Overdue"**, or select a **"Custom Date Range"** via native calendar pickers.
     - **Editable Due Dates:** Click on any task's due date to update it directly via a native date picker.
     - **Interactive List:** Supports real-time checkbox toggling, a dedicated inline delete button (🗑️), and an advanced edit (✏️) button that opens a native pop-up Modal. This modal features a full text editor with `\` autocomplete, an interactive context tag selector, and due date management.
   - **Review Thoughts Mode:**
     - **Full Thoughts Review:** A dedicated interface to review ALL thoughts from the `mina_1.md` file.
     - **Filter Bar:** Filter by Context and Date (Today, This Week, Custom Date Range).
     - **Mobile-Optimized Table:** Displays thoughts in a formatted HTML table with horizontal scrolling support for small screens.
     - **Inline Editing & Deletion:** Double-click any thought text (or use the ✏️ button) to open a native pop-up Modal for editing both the description (with `\` autocomplete) and context tags. Includes a dedicated delete button (🗑️).
   - **Standalone Window & Mobile Support:** 
     - **Desktop:** Opens in a separate popout window.
     - **Mobile:** Opens in the right sidebar with auto-scroll and focus optimizations. Pop-up Modals are anchored to the top of the screen to prevent virtual keyboard overlap.
   - **Form Features:**
     - Image/File support (paste/drag-and-drop) with auto-saving to the vault's attachment folder.
     - Keyboard shortcuts: `Enter` to sync, `Shift+Enter` for new lines.
     - Dynamic Context Tags: Add (`+ add`) or remove (Right-click) tags directly in the UI.
     - Autocomplete File Suggestion: Typing `\` in any capture or edit text area opens a fuzzy search to reference existing vault notes.

2. **Functionality & Data Integrity**
   - **Git Tracking:** The codebase is fully tracked with Git for version control.
   - **Segregated Table-Based Storage:**
     - **Thoughts Table:** `| Date | Time | Thought | Context |` (default file: `mina_1.md`).
     - **Tasks Table:** `| Status | Date | Time | Due Date | Task | Context |` (default file: `mina_2.md`).
   - **Due Date Handling:** Due dates are automatically enclosed in `[[ ]]` (e.g., `[[2026-03-22]]`) for daily note linking.
   - **Smart Insertion:** New entries are inserted at the top of the table (just below the header).
   - **Newline Handling:** Newlines within entries are converted to `<br>` tags to preserve table integrity.
   - **Automatic Context Pre-loading:** On load, the plugin scans the thoughts and tasks files to automatically discover and extract all used tags, making them available as context options.
   - **Iron-Clad Settings Protection:** Fail-safe "Lock" mechanism ensures settings and custom contexts are never wiped during updates or iCloud sync errors.

3. **Settings Tab**
   - **Capture Folder:** Target directory for all MINA files (default: `000 Bin`).
   - **Thoughts File Name:** Customize where thoughts are saved (default: `mina_1.md`).
   - **Tasks File Name:** Customize where tasks are saved (default: `mina_2.md`).
   - **Date/Time Formats:** Configurable moment.js format strings.
