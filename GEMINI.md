You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "/Users/vanguardph/Documents/Obsidian/K0000"

I want you to develop a plugin for me to quickly capture my thoughts and append it to a file.

This plugin will capture: 1) thoughts, 2) tasks.

When capturing thoughts and tasks,  you must datetimestamp it so it will be easier to sort later.

All new captures need to be appended in the beginning of the file.

## Current Implementation

The "MINA V2" plugin has been developed with the following features and implementations:

1. **User Interface (UI) & Aesthetics**
   - **Dedicated Modes (High Focus):** The plugin has moved away from a monolithic "Full Mode" dashboard to a set of dedicated, high-focus modes accessible via ribbon icons and commands.
     - **Daily Mode (Sun):** A minimalist dashboard with persistent foldable sections and ultra-compact navigation pills (**SU**, **CL**, **TA**, **PF**, **PI**, **TH**).
       - **Config Mode Toggle:** Includes a discrete "Config" button next to the title to show/hide the navigation pills, decluttering the header.
       - **Quick Action Buttons:** Added high-visibility "Add Note" (✍️) and "Add Task" (✅) buttons for instant capture directly from the dashboard.
       - **Intelligent Summary (SU):** AI-powered digest of today's activities and priority suggestions using Gemini AI.
       - **Flicker-Free Interaction:** Uses targeted re-rendering to update specific section containers without refreshing the entire view.
     - **Timeline Mode (Clock):** A modern chronological view with a **Thread Aesthetic**.
       - **Vertical Thread:** A continuous subtle line connecting all entries through the day.
       - **Stitch Dots:** Every thought and task is "pinned" to the thread with a small indicator dot.
     - **Journal Mode (Pen):** A high-end minimalist logbook experience with sticky date headers, a modern action row (Add Note/Task), and a discrete search toggle.
     - **Task Mode (Check-square):** A dedicated view for task management and review.
     - **Personal Finance Mode (Dollar):** Specifically manages recurring payments and dues.
     - **AI Mode (Robot):** Redesigned interactive chat with a modern, floating input area, refined message bubbles, and high-visibility grounding chips.
       - **Modern Input:** Auto-expanding input area with integrated "Attach" and "Save" shortcuts.
       - **AI Configuration:** Includes a dedicated "Config" button that opens a modern modal to manage your Gemini API Key, Model selection, and Token limits, removing clutter from the main settings tab.
       - **Grounded History:** Session-wide grounding with a dedicated scrollable chip bar for notes and web-search toggling.
     - **Focus Mode (Target):** Displays strictly only pinned notes (`pinned: true`) with persistent reordering.
     - **Grundfos Mode (Pump):** High-focus view for entries tagged with "Grundfos", redesigned with a modern header, action buttons, and integrated search.
     - **Custom Modes:** Any custom-defined modes now inherit the modern "ContextTab" design with dedicated headers and quick-capture buttons.
     - **Memento Mori (Hourglass):** A sophisticated life-visualization tool.
       - **Hourglass Aesthetic:** A minimalist SVG hourglass where the top bulb represents your "Life to Live" (high contrast) and the bottom bulb represents your "Life Lived" (dimmed).
       - **Precision Masking:** Uses SVG masks to show exact percentage-based sand levels for both bulbs.
       - **Zero-Scroll Layout:** The entire life-grid (90+ years) dynamically scales to fit your screen perfectly, showing all blocks in one view on both desktop and mobile.
       - **Pop-up Configuration:** Integrated "Configure" button that opens a dedicated modal to update Birth Date and Life Expectancy.
       - **Full Refresh:** Includes a "Full Refresh" capability to synchronize settings and reload the entire plugin interface.
     - **Settings Mode (Gear):** Opens plugin configuration in a dedicated window.
   - **Modern Card Design (Global):**
     - **Minimalist Action Toolbar:** Hover-activated toolbar with sleek line icons (Edit, Delete, Pin, Blur, Reply, Convert).
     - **Refined Expansion Toggle:** A minimalist centered chevron with a subtle gradient fade for long notes.
   - **Minimalist Input Modal:**
     - **Clean Slate Look:** Removed all headers and titles to focus entirely on writing.
     - **Natural Language Dates:** Trigger date conversion directly in the modal via the `@` prefix (e.g., `@today` -> `[[2026-04-18]]`).
     - **Smart Suggestions:** Supports `[[` for file suggestions and `#` for context/tag selection.
     - **Context Chips:** Manage tags as interactive pills; click to remove, `+` to add.
     - **Mobile Visibility Fix:** Adjusted top padding to ensure the first letter is never cut off on mobile devices.
   - **Borderless Experience:** 
     - Dedicated windows are truly borderless with native headers force-hidden via CSS.
     - Includes a custom **drag handle** at the top for window movement.
     - **Minimalist Mobile UI:** On mobile devices, the display title is simplified to "M.I.N.A." for a cleaner interface.
   - **Global Image Zoom:** Window-aware zooming that stays within the same tab or popout window.
   - **Pure Content Focus:** Removed the global FAB (Floating Action Button) to declutter the interface across all modes.

2. **Review & Management**
   - **Modification Tracking:** Every entry tracks its **Modified Date** and **Modified Time**.
   - **Advanced Thread Sorting:** History is sorted by the latest activity with bubble-up logic.
   - **Advanced Editing:** Double-click or `✏️` to open the minimalist modal for full text, context, and attachment management.
   - **Convert Thought to Task:** `📋` icon in the toolbar converts thoughts to tasks instantly.
   - **Transcription:** High-quality voice note transcription via Gemini AI with target language support.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Entire codebase is fully tracked with Git.
   - **Hybrid Storage:** Markdown tables for captured logs and individual Markdown files with YAML frontmatter for thoughts/tasks.
   - **Automatic Context Discovery:** Scans logs on load to extract unique tags automatically.
   - **Modern Stack:** Upgraded to TypeScript 6.0 and esbuild 0.28 for improved build performance and type safety.

4. **Modular Architecture**
   - The codebase has been refactored for maintainability and performance:
     - **`src/main.ts`**: Plugin entry point and orchestrator.
     - **`src/view.ts`**: Lean view manager that lazily loads tab components and provides shared AI services.
     - **`src/tabs/`**: Contains specialized components (`DailyTab`, `TasksTab`, `AiTab`, `JournalTab`, etc.) inheriting from `BaseTab`.
     - **`src/tabs/BaseTab.ts`**: Centralizes shared UI rendering logic and interaction hooks.

## Build & Deploy

```bash
npm run build
# Deployment: copy main.js, manifest.json, and styles.css to the vault plugin folder
```
