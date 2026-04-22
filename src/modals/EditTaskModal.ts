import { App, Modal, Platform, setIcon } from 'obsidian';
import { isTablet, parseNaturalDate } from '../utils';
import { ContextSuggestModal } from './ContextSuggestModal';
import { ProjectPickerModal } from './ProjectPickerModal';
import type { TaskEntry, ProjectEntry, RecurrenceRule } from '../types';
import type { VaultService } from '../services/VaultService';
import type { IndexService } from '../services/IndexService';

export class EditTaskModal extends Modal {
    private readonly task: TaskEntry;
    private readonly vault: VaultService;
    private readonly index: IndexService;
    private readonly onSaved: () => void;

    // ── Form state (initialized from task) ──────────────────────────────
    private _title: string;
    private _dueDate: string | null;
    private _recurrence: RecurrenceRule | null;
    private _priority: 'high' | 'medium' | 'low' | null;
    private _energy:   'high' | 'medium' | 'low' | null;
    private _status:   'open' | 'waiting' | 'someday';
    private _contexts: string[];
    private _project:  ProjectEntry | null;

    private _isMobileSheet = false;

    constructor(
        app: App,
        task: TaskEntry,
        vault: VaultService,
        index: IndexService,
        onSaved: () => void
    ) {
        super(app);
        this.task    = task;
        this.vault   = vault;
        this.index   = index;
        this.onSaved = onSaved;

        this._title      = task.title;
        this._dueDate    = task.due || null;
        this._recurrence = task.recurrence ?? null;
        this._priority   = task.priority   ?? null;
        this._energy     = task.energy     ?? null;
        this._status     = (task.status === 'waiting' || task.status === 'someday')
                           ? task.status : 'open';
        this._contexts   = [...(task.context ?? [])];

        const projName = task.project ?? null;
        this._project = projName
            ? (Array.from(index.projectIndex.values()).find(
                p => p.name === projName || p.id === projName) ?? null)
            : null;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    onOpen(): void {
        this.contentEl.empty();
        if (Platform.isMobile && !isTablet()) {
            this._isMobileSheet = true;
            this._renderMobile();
        } else if (isTablet()) {
            this._renderTablet();
        } else {
            this._renderDesktop();
        }
    }

    onClose(): void {
        if (this._isMobileSheet) {
            document.body.removeClass('mina-task-edit-active');
        }
        this.contentEl.empty();
    }

    // ── Save ─────────────────────────────────────────────────────────────

    private async _save(): Promise<void> {
        if (!this._title.trim()) return;
        const ok = await this.vault.updateTaskEntry(this.task.filePath, {
            title:      this._title.trim(),
            dueDate:    this._dueDate,
            recurrence: this._recurrence,
            priority:   this._priority,
            energy:     this._energy,
            status:     this._status ?? 'open',
            contexts:   this._contexts,
            project:    this._project?.name ?? null,
        });
        if (ok) {
            this.onSaved();
            this.close();
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // MOBILE RENDER — bottom sheet
    // ════════════════════════════════════════════════════════════════════

    private _renderMobile(): void {
        const { contentEl, modalEl } = this;

        modalEl.addClass('mina-edit-task-sheet');
        modalEl.style.setProperty('border-radius', '20px 20px 0 0', 'important');
        modalEl.style.setProperty('overflow', 'visible', 'important');
        contentEl.style.setProperty('border-radius', '20px 20px 0 0', 'important');
        contentEl.style.setProperty('overflow', 'hidden', 'important');
        document.body.addClass('mina-task-edit-active');

        const root = contentEl.createDiv({ cls: 'mina-ets-root' });

        // Handle bar
        const handleBar = root.createDiv({ cls: 'mina-ets-handle-bar' });
        handleBar.createDiv({ cls: 'mina-ets-handle-pill' });

        // Header
        const header = root.createDiv({ cls: 'mina-ets-header' });
        header.createEl('span', { text: 'EDIT TASK', cls: 'mina-ets-header-title' });
        const closeBtn = header.createEl('button', {
            text: '✕', cls: 'mina-ets-close-btn', attr: { 'aria-label': 'Close' }
        });
        closeBtn.addEventListener('click', () => this.close());

        // Body
        const body = root.createDiv({ cls: 'mina-ets-body' });

        let saveBtn!: HTMLButtonElement;
        const refreshSave = () => {
            if (!saveBtn) return;
            const empty = !this._title.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };

        // Title
        const titleSection = body.createDiv({ cls: 'mina-ets-title-section' });
        titleSection.createEl('span', { text: 'TITLE', cls: 'mina-ets-section-label' });
        const titleTA = titleSection.createEl('textarea', {
            cls: 'mina-ets-title-textarea',
            attr: { placeholder: 'Task title…', rows: '2' }
        }) as HTMLTextAreaElement;
        titleTA.value = this._title;
        titleTA.addEventListener('input', () => {
            this._title = titleTA.value;
            titleTA.style.height = 'auto';
            titleTA.style.height = Math.min(titleTA.scrollHeight, 180) + 'px';
            refreshSave();
        });

        // Date
        const dateSection = body.createDiv({ cls: 'mina-ets-date-section' });
        dateSection.createEl('span', { text: 'DUE DATE', cls: 'mina-ets-section-label' });
        this._buildDateStrip(dateSection, 'mina-ets-date-strip');

        // Recurrence
        const recurSection = body.createDiv({ cls: 'mina-ets-recur-section' });
        recurSection.createEl('span', { text: 'REPEAT', cls: 'mina-ets-section-label' });
        this._buildRecurStrip(recurSection, false, 'mina-ets-recur-strip');

        // Meta (PRI/NRG/STATUS)
        const metaSection = body.createDiv({ cls: 'mina-ets-meta-section' });
        this._buildMetaStrip(metaSection, false, 'mina-ets-meta-strip');

        // Chips + project
        const chipsSection = body.createDiv({ cls: 'mina-ets-chips-section' });
        chipsSection.createEl('span', { text: 'TAGS & PROJECT', cls: 'mina-ets-section-label' });
        const renderChips = this._buildChipsRow(
            chipsSection, 'mina-ets-chips-row',
            'mina-ets-tag-chip', 'mina-ets-tag-add-btn', 'mina-ets-project-pill'
        );
        renderChips();

        // Footer
        const footer = root.createDiv({ cls: 'mina-ets-footer' });
        const cancelBtn = footer.createEl('button', {
            text: 'CANCEL', cls: 'mina-ets-cancel-btn'
        });
        cancelBtn.addEventListener('click', () => this.close());
        saveBtn = footer.createEl('button', {
            text: 'SAVE TASK', cls: 'mina-ets-save-btn'
        }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => this._save());
        refreshSave();

        contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this._save(); }
            if (e.key === 'Escape') this.close();
        });

        setTimeout(() => {
            titleTA.focus();
            titleTA.setSelectionRange(titleTA.value.length, titleTA.value.length);
            titleTA.style.height = 'auto';
            titleTA.style.height = Math.min(titleTA.scrollHeight, 180) + 'px';
        }, 80);

        this._initSwipeToDismiss(modalEl, handleBar, header);
    }

    // ════════════════════════════════════════════════════════════════════
    // TABLET RENDER — centered, portrait/landscape aware
    // ════════════════════════════════════════════════════════════════════

    private _renderTablet(): void {
        const { contentEl, modalEl } = this;

        modalEl.addClass('mina-task-edit-modal');
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        if (isLandscape) modalEl.addClass('is-landscape');

        // Header
        const header = contentEl.createDiv({ cls: 'mina-tem-header' });
        header.createDiv({ cls: 'mina-tem-drag-handle' });
        const headerRow = header.createDiv({ cls: 'mina-tem-header-row' });
        headerRow.createEl('span', { text: 'EDIT TASK', cls: 'mina-tem-header-label' });
        const closeBtn = headerRow.createEl('button', {
            text: '✕', cls: 'mina-tem-close-btn', attr: { 'aria-label': 'Close' }
        });
        closeBtn.addEventListener('click', () => this.close());

        // Body
        const body = contentEl.createDiv({
            cls: `mina-tem-body${isLandscape ? ' is-split' : ''}`
        });

        let saveBtn!: HTMLButtonElement;
        const refreshSave = () => {
            if (!saveBtn) return;
            const empty = !this._title.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };

        const buildTitleTA = (parent: HTMLElement, maxH: number): HTMLTextAreaElement => {
            const sec = parent.createDiv({ cls: 'mina-tem-section mina-tem-title-zone' });
            const ta = sec.createEl('textarea', {
                cls: 'mina-tem-title-input', attr: { placeholder: 'Task title…' }
            }) as HTMLTextAreaElement;
            ta.value = this._title;
            ta.addEventListener('input', () => {
                this._title = ta.value;
                ta.style.height = 'auto';
                ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
                refreshSave();
            });
            return ta;
        };

        let titleInput: HTMLTextAreaElement;

        if (isLandscape) {
            const leftPane  = body.createDiv({ cls: 'mina-tem-left' });
            const rightPane = body.createDiv({ cls: 'mina-tem-right' });

            titleInput = buildTitleTA(leftPane, 148);
            leftPane.createDiv({ cls: 'mina-tem-spacer' });

            const chipZone = leftPane.createDiv({ cls: 'mina-tem-section mina-tem-chip-zone' });
            this._buildChipsRow(chipZone, 'mina-tem-chips-row', 'mina-tem-tag-chip', 'mina-tem-tag-add-btn', 'mina-tem-project-pill')();

            const dueFld = rightPane.createDiv({ cls: 'mina-tem-field' });
            dueFld.createEl('span', { text: 'DUE DATE', cls: 'mina-tem-field-label' });
            this._buildDateStrip(dueFld, 'mina-tem-due-strip');

            const recurFld = rightPane.createDiv({ cls: 'mina-tem-field' });
            recurFld.createEl('span', { text: 'REPEAT', cls: 'mina-tem-field-label' });
            this._buildRecurStrip(recurFld, false, 'mina-tem-recur-strip');

            this._buildMetaStrip(rightPane, true, 'mina-tem-meta-strip');
        } else {
            titleInput = buildTitleTA(body, 148);

            const metaZone = body.createDiv({ cls: 'mina-tem-section mina-tem-meta-zone' });
            this._buildMetaStrip(metaZone, false, 'mina-tem-meta-strip');

            const dueSec = body.createDiv({ cls: 'mina-tem-section' });
            dueSec.createEl('span', { text: 'DUE DATE', cls: 'mina-tem-section-label' });
            this._buildDateStrip(dueSec, 'mina-tem-due-strip');

            const recurSec = body.createDiv({ cls: 'mina-tem-section' });
            recurSec.createEl('span', { text: 'REPEAT', cls: 'mina-tem-section-label' });
            this._buildRecurStrip(recurSec, false, 'mina-tem-recur-strip');

            const chipSec = body.createDiv({ cls: 'mina-tem-section mina-tem-chip-zone' });
            this._buildChipsRow(chipSec, 'mina-tem-chips-row', 'mina-tem-tag-chip', 'mina-tem-tag-add-btn', 'mina-tem-project-pill')();
        }

        // Footer
        const footer = contentEl.createDiv({ cls: 'mina-tem-footer' });
        footer.createEl('button', { text: 'CANCEL', cls: 'mina-tem-cancel-btn' })
            .addEventListener('click', () => this.close());
        saveBtn = footer.createEl('button', {
            text: 'SAVE TASK', cls: 'mina-tem-save-btn'
        }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => this._save());
        refreshSave();

        contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this._save(); }
            if (e.key === 'Escape') this.close();
        });

        setTimeout(() => {
            titleInput.focus();
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
            titleInput.style.height = 'auto';
            titleInput.style.height = Math.min(titleInput.scrollHeight, 148) + 'px';
        }, 80);

        const dragHandle = header.querySelector('.mina-tem-drag-handle') as HTMLElement;
        this._initTabletSwipeDismiss(modalEl, dragHandle, header);
    }

    // ════════════════════════════════════════════════════════════════════
    // DESKTOP RENDER — two-column
    // ════════════════════════════════════════════════════════════════════

    private _renderDesktop(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass('mina-edit-task-modal');

        // Header
        const header = contentEl.createDiv({ cls: 'mina-etm-header' });
        header.createEl('span', { text: 'EDIT TASK', cls: 'mina-etm-header-label' });
        header.createEl('span', { text: '⌘↵ to save', cls: 'mina-etm-header-hint' });

        // Body (flex row)
        const body = contentEl.createDiv({ cls: 'mina-etm-body' });

        // Left column
        const leftCol = body.createDiv({ cls: 'mina-etm-left' });
        const textareaWrap = leftCol.createDiv({ cls: 'mina-etm-textarea-wrap' });
        const textarea = textareaWrap.createEl('textarea', {
            cls: 'mina-etm-textarea', attr: { placeholder: 'Task title…' }
        }) as HTMLTextAreaElement;
        textarea.value = this._title;

        const chipsRow = leftCol.createDiv({ cls: 'mina-etm-chips-row' });
        this._buildChipsRow(chipsRow, 'mina-etm-chips-inner', 'mina-etm-chip', 'mina-etm-chip-add-btn', 'mina-etm-proj-pill')();

        // Right column (196px)
        const rightCol = body.createDiv({ cls: 'mina-etm-right' });

        const dateSec = rightCol.createDiv({ cls: 'mina-etm-section' });
        dateSec.createEl('span', { text: 'DUE DATE', cls: 'mina-etm-section-label' });
        this._buildDateStrip(dateSec, 'mina-date-strip');

        const recurSec = rightCol.createDiv({ cls: 'mina-etm-section' });
        recurSec.createEl('span', { text: 'REPEAT', cls: 'mina-etm-section-label' });
        this._buildRecurStrip(recurSec, true, 'mina-recur-strip mina-recur-strip--compact');

        const propsSec = rightCol.createDiv({ cls: 'mina-etm-section' });
        propsSec.createEl('span', { text: 'PROPERTIES', cls: 'mina-etm-section-label' });
        this._buildMetaStrip(propsSec, true, 'mina-meta-strip', true);

        // Footer
        const footer = contentEl.createDiv({ cls: 'mina-etm-footer' });

        let saveBtn!: HTMLButtonElement;
        const refreshSave = () => {
            if (!saveBtn) return;
            const empty = !this._title.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };

        textarea.addEventListener('input', () => {
            this._title = textarea.value;
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 320) + 'px';
            refreshSave();
        });

        footer.createEl('button', { text: 'Cancel', cls: 'mina-etm-cancel-btn' })
            .addEventListener('click', () => {
                modalEl.addClass('is-closing');
                setTimeout(() => this.close(), 140);
            });
        saveBtn = footer.createEl('button', {
            text: 'Save Task', cls: 'mina-etm-save-btn'
        }) as HTMLButtonElement;
        saveBtn.addEventListener('click', () => {
            modalEl.addClass('is-closing');
            setTimeout(() => this._save(), 0);
        });
        refreshSave();

        contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                modalEl.addClass('is-closing');
                setTimeout(() => this._save(), 0);
            }
            if (e.key === 'Escape') {
                modalEl.addClass('is-closing');
                setTimeout(() => this.close(), 140);
            }
        }, true);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 320) + 'px';
        }, 80);
    }

    // ════════════════════════════════════════════════════════════════════
    // SHARED PRIMITIVES
    // ════════════════════════════════════════════════════════════════════

    private _buildDateStrip(container: HTMLElement, stripCls: string): void {
        const strip   = container.createDiv({ cls: stripCls });
        const display = container.createDiv({ cls: 'mina-date-display' });
        display.style.display = 'none';
        const btnEls: HTMLButtonElement[] = [];

        const updateDisplay = (dateStr: string | null) => {
            display.empty();
            if (!dateStr) { display.style.display = 'none'; return; }
            display.style.display = 'flex';
            display.createSpan({ text: '📅', cls: 'mina-date-display-icon' });
            const lbl = display.createSpan({
                text: window.moment(dateStr).format('ddd, MMM D'),
                cls: 'mina-date-display-label'
            });
            lbl.addEventListener('click', () => showNLPInput());
            const clr = display.createEl('button', { text: '×', cls: 'mina-date-display-clear' });
            clr.addEventListener('click', () => {
                this._dueDate = null;
                updateDisplay(null);
                btnEls.forEach(b => b.removeClass('is-selected'));
            });
        };

        const setDueDate = (d: string) => {
            this._dueDate = d;
            updateDisplay(d);
        };

        const today     = window.moment();
        const dow       = today.day(); // 0=Sun
        const daysToFri = dow <= 4 ? (5 - dow) : (12 - dow);
        const rawShortcuts = [
            { label: 'TODAY',                                 days: 0              },
            { label: 'TMRW',                                  days: 1              },
            { label: daysToFri > 2 ? 'THIS FRI' : '+7D',     days: daysToFri > 2 ? daysToFri : 7 },
            { label: '+7D',                                   days: 7              },
            { label: '+30D',                                  days: 30             },
        ];
        const shortcuts = rawShortcuts.filter(
            (s, i, a) => a.findIndex(x => x.days === s.days) === i
        );

        shortcuts.forEach(s => {
            const btn = strip.createEl('button', {
                text: s.label, cls: 'mina-date-shortcut-btn'
            }) as HTMLButtonElement;
            btnEls.push(btn);
            if (this._dueDate) {
                const btnDate = window.moment().add(s.days, 'days').format('YYYY-MM-DD');
                if (btnDate === this._dueDate) btn.addClass('is-selected');
            }
            btn.addEventListener('click', () => {
                const d = window.moment().add(s.days, 'days').format('YYYY-MM-DD');
                setDueDate(d);
                btnEls.forEach(b => b.removeClass('is-selected'));
                btn.addClass('is-selected');
            });
        });

        const pickBtn = strip.createEl('button', {
            text: 'PICK ▾', cls: 'mina-date-shortcut-btn mina-date-pick-btn'
        }) as HTMLButtonElement;
        pickBtn.addEventListener('click', () => showNLPInput());

        const showNLPInput = () => {
            container.querySelector('.mina-date-nlp-wrap')?.remove();
            const wrap = container.createDiv({ cls: 'mina-date-nlp-wrap' });
            const input = wrap.createEl('input', {
                type: 'text', cls: 'mina-date-nlp-input',
                attr: { placeholder: 'next tuesday, in 3 weeks…' }
            }) as HTMLInputElement;
            input.style.setProperty('font-size', 'max(16px, 0.875rem)');
            const confirmBtn = wrap.createEl('button', {
                text: '↵', cls: 'mina-date-nlp-confirm',
                attr: { 'aria-label': 'Confirm date' }
            });
            const tryConfirm = () => {
                const parsed = parseNaturalDate(input.value.trim());
                if (parsed) {
                    setDueDate(parsed);
                    wrap.remove();
                } else {
                    input.addClass('is-error');
                    setTimeout(() => input.removeClass('is-error'), 600);
                }
            };
            confirmBtn.addEventListener('click', tryConfirm);
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') tryConfirm();
                if (e.key === 'Escape') wrap.remove();
            });
            setTimeout(() => input.focus(), 0);
        };

        if (this._dueDate) updateDisplay(this._dueDate);
    }

    private _buildRecurStrip(
        container: HTMLElement,
        compact:   boolean,
        stripCls:  string
    ): void {
        const strip = container.createDiv({ cls: stripCls });

        if (!compact) {
            const iconWrap = strip.createDiv({ cls: 'mina-recur-icon' });
            setIcon(iconWrap, 'repeat-2');
        }

        type ROption = { value: RecurrenceRule | null; label: string };
        const OPTIONS: ROption[] = [
            { value: null,        label: '—'        },
            { value: 'daily',     label: 'Daily'    },
            { value: 'weekly',    label: 'Weekly'   },
            { value: 'biweekly',  label: 'Biweekly' },
            { value: 'monthly',   label: 'Monthly'  },
        ];
        const btnEls: HTMLButtonElement[] = [];

        const syncActive = () => {
            btnEls.forEach((b, i) => {
                const active = OPTIONS[i].value === this._recurrence;
                b.toggleClass('is-active', active);
                b.setAttribute('aria-pressed', String(active));
            });
        };

        OPTIONS.forEach(({ value, label }) => {
            const btn = strip.createEl('button', {
                text: label, cls: 'mina-recur-btn',
                attr: { 'aria-pressed': 'false', 'data-recurrence': value ?? 'none' }
            }) as HTMLButtonElement;
            btnEls.push(btn);
            btn.addEventListener('click', () => {
                this._recurrence = (this._recurrence === value && value !== null) ? null : value;
                syncActive();
                if ('vibrate' in navigator) navigator.vibrate(8);
            });
            btn.addEventListener('keydown', (e: KeyboardEvent) => {
                const idx = btnEls.indexOf(btn);
                if (e.key === 'ArrowRight') { e.preventDefault(); btnEls[idx + 1]?.focus(); }
                if (e.key === 'ArrowLeft')  { e.preventDefault(); btnEls[idx - 1]?.focus(); }
            });
        });

        syncActive();
    }

    private _buildMetaStrip(
        container:         HTMLElement,
        compact:           boolean,
        stripCls:          string,
        includeOpenStatus: boolean = false
    ): void {
        const strip = container.createDiv({ cls: stripCls });

        const priValues:    ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
        const priLabels:    Record<string, string> = { low: '!', medium: '!!', high: '!!!' };
        const energyValues: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
        const energyLabels: Record<string, string> = { low: '🌙', medium: '〰', high: '⚡' };

        const priBtns:    HTMLButtonElement[] = [];
        const energyBtns: HTMLButtonElement[] = [];
        const statusBtns: HTMLButtonElement[] = [];

        const syncPri    = () => priBtns.forEach(b    => { const a = b.getAttribute('data-priority') === this._priority;    b.toggleClass('is-active', a); b.setAttribute('aria-pressed', String(a)); });
        const syncEnergy = () => energyBtns.forEach(b => { const a = b.getAttribute('data-energy')   === this._energy;      b.toggleClass('is-active', a); b.setAttribute('aria-pressed', String(a)); });
        const syncStatus = () => statusBtns.forEach(b => { const a = b.getAttribute('data-status')   === this._status;      b.toggleClass('is-active', a); b.setAttribute('aria-pressed', String(a)); });

        if (compact) {
            // Desktop / tablet landscape: icon + row layout
            const makeRow = (iconName: string, rowAttr: string): HTMLElement => {
                const row = strip.createDiv({ cls: 'mina-meta-row', attr: { 'data-row': rowAttr } });
                const ico = row.createDiv({ cls: 'mina-meta-icon' });
                setIcon(ico, iconName);
                return row;
            };

            const priRow = makeRow('flag', 'priority');
            priValues.forEach(val => {
                const btn = priRow.createEl('button', {
                    text: priLabels[val], cls: 'mina-meta-btn mina-meta-btn--pri',
                    attr: { 'data-priority': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                priBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._priority = this._priority === val ? null : val;
                    syncPri();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
                btn.addEventListener('keydown', (e: KeyboardEvent) => {
                    const idx = priBtns.indexOf(btn);
                    if (e.key === 'ArrowRight') { e.preventDefault(); priBtns[idx + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); priBtns[idx - 1]?.focus(); }
                });
            });

            const energyRow = makeRow('zap', 'energy');
            energyValues.forEach(val => {
                const btn = energyRow.createEl('button', {
                    text: energyLabels[val], cls: 'mina-meta-btn mina-meta-btn--energy',
                    attr: { 'data-energy': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                energyBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._energy = this._energy === val ? null : val;
                    syncEnergy();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
                btn.addEventListener('keydown', (e: KeyboardEvent) => {
                    const idx = energyBtns.indexOf(btn);
                    if (e.key === 'ArrowRight') { e.preventDefault(); energyBtns[idx + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); energyBtns[idx - 1]?.focus(); }
                });
            });

            const statusRow = makeRow('circle-dot', 'status');
            const statusOptions = includeOpenStatus
                ? [{ value: 'open' as const, label: 'OPEN' }, { value: 'waiting' as const, label: 'WAITING' }, { value: 'someday' as const, label: 'SOMEDAY' }]
                : [{ value: 'waiting' as const, label: 'WAITING' }, { value: 'someday' as const, label: 'SOMEDAY' }];
            statusOptions.forEach(({ value, label }) => {
                const btn = statusRow.createEl('button', {
                    text: label, cls: 'mina-meta-btn mina-meta-btn--status',
                    attr: { 'data-status': value, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                statusBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._status = (this._status === value && value !== 'open') ? 'open' : value;
                    syncStatus();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
                btn.addEventListener('keydown', (e: KeyboardEvent) => {
                    const idx = statusBtns.indexOf(btn);
                    if (e.key === 'ArrowRight') { e.preventDefault(); statusBtns[idx + 1]?.focus(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); statusBtns[idx - 1]?.focus(); }
                });
            });
        } else {
            // Mobile / tablet portrait: flat horizontal scroll with inline labels
            strip.createEl('span', { text: 'PRI', cls: 'mina-meta-label' });
            priValues.forEach(val => {
                const btn = strip.createEl('button', {
                    text: priLabels[val], cls: 'mina-meta-btn mina-meta-btn--pri',
                    attr: { 'data-priority': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                priBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._priority = this._priority === val ? null : val;
                    syncPri();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
            });
            strip.createEl('span', { cls: 'mina-meta-divider' });
            strip.createEl('span', { text: 'NRG', cls: 'mina-meta-label' });
            energyValues.forEach(val => {
                const btn = strip.createEl('button', {
                    text: energyLabels[val], cls: 'mina-meta-btn mina-meta-btn--energy',
                    attr: { 'data-energy': val, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                energyBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._energy = this._energy === val ? null : val;
                    syncEnergy();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
            });
            strip.createEl('span', { cls: 'mina-meta-divider' });
            strip.createEl('span', { text: 'STATUS', cls: 'mina-meta-label' });
            ([{ value: 'waiting' as const, label: '⏳ WAIT' }, { value: 'someday' as const, label: '☁ SMDY' }]).forEach(({ value, label }) => {
                const btn = strip.createEl('button', {
                    text: label, cls: 'mina-meta-btn mina-meta-btn--status',
                    attr: { 'data-status': value, 'aria-pressed': 'false' }
                }) as HTMLButtonElement;
                statusBtns.push(btn);
                btn.addEventListener('click', () => {
                    this._status = this._status === value ? 'open' : value;
                    syncStatus();
                    if ('vibrate' in navigator) navigator.vibrate(8);
                });
            });
        }

        syncPri();
        syncEnergy();
        syncStatus();
    }

    private _buildChipsRow(
        container:      HTMLElement,
        rowCls:         string,
        chipCls:        string,
        addBtnCls:      string,
        projectPillCls: string
    ): () => void {
        const row = container.createDiv({ cls: rowCls });
        const allProjects = Array.from(this.index.projectIndex.values())
            .filter(p => p.status !== 'archived');

        const renderChips = (): void => {
            row.empty();

            if (this._contexts.length === 0) {
                row.createEl('span', { text: '# to tag', cls: 'mina-chip-hint' });
            }

            this._contexts.forEach(ctx => {
                const chip = row.createEl('span', { cls: chipCls });
                chip.createEl('span', { text: `#${ctx}` });
                const xBtn = chip.createEl('button', {
                    text: '×', cls: 'mina-chip-x',
                    attr: { 'aria-label': `Remove ${ctx}` }
                });
                xBtn.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    this._contexts = this._contexts.filter(c => c !== ctx);
                    renderChips();
                });
            });

            const addBtn = row.createEl('button', {
                text: '# tag', cls: addBtnCls,
                attr: { 'aria-label': 'Add context tag' }
            });
            addBtn.addEventListener('click', () => {
                const existingCtxs = this.index.settings.contexts ?? [];
                new ContextSuggestModal(this.app, existingCtxs, (chosen: string) => {
                    if (chosen && !this._contexts.includes(chosen)) {
                        this._contexts.push(chosen);
                        renderChips();
                    }
                }).open();
            });

            const openProjectPicker = () => {
                new ProjectPickerModal(this.app, allProjects, (picked: ProjectEntry | null) => {
                    this._project = picked;
                    renderChips();
                }).open();
            };

            if (this._project) {
                const pill = row.createEl('span', {
                    cls: `${projectPillCls} mina-project-pill--active`,
                    attr: { role: 'button', tabindex: '0' }
                });
                if (this._project.color) pill.style.setProperty('--project-color', this._project.color);
                pill.createEl('span', { cls: 'mina-project-pill-dot' });
                pill.createEl('span', { text: this._project.name, cls: 'mina-project-pill-name' });
                const xBtn = pill.createEl('button', {
                    text: '×', cls: 'mina-project-pill-x',
                    attr: { 'aria-label': 'Remove project' }
                });
                xBtn.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    this._project = null;
                    renderChips();
                });
                pill.addEventListener('click', (e: MouseEvent) => {
                    if ((e.target as HTMLElement).classList.contains('mina-project-pill-x')) return;
                    openProjectPicker();
                });
            } else if (allProjects.length > 0) {
                const emptyPill = row.createEl('button', {
                    cls: `${projectPillCls} mina-project-pill--empty`,
                    attr: { 'aria-label': 'Assign project' }
                });
                emptyPill.createEl('span', { text: '◈', cls: 'mina-project-pill-icon' });
                emptyPill.createEl('span', { text: 'Project' });
                emptyPill.addEventListener('click', openProjectPicker);
            }
        };

        return renderChips;
    }

    // ── Swipe dismiss — mobile ────────────────────────────────────────────

    private _initSwipeToDismiss(
        modalEl:  HTMLElement,
        handleEl: HTMLElement,
        headerEl: HTMLElement
    ): void {
        const DISMISS_THRESHOLD  = 120;
        const VELOCITY_THRESHOLD = 600;
        const RESISTANCE         = 280;

        let startY = 0, currentY = 0, isDragging = false;
        let lastY = 0, lastTime = 0, velocity = 0;

        modalEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (!handleEl.contains(e.target as Node) && !headerEl.contains(e.target as Node)) return;
            startY = e.touches[0].clientY; lastY = startY; lastTime = Date.now();
            isDragging = true; currentY = 0;
            modalEl.style.transition = 'none';
        }, { passive: true });

        modalEl.addEventListener('touchmove', (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            if (delta < 0) return;
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            const resisted = delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
            const bg = document.querySelector('.modal-bg') as HTMLElement | null;
            if (bg) bg.style.opacity = String(1 - Math.min(delta / 300, 1) * 0.7);
        }, { passive: true });

        modalEl.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            modalEl.style.willChange = '';
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.addClass('is-exiting');
                setTimeout(() => this.close(), 250);
            } else {
                modalEl.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
                modalEl.style.transform = 'translateY(0)';
                setTimeout(() => { modalEl.style.transition = ''; }, 400);
            }
            currentY = 0;
        }, { passive: true });
    }

    // ── Swipe dismiss — tablet ────────────────────────────────────────────

    private _initTabletSwipeDismiss(
        modalEl:  HTMLElement,
        handleEl: HTMLElement,
        headerEl: HTMLElement
    ): void {
        const DISMISS_THRESHOLD  = 100;
        const VELOCITY_THRESHOLD = 600;
        const RESISTANCE         = 280;

        let startY = 0, currentY = 0, isDragging = false;
        let lastY = 0, lastTime = 0, velocity = 0;

        modalEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (!handleEl?.contains(e.target as Node) && !headerEl.contains(e.target as Node)) return;
            startY = e.touches[0].clientY; lastY = startY; lastTime = Date.now();
            isDragging = true; currentY = 0;
            modalEl.style.transition = 'none';
        }, { passive: true });

        modalEl.addEventListener('touchmove', (e: TouchEvent) => {
            if (!isDragging) return;
            const delta = e.touches[0].clientY - startY;
            const now = Date.now();
            velocity = (e.touches[0].clientY - lastY) / Math.max(now - lastTime, 1) * 1000;
            lastY = e.touches[0].clientY; lastTime = now;
            const resisted = delta < 0 ? delta * 0.1 : delta <= 80 ? delta : 80 + (delta - 80) * RESISTANCE / ((delta - 80) + RESISTANCE);
            currentY = resisted;
            modalEl.style.transform = `translateY(${resisted}px)`;
        }, { passive: true });

        modalEl.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            if (currentY > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
                modalEl.addClass('is-exiting');
                setTimeout(() => this.close(), 250);
            } else {
                modalEl.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
                modalEl.style.transform = 'translateY(0)';
                setTimeout(() => { modalEl.style.transition = ''; }, 400);
            }
            currentY = 0;
        }, { passive: true });
    }
}
