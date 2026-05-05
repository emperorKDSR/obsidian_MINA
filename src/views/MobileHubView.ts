import { ItemView, WorkspaceLeaf, Platform, moment, setIcon, Notice, ViewStateResult } from 'obsidian';
import type MinaPlugin from '../main';
import { VIEW_TYPE_MOBILE_HUB } from '../constants';
import { attachInlineTriggers, attachMediaPasteHandler } from '../utils';

export class MobileHubView extends ItemView {
    plugin: MinaPlugin;
    _capturePending: number = 0;
    private _closed = false;

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

        if (!Platform.isMobile) {
            root.createEl('div', {
                text: '⊕ MINA Mobile Hub is designed for mobile devices.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 80px; padding: 24px;' }
            });
            return;
        }

        const wrap = root.createEl('div', { cls: 'mina-mh-wrap' });
        this.renderTopBar(wrap);

        const body = wrap.createEl('div', { cls: 'mina-mh-body' });
        this.renderCapture(body);
        this.renderTodayFeed(body);
    }

    // ── Top Bar ───────────────────────────────────────────────────────────────
    private renderTopBar(parent: HTMLElement) {
        const bar = parent.createEl('div', { cls: 'mina-mh-topbar' });
        bar.createEl('span', { text: 'MINA', cls: 'mina-mh-topbar-logo' });
        bar.createEl('span', { text: moment().format('ddd, MMM D').toUpperCase(), cls: 'mina-mh-topbar-date' });
        const time = bar.createEl('span', { text: moment().format('HH:mm'), cls: 'mina-mh-topbar-time' });
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

        textarea.addEventListener('focus', () => { this._capturePending = 1; syncHeight(); });
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
            chip.addEventListener('click', () => { contexts = contexts.filter(c => c !== tag); chip.remove(); });
        };

        attachInlineTriggers(this.app, textarea, () => {}, (tag) => addChip(tag), () => contexts, this.plugin.settings.peopleFolder);
        attachMediaPasteHandler(this.app, textarea, () => this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments');

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

        const footer = section.createEl('div', { cls: 'mina-mh-capture-footer' });
        const sendBtn = footer.createEl('button', { cls: 'mina-mh-send-btn' });
        const sendIcon = sendBtn.createDiv({ cls: 'mina-mh-send-icon' });
        setIcon(sendIcon, 'lucide-arrow-up');
        sendBtn.addEventListener('click', saveThought);

        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveThought(); }
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

    // ── Today's Thoughts Feed ────────────────────────────────────────────────
    private renderTodayFeed(parent: HTMLElement) {
        const container = parent.createEl('div', { cls: 'mina-mh-feed-container' });
        container.createEl('div', { text: 'TODAY', cls: 'mina-mh-feed-label' });
        const feed = container.createEl('div', { cls: 'mina-mh-feed' });

        const today = moment().format('YYYY-MM-DD');
        const thoughts = Array.from(this.plugin.index.thoughtIndex.values())
            .filter(t => t.day === today)
            .sort((a, b) => (b.created || '').localeCompare(a.created || ''));

        if (thoughts.length === 0) {
            feed.createEl('div', { text: 'Nothing captured yet — your mind is clear.', cls: 'mina-mh-feed-empty' });
            return;
        }

        for (const t of thoughts) {
            const item = feed.createEl('div', { cls: 'mina-mh-feed-item' });
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
}
