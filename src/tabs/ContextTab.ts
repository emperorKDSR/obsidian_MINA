import { moment } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';

export class ContextTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement, modeId: string) {
        this.renderContextMode(container, modeId);
    }

    async renderContextMode(container: HTMLElement, modeId: string) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const customMode = this.settings.customModes.find(m => m.id === modeId);
        const modeTitle = customMode ? customMode.name : modeId === 'grundfos' ? 'Grundfos' : modeId;
        const modeContext = customMode ? customMode.context : modeId === 'grundfos' ? 'Grundfos' : modeId;

        header.createEl('h2', {
            text: modeTitle,
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em; line-height: 1.1;' }
        });

        // Quick Actions
        const actionRow = wrap.createEl('div', { attr: { style: 'display: flex; gap: 10px;' } });
        const actionBtnStyle = 'flex: 1; padding: 10px; border-radius: 10px; background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border-faint); font-weight: 600; cursor: pointer;';
        
        const addBtn = actionRow.createEl('button', { text: '✍️ Note', attr: { style: actionBtnStyle } });
        addBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', modeContext, null, false, async (text, ctxs) => {
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createThoughtFile(text, contexts);
                this.renderContextMode(container, modeId);
            }, `New ${modeTitle} Note`).open();
        });

        const addTaskBtn = actionRow.createEl('button', { text: '✅ Task', attr: { style: actionBtnStyle } });
        addTaskBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', modeContext, moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createTaskFile(text, contexts, due || undefined);
                this.renderContextMode(container, modeId);
            }, `New ${modeTitle} Task`).open();
        });

        const listContainer = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' }
        });

        let entries = Array.from(this.index.thoughtIndex.values()).filter(e => e.context.includes(modeContext));
        entries.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        for (const entry of entries) {
            await this.renderThoughtRow(entry, listContainer, entry.filePath, 0, true);
        }
    }
}
