import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";
import { ChatSessionPickerModal } from "../modals/ChatSessionPickerModal";
import { NotePickerModal } from "../modals/NotePickerModal";

export class FocusTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderFocusMode(container);
    }
        renderFocusMode(container: HTMLElement) {
            this.renderSearchInput(container, () => this.updateFocusList());
            const innerContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; padding: 15px 15px 200px 15px; -webkit-overflow-scrolling: touch;' } });
            this.view.focusRowContainer = innerContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
            this.updateFocusList();
        }
    
        async updateFocusList() {
            if (!this.view.focusRowContainer) return;
            this.view.focusRowContainer.empty();
    
            let pinned = Array.from(this.view.plugin.thoughtIndex.values()).filter(e => e.pinned);
            if (this.view.searchQuery) {
                pinned = pinned.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
            }
            const order = this.view.plugin.settings.focusModeOrder || [];
    
            pinned.sort((a, b) => {
                const idxA = order.indexOf(a.filePath);
                const idxB = order.indexOf(b.filePath);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return b.lastThreadUpdate - a.lastThreadUpdate;
            });
    
            if (pinned.length === 0) {
                this.view.focusRowContainer.createEl('p', { text: 'No pinned thoughts.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 20px;' } });
                return;
            }
    
            let draggedEl: HTMLElement | null = null;
    
            for (const entry of pinned) {
                const dragWrapper = this.view.focusRowContainer.createEl('div', {
                    attr: {
                        draggable: 'true',
                        'data-filepath': entry.filePath,
                        style: 'cursor: grab; transition: transform 0.2s, opacity 0.2s;'
                    }
                });
    
                dragWrapper.addEventListener('dragstart', (e) => {
                    draggedEl = dragWrapper;
                    dragWrapper.style.opacity = '0.5';
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', entry.filePath);
                    }
                });
    
                dragWrapper.addEventListener('dragend', () => {
                    dragWrapper.style.opacity = '1';
                    this.view.focusRowContainer?.querySelectorAll('div').forEach(el => (el as HTMLElement).style.borderTop = '');
                });
    
                dragWrapper.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    const rect = dragWrapper.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    if (e.clientY < midpoint) {
                        dragWrapper.style.borderTop = '2px solid var(--interactive-accent)';
                        dragWrapper.style.borderBottom = '';
                    } else {
                        dragWrapper.style.borderTop = '';
                        dragWrapper.style.borderBottom = '2px solid var(--interactive-accent)';
                    }
                });
    
                dragWrapper.addEventListener('dragleave', () => {
                    dragWrapper.style.borderTop = '';
                    dragWrapper.style.borderBottom = '';
                });
    
                dragWrapper.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    dragWrapper.style.borderTop = '';
                    dragWrapper.style.borderBottom = '';
                    if (draggedEl && draggedEl !== dragWrapper) {
                        const rect = dragWrapper.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        if (e.clientY < midpoint) {
                            this.view.focusRowContainer?.insertBefore(draggedEl, dragWrapper);
                        } else {
                            this.view.focusRowContainer?.insertBefore(draggedEl, dragWrapper.nextSibling);
                        }
                        await this.view.saveFocusOrder();
                    }
                });
    
                await this.renderThoughtRow(entry, dragWrapper, entry.filePath, 0, true, true);
            }
        }
    
    

        
    async saveFocusOrder() {
        if (!this.view.focusRowContainer) return;
        const newOrder: string[] = [];
        this.view.focusRowContainer.querySelectorAll('[data-filepath]').forEach(el => {
            const path = el.getAttribute('data-filepath');
            if (path) newOrder.push(path);
        });
        this.view.plugin.settings.focusModeOrder = newOrder;
        await this.view.plugin.saveSettings();
    }

}
