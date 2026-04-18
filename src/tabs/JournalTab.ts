import { moment, Platform, Notice } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from "../modals/EditEntryModal";

export class JournalTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderJournalMode(container);
    }

    async renderJournalMode(container: HTMLElement) {
        container.empty();
        
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
            text: 'Journal',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const searchBtn = titleRow.createEl('button', {
            text: 'Search',
            attr: { style: 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.65em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 600;' }
        });

        const searchWrapper = header.createEl('div', {
            attr: { style: 'display: none; transition: all 0.2s;' }
        });
        this.renderSearchInput(searchWrapper, () => this.updateJournalList(listContainer));

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
        addNoteBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', 'journal', null, false, async (text: string, ctxs: string) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                await this.view.plugin.createThoughtFile(text, contexts);
                this.updateJournalList(listContainer);
            }, 'New Journal Note').open();
        });

        const addTaskBtn = actionRow.createEl('button', {
            attr: { style: actionBtnStyle }
        });
        addTaskBtn.createSpan({ text: '✅', attr: { style: 'font-size: 1.1em;' } });
        addTaskBtn.createSpan({ text: 'Add Task' });
        addTaskBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', 'journal', moment().format('YYYY-MM-DD'), true, async (text: string, ctxs: string, due: string | null) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                await this.view.plugin.createTaskFile(text, contexts, due || undefined);
                this.updateJournalList(listContainer);
            }, 'New Journal Task').open();
        });

        const listContainer = wrap.createEl('div', {
            cls: 'mina-journal-list',
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' }
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

        const order = this.view.plugin.settings.journalModeOrder || [];
        entries.sort((a, b) => {
            const idxA = order.indexOf(a.filePath); const idxB = order.indexOf(b.filePath);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1; if (idxB !== -1) return 1;
            return b.lastThreadUpdate - a.lastThreadUpdate;
        });

        if (entries.length === 0) {
            container.createEl('p', { text: 'Your journal is empty.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 40px; font-size: 0.9em; opacity: 0.6;' } });
            return;
        }

        let lastDate = '';
        let draggedEl: HTMLElement | null = null;

        for (const entry of entries) {
            const entryDate = moment(entry.created.split(' ')[0]).format('dddd, MMMM D');
            
            if (entryDate !== lastDate) {
                const dateHeader = container.createEl('div', {
                    attr: { style: 'margin-top: 10px; margin-bottom: 2px; position: sticky; top: 0; background: var(--background-primary); z-index: 5; padding: 10px 0; border-bottom: 1px solid var(--background-modifier-border-faint);' }
                });
                dateHeader.createEl('span', {
                    text: entryDate,
                    attr: { style: 'font-size: 0.75em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);' }
                });
                lastDate = entryDate;
            }

            const dragWrapper = container.createEl('div', { 
                attr: { draggable: 'true', 'data-filepath': entry.filePath, style: 'cursor: grab; position: relative;' } 
            });

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

