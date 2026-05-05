import { ItemView, WorkspaceLeaf, Platform, moment, setIcon, Notice, ViewStateResult } from 'obsidian';
import type MinaPlugin from '../main';
import {
    VIEW_TYPE_DESKTOP_HUB,
    PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID,
    SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, COMPASS_ICON_ID,
    FOCUS_ICON_ID, MEMENTO_ICON_ID,
} from '../constants';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';

export class DesktopHubView extends ItemView {
    plugin: MinaPlugin;
    isFocusMode: boolean = false;

    // Suppress re-renders while user is mid-capture (thought or task)
    _capturePending: number = 0;
    _taskPending: number = 0;

    // Guard against DOM updates after view is closed
    private _closed: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_DESKTOP_HUB; }
    getDisplayText(): string { return 'MINA Desktop Hub'; }
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
        // Hide Obsidian's leaf header (same pattern as MinaView src/view.ts:128-132)
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
        root.addClass('mina-dh-root');

        if (!Platform.isDesktop) {
            root.createEl('div', {
                text: '⊕ MINA Desktop Hub requires a desktop environment.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;' }
            });
            return;
        }

        const wrap = root.createEl('div', { cls: 'mina-dh-wrap' });
        if (this.isFocusMode) wrap.addClass('is-focus-mode');

        this.renderTopBar(wrap);

        const cols = wrap.createEl('div', { cls: 'mina-dh-cols' });
        this.renderSidebar(cols);
        this.renderCenter(cols);
        this.renderRight(cols);
    }

    // ── Top Bar ───────────────────────────────────────────────────────────────
    private renderTopBar(parent: HTMLElement) {
        const bar = parent.createEl('div', { cls: 'mina-dh-topbar' });

        const left = bar.createEl('div', { cls: 'mina-dh-topbar-left' });
        left.createEl('span', { text: 'MINA', cls: 'mina-dh-topbar-logo' });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        left.createEl('span', { text: `${greeting}, Emperor.`, cls: 'mina-dh-topbar-greeting' });

        const center = bar.createEl('div', { cls: 'mina-dh-topbar-center' });
        center.createEl('span', {
            text: moment().format('dddd · MMMM D, YYYY').toUpperCase(),
            cls: 'mina-dh-topbar-date'
        });
        const northStar = this.plugin.settings.northStarGoals?.[0];
        if (northStar) {
            center.createEl('span', { text: `★ ${northStar}`, cls: 'mina-dh-topbar-northstar' });
        }

        const right = bar.createEl('div', { cls: 'mina-dh-topbar-right' });
        const focusBtn = right.createEl('button', {
            cls: `mina-dh-focus-btn${this.isFocusMode ? ' is-active' : ''}`,
            attr: { title: this.isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode' }
        });
        const focusIcon = focusBtn.createDiv({ cls: 'mina-dh-focus-btn-icon' });
        setIcon(focusIcon, 'lucide-target');
        focusBtn.createSpan({ text: this.isFocusMode ? 'EXIT FOCUS' : 'FOCUS MODE' });
        focusBtn.addEventListener('click', () => {
            this.isFocusMode = !this.isFocusMode;
            this.renderView();
        });
    }

    // ── LEFT Sidebar ──────────────────────────────────────────────────────────
    private renderSidebar(parent: HTMLElement) {
        const sidebar = parent.createEl('nav', { cls: 'mina-dh-sidebar', attr: { 'aria-label': 'MINA Navigation' } });

        const groups: { title: string; items: { label: string; icon: string; tab: string }[] }[] = [
            {
                title: 'ACTION',
                items: [
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
                    { label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'mina-ai' },
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
            const groupEl = sidebar.createEl('div', { cls: 'mina-dh-nav-group' });
            groupEl.createEl('span', { text: group.title, cls: 'mina-dh-nav-group-label' });
            for (const item of group.items) {
                const btn = groupEl.createEl('button', {
                    cls: 'mina-dh-nav-item',
                    attr: { title: item.label, 'aria-label': item.label }
                });
                const iconWrap = btn.createEl('span', { cls: 'mina-dh-nav-icon' });
                setIcon(iconWrap, item.icon);
                btn.createEl('span', { text: item.label, cls: 'mina-dh-nav-label' });
                btn.addEventListener('click', () => this.plugin.activateView(item.tab, false));
            }
        }
    }

    // ── CENTER Column ─────────────────────────────────────────────────────────
    private renderCenter(parent: HTMLElement) {
        const center = parent.createEl('div', { cls: 'mina-dh-center' });
        this.renderCapture(center);
        const inner = center.createEl('div', { cls: 'mina-dh-center-inner' });
        this.renderTodayFeed(inner);
    }

    private renderCapture(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'mina-dh-capture-section' });
        section.addEventListener('click', (e) => {
            if (e.target !== textarea) textarea.focus();
        });

        const chipRow = section.createEl('div', { cls: 'mina-dh-chip-row' });
        let contexts: string[] = [];

        const addChip = (tag: string) => {
            if (contexts.includes(tag)) return;
            contexts.push(tag);
            const chip = chipRow.createEl('span', { cls: 'mina-dh-chip', text: `#${tag}` });
            chip.addEventListener('click', () => {
                contexts = contexts.filter(c => c !== tag);
                chip.remove();
            });
        };

        const textarea = section.createEl('textarea', {
            cls: 'mina-dh-capture-textarea',
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
            () => contexts,
            this.plugin.settings.peopleFolder,
        );
        attachMediaPasteHandler(
            this.app,
            textarea,
            () => this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments'
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
        const feed = parent.createEl('div', { cls: 'mina-dh-feed' });
        feed.createEl('div', { text: 'TODAY', cls: 'mina-dh-feed-label' });

        const today = moment().format('YYYY-MM-DD');
        const todayThoughts = Array.from(this.plugin.index.thoughtIndex.values())
            .filter(t => t.day === today)
            .sort((a, b) => (b.created || '').localeCompare(a.created || ''));

        if (todayThoughts.length === 0) {
            feed.createEl('div', {
                text: 'Nothing captured yet — your mind is clear.',
                cls: 'mina-dh-feed-empty'
            });
            return;
        }

        const list = feed.createEl('div', { cls: 'mina-dh-feed-list' });
        for (const t of todayThoughts) {
            const item = list.createEl('div', { cls: 'mina-dh-feed-item' });
            item.createEl('span', { cls: 'mina-dh-feed-dot' });
            const content = item.createEl('div', { cls: 'mina-dh-feed-content' });
            const ts = t.created ? moment(t.created, 'YYYY-MM-DD HH:mm:ss').format('HH:mm') : '';
            content.createEl('span', { text: ts, cls: 'mina-dh-feed-time' });
            content.createEl('p', { text: t.body || t.title || '', cls: 'mina-dh-feed-text' });
            if (t.context && t.context.length > 0) {
                const ctxWrap = content.createEl('div', { cls: 'mina-dh-feed-ctx' });
                for (const ctx of t.context) {
                    ctxWrap.createEl('span', { text: `#${ctx}`, cls: 'mina-dh-feed-ctx-chip' });
                }
            }
            const copyBtn = item.createEl('button', { cls: 'mina-dh-copy-btn', attr: { title: 'Copy', 'aria-label': 'Copy thought' } });
            copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(t.body || t.title || '');
                new Notice('✦ Copied', 900);
            });
        }
    }

    // ── RIGHT Panel ───────────────────────────────────────────────────────────
    private renderRight(parent: HTMLElement) {
        const right = parent.createEl('div', { cls: 'mina-dh-right' });
        this.renderTaskQuickInput(right);
        this.renderTaskList(right);
    }

    private renderTaskQuickInput(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'mina-dh-task-input-section' });
        section.addEventListener('click', (e) => {
            if (e.target !== textarea) textarea.focus();
        });

        const chipRow = section.createEl('div', { cls: 'mina-dh-task-chip-row' });
        let contexts: string[] = [];
        let dueDate: string | null = null;

        const addChip = (tag: string) => {
            if (contexts.includes(tag)) return;
            contexts.push(tag);
            const chip = chipRow.createEl('span', { cls: 'mina-dh-chip', text: `#${tag}` });
            chip.addEventListener('click', () => {
                contexts = contexts.filter(c => c !== tag);
                chip.remove();
            });
        };

        const textarea = section.createEl('textarea', {
            cls: 'mina-dh-task-textarea',
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
            () => contexts,
            this.plugin.settings.peopleFolder,
        );
        attachMediaPasteHandler(
            this.app,
            textarea,
            () => this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments'
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
        const section = parent.createEl('div', { cls: 'mina-dh-task-list-section' });

        const todayM = moment().startOf('day');
        const tasks = Array.from(this.plugin.index.taskIndex.values())
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

        const header = section.createEl('div', { cls: 'mina-dh-task-list-header' });
        header.createEl('span', { text: 'TASKS', cls: 'mina-dh-task-list-title' });
        if (tasks.length > 0) {
            header.createEl('span', { text: String(tasks.length), cls: 'mina-dh-task-count' });
        }

        if (tasks.length === 0) {
            section.createEl('div', { text: 'All clear — no open tasks.', cls: 'mina-dh-task-empty' });
            return;
        }

        const list = section.createEl('div', { cls: 'mina-dh-task-list' });
        for (const task of tasks) {
            const isOverdue = !!(task.due && moment(task.due, 'YYYY-MM-DD').isBefore(todayM, 'day'));
            const item = list.createEl('div', { cls: `mina-dh-task-item${isOverdue ? ' is-overdue' : ''}` });

            const checkbox = item.createEl('div', { cls: 'mina-dh-task-checkbox' });
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

            const content = item.createEl('div', { cls: 'mina-dh-task-content' });
            content.createEl('span', { text: task.title, cls: 'mina-dh-task-title' });

            if (task.due) {
                const dueM = moment(task.due, 'YYYY-MM-DD');
                const label = isOverdue ? dueM.format('MMM D') : dueM.fromNow();
                content.createEl('span', {
                    text: label,
                    cls: `mina-dh-task-due${isOverdue ? ' is-overdue' : ''}`
                });
            }

            const copyBtn = item.createEl('button', { cls: 'mina-dh-copy-btn', attr: { title: 'Copy', 'aria-label': 'Copy task' } });
            copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(task.title);
                new Notice('✦ Copied', 900);
            });
        }
    }
}
