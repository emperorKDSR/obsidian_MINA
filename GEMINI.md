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
   - **Dedicated Modes (High Focus):** The plugin has moved away from a monolithic "Full Mode" dashboard to a set of dedicated, high-focus modes accessible via ribbon icons and commands.
     - **Daily Mode (Sun):** A minimalist dashboard with persistent foldable sections and ultra-compact navigation pills (**SU**, **CL**, **TA**, **PF**, **PI**, **TH**).
       - **Intelligent Summary (SU):** AI-powered digest of today's activities and priority suggestions using Gemini AI.
       - **Flicker-Free Interaction:** Uses targeted re-rendering to update specific section containers without refreshing the entire view.
       - **Minimalist Design:** Removed redundant UI elements like search bars and close buttons to maximize content focus.
     - **Journal Mode (Pen):** Auto-tags captures with `#journal` and supports persistent drag-and-drop reordering.
     - **Task Mode (Check-square):** A dedicated view for task management and review.
     - **Personal Finance Mode (Dollar):** Specifically manages recurring payments and dues (replaces old Dues tab).
     - **AI Mode (Robot):** Interactive chat with Gemini AI, supporting file grounding and numeric citations.
     - **Timeline Mode (Clock):** A chronological view of all captures across the vault.
     - **Focus Mode (Target):** Displays strictly only pinned notes (`pinned: true`) with persistent reordering.
     - **Grundfos Mode (Pump):** High-focus view for entries tagged with "Grundfos".
     - **Memento Mori (Hourglass):** Life visualization grid (90 years x 52 weeks) with real-time stats.
     - **Settings Mode (Gear):** Opens plugin configuration in a dedicated window.
   - **Borderless Experience:** 
     - On desktop (macOS & Windows), dedicated windows are truly borderless. 
     - Native Obsidian tab headers (`.workspace-tab-header-container`) and view headers (`.view-header`) are force-hidden via CSS and class injection.
     - Includes a custom **drag handle** at the top for window movement.
   - **Modern Card Layout:** Responsive "cards" with rounded corners, universal blur toggles (👁️/👁️‍🗨️), and compact view support.
   - **Floating Action Button (FAB):** Movable circular button for quick capture across all modes.
   - **Contextual Search:** "AND" logic multi-token search integrated into specialized modes (excluding Daily Mode).
   - **Mobile Optimization:** Dynamic headers ("MINA - {mode}"), `#` trigger for context picking, and visual viewport syncing for reliable keyboard handling.

2. **Review & Management**
   - **Modification Tracking:** Every entry tracks its **Modified Date** and **Modified Time**.
   - **Advanced Thread Sorting:** History is sorted by the latest activity with bubble-up logic.
   - **Advanced Editing:** Double-click or `✏️` to open a Modal for full text, context, and attachment management (images, files, clipboard).
   - **Convert Thought to Task:** `📋` button converts thoughts to tasks instantly.
   - **Transcription:** High-quality voice note transcription via Gemini AI with target language support.

3. **Functionality & Data Integrity**
   - **Git Tracking:** Entire codebase is fully tracked with Git.
   - **Hybrid Storage:** Markdown tables for captured logs and individual Markdown files with YAML frontmatter for thoughts/tasks.
   - **Automatic Context Discovery:** Scans logs on load to extract unique tags automatically.

4. **Modular Architecture**
   - The codebase has been refactored for maintainability and performance:
     - **`src/main.ts`**: Plugin entry point and orchestrator.
     - **`src/view.ts`**: Lean view manager that lazily loads tab components and provides shared AI services.
     - **`src/tabs/`**: Contains specialized components (`DailyTab`, `TasksTab`, `AiTab`, etc.) inheriting from a shared `BaseTab`.
     - **`src/tabs/BaseTab.ts`**: Centralizes shared UI rendering logic and interaction hooks.
     - **`src/modals/`**: Specialized modal implementations.

## Build & Deploy

```bash
npm run build
# Deployment: copy main.js, manifest.json, and styles.css to the vault plugin folder
```
