import { App, Modal, MarkdownRenderer } from 'obsidian';

export class MinaChatModal extends Modal {
    content: string;

    constructor(app: App, content: string) {
        super(app);
        this.content = content;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mina-modal-chat');
        const container = contentEl.createEl('div', { attr: { style: 'padding: 10px; max-height: 80vh; overflow-y: auto;' } });
        MarkdownRenderer.render(this.app, this.content, container, '', this.scope as any);
    }

    onClose() {
        this.contentEl.empty();
    }
}
