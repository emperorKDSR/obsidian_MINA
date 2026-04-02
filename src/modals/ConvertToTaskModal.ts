import { App, Modal, moment } from 'obsidian';
import { ThoughtEntry } from '../types';

export class ConvertToTaskModal extends Modal {
    entry: ThoughtEntry;
    onSave: (dueDate: string) => void;

    constructor(app: App, entry: ThoughtEntry, onSave: (dueDate: string) => void) {
        super(app);
        this.entry = entry;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Convert Thought to Task' });
        contentEl.createEl('p', { text: `Original: ${this.entry.body.slice(0, 80)}${this.entry.body.length > 80 ? '...' : ''}`, attr: { style: 'font-size: 0.9em; color: var(--text-muted); margin-bottom: 20px;' } });

        const row = contentEl.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px; margin-bottom: 25px;' } });
        row.createEl('span', { text: 'Due Date:' });
        const dateInput = row.createEl('input', { type: 'date', value: moment().format('YYYY-MM-DD'), attr: { style: 'padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border);' } });

        const btnContainer = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 10px;' } });
        const saveBtn = btnContainer.createEl('button', { text: 'Convert', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 5px 20px; border-radius: 4px;' } });
        const cancelBtn = btnContainer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 5px 20px; border-radius: 4px;' } });

        saveBtn.addEventListener('click', () => {
            this.onSave(dateInput.value);
            this.close();
        });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}
