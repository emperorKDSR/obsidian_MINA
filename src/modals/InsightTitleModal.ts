import { App, Modal } from 'obsidian';

export class InsightTitleModal extends Modal {
    result: string = '';
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        this.modalEl.style.cssText = 'border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-width: 420px; padding: 0; overflow: hidden;';
        const { contentEl } = this;
        contentEl.empty();
        contentEl.style.padding = '0';

        const header = contentEl.createEl('div', { attr: { style: 'padding: 20px 24px 16px 24px; border-bottom: 1px solid var(--background-modifier-border-faint);' } });
        header.createEl('h3', { text: 'New Insight Note', attr: { style: 'margin: 0; font-size: 1em; font-weight: 800; color: var(--text-normal);' } });
        header.createEl('p', { text: 'Enter a descriptive name for this synthesis.', attr: { style: 'margin: 6px 0 0 0; font-size: 0.85em; color: var(--text-muted);' } });

        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px 24px;' } });
        const input = body.createEl('input', {
            type: 'text',
            attr: {
                placeholder: 'Name this synthesis...',
                style: 'width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary-alt); color: var(--text-normal); font-size: 0.95em; outline: none;'
            }
        });
        input.addEventListener('input', () => { this.result = input.value; });
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && this.result.trim()) {
                this.close();
                this.onSubmit(this.result.trim());
            }
        });

        const footer = contentEl.createEl('div', { attr: { style: 'padding: 16px 24px; display: flex; justify-content: flex-end; gap: 10px; background: var(--background-secondary); border-top: 1px solid var(--background-modifier-border-faint);' } });
        const cancelBtn = footer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 8px 16px; border-radius: 8px; background: transparent; border: 1px solid var(--background-modifier-border); color: var(--text-muted); font-weight: 600; cursor: pointer;' } });
        const createBtn = footer.createEl('button', { text: 'Create', attr: { style: 'padding: 8px 20px; border-radius: 8px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; font-weight: 700; cursor: pointer;' } });

        cancelBtn.addEventListener('click', () => this.close());
        createBtn.addEventListener('click', () => {
            if (this.result.trim()) {
                this.close();
                this.onSubmit(this.result.trim());
            }
        });

        setTimeout(() => input.focus(), 10);
    }

    onClose() { this.contentEl.empty(); }
}
