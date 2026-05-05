import { ItemView, WorkspaceLeaf, Platform, moment, setIcon, Notice } from 'obsidian';
import type MinaPlugin from '../main';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import type { ThoughtEntry } from '../types';

export class MobileHubView extends ItemView {
    plugin: MinaPlugin;
    _capturePending: number = 0;
    private _closed = false;
    private _viewportHandler: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_MOBILE_HUB; }
    getDisplayText(): string { return 'MINA'; }
    getIcon(): string { return 'smartphone'; }

    async onOpen() {
        this._closed = false;
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';

        // Keyboard avoidance: shrink the root's content area when soft keyboard
        // opens so the flex layout keeps the bar visible above the keyboard.
        // Uses padding-bottom + box-sizing:border-box on root — safer than
        // resizing contentEl.style.height which can exceed parent bounds.
        if (Platform.isMobile && window.visualViewport) {
            const vp = window.visualViewport;
            this._viewportHandler = () => {
                const kbOffset = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
                this.contentEl.style.setProperty('--mina-keyboard-offset', `${kbOffset}px`);
                // Inline !important so it overrides our CSS `padding:0 !important`
                this.contentEl.style.setProperty(
                    'padding-bottom',
                    kbOffset > 0 ? `${kbOffset}px` : '0',
                    'important'
                );
            };
            vp.addEventListener('resize', this._viewportHandler);
            vp.addEventListener('scroll', this._viewportHandler);
        }

        this.renderView();
    }

    async onClose() {
        this._closed = true;
        if (window.visualViewport && this._viewportHandler) {
            window.visualViewport.removeEventListener('resize', this._viewportHandler);
            window.visualViewport.removeEventListener('scroll', this._viewportHandler);
            this._viewportHandler = null;
        }
    }

    renderView() {
        if (this._capturePending > 0) return;

        const root = this.contentEl;
        root.empty();
        root.addClass('mina-mh-root');
        // Inline !important beats Obsidian's .view-content mobile padding (incl. safe-area-inset-top)
        root.style.setProperty('padding', '0', 'important');

        if (!Platform.isMobile) {
            root.createEl('div', {
                text: '⊕ MINA Mobile Hub is designed for mobile devices.',
                cls: 'mina-mh-desktop-notice'
            });
            return;
        }

        const wrap = root.createEl('div', { cls: 'mina-mh-wrap' });

        // Scrollable feed — takes all available height above bar
        const feedScroll = wrap.createEl('div', { cls: 'mina-mh-feed-scroll' });
        this.renderWeekFeed(feedScroll);

        // Bottom capture bar — flex footer (NOT position:fixed, Obsidian-safe)
        const bar = wrap.createEl('div', { cls: 'mina-mh-bar' });
        this.renderBottomBar(bar);
    }

    // ── 7-Day Feed ─────────────────────────────────────────────────────────────
    private renderWeekFeed(parent: HTMLElement) {
        const cutoff = moment().subtract(6, 'days').startOf('day');
        const today     = moment().format('YYYY-MM-DD');
        const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');

        const thoughts = Array.from(this.plugin.index.thoughtIndex.values())
            .filter(t => t.day && moment(t.day, 'YYYY-MM-DD', true).isSameOrAfter(cutoff))
            .sort((a, b) => (b.created || '').localeCompare(a.created || ''));

        if (thoughts.length === 0) {
            parent.createEl('div', {
                text: 'Nothing in the last 7 days — your mind has been clear.',
                cls: 'mina-mh-feed-empty'
            });
            return;
        }

        // Group by day — Map insertion order preserves newest-first sort
        const byDay = new Map<string, ThoughtEntry[]>();
        for (const t of thoughts) {
            const key = t.day!;
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key)!.push(t);
        }

        for (const [day, dayThoughts] of byDay) {
            const group = parent.createEl('div', { cls: 'mina-mh-day-group' });

            const sep = group.createEl('div', { cls: 'mina-mh-day-sep' });
            let label: string;
            if (day === today)          label = 'Today';
            else if (day === yesterday) label = 'Yesterday';
            else                        label = moment(day, 'YYYY-MM-DD').format('ddd, MMM D').toUpperCase();
            sep.createEl('span', { text: label, cls: 'mina-mh-day-sep-label' });

            const dayFeed = group.createEl('div', { cls: 'mina-mh-day-feed' });
            for (const t of dayThoughts) {
                this.renderFeedItem(dayFeed, t);
            }
        }
    }

    // ── Feed Item ──────────────────────────────────────────────────────────────
    private renderFeedItem(parent: HTMLElement, t: ThoughtEntry) {
        const item = parent.createEl('div', { cls: 'mina-mh-feed-item' });

        // Swipe reveal backgrounds — absolute, behind card
        const delBg = item.createEl('div', { cls: 'mina-mh-swipe-bg-delete' });
        const delIcon = delBg.createDiv({ cls: 'mina-mh-swipe-icon' });
        setIcon(delIcon, 'trash-2');

        const editBg = item.createEl('div', { cls: 'mina-mh-swipe-bg-edit' });
        const editIcon = editBg.createDiv({ cls: 'mina-mh-swipe-icon' });
        setIcon(editIcon, 'pencil');

        // Content card — the translateX target
        const card = item.createEl('div', { cls: 'mina-mh-feed-card' });

        const ts = t.created
            ? moment(t.created, 'YYYY-MM-DD HH:mm:ss').format('HH:mm')
            : '';
        if (ts) card.createEl('span', { text: ts, cls: 'mina-mh-feed-time' });

        card.createEl('p', { text: t.body || t.title || '', cls: 'mina-mh-feed-text' });

        if (t.context && t.context.length > 0) {
            const ctxWrap = card.createEl('div', { cls: 'mina-mh-feed-ctx' });
            for (const ctx of t.context) {
                ctxWrap.createEl('span', { text: `#${ctx}`, cls: 'mina-mh-feed-ctx-chip' });
            }
        }

        this.attachSwipeGesture(item, card, t);
    }

    // ── Bottom Capture Bar ─────────────────────────────────────────────────────
    private renderBottomBar(bar: HTMLElement) {
        // ── Collapsed pill ──────────────────────────────────────────────────────
        const pill = bar.createEl('div', { cls: 'mina-mh-bar-pill' });
        pill.createEl('span', { text: "What's on your mind…", cls: 'mina-mh-bar-hint-text' });
        const composeBtn = pill.createEl('button', {
            cls: 'mina-mh-bar-compose-btn',
            attr: { 'aria-label': 'Compose thought' }
        });
        const composeIcon = composeBtn.createDiv({ cls: 'mina-mh-bar-compose-icon' });
        setIcon(composeIcon, 'pencil');

        // ── Expanded card ───────────────────────────────────────────────────────
        const card = bar.createEl('div', { cls: 'mina-mh-bar-card' });

        const textarea = card.createEl('textarea', {
            cls: 'mina-mh-capture-textarea',
            attr: { placeholder: "What's on your mind…", rows: '3' }
        }) as HTMLTextAreaElement;

        const syncHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 130)}px`;
        };

        let captureFocused = false;

        const expand = () => {
            bar.addClass('mina-mh-bar--expanded');
            if (!captureFocused) { captureFocused = true; this._capturePending++; }
            requestAnimationFrame(() => { textarea.focus(); syncHeight(); });
        };

        const collapse = () => {
            bar.removeClass('mina-mh-bar--expanded');
            textarea.value = '';
            textarea.style.height = '';
            contexts = [];
            chipRow.empty();
            if (captureFocused) { captureFocused = false; this._capturePending = Math.max(0, this._capturePending - 1); }
        };

        pill.addEventListener('click', expand);

        textarea.addEventListener('blur', () => {
            // Delay so tapping send/chips doesn't prematurely collapse
            if (captureFocused && textarea.value.trim().length === 0) {
                setTimeout(() => {
                    if (textarea.value.trim().length === 0 && bar.hasClass('mina-mh-bar--expanded')) {
                        collapse();
                    }
                }, 150);
            }
        });

        textarea.addEventListener('input', syncHeight);
        textarea.addEventListener('keyup', syncHeight);

        const chipRow = card.createEl('div', { cls: 'mina-mh-chip-row' });
        let contexts: string[] = [];

        const addChip = (tag: string) => {
            if (contexts.includes(tag)) return;
            contexts.push(tag);
            const chip = chipRow.createEl('span', { cls: 'mina-mh-chip', text: `#${tag}` });
            chip.addEventListener('click', () => { contexts = contexts.filter(c => c !== tag); chip.remove(); });
        };

        attachInlineTriggers(
            this.app, textarea, () => {},
            (tag) => addChip(tag),
            () => (this.plugin.settings.contexts ?? []).filter(c => !contexts.includes(c)),
            this.plugin.settings.peopleFolder
        );
        attachMediaPasteHandler(this.app, textarea, () => this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments');

        const saveThought = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            const ctxSnapshot = [...contexts];
            collapse();
            try {
                await this.plugin.vault.createThoughtFile(raw, ctxSnapshot);
                new Notice('✦ Thought saved', 1200);
            } catch {
                new Notice('Error saving thought', 2500);
            }
        };

        const footer = card.createEl('div', { cls: 'mina-mh-capture-footer' });

        const hint = footer.createEl('div', { cls: 'mina-mh-capture-hint' });
        hint.createEl('span', { cls: 'mina-mh-hint-badge', text: '#' });
        hint.createEl('span', { cls: 'mina-mh-hint-label', text: 'context' });

        const sendBtn = footer.createEl('button', { cls: 'mina-mh-send-btn' });
        const sendIcon = sendBtn.createDiv({ cls: 'mina-mh-send-icon' });
        setIcon(sendIcon, 'arrow-up');
        sendBtn.addEventListener('click', saveThought);

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveThought(); }
            if (e.key === 'Escape') { collapse(); }
        });
    }

    // ── Swipe Gesture ──────────────────────────────────────────────────────────
    private attachSwipeGesture(item: HTMLElement, card: HTMLElement, t: ThoughtEntry) {
        const THRESHOLD = 60;   // px — minimum drag to trigger action
        const REVEAL    = 80;   // px — locked reveal position
        const MAX_DRIFT = 16;   // px — vertical drift to cancel swipe

        let startX = 0, startY = 0, currentX = 0;
        let active = false, locked = false;

        const getSwipeIcon = (side: 'delete' | 'edit') =>
            item.querySelector(`.mina-mh-swipe-bg-${side} .mina-mh-swipe-icon`) as HTMLElement | null;

        const reset = () => {
            active = false;
            locked = false;
            item.removeClass('mina-mh-feed-item--dragging');
            item.removeClass('mina-mh-feed-item--swipe-delete');
            item.removeClass('mina-mh-feed-item--swipe-edit');
            card.style.transform = '';
            const di = getSwipeIcon('delete');
            const ei = getSwipeIcon('edit');
            if (di) di.style.opacity = '0';
            if (ei) ei.style.opacity = '0';
        };

        card.addEventListener('touchstart', (e: TouchEvent) => {
            if (locked) return;
            startX   = e.touches[0].clientX;
            startY   = e.touches[0].clientY;
            currentX = 0;
            active   = true;
            item.addClass('mina-mh-feed-item--dragging');
            // Stop propagation so Obsidian's document-level sidebar swipe
            // gesture doesn't also fire when the user swipes a feed card
            e.stopPropagation();
        }, { passive: true });

        card.addEventListener('touchmove', (e: TouchEvent) => {
            if (!active) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            // Cancel and let native scroll take over if vertical intent detected
            if (Math.abs(dy) > MAX_DRIFT && Math.abs(dy) > Math.abs(dx)) {
                reset();
                return;
            }

            e.preventDefault(); // Block vertical scroll during confirmed horizontal swipe
            e.stopPropagation();
            currentX = dx;

            // Rubber-band effect beyond REVEAL distance
            const clampedX = currentX > 0
                ? Math.min(currentX, REVEAL + (currentX - REVEAL) * 0.2)
                : Math.max(currentX, -REVEAL + (currentX + REVEAL) * 0.2);

            card.style.transform = `translateX(${clampedX}px)`;

            // Fade swipe icon proportionally to drag progress
            const progress = Math.min(Math.abs(currentX) / THRESHOLD, 1);
            if (currentX < 0) {
                const icon = getSwipeIcon('delete');
                if (icon) icon.style.opacity = String(progress);
            } else if (currentX > 0) {
                const icon = getSwipeIcon('edit');
                if (icon) icon.style.opacity = String(progress);
            }
        }, { passive: false });

        card.addEventListener('touchend', (e: TouchEvent) => {
            if (!active) return;
            e.stopPropagation();
            item.removeClass('mina-mh-feed-item--dragging');
            active = false;

            if (currentX < -THRESHOLD) {
                // ── Swipe LEFT → DELETE ────────────────────────────────────────
                locked = true;
                item.addClass('mina-mh-feed-item--swipe-delete');

                const confirmDelete = async () => {
                    item.style.transition = 'opacity 0.2s ease, max-height 0.25s ease';
                    item.style.overflow   = 'hidden';
                    item.style.opacity    = '0';
                    item.style.maxHeight  = item.offsetHeight + 'px';
                    requestAnimationFrame(() => { item.style.maxHeight = '0'; });
                    try {
                        await this.plugin.vault.deleteFile(t.filePath, 'thoughts');
                        setTimeout(() => item.remove(), 260);
                        new Notice('✦ Thought deleted', 1200);
                    } catch {
                        new Notice('Error deleting thought', 2500);
                        item.style.transition = '';
                        item.style.opacity    = '';
                        item.style.maxHeight  = '';
                        reset();
                    }
                };

                // Tap red bg to confirm; auto-snap after 2.5s
                const snapBackTimer = setTimeout(() => reset(), 2500);
                item.querySelector('.mina-mh-swipe-bg-delete')!
                    .addEventListener('click', () => {
                        clearTimeout(snapBackTimer);
                        confirmDelete();
                    }, { once: true });

            } else if (currentX > THRESHOLD) {
                // ── Swipe RIGHT → EDIT ─────────────────────────────────────────
                locked = true;
                item.addClass('mina-mh-feed-item--swipe-edit');

                const snapBackTimer = setTimeout(() => reset(), 2500);
                item.querySelector('.mina-mh-swipe-bg-edit')!
                    .addEventListener('click', () => {
                        clearTimeout(snapBackTimer);
                        reset();
                        this.makeThoughtEditable(item, card, t);
                    }, { once: true });

            } else {
                reset();
            }
        }, { passive: true });

        // Tap card while locked → snap back
        card.addEventListener('click', () => { if (locked) reset(); });
    }

    // ── Edit Thought ───────────────────────────────────────────────────────────
    private makeThoughtEditable(item: HTMLElement, card: HTMLElement, t: ThoughtEntry) {
        if (item.hasClass('is-editing')) return;
        item.addClass('is-editing');
        this._capturePending++;
        card.style.display = 'none';

        let editContexts = [...(t.context || [])];
        const form = item.createEl('div', { cls: 'mina-edit-form mina-edit-form--mobile' });

        const chipRow = form.createEl('div', { cls: 'mina-edit-chip-row' });
        const renderChips = () => {
            chipRow.empty();
            for (const ctx of editContexts) {
                const chip = chipRow.createEl('span', { cls: 'mina-mh-chip', text: `#${ctx}` });
                chip.addEventListener('click', () => { editContexts = editContexts.filter(c => c !== ctx); renderChips(); });
            }
        };
        renderChips();

        const textarea = form.createEl('textarea', {
            cls: 'mina-edit-textarea mina-edit-textarea--mobile',
            attr: { rows: '3' }
        }) as HTMLTextAreaElement;
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

        const actions = form.createEl('div', { cls: 'mina-edit-actions' });
        const saveBtn  = actions.createEl('button', { cls: 'mina-edit-save-btn',   text: 'Save'   }) as HTMLButtonElement;
        const cancelBtn = actions.createEl('button', { cls: 'mina-edit-cancel-btn', text: 'Cancel' });

        const exit = (restore: boolean) => {
            item.removeClass('is-editing');
            form.remove();
            this._capturePending = Math.max(0, this._capturePending - 1);
            if (restore) card.style.display = '';
        };

        const save = async () => {
            const newText = textarea.value.trim();
            if (!newText) return;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
            try {
                await this.plugin.vault.editThought(t.filePath, newText, [...editContexts]);
                exit(false);
                new Notice('✦ Thought updated', 1200);
            } catch {
                new Notice('Error updating thought', 2500);
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
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
