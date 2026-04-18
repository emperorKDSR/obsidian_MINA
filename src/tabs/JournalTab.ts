import { moment, Platform, Notice } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { ICON_PLUS } from "../constants";
import { EditEntryModal } from "../modals/EditEntryModal";

export class JournalTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderJournalMode(container);
    }

    async renderJournalMode(container: HTMLElement) {
        const wrap = container.createEl('div', {
            attr: {
                style: 'display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--background-primary);'
            }
        });

        // 1. Minimalist Header
        const header = wrap.createEl('div', {
            attr: { style: 'padding: 20px 20px 10px 20px; display: flex; align-items: center; gap: 12px;' }
        });

        header.createEl('h2', {
            text: 'Journal',
            attr: { style: 'margin: 0; font-size: 1.5em; font-weight: 800; letter-spacing: -0.02em; color: var(--text-normal); flex-grow: 1;' }
        });

        // Add Entry Button
        const addBtn = this.renderActionButton(header, ICON_PLUS, 'Add Journal Entry', () => {
            new EditEntryModal(this.view.plugin.app, this.view.plugin, '', '#journal', null, false, async (text, ctx) => {
                const contexts = ctx.split('#').map(c => c.trim()).filter(c => c);
                await this.view.plugin.createThoughtFile(text, contexts);
                this.updateJournalList(listContainer);
            }).open();
        });
        addBtn.style.opacity = '1';
        addBtn.style.color = 'var(--interactive-accent)';

        // Toggle search visibility
        const searchBtn = header.createEl('button', {
            text: 'Search',
            attr: { style: 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.75em; padding: 4px 10px; color: var(--text-muted); cursor: pointer;' }
        });
        
        const searchInputWrap = wrap.createEl('div', { 
            attr: { style: `display: ${this.view.searchQuery ? 'block' : 'none'}; transition: all 0.2s;` } 
        });
        this.renderSearchInput(searchInputWrap, () => this.updateJournalList(listContainer));

        searchBtn.addEventListener('click', () => {
            const isHidden = searchInputWrap.style.display === 'none';
            searchInputWrap.style.display = isHidden ? 'block' : 'none';
            if (isHidden) {
                const inp = searchInputWrap.querySelector('input');
                if (inp) inp.focus();
            }
        });

        // 2. Scrollable List
        const scrollBody = wrap.createEl('div', {
            attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 10px 20px 200px 20px; -webkit-overflow-scrolling: touch;' }
        });

        const listContainer = scrollBody.createEl('div', {
            cls: 'mina-journal-list',
            attr: { style: 'display: flex; flex-direction: column; gap: 24px; width: 100%; max-width: 800px; margin: 0 auto;' }
        });

        this.updateJournalList(listContainer);
    }

    async updateJournalList(container: HTMLElement) {
        container.empty();

        let entries = Array.from(this.view.plugin.thoughtIndex.values())
            .filter(e => e.context.includes('journal'));

        if (this.view.searchQuery) {
            entries = entries.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
        }

        // Sort by order or by date
        const order = this.view.plugin.settings.journalModeOrder || [];
        entries.sort((a, b) => {
            const idxA = order.indexOf(a.filePath); const idxB = order.indexOf(b.filePath);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1; if (idxB !== -1) return 1;
            return b.lastThreadUpdate - a.lastThreadUpdate;
        });

        if (entries.length === 0) {
            container.createEl('p', { text: 'Your journal is empty.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 40px; font-style: italic; opacity: 0.6;' } });
            return;
        }

        // Group by Date for modern flow
        let lastDate = '';
        let draggedEl: HTMLElement | null = null;

        for (const entry of entries) {
            const entryDate = moment(entry.created.split(' ')[0]).format('dddd, MMMM D');
            
            if (entryDate !== lastDate) {
                const dateHeader = container.createEl('div', {
                    attr: { style: 'margin-top: 10px; margin-bottom: -8px; position: sticky; top: 0; background: var(--background-primary); z-index: 5; padding: 10px 0; border-bottom: 1px solid var(--background-modifier-border-faint);' }
                });
                dateHeader.createEl('span', {
                    text: entryDate,
                    attr: { style: 'font-size: 0.8em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);' }
                });
                lastDate = entryDate;
            }

            const dragWrapper = container.createEl('div', { 
                attr: { 
                    draggable: 'true', 
                    'data-filepath': entry.filePath, 
                    style: 'cursor: grab; position: relative;' 
                } 
            });

            // Drag and drop logic
            dragWrapper.addEventListener('dragstart', (e) => { draggedEl = dragWrapper; dragWrapper.style.opacity = '0.5'; });
            dragWrapper.addEventListener('dragend', () => { draggedEl = null; dragWrapper.style.opacity = '1'; container.querySelectorAll('div').forEach(el => (el as HTMLElement).style.borderTop = ''); });
            dragWrapper.addEventListener('dragover', (e) => { e.preventDefault(); const rect = dragWrapper.getBoundingClientRect(); const midpoint = rect.top + rect.height / 2; if (e.clientY < midpoint) { dragWrapper.style.borderTop = '2px solid var(--interactive-accent)'; dragWrapper.style.borderBottom = ''; } else { dragWrapper.style.borderTop = ''; dragWrapper.style.borderBottom = '2px solid var(--interactive-accent)'; } });
            dragWrapper.addEventListener('drop', async (e) => { 
                e.preventDefault(); 
                if (draggedEl && draggedEl !== dragWrapper) { 
                    const rect = dragWrapper.getBoundingClientRect(); 
                    const midpoint = rect.top + rect.height / 2; 
                    if (e.clientY < midpoint) container.insertBefore(draggedEl, dragWrapper); 
                    else container.insertBefore(draggedEl, dragWrapper.nextSibling); 
                    await this.saveJournalOrder(container); 
                } 
            });
            
            const isBlurred = this.view.plugin.settings.blurredNotes.includes(entry.filePath);
            // Hide metadata for that clean logbook look
            await this.renderThoughtRow(entry, dragWrapper, entry.filePath, 0, true, true, isBlurred);
        }
    }

    async saveJournalOrder(container: HTMLElement) {
        const newOrder: string[] = [];
        container.querySelectorAll('[data-filepath]').forEach(el => {
            const path = el.getAttribute('data-filepath');
            if (path) newOrder.push(path);
        });
        this.view.plugin.settings.journalModeOrder = newOrder;
        await this.view.plugin.saveSettings();
    }
}
