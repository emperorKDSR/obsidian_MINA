You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "/Users/vanguardph/Documents/Obsidian/K0000"

I want you to develop a plugin for me to quickly capture my thoughts and append it to a file.

This plugin will capture: 1) thoughts, 2) tasks.

When capturing thoughts and tasks,  you must datetimestamp it so it will be easier to sort later.

All new captures need to be appended in the beginning of the file.

## Best-in-Class Architecture: MINA V2 Personal OS

MINA V2 has transitioned into a professional-grade **Personal Operating System** built on a decoupled, service-oriented architecture.

### 1. The Core Architecture (Service-Oriented)
The codebase is structured for maximum scalability and type safety:
- **`AiService`**: Centralized intelligence layer. Handles Gemini model routing, transcription, and prompt engineering with robust fallbacks and error handling.
- **`VaultService`**: Sole authority for file I/O. Enforces the **Unified Data Model**, managing the creation, modification, and deletion of all capture files.
- **`IndexService`**: A high-performance metadata provider. Maintains real-time in-memory indices of all thoughts and tasks for instantaneous UI updates without vault-wide re-scans.

### 2. Unified Data Model (Markdown YAML)
- **Retirement of Tables**: Legacy table-based storage has been retired in favor of pure **Markdown files with YAML frontmatter**.
- **First-Class Citizens**: Every thought and task is an individual file, ensuring perfect interoperability with Obsidian's core features (Graph, Search, Backlinks).
- **Auto-Migration**: A built-in bridge automatically migrates legacy table rows into the new file model upon plugin startup.

### 3. Navigation: The Hub & Spoke Model
- **Command Center**: A premium central hub serving as the "Heart" of the OS. Features dynamic snapshots of Habits, Cashflow, and a Global Capture field.
- **Guided Workflow**: Specialized modes (Daily, Projects, AI, etc.) act as "Spokes" connected to the Hub.
- **The Home Circuit**: A persistent **🏠 Home** icon in every mode ensures seamless transit back to the Command Center.

### 4. OS Pillars & Synergy
- **Habit Lab**: Stitch Dots tracking with YAML persistence.
- **Projects Mode**: Objective-based grouping and dedicated project focus dashboards.
- **Weekly Review & Compass**: Multi-layered reflection (Weekly Focus + Quarterly North Star Goals).
- **Synthesis Mode**: Split-pane workspace for transforming raw captures into permanent knowledge.
    - **Zero-Inbox Logic**: Synthesized thoughts are automatically flagged (`synthesized: true`) and cleared from the feed to maintain focus.
    - **Vision Integration**: Full support for image rendering and high-performance zooming within the synthesis canvas.
- **AI Synergy**: Debounced auto-classification during capture and intelligent activity summaries.

### Security, Performance & Release Mandates
The plugin is governed by strict, always-running mandates:
- **Design Lead**: Creative authority. Defines visual blueprints, CSS standards, and ensures "Premium Minimalism" across all interfaces.
- **Lead Engineer**: Enforces modular architecture and type safety. Must consult the **Design Lead** before implementation.
- **AI Architect**: Ensures robust configuration, model fallbacks, and prompt engineering excellence.
- **Optimization**: Minimal memory footprint via lazy-loading (dynamic imports) and efficient indexing.
- **UX Auditor**: Protects the "Premium Minimalist" aesthetic and unified design language.
- **Security Auditor**: Rigorous secret protection and sanitization of all rendered content.
- **Release Manager**: Enforces **Feature-Branch-First** protocols (no implementation on `main`), ensures documentation integrity, and requires explicit user approval for all production actions.

## Build & Deploy

```bash
npm run build
# Deployment: copy main.js, manifest.json, and styles.css to the vault plugin folder
```
