import { App, Modal, Platform, Notice, moment } from 'obsidian';
import MinaPlugin from '../main';
import { isTablet, attachMediaPasteHandler, attachInlineTriggers } from '../utils';

export class JournalEntryModal extends Modal {
    private plugin: MinaPlugin;
    private mode: 'new' | 'edit';
    private initialText: string;
    private filePath: string | null;
    private onSave: (text: string, contexts: string[]) => Promise<void>;
    private contexts: string[] = [];
    private _isMobileSheet = false;

    constructor(
        app: App,
        plugin: MinaPlugin,
        mode: 'new' | 'edit',
        initialText: string,
        filePath: string | null,
        onSave: (text: string, contexts: string[]) => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.mode = mode;
        this.initialText = initialText.replace(/<br>/g, '\n');
        this.filePath = filePath;
        this.onSave = onSave;
        this.contexts = [];
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this._isMobileSheet = Platform.isMobile && !isTablet();

        if (this._isMobileSheet) {
            this._renderMobileSheet(contentEl, modalEl);
        } else if (Platform.isMobile && isTablet()) {
            this._renderCard(contentEl, modalEl, 'tablet');
        } else {
            this._renderCard(contentEl, modalEl, 'desktop');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this._isMobileSheet) {
            document.body.removeClass('mina-journal-sheet-active');
        }
    }

    // ── MOBILE BOTTOM SHEET ────────────────────────────────────────────────
    private _renderMobileSheet(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('mina-journal-modal');
        modalEl.addClass('mina-jm-sheet');
        document.body.addClass('mina-journal-sheet-active');

        modalEl.style.setProperty('border-radius', '20px 20px 0 0', 'important');
        modalEl.style.setProperty('overflow', 'hidden', 'important');
        contentEl.style.setProperty('padding', '0', 'important');

        // Handle pill
        const handle = contentEl.createDiv({ cls: 'mina-jm-handle-wrap' });
        handle.createDiv({ cls: 'mina-jm-handle-pill' });

        // Title bar
        const titleBar = contentEl.createDiv({ cls: 'mina-jm-title-bar' });
        titleBar.createSpan({ cls: 'mina-jm-title-text', text: '✍️ Journal' });
        const now = moment();
        titleBar.createSpan({
            cls: 'mina-jm-title-date',
            text: now.format('ddd, MMM D · HH:mm')
        });

        // Textarea
        const textArea = contentEl.createEl('textarea', {
            cls: 'mina-jm-textarea mina-jm-textarea--mobile',
            attr: { placeholder: 'Write your entry…' }
        }) as HTMLTextAreaElement;
        textArea.value = this.initialText;

        // Context chips (scrollable, above toolbar)
        const chipRow = contentEl.createDiv({ cls: 'mina-jm-chip-row' });
        const renderChips = () => {
            chipRow.empty();
            const visible = this.contexts.filter(c => c !== 'journal');
            for (const ctx of visible) {
                const chip = chipRow.createEl('span', { cls: 'mina-jm-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createSpan({ text: '×', cls: 'mina-jm-chip-x' });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.contexts = this.contexts.filter(c => c !== ctx);
                    renderChips();
                });
            }
            if (visible.length === 0) {
                chipRow.createSpan({ text: '# inline to add tags', cls: 'mina-jm-chip-hint' });
            }
        };
        renderChips();

        // Hidden file input
        const fileInput = contentEl.createEl('input', {
            attr: { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' }
        }) as HTMLInputElement;
        fileInput.addEventListener('change', () => this._handleFileInput(fileInput, textArea, null));

        // Bottom toolbar
        const toolbar = contentEl.createDiv({ cls: 'mina-jm-toolbar mina-jm-toolbar--mobile' });
        const toolbarLeft = toolbar.createDiv({ cls: 'mina-jm-toolbar-left' });
        const attachBtn = toolbarLeft.createEl('button', { cls: 'mina-jm-attach-btn', text: '📎 Image' });
        attachBtn.addEventListener('click', () => fileInput.click());

        const toolbarRight = toolbar.createDiv({ cls: 'mina-jm-toolbar-right' });
        const cancelBtn = toolbarRight.createEl('button', { cls: 'mina-jm-cancel-btn', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());
        const saveBtn = toolbarRight.createEl('button', {
            cls: 'mina-jm-save-btn',
            text: this.mode === 'new' ? 'Save' : 'Update'
        }) as HTMLButtonElement;

        const refreshSave = () => {
            const empty = !textArea.value.trim();
            saveBtn.disabled = empty;
            saveBtn.toggleClass('is-disabled', empty);
        };
        textArea.addEventListener('input', refreshSave);
        refreshSave();

        const handleSave = async () => {
            const text = textArea.value.trim();
            if (!text) return;
            const ctxs = [...this.contexts];
            if (!ctxs.includes('journal')) ctxs.push('journal');
            await this.onSave(text, ctxs);
            this.close();
        };
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        attachMediaPasteHandler(this.app, textArea, () =>
            this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments'
        );
        attachInlineTriggers(
            this.app, textArea,
            () => {},
            (tag: string) => { if (!this.contexts.includes(tag)) { this.contexts.push(tag); renderChips(); } },
            () => this.plugin.settings.contexts ?? []
        );

        this._initSwipeToDismiss(modalEl, handle);

        setTimeout(() => {
            textArea.focus();
            textArea.setSelectionRange(textArea.value.length, textArea.value.length);
        }, 80);
    }

    // ── TABLET / DESKTOP CARD ─────────────────────────────────────────────
    private _renderCard(contentEl: HTMLElement, modalEl: HTMLElement, variant: 'tablet' | 'desktop') {
        modalEl.addClass('mina-journal-modal');
        modalEl.addClass('mina-jm-card');
        modalEl.addClass(variant === 'tablet' ? 'mina-jm-card--tablet' : 'mina-jm-card--desktop');

        modalEl.style.setProperty('padding', '0', 'important');
        contentEl.style.setProperty('padding', '0', 'important');

        // ── Header
        const header = contentEl.createDiv({ cls: 'mina-jm-card-header' });
        const headerLeft = header.createDiv({ cls: 'mina-jm-header-left' });
        headerLeft.createSpan({
            cls: 'mina-jm-header-title',
            text: this.mode === 'new' ? '✍️ New Entry' : '✍️ Edit Entry'
        });
        headerLeft.createSpan({
            cls: 'mina-jm-header-date',
            text: moment().format(variant === 'desktop' ? 'dddd, MMMM D' : 'ddd, MMM D')
        });
        // ── Body
        const body = contentEl.createDiv({
            cls: 'mina-jm-card-body' + (variant === 'desktop' ? ' mina-jm-card-body--desktop' : '')
        });

        // Main writing zone
        const writeZone = body.createDiv({ cls: 'mina-jm-write-zone' });
        const textArea = writeZone.createEl('textarea', {
            cls: `mina-jm-textarea mina-jm-textarea--${variant}`,
            attr: { placeholder: 'Write your entry…' }
        }) as HTMLTextAreaElement;
        textArea.value = this.initialText;

        // Desktop: image preview strip (right column, hidden until image added)
        let previewStrip: HTMLElement | null = null;
        if (variant === 'desktop') {
            previewStrip = body.createDiv({ cls: 'mina-jm-preview-strip' });
            previewStrip.style.display = 'none';
        }

        // ── Chip row (below textarea, above toolbar)
        const chipRow = contentEl.createDiv({ cls: 'mina-jm-chip-row mina-jm-chip-row--card' });
        const renderChips = () => {
            chipRow.empty();
            const visible = this.contexts.filter(c => c !== 'journal');
            for (const ctx of visible) {
                const chip = chipRow.createEl('span', { cls: 'mina-jm-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createSpan({ text: '×', cls: 'mina-jm-chip-x' });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.contexts = this.contexts.filter(c => c !== ctx);
                    renderChips();
                });
            }
            if (visible.length === 0) {
                chipRow.createSpan({ text: '# inline to add tags', cls: 'mina-jm-chip-hint' });
            }
        };
        renderChips();

        // ── Hidden file input
        const fileInput = contentEl.createEl('input', {
            attr: { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' }
        }) as HTMLInputElement;
        fileInput.addEventListener('change', () => this._handleFileInput(fileInput, textArea, previewStrip));

        // ── Footer toolbar
        const toolbar = contentEl.createDiv({ cls: 'mina-jm-toolbar mina-jm-toolbar--card' });
        const toolbarLeft = toolbar.createDiv({ cls: 'mina-jm-toolbar-left' });
        const attachBtn = toolbarLeft.createEl('button', {
            cls: 'mina-jm-attach-btn',
            text: '📎',
            attr: { 'aria-label': 'Attach image' }
        });
        if (variant === 'desktop') {
            toolbarLeft.createSpan({ cls: 'mina-jm-attach-hint', text: 'Paste or drag images' });
        }
        attachBtn.addEventListener('click', () => fileInput.click());

        const toolbarRight = toolbar.createDiv({ cls: 'mina-jm-toolbar-right' });
        const cancelBtn = toolbarRight.createEl('button', { cls: 'mina-jm-cancel-btn', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());
        const saveBtn = toolbarRight.createEl('button', {
            cls: 'mina-jm-save-btn',
            text: this.mode === 'new' ? 'Save Entry' : 'Update Entry'
        }) as HTMLButtonElement;
        if (variant === 'desktop') {
            saveBtn.setAttribute('title', '⌘↵ / Ctrl+↵');
        }

        const refreshSave = () => {
            const empty = !textArea.value.trim();
            saveBtn.disabled = empty;
            saveBtn.toggleClass('is-disabled', empty);
        };
        textArea.addEventListener('input', refreshSave);
        refreshSave();

        const handleSave = async () => {
            const text = textArea.value.trim();
            if (!text) return;
            const ctxs = [...this.contexts];
            if (!ctxs.includes('journal')) ctxs.push('journal');
            await this.onSave(text, ctxs);
            this.close();
        };
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        // Drag-drop visual indicator
        modalEl.addEventListener('dragover', (e) => { e.preventDefault(); modalEl.addClass('is-dragover'); });
        modalEl.addEventListener('dragleave', () => modalEl.removeClass('is-dragover'));
        modalEl.addEventListener('drop', () => modalEl.removeClass('is-dragover'));

        attachMediaPasteHandler(this.app, textArea, () =>
            this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments'
        );
        attachInlineTriggers(
            this.app, textArea,
            () => {},
            (tag: string) => { if (!this.contexts.includes(tag)) { this.contexts.push(tag); renderChips(); } },
            () => this.plugin.settings.contexts ?? []
        );

        setTimeout(() => {
            textArea.focus();
            textArea.setSelectionRange(textArea.value.length, textArea.value.length);
        }, 80);
    }

    // ── FILE INPUT HANDLER ────────────────────────────────────────────────
    private async _handleFileInput(
        fileInput: HTMLInputElement,
        textArea: HTMLTextAreaElement,
        previewStrip: HTMLElement | null
    ) {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        for (let i = 0; i < files.length; i++) {
            await this._saveAndInsert(files[i], textArea, previewStrip);
        }
        fileInput.value = '';
    }

    private async _saveAndInsert(
        file: File,
        textArea: HTMLTextAreaElement,
        previewStrip: HTMLElement | null
    ) {
        try {
            const folder = (this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments').trim();
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }
            const mimeToExt: Record<string, string> = {
                'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf',
            };
            const ext = mimeToExt[file.type] || (file.name.includes('.') ? file.name.split('.').pop()! : 'bin');
            const ts = moment().format('YYYYMMDD_HHmmss');
            const rand = Math.random().toString(36).substring(2, 6);
            const filename = `journal_${ts}_${rand}.${ext}`;
            const buffer = await file.arrayBuffer();
            await this.app.vault.createBinary(`${folder}/${filename}`, buffer);
            const link = `![[${filename}]]`;

            // Insert at cursor
            const start = textArea.selectionStart ?? textArea.value.length;
            const end = textArea.selectionEnd ?? start;
            textArea.value = textArea.value.substring(0, start) + link + textArea.value.substring(end);
            textArea.setSelectionRange(start + link.length, start + link.length);
            textArea.dispatchEvent(new Event('input'));

            // Desktop image preview
            if (previewStrip && file.type.startsWith('image/')) {
                previewStrip.style.display = 'flex';
                const img = previewStrip.createEl('img', { cls: 'mina-jm-preview-img' });
                const objUrl = URL.createObjectURL(file);
                img.src = objUrl;
                img.onload = () => URL.revokeObjectURL(objUrl);
            }

            new Notice('📎 Image attached', 1200);
        } catch (e) {
            console.error('[MINA] Journal attachment save failed:', e);
            new Notice('Failed to attach image.', 2000);
        }
    }

    // ── SWIPE TO DISMISS (mobile, handle only) ────────────────────────────
    private _initSwipeToDismiss(modalEl: HTMLElement, handleWrap: HTMLElement) {
        const DISMISS_THRESHOLD = 120, VELOCITY_THRESHOLD = 800, RESISTANCE = 280;
        let startY = 0, currentY = 0, isDragging = false, lastY = 0, lastTime = 0, velocity = 0;

        const onTouchStart = (e: TouchEvent) => {
            if (!handleWrap.contains(e.target as Node)) return;
            startY = e.touches[0].clientY;
            lastY = startY; lastTime = Date.now();
            isDragging = true;
            modalEl.style.transition = 'none';
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            if (delta < 0) return;
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            const resisted = delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.style.transition = 'transform 0.25s ease';
                modalEl.style.transform = 'translateY(100%)';
                setTimeout(() => this.close(), 250);
            } else {
                modalEl.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                modalEl.style.transform = 'translateY(0)';
            }
            currentY = 0;
        };

        modalEl.addEventListener('touchstart', onTouchStart, { passive: true });
        modalEl.addEventListener('touchmove', onTouchMove, { passive: true });
        modalEl.addEventListener('touchend', onTouchEnd, { passive: true });
    }
}
