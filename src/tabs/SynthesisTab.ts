import { moment, Platform, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry } from '../types';
import { BaseTab } from "./BaseTab";
import { isTablet } from '../utils';

export class SynthesisTab extends BaseTab {
    private phonePane: 'feed' | 'canvas' = 'feed';
    private pendingAssignThought: ThoughtEntry | null = null;

    constructor(view: MinaView) { super(view); }

    private get feedFilter() { return this.view.synthesisFeedFilter; }
    private set feedFilter(v) { this.view.synthesisFeedFilter = v; }
    private get activeCtx() { return this.view.activeSynthesisContext; }
    private set activeCtx(v) { this.view.activeSynthesisContext = v; }

    render(container: HTMLElement) {
        this.renderSynthesisMode(container);
    }

    private renderSynthesisMode(container: HTMLElement) {
        container.empty();
        const isPhone = Platform.isMobile && !isTablet();

        const shell = container.createEl('div', { cls: `mina-syn-shell${isPhone ? ' is-phone' : ''}` });

        const feed = shell.createEl('div', { cls: `mina-syn-feed${isPhone && this.phonePane !== 'feed' ? ' is-hidden' : ''}` });
        this.renderFeedPane(feed, shell, isPhone);

        const canvas = shell.createEl('div', { cls: `mina-syn-canvas${isPhone && this.phonePane !== 'canvas' ? ' is-hidden' : ''}` });
        this.renderCanvasPane(canvas, isPhone);

        if (isPhone) {
            this.renderPhoneNav(shell, feed, canvas);
            this.renderContextSheet(shell);
        }
    }

    private renderFeedPane(feed: HTMLElement, shell: HTMLElement, isPhone: boolean) {
        const hdr = feed.createEl('div', { cls: 'mina-syn-feed-hdr' });
        this.renderHomeIcon(hdr);
        const hdrText = hdr.createEl('div', { cls: 'mina-syn-feed-hdr-text' });
        hdrText.createEl('span', { text: 'SYNTHESIS', cls: 'mina-syn-feed-label' });

        const filteredThoughts = this.getFilteredThoughts();
        const countEl = hdrText.createEl('span', {
            text: String(filteredThoughts.length),
            cls: 'mina-syn-feed-count' + (this.feedFilter === 'no-context' ? ' is-inbox' : '')
        });

        if (isPhone) {
            const toggleBtn = hdr.createEl('button', { cls: 'mina-syn-pane-toggle' });
            setIcon(toggleBtn, 'layout-panel-right');
            toggleBtn.title = 'View Canvas';
            toggleBtn.addEventListener('click', () => { this.phonePane = 'canvas'; this.view.renderView(); });
        }

        const toggleZone = feed.createEl('div', { cls: 'mina-syn-feed-toggle' });
        const segBar = toggleZone.createEl('div', { cls: 'mina-seg-bar mina-syn-toggle-bar' });

        const filters: Array<{ key: 'no-context' | 'with-context' | 'processed'; label: string }> = [
            { key: 'no-context', label: 'Inbox' },
            { key: 'with-context', label: 'Mapped' },
            { key: 'processed', label: 'Done' },
        ];

        const feedScroll = feed.createEl('div', { cls: 'mina-syn-feed-scroll' });

        for (const f of filters) {
            const btn = segBar.createEl('button', {
                cls: `mina-seg-btn${this.feedFilter === f.key ? ' is-active' : ''}`,
                attr: { 'data-filter': f.key }
            });
            btn.createEl('span', { text: f.label });
            btn.createEl('span', { text: String(this.getCountForFilter(f.key)), cls: 'mina-seg-count' });
            btn.addEventListener('click', () => {
                if (this.feedFilter === f.key) return;
                this.feedFilter = f.key;
                feedScroll.addClass('is-switching');
                countEl.addClass('is-bumping');
                setTimeout(() => {
                    const newThoughts = this.getFilteredThoughts();
                    countEl.textContent = String(newThoughts.length);
                    countEl.className = 'mina-syn-feed-count' + (this.feedFilter === 'no-context' ? ' is-inbox' : '');
                    this.renderThoughtList(feedScroll, newThoughts, isPhone, shell);
                    feedScroll.removeClass('is-switching');
                    countEl.removeClass('is-bumping');
                    segBar.querySelectorAll('.mina-seg-btn').forEach(b => {
                        (b as HTMLElement).classList.toggle('is-active', (b as HTMLElement).dataset.filter === this.feedFilter);
                    });
                }, 80);
            });
        }

        this.renderThoughtList(feedScroll, filteredThoughts, isPhone, shell);
    }

    private renderThoughtList(container: HTMLElement, thoughts: ThoughtEntry[], isPhone: boolean, shell: HTMLElement) {
        container.empty();
        if (thoughts.length === 0) {
            const empty = container.createEl('div', { cls: 'mina-syn-feed-empty' });
            empty.createEl('span', { text: this.getEmptyIcon(), cls: 'mina-syn-feed-empty-icon' });
            empty.createEl('span', { text: this.getEmptyText(), cls: 'mina-syn-feed-empty-text' });
            return;
        }
        for (const thought of thoughts) {
            this.renderFeedCard(container, thought, isPhone, shell);
        }
    }

    private renderFeedCard(container: HTMLElement, thought: ThoughtEntry, isPhone: boolean, shell: HTMLElement) {
        const card = container.createEl('div', {
            cls: `mina-syn-card${thought.synthesized ? ' is-processed' : ''}`,
            attr: (!isPhone && !thought.synthesized) ? { draggable: 'true' } : {}
        });

        const cardHdr = card.createEl('div', { cls: 'mina-syn-card-hdr' });
        cardHdr.createEl('span', { text: moment(thought.lastThreadUpdate).fromNow(), cls: 'mina-syn-card-time' });

        if (thought.context && thought.context.length > 0) {
            const chipsEl = cardHdr.createEl('div', { cls: 'mina-syn-card-ctx-chips' });
            thought.context.slice(0, 2).forEach(ctx => {
                chipsEl.createEl('span', { text: `#${ctx}`, cls: 'mina-chip mina-chip--ctx' });
            });
            if (thought.context.length > 2) {
                chipsEl.createEl('span', { text: `+${thought.context.length - 2}`, cls: 'mina-chip' });
            }
        }

        cardHdr.createEl('span', { text: '✓', cls: 'mina-syn-card-done-badge' });
        card.createEl('div', { text: thought.title, cls: 'mina-syn-card-title' });

        const bodyWrap = card.createEl('div', { cls: 'mina-syn-card-body-wrap' });
        const bodyEl = bodyWrap.createEl('div', { cls: 'mina-syn-card-body' });

        MarkdownRenderer.render(this.app, thought.body || '', bodyEl, thought.filePath, this.view).then(() => {
            requestAnimationFrame(() => {
                if (bodyEl.scrollHeight > 300) {
                    bodyWrap.dataset.long = 'true';
                    bodyWrap.dataset.expanded = 'false';
                    const expandBtn = bodyWrap.createEl('button', { cls: 'mina-syn-card-expand-btn' });
                    setIcon(expandBtn, 'chevron-down');
                    expandBtn.createEl('span', { text: 'Read more', cls: 'mina-syn-card-expand-label' });
                    expandBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isExp = bodyWrap.dataset.expanded === 'true';
                        bodyWrap.dataset.expanded = isExp ? 'false' : 'true';
                        const lbl = expandBtn.querySelector('.mina-syn-card-expand-label') as HTMLElement;
                        if (lbl) lbl.textContent = isExp ? 'Read more' : 'Collapse';
                    });
                }
            });
        });

        if (!thought.synthesized) {
            const actions = card.createEl('div', { cls: 'mina-syn-card-actions' });

            const assignBtn = actions.createEl('button', { cls: 'mina-syn-card-btn mina-syn-card-btn--assign' });
            setIcon(assignBtn, 'tag');
            assignBtn.createEl('span', { text: 'Assign' });
            assignBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isPhone) {
                    this.openContextSheet(shell, thought);
                } else if (this.activeCtx) {
                    const merged = Array.from(new Set([...(thought.context || []), this.activeCtx]));
                    this.doAssign(thought, merged, false);
                } else {
                    new Notice('Select a context pill in the canvas first.');
                }
            });

            const processBtn = actions.createEl('button', { cls: 'mina-syn-card-btn mina-syn-card-btn--process' });
            setIcon(processBtn, 'check');
            processBtn.createEl('span', { text: 'Done' });
            processBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.vault.markAsSynthesized(thought.filePath);
                new Notice('Marked as synthesized.');
                this.view.renderView();
            });
        }

        if (!isPhone && !thought.synthesized) {
            card.addEventListener('dragstart', (e) => {
                if (e.dataTransfer) {
                    e.dataTransfer.setData('application/mina-thought', JSON.stringify({ filePath: thought.filePath }));
                    card.addClass('is-dragging');
                }
            });
            card.addEventListener('dragend', () => card.removeClass('is-dragging'));
        }
    }

    private renderCanvasPane(canvas: HTMLElement, isPhone: boolean) {
        const ctxBar = canvas.createEl('div', { cls: 'mina-syn-ctx-bar' });
        const pillsRow = ctxBar.createEl('div', { cls: 'mina-syn-ctx-pills' });

        const canvasBody = canvas.createEl('div', { cls: 'mina-syn-canvas-body' });

        const switchCtx = (ctx: string | null) => {
            this.activeCtx = ctx;
            canvasBody.addClass('is-switching');
            setTimeout(() => {
                this.renderCanvasBody(canvasBody);
                canvasBody.removeClass('is-switching');
                pillsRow.querySelectorAll('.mina-syn-ctx-pill').forEach(p => {
                    const el = p as HTMLElement;
                    const active = this.activeCtx === null ? el.dataset.ctx === '__all__' : el.dataset.ctx === this.activeCtx;
                    el.classList.toggle('is-active', active);
                });
            }, 80);
        };

        const allPill = pillsRow.createEl('button', {
            cls: `mina-syn-ctx-pill${this.activeCtx === null ? ' is-active' : ''}`,
            text: 'All',
            attr: { 'data-ctx': '__all__' }
        });
        allPill.addEventListener('click', () => switchCtx(null));

        const counts = this.getContextCounts();
        for (const ctx of (this.settings.contexts || [])) {
            const pill = pillsRow.createEl('button', {
                cls: `mina-syn-ctx-pill${this.activeCtx === ctx ? ' is-active' : ''}`,
                attr: { 'data-ctx': ctx }
            });
            pill.createEl('span', { text: `#${ctx}` });
            if (counts[ctx]) {
                pill.createEl('span', { text: String(counts[ctx]), cls: 'mina-syn-ctx-pill-count' });
            }
            pill.addEventListener('click', () => switchCtx(ctx));
        }

        const addPill = pillsRow.createEl('button', { cls: 'mina-syn-ctx-pill mina-syn-ctx-pill--add', text: '+ Context' });
        addPill.addEventListener('click', async () => {
            const name = prompt('New context name (letters, numbers, hyphens only):');
            if (!name) return;
            const clean = name.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
            if (!clean) return;
            if (!this.settings.contexts.includes(clean)) {
                this.settings.contexts.push(clean);
                await this.plugin.saveSettings();
            }
            this.activeCtx = clean;
            this.view.renderView();
        });

        this.renderCanvasBody(canvasBody);

        if (!isPhone) {
            canvas.addEventListener('dragover', (e) => {
                e.preventDefault();
                canvasBody.addClass('is-drag-over');
            });
            canvas.addEventListener('dragleave', (e) => {
                const related = e.relatedTarget as Node | null;
                if (!related || !canvas.contains(related)) {
                    canvasBody.removeClass('is-drag-over');
                }
            });
            canvas.addEventListener('drop', async (e) => {
                e.preventDefault();
                canvasBody.removeClass('is-drag-over');
                const jsonData = e.dataTransfer?.getData('application/mina-thought');
                if (!jsonData) return;
                let parsed: { filePath?: string };
                try { parsed = JSON.parse(jsonData); } catch { return; }
                if (!parsed.filePath) return;
                if (!this.activeCtx) { new Notice('Select a context pill first.'); return; }
                const thought = Array.from(this.index.thoughtIndex.values()).find(t => t.filePath === parsed.filePath);
                if (!thought) return;
                const merged = Array.from(new Set([...(thought.context || []), this.activeCtx]));
                await this.doAssign(thought, merged, false);
            });
        }
    }

    private renderCanvasBody(canvasBody: HTMLElement) {
        canvasBody.empty();

        // Drop zone overlay (always present for CSS targeting)
        const dropZone = canvasBody.createEl('div', { cls: 'mina-syn-canvas-drop-zone' });
        if (this.activeCtx) {
            dropZone.innerHTML = `Drop to assign <strong>#${this.activeCtx}</strong>`;
        }

        if (!this.activeCtx) {
            const empty = canvasBody.createEl('div', { cls: 'mina-syn-canvas-empty' });
            empty.createEl('span', { text: '◎', cls: 'mina-syn-canvas-empty-icon' });
            empty.createEl('span', { text: 'Select a Context', cls: 'mina-syn-canvas-empty-title' });
            empty.createEl('span', { text: 'Choose a context above to see mapped thoughts, or drag a thought from the feed onto a context pill.', cls: 'mina-syn-canvas-empty-sub' });
            return;
        }

        const mappedThoughts = Array.from(this.index.thoughtIndex.values())
            .filter(t => t.context && t.context.includes(this.activeCtx!))
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        const ctxHdr = canvasBody.createEl('div', { cls: 'mina-syn-canvas-ctx-hdr' });
        ctxHdr.createEl('span', { text: 'CONTEXT', cls: 'mina-syn-canvas-ctx-label' });
        ctxHdr.createEl('span', { text: `#${this.activeCtx}`, cls: 'mina-syn-canvas-ctx-name' });
        ctxHdr.createEl('span', { text: `${mappedThoughts.length} thought${mappedThoughts.length !== 1 ? 's' : ''}`, cls: 'mina-syn-canvas-ctx-count' });

        if (mappedThoughts.length === 0) {
            const empty = canvasBody.createEl('div', { cls: 'mina-syn-canvas-empty' });
            empty.createEl('span', { text: '◎', cls: 'mina-syn-canvas-empty-icon' });
            empty.createEl('span', { text: 'No thoughts yet', cls: 'mina-syn-canvas-empty-title' });
            empty.createEl('span', { text: `Drag thoughts from the feed or use the Assign button to add to #${this.activeCtx}`, cls: 'mina-syn-canvas-empty-sub' });
            return;
        }

        const list = canvasBody.createEl('div', { cls: 'mina-syn-canvas-list' });
        for (const thought of mappedThoughts) {
            const canvasCard = list.createEl('div', { cls: 'mina-syn-canvas-card' });
            const cardHdr = canvasCard.createEl('div', { cls: 'mina-syn-canvas-card-hdr' });
            cardHdr.createEl('span', { text: moment(thought.lastThreadUpdate).fromNow(), cls: 'mina-syn-canvas-card-time' });
            if (thought.synthesized) {
                cardHdr.createEl('span', { text: 'synthesized', cls: 'mina-syn-canvas-card-status' });
            }
            canvasCard.createEl('div', { text: thought.title, cls: 'mina-syn-canvas-card-title' });
            const preview = (thought.body || '').substring(0, 120) + ((thought.body || '').length > 120 ? '…' : '');
            canvasCard.createEl('div', { text: preview, cls: 'mina-syn-canvas-card-preview' });

            const removeBtn = canvasCard.createEl('button', { cls: 'mina-syn-canvas-card-remove', title: 'Remove from context' });
            setIcon(removeBtn, 'x');
            removeBtn.addEventListener('click', async () => {
                await this.vault.removeContext(thought.filePath, this.activeCtx!);
                this.view.renderView();
            });
        }
    }

    private renderPhoneNav(shell: HTMLElement, feed: HTMLElement, canvas: HTMLElement) {
        const nav = shell.createEl('div', { cls: 'mina-syn-phone-nav' });

        const feedBtn = nav.createEl('button', { cls: `mina-syn-phone-nav-btn${this.phonePane === 'feed' ? ' is-active' : ''}` });
        setIcon(feedBtn, 'inbox');
        feedBtn.createEl('span', { text: 'Feed' });
        const noCtxCount = this.getCountForFilter('no-context');
        if (noCtxCount > 0) {
            feedBtn.createEl('span', { text: String(noCtxCount), cls: 'mina-syn-phone-nav-count' });
        }
        feedBtn.addEventListener('click', () => {
            this.phonePane = 'feed';
            feed.removeClass('is-hidden'); canvas.addClass('is-hidden');
            feedBtn.addClass('is-active'); canvasBtn.removeClass('is-active');
        });

        const canvasBtn = nav.createEl('button', { cls: `mina-syn-phone-nav-btn${this.phonePane === 'canvas' ? ' is-active' : ''}` });
        setIcon(canvasBtn, 'layout-panel-right');
        canvasBtn.createEl('span', { text: 'Canvas' });
        canvasBtn.addEventListener('click', () => {
            this.phonePane = 'canvas';
            canvas.removeClass('is-hidden'); feed.addClass('is-hidden');
            canvasBtn.addClass('is-active'); feedBtn.removeClass('is-active');
        });
    }

    private renderContextSheet(shell: HTMLElement) {
        const sheet = shell.createEl('div', { cls: 'mina-syn-ctx-sheet' });
        const backdrop = sheet.createEl('div', { cls: 'mina-syn-ctx-sheet-backdrop' });
        const panel = sheet.createEl('div', { cls: 'mina-syn-ctx-sheet-panel' });

        panel.createEl('div', { cls: 'mina-syn-ctx-sheet-handle' });

        const sheetHdr = panel.createEl('div', { cls: 'mina-syn-ctx-sheet-hdr' });
        sheetHdr.createEl('span', { text: 'ASSIGN CONTEXT', cls: 'mina-syn-ctx-sheet-title' });
        const closeBtn = sheetHdr.createEl('button', { cls: 'mina-syn-ctx-sheet-close' });
        setIcon(closeBtn, 'x');

        const thoughtTitleEl = panel.createEl('div', { cls: 'mina-syn-ctx-sheet-thought-title' });
        const pillsGrid = panel.createEl('div', { cls: 'mina-syn-ctx-sheet-pills' });

        const alsoProcessLabel = panel.createEl('label', { cls: 'mina-syn-ctx-sheet-also-process' });
        const alsoProcessCheck = alsoProcessLabel.createEl('input', { type: 'checkbox', attr: { checked: 'true' } });
        alsoProcessLabel.createEl('span', { text: 'Also mark as synthesized' });

        const confirmBtn = panel.createEl('button', { cls: 'mina-syn-ctx-sheet-confirm mina-btn-primary', text: 'Apply' });

        const closeSheet = () => { sheet.removeClass('is-open'); this.pendingAssignThought = null; };
        backdrop.addEventListener('click', closeSheet);
        closeBtn.addEventListener('click', closeSheet);

        confirmBtn.addEventListener('click', async () => {
            if (!this.pendingAssignThought) return;
            const selected: string[] = [];
            pillsGrid.querySelectorAll('.mina-syn-ctx-sheet-pill.is-active').forEach(p => {
                const ctx = (p as HTMLElement).dataset.ctx;
                if (ctx) selected.push(ctx);
            });
            await this.doAssign(this.pendingAssignThought, selected, alsoProcessCheck.checked, true);
            closeSheet();
        });

        // Store refs on element for openContextSheet
        (sheet as any)._thoughtTitleEl = thoughtTitleEl;
        (sheet as any)._pillsGrid = pillsGrid;
    }

    private openContextSheet(shell: HTMLElement, thought: ThoughtEntry) {
        this.pendingAssignThought = thought;
        const sheet = shell.querySelector('.mina-syn-ctx-sheet') as HTMLElement;
        if (!sheet) return;

        const thoughtTitleEl = (sheet as any)._thoughtTitleEl as HTMLElement;
        const pillsGrid = (sheet as any)._pillsGrid as HTMLElement;

        thoughtTitleEl.textContent = `"${thought.title.substring(0, 60)}"`;
        pillsGrid.empty();

        for (const ctx of (this.settings.contexts || [])) {
            const pill = pillsGrid.createEl('button', {
                cls: `mina-syn-ctx-sheet-pill${(thought.context || []).includes(ctx) ? ' is-active' : ''}`,
                text: `#${ctx}`,
                attr: { 'data-ctx': ctx }
            });
            pill.addEventListener('click', () => pill.classList.toggle('is-active'));
        }

        sheet.addClass('is-open');
    }

    private async doAssign(thought: ThoughtEntry, contexts: string[], markSynthesized: boolean, replace = false) {
        if (contexts.length > 0) {
            await this.vault.assignContext(thought.filePath, contexts, replace);
        }
        if (markSynthesized) {
            await this.vault.markAsSynthesized(thought.filePath);
        }
        new Notice(markSynthesized ? 'Context assigned & synthesized.' : 'Context assigned.');
        this.view.renderView();
    }

    private getFilteredThoughts(): ThoughtEntry[] {
        const all = Array.from(this.index.thoughtIndex.values())
            .filter(t => !t.project)
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
        switch (this.feedFilter) {
            case 'no-context':   return all.filter(t => (!t.context || t.context.length === 0) && !t.synthesized);
            case 'with-context': return all.filter(t => t.context && t.context.length > 0 && !t.synthesized);
            case 'processed':    return all.filter(t => t.synthesized === true);
        }
    }

    private getCountForFilter(filter: 'no-context' | 'with-context' | 'processed'): number {
        const all = Array.from(this.index.thoughtIndex.values()).filter(t => !t.project);
        switch (filter) {
            case 'no-context':   return all.filter(t => (!t.context || t.context.length === 0) && !t.synthesized).length;
            case 'with-context': return all.filter(t => t.context && t.context.length > 0 && !t.synthesized).length;
            case 'processed':    return all.filter(t => t.synthesized === true).length;
        }
    }

    private getContextCounts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const t of this.index.thoughtIndex.values()) {
            for (const ctx of (t.context || [])) {
                counts[ctx] = (counts[ctx] || 0) + 1;
            }
        }
        return counts;
    }

    private getEmptyIcon(): string {
        switch (this.feedFilter) {
            case 'no-context':   return '🌊';
            case 'with-context': return '📋';
            case 'processed':    return '✅';
        }
    }

    private getEmptyText(): string {
        switch (this.feedFilter) {
            case 'no-context':   return 'Inbox clear. All thoughts have been mapped.';
            case 'with-context': return 'No mapped thoughts yet. Assign contexts from the inbox.';
            case 'processed':    return 'No synthesized thoughts yet.';
        }
    }
}
