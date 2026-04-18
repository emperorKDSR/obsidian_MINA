import { moment, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from "../modals/EditEntryModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import type { TaskEntry } from '../types';
import { parseContextString } from '../utils';

type TaskViewMode = 'open' | 'not-due' | 'done' | 'waiting' | 'someday';

export class TasksTab extends BaseTab {
    private viewMode: TaskViewMode = 'open';
    private listContainer: HTMLElement | null = null;
    private outerContainer: HTMLElement | null = null;

    constructor(view: MinaView) {
        super(view);
        // Restore persisted viewMode so vault-event re-renders don't reset to 'open'
        this.viewMode = (this.view.tasksViewMode as TaskViewMode) || 'open';
    }

    render(container: HTMLElement) {
        this.outerContainer = container;
        this.renderTaskOverview(container);
    }

    private setMode(mode: TaskViewMode) {
        this.viewMode = mode;
        this.view.tasksViewMode = mode;
    }

    async renderTaskOverview(container: HTMLElement) {
        container.empty();

        const wrap = container.createEl('div', {
            attr: { style: 'padding: 16px 16px 140px 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);' }
        });

        // ── Header ──
        const navRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px;' } });
        this.renderHomeIcon(navRow);
        const titleRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; gap: 10px;' } });
        titleRow.createEl('h2', {
            text: 'Tasks',
            attr: { style: 'margin: 0; font-size: 1.6em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.03em; line-height: 1;' }
        });
        const addBtn = titleRow.createEl('button', {
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; padding: 7px 14px; cursor: pointer; font-weight: 700; font-size: 0.78em; display: flex; align-items: center; gap: 5px; flex-shrink: 0;' }
        });
        const addIconEl = addBtn.createEl('span'); setIcon(addIconEl, 'plus');
        addBtn.createSpan({ text: 'New Task' });
        addBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                if (!text.trim()) return;
                await this.vault.createTaskFile(text, parseContextString(ctxs), due || undefined);
                this.renderTaskOverview(container);
            }, 'New Task').open();
        });

        // ── Search ──
        const searchWrap = wrap.createEl('div');
        const searchInp = searchWrap.createEl('input', {
            type: 'text',
            attr: {
                placeholder: 'Search tasks…',
                style: 'width: 100%; padding: 9px 14px; border-radius: 10px; border: 1px solid var(--background-modifier-border-faint); background: var(--background-secondary-alt); color: var(--text-normal); font-size: 0.9em; box-sizing: border-box;'
            }
        });
        if (this.view.searchQuery) searchInp.value = this.view.searchQuery;
        searchInp.addEventListener('input', () => { this.view.searchQuery = searchInp.value; this.renderList(); });

        // ── Filter Pills (responsive — wraps on mobile) ──
        const allTasks = Array.from(this.index.taskIndex.values());
        const counts: Record<TaskViewMode, number> = {
            'open':    allTasks.filter(t => t.status === 'open' && t.due && t.due.trim() !== "").length,
            'not-due': allTasks.filter(t => t.status === 'open' && (!t.due || t.due.trim() === "")).length,
            'waiting': allTasks.filter(t => t.status === 'waiting').length,
            'someday': allTasks.filter(t => t.status === 'someday').length,
            'done':    allTasks.filter(t => t.status === 'done').length,
        };

        const pillBar = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-wrap: wrap; gap: 6px;' }
        });

        const MODES: { mode: TaskViewMode; label: string }[] = [
            { mode: 'open',    label: 'Due' },
            { mode: 'not-due', label: 'No Date' },
            { mode: 'waiting', label: 'Waiting' },
            { mode: 'someday', label: 'Someday' },
            { mode: 'done',    label: 'Archive' },
        ];

        MODES.forEach(({ mode, label }) => {
            const active = this.viewMode === mode;
            const pill = pillBar.createEl('button', {
                attr: {
                    style: `padding: 5px 14px; border-radius: 20px; border: 1px solid ${active ? 'var(--interactive-accent)' : 'var(--background-modifier-border-faint)'}; background: ${active ? 'var(--interactive-accent)' : 'var(--background-secondary-alt)'}; color: ${active ? 'var(--text-on-accent)' : 'var(--text-muted)'}; font-size: 0.75em; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all 0.15s;`
                }
            });
            pill.createSpan({ text: label });
            pill.createEl('span', { text: ` ${counts[mode]}`, attr: { style: 'opacity: 0.7;' } });
            pill.addEventListener('click', () => { this.setMode(mode); this.renderTaskOverview(container); });
        });

        // ── List ──
        this.listContainer = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; border: 1px solid var(--background-modifier-border-faint);' }
        });

        this.renderList();
    }

    private renderList() {
        if (!this.listContainer) return;
        this.listContainer.empty();

        let tasks = Array.from(this.index.taskIndex.values());

        if (this.viewMode === 'open') {
            tasks = tasks.filter(t => t.status === 'open' && t.due && t.due.trim() !== "");
            tasks.sort((a, b) => moment(a.due).valueOf() - moment(b.due).valueOf()); // soonest first
        } else if (this.viewMode === 'not-due') {
            tasks = tasks.filter(t => t.status === 'open' && (!t.due || t.due.trim() === ""));
            tasks.sort((a, b) => b.lastUpdate - a.lastUpdate);
        } else if (this.viewMode === 'waiting') {
            tasks = tasks.filter(t => t.status === 'waiting');
            tasks.sort((a, b) => b.lastUpdate - a.lastUpdate);
        } else if (this.viewMode === 'someday') {
            tasks = tasks.filter(t => t.status === 'someday');
            tasks.sort((a, b) => b.lastUpdate - a.lastUpdate);
        } else {
            tasks = tasks.filter(t => t.status === 'done');
            tasks.sort((a, b) => b.lastUpdate - a.lastUpdate);
        }

        if (this.view.searchQuery) {
            tasks = tasks.filter(t => this.view.matchesSearch(this.view.searchQuery, [t.title, t.body]));
        }

        if (tasks.length === 0) {
            this.listContainer.style.border = 'none';
            this.renderEmptyState(this.listContainer,
                this.viewMode === 'done' ? 'No archived tasks.' :
                this.viewMode === 'waiting' ? 'No waiting tasks.' :
                this.viewMode === 'someday' ? 'No someday tasks.' :
                'Queue is clear ✓'
            );
            return;
        }

        this.listContainer.style.border = '1px solid var(--background-modifier-border-faint)';
        for (const task of tasks) this.renderRow(task, this.listContainer!);
    }

    private renderRow(task: TaskEntry, parent: HTMLElement) {
        const isDone = task.status === 'done';
        const dueM = task.due ? moment(task.due, 'YYYY-MM-DD', true) : null;
        const isOverdue = !isDone && dueM?.isValid() && dueM.isBefore(moment(), 'day');
        const accentColor = isOverdue ? 'var(--text-error)'
            : task.status === 'waiting' ? 'var(--text-faint)'
            : task.status === 'someday' ? 'var(--background-modifier-border)'
            : isDone ? 'transparent'
            : 'var(--interactive-accent)';

        const row = parent.createEl('div', {
            attr: {
                style: `display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: var(--background-primary); border-bottom: 1px solid var(--background-modifier-border-faint); border-left: 3px solid ${accentColor}; transition: background 0.15s;`
            }
        });
        row.addEventListener('mouseenter', () => row.style.background = 'var(--background-secondary-alt)');
        row.addEventListener('mouseleave', () => row.style.background = 'var(--background-primary)');

        // ── Checkbox ──
        const cb = row.createEl('div', {
            attr: {
                style: `width: 20px; height: 20px; border-radius: 6px; border: 2px solid ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; background: ${isDone ? 'var(--interactive-accent)' : 'transparent'}; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; margin-top: 2px; transition: all 0.15s;`
            }
        });
        if (isDone) setIcon(cb, 'check');

        cb.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nextDone = !isDone;

            // 1. Immediate visual feedback
            cb.empty();
            if (nextDone) {
                cb.style.background = 'var(--interactive-accent)';
                cb.style.borderColor = 'var(--interactive-accent)';
                setIcon(cb, 'check');
                titleEl.style.textDecoration = 'line-through';
                titleEl.style.opacity = '0.4';
            } else {
                cb.style.background = 'transparent';
                cb.style.borderColor = 'var(--background-modifier-border)';
                titleEl.style.textDecoration = 'none';
                titleEl.style.opacity = '1';
            }

            // 2. Suppress vault-event re-renders during animation window
            this.view._taskTogglePending++;

            // 3. Write to vault
            await this.vault.toggleTask(task.filePath, nextDone);

            // 4. Animate row out (task moved to different bucket)
            const h = row.offsetHeight;
            row.style.overflow = 'hidden';
            row.style.maxHeight = h + 'px';
            row.style.transition = 'max-height 0.3s ease, opacity 0.25s ease, padding 0.3s ease';
            // Brief pause so the user can see their action registered
            await new Promise(r => setTimeout(r, 200));
            row.style.maxHeight = '0';
            row.style.opacity = '0';
            row.style.paddingTop = '0';
            row.style.paddingBottom = '0';

            setTimeout(() => {
                row.remove();
                this.view._taskTogglePending = Math.max(0, this.view._taskTogglePending - 1);
                // If list is now empty, show the empty state
                if (this.listContainer && this.listContainer.children.length === 0) {
                    this.renderEmptyState(this.listContainer, 'Queue is clear ✓');
                }
            }, 350);
        });

        // ── Content ──
        const content = row.createEl('div', { attr: { style: 'flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;' } });
        const titleEl = content.createEl('span', {
            text: task.title,
            attr: {
                style: `font-weight: 600; font-size: 0.93em; color: var(--text-normal); word-break: break-word; line-height: 1.4; ${isDone ? 'text-decoration: line-through; opacity: 0.45;' : ''}`
            }
        });

        if (task.body && task.body !== task.title) {
            content.createEl('span', {
                text: task.body.replace(/<br>/g, ' ').substring(0, 120),
                attr: { style: 'font-size: 0.8em; color: var(--text-muted); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }
            });
        }

        // Meta chips — responsive
        const meta = content.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px;' } });

        if (task.due && dueM?.isValid()) {
            const duePast = isOverdue;
            meta.createEl('span', {
                text: dueM.format('MMM D'),
                attr: { style: `font-size: 0.7em; font-weight: 700; padding: 1px 7px; border-radius: 4px; background: ${duePast ? 'rgba(239,68,68,0.1)' : 'var(--background-secondary-alt)'}; color: ${duePast ? 'var(--text-error)' : 'var(--text-muted)'};` }
            });
        }
        if (task.priority) {
            const pCol: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#94a3b8' };
            const c = pCol[task.priority] || 'var(--text-muted)';
            meta.createEl('span', {
                text: `↑ ${task.priority}`,
                attr: { style: `font-size: 0.7em; font-weight: 700; padding: 1px 7px; border-radius: 4px; color: ${c}; background: ${c}18;` }
            });
        }
        task.context.slice(0, 3).forEach(ctx => {
            meta.createEl('span', {
                text: `#${ctx}`,
                attr: { style: 'font-size: 0.65em; font-weight: 600; padding: 1px 6px; border-radius: 4px; color: var(--text-accent); background: rgba(var(--interactive-accent-rgb),0.08);' }
            });
        });

        // ── Action buttons ──
        const actions = row.createEl('div', {
            attr: { style: 'display: flex; gap: 2px; flex-shrink: 0; opacity: 0.25; transition: opacity 0.2s;' }
        });
        row.addEventListener('mouseenter', () => actions.style.opacity = '1');
        row.addEventListener('mouseleave', () => actions.style.opacity = '0.25');

        const actionBtn = (icon: string, cb2: () => void, danger = false) => {
            const btn = actions.createEl('button', {
                attr: { style: `background: transparent; border: none; cursor: pointer; padding: 4px 5px; border-radius: 5px; color: ${danger ? 'var(--text-error)' : 'var(--text-muted)'}; display: flex; align-items: center;` }
            });
            setIcon(btn, icon);
            btn.addEventListener('click', (e) => { e.stopPropagation(); cb2(); });
        };

        actionBtn('pencil', () => {
            new EditEntryModal(this.app, this.plugin, task.title, task.context.map(c => `#${c}`).join(' '), task.due || null, true, async (t, c, d) => {
                await this.vault.editTask(task.filePath, t, parseContextString(c), d || undefined);
                this.renderList();
            }, 'Edit Task').open();
        });

        actionBtn('trash-2', () => {
            new ConfirmModal(this.app, 'Move this task to trash?', async () => {
                row.style.transition = 'opacity 0.2s'; row.style.opacity = '0';
                setTimeout(() => row.remove(), 220);
                await this.vault.deleteFile(task.filePath, 'tasks');
            }).open();
        }, true);
    }
}

