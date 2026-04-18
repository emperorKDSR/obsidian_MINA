import { moment, Platform, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from "../modals/EditEntryModal";
import type { TaskEntry } from '../types';
import { parseContextString } from '../utils';

type TaskViewMode = 'open' | 'not-due' | 'done';

export class TasksTab extends BaseTab {
    viewMode: TaskViewMode = 'open';
    private listContainer: HTMLElement;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderTaskOverview(container);
    }

    async renderTaskOverview(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 1100px; margin: 0 auto;'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 16px; margin-bottom: 8px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        const titleStack = titleRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        titleStack.createEl('h2', {
            text: 'Task Overview',
            attr: { style: 'margin: 0; font-size: 1.8em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.04em;' }
        });
        
        const addBtn = titleRow.createEl('button', {
            text: '+ New Task',
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; font-size: 0.7em; padding: 8px 16px; cursor: pointer; font-weight: 700; text-transform: uppercase; box-shadow: var(--mina-shadow);' }
        });
        addBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                if (!text.trim()) return;
                await this.vault.createTaskFile(text, parseContextString(ctxs), due || undefined);
                this.updateTaskList();
            }, 'New Task').open();
        });

        // 2. Control Deck
        const controlDeck = header.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px;' }
        });

        this.renderSearchInput(controlDeck, (val) => { this.view.searchQuery = val; this.updateTaskList(); });

        const filterBar = controlDeck.createEl('div', {
            attr: { style: 'display: flex; gap: 4px; padding: 4px; background: var(--background-secondary-alt); border-radius: 12px; width: fit-content; border: 1px solid var(--background-modifier-border-faint);' }
        });

        const renderToggle = (label: string, mode: TaskViewMode, count: number) => {
            const isActive = this.viewMode === mode;
            const btn = filterBar.createEl('button', {
                text: `${label} (${count})`,
                attr: { style: `padding: 6px 16px; border-radius: 8px; border: none; font-size: 0.6em; font-weight: 800; cursor: pointer; transition: all 0.2s; text-transform: uppercase; background: ${isActive ? 'var(--background-primary)' : 'transparent'}; color: ${isActive ? 'var(--interactive-accent)' : 'var(--text-faint)'}; box-shadow: ${isActive ? 'var(--mina-shadow)' : 'none'};` }
            });
            btn.addEventListener('click', () => { this.viewMode = mode; this.updateTaskList(); });
        };

        const allTasks = Array.from(this.index.taskIndex.values());
        const openCount = allTasks.filter(t => t.status === 'open' && t.due && t.due.trim() !== "").length;
        const notDueCount = allTasks.filter(t => t.status === 'open' && (!t.due || t.due.trim() === "")).length;
        const doneCount = allTasks.filter(t => t.status === 'done').length;

        renderToggle('Open', 'open', openCount);
        renderToggle('Not Due', 'not-due', notDueCount);
        renderToggle('Archive', 'done', doneCount);

        // 3. List Container
        this.listContainer = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 2px; padding-bottom: 120px;' }
        });

        this.updateTaskList();
    }

    async updateTaskList() {
        if (!this.listContainer) return;
        this.listContainer.empty();

        let tasks = Array.from(this.index.taskIndex.values());
        
        if (this.viewMode === 'open') {
            tasks = tasks.filter(t => t.status === 'open' && t.due && t.due.trim() !== "");
        } else if (this.viewMode === 'not-due') {
            tasks = tasks.filter(t => t.status === 'open' && (!t.due || t.due.trim() === ""));
        } else {
            tasks = tasks.filter(t => t.status === 'done');
        }

        if (this.view.searchQuery) {
            tasks = tasks.filter(t => this.view.matchesSearch(this.view.searchQuery, [t.title, t.body]));
        }

        tasks.sort((a, b) => b.lastUpdate - a.lastUpdate);

        if (tasks.length === 0) {
            this.listContainer.createEl('p', { text: 'Queue is clear.', attr: { style: 'color: var(--text-faint); text-align: center; margin-top: 60px; font-style: italic; font-size: 0.9em;' } });
            return;
        }

        for (const task of tasks) {
            this.renderCommandRow(task, this.listContainer);
        }
    }

    private renderCommandRow(task: TaskEntry, parent: HTMLElement) {
        const isDone = task.status === 'done';
        const row = parent.createEl('div', { 
            attr: { style: `display: flex; align-items: center; gap: 16px; padding: 14px 16px; background: var(--background-primary); border-bottom: 1px solid var(--background-modifier-border-faint); transition: all 0.2s; border-left: 4px solid ${isDone ? 'transparent' : 'var(--interactive-accent)'}; opacity: ${isDone ? '0.5' : '1'};` }
        });

        // Checkbox
        const cbWrap = row.createDiv({ attr: { style: 'padding: 2px; cursor: pointer; flex-shrink: 0;' } });
        const cb = cbWrap.createDiv({ 
            attr: { style: `width: 20px; height: 20px; border-radius: 6px; border: 2px solid ${isDone ? 'var(--interactive-accent)' : 'var(--text-faint)'}; background: ${isDone ? 'var(--interactive-accent)' : 'transparent'}; display: flex; align-items: center; justify-content: center;` }
        });
        if (isDone) setIcon(cb, 'lucide-check');

        cbWrap.addEventListener('click', async (e) => {
            e.stopPropagation();
            const nextStatus = !isDone;
            // Optimistic UI
            if (nextStatus) {
                title.style.textDecoration = 'line-through';
                row.style.opacity = '0.5';
                cb.empty(); setIcon(cb, 'lucide-check');
                cb.style.background = 'var(--interactive-accent)';
                cb.style.borderColor = 'var(--interactive-accent)';
            } else {
                title.style.textDecoration = 'none';
                row.style.opacity = '1';
                cb.empty();
                cb.style.background = 'transparent';
                cb.style.borderColor = 'var(--text-faint)';
            }
            await this.vault.toggleTask(task.filePath, nextStatus);
        });

        // Content
        const content = row.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;' } });
        const title = content.createEl('span', { 
            text: task.title, 
            attr: { style: `font-weight: 700; font-size: 1.05em; color: var(--text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${isDone ? 'text-decoration: line-through;' : ''}` } 
        });

        if (task.body) {
            content.createEl('span', { 
                text: task.body.substring(0, 120).replace(/<br>/g, ' '), 
                attr: { style: 'font-size: 0.85em; color: var(--text-muted); opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' } 
            });
        }

        // Meta
        const meta = row.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 16px; flex-shrink: 0;' } });
        if (task.due) meta.createEl('span', { text: task.due, attr: { style: `font-size: 0.7em; font-weight: 800; color: ${isDone ? 'var(--text-faint)' : 'var(--text-accent)'};` } });

        const editBtn = meta.createDiv({ attr: { style: 'opacity: 0.3; cursor: pointer; transition: opacity 0.2s;' } });
        setIcon(editBtn, 'lucide-pencil');
        editBtn.addEventListener('mouseenter', () => editBtn.style.opacity = '1');
        editBtn.addEventListener('mouseleave', () => editBtn.style.opacity = '0.3');
        editBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, task.title, task.context.join(' #'), task.due, true, async (t, c, d) => {
                await this.vault.editTask(task.filePath, t, parseContextString(c), d || undefined);
                this.updateTaskList();
            }, 'Edit Task').open();
        });
    }
}
