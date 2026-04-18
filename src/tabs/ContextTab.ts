import { Platform, moment } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';

export class ContextTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement, modeId: string) {
        this.renderContextMode(container, modeId);
    }

    renderContextMode(container: HTMLElement, modeId: string) {
        container.empty();
        const modeTitle = this.view.getModeTitle();
        const customMode = this.view.plugin.settings.customModes.find(m => m.id === modeId);
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 16px 14px 200px 14px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; margin-bottom: 4px;' }
        });

        const titleStack = header.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        const titleRow = titleStack.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: modeTitle,
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const searchBtn = titleRow.createEl('button', {
            text: 'Search',
            attr: { style: 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.65em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 600;' }
        });

        const searchWrapper = header.createEl('div', {
            attr: { style: 'display: none; transition: all 0.2s;' }
        });
        this.renderSearchInput(searchWrapper, () => this.updateContextList(modeId, listContainer));

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

        const actionRow = header.createEl('div', {
            attr: { style: 'display: flex; gap: 8px;' }
        });

        const actionBtnStyle = 'flex: 1; padding: 10px; border-radius: 10px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); font-size: 0.8em; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.1s;';

        const addNoteBtn = actionRow.createEl('button', {
            attr: { style: actionBtnStyle }
        });
        addNoteBtn.createSpan({ text: '✍️', attr: { style: 'font-size: 1.1em;' } });
        addNoteBtn.createSpan({ text: 'Add Note' });
        
        const getModeContext = () => {
            if (modeId === 'journal') return 'journal';
            if (modeId === 'grundfos') return 'Grundfos';
            return customMode?.context || '';
        };

        addNoteBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', getModeContext(), null, false, async (text: string, ctxs: string) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                await this.view.plugin.createThoughtFile(text, contexts);
                this.updateContextList(modeId, listContainer);
            }, `New ${modeTitle} Note`).open();
        });

        const addTaskBtn = actionRow.createEl('button', {
            attr: { style: actionBtnStyle }
        });
        addTaskBtn.createSpan({ text: '✅', attr: { style: 'font-size: 1.1em;' } });
        addTaskBtn.createSpan({ text: 'Add Task' });
        addTaskBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', getModeContext(), moment().format('YYYY-MM-DD'), true, async (text: string, ctxs: string, due: string | null) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                await this.view.plugin.createTaskFile(text, contexts, due || undefined);
                this.updateContextList(modeId, listContainer);
            }, `New ${modeTitle} Task`).open();
        });

        const listContainer = wrap.createEl('div', {
            cls: `mina-list-${modeId}`,
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' }
        });

        this.updateContextList(modeId, listContainer);
    }

    async updateContextList(modeId: string, container?: HTMLElement) {
        const listContainer = container || this.view.containerEl.querySelector(`.mina-list-${modeId}`) as HTMLElement;
        if (!listContainer) return;
        listContainer.empty();

        let entries = Array.from(this.view.plugin.thoughtIndex.values());
        const customMode = this.view.plugin.settings.customModes.find(m => m.id === modeId);

        if (modeId === 'journal') {
            entries = entries.filter(e => e.context.includes('journal'));
        } else if (modeId === 'grundfos') {
            entries = entries.filter(e => e.context.includes('Grundfos'));
        } else if (customMode) {
            if (customMode.context && customMode.context !== 'All') {
                entries = entries.filter(e => e.context.includes(customMode.context));
            }
            if (customMode.keywords) {
                const keywordsValue = customMode.keywords as any;
                const kwArr = Array.isArray(keywordsValue) 
                    ? keywordsValue 
                    : (typeof keywordsValue === 'string' ? keywordsValue.split(',').map(k => k.trim()).filter(k => k) : []);
                
                const includes = kwArr.filter(k => !k.startsWith('-'));
                const excludes = kwArr.filter(k => k.startsWith('-')).map(k => k.substring(1));
                if (includes.length > 0) entries = entries.filter(e => includes.some(k => e.body.includes(k)));
                if (excludes.length > 0) entries = entries.filter(e => !excludes.some(k => e.body.includes(k)));
            }
        }

        if (this.view.searchQuery) {
            entries = entries.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
        }

        const order = modeId === 'journal' ? this.view.plugin.settings.journalModeOrder : (modeId === 'grundfos' ? this.view.plugin.settings.grundfosModeOrder : (this.view.plugin.settings.customModeOrders[modeId] || []));
        entries.sort((a, b) => {
            const idxA = order.indexOf(a.filePath); const idxB = order.indexOf(b.filePath);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1; if (idxB !== -1) return 1;
            return b.lastThreadUpdate - a.lastThreadUpdate;
        });

        if (entries.length === 0) {
            listContainer.createEl('p', { text: 'No entries found.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 20px; font-size: 0.9em; opacity: 0.6;' } });
            return;
        }

        let draggedEl: HTMLElement | null = null;
        for (const entry of entries) {
            const dragWrapper = listContainer.createEl('div', { attr: { draggable: 'true', 'data-filepath': entry.filePath, style: 'cursor: grab;' } });
            dragWrapper.addEventListener('dragstart', (e) => { draggedEl = dragWrapper; dragWrapper.style.opacity = '0.5'; });
            dragWrapper.addEventListener('dragend', () => { draggedEl = null; dragWrapper.style.opacity = '1'; listContainer.querySelectorAll('div').forEach(el => (el as HTMLElement).style.borderTop = ''); });
            dragWrapper.addEventListener('dragover', (e) => { e.preventDefault(); const rect = dragWrapper.getBoundingClientRect(); const midpoint = rect.top + rect.height / 2; if (e.clientY < midpoint) { dragWrapper.style.borderTop = '2px solid var(--interactive-accent)'; dragWrapper.style.borderBottom = ''; } else { dragWrapper.style.borderTop = ''; dragWrapper.style.borderBottom = '2px solid var(--interactive-accent)'; } });
            dragWrapper.addEventListener('drop', async (e) => { e.preventDefault(); if (draggedEl && draggedEl !== dragWrapper) { const rect = dragWrapper.getBoundingClientRect(); const midpoint = rect.top + rect.height / 2; if (e.clientY < midpoint) listContainer.insertBefore(draggedEl, dragWrapper); else listContainer.insertBefore(draggedEl, dragWrapper.nextSibling); await this.saveCustomOrder(modeId, listContainer); } });
            
            const isBlurred = this.view.plugin.settings.blurredNotes.includes(entry.filePath);
            await this.renderThoughtRow(entry, dragWrapper, entry.filePath, 0, true, true, isBlurred);
        }
    }

    async saveCustomOrder(modeId: string, container: HTMLElement) {
        const newOrder: string[] = [];
        container.querySelectorAll('[data-filepath]').forEach(el => {
            const path = el.getAttribute('data-filepath');
            if (path) newOrder.push(path);
        });

        if (modeId === 'journal') this.view.plugin.settings.journalModeOrder = newOrder;
        else if (modeId === 'grundfos') this.view.plugin.settings.grundfosModeOrder = newOrder;
        else this.view.plugin.settings.customModeOrders[modeId] = newOrder;

        await this.view.plugin.saveSettings();
    }
}

