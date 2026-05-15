import { ItemView, WorkspaceLeaf, Platform, moment, setIcon, Notice, ViewStateResult } from 'obsidian';
import type DiwaPlugin from '../main';
import {
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, COMPASS_ICON_ID,
    FOCUS_ICON_ID, MEMENTO_ICON_ID,
} from '../constants';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import type { ThoughtEntry, TaskEntry } from '../types';

export class DesktopHubView extends ItemView {
    plugin: DiwaPlugin;
    isFocusMode: boolean = false;

    // Suppress re-renders while user is mid-capture (thought or task)
    _capturePending: number = 0;
    _taskPending: number = 0;

    // Task panel filter: 'upcoming' = next 2 days + undated; 'all' = everything
    _taskFilter: 'upcoming' | 'all' = 'upcoming';

    // Guard against DOM updates after view is closed
    private _closed: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_DESKTOP_HUB; }
    getDisplayText(): string { return 'DIWA Desktop Hub'; }
    getIcon(): string { return 'layout-dashboard'; }

    getState(): Record<string, unknown> {
        return { isFocusMode: this.isFocusMode };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.isFocusMode !== undefined) this.isFocusMode = !!state.isFocusMode;
        await super.setState(state, result);
        this.renderView();
    }

    async onOpen() {
        this._closed = false;
        // Hide Obsidian's leaf header (same pattern as DiwaView src/view.ts:128-132)
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this.renderView();
    }

    async onClose() {
        this._closed = true;
    }

    renderView() {
        if (this._capturePending > 0 || this._taskPending > 0) return;

        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('diwa-dh-root');

        if (!Platform.isDesktop) {
            root.createEl('div', {
                text: '⊕ DIWA Desktop Hub requires a desktop environment.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;' }
            });
            return;
        }

        const wrap = root.createEl('div', { cls: 'diwa-dh-wrap' });
        if (this.isFocusMode) wrap.addClass('is-focus-mode');

        this.renderTopBar(wrap);

        const cols = wrap.createEl('div', { cls: 'diwa-dh-cols' });
        this.renderSidebar(cols);
        this.renderCenter(cols);
        this.renderRight(cols);
    }

    // ── Top Bar ───────────────────────────────────────────────────────────────
    private renderTopBar(parent: HTMLElement) {
        const bar = parent.createEl('div', { cls: 'diwa-dh-topbar' });

        const left = bar.createEl('div', { cls: 'diwa-dh-topbar-left' });
        left.createEl('span', { text: 'DIWA', cls: 'diwa-dh-topbar-logo' });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        left.createEl('span', { text: `${greeting}, Emperor.`, cls: 'diwa-dh-topbar-greeting' });

        const center = bar.createEl('div', { cls: 'diwa-dh-topbar-center' });
        center.createEl('span', {
            text: moment().format('dddd · MMMM D, YYYY').toUpperCase(),
            cls: 'diwa-dh-topbar-date'
        });
        const northStar = this.plugin.settings.northStarGoals?.[0];
        if (northStar) {
            center.createEl('span', { text: `★ ${northStar}`, cls: 'diwa-dh-topbar-northstar' });
        }

        const right = bar.createEl('div', { cls: 'diwa-dh-topbar-right' });
        const focusBtn = right.createEl('button', {
            cls: `diwa-dh-focus-btn${this.isFocusMode ? ' is-active' : ''}`,
            attr: { title: this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode' }
        });
        const focusIcon = focusBtn.createDiv({ cls: 'diwa-dh-focus-btn-icon' });
        setIcon(focusIcon, 'lucide-target');
        focusBtn.createSpan({ text: this.isFocusMode ? 'EXIT FOCUS' : 'FOCUS MODE' });
        focusBtn.addEventListener('click', () => {
            this.isFocusMode = !this.isFocusMode;
            this.renderView();
        });
    }

    // ── LEFT Sidebar ──────────────────────────────────────────────────────────
    private renderSidebar(parent: HTMLElement) {
        const sidebar = parent.createEl('nav', { cls: 'diwa-dh-sidebar', attr: { 'aria-label': 'DIWA Navigation' } });

        const groups: { title: string; items: { label: string; icon: string; tab: string }[] }[] = [
            {
                title: 'ACTION',
                items: [
                    { label: 'Search', icon: 'lucide-search', tab: 'search' },
                    { label: 'Focus', icon: FOCUS_ICON_ID, tab: 'focus' },
                    { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' },
                    { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' },
                    { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' },
                ],
            },
            {
                title: 'MANAGE',
                items: [
                    { label: 'Tasks', icon: 'lucide-check-square-2', tab: 'review-tasks' },
                    { label: 'Finance', icon: PF_ICON_ID, tab: 'dues' },
                    { label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' },
                    { label: 'Calendar', icon: 'lucide-calendar', tab: 'calendar' },
                    { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' },
                    { label: 'Compass', icon: COMPASS_ICON_ID, tab: 'compass' },
                ],
            },
            {
                title: 'FEATURES',
                items: [
                    { label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'diwa-ai' },
                    { label: 'Voice', icon: 'lucide-mic', tab: 'voice-note' },
                    { label: 'Habits', icon: 'lucide-flame', tab: 'habits' },
                    { label: 'Memento', icon: MEMENTO_ICON_ID, tab: 'memento-mori' },
                ],
            },
            {
                title: 'SYSTEM',
                items: [
                    { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' },
                    { label: 'Manual', icon: 'lucide-book-open', tab: 'manual' },
                ],
            },
        ];

        for (const group of groups) {
            const groupEl = sidebar.createEl('div', { cls: 'diwa-dh-nav-group' });
            groupEl.createEl('span', { text: group.title, cls: 'diwa-dh-nav-group-label' });
            for (const item of group.items) {
                const btn = groupEl.createEl('button', {
                    cls: 'diwa-dh-nav-item',
                    attr: { title: item.label, 'aria-label': item.label }
                });
                const iconWrap = btn.createEl('span', { cls: 'diwa-dh-nav-icon' });
                setIcon(iconWrap, item.icon);
                btn.createEl('span', { text: item.label, cls: 'diwa-dh-nav-label' });
                btn.addEventListener('click', () => {
                    if (item.tab === 'search') { this.plugin.activateSearchView(); }
                    else { this.plugin.activateView(item.tab, false); }
                });
            }
        }
    }

    // ── CENTER Column ─────────────────────────────────────────────────────────
    private renderCenter(parent: HTMLElement) {
        const center = parent.createEl('div', { cls: 'diwa-dh-center' });
        this.renderCapture(center);
        const inner = center.createEl('div', { cls: 'diwa-dh-center-inner' });
        this.renderTodayFeed(inner);
    }

    private renderCapture(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'diwa-dh-capture-section' });
        section.addEventListener('click', (e) => {
            if (e.target !== textarea) textarea.focus();
        });

        const chipRow = section.createEl('div', { cls: 'diwa-dh-chip-row' });
        let contexts: string[] = [];

        const addChip = (tag: string) => {
            if (contexts.includes(tag)) return;
            contexts.push(tag);
            const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${tag}` });
            chip.addEventListener('click', () => {
                contexts = contexts.filter(c => c !== tag);
                chip.remove();
            });
        };

        const textarea = section.createEl('textarea', {
            cls: 'diwa-dh-capture-textarea',
            attr: {
                placeholder: "What's on your mind…",
                rows: '2'
            }
        }) as HTMLTextAreaElement;

        const syncHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.overflowY = 'hidden';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };

        textarea.addEventListener('focus', () => {
            this._capturePending = 1;
            syncHeight();
        });
        textarea.addEventListener('input', () => {
            syncHeight();
            this._capturePending = textarea.value.trim().length > 0 ? 1 : 0;
        });
        textarea.addEventListener('keyup', () => syncHeight());

        attachInlineTriggers(
            this.app,
            textarea,
            () => {},
            (tag) => addChip(tag),
            () => (this.plugin.settings.contexts ?? []).filter(c => !contexts.includes(c)),
            this.plugin.settings.peopleFolder,
        );
        attachMediaPasteHandler(
            this.app,
            textarea,
            () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA V2 Attachments'
        );

        const saveThought = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            const ctxSnapshot = [...contexts];
            this._capturePending = 0;
            textarea.value = '';
            textarea.style.height = '';
            textarea.style.overflowY = '';
            contexts = [];
            chipRow.empty();
            try {
                await this.plugin.vault.createThoughtFile(raw, ctxSnapshot);
                new Notice('✦ Thought saved', 1200);
            } catch {
                new Notice('Error saving thought — please try again', 2500);
            }
        };

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveThought(); }
            if (e.key === 'Escape') {
                textarea.value = '';
                contexts = [];
                chipRow.empty();
                this._capturePending = 0;
                textarea.blur();
            }
        });

    }

    private renderTodayFeed(parent: HTMLElement) {
        const feed = parent.createEl('div', { cls: 'diwa-dh-feed' });
        feed.createEl('div', { text: 'TODAY', cls: 'diwa-dh-feed-label' });

        const today = moment().format('YYYY-MM-DD');
        const todayThoughts = Array.from(this.plugin.index.thoughtIndex.values())
            .filter(t => t.day === today)
            .sort((a, b) => (b.created || '').localeCompare(a.created || ''));

        if (todayThoughts.length === 0) {
            feed.createEl('div', {
                text: 'Nothing captured yet — your mind is clear.',
                cls: 'diwa-dh-feed-empty'
            });
            return;
        }

        const list = feed.createEl('div', { cls: 'diwa-dh-feed-list' });
        for (const t of todayThoughts) {
            const item = list.createEl('div', { cls: 'diwa-dh-feed-item' });
            item.createEl('span', { cls: 'diwa-dh-feed-dot' });
            const content = item.createEl('div', { cls: 'diwa-dh-feed-content' });
            const ts = t.created ? moment(t.created, 'YYYY-MM-DD HH:mm:ss').format('HH:mm') : '';
            content.createEl('span', { text: ts, cls: 'diwa-dh-feed-time' });
            content.createEl('p', { text: t.body || t.title || '', cls: 'diwa-dh-feed-text' });
            if (t.context && t.context.length > 0) {
                const ctxWrap = content.createEl('div', { cls: 'diwa-dh-feed-ctx' });
                for (const ctx of t.context) {
                    ctxWrap.createEl('span', { text: `#${ctx}`, cls: 'diwa-dh-feed-ctx-chip' });
                }
            }
            const editBtn = item.createEl('button', { cls: 'diwa-dh-feed-edit-btn', attr: { title: 'Edit thought', 'aria-label': 'Edit thought' } });
            setIcon(editBtn, 'lucide-pencil');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.makeThoughtEditable(item, content, editBtn, t);
            });
        }
    }

    private makeThoughtEditable(item: HTMLElement, content: HTMLElement, editBtn: HTMLElement, t: ThoughtEntry) {
        if (item.hasClass('is-editing')) return;
        item.addClass('is-editing');
        this._capturePending++;
        content.style.display = 'none';
        editBtn.style.display = 'none';

        let editContexts = [...(t.context || [])];
        const form = item.createEl('div', { cls: 'diwa-edit-form' });

        const chipRow = form.createEl('div', { cls: 'diwa-edit-chip-row' });
        const renderChips = () => {
            chipRow.empty();
            for (const ctx of editContexts) {
                const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${ctx}` });
                chip.addEventListener('click', () => { editContexts = editContexts.filter(c => c !== ctx); renderChips(); });
            }
        };
        renderChips();

        const textarea = form.createEl('textarea', { cls: 'diwa-edit-textarea', attr: { rows: '2' } }) as HTMLTextAreaElement;
        textarea.value = t.body || t.title || '';
        const syncH = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; };
        requestAnimationFrame(() => { syncH(); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); });
        textarea.addEventListener('input', syncH);

        attachInlineTriggers(
            this.app, textarea, () => {},
            (tag) => { if (!editContexts.includes(tag)) { editContexts.push(tag); renderChips(); } },
            () => (this.plugin.settings.contexts ?? []).filter(c => !editContexts.includes(c)),
            this.plugin.settings.peopleFolder,
        );

        const actions = form.createEl('div', { cls: 'diwa-edit-actions' });
        const saveBtn = actions.createEl('button', { cls: 'diwa-edit-save-btn', text: 'Save' });
        const cancelBtn = actions.createEl('button', { cls: 'diwa-edit-cancel-btn', text: 'Cancel' });

        const exit = (restore: boolean) => {
            item.removeClass('is-editing');
            form.remove();
            this._capturePending = Math.max(0, this._capturePending - 1);
            if (restore) { content.style.display = ''; editBtn.style.display = ''; }
        };

        const save = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            exit(false);
            try {
                await this.plugin.vault.editThought(t.filePath, newText, [...editContexts]);
                new Notice('✦ Thought updated', 1200);
            } catch {
                new Notice('Error updating thought', 2500);
                content.style.display = '';
                editBtn.style.display = '';
            }
        };

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', () => exit(true));
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { exit(true); }
        });
    }

    // ── RIGHT Panel ───────────────────────────────────────────────────────────
    private renderRight(parent: HTMLElement) {
        const right = parent.createEl('div', { cls: 'diwa-dh-right' });
        this.renderTaskQuickInput(right);
        this.renderTaskList(right);
    }

    private renderTaskQuickInput(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'diwa-dh-task-input-section' });
        section.addEventListener('click', (e) => {
            if (e.target !== textarea) textarea.focus();
        });

        const chipRow = section.createEl('div', { cls: 'diwa-dh-task-chip-row' });
        let contexts: string[] = [];
        let dueDate: string | null = null;

        const addChip = (tag: string) => {
            if (contexts.includes(tag)) return;
            contexts.push(tag);
            const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${tag}` });
            chip.addEventListener('click', () => {
                contexts = contexts.filter(c => c !== tag);
                chip.remove();
            });
        };

        const textarea = section.createEl('textarea', {
            cls: 'diwa-dh-task-textarea',
            attr: { placeholder: 'Add a task… (@due, #ctx, /person, [[link)', rows: '1' }
        }) as HTMLTextAreaElement;

        const syncHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.overflowY = 'hidden';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };

        textarea.addEventListener('focus', () => { this._taskPending = 1; syncHeight(); });
        textarea.addEventListener('input', () => {
            syncHeight();
            this._taskPending = textarea.value.trim().length > 0 ? 1 : 0;
        });
        textarea.addEventListener('keyup', () => syncHeight());

        attachInlineTriggers(
            this.app,
            textarea,
            (d) => { dueDate = d; },
            (tag) => addChip(tag),
            () => (this.plugin.settings.contexts ?? []).filter(c => !contexts.includes(c)),
            this.plugin.settings.peopleFolder,
        );
        attachMediaPasteHandler(
            this.app,
            textarea,
            () => this.plugin.settings.attachmentsFolder ?? '000 Bin/DIWA V2 Attachments'
        );

        const saveTask = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            const ctxSnapshot = [...contexts];
            const due = dueDate;
            this._taskPending = 0;
            textarea.value = '';
            textarea.style.height = '';
            textarea.style.overflowY = '';
            contexts = [];
            dueDate = null;
            chipRow.empty();
            try {
                await this.plugin.vault.createTaskFile(raw, ctxSnapshot, due || undefined);
                new Notice('✓ Task added', 1000);
            } catch {
                new Notice('Error saving task', 2000);
            }
        };

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTask(); }
            if (e.key === 'Escape') {
                textarea.value = '';
                contexts = [];
                dueDate = null;
                chipRow.empty();
                this._taskPending = 0;
                textarea.blur();
            }
        });
    }

    private renderTaskList(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'diwa-dh-task-list-section' });

        const todayM = moment().startOf('day');
        const cutoff = moment().startOf('day').add(2, 'days').endOf('day');

        const allOpen = Array.from(this.plugin.index.taskIndex.values())
            .filter(t => t.status === 'open' || t.status === 'waiting')
            .sort((a, b) => {
                const aOver = a.due && moment(a.due, 'YYYY-MM-DD').isBefore(todayM, 'day');
                const bOver = b.due && moment(b.due, 'YYYY-MM-DD').isBefore(todayM, 'day');
                if (aOver && !bOver) return -1;
                if (!aOver && bOver) return 1;
                if (a.due && b.due) return a.due.localeCompare(b.due);
                if (a.due && !b.due) return -1;
                if (!a.due && b.due) return 1;
                return (b.lastUpdate || 0) - (a.lastUpdate || 0);
            });

        const tasks = this._taskFilter === 'upcoming'
            ? allOpen.filter(t => !t.due || moment(t.due, 'YYYY-MM-DD').isSameOrBefore(cutoff, 'day'))
            : allOpen;

        // ── Header with filter toggle ────────────────────────────
        const header = section.createEl('div', { cls: 'diwa-dh-task-list-header' });
        header.createEl('span', { text: 'TASKS', cls: 'diwa-dh-task-list-title' });

        const filterGroup = header.createEl('div', { cls: 'diwa-dh-task-filter' });

        const pill2 = filterGroup.createEl('button', {
            text: '2 DAYS',
            cls: `diwa-dh-task-filter-pill${this._taskFilter === 'upcoming' ? ' is-active' : ''}`,
        });
        const pillAll = filterGroup.createEl('button', {
            text: 'ALL',
            cls: `diwa-dh-task-filter-pill${this._taskFilter === 'all' ? ' is-active' : ''}`,
        });

        pill2.addEventListener('click', () => {
            if (this._taskFilter === 'upcoming') return;
            this._taskFilter = 'upcoming';
            section.remove();
            this.renderTaskList(parent);
        });
        pillAll.addEventListener('click', () => {
            if (this._taskFilter === 'all') return;
            this._taskFilter = 'all';
            section.remove();
            this.renderTaskList(parent);
        });

        if (tasks.length === 0) {
            section.createEl('div', {
                text: this._taskFilter === 'upcoming'
                    ? 'No tasks in the next 2 days.'
                    : 'All clear — no open tasks.',
                cls: 'diwa-dh-task-empty'
            });
            return;
        }

        const list = section.createEl('div', { cls: 'diwa-dh-task-list' });
        for (const task of tasks) {
            const isOverdue = !!(task.due && moment(task.due, 'YYYY-MM-DD').isBefore(todayM, 'day'));
            const item = list.createEl('div', { cls: `diwa-dh-task-item${isOverdue ? ' is-overdue' : ''}` });

            const checkbox = item.createEl('div', { cls: 'diwa-dh-task-checkbox' });
            checkbox.addEventListener('click', async (e) => {
                e.stopPropagation();
                item.addClass('is-completing');
                try {
                    await this.plugin.vault.updateTaskEntry(task.filePath, {
                        title: task.title,
                        dueDate: task.due || null,
                        recurrence: task.recurrence || null,
                        priority: task.priority || null,
                        energy: task.energy || null,
                        status: 'done',
                        contexts: task.context || [],
                        project: task.project || null,
                    });
                    item.remove();
                } catch {
                    new Notice('Error updating task', 2000);
                    item.removeClass('is-completing');
                }
            });

            const content = item.createEl('div', { cls: 'diwa-dh-task-content' });
            content.createEl('span', { text: task.title, cls: 'diwa-dh-task-title' });

            if (task.due) {
                const dueM = moment(task.due, 'YYYY-MM-DD');
                const label = isOverdue ? dueM.format('MMM D') : dueM.fromNow();
                content.createEl('span', {
                    text: label,
                    cls: `diwa-dh-task-due${isOverdue ? ' is-overdue' : ''}`
                });
            }

            const editBtn = item.createEl('button', { cls: 'diwa-dh-task-edit-btn', attr: { title: 'Edit task', 'aria-label': 'Edit task' } });
            setIcon(editBtn, 'lucide-pencil');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.makeTaskEditable(item, checkbox, content, editBtn, task);
            });
        }
    }

    private makeTaskEditable(item: HTMLElement, checkbox: HTMLElement, content: HTMLElement, editBtn: HTMLElement, task: TaskEntry) {
        if (item.hasClass('is-editing')) return;
        item.addClass('is-editing');
        this._taskPending++;
        checkbox.style.display = 'none';
        content.style.display = 'none';
        editBtn.style.display = 'none';

        let editContexts = [...(task.context || [])];
        let editDueDate: string | null = task.due || null;
        const form = item.createEl('div', { cls: 'diwa-edit-form' });

        const chipRow = form.createEl('div', { cls: 'diwa-edit-chip-row' });
        const renderChips = () => {
            chipRow.empty();
            for (const ctx of editContexts) {
                const chip = chipRow.createEl('span', { cls: 'diwa-dh-chip', text: `#${ctx}` });
                chip.addEventListener('click', () => { editContexts = editContexts.filter(c => c !== ctx); renderChips(); });
            }
        };
        renderChips();

        const textarea = form.createEl('textarea', { cls: 'diwa-edit-textarea', attr: { rows: '2' } }) as HTMLTextAreaElement;
        textarea.value = task.title || task.body || '';
        const syncH = () => { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; };
        requestAnimationFrame(() => { syncH(); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); });
        textarea.addEventListener('input', syncH);

        attachInlineTriggers(
            this.app, textarea,
            (d) => { editDueDate = d; },
            (tag) => { if (!editContexts.includes(tag)) { editContexts.push(tag); renderChips(); } },
            () => (this.plugin.settings.contexts ?? []).filter(c => !editContexts.includes(c)),
            this.plugin.settings.peopleFolder,
        );

        const actions = form.createEl('div', { cls: 'diwa-edit-actions' });
        const saveBtn = actions.createEl('button', { cls: 'diwa-edit-save-btn', text: 'Save' });
        const cancelBtn = actions.createEl('button', { cls: 'diwa-edit-cancel-btn', text: 'Cancel' });

        const exit = (restore: boolean) => {
            item.removeClass('is-editing');
            form.remove();
            this._taskPending = Math.max(0, this._taskPending - 1);
            if (restore) { checkbox.style.display = ''; content.style.display = ''; editBtn.style.display = ''; }
        };

        const save = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            exit(false);
            try {
                await this.plugin.vault.editTask(
                    task.filePath, newText, [...editContexts],
                    editDueDate || undefined,
                    { priority: task.priority, energy: task.energy, status: task.status }
                );
                new Notice('✓ Task updated', 1000);
            } catch {
                new Notice('Error updating task', 2000);
                checkbox.style.display = '';
                content.style.display = '';
                editBtn.style.display = '';
            }
        };

        saveBtn.addEventListener('click', save);
        cancelBtn.addEventListener('click', () => exit(true));
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === 'Escape') { exit(true); }
        });
    }
}


