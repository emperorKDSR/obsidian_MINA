import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
    message: string;
    onConfirm: () => void;

    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('p', { text: this.message });
        const btnContainer = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;' } });
        const yesBtn = btnContainer.createEl('button', { text: 'Yes', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 4px 15px; border-radius: 4px;' } });
        const noBtn = btnContainer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 4px 15px; border-radius: 4px;' } });
        
        yesBtn.addEventListener('click', () => { 
            this.onConfirm(); 
            this.close(); 
        });
        noBtn.addEventListener('click', () => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}
