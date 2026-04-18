You are an obsidian.md plugin developer.

Use obsidian cli to make an efficient plugin and plugin development.

My current vault is located here: "/Users/vanguardph/Documents/Obsidian/K0000"

I want you to develop a plugin for me to quickly capture my thoughts and append it to a file.

This plugin will capture: 1) thoughts, 2) tasks.

When capturing thoughts and tasks,  you must datetimestamp it so it will be easier to sort later.

All new captures need to be appended in the beginning of the file.

## Current Implementation: MINA V2 Personal OS

MINA V2 has evolved from a simple capture tool into a holistic **Personal Operating System (Life-OS)** built on four foundational pillars: **Organization**, **Process**, **Reflection**, and **Synergy**.

### 1. The Pillar of Process: Habit Lab
- **Minimalist Tracking**: A horizontal row of "Stitch Dots" on the Daily Focus dashboard.
- **Visual Feedback**: Habits use a subtle "glow" effect when completed, following the Timeline Mode aesthetic.
- **Data Integrity**: Completion status is stored in daily Markdown files with YAML frontmatter, ensuring 100% interoperability with other plugins.
- **Configuration**: A dedicated **Habit Config** modal allows for rapid definition of habits and custom icons.

### 2. The Pillar of Organization: Projects Mode
- **Objective-Based Review**: Group all tasks and thoughts by project name via the `project:` YAML key.
- **Project Dashboard**: A grid-based view of all active projects in the vault.
- **Project Focus**: Dedicated dashboards for each project, featuring pending tasks, project-specific notes, and instant capture buttons that pre-fill project metadata.

### 3. The Pillar of Reflection: Weekly Review
- **Inbox Clearing**: Automatically scans for tasks and thoughts that lack a due date or project, facilitating rapid organization.
- **The Rearview**: Provides a 7-day activity summary (Notes created, Tasks completed).
- **The Horizon**: A dedicated interface to set **3 Weekly Focus** goals.
- **Dashboard Integration**: Current weekly goals are displayed at the top of the Daily Focus mode as constant reminders.

### 4. The Pillar of Synergy: Voice Note Synergy
- **Advanced Routing**: Transcribed voice notes can be instantly routed as a **Thought**, a **Task**, or linked to a **Project**.
- **Context Preservation**: Routing a voice note to a project automatically updates the frontmatter and associates it with the project's dashboard.

### Core UI & Aesthetics
- **Dedicated Modes (High Focus):** Daily (Sun), Projects (Folder), Weekly Review (Calendar-Check), Timeline (Clock), Journal (Pen), Task (Check-square), Finance (Dollar), AI (Robot), Voice (Microphone), Focus (Target), Memento Mori (Hourglass), and Settings (Gear).
- **Config Mode Toggle:** Discrete "Config" buttons allow for toggling navigation pills and metadata bars to maintain a clean slate.
- **Modern Input Modal:** Clean Slate writing experience with natural language dates (`@today`), smart suggestions (`[[`, `#`), and attachment support.
- **Minimalist Mobile UI:** simplified display title "M.I.N.A." for a distraction-free mobile experience.
- **Borderless & Drag-Capable:** Truly borderless windows with custom drag handles for desktop power users.

### Security, Performance & Release Mandates
The plugin is governed by strict, always-running mandates:
- **Lead Engineer**: Enforces modular architecture, type safety, and technical design documents for all features.
- **Optimization**: Zero-bloat policy, targeted re-renders, and high-efficiency vault indexing.
- **UX Auditor**: Protects the modern, minimalist aesthetic and unified design theme.
- **Security Auditor**: Continuous vulnerability scanning and rigorous secret protection (no hardcoded keys).
- **Release Manager**: Strict documentation requirements and explicit user approval for all commits, merges, and pushes.

## Build & Deploy

```bash
npm run build
# Deployment: copy main.js, manifest.json, and styles.css to the vault plugin folder
```
