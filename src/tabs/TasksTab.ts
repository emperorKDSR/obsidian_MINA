import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from "../modals/EditEntryModal";
import type { TaskEntry } from '../types';

export class TasksTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderReviewTasksMode(container);
    }

    async renderReviewTasksMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'display: flex; flex-direction: column; height: 100%; background: var(--background-primary);'
            }
        });

        // 1. Header (Strategic)
        const header = wrap.createEl('div', {
            attr: { style: 'padding: 16px 14px 10px 14px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: 'Tasks',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const headerActions = titleRow.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
        const tinyBtnStyle = 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.6em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 700; text-transform: uppercase;';
        
        const addTaskBtn = headerActions.createEl('button', { text: '+ Add', attr: { style: tinyBtnStyle } });
        addTaskBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createTaskFile(text, contexts, due || undefined);
                this.renderReviewTasksMode(container);
            }, 'New Task').open();
        });

        this.renderSearchInput(header, (val) => { this.view.searchQuery = val; this.updateReviewTasksList(); });

        const listContainer = wrap.createEl('div', {
            attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; padding: 15px 15px 200px 15px; -webkit-overflow-scrolling: touch;' }
        });

        this.updateReviewTasksList(listContainer);
    }

    async updateReviewTasksList(container?: HTMLElement) {
        const target = container || this.view.containerEl.querySelector('.mina-view-content > div > div:last-child') as HTMLElement;
        if (!target) return;
        target.empty();

        let tasks = Array.from(this.index.taskIndex.values());
        
        if (this.view.searchQuery) {
            tasks = tasks.filter(t => this.view.matchesSearch(this.view.searchQuery, [t.title, t.body]));
        }

        tasks.sort((a, b) => {
            if (a.status === b.status) return b.lastUpdate - a.lastUpdate;
            return a.status === 'open' ? -1 : 1;
        });

        if (tasks.length === 0) {
            target.createEl('p', { text: 'No tasks found.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 40px; opacity: 0.5;' } });
            return;
        }

        for (const task of tasks) {
            await this.renderTaskRow(task, target);
        }
    }
}
