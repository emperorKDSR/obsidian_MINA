import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID, SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, WORKSPACE_ICON_ID, COMPASS_ICON_ID } from '../constants';
import { parseContextString, parseNaturalDate, isTablet, attachInlineTriggers } from '../utils';
import { HabitConfigModal } from '../modals/HabitConfigModal';
import { HelpModal } from '../modals/HelpModal';
import { SearchModal } from '../modals/SearchModal';

export class CommandCenterTab extends BaseTab {
    private parentContainer: HTMLElement;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.parentContainer = container;
        container.empty();
        container.addClass('mina-cockpit-root');
        if (this.view.isZenMode) container.addClass('is-zen-mode');
        else container.removeClass('is-zen-mode');

        const wrap = container.createEl('div', { cls: 'mina-cc-wrap' });

        this.renderHeader(wrap);

        // Search pill: phone-only entry point between greeting and capture bar
        if (Platform.isMobile && !isTablet()) {
            this.renderSearchPill(wrap);
        }

        this.renderCaptureBar(wrap);
        this.renderHabitQuickBar(wrap);
        this.renderZenBanner(wrap);
        const goalsDual = wrap.createEl('div', { cls: 'mina-goals-pane mina-section--hideable' });
        this.renderWeeklyGoals(goalsDual);
        this.renderMonthlyGoals(goalsDual);
        this.renderNavigationFooter(wrap);
    }

    private renderHeader(parent: HTMLElement) {
        const headerRow = parent.createEl('div', { cls: 'mina-cc-header' });
        const greetingCol = headerRow.createEl('div', { cls: 'mina-cc-greeting' });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        greetingCol.createEl('div', { text: moment().format('dddd · MMMM D').toUpperCase(), cls: 'mina-cc-date-line' });
        greetingCol.createEl('h1', { text: `${greeting}, Emperor.`, cls: 'mina-cc-title' });
        const vision = this.settings.northStarGoals?.[0];
        if (vision) {
            const ns = greetingCol.createEl('div', { cls: 'mina-cc-northstar' });
            ns.createEl('span', { text: '★', cls: 'mina-cc-northstar-star' });
            ns.createEl('span', { text: vision });
        }
        const isPhone = Platform.isMobile && !isTablet();
        const zenSize = isPhone ? '48px' : '42px';
        const btnSize = `width: ${zenSize}; height: ${zenSize}; min-width: ${zenSize};`;

        // Right-side button cluster (search + help + zen)
        const btnCluster = headerRow.createEl('div', { attr: { style: 'display:flex; align-items:center; gap:4px; flex-shrink:0;' } });

        const searchBtn = btnCluster.createEl('button', {
            cls: 'mina-zen-btn',
            attr: { title: 'Global Search  Mod+Shift+F', style: btnSize }
        });
        setIcon(searchBtn, 'lucide-search');
        searchBtn.addEventListener('click', () => { new SearchModal(this.app, this.plugin).open(); });

        const helpBtn = btnCluster.createEl('button', {
            cls: 'mina-zen-btn',
            attr: { title: 'Open manual', style: btnSize }
        });
        setIcon(helpBtn, 'lucide-circle-help');
        helpBtn.addEventListener('click', () => { new HelpModal(this.app).open(); });

        const zenToggle = btnCluster.createEl('button', {
            cls: `mina-zen-btn${this.view.isZenMode ? ' is-active' : ''}`,
            attr: { title: this.view.isZenMode ? 'Exit Zen' : 'Enter Zen', style: btnSize }
        });
        setIcon(zenToggle, 'lucide-target');
        zenToggle.addEventListener('click', () => {
            this.view.isZenMode = !this.view.isZenMode;
            if (Platform.isMobile) new Notice(this.view.isZenMode ? '⚡ Zen Mode — Focus engaged' : '🗺 Zen Mode off', 1500);
            this.render(this.parentContainer);
        });
    }

    private renderSearchPill(parent: HTMLElement) {
        const pill = parent.createEl('div', {
            cls: 'mina-search-pill',
            attr: { role: 'button', 'aria-label': 'Search MINA', tabindex: '0' }
        });
        const icon = pill.createEl('span', { cls: 'mina-search-pill-icon' });
        setIcon(icon, 'lucide-search');
        pill.createEl('span', { cls: 'mina-search-pill-text', text: 'Search MINA…' });
        pill.addEventListener('click', () => new SearchModal(this.app, this.plugin).open());
        pill.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                new SearchModal(this.app, this.plugin).open();
            }
        });
    }

    private renderZenBanner(parent: HTMLElement) {
        const banner = parent.createEl('div', { cls: 'mina-zen-banner' });
        banner.createEl('div', { text: 'FOCUS MODE', cls: 'mina-zen-focus-label' });
        const vision = this.settings.northStarGoals?.[0];
        if (vision) banner.createEl('div', { text: vision, cls: 'mina-zen-northstar-display' });
        const exitBtn = banner.createEl('button', { text: 'EXIT ZEN', cls: 'mina-zen-exit-btn' });
        exitBtn.addEventListener('click', () => { this.view.isZenMode = false; this.render(this.parentContainer); });
    }

    // ── 1. Capture bar ──────────────────────────────────────────────────────
    private renderCaptureBar(parent: HTMLElement) {
        const syncTextareaHeight = (textarea: HTMLTextAreaElement) => {
            textarea.style.height = 'auto';
            textarea.style.overflowY = 'hidden';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };

        // ── Desktop / tablet path: inline expansion ──────────────────────────
        if (!Platform.isMobile || isTablet()) {
            let captureContexts: string[] = [];
            let captureDueDate: string | null = null;
            let captureMode: 'thought' | 'task' = 'thought';

            const cap = parent.createEl('div', { cls: 'mina-capture-bar' });

            // Collapsed header row
            const collapsedRow = cap.createDiv({ cls: 'mina-capture-collapsed-row' });
            const iconWrap = collapsedRow.createDiv({ cls: 'mina-capture-icon-wrap' });
            setIcon(iconWrap, 'lucide-plus');
            collapsedRow.createEl('span', { text: "What's on your mind…", cls: 'mina-capture-placeholder' });
            collapsedRow.createEl('span', { text: '⌘K', cls: 'mina-capture-kbd' });

            // Expansion body
            const expandBody = cap.createDiv({ cls: 'mina-capture-expand-body' });
            const textarea = expandBody.createEl('textarea', {
                cls: 'mina-capture-inline-textarea',
                attr: { placeholder: 'Capture thought…', rows: '3' }
            }) as HTMLTextAreaElement;

            // Due date zone (task mode only)
            const dateZone = expandBody.createDiv({ cls: 'mina-mobile-date-zone' });
            this._buildInlineDateStrip(dateZone, (d: string | null) => { captureDueDate = d; });

            // Desktop dock: mode toggle | chips (flex) | actions
            const dock = expandBody.createDiv({ cls: 'mina-capture-desktop-dock' });

            const toggleBar = dock.createDiv({ cls: 'mina-seg-bar mina-capture-inline-toggle' });
            const thoughtBtn = toggleBar.createEl('button', { text: '✦ THOUGHT', cls: 'mina-seg-btn is-active' });
            const taskBtn = toggleBar.createEl('button', { text: '✓ TASK', cls: 'mina-seg-btn' });

            const chipArea = dock.createDiv({ cls: 'mina-capture-desktop-chip-area' });
            const chipStrip = chipArea.createDiv({ cls: 'mina-mobile-chip-strip' });

            const actionRow = dock.createDiv({ cls: 'mina-capture-desktop-actions' });
            const cancelBtn = actionRow.createEl('button', { text: 'CANCEL', cls: 'mina-capture-inline-cancel' });
            const saveBtn = actionRow.createEl('button', { text: 'CAPTURE', cls: 'mina-capture-inline-save is-disabled' }) as HTMLButtonElement;
            saveBtn.disabled = true;

            const renderChips = () => {
                chipStrip.empty();
                if (captureContexts.length === 0) return;
                captureContexts.forEach(ctx => {
                    const chip = chipStrip.createEl('span', { cls: 'mina-mobile-chip' });
                    chip.createSpan({ text: `#${ctx}` });
                    const x = chip.createSpan({ text: '×', cls: 'mina-mobile-chip-x' });
                    x.addEventListener('click', (e) => {
                        e.stopPropagation();
                        captureContexts = captureContexts.filter(c => c !== ctx);
                        renderChips();
                    });
                });
            };
            renderChips();

            // Mode switch
            const switchMode = (mode: 'thought' | 'task') => {
                captureMode = mode;
                textarea.placeholder = mode === 'task' ? 'Execute intent…' : 'Capture thought…';
                thoughtBtn.toggleClass('is-active', mode === 'thought');
                taskBtn.toggleClass('is-active', mode === 'task');
                dateZone.toggleClass('is-visible', mode === 'task');
                saveBtn.textContent = mode === 'task' ? 'ADD TASK' : 'CAPTURE';
            };
            thoughtBtn.addEventListener('click', () => switchMode('thought'));
            taskBtn.addEventListener('click', () => switchMode('task'));

            // Save gate
            const refreshSave = () => {
                const empty = !textarea.value.trim();
                saveBtn.toggleClass('is-disabled', empty);
                saveBtn.disabled = empty;
            };

            // Inline smart triggers: @date, [[link, #tag, + checklist
            attachInlineTriggers(this.plugin.app, textarea, (d: string) => {
                captureDueDate = d;
                switchMode('task');
            }, (tag: string) => {
                if (!captureContexts.includes(tag)) { captureContexts.push(tag); renderChips(); }
                if (!this.plugin.settings.contexts) this.plugin.settings.contexts = [];
                if (!this.plugin.settings.contexts.includes(tag)) {
                    this.plugin.settings.contexts.push(tag); // in-memory only; persisted on capture
                }
            }, () => this.plugin.settings.contexts ?? []);

            const refreshCaptureInput = () => {
                refreshSave();
                syncTextareaHeight(textarea);
            };
            textarea.addEventListener('input', refreshCaptureInput);

            // Collapse
            const collapse = () => {
                this.view._capturePending = 0;
                cap.removeClass('is-expanded');
                captureContexts = []; captureDueDate = null;
                textarea.value = '';
                textarea.style.height = '';
                textarea.style.overflowY = '';
                switchMode('thought');
                renderChips();
                refreshSave();
            };

            // Expand
            const expand = () => {
                if (cap.hasClass('is-expanded')) return;
                this.view._capturePending = 1;
                cap.addClass('is-expanded');
                setTimeout(() => {
                    textarea.focus();
                    syncTextareaHeight(textarea);
                }, 60);
            };

            // Save
            const handleSave = async () => {
                const raw = textarea.value.trim();
                if (!raw) return;
                saveBtn.toggleClass('is-disabled', true);
                saveBtn.disabled = true;
                const text = raw.replace(/\n/g, '<br>');
                const contexts = parseContextString(captureContexts.map(c => `#${c}`).join(' '));
                const due = captureMode === 'task' ? captureDueDate ?? undefined : undefined;
                try {
                    if (captureMode === 'task') await this.vault.createTaskFile(text, contexts, due);
                    else await this.vault.createThoughtFile(text, contexts);
                    await this.plugin.saveSettings(); // persist any new contexts added during capture
                    new Notice(captureMode === 'task' ? 'Task added ✓' : 'Thought captured ✓', 1200);
                    collapse();
                } catch {
                    saveBtn.toggleClass('is-disabled', false);
                    saveBtn.disabled = false;
                    new Notice('Error saving — please try again', 2500);
                }
            };

            collapsedRow.addEventListener('click', expand);
            cancelBtn.addEventListener('click', collapse);
            saveBtn.addEventListener('click', handleSave);
            textarea.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
                if (e.key === 'Escape') collapse();
            });

            syncTextareaHeight(textarea);

            // Click-outside to collapse
            const onOutside = (e: MouseEvent) => {
                if (cap.hasClass('is-expanded') && !cap.contains(e.target as Node)) collapse();
            };
            parent.ownerDocument.addEventListener('mousedown', onOutside);

            // ⌘K / C shortcut
            const onKey = (e: KeyboardEvent) => {
                if (cap.hasClass('is-expanded')) return;
                const active = parent.ownerDocument.activeElement;
                const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement)?.isContentEditable;
                if (isTyping) return;
                if (e.key === 'c' || e.key === 'C') { e.preventDefault(); expand(); }
            };
            parent.ownerDocument.addEventListener('keydown', onKey);

            // Cleanup when removed from DOM
            const obs = new MutationObserver(() => {
                if (!cap.isConnected) {
                    parent.ownerDocument.removeEventListener('keydown', onKey);
                    parent.ownerDocument.removeEventListener('mousedown', onOutside);
                    obs.disconnect();
                }
            });
            obs.observe(parent.ownerDocument.body, { childList: true, subtree: true });
            return;
        }

        // ── Mobile path: inline expansion ────────────────────────────────────
        let captureContexts: string[] = [];
        let captureDueDate: string | null = null;
        let captureMode: 'thought' | 'task' = 'thought';

        const strip = parent.createEl('div', { cls: 'mina-mobile-capture-strip' });

        // Section 1: Collapsed pill row
        const collapsedRow = strip.createDiv({ cls: 'mina-mobile-capture-collapsed-row' });
        const iconWrap = collapsedRow.createDiv({ cls: 'mina-mobile-capture-strip-icon' });
        setIcon(iconWrap, 'lucide-pen-line');
        collapsedRow.createEl('span', { text: "What's on your mind…", cls: 'mina-mobile-capture-strip-ph' });

        // Section 2: Expansion body
        const expandBody = strip.createDiv({ cls: 'mina-capture-expand-body' });
        const canvas = expandBody.createDiv({ cls: 'mina-capture-inline-canvas' });
        const textarea = canvas.createEl('textarea', {
            cls: 'mina-capture-inline-textarea',
            attr: { placeholder: 'Capture thought…', rows: '4' }
        }) as HTMLTextAreaElement;

        const dock = expandBody.createDiv({ cls: 'mina-capture-inline-dock' });

        // 1. Mode toggle
        const toggleBar = dock.createDiv({ cls: 'mina-seg-bar mina-capture-inline-toggle' });
        const thoughtBtn = toggleBar.createEl('button', { text: '✦ THOUGHT', cls: 'mina-seg-btn is-active' });
        const taskBtn = toggleBar.createEl('button', { text: '✓ TASK', cls: 'mina-seg-btn' });

        // 2. Date zone (task mode only)
        const dateZone = dock.createDiv({ cls: 'mina-mobile-date-zone' });
        this._buildInlineDateStrip(dateZone, (d: string | null) => { captureDueDate = d; });

        // 3. Chip strip
        const chipStrip = dock.createDiv({ cls: 'mina-mobile-chip-strip' });

        const renderChips = () => {
            chipStrip.empty();
            if (captureContexts.length === 0) return;
            captureContexts.forEach(ctx => {
                const chip = chipStrip.createEl('span', { cls: 'mina-mobile-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createSpan({ text: '×', cls: 'mina-mobile-chip-x' });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    captureContexts = captureContexts.filter(c => c !== ctx);
                    renderChips();
                });
            });
        };
        renderChips();

        // 4. Action row
        const actionRow = dock.createDiv({ cls: 'mina-capture-inline-action-row' });
        const cancelBtn = actionRow.createEl('button', { text: 'CANCEL', cls: 'mina-capture-inline-cancel' });
        const saveBtn = actionRow.createEl('button', { text: 'CAPTURE', cls: 'mina-capture-inline-save is-disabled' }) as HTMLButtonElement;
        saveBtn.disabled = true;

        // Mode switch
        const switchMode = (mode: 'thought' | 'task') => {
            captureMode = mode;
            textarea.placeholder = mode === 'task' ? 'Execute intent…' : 'Capture thought…';
            thoughtBtn.toggleClass('is-active', mode === 'thought');
            taskBtn.toggleClass('is-active', mode === 'task');
            dateZone.toggleClass('is-visible', mode === 'task');
            saveBtn.textContent = mode === 'task' ? 'ADD TASK' : 'CAPTURE';
        };
        thoughtBtn.addEventListener('click', () => switchMode('thought'));
        taskBtn.addEventListener('click', () => switchMode('task'));

        // Save gate
        const refreshSave = () => {
            const empty = !textarea.value.trim();
            saveBtn.toggleClass('is-disabled', empty);
            saveBtn.disabled = empty;
        };

        // Collapse
        const collapse = () => {
            this.view._capturePending = 0;
            strip.removeClass('is-expanded');
            captureContexts = []; captureDueDate = null;
            textarea.value = '';
            textarea.style.height = '';
            textarea.style.overflowY = '';
            switchMode('thought');
            renderChips();
            refreshSave();
        };

        // Expand
        const expand = () => {
            this.view._capturePending = 1;
            strip.addClass('is-expanded');
            setTimeout(() => {
                textarea.focus();
                syncTextareaHeight(textarea);
            }, 80);
        };

        // Inline smart triggers: @date, [[link, #tag, + checklist
        attachInlineTriggers(this.plugin.app, textarea, (d: string) => {
            captureDueDate = d;
            switchMode('task');
        }, (tag: string) => {
            if (!captureContexts.includes(tag)) { captureContexts.push(tag); renderChips(); }
            if (!this.plugin.settings.contexts) this.plugin.settings.contexts = [];
            if (!this.plugin.settings.contexts.includes(tag)) {
                this.plugin.settings.contexts.push(tag); // in-memory only; persisted on capture
            }
        }, () => this.plugin.settings.contexts ?? []);

        const refreshCaptureInput = () => {
            refreshSave();
            syncTextareaHeight(textarea);
        };
        textarea.addEventListener('input', refreshCaptureInput);

        // Save
        const handleSave = async () => {
            const raw = textarea.value.trim();
            if (!raw) return;
            saveBtn.toggleClass('is-disabled', true);
            saveBtn.disabled = true;
            const text = raw.replace(/\n/g, '<br>');
            const contexts = parseContextString(captureContexts.map(c => `#${c}`).join(' '));
            const due = captureMode === 'task' ? captureDueDate ?? undefined : undefined;
            try {
                if (captureMode === 'task') await this.vault.createTaskFile(text, contexts, due);
                else await this.vault.createThoughtFile(text, contexts);
                await this.plugin.saveSettings(); // persist any new contexts added during capture
                new Notice(captureMode === 'task' ? 'Task added ✓' : 'Thought captured ✓', 1200);
                collapse();
            } catch {
                saveBtn.toggleClass('is-disabled', false);
                saveBtn.disabled = false;
                new Notice('Error saving — please try again', 2500);
            }
        };

        collapsedRow.addEventListener('click', expand);
        cancelBtn.addEventListener('click', collapse);
        saveBtn.addEventListener('click', handleSave);
        textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') collapse();
        });

        syncTextareaHeight(textarea);
    }

    // ── 2. Habit quick-bar ──────────────────────────────────────────────────
    private renderHabitQuickBar(parent: HTMLElement) {
        const allHabits = this.settings.habits || [];
        const habits = allHabits.filter(h => !h.archived);
        const section = parent.createEl('div', { cls: 'mina-habit-section' });
        const labelRow = section.createEl('div', { cls: 'mina-section-label-row' });
        labelRow.createEl('span', { text: 'HABITS', cls: 'mina-section-label' });

        // ⚙ config button (QW-02)
        const gearBtn = labelRow.createEl('button', { cls: 'mina-habit-config-btn', attr: { 'aria-label': 'Configure habits' } });
        gearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        gearBtn.addEventListener('click', () => { new HabitConfigModal(this.plugin.app, this.plugin).open(); });

        if (habits.length === 0) {
            section.createEl('span', { text: 'No habits configured — add them in Settings.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            return;
        }

        const completedToday = new Set<string>(this.index.habitStatusIndex);
        const today = moment().format('YYYY-MM-DD');
        let doneCount = habits.filter(h => completedToday.has(h.id)).length;
        const countEl = labelRow.createEl('span', { cls: 'mina-section-label-count', text: `${doneCount}/${habits.length}` });

        const barCls = (Platform.isMobile && !isTablet()) ? 'mina-habit-grid' : 'mina-habit-quick-bar';
        const bar = section.createEl('div', { cls: barCls });

        const progressBarWrap = section.createEl('div', { cls: 'mina-habit-progress-bar' });
        const progressBarFill = progressBarWrap.createEl('div', { cls: 'mina-habit-progress-fill' });

        const updateProgress = (count: number) => {
            progressBarFill.style.width = `${habits.length > 0 ? (count / habits.length) * 100 : 0}%`;
            // QW-05: all-complete celebration
            if (count === habits.length && habits.length > 0) {
                bar.addClass('all-complete');
                progressBarFill.addClass('all-complete');
            } else {
                bar.removeClass('all-complete');
                progressBarFill.removeClass('all-complete');
            }
        };
        updateProgress(doneCount);

        const maxNameLen = (Platform.isMobile && !isTablet()) ? 11 : 13; // QW-03: extended from 9
        for (const habit of habits) {
            const done = completedToday.has(habit.id);
            const btn = bar.createEl('button', { cls: `mina-habit-quick-btn${done ? ' is-done' : ''}`, attr: { title: habit.name } });
            btn.insertAdjacentHTML('afterbegin', '<svg class="mina-habit-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="mina-habit-ring-track" cx="18" cy="18" r="15.9"/><circle class="mina-habit-ring-fill" cx="18" cy="18" r="15.9"/></svg>');
            btn.createEl('span', { text: habit.icon || '●', cls: 'mina-habit-quick-icon' });
            btn.createEl('span', { text: habit.name.substring(0, maxNameLen), cls: 'mina-habit-quick-label' });
            if (!Platform.isMobile || isTablet()) btn.createEl('div', { cls: 'mina-habit-tooltip', text: habit.name });

            btn.addEventListener('click', async () => {
                const nowDone = btn.hasClass('is-done');
                btn.toggleClass('is-done', !nowDone);
                if (!nowDone) { btn.addClass('just-done'); setTimeout(() => btn.removeClass('just-done'), 420); }
                doneCount = nowDone ? doneCount - 1 : doneCount + 1;
                const clamped = Math.max(0, Math.min(habits.length, doneCount));
                countEl.textContent = `${clamped}/${habits.length}`;
                updateProgress(clamped);
                this.view._habitTogglePending++;
                await this.plugin.toggleHabit(today, habit.id);
                setTimeout(() => { this.view._habitTogglePending = Math.max(0, this.view._habitTogglePending - 1); }, 350);
            });
        }
    }

    // ── 4. Weekly Goals ───────────────────────────────────────────────────────
    private renderWeeklyGoals(parent: HTMLElement) {
        const goals = (this.settings.weeklyGoals || []).filter(g => g && g.trim());
        const card = parent.createEl('div', { cls: 'mina-goal-card' });
        const header = card.createEl('div', { cls: 'mina-goal-card-header' });
        header.createEl('span', { text: 'WEEKLY', cls: 'mina-goal-card-title' });
        const editBtn = header.createEl('button', { text: 'Edit', cls: 'mina-goal-edit-btn',
            attr: { style: `padding: ${Platform.isMobile && !isTablet() ? '10px 12px' : '2px 4px'}; min-height: ${Platform.isMobile && !isTablet() ? '44px' : 'auto'};` }
        });
        editBtn.addEventListener('click', () => { this.view.activeTab = 'review'; this.view.renderView(); });

        if (!goals.length) {
            card.createEl('div', { text: 'No weekly goals — add in Review.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            return;
        }
        goals.slice(0, 3).forEach((goal, i) => {
            const item = card.createEl('div', { cls: 'mina-goal-item' });
            item.createEl('span', { text: String(i + 1), cls: 'mina-goal-num mina-goal-num--weekly' });
            item.createEl('span', { text: goal, cls: 'mina-goal-text' });
        });
        if (goals.length > 3) {
            const more = card.createEl('button', { text: `+ ${goals.length - 3} more`, cls: 'mina-goal-more-link' });
            more.addEventListener('click', () => {
                more.remove();
                goals.slice(3).forEach((goal, i) => {
                    const item = card.createEl('div', { cls: 'mina-goal-item' });
                    item.createEl('span', { text: String(i + 4), cls: 'mina-goal-num mina-goal-num--weekly' });
                    item.createEl('span', { text: goal, cls: 'mina-goal-text' });
                });
            });
        }
    }

    // ── 5. Monthly Goals ──────────────────────────────────────────────────────
    private renderMonthlyGoals(parent: HTMLElement) {
        const goals = (this.settings.monthlyGoals || []).filter(g => g && g.trim());
        const card = parent.createEl('div', { cls: 'mina-goal-card' });
        const header = card.createEl('div', { cls: 'mina-goal-card-header' });
        header.createEl('span', { text: 'MONTHLY', cls: 'mina-goal-card-title' });

        let isExpanded = !Platform.isMobile || isTablet();
        const listEl = card.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        if (!isExpanded) listEl.style.display = 'none';

        if (Platform.isMobile && !isTablet()) {
            const countSpan = header.createEl('span', { text: String(goals.length), attr: { style: 'font-size: 0.72em; font-weight: 700; color: var(--text-faint); margin-left: auto;' } });
            const chevron = header.createDiv({ attr: { style: 'color: var(--text-faint); margin-left: 6px;' } });
            setIcon(chevron, 'chevron-right');
            header.style.cursor = 'pointer';
            header.style.minHeight = '44px';
            header.addEventListener('click', () => {
                isExpanded = !isExpanded;
                listEl.style.display = isExpanded ? 'flex' : 'none';
                setIcon(chevron, isExpanded ? 'chevron-down' : 'chevron-right');
            });
        } else {
            const editBtn = header.createEl('button', { text: 'Edit', cls: 'mina-goal-edit-btn' });
            editBtn.addEventListener('click', () => { this.view.activeTab = 'monthly-review'; this.view.renderView(); });
        }

        if (!goals.length) {
            listEl.createEl('div', { text: 'No monthly goals — add in Monthly Review.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            listEl.style.display = 'flex';
            return;
        }
        goals.slice(0, 3).forEach((goal, i) => {
            const item = listEl.createEl('div', { cls: 'mina-goal-item' });
            item.createEl('span', { text: String(i + 1), cls: 'mina-goal-num mina-goal-num--monthly' });
            item.createEl('span', { text: goal, cls: 'mina-goal-text' });
        });
        if (goals.length > 3) {
            const more = listEl.createEl('button', { text: `+ ${goals.length - 3} more`, cls: 'mina-goal-more-link' });
            more.addEventListener('click', () => {
                more.remove();
                goals.slice(3).forEach((goal, i) => {
                    const item = listEl.createEl('div', { cls: 'mina-goal-item' });
                    item.createEl('span', { text: String(i + 4), cls: 'mina-goal-num mina-goal-num--monthly' });
                    item.createEl('span', { text: goal, cls: 'mina-goal-text' });
                });
            });
        }
    }

    private renderDailyRoutine(parent: HTMLElement) {
        if (this.index.checklistIndex.length === 0) return;

        const section = parent.createEl('div', { cls: 'mina-section--hideable', attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        section.createEl('span', { text: 'DAILY ROUTINE', cls: 'mina-section-label' });
        const list = section.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });

        this.index.checklistIndex.forEach(item => {
            this.renderTacticalRow(list, item.text, item.done, async () => {
                item.done = !item.done;
                this.render(this.parentContainer);
                const file = this.app.vault.getAbstractFileByPath(`${this.settings.captureFolder}/${this.settings.captureFilePath}`) as TFile;
                if (file) {
                    const content = await this.app.vault.read(file);
                    const updated = content.replace(item.line, item.line.replace(item.done ? '- [ ]' : '- [x]', item.done ? '- [x]' : '- [ ]'));
                    await this.app.vault.modify(file, updated);
                }
            });
        });
    }

    // ── 7. Intelligence ──────────────────────────────────────────────────────
    private renderIntelligence(parent: HTMLElement) {
        const intel = parent.createEl('div', { cls: 'mina-intel-card mina-section--hideable' });

        const intelHeader = intel.createEl('div', { cls: 'mina-intel-header' });
        const titleRow = intelHeader.createEl('div', { cls: 'mina-intel-title-row' });
        const iIcon = titleRow.createDiv({ cls: 'mina-intel-icon' }); setIcon(iIcon, 'lucide-sparkles');
        titleRow.createSpan({ text: 'INTELLIGENCE', cls: 'mina-intel-label' });
        const tsEl = intelHeader.createSpan({ cls: 'mina-intel-timestamp', text: '' });

        const idx = this.index;
        const todayM = moment().startOf('day');
        const openTasks = Array.from(idx.taskIndex.values()).filter(t => t.status === 'open');
        const overdueTasks = openTasks.filter(t => t.due && moment(t.due, 'YYYY-MM-DD').isValid() && moment(t.due, 'YYYY-MM-DD').isBefore(todayM, 'day'));
        const completedHabits = idx.habitStatusIndex.length;
        const totalHabits = this.settings.habits?.length || 0;
        const unsynth = Array.from(idx.thoughtIndex.values()).filter(t => !t.synthesized).length;
        const dues = idx.totalDues || 0;

        const strip = intel.createEl('div', { cls: 'mina-intel-status-strip' });
        const addStat = (value: string, label: string, danger = false, success = false) => {
            const stat = strip.createEl('div', { cls: 'mina-intel-stat' });
            stat.createEl('div', { text: value, cls: `mina-intel-stat-value${danger ? ' is-danger' : success ? ' is-success' : ''}` });
            stat.createEl('div', { text: label, cls: 'mina-intel-stat-label' });
        };
        addStat(String(openTasks.length), 'OPEN TASKS', overdueTasks.length > 0);
        addStat(`${completedHabits}/${totalHabits}`, 'HABITS', false, completedHabits === totalHabits && totalHabits > 0);
        addStat(String(unsynth), 'THOUGHTS');
        addStat(`$${dues.toFixed(0)}`, 'DUES', dues > 0);

        const body = intel.createEl('div', { text: 'Strategic briefing pending analysis.', cls: 'mina-intel-body' });

        const analyzeBtn = intel.createEl('button', { cls: 'mina-intel-analyze-btn' });
        const btnIcon = analyzeBtn.createDiv(); setIcon(btnIcon, 'lucide-sparkles');
        analyzeBtn.createSpan({ text: 'SYNTHESIZE BRIEFING' });

        analyzeBtn.addEventListener('click', async () => {
            body.empty();
            body.removeClass('has-content');
            body.addClass('is-loading');
            body.setText('');
            tsEl.setText('');
            analyzeBtn.disabled = true;
            try {
                const contextBlock = [
                    `## Status — ${moment().format('dddd, MMMM D, YYYY')}`,
                    `**Open Tasks:** ${openTasks.length} (${overdueTasks.length} overdue)`,
                    `**Habits:** ${completedHabits}/${totalHabits}`,
                    `**Unprocessed Thoughts:** ${unsynth}`,
                    `**Financial Obligations:** $${dues.toFixed(2)}`,
                    this.settings.northStarGoals?.[0] ? `**North Star:** ${this.settings.northStarGoals[0]}` : '',
                    overdueTasks.length ? `**Overdue:** ${overdueTasks.slice(0, 5).map(t => t.title).join(', ')}` : '',
                ].filter(Boolean).join('\n');
                const summary = await this.ai.callGemini(`${contextBlock}\n\nSharp strategic briefing: what needs attention now? What's at risk? Be direct.`, [], false, [], idx.thoughtIndex);
                body.removeClass('is-loading');
                body.setText(summary);
                body.addClass('has-content');
                tsEl.setText(moment().format('h:mm A'));
            } catch (e: any) {
                body.removeClass('is-loading');
                body.setText('Intelligence offline: ' + e.message);
            } finally {
                analyzeBtn.disabled = false;
            }
        });
    }

    private renderTacticalRow(parent: HTMLElement, text: string, done: boolean, onToggle: () => void) {
        const row = parent.createEl('div', { cls: `mina-tactical-row${done ? ' is-done' : ''}`, attr: { style: 'cursor: default;' } });
        const isPhone = Platform.isMobile && !isTablet();
        const cbWrap = row.createDiv({ attr: { style: `padding: ${isPhone ? '12px' : '4px'}; cursor: pointer;` } });
        if (isPhone) (row as HTMLElement).style.minHeight = '48px';
        const cb = cbWrap.createDiv({ cls: 'mina-tactical-checkbox' });
        if (done) setIcon(cb, 'lucide-check');
        cbWrap.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
        row.createEl('span', { text, cls: 'mina-tactical-text', attr: { style: done ? 'text-decoration: line-through; opacity: 0.45;' : '' } });
    }

    private renderNavigationFooter(parent: HTMLElement) {
        const nav = parent.createEl('div', { cls: 'mina-nav-grid mina-section--hideable' });

        const renderCluster = (title: string, items: {label: string, icon: string, tab: string}[], modifierCls: string) => {
            const wrap = nav.createEl('div', { cls: 'mina-nav-cluster-wrap' });
            const isCollapsibleOnMobile = Platform.isMobile && !isTablet() && modifierCls !== 'mina-pillar-cluster--action';
            let isExpanded = !isCollapsibleOnMobile;

            const headerRow = wrap.createEl('div', { attr: { style: `display: flex; align-items: center; justify-content: space-between;${isCollapsibleOnMobile ? ' cursor: pointer; min-height: 44px;' : ''}` } });
            headerRow.createEl('h3', { text: title, cls: 'mina-cluster-label' });

            const cluster = wrap.createEl('div', { cls: `mina-pillar-cluster ${modifierCls}` });
            if (!isExpanded) cluster.style.display = 'none';

            if (isCollapsibleOnMobile) {
                const chevron = headerRow.createDiv({ attr: { style: 'color: var(--text-faint);' } });
                setIcon(chevron, 'chevron-down');
                headerRow.addEventListener('click', () => {
                    isExpanded = !isExpanded;
                    cluster.style.display = isExpanded ? 'flex' : 'none';
                    setIcon(chevron, isExpanded ? 'chevron-up' : 'chevron-down');
                });
            }

            items.forEach(i => {
                const item = cluster.createEl('div', { cls: 'mina-pillar-item', attr: { tabindex: '0' } });
                const iconWrap = item.createDiv({ cls: 'mina-pillar-icon' }); setIcon(iconWrap, i.icon);
                item.createSpan({ text: i.label, cls: 'mina-pillar-label' });
                item.addEventListener('click', () => { this.plugin.activateView(i.tab, false); });
                item.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); item.click(); } });
            });
        };

        renderCluster('ACTION',     [{ label: 'Tasks',    icon: 'lucide-check-square-2', tab: 'review-tasks' }, { label: 'Finance', icon: PF_ICON_ID, tab: 'dues' }, { label: 'Habits', icon: 'lucide-flame', tab: 'habits' }, { label: 'Workspace', icon: WORKSPACE_ICON_ID, tab: 'daily-workspace' }], 'mina-pillar-cluster--action');
        renderCluster('MANAGEMENT', [{ label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' }, { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' }, { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' }, { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' }], 'mina-pillar-cluster--mgmt');
        renderCluster('SYSTEM',     [{ label: 'AI Chat',  icon: AI_CHAT_ICON_ID, tab: 'mina-ai' }, { label: 'Voice', icon: 'lucide-mic', tab: 'voice-note' }, { label: 'Weekly', icon: REVIEW_ICON_ID, tab: 'review' }, { label: 'Monthly', icon: 'lucide-calendar-range', tab: 'monthly-review' }, { label: 'Compass', icon: COMPASS_ICON_ID, tab: 'compass' }, { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' }], 'mina-pillar-cluster--system');
    }

    /** Attach # autocomplete suggestions to a capture textarea.
     *  When the user types #partial, shows filtered tag pills inline.
     *  Clicking a pill inserts `#tag ` into the textarea, which the
     *  attachInlineTriggers handler converts to a chip automatically. */
    private _buildInlineDateStrip(
        container: HTMLElement,
        onDateChange: (d: string | null) => void
    ): { setDueDate: (d: string) => void } {
        const strip = container.createDiv({ cls: 'mina-date-strip' });
        const display = container.createDiv({ cls: 'mina-date-display' });
        display.style.display = 'none';
        const btnEls: HTMLButtonElement[] = [];

        const updateDisplay = (dateStr: string | null) => {
            display.empty();
            if (!dateStr) { display.style.display = 'none'; return; }
            display.style.display = 'flex';
            display.createSpan({ text: '📅', cls: 'mina-date-display-icon' });
            const lbl = display.createSpan({ text: moment(dateStr).format('dddd, MMM D'), cls: 'mina-date-display-label' });
            const clr = display.createSpan({ text: '×', cls: 'mina-date-display-clear' });
            lbl.addEventListener('click', () => showNLPInput());
            clr.addEventListener('click', () => { onDateChange(null); updateDisplay(null); btnEls.forEach(b => b.removeClass('is-selected')); });
        };

        const setDueDate = (d: string) => { onDateChange(d); updateDisplay(d); };

        const today = moment();
        const dow = today.day();
        const daysToFriday = dow <= 4 ? (5 - dow) : (12 - dow);
        const rawShortcuts = [
            { label: 'TODAY', days: 0 },
            { label: 'TMRW', days: 1 },
            { label: daysToFriday > 2 ? 'THIS FRI' : '+7D', days: daysToFriday > 2 ? daysToFriday : 7 },
            { label: '+7D', days: 7 },
            { label: '+30D', days: 30 },
        ];
        const shortcuts = rawShortcuts.filter((s, i, a) => a.findIndex(x => x.days === s.days) === i);

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

        const pickBtn = strip.createEl('button', { text: 'PICK ▾', cls: 'mina-date-shortcut-btn mina-date-pick-btn' });
        pickBtn.addEventListener('click', () => showNLPInput());

        const showNLPInput = () => {
            container.querySelector('.mina-date-nlp-wrap')?.remove();
            const wrap = container.createDiv({ cls: 'mina-date-nlp-wrap' });
            const input = wrap.createEl('input', {
                type: 'text', cls: 'mina-date-nlp-input',
                attr: { placeholder: 'next tuesday, in 3 weeks…' }
            }) as HTMLInputElement;
            input.focus();
            input.addEventListener('keydown', (e: KeyboardEvent) => {
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
}
