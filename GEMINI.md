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
     - The capture input is now docked directly inside both the Thoughts and Tasks tabs for instant entry.
     - **Threaded Thoughts:** Support for hierarchical replies. Each thought can be replied to, creating a threaded conversation.
     - **Collapse/Expand:** Threads can be collapsed or expanded to manage visual clutter.
     - **Inline Sync:** The "Sync" button sits next to the text area for a compact, chat-like feel.
     - **Context-Aware:** The capture area automatically hides "As Task" in the Thoughts tab and forces task mode with a due date picker in the Tasks tab.
     - **Visibility Toggle:** A "Capture" toggle in the header allows hiding/showing the input section.
   - **Streamlined Header:** 
     - Removed redundant titles to maximize screen real estate.
     - Filters (Status, Context, Date) and Toggles (History, Capture) are combined into a single compact, rounded bar.
   - **Contemporary Controls:**
     - **Toggle Switches:** Replaced standard checkboxes with animated pill-shaped toggle switches for task completion and UI settings.
     - **Thinking Icon:** Thoughts are marked with a 💭 icon for quick visual distinction.
   - **Desktop Optimization:**
     - **Cleaner Window:** Native tab headers and view titles are hidden in standalone popout windows.
     - **Drag Handle:** A subtle, dedicated drag area at the top of the window allows moving the popout easily.
   - **Mobile Optimization:**
     - **Responsive Modals:** Popups use `95vw` and are anchored to the top to prevent overlap with virtual keyboards.
     - **Flex-Wrap Headers:** Footer and header elements wrap naturally on narrow screens.

2. **Review & Management**
   - **Interactive Filters:**
     - **Status Filter:** Toggle between "All Status", "Pending", or "Completed" (Tasks only).
     - **Context Filter:** Dynamically filter by used context tags.
     - **Date Filter:** Quick presets for "Today", "This Week", "Next Week", "Overdue", and "Custom Date Range".
   - **History Toggle:** A dedicated toggle to instantly switch between viewing all history or strictly entries from **"Today"**.
   - **Advanced Editing:** 
     - Double-click any entry or use the ✏️ button to open a movable Modal.
     - Supports full text editing, context tag management, and due date updates.
     - **Native Deletion:** Custom `ConfirmModal` prevents focus loss to the main vault window during deletion.
   - **File & Image Support:**
     - **Paste/Drag-and-Drop:** Directly paste images or drag files into the capture area or edit modals.
     - **Auto-Saving:** Attachments are automatically saved to the vault's default folder with timestamps.
   - **Smart Autocomplete:** Typing `\` opens a fuzzy search to reference any existing note in the vault.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Codebase is fully tracked with Git.
   - **Segregated Table-Based Storage:**
     - **Thoughts:** `| Date | Time | Thought | Context |` (default: `mina_1.md`).
     - **Tasks:** `| Status | Date | Time | Due Date | Task | Context |` (default: `mina_2.md`).
   - **Smart Insertion:** New entries are inserted at the top of the tables (below headers).
   - **Automatic Context Discovery:** Scans files on load to extract all unique context tags, preserving casing and multi-word tags.
   - **Settings Protection:** Iron-clad lock mechanism prevents settings wipes during sync or updates.

4. **Settings Tab**
   - **Capture Folder:** Target directory for all MINA files.
   - **Thoughts/Tasks File Names:** Fully customizable storage paths.
   - **Date/Time Formats:** User-configurable moment.js formats.
