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
     - **Due Date Picker:** When "As Task" is checked, a date selector appears allowing you to set a due date.
     - **Recent Tasks (List View):** Recent tasks are displayed as a clean list with interactive checkboxes. Metadata includes Capture Date, Time, Due Date, and Context.
     - **Recent Thoughts (Table View):** Recent thoughts are displayed in a proper HTML table with column headers for `Date`, `Time`, `Thought`, and `Context`.
   - **Review Tasks Mode:**
     - **Full Task Review:** A dedicated interface to review ALL tasks from your `Tasks.md` file.
     - **Smart Filters:**
       - **Status Filter:** Filter by "All Status", "Pending", or "Completed".
       - **Context Filter:** Filter by any dynamic context tags.
       - **Date Filter:** Find tasks due **"Today"** or **"This Week"** (uses the Due Date column).
     - **Interactive List:** Supports real-time checkbox toggling and double-click editing.
   - **Review Thoughts Mode:**
     - **Full Thoughts Review:** A dedicated interface to review ALL thoughts from your `Thoughts.md` file.
     - **Filter Bar:** Filters by Context and Date (Today/This Week).
     - **Structured Table View:** Displays thoughts in a formatted HTML table.
   - **Standalone Window & Mobile Support:** 
     - **Desktop:** Opens in a separate popout window.
     - **Mobile:** Opens in the right sidebar with auto-scroll and focus optimizations.
   - **Form Features:**
     - Image/File support (paste/drag-and-drop).
     - Keyboard shortcuts: `Enter` to sync, `Shift+Enter` for new lines.
     - Dynamic Context Tags: Add/remove tags directly in the UI.

2. **Functionality & Data Integrity**
   - **Segregated Table-Based Storage:**
     - **Thoughts Table:** `| Date | Time | Thought | Context |` (saved to `Thoughts.md`).
     - **Tasks Table:** `| Status | Date | Time | Due Date | Task | Context |` (saved to `Tasks.md`).
   - **Due Date Handling:** Due dates are automatically enclosed in `[[ ]]` (e.g., `[[2026-03-22]]`) for daily note linking.
   - **Smart Insertion:** New entries are inserted at the top of the table (below the header).
   - **Newline Handling:** Newlines are converted to `<br>` tags to preserve Markdown table integrity.
   - **Iron-Clad Settings Protection:** Fail-safe "Lock" mechanism ensures custom contexts and settings are never wiped during updates or sync errors.

3. **Settings Tab**
   - **Capture Folder:** Target directory for all MINA files.
   - **Thoughts/Tasks File Names:** Customizable filenames.
   - **Date/Time Formats:** Configurable moment.js format strings.
   - **Capture Contexts:** Global management of context tags.
