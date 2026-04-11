import { App, Modal, Platform, Notice, moment } from 'obsidian';
import MinaPlugin from '../main';
import { isTablet, parseNaturalDate } from '../utils';
import { FileSuggestModal } from './FileSuggestModal';
import { ContextSuggestModal } from './ContextSuggestModal';

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

        const handleModalFiles = async (files: FileList) => {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file || file.size === 0) continue;
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
                    textArea.selectionStart = textArea.selectionEnd = startPos + markdownLink.length;
                    new Notice(`Attached ${newFile.name}`);
                } catch (err) { new Notice('Failed to save attachment.'); }
            }
        };

        const textAreaWrapper = contentEl.createEl('div', { attr: { style: 'position: relative;' } });
        const textArea = textAreaWrapper.createEl('textarea', {
            text: this.initialText,
            attr: { style: 'width: 100%; min-height: 120px; font-family: var(--font-text); margin-bottom: 10px; padding: 8px; resize: vertical; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);' }
        });

        const fileInput = textAreaWrapper.createEl('input', { 
            attr: { 
                type: 'file', 
                multiple: '', 
                style: 'display:none;', 
                accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*' 
            } 
        }) as HTMLInputElement;

        const attachBtn = textAreaWrapper.createEl('button', { 
            attr: { 
                title: 'Attach image or file', 
                style: 'position:absolute; bottom:16px; right:10px; background:transparent; border:none; color:var(--text-muted); opacity:0.5; padding:2px 4px; cursor:pointer; font-size:1.1em; line-height:1; transition:opacity 0.15s; z-index:1' 
            } 
        });
        attachBtn.textContent = '📎';
        attachBtn.addEventListener('mouseenter', () => attachBtn.style.opacity = '1');
        attachBtn.addEventListener('mouseleave', () => attachBtn.style.opacity = '0.5');
        attachBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });

        fileInput.addEventListener('change', async () => { 
            if (fileInput.files && fileInput.files.length > 0) { 
                await handleModalFiles(fileInput.files); 
                fileInput.value = ''; 
            } 
        });

        textArea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                await handleModalFiles(e.clipboardData.files);
            }
        });

        textArea.addEventListener('dragover', (e) => { e.stopPropagation(); e.preventDefault(); });
        textArea.addEventListener('drop', async (e: DragEvent) => {
            if (e.dataTransfer && e.dataTransfer.files.length > 0) { 
                e.preventDefault(); 
                e.stopPropagation();
                await handleModalFiles(e.dataTransfer.files); 
            }
        });

        let currentTextValue = this.initialText;
        textArea.addEventListener('input', (e) => { 
            const target = e.target as HTMLTextAreaElement;
            const val = target.value;
            const pos = target.selectionStart;
            const textBeforeCursor = val.substring(0, pos);
            
            // Natural Language Date conversion: @date followed by space/newline
            const dateMatch = textBeforeCursor.match(/@([^@\n\s]+(?: [^@\n\s]+)*)([\s\n])$/);
            if (dateMatch) {
                const rawDate = dateMatch[1];
                const terminator = dateMatch[2];
                const parsed = parseNaturalDate(rawDate);
                if (parsed) {
                    const matchStart = dateMatch.index!;
                    const before = val.substring(0, matchStart);
                    const after = val.substring(pos);
                    const insertText = `[[${parsed}]]${terminator}`;
                    target.value = before + insertText + after;
                    currentTextValue = target.value;
                    const newPos = matchStart + insertText.length;
                    target.setSelectionRange(newPos, newPos);
                    return;
                }
            }

            if (val.length > currentTextValue.length) {
                const cursorPosition = target.selectionStart;
                if (cursorPosition >= 2 && val.substring(cursorPosition - 2, cursorPosition) === '[[') {
                    const modal = new FileSuggestModal(this.plugin.app, (file) => {
                        const before = val.substring(0, cursorPosition - 2);
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
                } else if (cursorPosition > 0 && val.charAt(cursorPosition - 1) === '#') {
                    const modal = new ContextSuggestModal(this.plugin.app, this.plugin.settings.contexts, async (ctx) => {
                        if (!this.plugin.settings.contexts.includes(ctx)) {
                            this.plugin.settings.contexts.push(ctx);
                            await this.plugin.saveSettings();
                        }
                        if (!this.initialContexts.includes(ctx)) {
                            this.initialContexts.push(ctx);
                        }
                        const before = val.substring(0, cursorPosition - 1);
                        const after = val.substring(cursorPosition);
                        target.value = before + after;
                        currentTextValue = target.value;
                        
                        setTimeout(() => { target.focus(); target.setSelectionRange(before.length, before.length); }, 50);
                    });
                    modal.open();
                }
            }

            const converted = target.value.replace(/^\+ /gm, '- [ ] ');
            if (converted !== target.value) {
                const cursor = target.selectionStart;
                const diff = converted.length - target.value.length;
                target.value = converted;
                target.setSelectionRange(cursor + diff, cursor + diff);
            }

            currentTextValue = target.value;
        });

        const metadataContainer = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-top: 15px;' } });

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
