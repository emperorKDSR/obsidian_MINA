import { App, Modal, Platform, Notice, moment, Setting } from 'obsidian';
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
        modalEl.addClass('mina-modern-modal');

        // Style the modal wrapper
        modalEl.style.padding = '0';
        modalEl.style.borderRadius = '16px';
        modalEl.style.overflow = 'hidden';
        modalEl.style.border = '1px solid var(--background-modifier-border)';
        modalEl.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';

        if (Platform.isMobile) {
            const modalW = isTablet() ? '80vw' : '100vw';
            modalEl.style.width = modalW;
            modalEl.style.maxWidth = modalW;
            modalEl.style.height = '100vh';
            modalEl.style.borderRadius = '0';
        }

        // 1. Sleek Header
        const header = contentEl.createEl('div', {
            attr: { style: 'padding: 8px 20px; background: var(--background-secondary-alt); border-bottom: 1px solid var(--background-modifier-border-faint); cursor: move; height: 16px;' }
        });

        // --- Drag Logic ---
        let isDragging = false; let startX: number, startY: number; let initialLeft: number, initialTop: number;
        header.addEventListener('mousedown', (e) => {
            isDragging = true; startX = e.clientX; startY = e.clientY; const rect = modalEl.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top; modalEl.style.position = 'fixed'; modalEl.style.margin = '0';
            modalEl.style.left = initialLeft + 'px'; modalEl.style.top = initialTop + 'px'; e.preventDefault();
        });
        const onMouseMove = (e: MouseEvent) => { if (isDragging) { modalEl.style.left = (initialLeft + e.clientX - startX) + 'px'; modalEl.style.top = (initialTop + e.clientY - startY) + 'px'; } };
        const onMouseUp = () => { isDragging = false; };
        window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
        const originalOnClose = this.onClose.bind(this);
        this.onClose = () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); originalOnClose(); };

        // 2. Content Area
        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px;' } });
        
        const textAreaWrapper = body.createEl('div', { attr: { style: 'position: relative; margin-bottom: 16px;' } });
        const textArea = textAreaWrapper.createEl('textarea', {
            text: this.initialText,
            attr: { 
                placeholder: 'What\'s on your mind?',
                style: 'width: 100%; min-height: 180px; font-size: 1.1em; line-height: 1.6; font-family: var(--font-text); border: none; background: transparent; color: var(--text-normal); resize: none; padding: 10px 0 0 0; outline: none; box-shadow: none;' 
            }
        });
        textArea.focus();

        const handleModalFiles = async (files: FileList) => {
            for (let i = 0; i < files.length; i++) {
                const file = files[i]; if (!file || file.size === 0) continue;
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const extension = file.name && file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png');
                    const baseName = (file.name && file.name.includes('.')) ? file.name.substring(0, file.name.lastIndexOf('.')) : `Pasted image ${moment().format('YYYYMMDDHHmmss')}`;
                    const fileName = `${baseName}.${extension}`;
                    const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(fileName);
                    const newFile = await this.plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
                    const isImgExt = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(extension?.toLowerCase() || '');
                    const markdownLink = isImgExt ? `![[${newFile.name}]]` : `[[${newFile.name}]]`;
                    const startPos = textArea.selectionStart; const endPos = textArea.selectionEnd;
                    textArea.value = textArea.value.substring(0, startPos) + markdownLink + textArea.value.substring(endPos);
                    textArea.selectionStart = textArea.selectionEnd = startPos + markdownLink.length;
                    new Notice(`Attached ${newFile.name}`);
                } catch (err) { new Notice('Failed to save attachment.'); }
            }
        };

        const fileInput = textAreaWrapper.createEl('input', { attr: { type: 'file', multiple: '', style: 'display:none;', accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*' } }) as HTMLInputElement;
        fileInput.addEventListener('change', async () => { if (fileInput.files && fileInput.files.length > 0) { await handleModalFiles(fileInput.files); fileInput.value = ''; } });
        
        const attachBtn = body.createEl('button', { 
            attr: { title: 'Attach file', style: 'background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 8px; color: var(--text-muted); padding: 6px 12px; cursor: pointer; font-size: 0.9em; display: flex; align-items: center; gap: 6px; transition: all 0.2s;' } 
        });
        attachBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg> Attach';
        attachBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });

        // 3. Metadata Bar (Chips)
        const metaBar = body.createEl('div', {
            attr: { style: 'margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 12px;' }
        });

        // Date selector for Tasks
        let dateInput: HTMLInputElement | null = null;
        if (this.isTask) {
            const dateRow = metaBar.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px;' } });
            dateRow.createSpan({ text: 'Due date', attr: { style: 'font-size: 0.8em; font-weight: 600; color: var(--text-muted); width: 80px;' } });
            dateInput = dateRow.createEl('input', {
                type: 'date',
                value: this.initialDueDate || '',
                attr: { style: 'font-size: 0.9em; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);' }
            });
        }

        // Context Chips
        const contextRow = metaBar.createEl('div', { attr: { style: 'display: flex; align-items: flex-start; gap: 10px;' } });
        contextRow.createSpan({ text: 'Contexts', attr: { style: 'font-size: 0.8em; font-weight: 600; color: var(--text-muted); width: 80px; margin-top: 4px;' } });
        const chipContainer = contextRow.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 6px; flex-grow: 1;' } });

        const renderChips = () => {
            chipContainer.empty();
            this.initialContexts.forEach(ctx => {
                const chip = chipContainer.createEl('span', { 
                    text: `#${ctx}`, 
                    attr: { style: 'font-size: 0.75em; padding: 3px 10px; border-radius: 12px; background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer; font-weight: 600;' } 
                });
                chip.addEventListener('click', () => {
                    this.initialContexts = this.initialContexts.filter(c => c !== ctx);
                    renderChips();
                });
            });
            const addChip = chipContainer.createEl('span', { 
                text: '+', 
                attr: { style: 'font-size: 0.8em; padding: 2px 8px; border-radius: 12px; background: var(--background-secondary); color: var(--text-muted); cursor: pointer; border: 1px dashed var(--background-modifier-border);' } 
            });
            addChip.addEventListener('click', () => {
                new ContextSuggestModal(this.app, this.plugin.settings.contexts, async (ctx) => {
                    if (!this.initialContexts.includes(ctx)) this.initialContexts.push(ctx);
                    renderChips();
                }).open();
            });
        };
        renderChips();

        // 4. Footer Actions
        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: flex-end; gap: 12px;' }
        });

        const cancelBtn = footer.createEl('button', { text: 'Cancel', attr: { style: 'background: transparent; border: none; color: var(--text-muted); font-weight: 600; cursor: pointer;' } });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = footer.createEl('button', { 
            text: this.stayOpen ? 'Add and Continue' : 'Save Changes', 
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.1);' } 
        });

        const saveChanges = () => {
            if (!textArea.value.trim()) { new Notice('Please enter some text'); return; }
            const newText = textArea.value.replace(/\n/g, '<br>');
            const newContextString = this.initialContexts.map(c => `#${c}`).join(' ');
            const newDate = dateInput ? dateInput.value : null;
            this.onSave(newText, newContextString, newDate);
            if (this.stayOpen) { textArea.value = ''; textArea.focus(); new Notice(this.isTask ? 'Task added!' : 'Thought added!'); }
            else this.close();
        };

        saveBtn.addEventListener('click', saveChanges);
        textArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); saveChanges(); } });
    }

    onClose() { this.contentEl.empty(); }
}
