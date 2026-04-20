import { moment, MarkdownRenderer, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { parseContextString } from '../utils';

export class TimelineTab extends BaseTab {
    private container: HTMLElement;
    private feedEl: HTMLElement | null = null;
    private headerEl: HTMLElement | null = null;
    private loadedDates = new Set<string>();
    private isLoading = false;
    private dayObserver: IntersectionObserver | null = null;
    private sentinelObserver: IntersectionObserver | null = null;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.container = container;
        this.initTimeline();
    }

    // ── Init ───────────────────────────────────────────────────────────────
    private async initTimeline() {
        this.teardown();
        this.container.empty();
        this.loadedDates.clear();
        this.isLoading = false;

        const wrap = this.container.createEl('div', { cls: 'mina-tl-wrap' });

        this.headerEl = wrap.createEl('div', { cls: 'mina-tl-header-slot' });
        this.renderSpotlightHeader(this.headerEl);

        this.feedEl = wrap.createEl('div', { cls: 'mina-tl-feed' });

        const topSentinel = this.feedEl.createEl('div', { cls: 'mina-tl-sentinel mina-tl-sentinel--top' });

        // Initial load: 1 day before, selected, 2 days after
        const selected = moment(this.view.timelineSelectedDate, 'YYYY-MM-DD');
        for (let o = -1; o <= 2; o++) {
            await this.appendDaySection(selected.clone().add(o, 'days'));
        }

        this.feedEl.createEl('div', { cls: 'mina-tl-sentinel mina-tl-sentinel--bottom' });

        // Scroll to the selected day instantly (no animation on init)
        setTimeout(() => {
            if (!this.feedEl) return;
            const target = this.feedEl.querySelector<HTMLElement>(`[data-date="${this.view.timelineSelectedDate}"]`);
            if (target) this.feedEl.scrollTop = target.offsetTop - 4;
        }, 20);

        this.setupInfiniteScroll(topSentinel);
        this.setupActiveDayObserver();
    }

    private teardown() {
        this.dayObserver?.disconnect();
        this.sentinelObserver?.disconnect();
        this.dayObserver = null;
        this.sentinelObserver = null;
    }

    // ── Navigate — partial update, no full re-render ───────────────────────
    private navigateToDate(dateStr: string) {
        this.view.timelineSelectedDate = dateStr;
        // Refresh only the carousel header
        if (this.headerEl) {
            this.headerEl.empty();
            this.renderSpotlightHeader(this.headerEl);
        }
        if (this.loadedDates.has(dateStr) && this.feedEl) {
            const target = this.feedEl.querySelector<HTMLElement>(`[data-date="${dateStr}"]`);
            if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } else {
            this.initTimeline();
        }
    }

    // ── Spotlight Header Carousel ──────────────────────────────────────────
    private renderSpotlightHeader(parent: HTMLElement) {
        const header = parent.createEl('div', { cls: 'mina-tl-header' });

        const topBar = header.createEl('div', { cls: 'mina-tl-header-bar' });
        this.renderHomeIcon(topBar);
        topBar.createEl('span', { text: 'TIMELINE', cls: 'mina-tl-title' });
        const fab = topBar.createEl('button', { cls: 'mina-tl-capture-fab', attr: { title: 'Capture new thought' } });
        setIcon(fab.createDiv({ cls: 'mina-tl-fab-icon' }), 'lucide-plus');
        fab.createEl('span', { text: 'NEW', cls: 'mina-tl-fab-label' });
        fab.addEventListener('click', () => this.openCapture());

        const activityDates = new Set<string>([
            ...Array.from(this.index.thoughtIndex.values()).map(t => t.day),
            ...Array.from(this.index.taskIndex.values()).map(t => t.day),
        ]);

        const selectedMoment = moment(this.view.timelineSelectedDate, 'YYYY-MM-DD');
        const spotlightRow = header.createEl('div', { cls: 'mina-tl-spotlight-row' });

        const prevBtn = spotlightRow.createEl('button', { cls: 'mina-tl-nav-btn', attr: { title: 'Previous day' } });
        setIcon(prevBtn, 'lucide-chevron-left');
        prevBtn.addEventListener('click', () =>
            this.navigateToDate(selectedMoment.clone().subtract(1, 'day').format('YYYY-MM-DD')));

        const track = spotlightRow.createEl('div', { cls: 'mina-tl-spotlight-track' });

        for (let offset = -2; offset <= 2; offset++) {
            const date = selectedMoment.clone().add(offset, 'days');
            const dateStr = date.format('YYYY-MM-DD');
            const isSpotlight = offset === 0;
            const isToday = date.isSame(moment(), 'day');
            const hasActivity = activityDates.has(dateStr);
            const distCls = isSpotlight ? 'is-spotlight' : Math.abs(offset) === 1 ? 'is-near' : 'is-far';

            const item = track.createEl('div', {
                cls: ['mina-tl-date-item', distCls, isToday ? 'is-today' : ''].filter(Boolean).join(' ')
            });
            item.createSpan({ text: isToday ? 'TODAY' : date.format('ddd').toUpperCase(), cls: 'mina-tl-date-dow' });
            item.createSpan({ text: date.format('D'), cls: 'mina-tl-date-num' });
            item.createSpan({ text: date.format('MMM').toUpperCase(), cls: 'mina-tl-date-mon' });
            if (hasActivity) item.createDiv({ cls: 'mina-tl-date-dot' });
            if (!isSpotlight) item.addEventListener('click', () => this.navigateToDate(dateStr));
        }

        this.setupSwipeNavigation(track, selectedMoment);

        const nextBtn = spotlightRow.createEl('button', { cls: 'mina-tl-nav-btn', attr: { title: 'Next day' } });
        setIcon(nextBtn, 'lucide-chevron-right');
        nextBtn.addEventListener('click', () =>
            this.navigateToDate(selectedMoment.clone().add(1, 'day').format('YYYY-MM-DD')));

        header.createEl('div', {
            text: selectedMoment.format('dddd, MMMM D · YYYY').toUpperCase(),
            cls: 'mina-tl-spotlight-subtitle'
        });
    }

    // ── Swipe / Drag Navigation ────────────────────────────────────────────
    private setupSwipeNavigation(track: HTMLElement, selectedMoment: moment.Moment) {
        let startX = 0;
        let startTime = 0;
        let dragging = false;

        track.addEventListener('pointerdown', (e: PointerEvent) => {
            startX = e.clientX;
            startTime = Date.now();
            dragging = true;
            track.setPointerCapture(e.pointerId);
            track.classList.add('is-dragging');
        });

        track.addEventListener('pointerup', (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            track.classList.remove('is-dragging');
            const deltaX = startX - e.clientX;
            const velocity = Math.abs(deltaX) / Math.max(Date.now() - startTime, 1);
            if (Math.abs(deltaX) < 25) return;
            let days = 1;
            if (velocity > 1.5) days = 4;
            else if (velocity > 0.9) days = 3;
            else if (velocity > 0.45) days = 2;
            const newDate = deltaX > 0
                ? selectedMoment.clone().add(days, 'days')
                : selectedMoment.clone().subtract(days, 'days');
            this.navigateToDate(newDate.format('YYYY-MM-DD'));
        });

        track.addEventListener('pointercancel', () => {
            dragging = false;
            track.classList.remove('is-dragging');
        });
    }

    // ── Day Section — append / prepend ─────────────────────────────────────
    private async appendDaySection(date: moment.Moment) {
        const dateStr = date.format('YYYY-MM-DD');
        if (this.loadedDates.has(dateStr) || !this.feedEl) return;
        this.loadedDates.add(dateStr);
        const section = await this.buildDaySection(date);
        const bottomSentinel = this.feedEl.querySelector('.mina-tl-sentinel--bottom');
        if (bottomSentinel) this.feedEl.insertBefore(section, bottomSentinel);
        else this.feedEl.appendChild(section);
        this.observeDayHeader(section);
    }

    private async prependDaySection(date: moment.Moment) {
        const dateStr = date.format('YYYY-MM-DD');
        if (this.loadedDates.has(dateStr) || !this.feedEl) return;
        this.loadedDates.add(dateStr);
        const section = await this.buildDaySection(date);
        // Preserve scroll offset so content doesn't jump
        const prevScrollTop = this.feedEl.scrollTop;
        const prevHeight = this.feedEl.scrollHeight;
        const topSentinel = this.feedEl.querySelector('.mina-tl-sentinel--top');
        if (topSentinel) topSentinel.after(section);
        else this.feedEl.insertBefore(section, this.feedEl.firstChild);
        this.feedEl.scrollTop = prevScrollTop + (this.feedEl.scrollHeight - prevHeight);
        this.observeDayHeader(section);
    }

    private observeDayHeader(section: HTMLElement) {
        const hdr = section.querySelector<HTMLElement>('[data-date-header]');
        if (hdr) this.dayObserver?.observe(hdr);
    }

    // ── Build a single day section ─────────────────────────────────────────
    private async buildDaySection(date: moment.Moment): Promise<HTMLElement> {
        const dateStr = date.format('YYYY-MM-DD');
        const isToday = date.isSame(moment(), 'day');

        const section = document.createElement('div');
        section.className = 'mina-tl-day-section';
        section.dataset.date = dateStr;

        // Sticky day header
        const dayHeader = document.createElement('div');
        dayHeader.className = `mina-tl-day-header${isToday ? ' is-today' : ''}`;
        dayHeader.dataset.dateHeader = dateStr;

        const labelEl = document.createElement('span');
        labelEl.className = 'mina-tl-day-label';
        labelEl.textContent = isToday
            ? `TODAY  ·  ${date.format('ddd, MMM D').toUpperCase()}`
            : date.format('ddd, MMM D · YYYY').toUpperCase();
        dayHeader.appendChild(labelEl);

        const countEl = document.createElement('span');
        countEl.className = 'mina-tl-day-count';
        dayHeader.appendChild(countEl);
        section.appendChild(dayHeader);

        // Gather entries
        type FeedItem = { type: 'task' | 'thought'; entry: any; time: string };
        const tasks = Array.from(this.index.taskIndex.values())
            .filter(t => t.day === dateStr || t.due === dateStr);
        const thoughts = Array.from(this.index.thoughtIndex.values())
            .filter(t => t.day === dateStr || t.allDates.includes(dateStr));
        const entries: FeedItem[] = [
            ...tasks.map(t => ({ type: 'task' as const, entry: t, time: (t.created || '').split(' ')[1] || '00:00:00' })),
            ...thoughts.map(t => ({ type: 'thought' as const, entry: t, time: (t.created || '').split(' ')[1] || '00:00:00' }))
        ].sort((a, b) => b.time.localeCompare(a.time));

        if (entries.length === 0) {
            countEl.textContent = '—';
            const emptyEl = document.createElement('div');
            emptyEl.className = 'mina-tl-day-empty';
            emptyEl.textContent = 'Nothing captured.';
            section.appendChild(emptyEl);
        } else {
            countEl.textContent = String(entries.length);
            const spineWrap = document.createElement('div');
            spineWrap.className = 'mina-tl-spine-wrap';
            for (const item of entries) {
                spineWrap.appendChild(await this.buildEntryCard(item));
            }
            section.appendChild(spineWrap);
        }

        return section;
    }

    // ── Infinite Scroll (sentinel-based) ──────────────────────────────────
    private setupInfiniteScroll(topSentinel: HTMLElement) {
        this.sentinelObserver = new IntersectionObserver(async (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting || this.isLoading) continue;
                this.isLoading = true;
                const sorted = Array.from(this.loadedDates).sort();
                if (entry.target.classList.contains('mina-tl-sentinel--top')) {
                    const earliest = moment(sorted[0], 'YYYY-MM-DD');
                    await this.prependDaySection(earliest.clone().subtract(1, 'day'));
                    await this.prependDaySection(earliest.clone().subtract(2, 'days'));
                } else {
                    const latest = moment(sorted[sorted.length - 1], 'YYYY-MM-DD');
                    await this.appendDaySection(latest.clone().add(1, 'day'));
                    await this.appendDaySection(latest.clone().add(2, 'days'));
                }
                this.isLoading = false;
            }
        }, { root: this.feedEl, rootMargin: '200px', threshold: 0 });

        this.sentinelObserver.observe(topSentinel);
        const bottomSentinel = this.feedEl?.querySelector('.mina-tl-sentinel--bottom');
        if (bottomSentinel) this.sentinelObserver.observe(bottomSentinel);
    }

    // ── Active Day Observer — keeps carousel in sync while scrolling ───────
    private setupActiveDayObserver() {
        // rootMargin: fire when day header enters the top 30% of the feed viewport
        this.dayObserver = new IntersectionObserver((entries) => {
            let best: { date: string; top: number } | null = null;
            for (const e of entries) {
                if (e.isIntersecting) {
                    const top = e.boundingClientRect.top;
                    if (!best || top < best.top) {
                        best = { date: (e.target as HTMLElement).dataset.dateHeader!, top };
                    }
                }
            }
            if (best && best.date !== this.view.timelineSelectedDate) {
                this.view.timelineSelectedDate = best.date;
                if (this.headerEl) {
                    this.headerEl.empty();
                    this.renderSpotlightHeader(this.headerEl);
                }
            }
        }, { root: this.feedEl, rootMargin: '-10px 0px -65% 0px', threshold: 0 });

        this.feedEl?.querySelectorAll('[data-date-header]').forEach(el => this.dayObserver!.observe(el));
    }

    // ── Entry Card ─────────────────────────────────────────────────────────
    private async buildEntryCard(item: { type: 'task' | 'thought'; entry: any; time: string }): Promise<HTMLElement> {
        const entryEl = document.createElement('div');
        entryEl.className = 'mina-tl-entry';

        const nodeEl = document.createElement('div');
        nodeEl.className = 'mina-tl-entry-node';
        entryEl.appendChild(nodeEl);

        const card = document.createElement('div');
        card.className = `mina-tl-entry-card mina-tl-entry-card--${item.type}`;

        // Meta
        const meta = document.createElement('div');
        meta.className = 'mina-tl-entry-meta';
        const badge = document.createElement('span');
        badge.className = `mina-tl-type-badge mina-tl-type-badge--${item.type}`;
        badge.textContent = item.type === 'thought' ? '✦ THOUGHT' : '✓ TASK';
        const timeEl = document.createElement('span');
        timeEl.className = 'mina-tl-entry-time';
        timeEl.textContent = item.time.substring(0, 5);
        meta.appendChild(badge);
        meta.appendChild(timeEl);
        card.appendChild(meta);

        // Body
        const body = document.createElement('div');
        body.className = 'mina-tl-entry-body';
        await MarkdownRenderer.render(this.app, item.entry.body || item.entry.title || '', body, item.entry.filePath, this.view);
        this.hookInternalLinks(body, item.entry.filePath);
        card.appendChild(body);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'mina-tl-entry-footer';
        if (item.type === 'task' && item.entry.due) {
            const dueM = moment(item.entry.due, 'YYYY-MM-DD');
            const isOverdue = item.entry.status !== 'done' && dueM.isValid() && dueM.isBefore(moment(), 'day');
            const dueEl = document.createElement('span');
            dueEl.className = `mina-tl-due${isOverdue ? ' is-overdue' : ''}`;
            dueEl.textContent = `📅 ${item.entry.due}`;
            footer.appendChild(dueEl);
        }
        if (item.entry.context?.length > 0) {
            const pills = document.createElement('div');
            pills.className = 'mina-tl-ctx-pills';
            for (const ctx of item.entry.context) {
                const pill = document.createElement('span');
                pill.className = 'mina-tl-ctx-pill';
                pill.textContent = `#${ctx}`;
                pills.appendChild(pill);
            }
            footer.appendChild(pills);
        }
        card.appendChild(footer);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'mina-tl-entry-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'mina-tl-action-btn';
        editBtn.title = 'Edit';
        setIcon(editBtn, 'lucide-pencil');
        editBtn.addEventListener('click', () => {
            new EditEntryModal(
                this.app, this.plugin,
                item.entry.body, item.entry.context.map((c: string) => `#${c}`).join(' '),
                item.type === 'task' ? (item.entry.due || null) : null,
                item.type === 'task',
                async (newText, newCtxStr, newDue) => {
                    const ctxArr = newCtxStr ? parseContextString(newCtxStr) : [];
                    if (item.type === 'task') await this.vault.editTask(item.entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                    else await this.vault.editThought(item.entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr);
                    this.initTimeline();
                }
            ).open();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'mina-tl-action-btn mina-tl-action-btn--danger';
        delBtn.title = 'Delete';
        setIcon(delBtn, 'lucide-trash-2');
        delBtn.addEventListener('click', () => {
            new ConfirmModal(this.app, `Move this ${item.type} to trash?`, async () => {
                await this.vault.deleteFile(item.entry.filePath, item.type === 'task' ? 'tasks' : 'thoughts');
                if (item.type === 'task') this.index.taskIndex.delete(item.entry.filePath);
                else this.index.thoughtIndex.delete(item.entry.filePath);
                entryEl.remove(); // surgical removal — no full re-render needed
            }).open();
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(actions);
        entryEl.appendChild(card);
        return entryEl;
    }

    // ── Capture ────────────────────────────────────────────────────────────
    private openCapture() {
        new EditEntryModal(
            this.app, this.plugin, '', '', null, false,
            async (text, ctxs) => {
                if (!text.trim()) return;
                await this.vault.createThoughtFile(text, parseContextString(ctxs));
                this.initTimeline();
            },
            'Capture'
        ).open();
    }
}

