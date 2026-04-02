import { App, Modal, Platform, Notice, moment } from 'obsidian';
import MinaPlugin from '../main';
import { isTablet } from '../utils';
import { FileSuggestModal } from './FileSuggestModal';

export class EditEntryModal extends Modal {
    initialText: string;
    initialContexts: string[];
    initialDueDate: string | null;
    isTask: boolean;
    plugin: MinaPlugin;
    onSave: (newText: string, newContexts: string, newDueDate: string | null) => void;
    customTitle?: string;
    stayOpen: boolean;

    constructor(
        app: App,
        plugin: MinaPlugin,
        initialText: string,
        initialContext: string,
        initialDueDate: string | null,
        isTask: boolean,
        onSave: (newText: string, newContexts: string, newDueDate: string | null) => void,
        customTitle?: string,
        stayOpen: boolean = false
    ) {
        super(app);
        this.plugin = plugin;
        this.initialText = initialText.replace(/<br>/g, '\n');
        this.initialContexts = initialContext ? initialContext.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
        this.initialDueDate = initialDueDate;
        this.isTask = isTask;
        this.onSave = onSave;
        this.customTitle = customTitle;
        this.stayOpen = stayOpen;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (Platform.isMobile) {
            modalEl.style.marginTop = '2vh';
            modalEl.style.marginBottom = '2vh';
            const modalW = isTablet() ? '75vw' : '95vw';
            modalEl.style.width = modalW;
            modalEl.style.maxWidth = modalW;
            modalEl.style.maxHeight = '90vh';
            modalEl.style.alignSelf = 'flex-start';
            contentEl.style.padding = '10px';
        }

        const titleText = this.customTitle || (this.isTask ? 'Edit Task' : 'Edit Thought');
        const header = contentEl.createEl('h3', { text: titleText, attr: { style: 'margin-top: 0; cursor: move; user-select: none;' } });

        // --- Movable Logic ---
        let isDragging = false;
        let startX: number, startY: number;
        let initialLeft: number, initialTop: number;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = modalEl.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            modalEl.style.position = 'fixed';
            modalEl.style.margin = '0';
            modalEl.style.left = initialLeft + 'px';
            modalEl.style.top = initialTop + 'px';
            e.preventDefault();
        });

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            modalEl.style.left = (initialLeft + dx) + 'px';
            modalEl.style.top = (initialTop + dy) + 'px';
        };

        const onMouseUp = () => { isDragging = false; };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        const cleanupDrag = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        const originalOnClose = this.onClose.bind(this);
        this.onClose = () => {
            cleanupDrag();
            originalOnClose();
        };
        // ---------------------

        const textArea = contentEl.createEl('textarea', {
            text: this.initialText,
            attr: { style: 'width: 100%; min-height: 120px; font-family: var(--font-text); margin-bottom: 10px; padding: 8px; resize: vertical; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);' }
        });

        let currentTextValue = this.initialText;
        textArea.addEventListener('input', (e) => { 
            const target = e.target as HTMLTextAreaElement;
            const val = target.value;
            
            if (val.length > currentTextValue.length) {
                const cursorPosition = target.selectionStart;
                if (cursorPosition > 0 && val.charAt(cursorPosition - 1) === '\\') {
                    const modal = new FileSuggestModal(this.plugin.app, (file) => {
                        const before = val.substring(0, cursorPosition - 1);
                        const after = val.substring(cursorPosition);
                        const insertText = `[[${file.basename}]]`;
                        target.value = before + insertText + after;
                        currentTextValue = target.value;
                        
                        setTimeout(() => {
                            target.focus();
                            target.setSelectionRange(before.length + insertText.length, before.length + insertText.length);
                        }, 50);
                    }, this.plugin.settings.newNoteFolder);
                    modal.open();
                }
            }

            const converted = target.value.replace(/^\*\* /gm, '- [ ] ');
            if (converted !== target.value) {
                const cursor = target.selectionStart;
                const diff = converted.length - target.value.length;
                target.value = converted;
                target.setSelectionRange(cursor + diff, cursor + diff);
            }

            currentTextValue = target.value;
        });

        const handleModalFiles = async (files: FileList) => {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file || file.size === 0) continue;
                const isImage = file.type.startsWith('image/');
                const hasValidName = file.name && file.name !== 'image.png' && file.name.trim().length > 0;
                if (isImage || hasValidName) {
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const extension = file.name && file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png');
                        // @ts-ignore
                        const baseName = (file.name && file.name.includes('.')) ? file.name.substring(0, file.name.lastIndexOf('.')) : `Pasted image ${moment().format('YYYYMMDDHHmmss')}`;
                        const fileName = `${baseName}.${extension}`;
                        const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(fileName);
                        const newFile = await this.plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
                        const isImgExt = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(extension?.toLowerCase() || '');
                        const markdownLink = isImgExt ? `![[${newFile.name}]]` : `[[${newFile.name}]]`;
                        
                        const startPos = textArea.selectionStart;
                        const endPos = textArea.selectionEnd;
                        textArea.value = textArea.value.substring(0, startPos) + markdownLink + textArea.value.substring(endPos);
                        currentTextValue = textArea.value;
                        textArea.selectionStart = textArea.selectionEnd = startPos + markdownLink.length;
                        new Notice(`Attached ${newFile.name}`);
                    } catch (err) { new Notice('Failed to save attachment.'); }
                }
            }
        };

        textArea.addEventListener('paste', async (e: ClipboardEvent) => {
            e.stopPropagation();
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                let hasImage = false;
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    if (e.clipboardData.items[i].type.startsWith('image/')) { hasImage = true; break; }
                }
                if (hasImage) { e.preventDefault(); await handleModalFiles(e.clipboardData.files); }
            }
        });

        textArea.addEventListener('dragover', (e) => { e.stopPropagation(); e.preventDefault(); });
        textArea.addEventListener('drop', async (e: DragEvent) => {
            e.stopPropagation();
            if (e.dataTransfer && e.dataTransfer.files.length > 0) { e.preventDefault(); await handleModalFiles(e.dataTransfer.files); }
        });

        // Contexts Selector
        const contextsDiv = contentEl.createEl('div', { attr: { style: 'margin-bottom: 15px;' } });
        contextsDiv.createEl('div', { text: 'Contexts', attr: { style: 'font-size: 0.78em; color: var(--text-muted); font-weight: 600; margin-bottom: 6px;' } });
        const pillsRow = contextsDiv.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 5px; align-items: center;' } });

        const renderContextTags = () => {
            pillsRow.empty();
            const allContexts = [...new Set([
                ...this.plugin.settings.contexts,
                ...this.initialContexts
            ])];

            allContexts.forEach(ctx => {
                const isSelected = this.initialContexts.includes(ctx);
                const tagEl = pillsRow.createEl('span', {
                    attr: {
                        style: `cursor: pointer; padding: 3px 10px; border-radius: 12px; font-size: 0.85em; user-select: none; border: 1px solid var(--background-modifier-border); display: inline-flex; align-items: center; gap: 4px; ${isSelected ? 'background-color: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);' : 'background-color: var(--background-secondary); color: var(--text-muted);'}`
                    }
                });
                tagEl.createSpan({ text: `#${ctx}` });
                if (isSelected) {
                    tagEl.createSpan({ text: '×', attr: { style: 'font-size: 1em; line-height: 1; opacity: 0.7;' } });
                }
                tagEl.addEventListener('click', () => {
                    if (isSelected) this.initialContexts = this.initialContexts.filter(c => c !== ctx);
                    else this.initialContexts.push(ctx);
                    renderContextTags();
                });
            });

            const addRow = pillsRow.createEl('div', { attr: { style: 'display: flex; gap: 4px; align-items: center;' } });
            const newCtxInput = addRow.createEl('input', {
                type: 'text',
                placeholder: 'New context…',
                attr: { style: 'padding: 3px 8px; border-radius: 12px; font-size: 0.85em; border: 1px dashed var(--background-modifier-border); background: transparent; width: 110px; outline: none; color: var(--text-normal);' }
            });
            const addCtxBtn = addRow.createEl('button', {
                text: '+',
                attr: { style: 'padding: 2px 8px; border-radius: 10px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-muted); cursor: pointer; font-size: 0.9em; line-height: 1.4;' }
            });

            const commitNewCtx = async () => {
                const val = newCtxInput.value.trim().replace(/^#/, '');
                if (!val) return;
                newCtxInput.value = '';
                if (!this.initialContexts.includes(val)) {
                    this.initialContexts.push(val);
                }
                if (!this.plugin.settings.contexts.includes(val)) {
                    this.plugin.settings.contexts.push(val);
                    await this.plugin.saveSettings();
                }
                renderContextTags();
            };

            addCtxBtn.addEventListener('click', commitNewCtx);
            newCtxInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitNewCtx(); } });
            newCtxInput.addEventListener('blur', () => { if (newCtxInput.value.trim()) commitNewCtx(); });
        };
        renderContextTags();

        const metadataContainer = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;' } });

        let dateInput: HTMLInputElement | null = null;
        if (this.isTask) {
            const dueDateContainer = metadataContainer.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center;' } });
            dueDateContainer.createSpan({ text: 'Due:', attr: { style: 'font-size: 0.85em; color: var(--text-muted);' } });
            dateInput = dueDateContainer.createEl('input', {
                type: 'date',
                value: this.initialDueDate || '',
                attr: { style: 'font-size: 0.9em; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' }
            });
        } else {
            metadataContainer.createEl('div');
        }

        const btnContainer = metadataContainer.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 10px;' } });
        const saveBtn = btnContainer.createEl('button', { text: 'Save', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 6px 16px; border-radius: 4px;' } });
        const cancelBtn = btnContainer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 6px 16px; border-radius: 4px;' } });

        const saveChanges = () => {
            const newText = textArea.value.replace(/\n/g, '<br>');
            const newContextString = this.initialContexts.map(c => `#${c}`).join(' ');
            const newDate = dateInput ? dateInput.value : null;
            this.onSave(newText, newContextString, newDate);
            
            if (this.stayOpen) {
                textArea.value = '';
                textArea.focus();
                new Notice(this.isTask ? 'Task added!' : 'Thought added!');
            } else {
                this.close();
            }
        };

        saveBtn.addEventListener('click', saveChanges);
        cancelBtn.addEventListener('click', () => this.close());
        textArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); saveChanges(); } });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
