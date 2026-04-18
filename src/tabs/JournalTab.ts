import { moment, Platform } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { parseContextString } from '../utils';

export class JournalTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.updateJournalList(container);
    }

    async updateJournalList(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; margin-bottom: 4px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleStack = header.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        const titleRow = titleStack.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: 'Journal',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const actionRow = wrap.createEl('div', { attr: { style: 'display: flex; gap: 10px;' } });
        const actionBtnStyle = 'flex: 1; padding: 12px; border-radius: 12px; border: 1px solid var(--background-modifier-border-faint); background: var(--background-secondary-alt); color: var(--text-normal); font-size: 0.85em; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;';
        
        const addNoteBtn = actionRow.createEl('button', { attr: { style: actionBtnStyle } });
        addNoteBtn.createSpan({ text: '✍️' }); addNoteBtn.createSpan({ text: 'Add Note' });
        addNoteBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', 'journal', null, false, async (text, ctxs) => {
                if (!text.trim()) return;
                const contexts = parseContextString(ctxs);
                await this.vault.createThoughtFile(text, contexts);
                this.updateJournalList(container);
            }, 'New Journal Note').open();
        });

        const listContainer = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' }
        });

        let entries = Array.from(this.index.thoughtIndex.values())
            .filter(e => e.context.includes('journal'));

        entries.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        let lastDate = "";
        for (const entry of entries) {
            const entryDate = moment(entry.created.split(' ')[0]).format('dddd, MMMM D');
            if (entryDate !== lastDate) {
                const dateHeader = listContainer.createEl('div', {
                    text: entryDate,
                    attr: { style: 'font-size: 0.75em; font-weight: 800; text-transform: uppercase; color: var(--text-faint); letter-spacing: 0.1em; margin-top: 10px; border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 4px;' }
                });
                lastDate = entryDate;
            }
            await this.renderThoughtRow(entry, listContainer, entry.filePath, 0, true);
        }
    }
}
