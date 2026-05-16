import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { PF_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID, SETTINGS_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID, COMPASS_ICON_ID, FOCUS_ICON_ID, MEMENTO_ICON_ID } from '../constants';
import { parseNaturalDate, isTablet, attachInlineTriggers, attachMediaPasteHandler, createThoughtCaptureWidget } from '../utils';
import { HabitConfigModal } from '../modals/HabitConfigModal';
import { HelpModal } from '../modals/HelpModal';
import { SearchModal } from '../modals/SearchModal';
import { ZenCaptureModal } from '../modals/ZenCaptureModal';

export class CommandCenterTab extends BaseTab {
    private parentContainer: HTMLElement;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this.parentContainer = container;
        container.empty();
        container.addClass('diwa-cockpit-root');
        if (this.view.isZenMode) container.addClass('is-zen-mode');
        else container.removeClass('is-zen-mode');

        const wrap = container.createEl('div', { cls: 'diwa-cc-wrap' });

        this.renderHeader(wrap);

        // Search pill: phone-only entry point between greeting and capture bar
        if (Platform.isMobile && !isTablet()) {
            this.renderSearchPill(wrap);
        }

        this.renderCaptureBar(wrap);
        this.renderHabitQuickBar(wrap);
        this.renderZenBanner(wrap);
        // Goals removed per design — do not render weekly/monthly goals here
        // const goalsDual = wrap.createEl('div', { cls: 'diwa-goals-pane diwa-section--hideable' });
        // this.renderWeeklyGoals(goalsDual);
        // this.renderMonthlyGoals(goalsDual);
        this.renderNavigationFooter(wrap);
    }

    private renderHeader(parent: HTMLElement) {
        const headerRow = parent.createEl('div', { cls: 'diwa-cc-header' });
        const greetingCol = headerRow.createEl('div', { cls: 'diwa-cc-greeting' });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        greetingCol.createEl('div', { text: moment().format('dddd · MMMM D').toUpperCase(), cls: 'diwa-cc-date-line' });
        greetingCol.createEl('h1', { text: `${greeting}, Emperor.`, cls: 'diwa-cc-title' });
        const vision = this.settings.northStarGoals?.[0];
        if (vision) {
            const ns = greetingCol.createEl('div', { cls: 'diwa-cc-northstar' });
            ns.createEl('span', { text: '★', cls: 'diwa-cc-northstar-star' });
            ns.createEl('span', { text: vision });
        }
        const isPhone = Platform.isMobile && !isTablet();
        const zenSize = isPhone ? '48px' : '42px';
        const btnSize = `width: ${zenSize}; height: ${zenSize}; min-width: ${zenSize};`;

        // Right-side button cluster (search + help + zen)
        const btnCluster = headerRow.createEl('div', { attr: { style: 'display:flex; align-items:center; gap:4px; flex-shrink:0;' } });

        const searchBtn = btnCluster.createEl('button', {
            cls: 'diwa-zen-btn',
            attr: { title: 'Global Search  Mod+Shift+F', style: btnSize }
        });
        setIcon(searchBtn, 'lucide-search');
        searchBtn.addEventListener('click', () => { new SearchModal(this.app, this.plugin).open(); });

        const helpBtn = btnCluster.createEl('button', {
            cls: 'diwa-zen-btn',
            attr: { title: 'Open manual', style: btnSize }
        });
        setIcon(helpBtn, 'lucide-circle-help');
        helpBtn.addEventListener('click', () => { this.view.activeTab = 'manual'; this.view.renderView(); });

        const zenToggle = btnCluster.createEl('button', {
            cls: `diwa-zen-btn${this.view.isZenMode ? ' is-active' : ''}`,
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
            cls: 'diwa-search-pill',
            attr: { role: 'button', 'aria-label': 'Search DIWA', tabindex: '0' }
        });
        const icon = pill.createEl('span', { cls: 'diwa-search-pill-icon' });
        setIcon(icon, 'lucide-search');
        pill.createEl('span', { cls: 'diwa-search-pill-text', text: 'Search DIWA…' });
        pill.addEventListener('click', () => new SearchModal(this.app, this.plugin).open());
        pill.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                new SearchModal(this.app, this.plugin).open();
            }
        });
    }

    private renderZenBanner(parent: HTMLElement) {
        const banner = parent.createEl('div', { cls: 'diwa-zen-banner' });
        banner.createEl('div', { text: 'FOCUS MODE', cls: 'diwa-zen-focus-label' });
        const vision = this.settings.northStarGoals?.[0];
        if (vision) banner.createEl('div', { text: vision, cls: 'diwa-zen-northstar-display' });
        const exitBtn = banner.createEl('button', { text: 'EXIT ZEN', cls: 'diwa-zen-exit-btn' });
        exitBtn.addEventListener('click', () => { this.view.isZenMode = false; this.render(this.parentContainer); });
    }

    // ── 1. Capture bar ──────────────────────────────────────────────────────
    private renderCaptureBar(parent: HTMLElement) {
        const zone = parent.createEl('div', { cls: 'diwa-dual-capture-zone' });

        // ── Thought Box ──────────────────────────────────────────────────────
        const thoughtBox = zone.createEl('div', { cls: 'diwa-capture-box diwa-capture-box--thought' });
        const thoughtLabel = thoughtBox.createEl('div', { cls: 'diwa-capture-box-label' });
        thoughtLabel.createEl('span', { text: '✦', cls: 'diwa-capture-box-icon' });
        thoughtLabel.createEl('span', { text: 'THOUGHT', cls: 'diwa-capture-box-title' });
        const expandBtn = thoughtLabel.createEl('button', {
            cls: 'diwa-capture-expand-btn',
            attr: { title: 'Open Zen Capture' }
        });
        setIcon(expandBtn, 'lucide-maximize-2');
        expandBtn.addEventListener('click', () => {
            new ZenCaptureModal(this.app, this.plugin).open();
        });

        // Context chips row + textarea (populated when user types #tag)
        createThoughtCaptureWidget(thoughtBox, {
            app: this.app,
            containerCls: 'diwa-capture',
            textareaCls: 'diwa-capture-box-input diwa-capture-box-textarea',
            chipCls: 'diwa-capture-chip',
            placeholder: "What's on your mind… (Enter to save, Shift+Enter for new line)",
            getContexts: () => [],
            peopleFolder: this.settings.peopleFolder,
            attachmentsFolder: () => this.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments',
            onSave: async (raw, ctxs) => {
                try {
                    await this.vault.createThoughtFile(raw, ctxs);
                    new Notice('✦ Thought saved', 1200);
                } catch {
                    new Notice('Error saving thought — please try again', 2500);
                }
            },
            setPending: (v) => { this.view._capturePending = v; },
        });

        // ── Task Box ─────────────────────────────────────────────────────────
        const taskBox = zone.createEl('div', { cls: 'diwa-capture-box diwa-capture-box--task' });
        const taskLabel = taskBox.createEl('div', { cls: 'diwa-capture-box-label' });
        taskLabel.createEl('span', { text: '✓', cls: 'diwa-capture-box-icon diwa-capture-box-icon--task' });
        taskLabel.createEl('span', { text: 'TASK', cls: 'diwa-capture-box-title' });

        let taskDueDate: string | undefined;
        const taskInput = taskBox.createEl('input', {
            cls: 'diwa-capture-box-input',
            attr: { placeholder: 'Add a task… use @tomorrow to set due date', type: 'text' }
        }) as HTMLInputElement;
        attachMediaPasteHandler(this.app, taskInput, () => this.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments');

        taskInput.addEventListener('focus', () => { this.view._capturePending = 1; });
        attachInlineTriggers(
            this.app,
            taskInput,
            (d) => { taskDueDate = d; },
            (tag) => {
                const cur = taskInput.value;
                const pos = taskInput.selectionStart ?? cur.length;
                const insert = `#${tag} `;
                taskInput.value = cur.substring(0, pos) + insert + cur.substring(pos);
                taskInput.setSelectionRange(pos + insert.length, pos + insert.length);
                taskInput.focus();
            },
            () => this.settings.contexts || [],
            this.settings.peopleFolder,
        );
        taskInput.addEventListener('input', () => {
            this.view._capturePending = taskInput.value.trim().length > 0 ? 1 : 0;
        });

        const saveTask = async () => {
            const raw = taskInput.value.trim();
            if (!raw) return;
            const title = raw.replace(/\[\[\d{4}-\d{2}-\d{2}\]\]\s*/g, '').trim();
            const dueDate = taskDueDate;
            this.view._capturePending = 0;
            taskDueDate = undefined;
            taskInput.value = '';
            try {
                await this.vault.createTaskFile(title, [], dueDate);
                new Notice('✓ Task added', 1200);
            } catch {
                new Notice('Error saving task — please try again', 2500);
            }
        };

        taskInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); saveTask(); }
            if (e.key === 'Escape') {
                taskInput.value = '';
                this.view._capturePending = 0;
                taskInput.blur();
            }
        });

        // ── ⌘K hint ──────────────────────────────────────────────────────────
        const hint = zone.createEl('div', { cls: 'diwa-dual-capture-hint' });
        hint.createEl('span', { text: '⌘K', cls: 'diwa-capture-kbd' });
        hint.createEl('span', { text: ' full capture with contexts & projects', cls: 'diwa-dual-capture-hint-text' });
    }

    // ── 2. Habit quick-bar ──────────────────────────────────────────────────
    private renderHabitQuickBar(parent: HTMLElement) {
        const allHabits = this.settings.habits || [];
        const habits = allHabits.filter(h => !h.archived);
        const section = parent.createEl('div', { cls: 'diwa-habit-section' });
        const labelRow = section.createEl('div', { cls: 'diwa-section-label-row' });
        labelRow.createEl('span', { text: 'HABITS', cls: 'diwa-section-label' });

        // ⚙ config button (QW-02)
        const gearBtn = labelRow.createEl('button', { cls: 'diwa-habit-config-btn', attr: { 'aria-label': 'Configure habits' } });
        gearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
        gearBtn.addEventListener('click', () => { new HabitConfigModal(this.plugin.app, this.plugin).open(); });

        if (habits.length === 0) {
            section.createEl('span', { text: 'No habits configured — add them in Settings.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            return;
        }

        const completedToday = new Set<string>(this.index.habitStatusIndex);
        const today = moment().format('YYYY-MM-DD');
        let doneCount = habits.filter(h => completedToday.has(h.id)).length;
        const countEl = labelRow.createEl('span', { cls: 'diwa-section-label-count', text: `${doneCount}/${habits.length}` });

        const barCls = (Platform.isMobile && !isTablet()) ? 'diwa-habit-grid' : 'diwa-habit-quick-bar';
        const bar = section.createEl('div', { cls: barCls });

        const progressBarWrap = section.createEl('div', { cls: 'diwa-habit-progress-bar' });
        const progressBarFill = progressBarWrap.createEl('div', { cls: 'diwa-habit-progress-fill' });

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
            const btn = bar.createEl('button', { cls: `diwa-habit-quick-btn${done ? ' is-done' : ''}`, attr: { title: habit.name } });
            btn.insertAdjacentHTML('afterbegin', '<svg class="diwa-habit-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="diwa-habit-ring-track" cx="18" cy="18" r="15.9"/><circle class="diwa-habit-ring-fill" cx="18" cy="18" r="15.9"/></svg>');
            btn.createEl('span', { text: habit.icon || '●', cls: 'diwa-habit-quick-icon' });
            btn.createEl('span', { text: habit.name.substring(0, maxNameLen), cls: 'diwa-habit-quick-label' });
            if (!Platform.isMobile || isTablet()) btn.createEl('div', { cls: 'diwa-habit-tooltip', text: habit.name });

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
        const card = parent.createEl('div', { cls: 'diwa-goal-card' });
        const header = card.createEl('div', { cls: 'diwa-goal-card-header' });
        header.createEl('span', { text: 'WEEKLY', cls: 'diwa-goal-card-title' });
        const editBtn = header.createEl('button', { text: 'Edit', cls: 'diwa-goal-edit-btn',
            attr: { style: `padding: ${Platform.isMobile && !isTablet() ? '10px 12px' : '2px 4px'}; min-height: ${Platform.isMobile && !isTablet() ? '44px' : 'auto'};` }
        });
        editBtn.addEventListener('click', () => { this.view.activeTab = 'review'; this.view.renderView(); });

        if (!goals.length) {
            card.createEl('div', { text: 'No weekly goals — add in Review.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            return;
        }
        goals.slice(0, 3).forEach((goal, i) => {
            const item = card.createEl('div', { cls: 'diwa-goal-item' });
            item.createEl('span', { text: String(i + 1), cls: 'diwa-goal-num diwa-goal-num--weekly' });
            item.createEl('span', { text: goal, cls: 'diwa-goal-text' });
        });
        if (goals.length > 3) {
            const more = card.createEl('button', { text: `+ ${goals.length - 3} more`, cls: 'diwa-goal-more-link' });
            more.addEventListener('click', () => {
                more.remove();
                goals.slice(3).forEach((goal, i) => {
                    const item = card.createEl('div', { cls: 'diwa-goal-item' });
                    item.createEl('span', { text: String(i + 4), cls: 'diwa-goal-num diwa-goal-num--weekly' });
                    item.createEl('span', { text: goal, cls: 'diwa-goal-text' });
                });
            });
        }
    }

    // ── 5. Monthly Goals ──────────────────────────────────────────────────────
    private renderMonthlyGoals(parent: HTMLElement) {
        const goals = (this.settings.monthlyGoals || []).filter(g => g && g.trim());
        const card = parent.createEl('div', { cls: 'diwa-goal-card' });
        const header = card.createEl('div', { cls: 'diwa-goal-card-header' });
        header.createEl('span', { text: 'MONTHLY', cls: 'diwa-goal-card-title' });

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
            const editBtn = header.createEl('button', { text: 'Edit', cls: 'diwa-goal-edit-btn' });
            editBtn.addEventListener('click', () => { this.view.activeTab = 'monthly-review'; this.view.renderView(); });
        }

        if (!goals.length) {
            listEl.createEl('div', { text: 'No monthly goals — add in Monthly Review.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            listEl.style.display = 'flex';
            return;
        }
        goals.slice(0, 3).forEach((goal, i) => {
            const item = listEl.createEl('div', { cls: 'diwa-goal-item' });
            item.createEl('span', { text: String(i + 1), cls: 'diwa-goal-num diwa-goal-num--monthly' });
            item.createEl('span', { text: goal, cls: 'diwa-goal-text' });
        });
        if (goals.length > 3) {
            const more = listEl.createEl('button', { text: `+ ${goals.length - 3} more`, cls: 'diwa-goal-more-link' });
            more.addEventListener('click', () => {
                more.remove();
                goals.slice(3).forEach((goal, i) => {
                    const item = listEl.createEl('div', { cls: 'diwa-goal-item' });
                    item.createEl('span', { text: String(i + 4), cls: 'diwa-goal-num diwa-goal-num--monthly' });
                    item.createEl('span', { text: goal, cls: 'diwa-goal-text' });
                });
            });
        }
    }

    private renderDailyRoutine(parent: HTMLElement) {
        if (this.index.checklistIndex.length === 0) return;

        const section = parent.createEl('div', { cls: 'diwa-section--hideable', attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        section.createEl('span', { text: 'DAILY ROUTINE', cls: 'diwa-section-label' });
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
        const intel = parent.createEl('div', { cls: 'diwa-intel-card diwa-section--hideable' });

        const intelHeader = intel.createEl('div', { cls: 'diwa-intel-header' });
        const titleRow = intelHeader.createEl('div', { cls: 'diwa-intel-title-row' });
        const iIcon = titleRow.createDiv({ cls: 'diwa-intel-icon' }); setIcon(iIcon, 'lucide-sparkles');
        titleRow.createSpan({ text: 'INTELLIGENCE', cls: 'diwa-intel-label' });
        const tsEl = intelHeader.createSpan({ cls: 'diwa-intel-timestamp', text: '' });

        const idx = this.index;
        const todayM = moment().startOf('day');
        const openTasks = Array.from(idx.taskIndex.values()).filter(t => t.status === 'open');
        const overdueTasks = openTasks.filter(t => t.due && moment(t.due, 'YYYY-MM-DD').isValid() && moment(t.due, 'YYYY-MM-DD').isBefore(todayM, 'day'));
        const completedHabits = idx.habitStatusIndex.length;
        const totalHabits = this.settings.habits?.length || 0;
        const unsynth = Array.from(idx.thoughtIndex.values()).filter(t => !t.synthesized).length;
        const dues = idx.totalDues || 0;

        const strip = intel.createEl('div', { cls: 'diwa-intel-status-strip' });
        const addStat = (value: string, label: string, danger = false, success = false) => {
            const stat = strip.createEl('div', { cls: 'diwa-intel-stat' });
            stat.createEl('div', { text: value, cls: `diwa-intel-stat-value${danger ? ' is-danger' : success ? ' is-success' : ''}` });
            stat.createEl('div', { text: label, cls: 'diwa-intel-stat-label' });
        };
        addStat(String(openTasks.length), 'OPEN TASKS', overdueTasks.length > 0);
        addStat(`${completedHabits}/${totalHabits}`, 'HABITS', false, completedHabits === totalHabits && totalHabits > 0);
        addStat(String(unsynth), 'THOUGHTS');
        addStat(`$${dues.toFixed(0)}`, 'DUES', dues > 0);

        const body = intel.createEl('div', { text: 'Strategic briefing pending analysis.', cls: 'diwa-intel-body' });

        const analyzeBtn = intel.createEl('button', { cls: 'diwa-intel-analyze-btn' });
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
        const row = parent.createEl('div', { cls: `diwa-tactical-row${done ? ' is-done' : ''}` });
        const isPhone = Platform.isMobile && !isTablet();
        const cbWrap = row.createDiv({ attr: { style: `padding: ${isPhone ? '12px' : '4px'}; cursor: pointer;` } });
        if (isPhone) (row as HTMLElement).style.minHeight = '48px';
        const cb = cbWrap.createDiv({ cls: 'diwa-tactical-checkbox' });
        if (done) setIcon(cb, 'lucide-check');
        cbWrap.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
        row.createEl('span', { text, cls: 'diwa-tactical-text' });
    }

    private renderNavigationFooter(parent: HTMLElement) {
        const nav = parent.createEl('div', { cls: 'diwa-nav-grid diwa-section--hideable' });

        const renderCluster = (title: string, items: {label: string, icon: string, tab: string}[], modifierCls: string) => {
            const wrap = nav.createEl('div', { cls: 'diwa-nav-cluster-wrap' });
            const isCollapsibleOnMobile = Platform.isMobile && !isTablet() && modifierCls !== 'diwa-pillar-cluster--action';
            let isExpanded = !isCollapsibleOnMobile;

            const headerRow = wrap.createEl('div', { attr: { style: `display: flex; align-items: center; justify-content: space-between;${isCollapsibleOnMobile ? ' cursor: pointer; min-height: 44px;' : ''}` } });
            headerRow.createEl('h3', { text: title, cls: 'diwa-cluster-label' });

            const cluster = wrap.createEl('div', { cls: `diwa-pillar-cluster ${modifierCls}` });
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
                const item = cluster.createEl('div', { cls: 'diwa-pillar-item', attr: { tabindex: '0' } });
                const iconWrap = item.createDiv({ cls: 'diwa-pillar-icon' }); setIcon(iconWrap, i.icon);
                item.createSpan({ text: i.label, cls: 'diwa-pillar-label' });
                item.addEventListener('click', () => { this.plugin.activateView(i.tab, false); });
                item.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); item.click(); } });
            });
        };

        // ACTION row (reordered)
        renderCluster('ACTION',     [
            { label: 'Focus', icon: FOCUS_ICON_ID, tab: 'focus' },
            { label: 'Habits', icon: 'lucide-flame', tab: 'habits' },
            { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' },
            { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' },
            { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' }
        ], 'diwa-pillar-cluster--action');

        // MANAGEMENT row — displayed like action row but with blocked background
        renderCluster('MANAGEMENT', [
            { label: 'Tasks', icon: 'lucide-check-square-2', tab: 'review-tasks' },
            { label: 'Finance', icon: PF_ICON_ID, tab: 'dues' },
            { label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' },
            { label: 'Calendar', icon: 'lucide-calendar', tab: 'calendar' },
            { label: 'Weekly', icon: REVIEW_ICON_ID, tab: 'review' },
            { label: 'Monthly', icon: 'lucide-calendar-range', tab: 'monthly-review' },
            { label: 'Compass', icon: COMPASS_ICON_ID, tab: 'compass' }
        ], 'diwa-pillar-cluster--mgmt diwa-pillar-cluster--blocked');

        // FEATURES row
        renderCluster('FEATURES', [
            { label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'diwa-ai' },
            { label: 'Voice', icon: 'lucide-mic', tab: 'voice-note' },
            { label: 'Compasee', icon: COMPASS_ICON_ID, tab: 'compass' },
            { label: 'Memento', icon: MEMENTO_ICON_ID, tab: 'memento-mori' }
        ], 'diwa-pillar-cluster--features');

        // SYSTEM row
        renderCluster('SYSTEM', [
            { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' },
            { label: 'Manual', icon: 'lucide-book-open', tab: 'manual' },
            { label: 'Export', icon: 'lucide-download', tab: 'export' }
        ], 'diwa-pillar-cluster--system');
    }

    /** Attach # autocomplete suggestions to a capture textarea.
     *  When the user types #partial, shows filtered tag pills inline.
     *  Clicking a pill inserts `#tag ` into the textarea, which the
     *  attachInlineTriggers handler converts to a chip automatically. */
    private _buildInlineDateStrip(
        container: HTMLElement,
        onDateChange: (d: string | null) => void
    ): { setDueDate: (d: string) => void } {
        const strip = container.createDiv({ cls: 'diwa-date-strip' });
        const display = container.createDiv({ cls: 'diwa-date-display' });
        display.style.display = 'none';
        const btnEls: HTMLButtonElement[] = [];

        const updateDisplay = (dateStr: string | null) => {
            display.empty();
            if (!dateStr) { display.style.display = 'none'; return; }
            display.style.display = 'flex';
            display.createSpan({ text: '📅', cls: 'diwa-date-display-icon' });
            const lbl = display.createSpan({ text: moment(dateStr).format('dddd, MMM D'), cls: 'diwa-date-display-label' });
            const clr = display.createSpan({ text: '×', cls: 'diwa-date-display-clear' });
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
            const btn = strip.createEl('button', { text: s.label, cls: 'diwa-date-shortcut-btn' }) as HTMLButtonElement;
            btnEls.push(btn);
            btn.addEventListener('click', () => {
                const d = moment().add(s.days, 'days').format('YYYY-MM-DD');
                setDueDate(d);
                btnEls.forEach(b => b.removeClass('is-selected'));
                btn.addClass('is-selected');
            });
        });

        const pickBtn = strip.createEl('button', { text: 'PICK ▾', cls: 'diwa-date-shortcut-btn diwa-date-pick-btn' });
        pickBtn.addEventListener('click', () => showNLPInput());

        const showNLPInput = () => {
            container.querySelector('.diwa-date-nlp-wrap')?.remove();
            const wrap = container.createDiv({ cls: 'diwa-date-nlp-wrap' });
            const input = wrap.createEl('input', {
                type: 'text', cls: 'diwa-date-nlp-input',
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



