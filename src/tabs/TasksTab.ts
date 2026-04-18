import { moment, Platform } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from "../modals/EditEntryModal";
import type { TaskEntry } from '../types';

export class TasksTab extends BaseTab {
    showCompleted: boolean = false;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderReviewTasksMode(container);
    }

    async renderReviewTasksMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 900px; margin: 0 auto;'
            }
        });

        // 1. Header (Strategic Title Stack)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 14px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        const titleStack = titleRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        titleStack.createEl('h2', {
            text: 'Tactical Tasks',
            attr: { style: 'margin: 0; font-size: 1.6em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.03em;' }
        });
        titleStack.createEl('span', { text: 'Capture and Execute', attr: { style: 'font-size: 0.8em; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;' } });

        const addBtn = titleRow.createEl('button', {
            text: '+ New Task',
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; font-size: 0.65em; padding: 6px 14px; cursor: pointer; font-weight: 800; text-transform: uppercase; box-shadow: 0 4px 10px rgba(var(--interactive-accent-rgb), 0.2);' }
        });
        addBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createTaskFile(text, contexts, due || undefined);
                this.renderReviewTasksMode(container);
            }, 'New Task').open();
        });

        // 2. Control Bar (Search + Filter)
        const controlBar = header.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px;' }
        });

        this.renderSearchInput(controlBar, (val) => { this.view.searchQuery = val; this.updateReviewTasksList(); });

        const filterBar = controlBar.createEl('div', {
            attr: { style: 'display: flex; gap: 4px; padding: 4px; background: var(--background-secondary-alt); border-radius: 12px; border: 1px solid var(--background-modifier-border-faint); width: fit-content;' }
        });

        const renderTogglePill = (label: string, isActive: boolean, onClick: () => void) => {
            const pill = filterBar.createEl('button', {
                text: label,
                attr: { style: `padding: 4px 14px; border-radius: 8px; border: none; font-size: 0.65em; font-weight: 800; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; background: ${isActive ? 'var(--background-primary)' : 'transparent'}; color: ${isActive ? 'var(--interactive-accent)' : 'var(--text-muted)'}; box-shadow: ${isActive ? 'var(--mina-shadow)' : 'none'};` }
            });
            pill.addEventListener('click', onClick);
        };

        renderTogglePill('Active Tasks', !this.showCompleted, () => { this.showCompleted = false; this.renderReviewTasksMode(container); });
        renderTogglePill('Completed History', this.showCompleted, () => { this.showCompleted = true; this.renderReviewTasksMode(container); });

        // 3. Task List
        const listContainer = wrap.createEl('div', {
            attr: { style: 'flex-grow: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding-bottom: 100px;' }
        });

        this.updateReviewTasksList(listContainer);
    }

    async updateReviewTasksList(container?: HTMLElement) {
        const target = container || this.view.containerEl.querySelector('.mina-view-content div > div:last-child') as HTMLElement;
        if (!target) return;
        target.empty();

        let tasks = Array.from(this.index.taskIndex.values());
        
        // Filter by Status
        tasks = tasks.filter(t => this.showCompleted ? t.status === 'done' : t.status === 'open');

        // Filter by Search
        if (this.view.searchQuery) {
            tasks = tasks.filter(t => this.view.matchesSearch(this.view.searchQuery, [t.title, t.body]));
        }

        // Sorting: Most recent update first
        tasks.sort((a, b) => b.lastUpdate - a.lastUpdate);

        if (tasks.length === 0) {
            target.createEl('p', { text: this.showCompleted ? 'No completed tasks found.' : 'No active tasks. Time to relax?', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 40px; opacity: 0.5; font-style: italic;' } });
            return;
        }

        for (const task of tasks) {
            await this.renderTaskRow(task, target);
        }
    }
}
