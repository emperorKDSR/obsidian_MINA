import { ThoughtEntry } from '../types';
import { moment } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";

export class ThoughtsTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderReviewThoughtsMode(container);
    }
        renderReviewThoughtsMode(container: HTMLElement) {
            const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
            let captureContainer: HTMLElement;
            let filterBarEl: HTMLElement | null = null;
            const renderToggles = (parent: HTMLElement) => {
                const toggleGroup = parent.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: flex-start; width: 100%;' } });
                const filterToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
                filterToggleContainer.createSpan({ text: 'Filter' });
                const filterToggleLabel = filterToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
                const filterCbTh = filterToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
                filterCbTh.checked = this.view.showThoughtsFilter;
                const filterSliderTh = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.view.showThoughtsFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
                const filterKnobTh = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.view.showThoughtsFilter ? 'translateX(14px)' : 'translateX(0)'};` } });
                filterCbTh.addEventListener('change', (e) => { this.view.showThoughtsFilter = (e.target as HTMLInputElement).checked; filterSliderTh.style.backgroundColor = this.view.showThoughtsFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; filterKnobTh.style.transform = this.view.showThoughtsFilter ? 'translateX(14px)' : 'translateX(0)'; if (filterBarEl) filterBarEl.style.display = this.view.showThoughtsFilter ? 'flex' : 'none'; });
                const historyToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
                historyToggleContainer.createSpan({ text: 'History' });
                const historyToggleLabel = historyToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
                const historyCb = historyToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
                historyCb.checked = this.view.showPreviousThoughts;
                const historySlider = historyToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.view.showPreviousThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
                const historyKnob = historyToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.view.showPreviousThoughts ? 'translateX(14px)' : 'translateX(0)'};` } });
                historyCb.addEventListener('change', (e) => { this.view.showPreviousThoughts = (e.target as HTMLInputElement).checked; historySlider.style.backgroundColor = this.view.showPreviousThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; historyKnob.style.transform = this.view.showPreviousThoughts ? 'translateX(14px)' : 'translateX(0)'; this.refreshCurrentList(); });
                const captureToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
                captureToggleContainer.createSpan({ text: 'Capture' });
                const captureToggleLabel = captureToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
                const captureCb = captureToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
                captureCb.checked = this.view.showCaptureInThoughts;
                const captureSlider = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.view.showCaptureInThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
                const captureKnob = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.view.showCaptureInThoughts ? 'translateX(14px)' : 'translateX(0)'};` } });
                captureCb.addEventListener('change', (e) => { this.view.showCaptureInThoughts = (e.target as HTMLInputElement).checked; captureSlider.style.backgroundColor = this.view.showCaptureInThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; captureKnob.style.transform = this.view.showCaptureInThoughts ? 'translateX(14px)' : 'translateX(0)'; if (captureContainer) captureContainer.style.display = this.view.showCaptureInThoughts ? 'block' : 'none'; });
                const todoToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
                todoToggleContainer.createSpan({ text: 'TO-DOs' });
                const todoToggleLabel = todoToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
                const todoCb = todoToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
                todoCb.checked = this.view.thoughtsFilterTodo;
                const todoSlider = todoToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.view.thoughtsFilterTodo ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
                const todoKnob = todoToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.view.thoughtsFilterTodo ? 'translateX(14px)' : 'translateX(0)'};` } });
                todoCb.addEventListener('change', (e) => { this.view.thoughtsFilterTodo = (e.target as HTMLInputElement).checked; todoSlider.style.backgroundColor = this.view.thoughtsFilterTodo ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; todoKnob.style.transform = this.view.thoughtsFilterTodo ? 'translateX(14px)' : 'translateX(0)'; this.refreshCurrentList(); });
            };
            renderToggles(headerSection);
            const filterBar = headerSection.createEl('div', { attr: { style: 'display: none; flex-wrap: wrap; gap: 10px; align-items: center;' } });
            filterBarEl = filterBar;
            const contextPillsTh = filterBar.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; align-items: center;' } });
            const renderThoughtContextPills = () => {
                contextPillsTh.empty();
                this.view.plugin.settings.contexts.forEach(ctx => {
                    const active = this.view.thoughtsFilterContext.includes(ctx);
                    const pill = contextPillsTh.createEl('span', { text: `#${ctx}`, attr: { style: `cursor: pointer; font-size: 0.8em; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--interactive-accent); background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'}; transition: 0.15s;` } });
                    pill.addEventListener('click', () => { if (active) this.view.thoughtsFilterContext = this.view.thoughtsFilterContext.filter(c => c !== ctx); else this.view.thoughtsFilterContext = [...this.view.thoughtsFilterContext, ctx]; renderThoughtContextPills(); this.refreshCurrentList(); });
                });
            };
            renderThoughtContextPills();
            const dateContainer= filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
            const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
            [['all', 'All Dates'], ['today', 'Today'], ['last-5-days', 'Last 5 Days'], ['this-week', 'This Week'], ['custom', 'Custom Date']].forEach(([val, label]) => { const opt = dateSel.createEl('option', { value: val, text: label }); if (this.view.thoughtsFilterDate === val) opt.selected = true; });
            const customDateContainer = dateContainer.createEl('div', { attr: { style: `display: ${this.view.thoughtsFilterDate === 'custom' ? 'flex' : 'none'}; gap: 5px; align-items: center; flex-wrap: wrap;` } });
            const customDateStartInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
            if (this.view.thoughtsFilterDateStart) customDateStartInput.value = this.view.thoughtsFilterDateStart;
            customDateContainer.createSpan({ text: 'to', attr: { style: 'font-size: 0.85em; color: var(--text-muted); padding: 0 2px;' } });
            const customDateEndInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
            if (this.view.thoughtsFilterDateEnd) customDateEndInput.value = this.view.thoughtsFilterDateEnd;
            dateSel.addEventListener('change', (e) => { const val = (e.target as HTMLSelectElement).value; this.view.thoughtsFilterDate = val; if (val === 'custom') { customDateContainer.style.display = 'flex'; this.view.thoughtsFilterDateStart = customDateStartInput.value || moment().format('YYYY-MM-DD'); this.view.thoughtsFilterDateEnd = customDateEndInput.value || moment().format('YYYY-MM-DD'); } else customDateContainer.style.display = 'none'; this.refreshCurrentList(); });
            customDateStartInput.addEventListener('change', () => { this.view.thoughtsFilterDateStart = customDateStartInput.value; this.refreshCurrentList(); });
            customDateEndInput.addEventListener('change', () => { this.view.thoughtsFilterDateEnd = customDateEndInput.value; this.refreshCurrentList(); });
    
            this.renderSearchInput(filterBar, () => this.updateReviewThoughtsList());
    
            captureContainer = container.createEl('div', { attr: { style: `flex-shrink: 0; display: ${this.view.showCaptureInThoughts ? 'block' : 'none'};` } });
            this.renderCaptureMode(captureContainer, true);
            this.view.reviewThoughtsContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 5px 5px 200px 5px;' } });
            this.refreshCurrentList();
        }
    
        async updateReviewThoughtsList(appendMore = false) {
            if (!this.view.reviewThoughtsContainer) return;
            if (!appendMore) {
                this.view.thoughtsOffset = 0; this.view.reviewThoughtsContainer.empty(); this.view._parsedRoots = [];
                let roots: ThoughtEntry[] = Array.from(this.view.plugin.thoughtIndex.values());
                if (this.view.searchQuery) {
                    roots = roots.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
                }
                if (this.view.thoughtsFilterContext.length > 0) roots = roots.filter(e => this.view.thoughtsFilterContext.every(ctx => e.context.includes(ctx)));
                if (!this.view.showPreviousThoughts) { const today = moment().locale('en').format('YYYY-MM-DD'); roots = roots.filter(e => e.day === today); }
                if (this.view.thoughtsFilterDate === 'today') { const today = moment().locale('en').format('YYYY-MM-DD'); roots = roots.filter(e => e.day === today); }
                else if (this.view.thoughtsFilterDate === 'last-5-days') { const cutoff = moment().subtract(4, 'days').startOf('day').format('YYYY-MM-DD'); roots = roots.filter(e => e.day >= cutoff); }
                else if (this.view.thoughtsFilterDate === 'this-week') { const weekStart = moment().startOf('week').valueOf(); roots = roots.filter(e => new Date(e.created.replace(' ', 'T')).getTime() >= weekStart); }
                else if (this.view.thoughtsFilterDate === 'custom' && this.view.thoughtsFilterDateStart && this.view.thoughtsFilterDateEnd) roots = roots.filter(e => e.day >= this.view.thoughtsFilterDateStart && e.day <= this.view.thoughtsFilterDateEnd);
                roots.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
                if (this.view.thoughtsFilterTodo) roots = roots.filter(e => /- \[ \]/.test(e.body + e.children.map(r => r.text).join('\n')));
                this.view._parsedRoots = roots;
                if (roots.length === 0) { this.view.reviewThoughtsContainer.createEl('p', { text: 'No thoughts found.', attr: { style: 'color: var(--text-muted);' } }); return; }
                this.view.thoughtsRowContainer = this.view.reviewThoughtsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
            }
            if (!this.view.thoughtsRowContainer) return;
            this.view.reviewThoughtsContainer.querySelector('.mina-load-more')?.remove();
            const PAGE_SIZE = 20; const page = this.view._parsedRoots.slice(this.view.thoughtsOffset, this.view.thoughtsOffset + PAGE_SIZE);
            for (const entry of page) await this.renderThoughtRow(entry, this.view.thoughtsRowContainer!, entry.filePath, 0);
            this.view.thoughtsOffset += page.length;
            if (this.view.thoughtsOffset < this.view._parsedRoots.length) { const loadMoreBtn = this.view.reviewThoughtsContainer.createEl('button', { text: `Load more (${this.view._parsedRoots.length - this.view.thoughtsOffset} remaining)`, cls: 'mina-load-more', attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' } }); loadMoreBtn.addEventListener('click', () => this.updateReviewThoughtsList(true)); }
        }
    
    
}
