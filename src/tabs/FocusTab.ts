import { moment, Notice, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';
import type { TaskEntry } from '../types';

export class FocusTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'mina-focus-wrap' });

        // ── Header ────────────────────────────────────────────────────────
        const headerRow = wrap.createEl('div', { cls: 'mina-focus-header' });
        this.renderHomeIcon(headerRow);
        const titleStack = headerRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        titleStack.createEl('h2', { text: "Today's Mission", cls: 'mina-focus-title' });
        titleStack.createEl('span', { text: moment().format('dddd, MMMM D'), attr: { style: 'font-size: 0.82em; color: var(--text-muted);' } });

        const today = moment().format('YYYY-MM-DD');

        // Init focusedTaskIds if needed
        if (!this.view.focusedTaskIds) (this.view as any).focusedTaskIds = new Set<string>();

        // ── Gather mission tasks ──────────────────────────────────────────
        const allTasks = Array.from(this.index.taskIndex.values());
        const missionTasks = allTasks.filter(t => {
            if (t.status !== 'open') return false;
            const isOverdue = t.due && t.due < today;
            const isDueToday = t.due === today;
            const isFocused = this.view.focusedTaskIds.has(t.filePath);
            return isOverdue || isDueToday || isFocused;
        });

        // Sort: overdue first, then today, then focused
        missionTasks.sort((a, b) => {
            const aOverdue = a.due && a.due < today ? 0 : a.due === today ? 1 : 2;
            const bOverdue = b.due && b.due < today ? 0 : b.due === today ? 1 : 2;
            return aOverdue - bOverdue;
        });

        // ── Task list ─────────────────────────────────────────────────────
        if (missionTasks.length === 0) {
            this.renderEmptyState(wrap, 'All clear! No tasks due today. 🎯');
        } else {
            const list = wrap.createEl('div', { cls: 'mina-focus-task-list' });
            for (const task of missionTasks) {
                this._renderTaskCard(list, task, today, container);
            }
        }

        // ── AI Time-Block ─────────────────────────────────────────────────
        if (missionTasks.length > 0) {
            this._renderAiSection(wrap, missionTasks, container);
        }
    }

    private _renderTaskCard(parent: HTMLElement, task: TaskEntry, today: string, container: HTMLElement) {
        const isOverdue = !!task.due && task.due < today;
        const isDueToday = task.due === today;
        const card = parent.createEl('div', { cls: `mina-focus-task-card${isOverdue ? ' is-overdue' : ''}` });

        // Checkbox
        const cbWrap = card.createEl('div', { cls: 'mina-focus-cb-wrap' });
        const cb = cbWrap.createEl('div', { cls: 'mina-focus-cb' });
        cbWrap.addEventListener('click', async () => {
            await this.vault.toggleTask(task.filePath, true);
            this.view.focusedTaskIds.delete(task.filePath);
            new Notice('Task completed ✓');
            this.render(container);
        });

        // Body
        const body = card.createEl('div', { cls: 'mina-focus-task-body' });
        body.createEl('div', { text: task.title || task.body, cls: 'mina-focus-task-title' });

        // Badges
        const badges = body.createEl('div', { attr: { style: 'display: flex; gap: 4px; flex-wrap: wrap; align-items: center;' } });
        if (isOverdue) {
            badges.createEl('span', { text: `Overdue · ${task.due}`, cls: 'mina-focus-badge mina-focus-badge--overdue' });
        } else if (isDueToday) {
            badges.createEl('span', { text: 'Due Today', cls: 'mina-focus-badge mina-focus-badge--today' });
        }
        if (task.priority === 'high') {
            badges.createEl('span', { text: '↑ High', cls: 'mina-focus-badge mina-focus-badge--high' });
        }

        // + Focus button for non-focused, non-overdue tasks (only tasks due today that weren't added)
        const isFocused = this.view.focusedTaskIds.has(task.filePath);
        if (!isOverdue && !isDueToday && !isFocused) {
            const addBtn = badges.createEl('button', { text: '+ Focus', cls: 'mina-focus-add-btn' });
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.view.focusedTaskIds.add(task.filePath);
                this.render(container);
            });
        }
    }

    private _renderAiSection(parent: HTMLElement, tasks: TaskEntry[], container: HTMLElement) {
        const section = parent.createEl('div', { cls: 'mina-focus-ai-section' });

        if (this.view.focusAiPlan) {
            const resultEl = section.createEl('div', { cls: 'mina-focus-ai-result' });
            resultEl.textContent = this.view.focusAiPlan;

            const regenBtn = section.createEl('button', { text: '↺ Regenerate', cls: 'mina-focus-ai-btn' });
            regenBtn.style.marginTop = '8px';
            regenBtn.addEventListener('click', () => {
                this.view.focusAiPlan = null;
                this._runAiTimeBlock(tasks, section, container);
            });
        } else {
            const aiBtn = section.createEl('button', { cls: 'mina-focus-ai-btn' });
            const iconEl = aiBtn.createEl('span');
            setIcon(iconEl, 'sparkles');
            aiBtn.createEl('span', { text: 'AI Time-Block Schedule' });

            aiBtn.addEventListener('click', () => {
                aiBtn.disabled = true;
                aiBtn.textContent = 'Planning…';
                this._runAiTimeBlock(tasks, section, container);
            });
        }
    }

    private async _runAiTimeBlock(tasks: TaskEntry[], section: HTMLElement, container: HTMLElement) {
        const taskList = tasks.map((t, i) => `${i + 1}. ${t.title || t.body}${t.due ? ` (due: ${t.due})` : ''}${t.priority ? ` [${t.priority}]` : ''}`).join('\n');
        const prompt = `Create a focused time-block schedule for today (${moment().format('dddd, MMMM D YYYY')}) based on these tasks:\n\n${taskList}\n\nProvide a practical hour-by-hour schedule. Keep it concise and actionable.`;
        try {
            const result = await this.ai.callGemini(prompt, [], false, [], this.index.thoughtIndex);
            this.view.focusAiPlan = result || 'No plan generated.';
        } catch (e) {
            this.view.focusAiPlan = `Error: ${e.message}`;
        }
        this.render(container);
    }
}
