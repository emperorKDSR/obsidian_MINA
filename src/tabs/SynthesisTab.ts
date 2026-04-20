import { moment, Platform, MarkdownRenderer, Notice, setIcon, Modal } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry } from '../types';
import { BaseTab } from './BaseTab';
import { isTablet } from '../utils';

// ── Add-Context Modal ─────────────────────────────────────────────────────────
class AddContextModal extends Modal {
    private onConfirm: (name: string) => void;

    constructor(app: any, onConfirm: (name: string) => void) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mina-modal-standard');

        const hdr = contentEl.createEl('div', { cls: 'mina-modal-header' });
        hdr.createEl('h2', {
            text: 'New Context',
            attr: { style: 'margin:0; font-size:1.1em; font-weight:700;' },
        });

        const body = contentEl.createEl('div', {
            attr: { style: 'padding:20px 24px;' },
        });
        body.createEl('p', {
            text: 'Letters, numbers, and hyphens only.',
            attr: { style: 'margin:0 0 12px; font-size:0.85em; color:var(--text-muted);' },
        });

        const input = body.createEl('input', {
            type: 'text',
            attr: {
                placeholder: 'e.g. work, health, ideas',
                style: [
                    'width:100%; padding:8px 12px; border-radius:8px;',
                    'border:1px solid var(--background-modifier-border);',
                    'background:var(--background-secondary); color:var(--text-normal);',
                    'font-size:0.9em; box-sizing:border-box; outline:none;',
                ].join(' '),
            },
        });

        const footer = contentEl.createEl('div', { cls: 'mina-modal-footer' });
        const cancelBtn = footer.createEl('button', {
            text: 'Cancel',
            cls: 'mina-btn-secondary',
        });
        const confirmBtn = footer.createEl('button', {
            text: 'Add',
            cls: 'mina-btn-primary',
        });

        const doConfirm = () => {
            const clean = input.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().trim();
            if (!clean) { new Notice('Invalid context name.'); return; }
            this.onConfirm(clean);
            this.close();
        };

        cancelBtn.addEventListener('click', () => this.close());
        confirmBtn.addEventListener('click', doConfirm);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConfirm(); });
        // Auto-focus
        setTimeout(() => input.focus(), 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ── SynthesisTab V2.1 ─────────────────────────────────────────────────────────
export class SynthesisTab extends BaseTab {
    /**
     * State stored on the class.
     * Both fields delegate to existing view.ts fields so they survive
     * view.renderView() calls (which always instantiate a fresh tab instance).
     */
    // Multi-select: array of primed contexts, backed by view state for re-render survival
    private get primedContexts(): string[] { return this.view.activeSynthesisContexts; }
    private set primedContexts(v: string[]) { this.view.activeSynthesisContexts = v; }
    // Convenience: first primed context (for backward-compat echo text)
    private get primedContext(): string | null { return this.primedContexts[0] ?? null; }

    private get feedFilter(): 'no-context' | 'with-context' | 'processed' {
        return this.view.synthesisFeedFilter;
    }
    private set feedFilter(v: 'no-context' | 'with-context' | 'processed') {
        this.view.synthesisFeedFilter = v;
    }

    /** Phone: pending thought for the bottom-sheet assign flow. */
    private pendingAssignThought: ThoughtEntry | null = null;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement): void {
        this.renderSynthesisMode(container);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Main shell
    // ═══════════════════════════════════════════════════════════════════════════

    private renderSynthesisMode(container: HTMLElement): void {
        container.empty();
        const isPhone = Platform.isMobile && !isTablet();

        const shell = container.createEl('div', {
            cls: `mina-syn-shell${isPhone ? ' is-phone' : ''}`,
        });

        if (!isPhone) {
            // ── Desktop: left context panel ───────────────────────────────────
            const ctxPanel = shell.createEl('div', { cls: 'mina-syn-ctx-panel' });
            this.renderContextPanel(ctxPanel, shell);
        }

        // ── Feed (right 2/3 on desktop, full width on phone) ─────────────────
        const feed = shell.createEl('div', { cls: 'mina-syn-feed' });
        this.renderFeedPane(feed, shell, isPhone);

        if (isPhone) {
            this.renderPhoneNav(shell);
            this.renderContextSheet(shell);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Context Panel (left 1/3)
    // ═══════════════════════════════════════════════════════════════════════════

    private renderContextPanel(panel: HTMLElement, shell: HTMLElement): void {
        // ── Header ────────────────────────────────────────────────────────────
        const hdr = panel.createEl('div', { cls: 'mina-syn-ctx-hdr' });

        const iconEl = hdr.createEl('span', {
            attr: { style: 'font-size:0.85em; opacity:0.55; flex-shrink:0; line-height:1;' },
        });
        iconEl.textContent = '◎';

        hdr.createEl('span', { text: 'CONTEXTS', cls: 'mina-syn-ctx-hdr-label' });

        hdr.createEl('span', {
            text: String((this.settings.contexts || []).length),
            cls: 'mina-syn-ctx-hdr-count',
        });

        const hdrAddBtn = hdr.createEl('button', {
            cls: 'mina-syn-ctx-hdr-add',
            attr: { title: 'Add context' },
        });
        setIcon(hdrAddBtn, 'plus');
        hdrAddBtn.addEventListener('click', () => this.openAddContextModal(shell));

        // ── Primer strip ──────────────────────────────────────────────────────
        const primer = panel.createEl('div', {
            cls: `mina-syn-ctx-primer${this.primedContexts.length > 0 ? ' is-primed' : ''}`,
        });
        this.buildPrimer(primer, shell);

        // ── Search input ──────────────────────────────────────────────────────
        const searchWrap = panel.createEl('div', { cls: 'mina-syn-ctx-search' });
        const searchInput = searchWrap.createEl('input', {
            type: 'text',
            cls: 'mina-syn-ctx-search-input',
            attr: { placeholder: 'Search…', spellcheck: 'false' },
        });

        // ── Context list ──────────────────────────────────────────────────────
        const list = panel.createEl('div', { cls: 'mina-syn-ctx-list' });
        this.buildContextList(list, shell);

        // Live filter
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase().trim();
            list.querySelectorAll<HTMLElement>('.mina-syn-ctx-row').forEach((row) => {
                const name = (row.dataset.ctx || '').toLowerCase();
                row.style.display = !q || name.includes(q) ? '' : 'none';
            });
        });
    }

    /**
     * Populates (or repopulates) the primer strip element in-place.
     * Safe to call on an already-rendered primer element — empties it first.
     */
    private buildPrimer(primer: HTMLElement, shell: HTMLElement): void {
        primer.empty();
        const hasAny = this.primedContexts.length > 0;
        primer.className = `mina-syn-ctx-primer${hasAny ? ' is-primed' : ''}`;

        primer.createEl('span', { text: 'PRIME:', cls: 'mina-syn-ctx-primer-label' });

        if (hasAny) {
            const pillsWrap = primer.createEl('div', { cls: 'mina-syn-ctx-primer-pills' });
            for (const ctx of this.primedContexts) {
                const pill = pillsWrap.createEl('div', { cls: 'mina-syn-ctx-primer-pill' });
                pill.createEl('div', { cls: 'mina-syn-ctx-primer-pill-dot' });
                pill.createEl('span', { text: ctx });
                const dismiss = pill.createEl('button', {
                    cls: 'mina-syn-ctx-primer-pill-dismiss',
                    attr: { title: `Deselect ${ctx}`, 'aria-label': `Deselect ${ctx}` },
                });
                dismiss.textContent = '×';
                dismiss.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.primedContexts = this.primedContexts.filter((c) => c !== ctx);
                    this.syncAllPrimingStates(shell);
                });
            }
        } else {
            primer.createEl('span', {
                text: 'None selected',
                cls: 'mina-syn-ctx-primer-placeholder',
            });
        }
    }

    /**
     * Populates (or repopulates) the context list element in-place.
     */
    private buildContextList(list: HTMLElement, shell: HTMLElement): void {
        list.empty();
        const contexts = this.settings.contexts || [];

        if (contexts.length === 0) {
            const empty = list.createEl('div', { cls: 'mina-syn-ctx-empty' });
            empty.createEl('div', { text: '◎', cls: 'mina-syn-ctx-empty-icon' });
            empty.createEl('div', { text: 'No Contexts Yet', cls: 'mina-syn-ctx-empty-title' });
            empty.createEl('div', {
                text: 'Add a context to start organising your thoughts.',
                cls: 'mina-syn-ctx-empty-sub',
            });
        } else {
            const counts = this.getContextCounts();
            // Sort alphabetically
            const sorted = [...contexts].sort((a, b) => a.localeCompare(b));
            for (const ctx of sorted) {
                const row = list.createEl('div', {
                    cls: `mina-syn-ctx-row${this.primedContexts.includes(ctx) ? ' is-selected' : ''}`,
                    attr: { 'data-ctx': ctx, tabindex: '0' },
                });
                row.createEl('div', { cls: 'mina-syn-ctx-row-dot' });
                row.createEl('span', { text: ctx, cls: 'mina-syn-ctx-row-name' });
                row.createEl('span', {
                    text: String(counts[ctx] || 0),
                    cls: 'mina-syn-ctx-row-count',
                });

                // Delete button (hover-revealed via CSS)
                const delBtn = row.createEl('button', {
                    cls: 'mina-syn-ctx-row-del',
                    attr: { title: `Remove context "${ctx}"`, 'aria-label': `Remove ${ctx}` },
                });
                setIcon(delBtn, 'trash-2');
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.removeContextFromSettings(ctx, shell);
                });

                const onSelect = () => this.handleContextRowClick(ctx, shell);
                row.addEventListener('click', onSelect);
                row.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect();
                    }
                });
            }
        }

        // ── Sticky add-context button at list bottom ───────────────────────
        const addBtn = list.createEl('button', { cls: 'mina-syn-ctx-add-btn' });
        setIcon(addBtn, 'plus-circle');
        addBtn.createEl('span', { text: 'Add context', cls: 'mina-syn-ctx-add-label' });
        addBtn.addEventListener('click', () => this.openAddContextModal(shell));
    }

    private handleContextRowClick(ctx: string, shell: HTMLElement): void {
        // Multi-select: toggle in/out of primedContexts array
        if (this.primedContexts.includes(ctx)) {
            this.primedContexts = this.primedContexts.filter((c) => c !== ctx);
        } else {
            this.primedContexts = [...this.primedContexts, ctx];
        }
        this.syncAllPrimingStates(shell);
    }

    private async removeContextFromSettings(ctx: string, shell: HTMLElement): Promise<void> {
        const idx = this.settings.contexts.indexOf(ctx);
        if (idx === -1) return;
        this.settings.contexts.splice(idx, 1);
        // Remove from primed selection if present
        this.primedContexts = this.primedContexts.filter((c) => c !== ctx);
        await this.plugin.saveSettings();
        this.view.renderView();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Feed Pane (right 2/3)
    // ═══════════════════════════════════════════════════════════════════════════

    private renderFeedPane(feed: HTMLElement, shell: HTMLElement, isPhone: boolean): void {
        const hdr = feed.createEl('div', { cls: 'mina-syn-feed-hdr' });

        // ── Top row: home icon + segmented filter ─────────────────────────────
        const hdrTop = hdr.createEl('div', { cls: 'mina-syn-feed-hdr-top' });
        this.renderHomeIcon(hdrTop);

        const segBar = hdrTop.createEl('div', { cls: 'mina-seg-bar mina-syn-toggle-bar' });
        const feedScroll = feed.createEl('div', { cls: 'mina-syn-feed-scroll' });

        const FILTERS: Array<{ key: 'no-context' | 'with-context' | 'processed'; label: string }> = [
            { key: 'no-context',   label: 'Inbox' },
            { key: 'with-context', label: 'Mapped' },
            { key: 'processed',    label: 'Done' },
        ];

        for (const f of FILTERS) {
            const btn = segBar.createEl('button', {
                cls: `mina-seg-btn${this.feedFilter === f.key ? ' is-active' : ''}`,
                attr: { 'data-filter': f.key },
            });
            btn.createEl('span', { text: f.label });
            btn.createEl('span', {
                text: String(this.getCountForFilter(f.key)),
                cls: 'mina-seg-count',
            });
            btn.addEventListener('click', () => {
                if (this.feedFilter === f.key) return;
                this.feedFilter = f.key;

                // Animate out, repopulate, animate in
                feedScroll.addClass('is-switching');
                setTimeout(() => {
                    this.buildThoughtList(feedScroll, shell, isPhone);
                    feedScroll.removeClass('is-switching');
                    // Sync filter tab states + counts
                    segBar.querySelectorAll('.mina-seg-btn').forEach((b) => {
                        const el = b as HTMLElement;
                        const key = el.dataset.filter as
                            'no-context' | 'with-context' | 'processed';
                        el.classList.toggle('is-active', key === this.feedFilter);
                        const countEl = el.querySelector('.mina-seg-count');
                        if (countEl) countEl.textContent = String(this.getCountForFilter(key));
                    });
                }, 80);
            });
        }

        // ── Context echo strip (desktop only) ────────────────────────────────
        const ctxEcho = hdr.createEl('div', {
            cls: `mina-syn-feed-ctx-echo${this.primedContext ? ' is-primed' : ''}`,
        });
        this.buildCtxEcho(ctxEcho);

        // ── Thought list ──────────────────────────────────────────────────────
        this.buildThoughtList(feedScroll, shell, isPhone);
    }

    /**
     * Populates (or repopulates) the context echo strip in-place.
     */
    private buildCtxEcho(echo: HTMLElement): void {
        echo.empty();
        const hasAny = this.primedContexts.length > 0;
        echo.className = `mina-syn-feed-ctx-echo${hasAny ? ' is-primed' : ''}`;

        if (hasAny) {
            echo.createEl('span', { text: '←', cls: 'mina-syn-feed-echo-label' });
            const pill = echo.createEl('span', { cls: 'mina-syn-feed-echo-pill' });
            const label =
                this.primedContexts.length === 1
                    ? this.primedContexts[0]
                    : `${this.primedContexts.length} contexts`;
            pill.appendText(` ${label}`);
            echo.createEl('span', {
                text: '✓ ready to assign',
                cls: 'mina-syn-feed-echo-ready',
            });
        } else {
            echo.createEl('span', {
                text: '← Select contexts to prime assignment',
                cls: 'mina-syn-feed-echo-label',
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Thought list + cards
    // ═══════════════════════════════════════════════════════════════════════════

    private buildThoughtList(
        container: HTMLElement,
        shell: HTMLElement,
        isPhone: boolean,
    ): void {
        container.empty();
        const thoughts = this.getFilteredThoughts();

        if (thoughts.length === 0) {
            const empty = container.createEl('div', { cls: 'mina-syn-feed-empty' });
            empty.createEl('span', {
                text: this.getEmptyIcon(),
                cls: 'mina-syn-feed-empty-icon',
            });
            empty.createEl('span', {
                text: this.getEmptyTitle(),
                cls: 'mina-syn-feed-empty-title',
            });
            empty.createEl('span', {
                text: this.getEmptySubtext(),
                cls: 'mina-syn-feed-empty-sub',
            });
            return;
        }

        for (const thought of thoughts) {
            this.renderFeedCard(container, thought, shell, isPhone);
        }
    }

    private renderFeedCard(
        container: HTMLElement,
        thought: ThoughtEntry,
        shell: HTMLElement,
        isPhone: boolean,
    ): void {
        const card = container.createEl('div', {
            cls: `mina-syn-card${thought.synthesized ? ' is-processed' : ''}`,
        });

        // ── Card header: timestamp + context chips ────────────────────────────
        const cardHdr = card.createEl('div', { cls: 'mina-syn-card-hdr' });
        cardHdr.createEl('span', {
            text: moment(thought.lastThreadUpdate).fromNow(),
            cls: 'mina-syn-card-time',
        });

        if (thought.context && thought.context.length > 0) {
            const chipsEl = cardHdr.createEl('div', { cls: 'mina-syn-card-ctx-chips' });
            thought.context.slice(0, 3).forEach((ctx) => {
                const chip = chipsEl.createEl('span', {
                    text: `#${ctx}`,
                    cls: 'mina-chip mina-chip--ctx',
                });
                // V2.1: clicking a chip removes that context (un-maps).
                // Full re-assign picker is V2.2 scope.
                if (!thought.synthesized) {
                    chip.style.cursor = 'pointer';
                    chip.title = `Remove #${ctx}`;
                    chip.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.vault.removeContext(thought.filePath, ctx).then(() => {
                            this.view.renderView();
                        });
                    });
                }
            });
            if (thought.context.length > 3) {
                chipsEl.createEl('span', {
                    text: `+${thought.context.length - 3}`,
                    cls: 'mina-chip',
                });
            }
        }

        // ── Body (MarkdownRenderer with expand/collapse) ──────────────────────
        const bodyWrap = card.createEl('div', { cls: 'mina-syn-card-body-wrap' });
        const bodyEl = bodyWrap.createEl('div', { cls: 'mina-syn-card-body' });

        MarkdownRenderer.render(
            this.app,
            thought.body || '',
            bodyEl,
            thought.filePath,
            this.view,
        ).then(() => {
            requestAnimationFrame(() => {
                if (bodyEl.scrollHeight > 300) {
                    bodyWrap.dataset.long = 'true';
                    bodyWrap.dataset.expanded = 'false';
                    const expandBtn = bodyWrap.createEl('button', {
                        cls: 'mina-syn-card-expand-btn',
                        text: 'Read more ↓',
                    });
                    expandBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const expanded = bodyWrap.dataset.expanded === 'true';
                        bodyWrap.dataset.expanded = expanded ? 'false' : 'true';
                        expandBtn.textContent = expanded ? 'Read more ↓' : 'Collapse ↑';
                    });
                }
            });
        });

        // ── Actions (only for non-synthesized thoughts) ───────────────────────
        if (!thought.synthesized) {
            const actions = card.createEl('div', { cls: 'mina-syn-card-actions' });

            // ── Assign button — visual state driven by primedContexts ─────────
            const assignedAll =
                this.primedContexts.length > 0 &&
                this.primedContexts.every((c) => thought.context.includes(c));

            let assignCls = 'mina-syn-card-btn mina-syn-card-btn--assign';
            if (assignedAll)                          assignCls += ' is-assigned';
            else if (this.primedContexts.length > 0) assignCls += ' is-primed';

            const assignLabel = assignedAll
                ? '✓ Assigned'
                : this.primedContexts.length === 1
                    ? `Assign to ${this.primedContexts[0]}`
                    : this.primedContexts.length > 1
                        ? `Assign to ${this.primedContexts.length} contexts`
                        : 'Assign…';

            const assignBtn = actions.createEl('button', { cls: assignCls });
            setIcon(assignBtn, 'tag');
            assignBtn.createEl('span', { text: assignLabel });
            // Store filePath for syncAllPrimingStates look-up
            assignBtn.dataset.thoughtPath = thought.filePath;

            assignBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isPhone) {
                    this.openContextSheet(shell, thought);
                } else if (this.primedContexts.length > 0) {
                    const alreadyAll = this.primedContexts.every((c) =>
                        thought.context.includes(c),
                    );
                    if (!alreadyAll) this.doAssign(thought, card, shell);
                } else {
                    // Shake the context panel to prompt selection
                    const ctxPanel = shell.querySelector(
                        '.mina-syn-ctx-panel',
                    ) as HTMLElement | null;
                    if (ctxPanel) {
                        ctxPanel.classList.add('is-attention');
                        setTimeout(() => ctxPanel.classList.remove('is-attention'), 300);
                    }
                }
            });

            // ── Mark Done button ──────────────────────────────────────────────
            const processBtn = actions.createEl('button', {
                cls: 'mina-syn-card-btn mina-syn-card-btn--process',
            });
            setIcon(processBtn, 'check');
            processBtn.createEl('span', { text: 'Done' });
            processBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.vault.markAsSynthesized(thought.filePath);
                this.exitCard(card, () => this.view.renderView());
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Assign logic
    // ═══════════════════════════════════════════════════════════════════════════

    private async doAssign(
        thought: ThoughtEntry,
        card: HTMLElement,
        shell: HTMLElement,
    ): Promise<void> {
        if (this.primedContexts.length === 0) return;
        const ctxs = [...this.primedContexts]; // capture snapshot

        // 1. Flash animation + vault write (in parallel)
        card.classList.add('is-assign-flash');
        await this.vault.assignContext(thought.filePath, ctxs, false);

        // 2. After flash duration, remove flash + start exit (if Inbox filter)
        setTimeout(() => {
            card.classList.remove('is-assign-flash');
            if (this.feedFilter === 'no-context') {
                this.exitCard(card, () => {
                    // DOM surgery: refresh counts without blowing away primedContext
                    this.refreshCountsInDOM(shell);
                });
            } else {
                // In Mapped/Done view, just refresh the whole view for correctness
                this.view.renderView();
            }
        }, 400);
    }

    /**
     * Plays exit animation on a card, then calls onComplete after it collapses.
     */
    private exitCard(card: HTMLElement, onComplete: () => void): void {
        // Record the current rendered height so max-height transition works
        card.style.maxHeight = card.offsetHeight + 'px';
        card.classList.add('is-exiting');
        setTimeout(onComplete, 420); // slightly past the 0.4s CSS transition
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Sync priming states — in-place DOM updates, NO view.renderView()
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Called every time `primedContext` changes.
     * Updates context rows, primer strip, ctx echo, and ALL assign buttons.
     */
    private syncAllPrimingStates(shell: HTMLElement): void {
        // 1. Context rows
        shell.querySelectorAll<HTMLElement>('.mina-syn-ctx-row').forEach((row) => {
            row.classList.toggle(
                'is-selected',
                this.primedContexts.includes(row.dataset.ctx || ''),
            );
        });

        // 2. Primer strip
        const primer = shell.querySelector<HTMLElement>('.mina-syn-ctx-primer');
        if (primer) this.buildPrimer(primer, shell);

        // 3. Context echo
        const echo = shell.querySelector<HTMLElement>('.mina-syn-feed-ctx-echo');
        if (echo) this.buildCtxEcho(echo);

        // 4. All assign buttons
        shell.querySelectorAll<HTMLElement>('.mina-syn-card-btn--assign').forEach((btn) => {
            const filePath = btn.dataset.thoughtPath;
            if (!filePath) return;
            const thought = Array.from(this.index.thoughtIndex.values()).find(
                (t) => t.filePath === filePath,
            );
            if (!thought) return;

            const assignedAll =
                this.primedContexts.length > 0 &&
                this.primedContexts.every((c) => thought.context.includes(c));

            btn.classList.remove('is-primed', 'is-assigned');
            if (assignedAll)                          btn.classList.add('is-assigned');
            else if (this.primedContexts.length > 0) btn.classList.add('is-primed');

            const labelEl = btn.querySelector('span');
            if (labelEl) {
                labelEl.textContent = assignedAll
                    ? '✓ Assigned'
                    : this.primedContexts.length === 1
                        ? `Assign to ${this.primedContexts[0]}`
                        : this.primedContexts.length > 1
                            ? `Assign to ${this.primedContexts.length} contexts`
                            : 'Assign…';
            }
        });
    }

    /**
     * Refreshes context row counts and header count badge in-place.
     * Used after a card is assigned without a full view.renderView().
     */
    private refreshCountsInDOM(shell: HTMLElement): void {
        const counts = this.getContextCounts();

        shell.querySelectorAll<HTMLElement>('.mina-syn-ctx-row').forEach((row) => {
            const ctx = row.dataset.ctx;
            if (!ctx) return;
            const countEl = row.querySelector<HTMLElement>('.mina-syn-ctx-row-count');
            if (countEl) countEl.textContent = String(counts[ctx] || 0);
        });

        const hdrCount = shell.querySelector<HTMLElement>('.mina-syn-ctx-hdr-count');
        if (hdrCount) hdrCount.textContent = String((this.settings.contexts || []).length);

        // Also refresh filter tab counts
        shell.querySelectorAll<HTMLElement>('.mina-seg-btn[data-filter]').forEach((btn) => {
            const key = btn.dataset.filter as 'no-context' | 'with-context' | 'processed';
            if (!key) return;
            const countEl = btn.querySelector('.mina-seg-count');
            if (countEl) countEl.textContent = String(this.getCountForFilter(key));
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Add Context Modal
    // ═══════════════════════════════════════════════════════════════════════════

    private openAddContextModal(shell: HTMLElement): void {
        new AddContextModal(this.app, async (name: string) => {
            if (!this.settings.contexts.includes(name)) {
                this.settings.contexts.push(name);
                await this.plugin.saveSettings();
            }
            // Prime the new context and do a full re-render (list must show it)
            if (!this.primedContexts.includes(name)) {
                this.primedContexts = [...this.primedContexts, name];
            }
            this.view.renderView();
        }).open();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Phone: bottom nav + context sheet
    // ═══════════════════════════════════════════════════════════════════════════

    private renderPhoneNav(shell: HTMLElement): void {
        const nav = shell.createEl('div', { cls: 'mina-syn-phone-nav' });

        const feedBtn = nav.createEl('button', {
            cls: 'mina-syn-phone-nav-btn is-active',
        });
        setIcon(feedBtn, 'inbox');
        feedBtn.createEl('span', { text: 'Feed' });
        const inboxCount = this.getCountForFilter('no-context');
        if (inboxCount > 0) {
            feedBtn.createEl('span', {
                text: String(inboxCount),
                cls: 'mina-syn-phone-nav-count',
                attr: { style: 'font-size:0.65em; font-weight:700; color:var(--text-error);' },
            });
        }

        const ctxBtn = nav.createEl('button', { cls: 'mina-syn-phone-nav-btn' });
        setIcon(ctxBtn, 'tag');
        ctxBtn.createEl('span', { text: 'Contexts' });
        ctxBtn.addEventListener('click', () => {
            const sheet = shell.querySelector<HTMLElement>('.mina-syn-ctx-sheet');
            if (sheet) {
                this.populateContextSheet(sheet, null);
                sheet.classList.add('is-open');
            }
        });
    }

    private renderContextSheet(shell: HTMLElement): void {
        const sheet = shell.createEl('div', { cls: 'mina-syn-ctx-sheet' });
        sheet.createEl('div', { cls: 'mina-syn-ctx-sheet-handle' });

        const sheetHdr = sheet.createEl('div', {
            attr: {
                style: [
                    'display:flex; align-items:center;',
                    'justify-content:space-between; margin-bottom:12px;',
                ].join(' '),
            },
        });
        sheetHdr.createEl('span', {
            text: 'ASSIGN CONTEXT',
            attr: {
                style: [
                    'font-size:0.75em; font-weight:900;',
                    'letter-spacing:0.1em; color:var(--text-faint);',
                ].join(' '),
            },
        });
        const closeBtn = sheetHdr.createEl('button', {
            attr: { style: 'background:none; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center;' },
        });
        setIcon(closeBtn, 'x');

        const thoughtTitleEl = sheet.createEl('div', {
            attr: { style: 'font-size:0.85em; color:var(--text-muted); margin-bottom:14px; font-style:italic;' },
        });
        const pillsGrid = sheet.createEl('div', {
            attr: { style: 'display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;' },
        });

        const alsoProcessLabel = sheet.createEl('label', {
            attr: { style: 'display:flex; align-items:center; gap:8px; font-size:0.82em; color:var(--text-muted); margin-bottom:16px; cursor:pointer;' },
        });
        const alsoProcessCheck = alsoProcessLabel.createEl('input', { type: 'checkbox' });
        alsoProcessCheck.checked = true;
        alsoProcessLabel.createEl('span', { text: 'Also mark as synthesized' });

        const confirmBtn = sheet.createEl('button', {
            text: 'Apply',
            cls: 'mina-btn-primary',
            attr: { style: 'width:100%;' },
        });

        const closeSheet = () => {
            sheet.classList.remove('is-open');
            this.pendingAssignThought = null;
        };

        closeBtn.addEventListener('click', closeSheet);

        confirmBtn.addEventListener('click', async () => {
            if (!this.pendingAssignThought) return;
            const selected: string[] = [];
            pillsGrid.querySelectorAll<HTMLElement>('[data-ctx].is-active').forEach((p) => {
                if (p.dataset.ctx) selected.push(p.dataset.ctx);
            });
            if (selected.length > 0) {
                await this.vault.assignContext(
                    this.pendingAssignThought.filePath,
                    selected,
                    false,
                );
            }
            if (alsoProcessCheck.checked) {
                await this.vault.markAsSynthesized(this.pendingAssignThought.filePath);
            }
            new Notice(alsoProcessCheck.checked
                ? 'Context assigned & synthesized.'
                : 'Context assigned.',
            );
            closeSheet();
            this.view.renderView();
        });

        // Store dynamic refs for populateContextSheet
        (sheet as any)._thoughtTitleEl = thoughtTitleEl;
        (sheet as any)._pillsGrid      = pillsGrid;
    }

    private openContextSheet(shell: HTMLElement, thought: ThoughtEntry): void {
        this.pendingAssignThought = thought;
        const sheet = shell.querySelector<HTMLElement>('.mina-syn-ctx-sheet');
        if (!sheet) return;
        this.populateContextSheet(sheet, thought);
        sheet.classList.add('is-open');
    }

    private populateContextSheet(
        sheet: HTMLElement,
        thought: ThoughtEntry | null,
    ): void {
        const thoughtTitleEl = (sheet as any)._thoughtTitleEl as HTMLElement | undefined;
        const pillsGrid      = (sheet as any)._pillsGrid      as HTMLElement | undefined;
        if (!pillsGrid) return;

        const t = thought ?? this.pendingAssignThought;
        if (thoughtTitleEl) {
            thoughtTitleEl.textContent = t
                ? `"${t.title.substring(0, 60)}"`
                : 'Select contexts';
        }

        pillsGrid.empty();
        for (const ctx of (this.settings.contexts || [])) {
            const isActive = (t?.context || []).includes(ctx);
            const pill = pillsGrid.createEl('button', {
                cls: `mina-chip mina-chip--ctx${isActive ? ' is-active' : ''}`,
                text: `#${ctx}`,
                attr: {
                    'data-ctx': ctx,
                    style: 'cursor:pointer; padding:6px 12px; border:none;',
                },
            });
            pill.addEventListener('click', () => pill.classList.toggle('is-active'));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Data helpers
    // ═══════════════════════════════════════════════════════════════════════════

    private getFilteredThoughts(): ThoughtEntry[] {
        const all = Array.from(this.index.thoughtIndex.values())
            .filter((t) => !t.project)
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        switch (this.feedFilter) {
            case 'no-context':
                return all.filter((t) => (!t.context || t.context.length === 0) && !t.synthesized);
            case 'with-context':
                return all.filter((t) => t.context && t.context.length > 0 && !t.synthesized);
            case 'processed':
                return all.filter((t) => t.synthesized === true);
        }
    }

    private getCountForFilter(
        filter: 'no-context' | 'with-context' | 'processed',
    ): number {
        const all = Array.from(this.index.thoughtIndex.values()).filter((t) => !t.project);
        switch (filter) {
            case 'no-context':
                return all.filter((t) => (!t.context || t.context.length === 0) && !t.synthesized).length;
            case 'with-context':
                return all.filter((t) => t.context && t.context.length > 0 && !t.synthesized).length;
            case 'processed':
                return all.filter((t) => t.synthesized === true).length;
        }
    }

    private getContextCounts(): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const t of this.index.thoughtIndex.values()) {
            for (const ctx of t.context || []) {
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

    private getEmptyTitle(): string {
        switch (this.feedFilter) {
            case 'no-context':   return 'Inbox Clear';
            case 'with-context': return 'Nothing Mapped Yet';
            case 'processed':    return 'Nothing Done Yet';
        }
    }

    private getEmptySubtext(): string {
        switch (this.feedFilter) {
            case 'no-context':   return 'All thoughts have been mapped. Well done.';
            case 'with-context': return 'Assign contexts from Inbox to see thoughts here.';
            case 'processed':    return 'Mark thoughts as Done to move them here.';
        }
    }
}