You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "/Users/vanguardph/Documents/Obsidian/K0000"

I want you to develop a plugin for me to quickly capture my thoughts and append it to a file.

This plugin will capture: 1) thoughts, 2) tasks.

When capturing thoughts and tasks,  you must datetimestamp it so it will be easier to sort later.

All new captures need to be appended in the beginning of the file.

## Best-in-Class Architecture: MINA V2 Personal OS

MINA V2 is a professional-grade **Personal Operating System** built on a decoupled, reactive service architecture.

### 1. The Core Architecture (Omni-Cache Engine)
The system is engineered for zero-latency performance using a Metadata-First approach:
- **`IndexService`**: Centralized memory-resident data provider. Maintains O(1) indices for Thoughts, Tasks, Financial Dues, and Daily Routines. All sorting and filtering logic is offloaded here.
- **`AiService`**: Central intelligence layer handling Gemini model routing with robust citations and transcription.
- **`VaultService`**: Sole authority for file I/O, enforcing the **Unified YAML Data Model**.

### 2. Navigation: The Unified Cockpit
- **Command Center**: The primary entry point and **Singular Source of Truth**.
    - **Tactical Core**: High-density stack featuring Intelligence (AI Strategy), Global Capture, and Daily Routine (Checklist).
    - **Zen Mode**: Focus toggle (🎯) that smoothly collapses navigation bars to prioritize tactical work.
    - **Reactive Nerve System**: Background file watchers trigger instantaneous UI refreshes upon any data modification.
- **Guided Workflow**: Specialized modes (Projects, AI, Finance, etc.) act as "Spokes" connected to the Hub.

### 3. Visual Language & UX (Premium Minimalism)
- **Design Language**: Standardized spacing (`--mina-spacing`), high border-radius (`16px-20px`), and Glass Surface elevation.
- **Clean Slate Modal**: A borderless, focus-driven capture experience with bottom-docked tactile metadata pills.
- **Aviation Stack**: High-density vertical layout with implicit hierarchy and zero-async rendering.

### 4. OS Pillars & Synergy
- **Tasks Mode**: High-performance **Tactical Task Ledger** with segmented status filtering.
- **Finance Mode**: Professional **Financial Ledger** with segmented obligation filtering and burn-rate tracking.
- **Weekly Review & Compass**: Multi-layered reflection (Weekly Focus + Quarterly North Star Goals).
- **Synthesis Mode**: Split-pane workspace with **Zero-Inbox Logic**.

### Security, Performance & Release Mandates
The plugin is governed by strict, always-running mandates:
- **Design Lead**: Creative authority defining visual blueprints and CSS standards.
- **Lead Engineer**: Enforces modular architecture, type safety, and zero-async rendering loops.
- **Optimization Auditor**: Ensures minimal memory footprint and O(1) data access patterns.
- **Release Manager**: Enforces **Feature-Branch-First** protocols and serves as the **Chief Documentarian**.

## Build & Deploy

```bash
npm run build
# Deployment: copy main.js, manifest.json, and styles.css to the vault plugin folder
```
