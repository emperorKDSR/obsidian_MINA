import { App, Modal, moment } from 'obsidian';

export class ConvertToTaskModal extends Modal {
    thoughtText: string;
    thoughtContexts: string[];
    onConvert: (dueDate: string) => void;

    constructor(app: App, thoughtText: string, contexts: string[], onConvert: (dueDate: string) => void) {
        super(app);
        this.thoughtText = thoughtText;
        this.thoughtContexts = contexts;
        this.onConvert = onConvert;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Convert Thought to Task', attr: { style: 'margin-top: 0; margin-bottom: 12px;' } });

        const preview = contentEl.createEl('div', { attr: { style: 'font-size: 0.85em; color: var(--text-muted); background: var(--background-secondary); border-radius: 4px; padding: 8px 10px; margin-bottom: 14px; max-height: 80px; overflow-y: auto; word-break: break-word;' } });
        preview.setText(this.thoughtText.length > 120 ? this.thoughtText.substring(0, 120) + '…' : this.thoughtText);

        contentEl.createEl('label', { text: 'Due Date', attr: { style: 'font-size: 0.9em; font-weight: 600; display: block; margin-bottom: 6px;' } });
        const dateInput = contentEl.createEl('input', { attr: { type: 'date', style: 'width: 100%; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.95em; box-sizing: border-box; margin-bottom: 16px;' } });
        dateInput.value = moment().format('YYYY-MM-DD');

        const btnRow = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 10px;' } });
        const cancelBtn = btnRow.createEl('button', { text: 'Cancel', attr: { style: 'padding: 5px 16px; border-radius: 4px;' } });
        const convertBtn = btnRow.createEl('button', { text: '📋 Convert', attr: { style: 'padding: 5px 16px; border-radius: 4px; background: var(--interactive-accent); color: var(--text-on-accent); font-weight: 600;' } });

        cancelBtn.addEventListener('click', () => this.close());
        convertBtn.addEventListener('click', () => {
            this.onConvert(dateInput.value);
            this.close();
        });
        dateInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.onConvert(dateInput.value); this.close(); } });
        setTimeout(() => dateInput.focus(), 50);
    }

    onClose() { this.contentEl.empty(); }
}
