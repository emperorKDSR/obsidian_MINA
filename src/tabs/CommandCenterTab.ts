import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID, SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID } from '../constants';
import { parseContextString, parseNaturalDate, isTablet } from '../utils';
import type { TaskEntry } from '../types';

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
        this.renderCaptureBar(wrap);
        this.renderHabitQuickBar(wrap);
        this.renderZenBanner(wrap);
        this.renderToDo(wrap);
        const goalsDual = wrap.createEl('div', { cls: 'mina-goals-pane mina-section--hideable' });
        this.renderWeeklyGoals(goalsDual);
        this.renderMonthlyGoals(goalsDual);
        this.renderDailyRoutine(wrap);
        this.renderIntelligence(wrap);
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
        const zenSize = Platform.isMobile ? '48px' : '42px';
        const zenToggle = headerRow.createEl('button', {
            cls: `mina-zen-btn${this.view.isZenMode ? ' is-active' : ''}`,
            attr: { title: this.view.isZenMode ? 'Exit Zen' : 'Enter Zen', style: `width: ${zenSize}; height: ${zenSize}; min-width: ${zenSize};` }
        });
        setIcon(zenToggle, 'lucide-target');
        zenToggle.addEventListener('click', () => {
            this.view.isZenMode = !this.view.isZenMode;
            if (Platform.isMobile) new Notice(this.view.isZenMode ? '⚡ Zen Mode — Focus engaged' : '🗺 Zen Mode off', 1500);
            this.render(this.parentContainer);
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
        // ── Desktop / tablet path: modal ─────────────────────────────────────
        if (!Platform.isMobile || isTablet()) {
            const openCapture = () => {
                new EditEntryModal(this.app, this.plugin, '', '', null, false, async (text, ctxs) => {
                    if (!text.trim()) return;
                    await this.vault.createThoughtFile(text, parseContextString(ctxs));
                }, 'Capture').open();
            };
            const cap = parent.createEl('div', { cls: 'mina-capture-bar' });
            const iconWrap = cap.createDiv({ cls: 'mina-capture-icon-wrap' });
            setIcon(iconWrap, 'lucide-plus');
            cap.createEl('span', { text: "What's on your mind…", cls: 'mina-capture-placeholder' });
            cap.createEl('span', { text: '⌘K', cls: 'mina-capture-kbd' });
            cap.addEventListener('click', openCapture);
            const onKey = (e: KeyboardEvent) => {
                const active = document.activeElement;
                const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement)?.isContentEditable;
                if (isTyping) return;
                if (e.key === 'c' || e.key === 'C') { e.preventDefault(); openCapture(); }
            };
            parent.ownerDocument.addEventListener('keydown', onKey);
            const obs = new MutationObserver(() => {
                if (!cap.isConnected) { parent.ownerDocument.removeEventListener('keydown', onKey); obs.disconnect(); }
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

        // 3. Chip strip + tag picker
        const chipStrip = dock.createDiv({ cls: 'mina-mobile-chip-strip' });
        const tagPickerContainer = dock.createDiv({ cls: 'mina-capture-inline-tag-picker' });

        const renderChips = () => {
            chipStrip.empty();
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
            const addBtn = chipStrip.createEl('button', { text: '+', cls: 'mina-mobile-chip-add' });
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleInlineCaptureTagPicker(
                    tagPickerContainer,
                    this.plugin.settings.contexts ?? [],
                    () => captureContexts,
                    (ctx: string) => {
                        if (!captureContexts.includes(ctx)) { captureContexts.push(ctx); renderChips(); }
                    }
                );
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
        textarea.addEventListener('input', refreshSave);

        // Collapse
        const collapse = () => {
            strip.removeClass('is-expanded');
            captureContexts = []; captureDueDate = null;
            textarea.value = '';
            switchMode('thought');
            renderChips();
            tagPickerContainer.removeClass('is-open');
            tagPickerContainer.empty();
            refreshSave();
        };

        // Expand
        const expand = () => {
            strip.addClass('is-expanded');
            setTimeout(() => textarea.focus(), 80);
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
    }

    // ── 2. Habit quick-bar ──────────────────────────────────────────────────
    private renderHabitQuickBar(parent: HTMLElement) {
        const habits = this.settings.habits || [];
        const section = parent.createEl('div', { cls: 'mina-habit-section' });
        const labelRow = section.createEl('div', { cls: 'mina-section-label-row' });
        labelRow.createEl('span', { text: 'HABITS', cls: 'mina-section-label' });

        if (habits.length === 0) {
            section.createEl('span', { text: 'No habits configured — add them in Settings.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            return;
        }

        const completedToday = new Set<string>(this.index.habitStatusIndex);
        const today = moment().format('YYYY-MM-DD');
        let doneCount = habits.filter(h => completedToday.has(h.id)).length;
        const countEl = labelRow.createEl('span', { cls: 'mina-section-label-count', text: `${doneCount}/${habits.length}` });

        const barCls = Platform.isMobile ? 'mina-habit-grid' : 'mina-habit-quick-bar';
        const bar = section.createEl('div', { cls: barCls });

        const progressBarWrap = section.createEl('div', { cls: 'mina-habit-progress-bar' });
        const progressBarFill = progressBarWrap.createEl('div', { cls: 'mina-habit-progress-fill' });
        progressBarFill.style.width = `${habits.length > 0 ? (doneCount / habits.length) * 100 : 0}%`;

        for (const habit of habits) {
            const done = completedToday.has(habit.id);
            const btn = bar.createEl('button', { cls: `mina-habit-quick-btn${done ? ' is-done' : ''}`, attr: { title: habit.name } });
            btn.insertAdjacentHTML('afterbegin', '<svg class="mina-habit-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="mina-habit-ring-track" cx="18" cy="18" r="15.9"/><circle class="mina-habit-ring-fill" cx="18" cy="18" r="15.9"/></svg>');
            btn.createEl('span', { text: habit.icon || '●', cls: 'mina-habit-quick-icon' });
            btn.createEl('span', { text: habit.name.substring(0, 9), cls: 'mina-habit-quick-label' });
            if (!Platform.isMobile) btn.createEl('div', { cls: 'mina-habit-tooltip', text: habit.name });

            btn.addEventListener('click', async () => {
                const nowDone = btn.hasClass('is-done');
                btn.toggleClass('is-done', !nowDone);
                if (!nowDone) { btn.addClass('just-done'); setTimeout(() => btn.removeClass('just-done'), 420); }
                doneCount = nowDone ? doneCount - 1 : doneCount + 1;
                const clamped = Math.max(0, Math.min(habits.length, doneCount));
                countEl.textContent = `${clamped}/${habits.length}`;
                progressBarFill.style.width = `${habits.length > 0 ? (clamped / habits.length) * 100 : 0}%`;
                this.view._habitTogglePending++;
                await this.plugin.toggleHabit(today, habit.id);
                setTimeout(() => { this.view._habitTogglePending = Math.max(0, this.view._habitTogglePending - 1); }, 350);
            });
        }
    }

    // ── 3. To Do ──────────────────────────────────────────────────────────────
    private renderToDo(parent: HTMLElement) {
        const today = moment().startOf('day');
        const allOpen = Array.from(this.index.taskIndex.values()).filter(t => t.status === 'open');
        const parsed = allOpen.map(t => ({ task: t, m: t.due && t.due.trim() ? moment(t.due, 'YYYY-MM-DD') : null }));

        const overdue  = parsed.filter(({m}) => m?.isValid() && m.isBefore(today, 'day')).map(x => x.task)
                               .sort((a, b) => moment(a.due).valueOf() - moment(b.due).valueOf());
        const dueToday = parsed.filter(({m}) => m?.isValid() && m.isSame(today, 'day')).map(x => x.task)
                               .sort((a, b) => moment(a.due).valueOf() - moment(b.due).valueOf());
        const upcoming = parsed.filter(({m}) => m?.isValid() && m.isAfter(today, 'day')).map(x => x.task)
                               .sort((a, b) => moment(a.due).valueOf() - moment(b.due).valueOf());
        const noDate   = parsed.filter(({m}) => !m || !m.isValid()).map(x => x.task)
                               .sort((a, b) => b.lastUpdate - a.lastUpdate);

        const totalCount = overdue.length + dueToday.length + upcoming.length + noDate.length;

        const section = parent.createEl('div', { cls: 'mina-section--hideable', attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        const labelRow = section.createEl('div', { cls: 'mina-section-label-row', attr: { style: 'cursor: pointer; user-select: none;' } });
        labelRow.createEl('span', { text: 'TO DO', cls: 'mina-section-label' });
        if (totalCount > 0) {
            labelRow.createEl('span', { text: String(totalCount), cls: 'mina-section-label-count' });
        }

        const chevron = labelRow.createDiv({ attr: { style: 'color: var(--text-faint); margin-left: auto; display: flex; align-items: center; transition: transform 0.2s;' } });
        setIcon(chevron, 'chevron-down');

        const body = section.createEl('div', { cls: 'mina-todo-body' });

        let isCollapsed = false;
        labelRow.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            body.style.display = isCollapsed ? 'none' : 'flex';
            chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        });

        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.gap = '6px';

        this.renderChecklist(body);

        if (!overdue.length && !dueToday.length && !upcoming.length && !noDate.length) return;

        const list = body.createEl('div', { cls: 'mina-task-list' });

        const renderGroup = (label: string, tasks: TaskEntry[], groupCls: string, collapsed = false, cap = 5) => {
            if (!tasks.length) return;
            const group = list.createEl('div', { cls: `mina-task-group ${groupCls}` });
            const labelEl = group.createEl('div', { cls: `mina-task-group-label${groupCls.includes('overdue') ? ' is-danger' : ''}`, attr: { style: 'cursor: pointer;' } });
            labelEl.createEl('span', { text: label });
            const groupChevron = labelEl.createDiv({ attr: { style: 'color: var(--text-faint); margin-left: auto; display: flex; align-items: center; transition: transform 0.2s;' } });
            setIcon(groupChevron, collapsed ? 'chevron-right' : 'chevron-down');
            if (collapsed) {
                group.addClass('mina-task-group--collapsible');
                group.addClass('is-collapsed');
                labelEl.createEl('span', { text: String(tasks.length), cls: 'mina-group-count-badge' });
            }
            const groupBody = group.createEl('div', { cls: 'mina-task-group-body' });
            tasks.slice(0, cap).forEach(t => this.renderToDoRow(t, groupBody, list));
            labelEl.addEventListener('click', () => {
                const nowCollapsed = !group.hasClass('is-collapsed');
                group.toggleClass('is-collapsed', nowCollapsed);
                setIcon(groupChevron, nowCollapsed ? 'chevron-right' : 'chevron-down');
            });
        };

        renderGroup('Overdue',  overdue,  'mina-task-group--overdue',    false, 10);
        renderGroup('Today',    dueToday, 'mina-task-group--today',       false, 10);
        renderGroup('Upcoming', upcoming, 'mina-task-group--collapsible', true,  5);
        if (noDate.length) renderGroup('No Date', noDate, 'mina-task-group--collapsible', true, 3);
    }

    private renderChecklist(parent: HTMLElement) {
        const todayStr = moment().format('YYYY-MM-DD');

        this.view.checklistCompletedToday.forEach((v, k) => {
            if (v.date !== todayStr) this.view.checklistCompletedToday.delete(k);
        });

        const openItems = this.index.thoughtChecklistIndex;

        type CItem = { filePath: string; text: string; line: string; lineIndex: number; done: boolean };
        const keyOf = (item: CItem) => `${item.filePath}:${item.lineIndex}`;

        const buildCombined = (): CItem[] => {
            const open: CItem[] = openItems.map(i => ({ ...i, done: false }));
            const doneFromVault: CItem[] = this.index.thoughtDoneChecklistIndex.map(i => ({ ...i, done: true }));
            const doneFromSession: CItem[] = [...this.view.checklistCompletedToday.entries()]
                .filter(([, v]) => v.date === todayStr)
                .map(([k, v]) => {
                    const colonIdx = k.lastIndexOf(':');
                    return { filePath: k.substring(0, colonIdx), text: v.text, line: '', lineIndex: Number(k.substring(colonIdx + 1)), done: true };
                })
                .filter(s => !doneFromVault.some(d => d.filePath === s.filePath && d.lineIndex === s.lineIndex));
            const done: CItem[] = [...doneFromVault, ...doneFromSession];
            const orderMap = new Map(this.view.checklistOrder.map((k, i) => [k, i]));
            const allItems = [...open, ...done];
            allItems.sort((a, b) => {
                const ai = orderMap.get(keyOf(a)) ?? Infinity;
                const bi = orderMap.get(keyOf(b)) ?? Infinity;
                if (ai === Infinity && bi === Infinity) return (a.done ? 1 : 0) - (b.done ? 1 : 0);
                return ai - bi;
            });
            return allItems;
        };

        let ordered = buildCombined();
        if (!ordered.length) return;

        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        const clHeaderRow = section.createEl('div', { cls: 'mina-section-label-row' });
        clHeaderRow.createEl('span', { text: 'CHECKLIST', cls: 'mina-section-label' });

        // Right-side control group: [done count] [eye] [refresh]
        const clControls = clHeaderRow.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 2px; margin-left: auto;' } });

        const doneItems = ordered.filter(i => i.done);
        const doneCountBadge = clControls.createEl('span', { cls: 'mina-section-label-count', text: `${doneItems.length} done` });
        doneCountBadge.style.display = doneItems.length > 0 ? '' : 'none';

        let showDone = this.view.checklistShowDone;
        const eyeBtn = clControls.createEl('button', {
            cls: 'mina-refresh-btn',
            attr: { title: showDone ? 'Hide completed' : 'Show completed', style: 'background: none; border: none; cursor: pointer; color: var(--text-faint); border-radius: 4px; transition: color 0.15s;' }
        });
        setIcon(eyeBtn, showDone ? 'eye' : 'eye-off');
        eyeBtn.addEventListener('click', () => {
            showDone = !showDone;
            this.view.checklistShowDone = showDone;
            setIcon(eyeBtn, showDone ? 'eye' : 'eye-off');
            eyeBtn.setAttribute('title', showDone ? 'Hide completed' : 'Show completed');
            renderItems(ordered);
        });

        const refreshBtn = clControls.createEl('button', {
            cls: 'mina-refresh-btn',
            attr: { title: 'Refresh checklist', style: 'background: none; border: none; cursor: pointer; color: var(--text-faint); border-radius: 4px; transition: color 0.15s;' }
        });
        setIcon(refreshBtn, 'refresh-cw');
        if (!Platform.isMobile) {
            refreshBtn.addEventListener('mouseenter', () => { refreshBtn.style.color = 'var(--text-normal)'; });
            refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.color = 'var(--text-faint)'; });
        }
        refreshBtn.addEventListener('click', async () => {
            setIcon(refreshBtn, 'loader');
            refreshBtn.style.opacity = '0.5';
            await this.index.buildThoughtIndex();
            this.view.renderView();
        });

        const list = section.createEl('div', { attr: { style: 'display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; border: 1px solid var(--background-modifier-border-faint);' } });
        let dragSrcIdx: number | null = null;

        const renderItems = (items: CItem[]) => {
            list.empty();
            const visible = showDone ? items : items.filter(i => !i.done);
            // Update badge
            const currentDone = items.filter(i => i.done).length;
            doneCountBadge.textContent = `${currentDone} done`;
            doneCountBadge.style.display = currentDone > 0 ? '' : 'none';

            visible.forEach((item) => {
                const row = list.createEl('div', {
                    attr: { style: `display: flex; align-items: center; gap: 10px; padding: 7px 12px; background: var(--background-primary); border-bottom: 1px solid var(--background-modifier-border-faint); transition: background 0.15s; ${!Platform.isMobile ? 'cursor: grab;' : ''}` }
                });

                const cb = row.createEl('div', { cls: `mina-task-cb${item.done ? ' is-done' : ''}`, attr: { style: 'flex-shrink: 0;' } });
                if (item.done) { const ck = cb.createEl('span'); setIcon(ck, 'check'); }

                const titleEl = row.createEl('span', {
                    text: item.text,
                    attr: { style: `flex: 1; font-size: 0.85em; font-weight: 500; color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;${item.done ? ' text-decoration: line-through; opacity: 0.4;' : ''}` }
                });

                const grip = row.createEl('div', { attr: { style: 'color: var(--text-faint); flex-shrink: 0; display: flex; align-items: center;' } });
                setIcon(grip, 'grip-vertical');

                if (!item.done) {
                    cb.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        cb.addClass('is-done');
                        const ck = cb.createEl('span'); setIcon(ck, 'check');
                        titleEl.style.textDecoration = 'line-through';
                        titleEl.style.opacity = '0.4';

                        const key = keyOf(item);
                        this.view.checklistCompletedToday.set(key, { text: item.text, date: todayStr });
                        const openItems2 = ordered.filter(x => !x.done && keyOf(x) !== key);
                        const doneItems2 = [...ordered.filter(x => x.done), { ...item, done: true }];
                        ordered = [...openItems2, ...doneItems2];
                        this.view.checklistOrder = ordered.map(keyOf);
                        renderItems(ordered);

                        this.view._checklistTogglePending++;
                        try {
                            const file = this.app.vault.getAbstractFileByPath(item.filePath);
                            if (file instanceof TFile) {
                                const content = await this.app.vault.read(file);
                                const fileLines = content.split('\n');
                                const lineIdx = fileLines.findIndex((l, idx) => idx >= item.lineIndex && l.trim() === item.line.trim());
                                if (lineIdx !== -1) {
                                    fileLines[lineIdx] = fileLines[lineIdx].replace('- [ ]', '- [x]');
                                    await this.app.vault.modify(file, fileLines.join('\n'));
                                }
                            }
                        } finally {
                            setTimeout(() => { this.view._checklistTogglePending = Math.max(0, this.view._checklistTogglePending - 1); }, 400);
                        }
                    });
                }

                if (!Platform.isMobile) {
                    row.setAttribute('draggable', 'true');
                    const orderedIdx = ordered.indexOf(item);
                    row.addEventListener('dragstart', (e) => { dragSrcIdx = orderedIdx; row.style.opacity = '0.4'; e.dataTransfer?.setData('text/plain', String(orderedIdx)); });
                    row.addEventListener('dragend', () => { row.style.opacity = ''; list.querySelectorAll<HTMLElement>('[draggable]').forEach(r => r.style.background = ''); });
                    row.addEventListener('dragover', (e) => { e.preventDefault(); row.style.background = 'var(--background-modifier-hover)'; });
                    row.addEventListener('dragleave', () => { row.style.background = ''; });
                    row.addEventListener('drop', (e) => {
                        e.preventDefault(); row.style.background = '';
                        if (dragSrcIdx === null || dragSrcIdx === orderedIdx) return;
                        const moved = ordered.splice(dragSrcIdx, 1)[0];
                        ordered.splice(orderedIdx, 0, moved);
                        this.view.checklistOrder = ordered.map(keyOf);
                        renderItems(ordered);
                    });
                } else {
                    grip.style.display = 'none';
                    const orderedIdx = ordered.indexOf(item);
                    const reorderWrap = row.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 1px; flex-shrink: 0;' } });
                    const upBtn = reorderWrap.createEl('button', { attr: { style: 'background: none; border: none; cursor: pointer; color: var(--text-faint); width: 28px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 4px;', title: 'Move up' } });
                    setIcon(upBtn, 'chevron-up');
                    const downBtn = reorderWrap.createEl('button', { attr: { style: 'background: none; border: none; cursor: pointer; color: var(--text-faint); width: 28px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 4px;', title: 'Move down' } });
                    setIcon(downBtn, 'chevron-down');
                    upBtn.addEventListener('click', (e) => { e.stopPropagation(); if (orderedIdx === 0) return; const moved = ordered.splice(orderedIdx, 1)[0]; ordered.splice(orderedIdx - 1, 0, moved); this.view.checklistOrder = ordered.map(keyOf); renderItems(ordered); });
                    downBtn.addEventListener('click', (e) => { e.stopPropagation(); if (orderedIdx >= ordered.length - 1) return; const moved = ordered.splice(orderedIdx, 1)[0]; ordered.splice(orderedIdx + 1, 0, moved); this.view.checklistOrder = ordered.map(keyOf); renderItems(ordered); });
                }
            });
        };

        renderItems(ordered);
    }

    private renderToDoRow(task: TaskEntry, parent: HTMLElement, listRoot?: HTMLElement) {
        const isDone = task.status === 'done';
        const dueM = task.due ? moment(task.due, 'YYYY-MM-DD', true) : null;
        const isOverdue = !isDone && dueM?.isValid() && dueM.isBefore(moment(), 'day');
        const isToday   = !isDone && dueM?.isValid() && dueM.isSame(moment(), 'day');

        const row = parent.createEl('div', { cls: `mina-task-row${isDone ? ' is-done' : ''}` });

        const cb = row.createEl('div', { cls: `mina-task-cb${isDone ? ' is-done' : ''}` });
        if (isDone) { const ck = cb.createEl('span'); setIcon(ck, 'check'); }

        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nextDone = !isDone;
            cb.empty();
            if (nextDone) {
                cb.addClass('is-done');
                const ck = cb.createEl('span'); setIcon(ck, 'check');
                titleEl.addClass('is-done');
            } else {
                cb.removeClass('is-done');
                titleEl.removeClass('is-done');
            }
            this.view._taskTogglePending++;
            await this.vault.toggleTask(task.filePath, nextDone);
            const h = row.offsetHeight;
            row.style.overflow = 'hidden';
            row.style.maxHeight = h + 'px';
            row.style.transition = 'max-height 0.32s ease, opacity 0.22s ease, padding 0.32s ease';
            await new Promise(r => setTimeout(r, 180));
            row.style.maxHeight = '0';
            row.style.opacity = '0';
            row.style.paddingTop = '0';
            row.style.paddingBottom = '0';
            setTimeout(() => {
                row.remove();
                this.view._taskTogglePending = Math.max(0, this.view._taskTogglePending - 1);
                const root = listRoot ?? parent;
                if (root.querySelectorAll('.mina-task-row').length === 0) {
                    root.createEl('div', { text: 'All clear ✓', attr: { style: 'font-size: 0.82em; color: var(--text-faint); font-style: italic; padding: 20px 0; text-align: center;' } });
                }
            }, 340);
        });

        const content = row.createEl('div', { cls: 'mina-task-content' });
        const titleEl = content.createEl('span', { text: task.title, cls: `mina-task-title${isDone ? ' is-done' : ''}` });

        const hasMeta = (task.due && dueM?.isValid()) || task.priority || task.context.length > 0;
        if (hasMeta) {
            const meta = content.createEl('div', { cls: 'mina-task-meta' });
            if (task.due && dueM?.isValid()) {
                const dateText = isToday ? 'Today' : dueM.format('MMM D');
                meta.createEl('span', { text: dateText, cls: `mina-chip mina-chip--date${isOverdue ? ' is-overdue' : isToday ? ' is-today' : ''}` });
            }
            if (task.priority) {
                const pMap: Record<string, string> = { high: 'high', medium: 'med', low: 'low' };
                meta.createEl('span', { text: pMap[task.priority] || task.priority, cls: `mina-chip mina-chip--pri-${task.priority}` });
            }
            task.context.slice(0, 2).forEach(ctx => meta.createEl('span', { text: `#${ctx}`, cls: 'mina-chip mina-chip--ctx' }));
        }

        // Action buttons — hover-reveal on desktop, always visible on mobile
        const actions = row.createEl('div', { cls: 'mina-task-actions' });
        if (Platform.isMobile) actions.style.opacity = '1';

        const editBtn = actions.createEl('button', { cls: 'mina-task-action-btn', attr: { title: 'Edit task', 'data-action': 'edit' } });
        setIcon(editBtn, 'pencil');
        editBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            new EditEntryModal(this.app, this.plugin, task.title, '', task as any, true,
                async (text: string) => { await this.vault.updateTaskTitle(task.filePath, text); }
            ).open();
        });

        const snoozeBtn = actions.createEl('button', { cls: 'mina-task-action-btn', attr: { title: 'Snooze to tomorrow', 'data-action': 'snooze' } });
        setIcon(snoozeBtn, 'clock');
        snoozeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
            await this.vault.setTaskDue(task.filePath, tomorrow);
            const h = row.offsetHeight;
            row.style.overflow = 'hidden';
            row.style.maxHeight = h + 'px';
            row.style.transition = 'max-height 0.3s ease, opacity 0.2s ease';
            await new Promise(r => setTimeout(r, 100));
            row.style.maxHeight = '0';
            row.style.opacity = '0';
            setTimeout(() => row.remove(), 320);
        });

        if (Platform.isMobile) {
            row.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).closest('.mina-task-action-btn')) return;
                cb.click();
            });
            row.style.cursor = 'pointer';
        } else {
            row.setAttribute('tabindex', '0');
            row.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cb.click(); }
                if (e.key === 'e' || e.key === 'E') { e.preventDefault(); editBtn.click(); }
                if (e.key === 's' || e.key === 'S') { e.preventDefault(); snoozeBtn.click(); }
                if (e.key === 'ArrowDown') { e.preventDefault(); (row.nextElementSibling as HTMLElement)?.focus(); }
                if (e.key === 'ArrowUp') { e.preventDefault(); (row.previousElementSibling as HTMLElement)?.focus(); }
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
            attr: { style: `padding: ${Platform.isMobile ? '10px 12px' : '2px 4px'}; min-height: ${Platform.isMobile ? '44px' : 'auto'};` }
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

        let isExpanded = !Platform.isMobile;
        const listEl = card.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        if (!isExpanded) listEl.style.display = 'none';

        if (Platform.isMobile) {
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
        const cbWrap = row.createDiv({ attr: { style: `padding: ${Platform.isMobile ? '12px' : '4px'}; cursor: pointer;` } });
        if (Platform.isMobile) (row as HTMLElement).style.minHeight = '48px';
        const cb = cbWrap.createDiv({ cls: 'mina-tactical-checkbox' });
        if (done) setIcon(cb, 'lucide-check');
        cbWrap.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
        row.createEl('span', { text, cls: 'mina-tactical-text', attr: { style: done ? 'text-decoration: line-through; opacity: 0.45;' : '' } });
    }

    private renderNavigationFooter(parent: HTMLElement) {
        const nav = parent.createEl('div', { cls: 'mina-nav-grid mina-section--hideable' });

        const renderCluster = (title: string, items: {label: string, icon: string, tab: string}[], modifierCls: string) => {
            const wrap = nav.createEl('div', { cls: 'mina-nav-cluster-wrap' });
            const isCollapsibleOnMobile = Platform.isMobile && modifierCls !== 'mina-pillar-cluster--action';
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
                item.addEventListener('click', () => { this.view.activeTab = i.tab; this.view.renderView(); });
                item.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); item.click(); } });
            });
        };

        renderCluster('ACTION',     [{ label: 'Tasks',    icon: 'lucide-check-square-2', tab: 'review-tasks' }, { label: 'Finance', icon: PF_ICON_ID, tab: 'dues' }, { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' }], 'mina-pillar-cluster--action');
        renderCluster('MANAGEMENT', [{ label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' }, { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' }, { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' }], 'mina-pillar-cluster--mgmt');
        renderCluster('SYSTEM',     [{ label: 'AI Chat',  icon: AI_CHAT_ICON_ID, tab: 'mina-ai' }, { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' }, { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' }], 'mina-pillar-cluster--system');
    }

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

    private _toggleInlineCaptureTagPicker(
        container: HTMLElement,
        allContexts: string[],
        getSelected: () => string[],
        onSelect: (ctx: string) => void
    ) {
        if (container.hasClass('is-open')) {
            container.removeClass('is-open');
            container.empty();
            return;
        }
        container.addClass('is-open');
        container.empty();

        const searchRow = container.createDiv({ cls: 'mina-tag-picker-search-row' });
        const searchInput = searchRow.createEl('input', {
            type: 'text', cls: 'mina-tag-picker-search',
            attr: { placeholder: 'Filter tags…' }
        }) as HTMLInputElement;
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
}
