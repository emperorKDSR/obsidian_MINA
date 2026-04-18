import { TaskEntry } from '../types';
import { moment, Platform } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';

export class TasksTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderReviewTasksMode(container);
    }

    async renderReviewTasksMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 18px 14px 200px 14px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header (Compact Action Bar)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 2px;' }
        });

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: 'Tasks',
            attr: { style: 'margin: 0; font-size: 1.3em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em;' }
        });

        const headerActions = titleRow.createEl('div', { attr: { style: 'display: flex; gap: 6px; align-items: center;' } });
        
        const tinyBtnStyle = 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.6em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.1s; display: flex; align-items: center; justify-content: center; min-height: 22px;';
        
        // Add Task Button (+)
        const addTaskBtn = headerActions.createEl('button', {
            attr: { style: tinyBtnStyle + ' font-size: 1em; padding: 0 8px; color: var(--interactive-accent); border-color: var(--background-modifier-border);' }
        });
        addTaskBtn.setText('＋');
        
        const searchBtn = headerActions.createEl('button', { text: 'Search', attr: { style: tinyBtnStyle } });
        const configBtn = headerActions.createEl('button', { text: 'Filters', attr: { style: tinyBtnStyle } });

        // Event: Add Task
        addTaskBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text: string, ctxs: string, due: string | null) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                await this.view.plugin.createTaskFile(text, contexts, due || undefined);
                this.updateReviewTasksList();
            }, 'New Task').open();
        });

        // 3. Search and Filter (Clean Expandables)
        const searchWrapper = header.createEl('div', { attr: { style: 'display: none; transition: all 0.2s;' } });
        this.renderSearchInput(searchWrapper, () => this.updateReviewTasksList());

        searchBtn.addEventListener('click', () => {
            const isHidden = searchWrapper.style.display === 'none';
            searchWrapper.style.display = isHidden ? 'block' : 'none';
            searchBtn.style.borderColor = isHidden ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
            searchBtn.style.color = isHidden ? 'var(--text-accent)' : 'var(--text-muted)';
            if (isHidden) {
                const input = searchWrapper.querySelector('input');
                if (input) input.focus();
            }
        });

        const filtersWrapper = header.createEl('div', {
            attr: { style: 'display: none; flex-direction: column; gap: 8px; padding: 10px; background: var(--background-secondary-alt); border-radius: 12px; border: 1px solid var(--background-modifier-border-faint);' }
        });

        configBtn.addEventListener('click', () => {
            const isHidden = filtersWrapper.style.display === 'none';
            filtersWrapper.style.display = isHidden ? 'flex' : 'none';
            configBtn.style.borderColor = isHidden ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
            configBtn.style.color = isHidden ? 'var(--text-accent)' : 'var(--text-muted)';
        });

        this.renderFilters = (container: HTMLElement) => {
            container.empty();
            // Status Row
            const sRow = container.createEl('div', { attr: { style: 'display: flex; gap: 4px; align-items: center;' } });
            sRow.createSpan({ text: 'Status', attr: { style: 'font-size: 0.65em; font-weight: 800; text-transform: uppercase; color: var(--text-faint); min-width: 45px;' } });
            [['all', 'ALL'], ['pending', 'PENDING'], ['completed', 'DONE']].forEach(([id, label]) => {
                const isActive = this.view.tasksFilterStatus === id;
                const pill = sRow.createEl('button', { text: label, attr: { style: `padding: 3px 8px; border-radius: 6px; border: none; font-size: 0.65em; font-weight: 700; cursor: pointer; background: ${isActive ? 'var(--interactive-accent)' : 'transparent'}; color: ${isActive ? 'var(--text-on-accent)' : 'var(--text-muted)'};` } });
                pill.addEventListener('click', () => { this.view.tasksFilterStatus = id as any; this.renderFilters(container); this.updateReviewTasksList(); });
            });

            // Date Row
            const dRow = container.createEl('div', { attr: { style: 'display: flex; gap: 4px; align-items: center; margin-top: 2px;' } });
            dRow.createSpan({ text: 'Time', attr: { style: 'font-size: 0.65em; font-weight: 800; text-transform: uppercase; color: var(--text-faint); min-width: 45px;' } });
            const ds = dRow.createEl('select', { attr: { style: 'font-size: 0.8em; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 1px 4px; color: var(--text-normal); outline: none;' } });
            [['all', 'All Time'], ['today', 'Today'], ['today+overdue', 'Focus'], ['this-week', 'This Week'], ['overdue', 'Overdue'], ['no-due', 'Inbox'], ['custom', 'Custom']].forEach(([val, label]) => {
                const opt = ds.createEl('option', { value: val, text: label });
                if (this.view.tasksFilterDate === val) opt.selected = true;
            });
            ds.addEventListener('change', () => {
                this.view.tasksFilterDate = ds.value;
                this.renderFilters(container);
                this.updateReviewTasksList();
            });

            if (this.view.tasksFilterDate === 'custom') {
                const cRow = container.createEl('div', { attr: { style: 'display: flex; gap: 4px; align-items: center; margin-left: 49px;' } });
                const start = cRow.createEl('input', { type: 'date', attr: { style: 'font-size: 0.75em; padding: 1px 4px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);' } });
                start.value = this.view.tasksFilterDateStart || moment().format('YYYY-MM-DD');
                cRow.createSpan({ text: '→', attr: { style: 'color: var(--text-faint); font-size: 0.8em;' } });
                const end = cRow.createEl('input', { type: 'date', attr: { style: 'font-size: 0.75em; padding: 1px 4px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);' } });
                end.value = this.view.tasksFilterDateEnd || moment().format('YYYY-MM-DD');
                const apply = () => { this.view.tasksFilterDateStart = start.value; this.view.tasksFilterDateEnd = end.value; this.updateReviewTasksList(); };
                start.addEventListener('change', apply);
                end.addEventListener('change', apply);
            }
        };
        this.renderFilters(filtersWrapper);

        // 4. Tasks List (The results)
        this.view.reviewTasksContainer = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 8px; width: 100%;' }
        });

        this.updateReviewTasksList();
    }

    private renderFilters: (container: HTMLElement) => void;

    async updateReviewTasksList(appendMore = false) {
        if (!this.view.reviewTasksContainer) return;
        if (!appendMore) { 
            this.view.tasksOffset = 0; 
            this.view.reviewTasksContainer.empty(); 
            this.view.tasksRowContainer = this.view.reviewTasksContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        } else if (!this.view.tasksRowContainer) {
            this.view.tasksRowContainer = this.view.reviewTasksContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        }
        
        let tasks: TaskEntry[] = Array.from(this.view.plugin.taskIndex.values());
        
        if (this.view.searchQuery) {
            tasks = tasks.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
        }
        
        if (this.view.tasksFilterStatus === 'pending') tasks = tasks.filter(e => e.status === 'open'); 
        else if (this.view.tasksFilterStatus === 'completed') tasks = tasks.filter(e => e.status === 'done');
        
        if (this.view.tasksFilterContext.length > 0) tasks = tasks.filter(e => this.view.tasksFilterContext.every(ctx => e.context.includes(ctx)));
        
        const today = moment().locale('en').format('YYYY-MM-DD');
        if (this.view.tasksFilterDate === 'today') tasks = tasks.filter(e => e.due === today);
        else if (this.view.tasksFilterDate === 'today+overdue') tasks = tasks.filter(e => e.due === today || (e.due && e.due < today));
        else if (this.view.tasksFilterDate === 'overdue') tasks = tasks.filter(e => e.due && e.due < today);
        else if (this.view.tasksFilterDate === 'this-week') { const weekEnd = moment().locale('en').endOf('week').format('YYYY-MM-DD'); tasks = tasks.filter(e => e.due && e.due >= today && e.due <= weekEnd); }
        else if (this.view.tasksFilterDate === 'no-due') tasks = tasks.filter(e => !e.due || e.due.trim() === '');
        else if (this.view.tasksFilterDate === 'custom' && this.view.tasksFilterDateStart && this.view.tasksFilterDateEnd) tasks = tasks.filter(e => e.due && e.due >= this.view.tasksFilterDateStart && e.due <= this.view.tasksFilterDateEnd);
        
        tasks.sort((a, b) => { 
            if (a.status !== b.status) return a.status === 'open' ? -1 : 1; 
            if (a.due && b.due) return a.due.localeCompare(b.due); 
            if (a.due) return -1; if (b.due) return 1; 
            return b.lastUpdate - a.lastUpdate; 
        });

        if (!appendMore && tasks.length === 0) { 
            this.view.reviewTasksContainer.createEl('p', { text: 'Clear for now.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 40px; font-size: 0.85em; opacity: 0.5; font-style: italic;' } }); 
            return; 
        }

        this.view.reviewTasksContainer.querySelector('.mina-load-more')?.remove();
        const PAGE_SIZE = 30; 
        const page = tasks.slice(this.view.tasksOffset, this.view.tasksOffset + PAGE_SIZE);
        
        for (const entry of page) await this.renderTaskRow(entry, this.view.tasksRowContainer!);
        
        this.view.tasksOffset += page.length;
        if (this.view.tasksOffset < tasks.length) { 
            const btn = this.view.reviewTasksContainer.createEl('button', { 
                text: `Load more (${tasks.length - this.view.tasksOffset})`, 
                cls: 'mina-load-more', 
                attr: { style: 'width: 100%; padding: 10px; margin-top: 10px; border-radius: 10px; border: 1px solid var(--background-modifier-border-faint); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.75em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;' } 
            }); 
            btn.addEventListener('click', () => this.updateReviewTasksList(true)); 
        }
    }
}
