import { moment, Platform, Notice, setIcon, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';
import type { TaskEntry, ThoughtEntry } from '../types';
import { isTablet, attachInlineTriggers, parseContextString, attachMediaPasteHandler } from '../utils';
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';

export class DailyWorkspaceTab extends BaseTab {
    private parentContainer: HTMLElement;
    private currentDate: string;
    private activePanel: 'write' | 'tasks' = 'write';

    constructor(view: MinaView) {
        super(view);
        this.currentDate = this.view.dailyWorkspaceDate || moment().format('YYYY-MM-DD');
    }

    render(container: HTMLElement) {
        this.parentContainer = container;
        container.empty();

        const isDesktop = !Platform.isMobile || isTablet();
        const root = container.createEl('div', { cls: `mina-dw-root${isDesktop ? ' is-desktop' : ' is-mobile'}` });

        this.renderHeader(root);

        if (isDesktop) {
            this.renderDesktopLayout(root);
        } else {
            this.renderMobileLayout(root);
        }
    }

    // ── Header / Date Navigation ─────────────────────────────────────────
    private renderHeader(root: HTMLElement) {
        const header = root.createEl('div', { cls: 'mina-dw-header' });

        this.renderHomeIcon(header);

        const dateNav = header.createEl('div', { cls: 'mina-dw-date-nav' });

        const prevBtn = dateNav.createEl('button', { cls: 'mina-dw-date-arrow', attr: { 'aria-label': 'Previous day' } });
        setIcon(prevBtn, 'chevron-left');
        prevBtn.addEventListener('click', () => this.navigateDate(-1));

        const dateMoment = moment(this.currentDate);
        const dateLabel = dateNav.createEl('span', {
            text: dateMoment.format('dddd · MMMM D').toUpperCase(),
            cls: 'mina-dw-date-label'
        });
        dateLabel.addEventListener('click', () => this.jumpToToday());

        const nextBtn = dateNav.createEl('button', { cls: 'mina-dw-date-arrow', attr: { 'aria-label': 'Next day' } });
        setIcon(nextBtn, 'chevron-right');
        nextBtn.addEventListener('click', () => this.navigateDate(1));

        const isToday = dateMoment.isSame(moment(), 'day');
        if (!isToday) {
            const todayBtn = header.createEl('button', { text: 'TODAY', cls: 'mina-dw-today-btn' });
            todayBtn.addEventListener('click', () => this.jumpToToday());
        }

        // Keyboard shortcuts hint (desktop only)
        if (!Platform.isMobile || isTablet()) {
            const actions = header.createEl('div', { cls: 'mina-dw-header-actions' });
            const kbd = actions.createEl('kbd', { text: '⌘N', cls: 'mina-dw-kbd' });
            kbd.setAttribute('title', 'Focus capture');
        }
    }

    // ── Desktop: Split Layout ────────────────────────────────────────────
    private renderDesktopLayout(root: HTMLElement) {
        const body = root.createEl('div', { cls: 'mina-dw-body' });

        const writingPane = body.createEl('div', { cls: 'mina-dw-writing' });
        this.renderCaptureBar(writingPane);
        this.renderEntries(writingPane);

        const taskPane = body.createEl('div', { cls: 'mina-dw-tasks' });
        this.renderTaskPanel(taskPane);

        // Keyboard handler
        this.setupKeyboardShortcuts(root, writingPane);
    }

    // ── Mobile: Toggle Pane + Peek Bar ───────────────────────────────────
    private renderMobileLayout(root: HTMLElement) {
        // Segmented toggle
        const toggle = root.createEl('div', { cls: 'mina-dw-toggle' });
        const writeBtn = toggle.createEl('button', { text: '✦ WRITE', cls: `mina-dw-toggle-btn${this.activePanel === 'write' ? ' is-active' : ''}` });
        const tasksBtn = toggle.createEl('button', { text: '☐ TASKS', cls: `mina-dw-toggle-btn${this.activePanel === 'tasks' ? ' is-active' : ''}` });

        const body = root.createEl('div', { cls: 'mina-dw-body' });

        const writePanel = body.createEl('div', { cls: 'mina-dw-write-panel' });
        const taskPanel = body.createEl('div', { cls: 'mina-dw-task-panel' });

        if (this.activePanel === 'write') {
            taskPanel.style.display = 'none';
            this.renderCaptureBar(writePanel);
            this.renderEntries(writePanel);
        } else {
            writePanel.style.display = 'none';
            this.renderTaskPanel(taskPanel);
        }

        writeBtn.addEventListener('click', () => {
            this.activePanel = 'write';
            this.render(this.parentContainer);
        });
        tasksBtn.addEventListener('click', () => {
            this.activePanel = 'tasks';
            this.render(this.parentContainer);
        });

        // Peek bar (always visible on mobile when in write mode)
        if (this.activePanel === 'write') {
            this.renderTaskPeekBar(root);
        }
    }

    // ── Capture Bar ──────────────────────────────────────────────────────
    private renderCaptureBar(parent: HTMLElement) {
        const capture = parent.createEl('div', { cls: 'mina-dw-capture' });
        let captureMode: 'thought' | 'task' = 'thought';
        let captureContexts: string[] = [];
        let captureDueDate: string | null = null;

        const textarea = capture.createEl('textarea', {
            cls: 'mina-dw-capture-textarea',
            attr: { placeholder: 'What\'s on your mind…', rows: '2' }
        }) as HTMLTextAreaElement;

        const syncHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.overflowY = 'hidden';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };
        textarea.addEventListener('input', () => {
            syncHeight();
            refreshSave();
        });

        // Media paste / drag-drop — saves to vault and inserts ![[filename]] at cursor
        attachMediaPasteHandler(this.app, textarea, () => this.plugin.settings.attachmentsFolder);

        const actions = capture.createEl('div', { cls: 'mina-dw-capture-actions' });

        // Mode toggle
        const toggleBar = actions.createEl('div', { cls: 'mina-seg-bar mina-dw-mode-toggle' });
        const thoughtBtn = toggleBar.createEl('button', { text: '✦ THOUGHT', cls: 'mina-seg-btn is-active' });
        const taskBtn = toggleBar.createEl('button', { text: '✓ TASK', cls: 'mina-seg-btn' });

        const switchMode = (mode: 'thought' | 'task') => {
            captureMode = mode;
            textarea.placeholder = mode === 'task' ? 'Execute intent…' : 'What\'s on your mind…';
            thoughtBtn.toggleClass('is-active', mode === 'thought');
            taskBtn.toggleClass('is-active', mode === 'task');
        };
        thoughtBtn.addEventListener('click', () => switchMode('thought'));
        taskBtn.addEventListener('click', () => switchMode('task'));

        // Action buttons
        const btnRow = actions.createEl('div', { cls: 'mina-dw-capture-btns' });
        const cancelBtn = btnRow.createEl('button', { text: 'CANCEL', cls: 'mina-dw-capture-cancel' });
        const saveBtn = btnRow.createEl('button', { text: 'CAPTURE', cls: 'mina-dw-capture-save is-disabled' }) as HTMLButtonElement;
        saveBtn.disabled = true;

        const refreshSave = () => {
            const empty = !textarea.value.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
            actions.toggleClass('is-visible', !empty);
        };

        cancelBtn.addEventListener('click', () => {
            textarea.value = '';
            captureContexts = [];
            captureDueDate = null;
            switchMode('thought');
            textarea.style.height = '';
            refreshSave();
        });

        // Inline triggers
        attachInlineTriggers(this.plugin.app, textarea, (d: string) => {
            captureDueDate = d;
            switchMode('task');
        }, (tag: string) => {
            if (!captureContexts.includes(tag)) captureContexts.push(tag);
        }, () => this.plugin.settings.contexts ?? []);

        // Save handler
        const handleSave = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            saveBtn.toggleClass('is-disabled', true);
            saveBtn.disabled = true;

            try {
                if (captureMode === 'task') {
                    const newFile = await this.vault.createTaskFile(raw, captureContexts, captureDueDate || '');
                    await this.index.indexTaskFile(newFile);
                    new Notice('✓ Task added');
                } else {
                    const newFile = await this.vault.createThoughtFile(raw, captureContexts);
                    await this.index.indexThoughtFile(newFile);
                    new Notice('✦ Thought captured');
                }
                textarea.value = '';
                captureContexts = [];
                captureDueDate = null;
                textarea.style.height = '';
                switchMode('thought');
                refreshSave();
                // Re-render entries — index already updated above, no setTimeout needed
                this.render(this.parentContainer);
            } catch (e) {
                new Notice('Failed to save — check console');
                console.error('[MINA DW] Save error:', e);
                saveBtn.toggleClass('is-disabled', false);
                saveBtn.disabled = false;
            }
        };

        saveBtn.addEventListener('click', handleSave);
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && textarea.value.trim()) {
                e.preventDefault();
                handleSave();
            }
        });
    }

    // ── Entry List (Today's thoughts, reverse-chronological) ─────────────
    private renderEntries(parent: HTMLElement) {
        const entries = parent.createEl('div', { cls: 'mina-dw-entries' });
        const dayStr = this.currentDate;

        // Left writing surface shows only thoughts — tasks live in the right task panel
        const todayThoughts: ThoughtEntry[] = Array.from(this.index.thoughtIndex.values())
            .filter(t => t.day === dayStr)
            .sort((a, b) => b.created.localeCompare(a.created));

        if (todayThoughts.length === 0) {
            this.renderEmptyState(entries, dayStr === moment().format('YYYY-MM-DD')
                ? 'Capture your first thought for today…'
                : `No thoughts for ${moment(dayStr).format('MMMM D, YYYY')}`);
            return;
        }

        for (const entry of todayThoughts) {
            const entryEl = entries.createEl('div', { cls: 'mina-dw-entry' });

            // Timestamp
            const timeStr = moment(entry.created, 'YYYY-MM-DD HH:mm:ss').format('h:mm A');
            entryEl.createEl('div', {
                text: `${timeStr} ✦`,
                cls: 'mina-dw-entry-time'
            });

            // Body — renders text and ![[image]] embeds
            const bodyEl = entryEl.createEl('div', { cls: 'mina-dw-entry-body' });
            this.renderEntryBody(bodyEl, entry.body || entry.title);

            // Context tags
            if (entry.context && entry.context.length > 0) {
                const tagRow = entryEl.createEl('div', { cls: 'mina-dw-entry-tags' });
                entry.context.forEach(ctx => {
                    tagRow.createEl('span', { text: `#${ctx}`, cls: 'mina-dw-entry-tag' });
                });
            }

            // Hover actions (desktop)
            if (!Platform.isMobile || isTablet()) {
                const actionsEl = entryEl.createEl('div', { cls: 'mina-dw-entry-actions' });

                // Edit
                const editBtn = actionsEl.createEl('button', { cls: 'mina-dw-entry-action-btn', attr: { 'aria-label': 'Edit' } });
                setIcon(editBtn, 'lucide-pencil');
                editBtn.addEventListener('click', () => {
                    const ctxStr = entry.context?.map((c: string) => `#${c}`).join(' ') ?? '';
                    new EditEntryModal(
                        this.app, this.plugin,
                        entry.body ?? entry.title ?? '',
                        ctxStr, null, false,
                        async (newText, newCtxStr) => {
                            const ctxArr = newCtxStr ? parseContextString(newCtxStr) : [];
                            await this.vault.editThought(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr);
                            setTimeout(() => this.render(this.parentContainer), 500);
                        }
                    ).open();
                });

                // Delete
                const delBtn = actionsEl.createEl('button', { cls: 'mina-dw-entry-action-btn', attr: { 'aria-label': 'Delete' } });
                setIcon(delBtn, 'lucide-trash-2');
                delBtn.style.color = 'var(--text-error)';
                delBtn.addEventListener('click', () => {
                    new ConfirmModal(
                        this.app,
                        'Move this thought to trash?',
                        async () => {
                            await this.vault.deleteFile(entry.filePath, 'thoughts');
                            setTimeout(() => this.render(this.parentContainer), 500);
                        }
                    ).open();
                });
            }
        }
    }

    // ── Entry Body Renderer (text + ![[image]] embeds) ───────────────────
    private renderEntryBody(container: HTMLElement, body: string) {
        const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
        // Split on ![[...]] tokens, preserving the separators
        const parts = body.split(/(!\[\[[^\]]+\]\])/g);
        parts.forEach(part => {
            const embedMatch = part.match(/^!\[\[(.+?)\]\]$/);
            if (embedMatch) {
                const linkPath = embedMatch[1];
                const ext = linkPath.split('.').pop()?.toLowerCase() ?? '';
                if (IMAGE_EXTS.has(ext)) {
                    // Resolve via metadataCache so relative/absolute paths both work
                    const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, '');
                    if (file) {
                        const img = container.createEl('img', { cls: 'mina-dw-entry-img' });
                        img.src = this.app.vault.getResourcePath(file);
                        img.alt = file.name;
                    } else {
                        // File not indexed yet — show placeholder
                        container.createEl('span', { text: `[image: ${linkPath}]`, cls: 'mina-dw-entry-img-placeholder' });
                    }
                } else {
                    // Non-image embed — render as styled inline link text
                    container.createEl('span', { text: `[[${linkPath}]]`, cls: 'mina-dw-entry-wikilink' });
                }
            } else if (part) {
                container.createEl('span', { text: part });
            }
        });
    }

    // ── Task Panel (Sidebar / Full Panel) ────────────────────────────────
    private renderTaskPanel(parent: HTMLElement) {
        const header = parent.createEl('div', { cls: 'mina-dw-tasks-header' });
        header.createEl('span', { text: 'TASKS', cls: 'mina-dw-tasks-title' });

        const today = moment().format('YYYY-MM-DD');
        const allTasks = Array.from(this.index.taskIndex.values());

        // Overdue
        const overdue = allTasks.filter(t => t.status === 'open' && t.due && moment(t.due).isBefore(today, 'day'))
            .sort((a, b) => a.due.localeCompare(b.due));

        // Today's tasks
        const todayTasks = allTasks.filter(t => t.status === 'open' && t.due === today)
            .sort((a, b) => b.created.localeCompare(a.created));

        // Open (no due or future)
        const openTasks = allTasks.filter(t => t.status === 'open' && (!t.due || moment(t.due).isAfter(today, 'day')))
            .sort((a, b) => b.created.localeCompare(a.created))
            .slice(0, 10);

        // Checklist items
        const checklist = this.index.thoughtChecklistIndex.filter(c => !c.line.includes('[x]'));

        if (overdue.length > 0) this.renderTaskSection(parent, 'OVERDUE', overdue, true);
        if (todayTasks.length > 0) this.renderTaskSection(parent, 'TODAY', todayTasks);
        if (openTasks.length > 0) this.renderTaskSection(parent, 'OPEN', openTasks);

        if (checklist.length > 0) {
            const section = parent.createEl('div', { cls: 'mina-dw-task-section' });
            section.createEl('div', { text: 'CHECKLIST', cls: 'mina-dw-task-section-label' });
            checklist.slice(0, 10).forEach(item => {
                const row = section.createEl('div', { cls: 'mina-dw-task-item' });
                const cb = row.createEl('div', { cls: 'mina-dw-task-item-cb' });
                cb.addEventListener('click', async () => {
                    await this.toggleChecklistItem(item);
                });
                row.createEl('span', { text: item.text, cls: 'mina-dw-task-item-text' });
            });
        }

        // Quick add
        const quickAdd = parent.createEl('div', { cls: 'mina-dw-quick-add' });
        const addIcon = quickAdd.createEl('span', { text: '+', cls: 'mina-dw-quick-add-icon' });
        const addInput = quickAdd.createEl('input', {
            cls: 'mina-dw-quick-add-input',
            attr: { placeholder: 'Quick add task…', type: 'text' }
        }) as HTMLInputElement;
        addInput.addEventListener('keydown', async (e: KeyboardEvent) => {
            if (e.key === 'Enter' && addInput.value.trim()) {
                const text = addInput.value.trim();
                addInput.value = '';
                addInput.disabled = true;
                try {
                    const newFile = await this.vault.createTaskFile(text, []);
                    // Directly inject into taskIndex — metadataCache is not ready immediately
                    // after file creation, so indexTaskFile() would silently bail.
                    const now = moment().format('YYYY-MM-DD HH:mm:ss');
                    this.index.taskIndex.set(newFile.path, {
                        filePath: newFile.path,
                        title: text.split('\n')[0].substring(0, 120),
                        body: text,
                        status: 'open',
                        due: '',
                        created: now,
                        modified: now,
                        lastUpdate: newFile.stat.mtime,
                        day: moment().format('YYYY-MM-DD'),
                        context: [],
                        children: [],
                    });
                    this.index.rebuildCalculatedState();
                    new Notice('✓ Task added');
                    this.render(this.parentContainer);
                } finally {
                    addInput.disabled = false;
                }
            }
        });

        if (overdue.length === 0 && todayTasks.length === 0 && openTasks.length === 0 && checklist.length === 0) {
            this.renderEmptyState(parent, 'All clear — no open tasks');
        }
    }

    private renderTaskSection(parent: HTMLElement, label: string, tasks: TaskEntry[], isOverdue = false) {
        const section = parent.createEl('div', { cls: 'mina-dw-task-section' });
        section.createEl('div', {
            text: `${label} (${tasks.length})`,
            cls: `mina-dw-task-section-label${isOverdue ? ' is-overdue' : ''}`
        });

        tasks.forEach(task => {
            const row = section.createEl('div', { cls: `mina-dw-task-item${task.status === 'done' ? ' is-done' : ''}` });

            const cb = row.createEl('div', { cls: 'mina-dw-task-item-cb' });
            cb.addEventListener('click', async () => {
                if (this.view._taskTogglePending > 0) return;
                this.view._taskTogglePending++;
                try {
                    const isDone = task.status !== 'done';
                    await this.vault.toggleTask(task.filePath, isDone);
                    // Directly mutate index — metadataCache update is async, re-render immediately
                    const entry = this.index.taskIndex.get(task.filePath);
                    if (entry) {
                        entry.status = isDone ? 'done' : 'open';
                        entry.modified = moment().format('YYYY-MM-DD HH:mm:ss');
                    }
                    this.index.rebuildCalculatedState();
                    this.render(this.parentContainer);
                } finally {
                    this.view._taskTogglePending--;
                }
            });

            const textEl = row.createEl('span', { text: task.title, cls: 'mina-dw-task-item-text' });

            if (isOverdue && task.due) {
                const daysOverdue = moment().diff(moment(task.due), 'days');
                row.createEl('span', { text: `⚠ ${daysOverdue}d`, cls: 'mina-dw-task-overdue-badge' });
            }
        });
    }

    // ── Mobile Task Peek Bar ─────────────────────────────────────────────
    private renderTaskPeekBar(root: HTMLElement) {
        const allTasks = Array.from(this.index.taskIndex.values());
        const openTasks = allTasks.filter(t => t.status === 'open');
        if (openTasks.length === 0) return;

        const nextTask = openTasks.sort((a, b) => {
            if (a.due && b.due) return a.due.localeCompare(b.due);
            if (a.due) return -1;
            if (b.due) return 1;
            return b.created.localeCompare(a.created);
        })[0];

        const peek = root.createEl('div', { cls: 'mina-dw-task-peek' });

        const cb = peek.createEl('div', { cls: 'mina-dw-peek-cb' });
        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (this.view._taskTogglePending > 0) return;
            this.view._taskTogglePending++;
            try {
                await this.vault.toggleTask(nextTask.filePath, true);
                const entry = this.index.taskIndex.get(nextTask.filePath);
                if (entry) {
                    entry.status = 'done';
                    entry.modified = moment().format('YYYY-MM-DD HH:mm:ss');
                }
                this.index.rebuildCalculatedState();
                new Notice('✓ Done');
                this.render(this.parentContainer);
            } finally {
                this.view._taskTogglePending--;
            }
        });

        peek.createEl('span', { text: nextTask.title, cls: 'mina-dw-peek-text' });
        peek.createEl('span', { text: `${openTasks.filter(t => t.status === 'done').length}/${openTasks.length}`, cls: 'mina-dw-peek-badge' });

        // Tap peek bar → switch to tasks
        peek.addEventListener('click', () => {
            this.activePanel = 'tasks';
            this.render(this.parentContainer);
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    private navigateDate(delta: number) {
        this.currentDate = moment(this.currentDate).add(delta, 'days').format('YYYY-MM-DD');
        this.view.dailyWorkspaceDate = this.currentDate;
        this.render(this.parentContainer);
    }

    private jumpToToday() {
        this.currentDate = moment().format('YYYY-MM-DD');
        this.view.dailyWorkspaceDate = this.currentDate;
        this.render(this.parentContainer);
    }

    private async toggleChecklistItem(item: { filePath: string; lineIndex: number; line: string }) {
        if (this.view._checklistTogglePending > 0) return;
        this.view._checklistTogglePending++;
        try {
            const file = this.app.vault.getAbstractFileByPath(item.filePath);
            if (!file || !(file instanceof TFile)) return;
            const content = await this.app.vault.read(file as any);
            const lines = content.split('\n');
            if (lines[item.lineIndex]) {
                lines[item.lineIndex] = lines[item.lineIndex].replace('- [ ]', '- [x]');
                await this.app.vault.modify(file as any, lines.join('\n'));
                new Notice('✓ Done');
                setTimeout(() => this.render(this.parentContainer), 200);
            }
        } finally {
            this.view._checklistTogglePending--;
        }
    }

    private setupKeyboardShortcuts(root: HTMLElement, writingPane: HTMLElement) {
        const handler = (e: KeyboardEvent) => {
            const mod = Platform.isMacOS ? e.metaKey : e.ctrlKey;

            if (mod && e.key === 'n') {
                e.preventDefault();
                const textarea = writingPane.querySelector('.mina-dw-capture-textarea') as HTMLTextAreaElement;
                textarea?.focus();
            }
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                this.navigateDate(-1);
            }
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                this.navigateDate(1);
            }
            if (e.altKey && e.key === 't') {
                e.preventDefault();
                this.jumpToToday();
            }
        };

        root.addEventListener('keydown', handler);
        root.setAttribute('tabindex', '-1');
    }
}
