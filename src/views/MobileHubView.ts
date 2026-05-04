import { ItemView, WorkspaceLeaf, moment, setIcon, Notice, ViewStateResult } from 'obsidian';
import type MinaPlugin from '../main';
import {
    VIEW_TYPE_MOBILE_HUB,
    FOCUS_ICON_ID, JOURNAL_ICON_ID, SETTINGS_ICON_ID,
} from '../constants';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';

type FeedTab = 'thoughts' | 'tasks';

export class MobileHubView extends ItemView {
    plugin: MinaPlugin;
    _capturePending: number = 0;
    _feedTab: FeedTab = 'thoughts';
    private _closed = false;

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'MINA'; }
    getIcon(): string { return 'smartphone'; }

    getState(): Record<string, unknown> {
        return { feedTab: this._feedTab };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.feedTab) this._feedTab = state.feedTab as FeedTab;
        await super.setState(state, result);
        this.renderView();
    }

    async onOpen() {
        this._closed = false;
        // Hide Obsidian's leaf header — same pattern as DesktopHubView
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this.renderView();
    }

    async onClose() {
        this._closed = true;
    }

    renderView() {
        if (this._capturePending > 0) return;

        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass('mina-mh-root');

        const wrap = root.createEl('div', { cls: 'mina-mh-wrap' });
        this.renderTopBar(wrap);

        const body = wrap.createEl('div', { cls: 'mina-mh-body' });
        this.renderCapture(body);
        this.renderFeed(body);

        this.renderBottomNav(wrap);
    }

    // ── Top Bar ───────────────────────────────────────────────────────────────
    private renderTopBar(parent: HTMLElement) {
        const bar = parent.createEl('div', { cls: 'mina-mh-topbar' });

        bar.createEl('span', { text: 'MINA', cls: 'mina-mh-topbar-logo' });

        const dateStr = moment().format('ddd, MMM D').toUpperCase();
        bar.createEl('span', { text: dateStr, cls: 'mina-mh-topbar-date' });

        const time = bar.createEl('span', { text: moment().format('HH:mm'), cls: 'mina-mh-topbar-time' });
        // Tick every minute
        const tick = setInterval(() => {
            if (this._closed) { clearInterval(tick); return; }
            time.setText(moment().format('HH:mm'));
        }, 60_000);
    }

    // ── Capture ───────────────────────────────────────────────────────────────
    private renderCapture(parent: HTMLElement) {
        const section = parent.createEl('div', { cls: 'mina-mh-capture-section' });

        const textarea = section.createEl('textarea', {
            cls: 'mina-mh-capture-textarea',
            attr: { placeholder: "What's on your mind…", rows: '3' }
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
        textarea.addEventListener('keyup', syncHeight);

        const chipRow = section.createEl('div', { cls: 'mina-mh-chip-row' });
        let contexts: string[] = [];

        const addChip = (tag: string) => {
            if (contexts.includes(tag)) return;
            contexts.push(tag);
            const chip = chipRow.createEl('span', { cls: 'mina-mh-chip', text: `#${tag}` });
            chip.addEventListener('click', () => {
                contexts = contexts.filter(c => c !== tag);
                chip.remove();
            });
        };

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

        const footer = section.createEl('div', { cls: 'mina-mh-capture-footer' });

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
                new Notice('Error saving thought', 2500);
            }
        };

        const saveTask = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            this._capturePending = 0;
            textarea.value = '';
            textarea.style.height = '';
            textarea.style.overflowY = '';
            contexts = [];
            chipRow.empty();
            try {
                await this.plugin.vault.createTaskFile(raw, []);
                new Notice('✓ Task added', 1200);
            } catch {
                new Notice('Error saving task', 2500);
            }
        };

        // Send button
        const sendBtn = footer.createEl('button', { cls: 'mina-mh-send-btn' });
        const sendIcon = sendBtn.createDiv({ cls: 'mina-mh-send-icon' });
        setIcon(sendIcon, 'lucide-arrow-up');
        sendBtn.addEventListener('click', () => {
            if (this._feedTab === 'tasks') saveTask();
            else saveThought();
        });

        // Mode hint
        const hint = footer.createEl('span', { cls: 'mina-mh-capture-hint' });
        const updateHint = () => {
            hint.setText(this._feedTab === 'tasks' ? '→ Task' : '→ Thought');
        };
        updateHint();

        // Keep hint in sync when feed tab changes (re-render) — set on parent section
        section.dataset.feedTab = this._feedTab;

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this._feedTab === 'tasks') saveTask();
                else saveThought();
            }
            if (e.key === 'Escape') {
                textarea.value = '';
                textarea.style.height = '';
                contexts = [];
                chipRow.empty();
                this._capturePending = 0;
                textarea.blur();
            }
        });
    }

    // ── Feed ──────────────────────────────────────────────────────────────────
    private renderFeed(parent: HTMLElement) {
        const container = parent.createEl('div', { cls: 'mina-mh-feed-container' });

        // Toggle bar
        const toggle = container.createEl('div', { cls: 'mina-mh-feed-toggle', attr: { role: 'tablist' } });
        const thoughtsBtn = toggle.createEl('button', {
            cls: `mina-mh-feed-tab${this._feedTab === 'thoughts' ? ' is-active' : ''}`,
            attr: { role: 'tab', 'aria-selected': String(this._feedTab === 'thoughts') }
        });
        thoughtsBtn.createEl('span', { text: 'THOUGHTS' });

        const tasksBtn = toggle.createEl('button', {
            cls: `mina-mh-feed-tab${this._feedTab === 'tasks' ? ' is-active' : ''}`,
            attr: { role: 'tab', 'aria-selected': String(this._feedTab === 'tasks') }
        });
        tasksBtn.createEl('span', { text: 'TASKS' });

        thoughtsBtn.addEventListener('click', () => {
            if (this._feedTab === 'thoughts') return;
            this._feedTab = 'thoughts';
            this.renderView();
        });
        tasksBtn.addEventListener('click', () => {
            if (this._feedTab === 'tasks') return;
            this._feedTab = 'tasks';
            this.renderView();
        });

        const feed = container.createEl('div', { cls: 'mina-mh-feed' });

        if (this._feedTab === 'thoughts') {
            this.renderThoughtsFeed(feed);
        } else {
            this.renderTasksFeed(feed);
        }
    }

    private renderThoughtsFeed(parent: HTMLElement) {
        const today = moment().format('YYYY-MM-DD');
        const thoughts = Array.from(this.plugin.index.thoughtIndex.values())
            .filter(t => t.day === today)
            .sort((a, b) => (b.created || '').localeCompare(a.created || ''));

        if (thoughts.length === 0) {
            parent.createEl('div', {
                text: 'Nothing captured yet — your mind is clear.',
                cls: 'mina-mh-feed-empty'
            });
            return;
        }

        for (const t of thoughts) {
            const item = parent.createEl('div', { cls: 'mina-mh-feed-item' });
            item.createEl('span', { cls: 'mina-mh-feed-dot' });
            const content = item.createEl('div', { cls: 'mina-mh-feed-content' });
            const ts = t.created ? moment(t.created, 'YYYY-MM-DD HH:mm:ss').format('HH:mm') : '';
            if (ts) content.createEl('span', { text: ts, cls: 'mina-mh-feed-time' });
            content.createEl('p', { text: t.body || t.title || '', cls: 'mina-mh-feed-text' });
            if (t.context && t.context.length > 0) {
                const ctxWrap = content.createEl('div', { cls: 'mina-mh-feed-ctx' });
                for (const ctx of t.context) {
                    ctxWrap.createEl('span', { text: `#${ctx}`, cls: 'mina-mh-feed-ctx-chip' });
                }
            }
        }
    }

    private renderTasksFeed(parent: HTMLElement) {
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

        if (tasks.length === 0) {
            parent.createEl('div', {
                text: 'All clear — no open tasks.',
                cls: 'mina-mh-feed-empty'
            });
            return;
        }

        for (const task of tasks) {
            const isOverdue = !!(task.due && moment(task.due, 'YYYY-MM-DD').isBefore(todayM, 'day'));
            const item = parent.createEl('div', {
                cls: `mina-mh-task-item${isOverdue ? ' is-overdue' : ''}`
            });

            const checkbox = item.createEl('div', { cls: 'mina-mh-task-checkbox' });
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

            const content = item.createEl('div', { cls: 'mina-mh-task-content' });
            content.createEl('span', { text: task.title, cls: 'mina-mh-task-title' });

            if (task.due) {
                const dueM = moment(task.due, 'YYYY-MM-DD');
                const label = isOverdue ? dueM.format('MMM D') : dueM.fromNow();
                content.createEl('span', {
                    text: label,
                    cls: `mina-mh-task-due${isOverdue ? ' is-overdue' : ''}`
                });
            }
        }
    }

    // ── Bottom Nav ────────────────────────────────────────────────────────────
    private renderBottomNav(parent: HTMLElement) {
        const nav = parent.createEl('nav', { cls: 'mina-mh-bottom-nav', attr: { 'aria-label': 'Quick Navigation' } });

        const items: { icon: string; label: string; action: () => void }[] = [
            { icon: 'home', label: 'Home', action: () => this.plugin.activateView('home', true) },
            { icon: 'lucide-check-square-2', label: 'Tasks', action: () => this.plugin.activateView('review-tasks', false) },
            { icon: JOURNAL_ICON_ID, label: 'Journal', action: () => this.plugin.activateView('journal', false) },
            { icon: FOCUS_ICON_ID, label: 'Focus', action: () => this.plugin.activateView('focus', false) },
            { icon: SETTINGS_ICON_ID, label: 'Settings', action: () => this.plugin.activateView('settings', false) },
        ];

        for (const item of items) {
            const btn = nav.createEl('button', {
                cls: 'mina-mh-nav-btn',
                attr: { title: item.label, 'aria-label': item.label }
            });
            const iconWrap = btn.createDiv({ cls: 'mina-mh-nav-icon' });
            setIcon(iconWrap, item.icon);
            btn.createEl('span', { text: item.label, cls: 'mina-mh-nav-label' });
            btn.addEventListener('click', item.action);
        }
    }
}
