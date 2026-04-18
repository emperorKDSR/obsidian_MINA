import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { DAILY_ICON_ID, TASK_ICON_ID, PF_ICON_ID, PROJECT_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID, COMPASS_ICON_ID, SETTINGS_ICON_ID, VOICE_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID } from '../constants';
import { parseContextString } from '../utils';

export class CommandCenterTab extends BaseTab {
    private parentContainer: HTMLElement;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.parentContainer = container;
        container.empty();
        container.addClass('mina-cockpit-root');
        if (this.view.isZenMode) container.addClass('is-zen-mode');
        else container.removeClass('is-zen-mode');

        const wrap = container.createEl('div', {
            attr: { style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 900px; margin: 0 auto; padding-bottom: 140px;' }
        });

        this.renderHeader(wrap);
        this.renderCaptureBar(wrap);
        this.renderHabitQuickBar(wrap);
        this.renderTaskRadar(wrap);
        this.renderDailyRoutine(wrap);
        this.renderIntelligence(wrap);
        this.renderNavigationFooter(wrap);
    }

    private renderHeader(parent: HTMLElement) {
        const headerRow = parent.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: flex-start;' } });
        const topRow = headerRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        topRow.createEl('h1', { text: `${greeting}, Emperor.`, attr: { style: 'margin: 0; font-size: 1.8em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.04em; line-height: 1.1;' } });
        const vision = this.settings.northStarGoals?.[0];
        if (vision) topRow.createEl('p', { text: vision, attr: { style: 'margin: 4px 0 0; font-size: 0.85em; color: var(--text-muted); font-weight: 500; font-style: italic;' } });

        const zenToggle = headerRow.createEl('button', {
            attr: {
                title: this.view.isZenMode ? 'Exit Zen' : 'Enter Zen',
                style: `background: ${this.view.isZenMode ? 'var(--interactive-accent)' : 'var(--background-secondary-alt)'}; color: ${this.view.isZenMode ? 'var(--text-on-accent)' : 'var(--text-muted)'}; border: none; border-radius: 50%; width: 38px; height: 38px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;`
            }
        });
        setIcon(zenToggle, 'lucide-target');
        zenToggle.addEventListener('click', () => { this.view.isZenMode = !this.view.isZenMode; this.render(this.parentContainer); });
    }

    // ── 1. Capture bar ──────────────────────────────────────────────────────
    private renderCaptureBar(parent: HTMLElement) {
        const cap = parent.createEl('div', { cls: 'mina-capture-bar' });
        const capIcon = cap.createDiv({ cls: 'mina-capture-icon' });
        setIcon(capIcon, 'lucide-plus');
        cap.createEl('span', { text: "What's on your mind…", cls: 'mina-capture-placeholder' });
        cap.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', null, false, async (text, ctxs) => {
                if (!text.trim()) return;
                await this.vault.createThoughtFile(text, parseContextString(ctxs));
            }, 'Capture').open();
        });
    }

    // ── 2. Habit quick-bar ──────────────────────────────────────────────────
    private renderHabitQuickBar(parent: HTMLElement) {
        const habits = this.settings.habits || [];

        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        const labelRow = section.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        labelRow.createEl('span', { text: 'HABITS', attr: { style: 'font-size: 0.65em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint);' } });

        if (habits.length === 0) {
            section.createEl('span', { text: 'No habits configured — add them in Settings.', attr: { style: 'font-size: 0.8em; color: var(--text-faint); font-style: italic;' } });
            return;
        }

        const completedToday = new Set<string>(this.index.habitStatusIndex);
        const today = moment().format('YYYY-MM-DD');
        let doneCount = habits.filter(h => completedToday.has(h.id)).length;

        const progressText = labelRow.createEl('span', { text: `${doneCount}/${habits.length}`, attr: { style: 'font-size: 0.72em; font-weight: 700; color: var(--interactive-accent);' } });

        const bar = section.createEl('div', { cls: 'mina-habit-quick-bar' });

        for (const habit of habits) {
            const done = completedToday.has(habit.id);
            const btn = bar.createEl('button', { cls: `mina-habit-quick-btn${done ? ' is-done' : ''}`, attr: { title: habit.name } });
            btn.createEl('span', { text: habit.icon || '●', cls: 'mina-habit-quick-icon' });
            btn.createEl('span', { text: habit.name.substring(0, 9), cls: 'mina-habit-quick-label' });

            btn.addEventListener('click', async () => {
                const nowDone = btn.hasClass('is-done');
                btn.toggleClass('is-done', !nowDone);
                doneCount = nowDone ? doneCount - 1 : doneCount + 1;
                progressText.textContent = `${Math.max(0, Math.min(habits.length, doneCount))}/${habits.length}`;

                // Suppress vault-event re-renders during this write
                this.view._habitTogglePending++;
                await this.plugin.toggleHabit(today, habit.id);
                setTimeout(() => { this.view._habitTogglePending = Math.max(0, this.view._habitTogglePending - 1); }, 350);
            });
        }
    }

    // ── 3. Task Radar ────────────────────────────────────────────────────────
    private renderTaskRadar(parent: HTMLElement) {
        const radar = this.index.radarQueue.slice(0, 6);

        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        const labelRow = section.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        labelRow.createEl('span', { text: 'RADAR', attr: { style: 'font-size: 0.65em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint);' } });
        const seeAll = labelRow.createEl('button', { text: 'See all', attr: { style: 'background: transparent; border: none; font-size: 0.72em; font-weight: 700; color: var(--interactive-accent); cursor: pointer; padding: 0;' } });
        seeAll.addEventListener('click', () => { this.view.activeTab = 'review-tasks'; this.view.renderView(); });

        if (radar.length === 0) {
            section.createEl('div', { text: 'No urgent tasks — all clear.', attr: { style: 'font-size: 0.82em; color: var(--text-faint); font-style: italic; padding: 8px 0;' } });
            return;
        }

        const list = section.createEl('div', { attr: { style: 'display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; border: 1px solid var(--background-modifier-border-faint);' } });

        for (const task of radar) {
            const isDone = task.status === 'done';
            const dueM = task.due ? moment(task.due, 'YYYY-MM-DD') : null;
            const isOverdue = !isDone && dueM?.isValid() && dueM.isBefore(moment(), 'day');
            const isToday = !isDone && dueM?.isValid() && dueM.isSame(moment(), 'day');

            const row = list.createEl('div', { cls: `mina-hub-task-row${isDone ? ' is-done' : ''}` });

            const cb = row.createEl('div', { cls: `mina-task-cb${isDone ? ' is-done' : ''}` });
            if (isDone) { const ck = cb.createEl('span'); setIcon(ck, 'check'); }

            cb.addEventListener('click', async (e) => {
                e.stopPropagation();
                const nextDone = !isDone;
                cb.empty();
                if (nextDone) {
                    cb.addClass('is-done'); const ck = cb.createEl('span'); setIcon(ck, 'check');
                    titleEl.style.textDecoration = 'line-through'; titleEl.style.opacity = '0.35';
                } else {
                    cb.removeClass('is-done'); titleEl.style.textDecoration = ''; titleEl.style.opacity = '';
                }
                this.view._taskTogglePending++;
                await this.vault.toggleTask(task.filePath, nextDone);
                const h = row.offsetHeight;
                row.style.overflow = 'hidden'; row.style.maxHeight = h + 'px';
                row.style.transition = 'max-height 0.28s ease, opacity 0.2s ease, padding 0.28s ease';
                await new Promise(r => setTimeout(r, 160));
                row.style.maxHeight = '0'; row.style.opacity = '0'; row.style.padding = '0';
                setTimeout(() => { row.remove(); this.view._taskTogglePending = Math.max(0, this.view._taskTogglePending - 1); }, 300);
            });

            const titleEl = row.createEl('span', {
                text: task.title,
                attr: { style: `flex: 1; font-size: 0.88em; font-weight: 600; color: var(--text-normal); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${isDone ? 'text-decoration: line-through; opacity: 0.35;' : ''}` }
            });

            if (dueM?.isValid()) {
                const chipText = isToday ? 'Today' : dueM.format('MMM D');
                row.createEl('span', {
                    text: chipText,
                    attr: { style: `font-size: 0.66em; font-weight: 700; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; background: ${isOverdue ? 'rgba(239,68,68,0.10)' : 'rgba(var(--interactive-accent-rgb),0.10)'}; color: ${isOverdue ? 'var(--text-error)' : 'var(--interactive-accent)'};` }
                });
            }
        }
    }

    // ── 4. Daily Routine ─────────────────────────────────────────────────────
    private renderDailyRoutine(parent: HTMLElement) {
        if (this.index.checklistIndex.length === 0) return;

        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        section.createEl('span', { text: 'DAILY ROUTINE', attr: { style: 'font-size: 0.65em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint);' } });
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

    // ── 5. Intelligence ──────────────────────────────────────────────────────
    private renderIntelligence(parent: HTMLElement) {
        const intel = parent.createEl('div', { cls: 'mina-card', attr: { style: 'padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;' } });
        const intelHeader = intel.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        const intelTitle = intelHeader.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 7px;' } });
        const iIcon = intelTitle.createDiv(); setIcon(iIcon, 'lucide-sparkles'); iIcon.style.color = 'var(--interactive-accent)'; iIcon.style.width = '14px';
        intelTitle.createSpan({ text: 'INTELLIGENCE', attr: { style: 'font-size: 0.6em; font-weight: 900; color: var(--interactive-accent); letter-spacing: 0.15em;' } });
        const analyzeBtn = intelHeader.createEl('button', { text: 'Analyze', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; font-size: 0.68em; padding: 4px 12px; cursor: pointer; font-weight: 700;' } });

        const body = intel.createEl('div', { text: 'Strategic briefing pending analysis.', attr: { style: 'font-size: 0.88em; color: var(--text-muted); font-style: italic; line-height: 1.6;' } });

        analyzeBtn.addEventListener('click', async () => {
            body.empty();
            const loading = body.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 0.88em;' } });
            loading.createSpan({ text: 'Synthesizing…' });
            const spin = loading.createDiv(); setIcon(spin, 'lucide-loader-2'); spin.style.animation = 'spin 1s linear infinite';
            try {
                const idx = this.index;
                const today = moment().startOf('day');
                const openTasks = Array.from(idx.taskIndex.values()).filter(t => t.status === 'open');
                const overdueTasks = openTasks.filter(t => t.due && moment(t.due, 'YYYY-MM-DD').isValid() && moment(t.due, 'YYYY-MM-DD').isBefore(today, 'day'));
                const completedHabits = idx.habitStatusIndex.length;
                const totalHabits = this.settings.habits?.length || 0;
                const contextBlock = [
                    `## Status — ${moment().format('dddd, MMMM D, YYYY')}`,
                    `**Open Tasks:** ${openTasks.length} (${overdueTasks.length} overdue)`,
                    `**Habits:** ${completedHabits}/${totalHabits}`,
                    `**Unprocessed Thoughts:** ${Array.from(idx.thoughtIndex.values()).filter(t => !t.synthesized).length}`,
                    `**Financial Obligations:** $${(idx.totalDues || 0).toFixed(2)}`,
                    this.settings.northStarGoals?.[0] ? `**North Star:** ${this.settings.northStarGoals[0]}` : '',
                    overdueTasks.length ? `**Overdue:** ${overdueTasks.slice(0, 5).map(t => t.title).join(', ')}` : '',
                ].filter(Boolean).join('\n');
                const summary = await this.ai.callGemini(`${contextBlock}\n\nSharp strategic briefing: what needs attention now? What's at risk? Be direct.`, [], false, [], idx.thoughtIndex);
                loading.remove(); body.setText(summary); body.style.fontStyle = 'normal'; body.style.color = 'var(--text-normal)';
            } catch (e: any) { loading.setText('Intelligence offline: ' + e.message); }
        });
    }

    private renderTacticalRow(parent: HTMLElement, text: string, done: boolean, onToggle: () => void) {
        const row = parent.createEl('div', { cls: 'mina-tactical-row' + (done ? ' is-done' : ''), attr: { style: 'cursor: default;' } });
        const cbWrap = row.createDiv({ attr: { style: 'padding: 4px; cursor: pointer;' } });
        const cb = cbWrap.createDiv({ cls: 'mina-tactical-checkbox' });
        if (done) setIcon(cb, 'lucide-check');
        cbWrap.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
        row.createEl('span', { text, cls: 'mina-tactical-text', attr: { style: done ? 'text-decoration: line-through; opacity: 0.45;' : '' } });
    }

    private renderNavigationFooter(parent: HTMLElement) {
        const nav = parent.createEl('div', { cls: 'mina-nav-container', attr: { style: 'display: flex; flex-direction: column; gap: 20px;' } });
        const renderCluster = (title: string, items: {label: string, icon: string, tab: string}[]) => {
            const section = nav.createEl('div', { cls: 'mina-nav-section' });
            section.createEl('h3', { text: title, attr: { style: 'margin: 0 0 8px; font-size: 0.65em; font-weight: 900; letter-spacing: 0.2em; color: var(--text-faint);' } });
            const cluster = section.createEl('div', { cls: 'mina-pillar-cluster' });
            items.forEach(i => {
                const item = cluster.createEl('div', { cls: 'mina-pillar-item' });
                const iconWrap = item.createDiv({ cls: 'mina-pillar-icon' }); setIcon(iconWrap, i.icon);
                item.createSpan({ text: i.label, cls: 'mina-pillar-label' });
                item.addEventListener('click', () => { this.view.activeTab = i.tab; this.view.renderView(); });
            });
        };
        renderCluster('ACTION', [
            { label: 'Tasks',    icon: 'lucide-check-square-2', tab: 'review-tasks' },
            { label: 'Finance',  icon: PF_ICON_ID, tab: 'dues' },
            { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' }
        ]);
        renderCluster('MANAGEMENT', [{ label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' }, { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' }, { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' }]);
        renderCluster('SYSTEM', [{ label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'mina-ai' }, { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' }, { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' }]);
    }
}
