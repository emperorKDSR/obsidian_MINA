import { moment, MarkdownRenderer, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { parseContextString } from '../utils';

export class TimelineTab extends BaseTab {
    private container: HTMLElement;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.container = container;
        this.renderTimeline();
    }

    private async renderTimeline() {
        this.container.empty();
        const wrap = this.container.createEl('div', { cls: 'mina-tl-wrap' });
        this.renderHeader(wrap);
        this.renderCarousel(wrap);
        await this.renderFeed(wrap);
    }

    // ── 1. Header ──────────────────────────────────────────────────────────
    private renderHeader(parent: HTMLElement) {
        const header = parent.createEl('div', { cls: 'mina-tl-header' });
        this.renderHomeIcon(header);
        header.createEl('span', { text: 'TIMELINE', cls: 'mina-tl-title' });
        const fab = header.createEl('button', { cls: 'mina-tl-capture-fab', attr: { title: 'Capture new thought' } });
        const iconWrap = fab.createDiv({ cls: 'mina-tl-fab-icon' });
        setIcon(iconWrap, 'lucide-plus');
        fab.createEl('span', { text: 'NEW', cls: 'mina-tl-fab-label' });
        fab.addEventListener('click', () => this.openCapture());
    }

    // ── 2. Date Carousel ───────────────────────────────────────────────────
    private renderCarousel(parent: HTMLElement) {
        const wrap = parent.createEl('div', { cls: 'mina-tl-carousel-wrap' });
        const carousel = wrap.createEl('div', { cls: 'mina-tl-carousel' });

        // Build activity set for dots
        const activityDates = new Set<string>([
            ...Array.from(this.index.thoughtIndex.values()).map(t => t.day),
            ...Array.from(this.index.taskIndex.values()).map(t => t.day),
        ]);

        const today = moment();
        let activeItem: HTMLElement | null = null;

        for (let i = -60; i <= 14; i++) {
            const date = today.clone().add(i, 'days');
            const dateStr = date.format('YYYY-MM-DD');
            const isActive = dateStr === this.view.timelineSelectedDate;
            const isToday = i === 0;
            const hasActivity = activityDates.has(dateStr);

            const item = carousel.createEl('div', {
                cls: ['mina-tl-date-item', isActive ? 'is-active' : '', isToday ? 'is-today' : ''].filter(Boolean).join(' ')
            });

            if (isToday) {
                item.createSpan({ text: 'TODAY', cls: 'mina-tl-date-dow' });
            } else {
                item.createSpan({ text: date.format('ddd').toUpperCase(), cls: 'mina-tl-date-dow' });
            }
            item.createSpan({ text: date.format('D'), cls: 'mina-tl-date-num' });
            if (hasActivity) item.createDiv({ cls: 'mina-tl-date-dot' });

            item.addEventListener('click', () => {
                this.view.timelineSelectedDate = dateStr;
                this.renderTimeline();
            });

            if (isActive) activeItem = item;
        }

        // Scroll active date into center view
        if (activeItem) {
            setTimeout(() => activeItem!.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 40);
        }
    }

    // ── 3. Feed ────────────────────────────────────────────────────────────
    private async renderFeed(parent: HTMLElement) {
        const feed = parent.createEl('div', { cls: 'mina-tl-feed' });

        const selectedDate = this.view.timelineSelectedDate;
        const selectedMoment = moment(selectedDate, 'YYYY-MM-DD');

        // Date banner
        feed.createEl('div', {
            text: selectedMoment.format('dddd, MMMM D · YYYY').toUpperCase(),
            cls: 'mina-tl-date-banner'
        });

        const tasks = Array.from(this.index.taskIndex.values())
            .filter(t => t.day === selectedDate || t.due === selectedDate);
        const thoughts = Array.from(this.index.thoughtIndex.values())
            .filter(t => t.day === selectedDate || t.allDates.includes(selectedDate));

        type FeedItem = { type: 'task' | 'thought'; entry: any; time: string };
        const allEntries: FeedItem[] = [
            ...tasks.map(t => ({ type: 'task' as const, entry: t, time: (t.created || '').split(' ')[1] || '00:00:00' })),
            ...thoughts.map(t => ({ type: 'thought' as const, entry: t, time: (t.created || '').split(' ')[1] || '00:00:00' }))
        ].sort((a, b) => b.time.localeCompare(a.time));

        if (allEntries.length === 0) {
            const empty = feed.createEl('div', { cls: 'mina-tl-empty' });
            empty.createEl('div', { text: '○', cls: 'mina-tl-empty-glyph' });
            empty.createEl('p', { text: 'Nothing captured on this day.', cls: 'mina-tl-empty-msg' });
            const cta = empty.createEl('button', { text: '+ Capture a thought', cls: 'mina-tl-empty-cta' });
            cta.addEventListener('click', () => this.openCapture());
            return;
        }

        // Entry count badge
        feed.createEl('div', {
            text: `${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'}`,
            cls: 'mina-tl-entry-count'
        });

        const spineWrap = feed.createEl('div', { cls: 'mina-tl-spine-wrap' });

        for (const item of allEntries) {
            const entryEl = spineWrap.createEl('div', { cls: 'mina-tl-entry' });
            entryEl.createEl('div', { cls: 'mina-tl-entry-node' });
            const card = entryEl.createEl('div', { cls: `mina-tl-entry-card mina-tl-entry-card--${item.type}` });

            // Meta: type badge + timestamp
            const meta = card.createEl('div', { cls: 'mina-tl-entry-meta' });
            meta.createEl('span', {
                text: item.type === 'thought' ? '✦ THOUGHT' : '✓ TASK',
                cls: `mina-tl-type-badge mina-tl-type-badge--${item.type}`
            });
            meta.createEl('span', { text: item.time.substring(0, 5), cls: 'mina-tl-entry-time' });

            // Body
            const body = card.createEl('div', { cls: 'mina-tl-entry-body' });
            await MarkdownRenderer.render(this.app, item.entry.body || item.entry.title || '', body, item.entry.filePath, this.view);
            this.hookInternalLinks(body, item.entry.filePath);

            // Footer: due + contexts
            const footer = card.createEl('div', { cls: 'mina-tl-entry-footer' });
            if (item.type === 'task' && item.entry.due) {
                const dueM = moment(item.entry.due, 'YYYY-MM-DD');
                const isOverdue = item.entry.status !== 'done' && dueM.isValid() && dueM.isBefore(moment(), 'day');
                footer.createEl('span', {
                    text: `📅 ${item.entry.due}`,
                    cls: `mina-tl-due${isOverdue ? ' is-overdue' : ''}`
                });
            }
            if (item.entry.context?.length > 0) {
                const pills = footer.createEl('div', { cls: 'mina-tl-ctx-pills' });
                for (const ctx of item.entry.context) {
                    pills.createEl('span', { text: `#${ctx}`, cls: 'mina-tl-ctx-pill' });
                }
            }

            // Action buttons
            const actions = card.createEl('div', { cls: 'mina-tl-entry-actions' });
            const editBtn = actions.createEl('button', { cls: 'mina-tl-action-btn', attr: { title: 'Edit' } });
            setIcon(editBtn, 'lucide-pencil');
            editBtn.addEventListener('click', () => {
                new EditEntryModal(
                    this.app, this.plugin,
                    item.entry.body, item.entry.context.map((c: string) => `#${c}`).join(' '),
                    item.type === 'task' ? (item.entry.due || null) : null,
                    item.type === 'task',
                    async (newText, newCtxStr, newDue) => {
                        const ctxArr = newCtxStr ? parseContextString(newCtxStr) : [];
                        if (item.type === 'task') {
                            await this.vault.editTask(item.entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                        } else {
                            await this.vault.editThought(item.entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr);
                        }
                        this.renderTimeline();
                    }
                ).open();
            });

            const delBtn = actions.createEl('button', { cls: 'mina-tl-action-btn mina-tl-action-btn--danger', attr: { title: 'Delete' } });
            setIcon(delBtn, 'lucide-trash-2');
            delBtn.addEventListener('click', () => {
                new ConfirmModal(this.app, `Move this ${item.type} to trash?`, async () => {
                    await this.vault.deleteFile(item.entry.filePath, item.type === 'task' ? 'tasks' : 'thoughts');
                    // Eagerly remove from index before re-render — vault 'delete' event
                    // fires asynchronously so the index would still contain the entry otherwise.
                    if (item.type === 'task') this.index.taskIndex.delete(item.entry.filePath);
                    else this.index.thoughtIndex.delete(item.entry.filePath);
                    this.renderTimeline();
                }).open();
            });
        }
    }

    // ── Capture ────────────────────────────────────────────────────────────
    private openCapture() {
        new EditEntryModal(
            this.app, this.plugin, '', '', null, false,
            async (text, ctxs) => {
                if (!text.trim()) return;
                await this.vault.createThoughtFile(text, parseContextString(ctxs));
                const today = moment().format('YYYY-MM-DD');
                if (this.view.timelineSelectedDate === today) this.renderTimeline();
            },
            'Capture'
        ).open();
    }
}

