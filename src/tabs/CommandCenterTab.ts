import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { DAILY_ICON_ID, TASK_ICON_ID, PF_ICON_ID, PROJECT_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID, COMPASS_ICON_ID, SETTINGS_ICON_ID, VOICE_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID } from '../constants';
import { parseContextString } from '../utils';
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

        const wrap = container.createEl('div', {
            attr: { style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 900px; margin: 0 auto; padding-bottom: 140px;' }
        });

        this.renderHeader(wrap);
        this.renderCaptureBar(wrap);
        this.renderHabitQuickBar(wrap);
        this.renderToDo(wrap);
        this.renderWeeklyGoals(wrap);
        this.renderMonthlyGoals(wrap);
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

        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        const labelRow = section.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        labelRow.createEl('span', { text: 'TO DO', attr: { style: 'font-size: 0.65em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint);' } });

        // Checklist first — above task groups
        this.renderChecklist(section);

        if (!overdue.length && !dueToday.length && !upcoming.length && !noDate.length) {
            return;
        }

        const list = section.createEl('div', { cls: 'mina-task-list' });

        const renderGroup = (label: string, tasks: TaskEntry[], danger: boolean, cap = 5) => {
            if (!tasks.length) return;
            const group = list.createEl('div', { cls: 'mina-task-group' });
            group.createEl('div', { text: label, cls: `mina-task-group-label${danger ? ' is-danger' : ''}` });
            tasks.slice(0, cap).forEach(t => this.renderToDoRow(t, group, list));
        };

        renderGroup('Overdue', overdue, true, 10);
        renderGroup('Today', dueToday, false, 10);
        renderGroup('Upcoming', upcoming, false, 5);
        if (noDate.length) renderGroup('No Date', noDate, false, 3);
    }

    private renderChecklist(parent: HTMLElement) {
        const todayStr = moment().format('YYYY-MM-DD');

        // Purge stale completed entries (from previous days)
        this.view.checklistCompletedToday.forEach((v, k) => {
            if (v.date !== todayStr) this.view.checklistCompletedToday.delete(k);
        });

        const openItems = this.index.thoughtChecklistIndex;

        // Build combined list: open from index + done from vault (files modified today)
        type CItem = { filePath: string; text: string; line: string; lineIndex: number; done: boolean };
        const keyOf = (item: CItem) => `${item.filePath}:${item.lineIndex}`;

        const buildCombined = (): CItem[] => {
            const open: CItem[] = openItems.map(i => ({ ...i, done: false }));
            // Done items from vault index (files modified today)
            const doneFromVault: CItem[] = this.index.thoughtDoneChecklistIndex.map(i => ({ ...i, done: true }));
            // Optimistic items ticked this session not yet re-indexed
            const doneFromSession: CItem[] = [...this.view.checklistCompletedToday.entries()]
                .filter(([, v]) => v.date === todayStr)
                .map(([k, v]) => {
                    const colonIdx = k.lastIndexOf(':');
                    return { filePath: k.substring(0, colonIdx), text: v.text, line: '', lineIndex: Number(k.substring(colonIdx + 1)), done: true };
                })
                // Exclude if already in vault index (avoids duplicates after vault re-index)
                .filter(s => !doneFromVault.some(d => d.filePath === s.filePath && d.lineIndex === s.lineIndex));
            const done: CItem[] = [...doneFromVault, ...doneFromSession];
            // Apply persisted order across all items
            const orderMap = new Map(this.view.checklistOrder.map((k, i) => [k, i]));
            const allItems = [...open, ...done];
            allItems.sort((a, b) => {
                const ai = orderMap.get(keyOf(a)) ?? Infinity;
                const bi = orderMap.get(keyOf(b)) ?? Infinity;
                // If both have no order, done items sink below open items
                if (ai === Infinity && bi === Infinity) return (a.done ? 1 : 0) - (b.done ? 1 : 0);
                return ai - bi;
            });
            return allItems;
        };

        let ordered = buildCombined();
        if (!ordered.length) return;

        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        const clHeaderRow = section.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        clHeaderRow.createEl('span', { text: 'CHECKLIST', attr: { style: 'font-size: 0.65em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint);' } });

        // Refresh button
        const refreshBtn = clHeaderRow.createEl('button', {
            attr: {
                title: 'Refresh checklist',
                style: 'background: none; border: none; cursor: pointer; color: var(--text-faint); display: flex; align-items: center; padding: 2px 4px; border-radius: 4px; transition: color 0.15s;'
            }
        });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('mouseenter', () => { refreshBtn.style.color = 'var(--text-normal)'; });
        refreshBtn.addEventListener('mouseleave', () => { refreshBtn.style.color = 'var(--text-faint)'; });
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
            items.forEach((item, i) => {
                const row = list.createEl('div', {
                    attr: {
                        draggable: 'true',
                        style: `display: flex; align-items: center; gap: 10px; padding: 7px 12px; background: var(--background-primary); border-bottom: 1px solid var(--background-modifier-border-faint); cursor: grab; transition: background 0.15s;`
                    }
                });

                // Compact checkbox
                const cb = row.createEl('div', {
                    cls: `mina-task-cb${item.done ? ' is-done' : ''}`,
                    attr: { style: 'flex-shrink: 0;' }
                });
                if (item.done) { const ck = cb.createEl('span'); setIcon(ck, 'check'); }

                const titleEl = row.createEl('span', {
                    text: item.text,
                    attr: {
                        style: `flex: 1; font-size: 0.85em; font-weight: 500; color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;${item.done ? ' text-decoration: line-through; opacity: 0.4;' : ''}`
                    }
                });

                // Grip handle
                const grip = row.createEl('div', { attr: { style: 'color: var(--text-faint); flex-shrink: 0; display: flex; align-items: center;' } });
                setIcon(grip, 'grip-vertical');

                // Checkbox toggle (only for open items)
                if (!item.done) {
                    cb.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        // Optimistic UI: mark done, move to bottom
                        cb.addClass('is-done');
                        const ck = cb.createEl('span'); setIcon(ck, 'check');
                        titleEl.style.textDecoration = 'line-through';
                        titleEl.style.opacity = '0.4';

                        // Update session state
                        const key = keyOf(item);
                        this.view.checklistCompletedToday.set(key, { text: item.text, date: todayStr });

                        // Rebuild ordered list: move ticked item to bottom, preserve rest
                        const openItems2 = ordered.filter(x => !x.done && keyOf(x) !== key);
                        const doneItems2 = [...ordered.filter(x => x.done), { ...item, done: true }];
                        ordered = [...openItems2, ...doneItems2];
                        this.view.checklistOrder = ordered.map(keyOf);

                        // Re-render list locally (no full view re-render)
                        renderItems(ordered);

                        // Write to file with pending guard
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

                // Drag-and-drop — all items draggable
                row.addEventListener('dragstart', (e) => {
                    dragSrcIdx = i;
                    row.style.opacity = '0.4';
                    e.dataTransfer?.setData('text/plain', String(i));
                });
                row.addEventListener('dragend', () => {
                    row.style.opacity = '';
                    list.querySelectorAll<HTMLElement>('[draggable]').forEach(r => r.style.background = '');
                });
                row.addEventListener('dragover', (e) => { e.preventDefault(); row.style.background = 'var(--background-modifier-hover)'; });
                row.addEventListener('dragleave', () => { row.style.background = ''; });
                row.addEventListener('drop', (e) => {
                    e.preventDefault(); row.style.background = '';
                    if (dragSrcIdx === null || dragSrcIdx === i) return;
                    const moved = ordered.splice(dragSrcIdx, 1)[0];
                    ordered.splice(i, 0, moved);
                    this.view.checklistOrder = ordered.map(keyOf);
                    renderItems(ordered);
                });
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
                    root.createEl('div', { text: 'All clear ✓', attr: { style: 'font-size: 0.82em; color: var(--text-faint); font-style: italic; padding: 8px 0;' } });
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
                meta.createEl('span', {
                    text: dateText,
                    cls: `mina-chip mina-chip--date${isOverdue ? ' is-overdue' : isToday ? ' is-today' : ''}`
                });
            }
            if (task.priority) {
                const pMap: Record<string, string> = { high: 'high', medium: 'med', low: 'low' };
                meta.createEl('span', { text: pMap[task.priority] || task.priority, cls: `mina-chip mina-chip--pri-${task.priority}` });
            }
            task.context.slice(0, 2).forEach(ctx => meta.createEl('span', { text: `#${ctx}`, cls: 'mina-chip mina-chip--ctx' }));
        }
    }

    // ── 4. Weekly Goals ───────────────────────────────────────────────────────
    private renderWeeklyGoals(parent: HTMLElement) {
        const goals = (this.settings.weeklyGoals || []).filter(g => g && g.trim());
        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        const labelRow = section.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        labelRow.createEl('span', { text: 'WEEKLY GOALS', attr: { style: 'font-size: 0.65em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint);' } });
        const editBtn = labelRow.createEl('button', { text: 'Edit', attr: { style: 'background: transparent; border: none; font-size: 0.72em; font-weight: 700; color: var(--interactive-accent); cursor: pointer; padding: 0;' } });
        editBtn.addEventListener('click', () => { this.view.activeTab = 'review'; this.view.renderView(); });

        if (!goals.length) {
            section.createEl('div', { text: 'No weekly goals set — add them in Review.', attr: { style: 'font-size: 0.82em; color: var(--text-faint); font-style: italic; padding: 8px 0;' } });
            return;
        }

        const list = section.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        goals.forEach((goal, i) => {
            const row = list.createEl('div', { attr: { style: 'display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; background: var(--background-secondary-alt); border-radius: 8px; border: 1px solid var(--background-modifier-border-faint);' } });
            row.createEl('span', { text: String(i + 1), attr: { style: 'font-size: 0.7em; font-weight: 800; color: var(--interactive-accent); flex-shrink: 0; min-width: 14px; margin-top: 1px;' } });
            row.createEl('span', { text: goal, attr: { style: 'font-size: 0.88em; font-weight: 500; color: var(--text-normal); line-height: 1.4;' } });
        });
    }

    // ── 5. Monthly Goals ──────────────────────────────────────────────────────
    private renderMonthlyGoals(parent: HTMLElement) {
        const goals = (this.settings.monthlyGoals || []).filter(g => g && g.trim());
        const section = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
        const labelRow = section.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        labelRow.createEl('span', { text: 'MONTHLY GOALS', attr: { style: 'font-size: 0.65em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint);' } });
        const editBtn = labelRow.createEl('button', { text: 'Edit', attr: { style: 'background: transparent; border: none; font-size: 0.72em; font-weight: 700; color: var(--interactive-accent); cursor: pointer; padding: 0;' } });
        editBtn.addEventListener('click', () => { this.view.activeTab = 'monthly-review'; this.view.renderView(); });

        if (!goals.length) {
            section.createEl('div', { text: 'No monthly goals set — add them in Monthly Review.', attr: { style: 'font-size: 0.82em; color: var(--text-faint); font-style: italic; padding: 8px 0;' } });
            return;
        }

        const list = section.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        goals.forEach((goal, i) => {
            const row = list.createEl('div', { attr: { style: 'display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px; background: var(--background-secondary-alt); border-radius: 8px; border: 1px solid var(--background-modifier-border-faint);' } });
            row.createEl('span', { text: String(i + 1), attr: { style: 'font-size: 0.7em; font-weight: 800; color: var(--text-muted); flex-shrink: 0; min-width: 14px; margin-top: 1px;' } });
            row.createEl('span', { text: goal, attr: { style: 'font-size: 0.88em; font-weight: 500; color: var(--text-normal); line-height: 1.4;' } });
        });
    }


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

    // ── 7. Intelligence ──────────────────────────────────────────────────────
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
