import { App, Modal, Platform, Notice, moment } from 'obsidian';
import MinaPlugin from '../main';
import { isTablet, parseNaturalDate, parseContextString } from '../utils';
import { FileSuggestModal } from './FileSuggestModal';
import { ContextSuggestModal } from './ContextSuggestModal';

type CaptureMode = 'thought' | 'task';

export class EditEntryModal extends Modal {
    initialText: string;
    initialContexts: string[];
    initialDueDate: string | null;
    isTask: boolean;
    plugin: MinaPlugin;
    onSave: (newText: string, newContexts: string, newDueDate: string | null, project: string | null) => void;
    customTitle?: string;
    stayOpen: boolean;

    currentProject: string | null = null;
    classificationTimeout: ReturnType<typeof setTimeout> | null = null;

    private currentMode: CaptureMode;
    private currentDueDate: string | null;
    private _viewportCleanup: (() => void) | null = null;
    private _isMobileSheet = false;

    constructor(
        app: App,
        plugin: MinaPlugin,
        initialText: string,
        initialContext: string,
        initialDueDate: string | null,
        isTask: boolean,
        onSave: (newText: string, newContexts: string, newDueDate: string | null, project: string | null) => void,
        customTitle?: string,
        stayOpen: boolean = false
    ) {
        super(app);
        this.plugin = plugin;
        this.initialText = initialText.replace(/<br>/g, '\n');
        this.initialContexts = initialContext ? parseContextString(initialContext) : [];
        this.initialDueDate = initialDueDate;
        this.currentDueDate = initialDueDate;
        this.isTask = isTask;
        this.currentMode = isTask ? 'task' : 'thought';
        this.onSave = onSave;
        this.customTitle = customTitle;
        this.stayOpen = stayOpen;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this._isMobileSheet = Platform.isMobile && !isTablet();
        if (this._isMobileSheet) {
            this._renderMobileFloat(contentEl, modalEl);
        } else {
            this._renderDesktop(contentEl, modalEl);
        }
    }

    /** ── MOBILE FLOATING CARD ────────────────────────── */
    private _renderMobileFloat(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('mina-mobile-float');
        document.body.addClass('mina-mobile-active');

        // Force sharp corners — override Obsidian's inline/theme border-radius at highest priority
        modalEl.style.setProperty('border-radius', '0', 'important');
        modalEl.style.setProperty('overflow', 'visible', 'important');
        contentEl.style.setProperty('border-radius', '0', 'important');
        contentEl.style.setProperty('overflow', 'visible', 'important');

        // Canvas — scrollable textarea (flex: 1)
        const canvas = contentEl.createDiv({ cls: 'mina-float-canvas' });
        canvas.style.setProperty('border-radius', '0', 'important');
        const textArea = canvas.createEl('textarea', {
            text: this.initialText,
            cls: 'mina-float-textarea',
            attr: { placeholder: this.currentMode === 'task' ? 'Execute intent…' : 'Capture thought…' }
        });

        // Dock — compact bottom strip
        const dock = contentEl.createDiv({ cls: 'mina-float-dock' });

        // 1. Mode toggle
        const toggleBar = dock.createDiv({ cls: 'mina-seg-bar mina-float-toggle' });
        const thoughtBtn = toggleBar.createEl('button', {
            text: '✦ THOUGHT',
            cls: `mina-seg-btn${this.currentMode === 'thought' ? ' is-active' : ''}`
        });
        const taskBtn = toggleBar.createEl('button', {
            text: '✓ TASK',
            cls: `mina-seg-btn${this.currentMode === 'task' ? ' is-active' : ''}`
        });

        // 2. Date zone (collapsible)
        const dateZone = dock.createDiv({ cls: `mina-mobile-date-zone${this.currentMode === 'task' ? ' is-visible' : ''}` });
        const { setDueDate } = this._buildDateStrip(dateZone);
        if (this.currentDueDate) setDueDate(this.currentDueDate);

        // 3. Chip strip
        const chipStrip = dock.createDiv({ cls: 'mina-mobile-chip-strip' });
        const tagPickerContainer = dock.createDiv({ cls: 'mina-float-tag-picker' });

        const renderChips = () => {
            chipStrip.empty();
            this.initialContexts.forEach(ctx => {
                const chip = chipStrip.createEl('span', { cls: 'mina-mobile-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createSpan({ text: '×', cls: 'mina-mobile-chip-x' });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.initialContexts = this.initialContexts.filter(c => c !== ctx);
                    renderChips();
                });
            });
            const addBtn = chipStrip.createEl('button', { text: '+', cls: 'mina-mobile-chip-add' });
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleInlineTagPicker(tagPickerContainer, addBtn, this.plugin.settings.contexts, () => this.initialContexts, (ctx) => {
                    if (!this.initialContexts.includes(ctx)) { this.initialContexts.push(ctx); renderChips(); }
                });
            });
        };
        renderChips();

        // 4. Action row
        const actionRow = dock.createDiv({ cls: 'mina-float-action-row' });
        const cancelBtn = actionRow.createEl('button', { text: 'Cancel', cls: 'mina-float-cancel-btn' });
        cancelBtn.addEventListener('click', () => this.close());
        const saveLabel = () => this.stayOpen ? 'ADD' : (this.currentMode === 'task' ? 'ADD TASK' : 'CAPTURE');
        const saveBtn = actionRow.createEl('button', { text: saveLabel(), cls: 'mina-float-save-btn' }) as HTMLButtonElement;

        // Mode switch
        const switchMode = (mode: CaptureMode) => {
            this.currentMode = mode;
            textArea.placeholder = mode === 'task' ? 'Execute intent…' : 'Capture thought…';
            thoughtBtn.toggleClass('is-active', mode === 'thought');
            taskBtn.toggleClass('is-active', mode === 'task');
            dateZone.toggleClass('is-visible', mode === 'task');
            if (!this.stayOpen) saveBtn.textContent = saveLabel();
        };
        thoughtBtn.addEventListener('click', () => switchMode('thought'));
        taskBtn.addEventListener('click', () => switchMode('task'));

        // Save disabled when empty
        const refreshSave = () => {
            const empty = !textArea.value.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };
        textArea.addEventListener('input', refreshSave);
        refreshSave();

        const handleSave = () => {
            if (!textArea.value.trim()) return;
            const text = textArea.value.replace(/\n/g, '<br>');
            const contexts = this.initialContexts.map(c => `#${c}`).join(' ');
            const due = this.currentMode === 'task' ? (this.currentDueDate ?? null) : null;
            this.onSave(text, contexts, due, this.currentProject);
            if (this.stayOpen) { textArea.value = ''; textArea.focus(); new Notice('Capture saved.'); }
            else this.close();
        };
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        this._attachInlineTriggers(textArea, setDueDate);
        this._attachAutoClassify(textArea);

        // Short delay — just enough for modal animation to start
        setTimeout(() => { textArea.focus(); textArea.setSelectionRange(textArea.value.length, textArea.value.length); }, 80);
    }

    /** ── INLINE TAG PICKER (mobile, inside dock) ─────── */
    private _toggleInlineTagPicker(
        container: HTMLElement,
        triggerBtn: HTMLElement,
        allContexts: string[],
        getSelected: () => string[],
        onSelect: (ctx: string) => void
    ) {
        // Toggle: close if already open
        if (container.hasClass('is-open')) {
            container.removeClass('is-open');
            container.empty();
            return;
        }
        container.addClass('is-open');
        container.empty();

        // Search input
        const searchRow = container.createDiv({ cls: 'mina-tag-picker-search-row' });
        const searchInput = searchRow.createEl('input', {
            type: 'text',
            cls: 'mina-tag-picker-search',
            attr: { placeholder: 'Filter tags…' }
        }) as HTMLInputElement;

        // Tag grid
        const grid = container.createDiv({ cls: 'mina-tag-picker-grid' });

        const renderOptions = (query: string) => {
            grid.empty();
            const q = query.toLowerCase().trim();
            const selected = getSelected();
            const filtered = allContexts
                .filter(ctx => !selected.includes(ctx) && ctx.toLowerCase().includes(q))
                .sort((a, b) => a.localeCompare(b));

            filtered.forEach(ctx => {
                const tag = grid.createEl('button', { text: `#${ctx}`, cls: 'mina-tag-picker-tag' });
                tag.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onSelect(ctx);
                    container.removeClass('is-open');
                    container.empty();
                });
            });

            // "Create new" option if query doesn't match exactly
            if (q && !allContexts.some(ctx => ctx.toLowerCase() === q)) {
                const createBtn = grid.createEl('button', { cls: 'mina-tag-picker-create' });
                createBtn.createSpan({ text: '＋ ' });
                createBtn.createSpan({ text: `Create "${query.trim()}"` });
                createBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onSelect(query.trim());
                    container.removeClass('is-open');
                    container.empty();
                });
            }

            if (!filtered.length && !q) {
                grid.createEl('span', { text: 'No tags configured.', cls: 'mina-tag-picker-empty' });
            }
        };

        searchInput.addEventListener('input', () => renderOptions(searchInput.value));
        renderOptions('');
        setTimeout(() => searchInput.focus(), 60);
    }

    /** ── DATE SHORTCUT STRIP ─────────────────────────── */
    private _buildDateStrip(container: HTMLElement): { setDueDate: (d: string) => void } {
        const strip = container.createDiv({ cls: 'mina-date-strip' });
        const display = container.createDiv({ cls: 'mina-date-display' });
        display.style.display = 'none';

        const updateDisplay = (dateStr: string | null) => {
            display.empty();
            if (!dateStr) { display.style.display = 'none'; return; }
            display.style.display = 'flex';
            display.createSpan({ text: '📅', cls: 'mina-date-display-icon' });
            const lbl = display.createSpan({ text: moment(dateStr).format('dddd, MMM D'), cls: 'mina-date-display-label' });
            const clr = display.createSpan({ text: '×', cls: 'mina-date-display-clear' });
            lbl.addEventListener('click', () => showNLPInput());
            clr.addEventListener('click', () => {
                this.currentDueDate = null;
                updateDisplay(null);
                btnEls.forEach(b => b.removeClass('is-selected'));
            });
        };

        const setDueDate = (d: string) => { this.currentDueDate = d; updateDisplay(d); };

        // Compute contextual shortcuts
        const today = moment();
        const dow = today.day(); // 0=Sun … 6=Sat
        const daysToFriday = dow <= 4 ? (5 - dow) : (12 - dow); // days until next Fri
        const rawShortcuts = [
            { label: 'TODAY', days: 0 },
            { label: 'TMRW', days: 1 },
            { label: daysToFriday > 2 ? 'THIS FRI' : '+7D', days: daysToFriday > 2 ? daysToFriday : 7 },
            { label: '+7D', days: 7 },
            { label: '+30D', days: 30 },
        ];
        // Deduplicate by days count
        const shortcuts = rawShortcuts.filter((s, i, a) => a.findIndex(x => x.days === s.days) === i);

        const btnEls: HTMLButtonElement[] = [];
        shortcuts.forEach(s => {
            const btn = strip.createEl('button', { text: s.label, cls: 'mina-date-shortcut-btn' }) as HTMLButtonElement;
            btnEls.push(btn);
            btn.addEventListener('click', () => {
                const d = moment().add(s.days, 'days').format('YYYY-MM-DD');
                setDueDate(d);
                btnEls.forEach(b => b.removeClass('is-selected'));
                btn.addClass('is-selected');
            });
        });

        // PICK ▾ → inline NLP input
        const pickBtn = strip.createEl('button', { text: 'PICK ▾', cls: 'mina-date-shortcut-btn mina-date-pick-btn' });
        pickBtn.addEventListener('click', () => showNLPInput());

        const showNLPInput = () => {
            container.querySelector('.mina-date-nlp-wrap')?.remove();
            const wrap = container.createDiv({ cls: 'mina-date-nlp-wrap' });
            const input = wrap.createEl('input', {
                type: 'text',
                cls: 'mina-date-nlp-input',
                attr: { placeholder: 'next tuesday, in 3 weeks…' }
            }) as HTMLInputElement;
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const parsed = parseNaturalDate(input.value.trim());
                    if (parsed) { setDueDate(parsed); wrap.remove(); }
                    else input.style.setProperty('border-color', 'var(--color-red)');
                }
                if (e.key === 'Escape') wrap.remove();
            });
        };

        return { setDueDate };
    }

    /** ── INLINE TRIGGERS (@date, [[link, + checklist) ── */
    private _attachInlineTriggers(textArea: HTMLTextAreaElement, setDueDate: (d: string) => void) {
        textArea.addEventListener('input', () => {
            const val = textArea.value;
            const pos = textArea.selectionStart ?? val.length;
            const before = val.substring(0, pos);

            // @word<space> → NLP date
            const atMatch = before.match(/@(\S+)\s$/);
            if (atMatch) {
                const parsed = parseNaturalDate(atMatch[1]);
                if (parsed) {
                    const removeFrom = pos - atMatch[0].length;
                    const wikiDate = `[[${parsed}]] `;
                    textArea.value = val.substring(0, removeFrom) + wikiDate + val.substring(pos);
                    textArea.setSelectionRange(removeFrom + wikiDate.length, removeFrom + wikiDate.length);
                    setDueDate(parsed);
                    return;
                }
            }

            // [[ → wiki-link insertion
            if (before.endsWith('[[')) {
                textArea.value = val.substring(0, pos - 2) + val.substring(pos);
                const insertAt = pos - 2;
                textArea.setSelectionRange(insertAt, insertAt);
                new FileSuggestModal(this.app, (file) => {
                    const link = `[[${file.basename}]]`;
                    const cur = textArea.value;
                    const curPos = textArea.selectionStart ?? insertAt;
                    textArea.value = cur.substring(0, curPos) + link + cur.substring(curPos);
                    textArea.setSelectionRange(curPos + link.length, curPos + link.length);
                    textArea.focus();
                }).open();
                return;
            }

            // + at line start → checklist item
            if (before.endsWith('\n+') || before === '+') {
                const insertAt = pos - 1;
                textArea.value = val.substring(0, insertAt) + '- [ ] ' + val.substring(pos);
                textArea.setSelectionRange(insertAt + 6, insertAt + 6);
            }
        });
    }

    /** ── SWIPE TO DISMISS ────────────────────────────── */
    private _initSwipeToDismiss(modalEl: HTMLElement, handleEl: HTMLElement, canvasEl: HTMLElement) {
        const RESISTANCE = 280, DISMISS_THRESHOLD = 120, VELOCITY_THRESHOLD = 800;
        let startY = 0, currentY = 0, isDragging = false, lastY = 0, lastTime = 0, velocity = 0;

        const onTouchStart = (e: TouchEvent) => {
            const fromHandle = handleEl.contains(e.target as Node);
            const fromCanvas = canvasEl.contains(e.target as Node) && canvasEl.scrollTop === 0;
            if (!fromHandle && !fromCanvas) return;
            startY = e.touches[0].clientY;
            lastY = startY; lastTime = Date.now();
            isDragging = true;
            modalEl.style.transition = 'none';
            modalEl.style.willChange = 'transform';
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            if (delta < 0) return; // ignore upward drags
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            // Rubber-band resistance after 80px
            const resisted = delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
            // Fade backdrop proportionally
            const bg = document.querySelector('.modal-bg') as HTMLElement | null;
            if (bg) bg.style.opacity = String(1 - Math.min(delta / 300, 1) * 0.7);
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            modalEl.style.willChange = '';
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.addClass('is-exiting');
                setTimeout(() => this.close(), 250);
            } else {
                // Spring snap-back
                modalEl.addClass('is-snapping-back');
                modalEl.style.transform = 'translateY(0)';
                setTimeout(() => modalEl.removeClass('is-snapping-back'), 400);
            }
            currentY = 0;
        };

        modalEl.addEventListener('touchstart', onTouchStart, { passive: true });
        modalEl.addEventListener('touchmove', onTouchMove, { passive: true });
        modalEl.addEventListener('touchend', onTouchEnd, { passive: true });
    }

    /** ── AI AUTO-CLASSIFY (sec-004) ─────────────────── */
    private _attachAutoClassify(textArea: HTMLTextAreaElement) {
        if (!this.plugin.settings.enableAutoClassification) return;
        textArea.addEventListener('input', () => {
            if (this.classificationTimeout) clearTimeout(this.classificationTimeout);
            this.classificationTimeout = setTimeout(async () => {
                const text = textArea.value;
                if (text.length < 15) return;
                const projects = this.plugin.index.getProjects();
                const prompt = `Classify this note into one of these projects: ${projects.join(', ')}. Note: "${text}". Return ONLY the name or "None".`;
                try {
                    const result = await this.plugin.ai.callGemini(prompt, [], false, [], this.plugin.index.thoughtIndex);
                    const match = projects.find(p => result.includes(p));
                    if (match) this.currentProject = match;
                } catch (_) {}
            }, 1500);
        });
    }

    /** ── DESKTOP / TABLET PATH ───────────────────────── */
    private _renderDesktop(contentEl: HTMLElement, modalEl: HTMLElement) {
        modalEl.addClass('mina-clean-modal');
        modalEl.style.width = '650px';
        modalEl.style.maxWidth = '95vw';
        modalEl.style.borderRadius = '20px';
        modalEl.style.padding = '0';
        modalEl.style.overflow = 'hidden';
        modalEl.style.background = 'var(--background-primary)';
        modalEl.style.boxShadow = '0 30px 60px rgba(0,0,0,0.4)';
        modalEl.style.border = '1px solid var(--background-modifier-border-faint)';

        if (Platform.isMobile) {
            // Tablet: centered card (not full-screen sheet)
            const w = isTablet() ? '80vw' : '95vw';
            modalEl.style.width = w;
            modalEl.style.maxWidth = w;
        }

        // Canvas
        const canvas = contentEl.createEl('div', {
            attr: { style: 'padding: 32px 32px 10px 32px; display: flex; flex-direction: column; gap: 16px;' }
        });
        const textArea = canvas.createEl('textarea', {
            text: this.initialText,
            attr: {
                placeholder: this.isTask ? 'Execute intent...' : 'Capture thought...',
                style: 'width: 100%; min-height: 200px; font-size: 1.25em; line-height: 1.5; font-family: var(--font-text); border: none; background: transparent; color: var(--text-normal); resize: none; outline: none; padding: 0;'
            }
        });
        textArea.focus();

        // Dock
        const dock = contentEl.createEl('div', {
            attr: { style: 'padding: 12px 32px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;' }
        });
        const leftDock = dock.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 12px; flex-grow: 1;' } });

        // Context chips
        const chipContainer = leftDock.createDiv({ attr: { style: 'display: flex; gap: 6px; flex-wrap: wrap;' } });
        const renderChips = () => {
            chipContainer.empty();
            this.initialContexts.forEach(ctx => {
                const chip = chipContainer.createEl('span', {
                    text: `#${ctx}`,
                    attr: { style: 'font-size: 0.65em; font-weight: 800; padding: 3px 10px; border-radius: 8px; background: var(--background-primary); color: var(--text-muted); border: 1px solid var(--background-modifier-border-faint); text-transform: uppercase; cursor: pointer; transition: all 0.2s;' }
                });
                chip.addEventListener('click', () => { this.initialContexts = this.initialContexts.filter(c => c !== ctx); renderChips(); });
            });
            const addBtn = chipContainer.createEl('button', {
                text: '+',
                attr: { style: 'background: transparent; border: 1px dashed var(--text-faint); color: var(--text-faint); border-radius: 8px; width: 24px; height: 24px; font-size: 0.8em; cursor: pointer;' }
            });
            addBtn.addEventListener('click', () => {
                new ContextSuggestModal(this.app, this.plugin.settings.contexts, async (ctx) => {
                    if (!this.initialContexts.includes(ctx)) { this.initialContexts.push(ctx); renderChips(); }
                }).open();
            });
        };
        renderChips();

        // Project chip
        const projectArea = leftDock.createDiv();
        const updateProjectChip = (project: string | null) => {
            projectArea.empty();
            if (!project) return;
            const pChip = projectArea.createEl('span', {
                text: `[${project}]`,
                attr: { style: 'font-size: 0.65em; font-weight: 900; color: var(--interactive-accent); text-transform: uppercase; letter-spacing: 0.05em;' }
            });
            pChip.addEventListener('click', () => { this.currentProject = null; updateProjectChip(null); });
        };
        if (this.currentProject) updateProjectChip(this.currentProject);

        // Date picker (tasks only)
        let dateInput: HTMLInputElement | null = null;
        if (this.isTask) {
            dateInput = leftDock.createEl('input', {
                type: 'date',
                value: this.initialDueDate || moment().format('YYYY-MM-DD'),
                attr: { style: 'font-size: 0.7em; background: transparent; border: none; color: var(--text-faint); cursor: pointer;' }
            });
        }

        // Actions
        const rightDock = dock.createDiv({ attr: { style: 'display: flex; gap: 8px;' } });
        const cancelBtn = rightDock.createEl('button', { text: 'CANCEL', attr: { style: 'background: transparent; border: none; color: var(--text-faint); font-size: 0.65em; font-weight: 900; padding: 8px 12px; cursor: pointer;' } });
        cancelBtn.addEventListener('click', () => this.close());
        const saveBtn = rightDock.createEl('button', {
            text: this.stayOpen ? 'ADD' : 'SAVE',
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 6px 20px; border-radius: 8px; font-size: 0.7em; font-weight: 900; cursor: pointer; box-shadow: 0 4px 15px rgba(var(--interactive-accent-rgb), 0.3);' }
        });

        const handleSave = () => {
            if (!textArea.value.trim()) return;
            const text = textArea.value.replace(/\n/g, '<br>');
            const contexts = this.initialContexts.map(c => `#${c}`).join(' ');
            const due = dateInput ? dateInput.value : null;
            this.onSave(text, contexts, due, this.currentProject);
            if (this.stayOpen) { textArea.value = ''; textArea.focus(); new Notice('Capture saved.'); }
            else this.close();
        };
        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        // Desktop inline triggers (setDueDate flashes the dateInput)
        const setDueDateDesktop = (d: string) => {
            if (dateInput) {
                dateInput.value = d;
                dateInput.style.color = 'var(--interactive-accent)';
                setTimeout(() => { if (dateInput) dateInput.style.color = ''; }, 1500);
            }
        };
        this._attachInlineTriggers(textArea, setDueDateDesktop);

        // AI auto-classify (desktop only — updates project chip)
        if (this.plugin.settings.enableAutoClassification) {
            textArea.addEventListener('input', () => {
                if (this.classificationTimeout) clearTimeout(this.classificationTimeout);
                this.classificationTimeout = setTimeout(async () => {
                    const text = textArea.value;
                    if (text.length < 15) return;
                    const projects = this.plugin.index.getProjects();
                    const prompt = `Classify this note into one of these projects: ${projects.join(', ')}. Note: "${text}". Return ONLY the name or "None".`;
                    try {
                        const result = await this.plugin.ai.callGemini(prompt, [], false, [], this.plugin.index.thoughtIndex);
                        const match = projects.find(p => result.includes(p));
                        if (match) { this.currentProject = match; updateProjectChip(match); }
                    } catch (_) {}
                }, 1500);
            });
        }
    }

    onClose() {
        if (this._isMobileSheet) {
            document.body.removeClass('mina-mobile-active');
            if (this._viewportCleanup) { this._viewportCleanup(); this._viewportCleanup = null; }
        }
        this.contentEl.empty();
    }
}
