# diwa — Personal OS for Obsidian

**DIWA** is a professional-grade Personal Operating System plugin for [Obsidian](https://obsidian.md). It transforms your vault into a unified command centre for thoughts, tasks, habits, projects, finance, and AI-powered synthesis.

---

## Features

### 🧠 Quick Capture
Capture thoughts and tasks instantly with a datetime-stamped entry. New captures are appended to the top of your capture file so the most recent is always first.

### ✅ Tasks
High-performance **Tactical Task Ledger** with segmented status filtering (Todo / In Progress / Done / Blocked). Tasks are persisted as structured YAML in your vault.

### 💡 Timeline
Infinite-scroll thought feed with full-body note rendering. Spotlight carousel for pinned/recent items. Date-based navigation with reactive file watchers.

### 🗂 Synthesis
Thought-routing workspace that maps loose notes to your #contexts.

**How it works:**
1. Thoughts captured without a context appear in the **Inbox** feed (right panel)
2. Select one or more contexts from the left panel to **prime** them
3. Click **Assign** on any thought card to map it to the selected contexts
4. Switch to **Mapped** to review thoughts that have been contextualised
5. Click **Done** on individual cards or **Done All** (Mapped view) to mark them as synthesized

**Context panel features:**
- Alphabetical sorting
- Live search/filter input
- Multi-select: prime multiple contexts and assign all at once
- Hide/unhide contexts (eye icon on hover) — persisted in settings
- Delete contexts (trash icon on hover)

**Layout:** 1/3 context panel (left) + 2/3 note feed (right) on desktop/tablet. Single-pane with bottom sheet on phone.

### 📊 Finance (Dues)
Professional **Financial Ledger** with segmented obligation filtering and burn-rate tracking.

### 🧭 Weekly Review & Compass
Multi-layered reflection system: Weekly Focus + Quarterly North Star Goals.

### 🤖 AI Chat (Gemini)
Full AI chat interface powered by Gemini 2.5 Pro. Web search toggle, file grounding, session history, typing indicators, and suggestion chips.

### 🎙 Voice Notes
Dictate thoughts directly into the vault with auto-transcription via Gemini.

### 🔍 Global Search
Cross-domain Spotlight-style search across all DIWA data types (Thoughts, Tasks, Dues, Projects, Habits). Keyboard-navigable, zero-latency (in-memory indices).

### 📅 Daily Workspace
Configurable daily dashboard with checklist, tasks, dues, thoughts, and AI summary.

### 📁 Projects
Project tracking with linked thought threads and progress indicators.

---

## Architecture

```
IndexService        → In-memory O(1) indices for all data types
VaultService        → Sole authority for file I/O + YAML frontmatter
AiService           → Gemini model routing, transcription, citations
DiwaView (view.ts)  → Reactive container; renders active tab on vault change
BaseTab             → Shared utilities (app, vault, index, settings, plugin)
```

State that must survive `view.renderView()` is stored on `DiwaView` fields (e.g. `synthesisFeedFilter`, `activeSynthesisContexts`, `synthesisShowHidden`).

---

## Build & Deploy

```bash
npm run build
```

Deploy by copying `main.js`, `manifest.json`, and `styles.css` to your vault plugin folder:

```
<vault>/.obsidian/plugins/diwa/
```

---

## Settings Keys (relevant to Synthesis)

| Key | Type | Description |
|-----|------|-------------|
| `contexts` | `string[]` | All registered context tags |
| `hiddenContexts` | `string[]` | Contexts hidden from the Synthesis panel |
| `thoughtsFolder` | `string` | Vault folder where thoughts are stored |

---

## Versioning

Follows `MAJOR.MINOR.PATCH`. See [CHANGELOG.md](./CHANGELOG.md) for full history.

Current release: **v1.10.4**

