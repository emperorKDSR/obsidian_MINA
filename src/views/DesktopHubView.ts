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

    // Suppress re-renders while user is mid-capture
    _capturePending: number = 0;

    // Guard against DOM updates after view is closed
    private _closed: boolean = false;
    private _aiActive: boolean = false;

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
        if (this._capturePending > 0) return;

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
                placeholder: "What's on your mind… (Enter to save, Shift+Enter for new line)",
                rows: '2'
            }
        }) as HTMLTextAreaElement;

        const syncHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.overflowY = 'hidden';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };

        textarea.addEventListener('focus', () => { this._capturePending = 1; });
        textarea.addEventListener('input', () => {
            syncHeight();
            this._capturePending = textarea.value.trim().length > 0 ? 1 : 0;
        });

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
        }
    }

    // ── RIGHT Panel ───────────────────────────────────────────────────────────
    private renderRight(parent: HTMLElement) {
        const right = parent.createEl('div', { cls: 'mina-dh-right' });
        this.renderStats(right);
        this.renderIntelligence(right);
    }

    private renderStats(parent: HTMLElement) {
        const card = parent.createEl('div', { cls: 'mina-dh-stats-card' });
        card.createEl('div', { text: 'STATUS', cls: 'mina-dh-card-label' });

        const idx = this.plugin.index;
        const todayM = moment().startOf('day');
        const openTasks = Array.from(idx.taskIndex.values()).filter(t => t.status === 'open');
        const overdue = openTasks.filter(
            t => t.due && moment(t.due, 'YYYY-MM-DD').isValid() && moment(t.due, 'YYYY-MM-DD').isBefore(todayM, 'day')
        );
        const unsynth = Array.from(idx.thoughtIndex.values()).filter(t => !t.synthesized).length;
        const dues = idx.totalDues || 0;
        const allHabits = (this.plugin.settings.habits || []).filter(h => !h.archived);
        const doneHabits = idx.habitStatusIndex.length;

        const grid = card.createEl('div', { cls: 'mina-dh-stats-grid' });

        const addStat = (value: string, label: string, modifier?: 'danger' | 'success') => {
            const stat = grid.createEl('div', { cls: 'mina-dh-stat' });
            stat.createEl('div', {
                text: value,
                cls: `mina-dh-stat-value${modifier ? ` is-${modifier}` : ''}`
            });
            stat.createEl('div', { text: label, cls: 'mina-dh-stat-label' });
        };

        addStat(String(openTasks.length), 'OPEN TASKS', overdue.length > 0 ? 'danger' : undefined);
        addStat(String(overdue.length), 'OVERDUE', overdue.length > 0 ? 'danger' : undefined);
        addStat(String(unsynth), 'THOUGHTS');
        addStat(`$${dues.toFixed(0)}`, 'DUES', dues > 0 ? 'danger' : undefined);
        addStat(
            `${doneHabits}/${allHabits.length}`,
            'HABITS',
            doneHabits === allHabits.length && allHabits.length > 0 ? 'success' : undefined
        );
    }

    private renderIntelligence(parent: HTMLElement) {
        const card = parent.createEl('div', { cls: 'mina-dh-intel-card' });

        const header = card.createEl('div', { cls: 'mina-dh-intel-header' });
        const titleRow = header.createEl('div', { cls: 'mina-dh-intel-title' });
        const iIcon = titleRow.createDiv({ cls: 'mina-dh-intel-icon' });
        setIcon(iIcon, 'lucide-sparkles');
        titleRow.createSpan({ text: 'INTELLIGENCE', cls: 'mina-dh-intel-label' });
        const tsEl = header.createSpan({ cls: 'mina-dh-intel-ts', text: '' });

        const idx = this.plugin.index;
        const todayM = moment().startOf('day');
        const openTasks = Array.from(idx.taskIndex.values()).filter(t => t.status === 'open');
        const overdue = openTasks.filter(
            t => t.due && moment(t.due, 'YYYY-MM-DD').isValid() && moment(t.due, 'YYYY-MM-DD').isBefore(todayM, 'day')
        );
        const completedHabits = idx.habitStatusIndex.length;
        const totalHabits = (this.plugin.settings.habits || []).length;
        const unsynth = Array.from(idx.thoughtIndex.values()).filter(t => !t.synthesized).length;
        const dues = idx.totalDues || 0;

        const body = card.createEl('div', {
            text: 'Strategic briefing pending analysis.',
            cls: 'mina-dh-intel-body'
        });

        const analyzeBtn = card.createEl('button', { cls: 'mina-dh-intel-btn' });
        const btnIcon = analyzeBtn.createDiv({ cls: 'mina-dh-intel-btn-icon' });
        setIcon(btnIcon, 'lucide-sparkles');
        analyzeBtn.createSpan({ text: 'SYNTHESIZE BRIEFING' });

        analyzeBtn.addEventListener('click', async () => {
            if (this._aiActive) return;
            this._aiActive = true;
            body.empty();
            body.removeClass('has-content');
            body.addClass('is-loading');
            body.setText('');
            tsEl.setText('');
            analyzeBtn.disabled = true;

            try {
                const contextBlock = [
                    `## Status — ${moment().format('dddd, MMMM D, YYYY')}`,
                    `**Open Tasks:** ${openTasks.length} (${overdue.length} overdue)`,
                    `**Habits:** ${completedHabits}/${totalHabits}`,
                    `**Unprocessed Thoughts:** ${unsynth}`,
                    `**Financial Obligations:** $${dues.toFixed(2)}`,
                    this.plugin.settings.northStarGoals?.[0]
                        ? `**North Star:** ${this.plugin.settings.northStarGoals[0]}`
                        : '',
                    overdue.length
                        ? `**Overdue:** ${overdue.slice(0, 5).map(t => t.title).join(', ')}`
                        : '',
                ].filter(Boolean).join('\n');

                const summary = await this.plugin.ai.callGemini(
                    `${contextBlock}\n\nSharp strategic briefing: what needs attention now? What's at risk? Be direct.`,
                    [],
                    false,
                    [],
                    idx.thoughtIndex
                );

                if (this._closed) return;
                body.removeClass('is-loading');
                body.setText(summary);
                body.addClass('has-content');
                tsEl.setText(moment().format('h:mm A'));
            } catch (e: any) {
                if (!this._closed) {
                    body.removeClass('is-loading');
                    body.setText('Intelligence offline: ' + e.message);
                }
            } finally {
                this._aiActive = false;
                if (!this._closed) analyzeBtn.disabled = false;
            }
        });
    }
}
