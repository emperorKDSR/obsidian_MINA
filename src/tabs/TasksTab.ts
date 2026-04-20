import { moment, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from "../modals/EditEntryModal";
import { ConfirmModal } from "../modals/ConfirmModal";
import type { TaskEntry } from '../types';
import { parseContextString } from '../utils';

type TaskViewMode = 'open' | 'not-due' | 'done' | 'waiting' | 'someday';

const MODES: { mode: TaskViewMode; label: string }[] = [
    { mode: 'open',    label: 'Open' },
    { mode: 'not-due', label: 'No Date' },
    { mode: 'waiting', label: 'Waiting' },
    { mode: 'someday', label: 'Someday' },
    { mode: 'done',    label: 'Done' },
];

export class TasksTab extends BaseTab {
    private viewMode: TaskViewMode = 'open';
    private listContainer: HTMLElement | null = null;

    constructor(view: MinaView) {
        super(view);
        this.viewMode = this.view.tasksViewMode === 'inbox' ? 'open' : ((this.view.tasksViewMode as TaskViewMode) || 'open');
    }

    render(container: HTMLElement) {
        this.renderTaskOverview(container);
    }

    private setMode(mode: TaskViewMode) {
        this.viewMode = mode;
        this.view.tasksViewMode = mode;
    }

    async renderTaskOverview(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'mina-tab-wrap' });

        // ── Header row ──
        const header = wrap.createEl('div', { cls: 'mina-tasks-header' });
        const navAndTitle = header.createEl('div', { cls: 'mina-tasks-title-row' });
        this.renderHomeIcon(navAndTitle);
        navAndTitle.createEl('h2', { text: 'Tasks', cls: 'mina-tab-title' });

        const addBtn = header.createEl('button', { cls: 'mina-tasks-add-btn' });
        const addIcon = addBtn.createEl('span'); setIcon(addIcon, 'plus');
        addBtn.createSpan({ text: 'New' });
        addBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                if (!text.trim()) return;
                await this.vault.createTaskFile(text, parseContextString(ctxs), due || undefined);
                this.renderTaskOverview(container);
            }, 'New Task').open();
        });

        // ── Search ──
        const searchInp = wrap.createEl('input', {
            type: 'text',
            cls: 'mina-tasks-search',
            attr: { placeholder: 'Search tasks…' }
        });
        if (this.view.searchQuery) searchInp.value = this.view.searchQuery;
        searchInp.addEventListener('input', () => { this.view.searchQuery = searchInp.value; this.renderList(); });

        // ── Segmented control ──
        const allTasks = Array.from(this.index.taskIndex.values());
        const counts: Record<TaskViewMode, number> = {
            'open':    allTasks.filter(t => t.status === 'open').length,
            'not-due': allTasks.filter(t => t.status === 'open' && (!t.due || t.due.trim() === "")).length,
            'waiting': allTasks.filter(t => t.status === 'waiting').length,
            'someday': allTasks.filter(t => t.status === 'someday').length,
            'done':    allTasks.filter(t => t.status === 'done').length,
        };
        const segBar = wrap.createEl('div', { cls: 'mina-seg-bar' });
        MODES.forEach(({ mode, label }) => {
            const btn = segBar.createEl('button', { cls: `mina-seg-btn${this.viewMode === mode ? ' is-active' : ''}` });
            btn.createSpan({ text: label });
            if (counts[mode] > 0) btn.createEl('span', { text: String(counts[mode]), cls: 'mina-seg-count' });
            btn.addEventListener('click', () => { this.setMode(mode); this.renderTaskOverview(container); });
        });

        // ── List shell ──
        this.listContainer = wrap.createEl('div', { cls: 'mina-task-list' });
        this.renderList();
    }

    private renderList() {
        if (!this.listContainer) return;
        this.listContainer.empty();

        let tasks = Array.from(this.index.taskIndex.values());
        if (this.viewMode === 'open') {
            tasks = tasks.filter(t => t.status === 'open');
            tasks.sort((a, b) => {
                const aHasDue = !!(a.due && a.due.trim() !== '');
                const bHasDue = !!(b.due && b.due.trim() !== '');
                if (aHasDue && !bHasDue) return -1;
                if (!aHasDue && bHasDue) return 1;
                if (aHasDue && bHasDue) return moment(a.due).valueOf() - moment(b.due).valueOf();
                return b.lastUpdate - a.lastUpdate;
            });
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
            const emptyMsgs: Record<TaskViewMode, string> = {
                open: 'All clear ✓', 'not-due': 'No undated tasks.',
                waiting: 'Nothing waiting.', someday: 'No someday items.', done: 'No completed tasks.'
            };
            this.renderEmptyState(this.listContainer, emptyMsgs[this.viewMode]);
            return;
        }

        // ── Group the merged open queue by time horizon ─────────────────────
        if (this.viewMode === 'open') {
            const today = moment().startOf('day');
            const parsed = tasks.map(t => ({ task: t, m: moment(t.due, 'YYYY-MM-DD') }));
            const overdue  = parsed.filter(({m}) => m.isValid() && m.isBefore(today, 'day')).map(x => x.task);
            const dueToday = parsed.filter(({m}) => m.isValid() && m.isSame(today, 'day')).map(x => x.task);
            const upcoming = parsed.filter(({m}) => m.isValid() && m.isAfter(today, 'day')).map(x => x.task);
            const noDate = parsed.filter(({task, m}) => !task.due || task.due.trim() === '' || !m.isValid()).map(x => x.task);
            if (overdue.length)  this.renderGroup('Overdue', overdue, true);
            if (dueToday.length) this.renderGroup('Today', dueToday, false);
            if (upcoming.length) this.renderGroup('Upcoming', upcoming, false);
            if (noDate.length)   this.renderGroup('No Date', noDate, false);
        } else {
            for (const task of tasks) this.renderRow(task, this.listContainer!);
        }
    }

    private renderGroup(label: string, tasks: TaskEntry[], danger: boolean) {
        if (!this.listContainer) return;
        const group = this.listContainer.createEl('div', { cls: 'mina-task-group' });
        group.createEl('div', {
            text: label,
            cls: `mina-task-group-label${danger ? ' is-danger' : ''}`
        });
        for (const task of tasks) this.renderRow(task, group);
    }

    private renderRow(task: TaskEntry, parent: HTMLElement) {
        const isDone = task.status === 'done';
        const dueM = task.due ? moment(task.due, 'YYYY-MM-DD', true) : null;
        const isOverdue = !isDone && dueM?.isValid() && dueM.isBefore(moment(), 'day');
        const isToday = !isDone && dueM?.isValid() && dueM.isSame(moment(), 'day');

        const row = parent.createEl('div', { cls: `mina-task-row${isDone ? ' is-done' : ''}` });

        // ── Circle checkbox ──
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
            // Animate out
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
                if (this.listContainer && this.listContainer.querySelectorAll('.mina-task-row').length === 0) {
                    this.renderEmptyState(this.listContainer, 'Queue is clear ✓');
                }
            }, 340);
        });

        // ── Content ──
        const content = row.createEl('div', { cls: 'mina-task-content' });
        const titleEl = content.createEl('span', {
            text: task.title,
            cls: `mina-task-title${isDone ? ' is-done' : ''}`
        });

        // Meta row
        const hasMeta = (task.due && dueM?.isValid()) || task.priority || task.context.length > 0;
        if (hasMeta) {
            const meta = content.createEl('div', { cls: 'mina-task-meta' });
            if (task.due && dueM?.isValid()) {
                const dateText = isToday ? 'Today' : isOverdue ? dueM.format('MMM D') : dueM.format('MMM D');
                meta.createEl('span', {
                    text: dateText,
                    cls: `mina-chip mina-chip--date${isOverdue ? ' is-overdue' : isToday ? ' is-today' : ''}`
                });
            }
            if (task.priority) {
                const pMap: Record<string, string> = { high: 'high', medium: 'med', low: 'low' };
                meta.createEl('span', {
                    text: pMap[task.priority] || task.priority,
                    cls: `mina-chip mina-chip--pri-${task.priority}`
                });
            }
            task.context.slice(0, 2).forEach(ctx => {
                meta.createEl('span', { text: `#${ctx}`, cls: 'mina-chip mina-chip--ctx' });
            });
        }

        // ── Actions (reveal on hover) ──
        const actions = row.createEl('div', { cls: 'mina-task-actions' });
        const mkBtn = (icon: string, fn: () => void, danger = false) => {
            const btn = actions.createEl('button', { cls: `mina-task-action-btn${danger ? ' is-danger' : ''}` });
            setIcon(btn, icon);
            btn.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        };
        mkBtn('pencil', () => {
            new EditEntryModal(this.app, this.plugin, task.title, task.context.map(c => `#${c}`).join(' '), task.due || null, true, async (t, c, d) => {
                await this.vault.editTask(task.filePath, t, parseContextString(c), d || undefined);
                this.renderList();
            }, 'Edit Task').open();
        });
        mkBtn('trash-2', () => {
            new ConfirmModal(this.app, 'Move this task to trash?', async () => {
                row.style.transition = 'opacity 0.2s';
                row.style.opacity = '0';
                setTimeout(() => row.remove(), 220);
                await this.vault.deleteFile(task.filePath, 'tasks');
            }).open();
        }, true);
    }
}

