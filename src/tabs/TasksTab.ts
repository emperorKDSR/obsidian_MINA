import { TaskEntry } from '../types';
import { moment } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";

export class TasksTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderReviewTasksMode(container);
    }
        renderReviewTasksMode(container: HTMLElement) {
            if (this.view.isDedicated) {
                const header = container.createEl('div', {
                    attr: {
                        style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-primary-alt);'
                    }
                });
                const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
                leftHeader.createEl('h3', {
                    text: this.view.getModeTitle(),
                    attr: { style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' }
                });
            }
            const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
            let filterBarEl: HTMLElement | null = null;
            const renderToggles = (parent: HTMLElement) => {
                const toggleGroup = parent.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: flex-start; width: 100%;' } });
                const filterToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
                filterToggleContainer.createSpan({ text: 'Filter' });
                const filterToggleLabel = filterToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
                const filterCbT = filterToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
                filterCbT.checked = this.view.showTasksFilter;
                const filterSliderT = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.view.showTasksFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
                const filterKnobT = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.view.showTasksFilter ? 'translateX(14px)' : 'translateX(0)'};` } });
                filterCbT.addEventListener('change', (e) => { this.view.showTasksFilter = (e.target as HTMLInputElement).checked; filterSliderT.style.backgroundColor = this.view.showTasksFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; filterKnobT.style.transform = this.view.showTasksFilter ? 'translateX(14px)' : 'translateX(0)'; if (filterBarEl) filterBarEl.style.display = this.view.showTasksFilter ? 'flex' : 'none'; });
                const captureToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
                captureToggleContainer.createSpan({ text: 'Capture' });
                const captureToggleLabel = captureToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
                const captureCb = captureToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
                captureCb.checked = this.view.showCaptureInTasks;
                const captureSlider = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.view.showCaptureInTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
                const captureKnob = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.view.showCaptureInTasks ? 'translateX(14px)' : 'translateX(0)'};` } });
                captureCb.addEventListener('change', (e) => { this.view.showCaptureInTasks = (e.target as HTMLInputElement).checked; captureSlider.style.backgroundColor = this.view.showCaptureInTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; captureKnob.style.transform = this.view.showCaptureInTasks ? 'translateX(14px)' : 'translateX(0)'; if (captureContainer) captureContainer.style.display = this.view.showCaptureInTasks ? 'block' : 'none'; });
            };
            renderToggles(headerSection);
            const filterBar = headerSection.createEl('div', { attr: { style: 'display: none; flex-wrap: wrap; gap: 10px; align-items: center;' } });
            filterBarEl = filterBar;
            const statusSel = filterBar.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
            [['all', 'All Status'], ['pending', 'Pending'], ['completed', 'Completed']].forEach(([val, label]) => { const opt = statusSel.createEl('option', { value: val, text: label }); if (this.view.tasksFilterStatus === val) opt.selected = true; });
            statusSel.addEventListener('change', (e) => { this.view.tasksFilterStatus = (e.target as HTMLSelectElement).value as any; this.refreshCurrentList(); });
            const contextPills = filterBar.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; align-items: center;' } });
            const renderTaskContextPills = () => {
                contextPills.empty();
                this.view.plugin.settings.contexts.forEach(ctx => {
                    const active = this.view.tasksFilterContext.includes(ctx);
                    const pill = contextPills.createEl('span', { text: `#${ctx}`, attr: { style: `cursor: pointer; font-size: 0.8em; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--interactive-accent); background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'}; transition: 0.15s;` } });
                    pill.addEventListener('click', () => { if (active) this.view.tasksFilterContext = this.view.tasksFilterContext.filter(c => c !== ctx); else this.view.tasksFilterContext = [...this.view.tasksFilterContext, ctx]; renderTaskContextPills(); this.refreshCurrentList(); });
                });
            };
            renderTaskContextPills();
            const dateContainer = filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
            const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
            [['all', 'All Dates'], ['today', 'Today'], ['today+overdue', 'Today + Overdue'], ['this-week', 'This Week'], ['next-week', 'Next Week'], ['overdue', 'Overdue Only'], ['no-due', 'No Due Date'], ['custom', 'Custom Date']].forEach(([val, label]) => { const opt = dateSel.createEl('option', { value: val, text: label }); if (this.view.tasksFilterDate === val) opt.selected = true; });
            const customDateContainer = dateContainer.createEl('div', { attr: { style: `display: ${this.view.tasksFilterDate === 'custom' ? 'flex' : 'none'}; gap: 5px; align-items: center; flex-wrap: wrap;` } });
            const customDateStartInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
            if (this.view.tasksFilterDateStart) customDateStartInput.value = this.view.tasksFilterDateStart;
            customDateContainer.createSpan({ text: 'to', attr: { style: 'font-size: 0.85em; color: var(--text-muted); padding: 0 2px;' } });
            const customDateEndInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
            if (this.view.tasksFilterDateEnd) customDateEndInput.value = this.view.tasksFilterDateEnd;
            dateSel.addEventListener('change', (e) => { const val = (e.target as HTMLSelectElement).value; this.view.tasksFilterDate = val; if (val === 'custom') { customDateContainer.style.display = 'flex'; this.view.tasksFilterDateStart = customDateStartInput.value || moment().format('YYYY-MM-DD'); this.view.tasksFilterDateEnd = customDateEndInput.value || moment().format('YYYY-MM-DD'); } else customDateContainer.style.display = 'none'; this.refreshCurrentList(); });
            customDateStartInput.addEventListener('change', () => { this.view.tasksFilterDateStart = customDateStartInput.value; this.refreshCurrentList(); });
            customDateEndInput.addEventListener('change', () => { this.view.tasksFilterDateEnd = customDateEndInput.value; this.refreshCurrentList(); });
    
            this.renderSearchInput(filterBar, () => this.updateReviewTasksList());
    
            const captureContainer = container.createEl('div', { attr: { style: `flex-shrink: 0; display: ${this.view.showCaptureInTasks ? 'block' : 'none'};` } });
            this.renderCaptureMode(captureContainer, false, true);
            this.view.reviewTasksContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 5px 5px 200px 5px;' } });
            this.refreshCurrentList();
        }
    
        async updateReviewTasksList(appendMore = false) {
            if (!this.view.reviewTasksContainer) return;
            if (!appendMore) { this.view.tasksOffset = 0; this.view.reviewTasksContainer.empty(); this.view.tasksRowContainer = null; }
            let tasks: TaskEntry[] = Array.from(this.view.plugin.taskIndex.values());
            if (this.view.searchQuery) {
                tasks = tasks.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
            }
            if (this.view.tasksFilterStatus === 'pending') tasks = tasks.filter(e => e.status === 'open'); else if (this.view.tasksFilterStatus === 'completed') tasks = tasks.filter(e => e.status === 'done');
            if (this.view.tasksFilterContext.length > 0) tasks = tasks.filter(e => this.view.tasksFilterContext.every(ctx => e.context.includes(ctx)));
            const today = moment().locale('en').format('YYYY-MM-DD');
            if (this.view.tasksFilterDate === 'today') tasks = tasks.filter(e => e.due === today);
            else if (this.view.tasksFilterDate === 'today+overdue') tasks = tasks.filter(e => e.due === today || (e.due && e.due < today));
            else if (this.view.tasksFilterDate === 'overdue') tasks = tasks.filter(e => e.due && e.due < today);
            else if (this.view.tasksFilterDate === 'this-week') { const weekEnd = moment().locale('en').endOf('week').format('YYYY-MM-DD'); tasks = tasks.filter(e => e.due && e.due >= today && e.due <= weekEnd); }
            else if (this.view.tasksFilterDate === 'next-week') { const nextStart = moment().locale('en').add(1, 'week').startOf('week').format('YYYY-MM-DD'); const nextEnd = moment().locale('en').add(1, 'week').endOf('week').format('YYYY-MM-DD'); tasks = tasks.filter(e => e.due && e.due >= nextStart && e.due <= nextEnd); }
            else if (this.view.tasksFilterDate === 'no-due') tasks = tasks.filter(e => !e.due || e.due.trim() === '');
            else if (this.view.tasksFilterDate === 'custom' && this.view.tasksFilterDateStart && this.view.tasksFilterDateEnd) tasks = tasks.filter(e => e.due && e.due >= this.view.tasksFilterDateStart && e.due <= this.view.tasksFilterDateEnd);
            tasks.sort((a, b) => { if (a.status !== b.status) return a.status === 'open' ? -1 : 1; if (a.due && b.due) return a.due.localeCompare(b.due); if (a.due) return -1; if (b.due) return 1; return b.lastUpdate - a.lastUpdate; });
            if (!appendMore) { if (tasks.length === 0) { this.view.reviewTasksContainer.createEl('p', { text: 'No tasks found.', attr: { style: 'color: var(--text-muted);' } }); return; } this.view.tasksRowContainer = this.view.reviewTasksContainer.createEl('div'); }
            if (!this.view.tasksRowContainer) return;
            this.view.reviewTasksContainer.querySelector('.mina-load-more')?.remove();
            const PAGE_SIZE = 30; const page = tasks.slice(this.view.tasksOffset, this.view.tasksOffset + PAGE_SIZE);
            for (const entry of page) await this.renderTaskRow(entry, this.view.tasksRowContainer!);
            this.view.tasksOffset += page.length;
            if (this.view.tasksOffset < tasks.length) { const btn = this.view.reviewTasksContainer.createEl('button', { text: `Load more (${tasks.length - this.view.tasksOffset} remaining)`, cls: 'mina-load-more', attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' } }); btn.addEventListener('click', () => this.updateReviewTasksList(true)); }
        }
    
    
}
