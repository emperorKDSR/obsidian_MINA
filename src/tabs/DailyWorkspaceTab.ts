import { moment, Platform, Notice, setIcon, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';
import type { TaskEntry, ThoughtEntry } from '../types';
import { isTablet, attachInlineTriggers, parseContextString } from '../utils';
import { EditEntryModal } from '../modals/EditEntryModal';

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
                    await this.vault.createTaskFile(raw, captureContexts, captureDueDate || '');
                    new Notice('✓ Task added');
                } else {
                    await this.vault.createThoughtFile(raw, captureContexts);
                    new Notice('✦ Thought captured');
                }
                textarea.value = '';
                captureContexts = [];
                captureDueDate = null;
                textarea.style.height = '';
                switchMode('thought');
                refreshSave();
                // Re-render entries
                setTimeout(() => this.render(this.parentContainer), 200);
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

        // Get today's thoughts from IndexService
        const todayThoughts: ThoughtEntry[] = Array.from(this.index.thoughtIndex.values())
            .filter(t => t.day === dayStr)
            .sort((a, b) => b.created.localeCompare(a.created));

        // Get today's tasks from IndexService
        const todayTasks: TaskEntry[] = Array.from(this.index.taskIndex.values())
            .filter(t => t.day === dayStr)
            .sort((a, b) => b.created.localeCompare(a.created));

        // Merge and sort by created timestamp
        const allEntries: Array<{ type: 'thought' | 'task'; entry: ThoughtEntry | TaskEntry }> = [
            ...todayThoughts.map(t => ({ type: 'thought' as const, entry: t })),
            ...todayTasks.map(t => ({ type: 'task' as const, entry: t }))
        ].sort((a, b) => b.entry.created.localeCompare(a.entry.created));

        if (allEntries.length === 0) {
            this.renderEmptyState(entries, dayStr === moment().format('YYYY-MM-DD')
                ? 'Start capturing your thoughts and tasks for today…'
                : `No entries for ${moment(dayStr).format('MMMM D, YYYY')}`);
            return;
        }

        for (const item of allEntries) {
            const entryEl = entries.createEl('div', { cls: 'mina-dw-entry' });

            // Timestamp
            const timeStr = moment(item.entry.created, 'YYYY-MM-DD HH:mm:ss').format('h:mm A');
            const typeBadge = item.type === 'task' ? '✓' : '✦';
            entryEl.createEl('div', {
                text: `${timeStr} ${typeBadge}`,
                cls: 'mina-dw-entry-time'
            });

            // Body
            const bodyEl = entryEl.createEl('div', { cls: 'mina-dw-entry-body' });
            bodyEl.setText(item.entry.body || item.entry.title);

            // Context tags
            if (item.entry.context && item.entry.context.length > 0) {
                const tagRow = entryEl.createEl('div', { cls: 'mina-dw-entry-tags' });
                item.entry.context.forEach(ctx => {
                    tagRow.createEl('span', { text: `#${ctx}`, cls: 'mina-dw-entry-tag' });
                });
            }

            // Hover actions (desktop) + mobile long-press
            if (!Platform.isMobile || isTablet()) {
                const actionsEl = entryEl.createEl('div', { cls: 'mina-dw-entry-actions' });
                const editBtn = actionsEl.createEl('button', { cls: 'mina-dw-entry-action-btn', attr: { 'aria-label': 'Edit' } });
                setIcon(editBtn, 'lucide-pencil');
                editBtn.addEventListener('click', () => {
                    const entry = item.entry;
                    const isTask = item.type === 'task';
                    const ctxStr = entry.context?.map((c: string) => `#${c}`).join(' ') ?? '';
                    const due = isTask ? ((entry as any).due || null) : null;
                    new EditEntryModal(
                        this.app, this.plugin,
                        entry.body ?? (entry as any).title ?? '',
                        ctxStr, due, isTask,
                        async (newText, newCtxStr, newDue) => {
                            const ctxArr = newCtxStr ? parseContextString(newCtxStr) : [];
                            if (isTask) {
                                await this.vault.editTask(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                            } else {
                                await this.vault.editThought(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr);
                            }
                            setTimeout(() => this.render(this.parentContainer), 200);
                        }
                    ).open();
                });
            }
        }
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
                await this.vault.createTaskFile(addInput.value.trim(), [], '');
                new Notice('✓ Task added');
                addInput.value = '';
                setTimeout(() => this.render(this.parentContainer), 200);
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
                    setTimeout(() => this.render(this.parentContainer), 200);
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
                new Notice('✓ Done');
                setTimeout(() => this.render(this.parentContainer), 200);
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
