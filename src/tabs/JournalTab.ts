import { MarkdownRenderer, moment, Platform, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { JournalEntryModal } from '../modals/JournalEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { isTablet } from '../utils';
import type { ThoughtEntry } from '../types';

export class JournalTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this._renderJournal(container);
    }

    private _renderJournal(container: HTMLElement) {
        container.empty();

        // Gather + sort: latest created first
        const allEntries = Array.from(this.index.thoughtIndex.values())
            .filter(e => Array.isArray(e.context) && e.context.includes('journal'));
        allEntries.sort((a, b) =>
            moment(b.created, 'YYYY-MM-DD HH:mm:ss').valueOf() -
            moment(a.created, 'YYYY-MM-DD HH:mm:ss').valueOf()
        );

        // Root: flex-col so FAB sits outside scroll container
        const root = container.createEl('div', { cls: 'mina-journal-root' });
        const scroll = root.createEl('div', { cls: 'mina-journal-scroll' });

        // ── Nav row ───────────────────────────────────────────────────────
        const navRow = scroll.createEl('div', { cls: 'mina-journal-nav-row' });
        this.renderHomeIcon(navRow);
        if (Platform.isMobile && !isTablet()) {
            // Mobile: compact + button in nav row (upper right)
            const addBtn = navRow.createEl('button', { cls: 'mina-journal-add-btn' });
            setIcon(addBtn, 'lucide-plus');
            addBtn.addEventListener('click', () => this._openNewEntry());
        } else {
            const newBtn = navRow.createEl('button', { cls: 'mina-journal-new-btn' });
            const btnIcon = newBtn.createSpan(); setIcon(btnIcon, 'lucide-pencil');
            newBtn.createSpan({ text: 'New Entry' });
            newBtn.addEventListener('click', () => this._openNewEntry());
        }

        // ── Title ─────────────────────────────────────────────────────────
        scroll.createEl('h2', { text: 'Journal', cls: 'mina-journal-title' });
        scroll.createEl('p', { text: 'Your personal reflections', cls: 'mina-journal-subtitle' });

        // ── Stats strip ───────────────────────────────────────────────────
        const thisMonth = moment().format('YYYY-MM');
        const monthCount = allEntries.filter(e => e.day && e.day.startsWith(thisMonth)).length;
        const streak = this._calcStreak(allEntries);
        const statsRow = scroll.createEl('div', { cls: 'mina-journal-stats' });
        this._stat(statsRow, String(allEntries.length), 'Entries');
        this._stat(statsRow, String(monthCount), 'This Month');
        this._stat(statsRow, streak > 0 ? `${streak} 🔥` : '—', 'Streak');

        // ── Search ────────────────────────────────────────────────────────
        const searchWrap = scroll.createEl('div', { cls: 'mina-journal-search-wrap' });
        const searchIconEl = searchWrap.createEl('span', { cls: 'mina-journal-search-icon' });
        setIcon(searchIconEl, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'mina-journal-search',
            attr: { type: 'text', placeholder: 'Search journal…' }
        }) as HTMLInputElement;
        if (this.view.journalSearch) searchInput.value = this.view.journalSearch;

        // ── List ──────────────────────────────────────────────────────────
        const listEl = scroll.createEl('div', { cls: 'mina-journal-list' });
        let debounceTimer: ReturnType<typeof setTimeout>;

        const renderList = () => {
            listEl.empty();
            const q = (this.view.journalSearch || '').toLowerCase().trim();
            const filtered = q
                ? allEntries.filter(e =>
                    e.body.toLowerCase().includes(q) ||
                    e.title.toLowerCase().includes(q))
                : allEntries;
            if (filtered.length === 0) {
                this.renderEmptyState(listEl, q
                    ? 'No entries match your search.'
                    : 'No journal entries yet.\nTap "New Entry" to begin. ✍️');
                return;
            }
            this._renderGrouped(listEl, filtered);
        };

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            this.view.journalSearch = searchInput.value;
            debounceTimer = setTimeout(renderList, 150);
        });

        renderList();
    }

    private _renderGrouped(listEl: HTMLElement, entries: ThoughtEntry[]) {
        const today = moment().format('YYYY-MM-DD');
        const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
        let currentGroup = '';
        for (const entry of entries) {
            const label = this._groupLabel(entry.day || entry.created.split(' ')[0], today, yesterday);
            if (label !== currentGroup) {
                currentGroup = label;
                listEl.createEl('div', { cls: 'mina-journal-group-header', text: label });
            }
            this._renderCard(listEl, entry);
        }
    }

    private _groupLabel(day: string, today: string, yesterday: string): string {
        if (day === today) return 'Today';
        if (day === yesterday) return 'Yesterday';
        const m = moment(day, 'YYYY-MM-DD', true);
        if (!m.isValid()) return day;
        const daysAgo = moment().diff(m, 'days');
        if (daysAgo < 7) return m.format('dddd');
        if (m.year() === moment().year()) return m.format('MMMM D');
        return m.format('MMMM D, YYYY');
    }

    private _renderCard(listEl: HTMLElement, entry: ThoughtEntry) {
        const timePart = entry.created.includes(' ')
            ? entry.created.split(' ')[1].substring(0, 5)
            : '';

        const card = listEl.createEl('div', { cls: 'mina-journal-card' });

        // ── Card head: time + actions ─────────────────────────────────────
        const cardHead = card.createEl('div', { cls: 'mina-journal-card-head' });
        if (timePart) {
            cardHead.createEl('span', { cls: 'mina-journal-card-time', text: timePart });
        }
        const actions = cardHead.createEl('div', { cls: 'mina-journal-card-actions' });

        const editBtn = actions.createEl('button', {
            cls: 'mina-journal-act-btn', attr: { title: 'Edit entry' }
        });
        setIcon(editBtn, 'lucide-pencil');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new JournalEntryModal(this.app, this.plugin, 'edit', entry.body,
                entry.filePath,
                async (newText, ctxArr) => {
                    await this.vault.editThought(entry.filePath, newText, ctxArr);
                    this.view.renderView();
                }).open();
        });

        const delBtn = actions.createEl('button', {
            cls: 'mina-journal-act-btn mina-journal-act-btn--del', attr: { title: 'Delete entry' }
        });
        setIcon(delBtn, 'lucide-trash-2');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new ConfirmModal(this.app, 'Move this entry to trash?', async () => {
                await this.vault.deleteFile(entry.filePath, 'thoughts');
                this.view.renderView();
            }).open();
        });

        // ── Body ──────────────────────────────────────────────────────────
        const bodyEl = card.createEl('div', { cls: 'mina-journal-card-body' });
        MarkdownRenderer.render(this.app, entry.body, bodyEl, entry.filePath, this.view);
        this.hookInternalLinks(bodyEl, entry.filePath);
        this.hookImageZoom(bodyEl);
        this.hookCheckboxes(bodyEl, entry);

        // ── Footer: context chips + reply count ───────────────────────────
        const visibleCtx = entry.context.filter(c => c !== 'journal');
        if (visibleCtx.length > 0 || entry.children.length > 0) {
            const footer = card.createEl('div', { cls: 'mina-journal-card-footer' });
            for (const ctx of visibleCtx) {
                footer.createEl('span', { cls: 'mina-journal-ctx-chip', text: `#${ctx}` });
            }
            if (entry.children.length > 0) {
                footer.createEl('span', {
                    cls: 'mina-journal-reply-badge',
                    text: `${entry.children.length} repl${entry.children.length === 1 ? 'y' : 'ies'}`
                });
            }
        }
    }

    private _openNewEntry() {
        new JournalEntryModal(this.app, this.plugin, 'new', '', null,
            async (text, contexts) => {
                if (!text.trim()) return;
                await this.vault.createThoughtFile(text, contexts);
                this.view.renderView();
            }).open();
    }

    private _calcStreak(entries: ThoughtEntry[]): number {
        const days = new Set(entries.map(e => e.day || e.created.split(' ')[0]).filter(Boolean));
        let streak = 0;
        let cursor = moment().startOf('day');
        if (!days.has(cursor.format('YYYY-MM-DD'))) cursor = cursor.subtract(1, 'day');
        while (days.has(cursor.format('YYYY-MM-DD'))) {
            streak++;
            cursor = cursor.subtract(1, 'day');
        }
        return streak;
    }

    private _stat(parent: HTMLElement, value: string, label: string) {
        const s = parent.createEl('div', { cls: 'mina-journal-stat' });
        s.createEl('div', { cls: 'mina-journal-stat-val', text: value });
        s.createEl('div', { cls: 'mina-journal-stat-lbl', text: label });
    }
}
