import { Platform } from 'obsidian';
import type { MinaView } from '../view';

import { BaseTab } from "./BaseTab";

export class ContextTab extends BaseTab {
    view: MinaView;
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement, modeId: string) {
        this.renderContextMode(container, modeId);
    }
        renderContextMode(container: HTMLElement, modeId: string) {
            this.renderSearchInput(container, () => this.updateContextList(modeId));
            const innerContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; padding: 15px 15px 200px 15px; -webkit-overflow-scrolling: touch;' } });
            const listContainer = innerContainer.createEl('div', {
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
                const kwArr = (customMode.keywords as any as string).split(',').map(k => k.trim()).filter(k => k);
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
            listContainer.createEl('p', { text: 'No entries found.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 20px;' } });
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
