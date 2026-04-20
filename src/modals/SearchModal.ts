import { App, Modal, setIcon, Platform } from 'obsidian';
import type MinaPlugin from '../main';
import { isTablet } from '../utils';

interface SearchResult {
    type: 'thought' | 'task' | 'due' | 'project' | 'habit';
    title: string;
    preview: string;
    meta: string;
    tabId: string;
    id: string;
}

const SCOPE_ALL = 'all';
const SCOPES = [
    { id: 'all', label: 'All' },
    { id: 'thought', label: 'Thoughts' },
    { id: 'task', label: 'Tasks' },
    { id: 'due', label: 'Dues' },
    { id: 'project', label: 'Projects' },
    { id: 'habit', label: 'Habits' },
];

const TYPE_ICONS: Record<string, string> = {
    thought: 'lucide-message-circle',
    task: 'lucide-check-square-2',
    due: 'lucide-wallet',
    project: 'lucide-folder-kanban',
    habit: 'lucide-activity',
};

const QUICKJUMP_TABS = [
    { id: 'timeline', label: 'Timeline', icon: 'lucide-message-circle' },
    { id: 'review-tasks', label: 'Tasks', icon: 'lucide-check-square-2' },
    { id: 'dues', label: 'Dues', icon: 'lucide-wallet' },
    { id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' },
    { id: 'habits', label: 'Habits', icon: 'lucide-activity' },
    { id: 'journal', label: 'Journal', icon: 'lucide-book-open' },
];

export class SearchModal extends Modal {
    private plugin: MinaPlugin;
    private inputEl: HTMLInputElement;
    private bodyEl: HTMLElement;
    private scopeBar: HTMLElement;
    private activeScope: string = SCOPE_ALL;
    private focusedIndex: number = -1;
    private resultEls: HTMLElement[] = [];
    private allResults: SearchResult[] = [];
    private panelEl: HTMLElement;

    constructor(app: App, plugin: MinaPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { modalEl, contentEl } = this;
        modalEl.empty();
        modalEl.addClass('mina-search-overlay');

        this.panelEl = modalEl.createEl('div', { cls: 'mina-search-panel', attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'MINA Global Search' } });

        // Input row
        const inputRow = this.panelEl.createEl('div', { cls: 'mina-search-input-row' });
        const iconEl = inputRow.createEl('span', { cls: 'mina-search-icon' });
        setIcon(iconEl, 'lucide-search');
        this.inputEl = inputRow.createEl('input', {
            cls: 'mina-search-input',
            attr: { type: 'text', placeholder: 'Search across all of MINA…', autocomplete: 'off', spellcheck: 'false' }
        });
        const kbdHint = inputRow.createEl('span', { cls: 'mina-search-kbd-hint', text: 'ESC' });

        // Scope bar
        this.scopeBar = this.panelEl.createEl('div', { cls: 'mina-search-scope-bar', attr: { role: 'tablist' } });
        for (const scope of SCOPES) {
            const btn = this.scopeBar.createEl('button', { cls: `mina-search-scope-btn${scope.id === this.activeScope ? ' is-active' : ''}`, attr: { 'data-scope': scope.id } });
            btn.createEl('span', { text: scope.label });
            btn.createEl('span', { cls: 'mina-search-scope-count', text: '0' });
            btn.addEventListener('click', () => this.setScope(scope.id));
        }

        // Body
        this.bodyEl = this.panelEl.createEl('div', { cls: 'mina-search-body', attr: { role: 'listbox', 'aria-live': 'polite' } });

        // Footer (desktop only)
        if (!Platform.isMobile || isTablet()) {
            const footer = this.panelEl.createEl('div', { cls: 'mina-search-footer' });
            const hints = [
                ['↑↓', 'Navigate'], ['↵', 'Open'], ['ESC', 'Close']
            ];
            hints.forEach(([key, label], i) => {
                if (i > 0) footer.createEl('div', { cls: 'mina-search-footer-divider' });
                const hint = footer.createEl('div', { cls: 'mina-search-footer-hint' });
                hint.createEl('kbd', { cls: 'mina-search-footer-kbd', text: key });
                hint.createEl('span', { text: ` ${label}` });
            });
        }

        // Events
        this.inputEl.addEventListener('input', () => this.onQueryChange());
        this.inputEl.addEventListener('keydown', (e) => this.onKeydown(e));
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) this.closeWithAnimation();
        });

        // Render initial state
        this.renderInitialState();

        // Focus input
        setTimeout(() => this.inputEl.focus(), 50);
    }

    onClose() {
        this.modalEl.removeClass('mina-search-overlay');
    }

    private closeWithAnimation() {
        this.modalEl.addClass('is-closing');
        setTimeout(() => this.close(), 160);
    }

    private setScope(scopeId: string) {
        this.activeScope = scopeId;
        this.scopeBar.querySelectorAll('.mina-search-scope-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.getAttribute('data-scope') === scopeId);
        });
        this.onQueryChange();
        this.inputEl.focus();
    }

    private onQueryChange() {
        const query = this.inputEl.value.trim().toLowerCase();
        this.panelEl.classList.toggle('has-query', query.length > 0);
        if (query.length === 0) {
            this.renderInitialState();
            return;
        }
        this.performSearch(query);
    }

    private onKeydown(e: KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.moveFocus(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.moveFocus(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.focusedIndex >= 0 && this.focusedIndex < this.allResults.length) {
                this.activateResult(this.allResults[this.focusedIndex]);
            } else if (this.allResults.length > 0) {
                this.activateResult(this.allResults[0]);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.closeWithAnimation();
        }
    }

    private moveFocus(dir: number) {
        if (this.resultEls.length === 0) return;
        this.focusedIndex += dir;
        if (this.focusedIndex < -1) this.focusedIndex = this.resultEls.length - 1;
        if (this.focusedIndex >= this.resultEls.length) this.focusedIndex = -1;
        this.resultEls.forEach((el, i) => el.classList.toggle('is-focused', i === this.focusedIndex));
        if (this.focusedIndex >= 0) {
            this.resultEls[this.focusedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    private activateResult(result: SearchResult) {
        this.close();
        // Navigate to the target tab
        const leaves = this.app.workspace.getLeavesOfType('mina-view');
        if (leaves.length > 0) {
            const view = leaves[0].view as any;
            view.activeTab = result.tabId;
            view.renderView();
        }
    }

    private performSearch(query: string) {
        const index = this.plugin.index;
        const results: SearchResult[] = [];
        const counts: Record<string, number> = { all: 0, thought: 0, task: 0, due: 0, project: 0, habit: 0 };

        // Search thoughts
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'thought') {
            index.thoughtIndex.forEach(t => {
                if (t.title.toLowerCase().includes(query) || t.body.toLowerCase().includes(query)) {
                    counts.thought++;
                    if (results.filter(r => r.type === 'thought').length < 5) {
                        results.push({
                            type: 'thought', title: t.title, preview: t.context.join(', ') || t.body.slice(0, 60),
                            meta: this.relativeDate(t.created), tabId: 'timeline', id: t.filePath
                        });
                    }
                }
            });
        }

        // Search tasks
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'task') {
            index.taskIndex.forEach(t => {
                if (t.title.toLowerCase().includes(query) || t.body.toLowerCase().includes(query)) {
                    counts.task++;
                    if (results.filter(r => r.type === 'task').length < 5) {
                        results.push({
                            type: 'task', title: t.title, preview: t.project || t.context.join(', '),
                            meta: t.due ? `Due: ${t.due}` : this.relativeDate(t.created), tabId: 'review-tasks', id: t.filePath
                        });
                    }
                }
            });
        }

        // Search dues
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'due') {
            index.dueIndex.forEach(d => {
                if (d.title.toLowerCase().includes(query)) {
                    counts.due++;
                    if (results.filter(r => r.type === 'due').length < 5) {
                        results.push({
                            type: 'due', title: d.title, preview: d.amount ? `$${d.amount}` : '',
                            meta: d.dueDate || '', tabId: 'dues', id: d.path
                        });
                    }
                }
            });
        }

        // Search projects
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'project') {
            index.projectIndex.forEach(p => {
                if (p.name.toLowerCase().includes(query) || p.goal.toLowerCase().includes(query)) {
                    counts.project++;
                    if (results.filter(r => r.type === 'project').length < 5) {
                        results.push({
                            type: 'project', title: p.name, preview: p.goal.slice(0, 60),
                            meta: p.status, tabId: 'projects', id: p.id
                        });
                    }
                }
            });
        }

        // Search habits
        if (this.activeScope === SCOPE_ALL || this.activeScope === 'habit') {
            const habits = this.plugin.settings.habits || [];
            habits.forEach(h => {
                if (h.name.toLowerCase().includes(query)) {
                    counts.habit++;
                    if (results.filter(r => r.type === 'habit').length < 5) {
                        const done = index.habitStatusIndex.includes(h.id);
                        results.push({
                            type: 'habit', title: `${h.icon} ${h.name}`, preview: done ? '✓ Done today' : 'Not yet',
                            meta: '', tabId: 'habits', id: h.id
                        });
                    }
                }
            });
        }

        counts.all = counts.thought + counts.task + counts.due + counts.project + counts.habit;
        this.allResults = results;

        // Update scope counts
        this.scopeBar.querySelectorAll('.mina-search-scope-btn').forEach(btn => {
            const scope = btn.getAttribute('data-scope') || 'all';
            const countEl = btn.querySelector('.mina-search-scope-count') as HTMLElement;
            if (countEl) countEl.textContent = String(counts[scope] || 0);
        });

        this.renderResults(results, query);
    }

    private renderResults(results: SearchResult[], query: string) {
        this.bodyEl.empty();
        this.resultEls = [];
        this.focusedIndex = -1;

        if (results.length === 0) {
            this.renderEmptyState(query);
            return;
        }

        // Group by type
        const grouped: Record<string, SearchResult[]> = {};
        for (const r of results) {
            if (!grouped[r.type]) grouped[r.type] = [];
            grouped[r.type].push(r);
        }

        for (const [type, items] of Object.entries(grouped)) {
            const section = this.bodyEl.createEl('div', { cls: 'mina-search-section' });
            const header = section.createEl('div', { cls: 'mina-search-section-header' });
            const typeIcon = header.createEl('span', { cls: 'mina-search-section-type-icon' });
            setIcon(typeIcon, TYPE_ICONS[type] || 'lucide-file');
            header.createEl('span', { cls: 'mina-search-section-type-label', text: type.charAt(0).toUpperCase() + type.slice(1) + 's' });
            header.createEl('span', { cls: 'mina-search-section-result-count', text: String(items.length) });

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const row = section.createEl('div', {
                    cls: 'mina-search-result-item',
                    attr: { role: 'option', 'aria-selected': 'false', style: `--mina-search-i: ${Math.min(this.resultEls.length, 5)}` }
                });

                const iconWrap = row.createEl('div', { cls: `mina-search-result-icon mina-search-result-icon--${item.type}` });
                setIcon(iconWrap, TYPE_ICONS[item.type] || 'lucide-file');

                const body = row.createEl('div', { cls: 'mina-search-result-body' });
                const titleEl = body.createEl('span', { cls: 'mina-search-result-title' });
                titleEl.innerHTML = this.highlightMatch(item.title, query);
                if (item.preview) {
                    body.createEl('span', { cls: 'mina-search-result-preview', text: item.preview });
                }

                if (item.meta) {
                    const meta = row.createEl('div', { cls: 'mina-search-result-meta' });
                    meta.createEl('span', { cls: 'mina-chip mina-chip--date', text: item.meta });
                }

                row.addEventListener('click', () => this.activateResult(item));
                this.resultEls.push(row);
            }
        }
    }

    private renderInitialState() {
        this.bodyEl.empty();
        this.resultEls = [];
        this.focusedIndex = -1;
        this.allResults = [];

        const initial = this.bodyEl.createEl('div', { cls: 'mina-search-initial' });
        initial.createEl('span', { cls: 'mina-search-recents-label', text: 'Quick Jump' });

        const grid = initial.createEl('div', { cls: 'mina-search-quickjump-grid' });
        for (const tab of QUICKJUMP_TABS) {
            const btn = grid.createEl('button', { cls: 'mina-search-quickjump-btn', attr: { 'data-tab': tab.id } });
            const icon = btn.createEl('span', { cls: 'svg-icon' });
            setIcon(icon, tab.icon);
            btn.createEl('span', { cls: 'mina-search-quickjump-label', text: tab.label });
            btn.addEventListener('click', () => {
                this.close();
                const leaves = this.app.workspace.getLeavesOfType('mina-view');
                if (leaves.length > 0) {
                    const view = leaves[0].view as any;
                    view.activeTab = tab.id;
                    view.renderView();
                }
            });
        }

        // Reset scope counts
        this.scopeBar.querySelectorAll('.mina-search-scope-count').forEach(el => { (el as HTMLElement).textContent = '0'; });
    }

    private renderEmptyState(query: string) {
        const empty = this.bodyEl.createEl('div', { cls: 'mina-search-empty' });
        const icon = empty.createEl('span', { cls: 'mina-search-empty-icon' });
        setIcon(icon, 'lucide-search-x');
        const text = empty.createEl('span', { cls: 'mina-search-empty-text' });
        text.innerHTML = `No results for <span class="mina-search-empty-query">"${this.escapeHtml(query)}"</span>`;
        empty.createEl('span', { cls: 'mina-search-empty-sub', text: 'Try searching by title, tag, or date — or switch scope to All.' });
    }

    private highlightMatch(text: string, query: string): string {
        const escaped = this.escapeHtml(text);
        const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    private escapeHtml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private relativeDate(dateStr: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}h ago`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return dateStr.split(' ')[0];
    }
}
