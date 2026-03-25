import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, ItemView, WorkspaceLeaf, MarkdownRenderer, Platform, FuzzySuggestModal, Modal, moment } from 'obsidian';

export const VIEW_TYPE_MINA = "mina-view";

const WOLF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#2e3f5c"/>
  <polygon points="22,44 12,10 40,34" fill="#7a97bc"/>
  <polygon points="78,44 88,10 60,34" fill="#7a97bc"/>
  <polygon points="24,42 17,16 38,33" fill="#b87a8a"/>
  <polygon points="76,42 83,16 62,33" fill="#b87a8a"/>
  <ellipse cx="50" cy="60" rx="31" ry="28" fill="#7a97bc"/>
  <ellipse cx="50" cy="47" rx="23" ry="16" fill="#5a7599"/>
  <ellipse cx="50" cy="70" rx="17" ry="13" fill="#c2d4e8"/>
  <ellipse cx="50" cy="65" rx="7" ry="4.5" fill="#1e2b3a"/>
  <path d="M43,71 Q50,76 57,71" stroke="#1e2b3a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="37" cy="55" rx="6" ry="6" fill="#e8c84a"/>
  <ellipse cx="63" cy="55" rx="6" ry="6" fill="#e8c84a"/>
  <ellipse cx="37" cy="55" rx="3" ry="3.5" fill="#111827"/>
  <ellipse cx="63" cy="55" rx="3" ry="3.5" fill="#111827"/>
  <circle cx="38.5" cy="53.5" r="1.2" fill="white" opacity="0.85"/>
  <circle cx="64.5" cy="53.5" r="1.2" fill="white" opacity="0.85"/>
</svg>`;

interface MinaSettings {
    captureFolder: string;
	captureFilePath: string;
    tasksFilePath: string;
	dateFormat: string;
    timeFormat: string;
    contexts: string[];
    selectedContexts: string[];
    geminiApiKey: string;
    geminiModel: string;
}

const DEFAULT_SETTINGS: MinaSettings = {
    captureFolder: '000 Bin',
	captureFilePath: 'mina_1.md',
    tasksFilePath: 'mina_2.md',
	dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    contexts: [], 
    selectedContexts: [],
    geminiApiKey: '',
    geminiModel: 'gemini-2.0-flash'
}

export default class MinaPlugin extends Plugin {
	settings: MinaSettings;
    settingsInitialized: boolean = false;

	async onload() {
		await this.loadSettings();

        this.app.workspace.onLayoutReady(() => {
            this.scanForContexts();
        });

        this.registerView(
            VIEW_TYPE_MINA,
            (leaf) => new MinaView(leaf, this)
        );

		this.addRibbonIcon('brain', 'Mina', (evt: MouseEvent) => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-mina',
			name: 'Open Mina',
			icon: 'brain',
			callback: () => {
				this.activateView();
			}
		});

		this.addSettingTab(new MinaSettingTab(this.app, this));
	}

    async scanForContexts() {
        const { vault } = this.app;
        const folderPath = this.settings.captureFolder.trim();
        const filesToScan = [this.settings.captureFilePath.trim(), this.settings.tasksFilePath.trim()];
        
        let newContextsFound = false;
        const extractedContexts = new Set<string>();

        for (const fileName of filesToScan) {
            const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
            const file = vault.getAbstractFileByPath(fullPath) as TFile;
            
            if (file) {
                try {
                    const content = await vault.read(file);
                    const lines = content.split('\n');
                    for (const line of lines) {
                        if (line.trim().startsWith('|') && !line.includes('---')) {
                            // Extract contexts using regex that matches `#context` (including spaces until next # or |)
                            const matches = line.match(/#[^#|]+/g);
                            if (matches) {
                                for (const match of matches) {
                                    const cleaned = match.substring(1).trim();
                                    if (cleaned) extractedContexts.add(cleaned);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.log(`Error scanning file ${fullPath} for contexts`, error);
                }
            }
        }

        for (const ctx of extractedContexts) {
            if (!this.settings.contexts.includes(ctx)) {
                this.settings.contexts.push(ctx);
                newContextsFound = true;
            }
        }

        if (newContextsFound) {
            await this.saveSettings();
        }
    }

    async activateView() {
        const { workspace } = this.app;

        if (Platform.isMobile) {
            // Detach any existing MINA leaves (may be stuck in sidebar)
            workspace.getLeavesOfType(VIEW_TYPE_MINA).forEach(l => l.detach());
            // Open as a main content tab, like a note
            const leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: VIEW_TYPE_MINA, active: true });
            workspace.revealLeaf(leaf);
            return;
        }

        // Desktop: reuse existing window or open new one
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getLeaf('window');
            if (leaf) await leaf.setViewState({ type: VIEW_TYPE_MINA, active: true });
        }
        if (leaf) workspace.revealLeaf(leaf);
    }

	async loadSettings() {
		const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);

        if (!loadedData || Object.keys(loadedData).length === 0) {
            this.settings.contexts = [];
            this.settingsInitialized = true;
        } else {
            if (loadedData.captureFolder !== undefined) this.settings.captureFolder = loadedData.captureFolder;
            if (loadedData.captureFilePath !== undefined) this.settings.captureFilePath = loadedData.captureFilePath;
            if (loadedData.tasksFilePath !== undefined) this.settings.tasksFilePath = loadedData.tasksFilePath;
            if (loadedData.dateFormat !== undefined) this.settings.dateFormat = loadedData.dateFormat;
            if (loadedData.timeFormat !== undefined) this.settings.timeFormat = loadedData.timeFormat;
            
            if (loadedData.contexts) {
                if (Array.isArray(loadedData.contexts)) {
                    this.settings.contexts = [...loadedData.contexts];
                } else if (typeof loadedData.contexts === 'string') {
                    this.settings.contexts = loadedData.contexts.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                }
            }

            if (loadedData.selectedContexts) {
                if (Array.isArray(loadedData.selectedContexts)) {
                    this.settings.selectedContexts = [...loadedData.selectedContexts];
                } else if (typeof loadedData.selectedContexts === 'string') {
                    this.settings.selectedContexts = loadedData.selectedContexts.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                }
            }
            if (loadedData.geminiApiKey !== undefined) this.settings.geminiApiKey = loadedData.geminiApiKey;
            if (loadedData.geminiModel !== undefined) this.settings.geminiModel = loadedData.geminiModel;
            this.settingsInitialized = true;
        }

        if (this.settings.dateFormat === 'YYYY-MM-DD HH:mm') {
            this.settings.dateFormat = 'YYYY-MM-DD';
            this.settings.timeFormat = 'HH:mm';
        }
	}

	async saveSettings() {
        if (!this.settingsInitialized) return;
		await this.saveData(this.settings);
	}

    async appendCapture(content: string, contexts: string[], isTask: boolean, dueDate?: string, parentId: string = '') {
        const { vault } = this.app;
        const folderPath = this.settings.captureFolder.trim();
        const fileName = isTask ? this.settings.tasksFilePath.trim() : this.settings.captureFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;

        if (folderPath && folderPath !== '/') {
            const parts = folderPath.split('/');
            let currentPath = '';
            for (const part of parts) {
                currentPath += (currentPath ? '/' : '') + part;
                if (!vault.getAbstractFileByPath(currentPath)) {
                    await vault.createFolder(currentPath);
                }
            }
        }
        
        let file = vault.getAbstractFileByPath(fullPath) as TFile;
        if (!file) {
            try {
                file = await vault.create(fullPath, '');
            } catch (error) {
                new Notice(`Error creating file ${fullPath}`);
                return;
            }
        }
        const dateStr = moment().format(this.settings.dateFormat);
        const timeStr = moment().format(this.settings.timeFormat);
        
        const dateCol = `[[${dateStr}]]`;
        const timeCol = timeStr;
        const contextsCol = contexts.map(ctx => `#${ctx}`).join(' ');
        const sanitizedContent = content.replace(/\n/g, '<br>');
        
        let newRow = '';
        let header = '';
        let separator = '';

        if (isTask) {
            const dueDateCol = dueDate ? `[[${dueDate}]]` : '';
            // Task Table Structure: | Status | Date | Time | Modified Date | Modified Time | Due Date | Task | Context |
            newRow = `| [ ] | ${dateCol} | ${timeCol} | ${dateCol} | ${timeCol} | ${dueDateCol} | ${sanitizedContent} | ${contextsCol} |`;
            header = `| Status | Date | Time | Modified Date | Modified Time | Due Date | Task | Context |`;
            separator = `| :---: | --- | --- | --- | --- | --- | --- | --- |`;
        } else {
            // Thought Table Structure: | ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |
            const id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
            newRow = `| ${id} | ${parentId} | ${dateCol} | ${timeCol} | ${dateCol} | ${timeCol} | ${sanitizedContent} | ${contextsCol} |`;
            header = `| ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |`;
            separator = `| --- | --- | --- | --- | --- | --- | --- | --- |`;
        }

        try {
            const currentContent = await vault.read(file);
            const lines = currentContent.split('\n');
            let newContent = '';
            if (lines.length < 2 || !lines[0].includes('Date') || !lines[1].includes('---')) {
                newContent = header + '\n' + separator + '\n' + newRow + (currentContent ? '\n' + currentContent : '');
            } else {
                // If existing file schema differs, update header/separator
                lines[0] = header;
                lines[1] = separator;
                lines.splice(2, 0, newRow);

                // Bubble up modification time to parent
                if (!isTask && parentId) {
                    let currentParentToFind = parentId;
                    while (currentParentToFind) {
                        let found = false;
                        for (let i = 2; i < lines.length; i++) {
                            const rowParts = lines[i].split('|');
                            if (rowParts.length >= 2 && rowParts[1].trim() === currentParentToFind) {
                                // Found parent, update its Modified Date/Time (Columns 5 and 6)
                                rowParts[5] = ` ${dateCol} `;
                                rowParts[6] = ` ${timeCol} `;
                                lines[i] = rowParts.join('|');
                                currentParentToFind = rowParts[2].trim(); // Move to grandparent
                                found = true;
                                break;
                            }
                        }
                        if (!found) break;
                    }
                }

                newContent = lines.join('\n');
            }
            await vault.modify(file, newContent);
            new Notice('Synced successfully!');
        } catch (error) {
            new Notice('Error writing to file');
        }
    }
}

export class FileSuggestModal extends FuzzySuggestModal<TFile> {
    onChoose: (file: TFile) => void;

    constructor(app: App, onChoose: (file: TFile) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    getItems(): TFile[] {
        return this.app.vault.getFiles().filter(f => f.extension === 'md');
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onChoose(file);
    }
}

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
            modalEl.style.width = '95vw';
            modalEl.style.maxWidth = '95vw';
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
        
        // Define cleanup
        const cleanupDrag = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        // Wrap onClose to ensure cleanup
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
                    });
                    modal.open();
                }
            }
            currentTextValue = val;
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
        const contextsDiv = contentEl.createEl('div', { attr: { style: 'margin-bottom: 15px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center;' } });
        
        const renderContextTags = () => {
            contextsDiv.empty();
            this.plugin.settings.contexts.forEach(ctx => {
                const isSelected = this.initialContexts.includes(ctx);
                const tagEl = contextsDiv.createEl('span', {
                    text: `#${ctx}`,
                    attr: { 
                        style: `cursor: pointer; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; user-select: none; border: 1px solid var(--background-modifier-border); ${isSelected ? 'background-color: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);' : 'background-color: var(--background-secondary); color: var(--text-muted);'}` 
                    }
                });
                tagEl.addEventListener('click', () => {
                    if (isSelected) this.initialContexts = this.initialContexts.filter(c => c !== ctx);
                    else this.initialContexts.push(ctx);
                    renderContextTags();
                });
            });
            const newCtxInput = contextsDiv.createEl('input', { type: 'text', placeholder: '+ add', attr: { style: 'padding: 2px 8px; border-radius: 12px; font-size: 0.85em; border: 1px dashed var(--background-modifier-border); background: transparent; width: 60px; outline: none;' } });
            newCtxInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = newCtxInput.value.trim().replace(/^#/, '');
                    if (val && !this.plugin.settings.contexts.includes(val)) {
                        this.plugin.settings.contexts.push(val);
                        this.initialContexts.push(val);
                        await this.plugin.saveSettings();
                        renderContextTags();
                    } else if (val && !this.initialContexts.includes(val)) {
                        this.initialContexts.push(val);
                        renderContextTags();
                    }
                }
            });
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
            metadataContainer.createEl('div'); // Spacer
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
        textArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveChanges(); } });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ConfirmModal extends Modal {
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

class MinaChatModal extends Modal {
    plugin: MinaPlugin;
    view: MinaView;

    constructor(app: App, plugin: MinaPlugin, view: MinaView) {
        super(app);
        this.plugin = plugin;
        this.view = view;
    }

    onOpen() {
        const { modalEl, contentEl } = this;

        // Full-screen style
        modalEl.style.width = '100vw';
        modalEl.style.height = '100vh';
        modalEl.style.maxWidth = '100vw';
        modalEl.style.maxHeight = '100vh';
        modalEl.style.margin = '0';
        modalEl.style.borderRadius = '0';
        modalEl.style.top = '0';
        modalEl.style.left = '0';
        modalEl.style.position = 'fixed';

        contentEl.style.padding = '0';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        contentEl.style.height = '100%';
        contentEl.empty();

        // Header bar with title and close button
        const header = contentEl.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--background-modifier-border); flex-shrink: 0; background: var(--background-secondary);' } });
        header.createEl('span', { text: 'MINA', attr: { style: 'font-size: 1em; font-weight: 600; color: var(--text-normal);' } });
        const closeBtn = header.createEl('button', { text: '✕', attr: { style: 'background: none; border: none; font-size: 1.1em; cursor: pointer; color: var(--text-muted); padding: 2px 6px;' } });
        closeBtn.addEventListener('click', () => this.close());

        // Render MINA chat into contentEl
        this.view.renderMinaMode(contentEl);
    }

    onClose() {
        this.contentEl.empty();
    }
}

interface ThoughtEntry {
    id: string;
    parentId: string;
    date: string;
    time: string;
    modifiedDate: string;
    modifiedTime: string;
    text: string;
    context: string;
    lineIndex: number;
    children: ThoughtEntry[];
    lastThreadUpdate?: number;
}

class MinaView extends ItemView {
    plugin: MinaPlugin;
    content: string;
    isTask: boolean;
    dueDate: string; // YYYY-MM-DD
    activeTab: 'review-tasks' | 'review-thoughts' | 'mina-ai' | 'settings' = 'review-thoughts';

    // AI Chat State
    chatHistory: { role: 'user' | 'assistant'; text: string }[] = [];
    chatContainer: HTMLElement;
    minaUseFullVault: boolean = false;
    
    // Tasks Review Filters
    tasksFilterStatus: 'all' | 'pending' | 'completed' = 'pending';
    tasksFilterContext: string[] = [];
    tasksFilterDate: string = 'today'; // 'all' | 'today' | 'this-week' | 'next-week' | 'overdue' | 'custom'
    tasksFilterDateStart: string = '';
    tasksFilterDateEnd: string = '';
    showPreviousTasks: boolean = true;
    showCaptureInTasks: boolean = true;
    showTasksFilter: boolean = false;

    // Threads State
    collapsedThreads: Set<string> = new Set();
    collapsedThreadsSeeded: boolean = false;
    replyToId: string | null = null;
    replyToText: string | null = null;

    // Thoughts Review Filters
    thoughtsFilterContext: string[] = [];
    thoughtsFilterDate: string = 'all'; // 'all' | 'today' | 'this-week' | 'custom'
    thoughtsFilterDateStart: string = '';
    thoughtsFilterDateEnd: string = '';
    showPreviousThoughts: boolean = true;
    showCaptureInThoughts: boolean = true;
    showThoughtsFilter: boolean = false;

    reviewTasksContainer: HTMLElement;
    reviewThoughtsContainer: HTMLElement;
    selectedContexts: string[];

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.content = '';
        this.isTask = false;
        // @ts-ignore
        this.dueDate = moment().format('YYYY-MM-DD');
        this.showPreviousThoughts = true;
        this.showCaptureInThoughts = true;
        this.selectedContexts = Array.isArray(this.plugin.settings.selectedContexts) ? [...this.plugin.settings.selectedContexts] : [];
    }

    getViewType() { return VIEW_TYPE_MINA; }
    getDisplayText() { return "MINA V1"; }
    getIcon() { return "brain"; }

    async onOpen() {
        this.renderView();

        // Hide headers for a cleaner standalone window on desktop
        if (!Platform.isMobile) {
            const headerEl = this.containerEl.querySelector('.view-header');
            if (headerEl) {
                (headerEl as HTMLElement).style.display = 'none';
            }
            
            // Try to hide the tab container if we are the only tab
            setTimeout(() => {
                const tabContainer = this.containerEl.closest('.workspace-tabs');
                if (tabContainer) {
                    const tabHeader = tabContainer.querySelector('.workspace-tab-header-container');
                    if (tabHeader) {
                        (tabHeader as HTMLElement).style.display = 'none';
                    }
                }
            }, 100);
        }
    }

    renderView() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        if (Platform.isMobile) {
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.height = '100%';
            container.style.overflow = 'hidden';
        } else {
            // Drag handle for desktop
            const dragHandle = container.createEl('div', { attr: { style: 'height: 14px; width: 100%; -webkit-app-region: drag; flex-shrink: 0; display: flex; justify-content: center; align-items: center; margin-bottom: 8px; cursor: grab;' } });
            dragHandle.createEl('div', { attr: { style: 'width: 40px; height: 4px; background-color: var(--background-modifier-border); border-radius: 4px;' }});
        }

        // --- Navigation Tabs ---
        const nav = container.createEl('div', { attr: { style: 'display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px; flex-shrink: 0;' } });
        
        const reviewThoughtsTab = nav.createEl('button', { 
            text: 'Thoughts', 
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'review-thoughts' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` } 
        });
        reviewThoughtsTab.addEventListener('click', () => { this.activeTab = 'review-thoughts'; this.renderView(); });

        const reviewTasksTab = nav.createEl('button', { 
            text: 'Tasks', 
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'review-tasks' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` } 
        });
        reviewTasksTab.addEventListener('click', () => { this.activeTab = 'review-tasks'; this.renderView(); });

        const minaTab = nav.createEl('button', {
            text: 'MINA',
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'mina-ai' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` }
        });
        minaTab.addEventListener('click', () => { this.activeTab = 'mina-ai'; this.renderView(); });

        const settingsTab = nav.createEl('button', {
            text: 'Settings',
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'settings' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` }
        });
        settingsTab.addEventListener('click', () => { this.activeTab = 'settings'; this.renderView(); });

        if (this.activeTab === 'review-tasks') {
            this.renderReviewTasksMode(container);
        } else if (this.activeTab === 'mina-ai') {
            this.renderMinaMode(container);
        } else if (this.activeTab === 'settings') {
            this.renderSettingsMode(container);
        } else {
            this.renderReviewThoughtsMode(container);
        }
    }

    renderSettingsMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex-grow: 1;' } });

        const field = (label: string, desc: string, inputFn: (row: HTMLElement) => void) => {
            const row = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 12px;' } });
            row.createEl('div', { text: label, attr: { style: 'font-size: 0.9em; font-weight: 600; color: var(--text-normal);' } });
            if (desc) row.createEl('div', { text: desc, attr: { style: 'font-size: 0.78em; color: var(--text-muted);' } });
            inputFn(row);
        };

        const input = (parent: HTMLElement, value: string, placeholder: string, type = 'text', onChange: (v: string) => void) => {
            const el = parent.createEl('input', { type, attr: { value, placeholder, style: 'font-size: 0.85em; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); width: 100%; box-sizing: border-box;' } });
            el.addEventListener('change', () => onChange(el.value));
        };

        field('Capture Folder', 'Folder where MINA files are stored.', row => input(row, this.plugin.settings.captureFolder, '000 Bin', 'text', async v => { this.plugin.settings.captureFolder = v; await this.plugin.saveSettings(); }));
        field('Thoughts File', 'File name for thoughts.', row => input(row, this.plugin.settings.captureFilePath, 'mina_1.md', 'text', async v => { this.plugin.settings.captureFilePath = v; await this.plugin.saveSettings(); }));
        field('Tasks File', 'File name for tasks.', row => input(row, this.plugin.settings.tasksFilePath, 'mina_2.md', 'text', async v => { this.plugin.settings.tasksFilePath = v; await this.plugin.saveSettings(); }));
        field('Date Format', 'moment.js format, e.g. YYYY-MM-DD', row => input(row, this.plugin.settings.dateFormat, 'YYYY-MM-DD', 'text', async v => { this.plugin.settings.dateFormat = v; await this.plugin.saveSettings(); }));
        field('Time Format', 'moment.js format, e.g. HH:mm', row => input(row, this.plugin.settings.timeFormat, 'HH:mm', 'text', async v => { this.plugin.settings.timeFormat = v; await this.plugin.saveSettings(); }));
        field('Gemini API Key', 'Your Google Gemini API key.', row => input(row, this.plugin.settings.geminiApiKey, 'AIza...', 'password', async v => { this.plugin.settings.geminiApiKey = v.trim(); await this.plugin.saveSettings(); }));

        field('Gemini Model', 'Model to use for MINA AI chat.', row => {
            const models: [string, string][] = [
                ['gemini-2.5-pro',           '2.5 Pro — highest reasoning & multimodal'],
                ['gemini-2.5-flash',         '2.5 Flash — fast, general-purpose'],
                ['gemini-2.5-flash-lite',    '2.5 Flash Lite — ultra-fast, cost-efficient'],
                ['gemini-2.5-flash-preview', '2.5 Flash Preview — latest preview'],
                ['gemini-2.0-flash',         '2.0 Flash — stable, multimodal (default)'],
                ['gemini-2.0-flash-lite',    '2.0 Flash Lite — budget-friendly'],
                ['gemini-1.5-pro',           '1.5 Pro — complex reasoning, prior flagship'],
                ['gemini-1.5-flash',         '1.5 Flash — fast, previous gen'],
                ['gemini-1.5-flash-8b',      '1.5 Flash 8B — high-volume, lightweight'],
            ];
            const sel = row.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); width: 100%;' } });
            models.forEach(([val, label]) => {
                const opt = sel.createEl('option', { value: val, text: label });
                if (this.plugin.settings.geminiModel === val) opt.selected = true;
            });
            sel.addEventListener('change', async () => { this.plugin.settings.geminiModel = sel.value; await this.plugin.saveSettings(); });
        });
    }

    async renderMinaMode(container: HTMLElement) {
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.height = '100%';
        container.style.overflow = 'hidden';

        if (!this.plugin.settings.geminiApiKey) {
            const warn = container.createEl('div', { attr: { style: 'padding: 20px; color: var(--text-muted); font-size: 0.9em;' } });
            warn.createEl('p', { text: '⚠️ No Gemini API key set.' });
            warn.createEl('p', { text: 'Add your key in Settings → MINA → Gemini API Key.' });
            return;
        }

        // Toolbar
        const toolbar = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border); font-size: 0.8em; color: var(--text-muted);' } });
        toolbar.createSpan({ text: 'Full Vault', attr: { style: 'font-size: 0.85em;' } });
        const vaultToggleLabel = toolbar.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
        const vaultCb = vaultToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
        vaultCb.checked = this.minaUseFullVault;
        const vaultSlider = vaultToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.minaUseFullVault ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
        vaultToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.minaUseFullVault ? 'translateX(14px)' : 'translateX(0)'};` } });
        const vaultLabel = toolbar.createSpan({ text: this.minaUseFullVault ? '(entire vault as context)' : '(thoughts & tasks only)', attr: { style: 'color: var(--text-muted); font-style: italic;' } });
        vaultCb.addEventListener('change', () => {
            this.minaUseFullVault = vaultCb.checked;
            vaultSlider.style.backgroundColor = this.minaUseFullVault ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
            const knob = vaultToggleLabel.querySelector('span:last-child') as HTMLElement;
            if (knob) knob.style.transform = this.minaUseFullVault ? 'translateX(14px)' : 'translateX(0)';
            vaultLabel.setText(this.minaUseFullVault ? '(entire vault as context)' : '(thoughts & tasks only)');
        });

        // Chat history display
        this.chatContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px;' } });
        this.renderChatHistory();

        // Input row
        const inputRow = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--background-modifier-border); align-items: stretch;' } });
        const textarea = inputRow.createEl('textarea', { attr: { placeholder: 'Ask MINA about your thoughts and tasks…', rows: '2', style: 'flex-grow: 1; resize: none; font-size: 0.9em; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-family: inherit;' } });
        const sendBtn = inputRow.createEl('button', { text: '↑', attr: { style: 'padding: 0 16px; font-size: 1.3em; border-radius: 6px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; cursor: pointer; flex-shrink: 0;' } });

        const send = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            textarea.value = '';
            textarea.disabled = true;
            sendBtn.disabled = true;

            this.chatHistory.push({ role: 'user', text });
            this.renderChatHistory();

            // Thinking indicator
            const thinking = this.chatContainer.createEl('div', { attr: { style: 'align-self: flex-start; font-size: 0.85em; color: var(--text-muted); font-style: italic;' } });
            thinking.setText('MINA is thinking…');
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

            try {
                const reply = await this.callGemini(text);
                thinking.remove();
                this.chatHistory.push({ role: 'assistant', text: reply });
            } catch (e) {
                thinking.remove();
                this.chatHistory.push({ role: 'assistant', text: `⚠️ Error: ${e.message}` });
            }

            this.renderChatHistory();
            textarea.disabled = false;
            sendBtn.disabled = false;
            textarea.focus();
        };

        sendBtn.addEventListener('click', send);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        });

        setTimeout(() => textarea.focus(), 50);
    }

    renderChatHistory() {
        if (!this.chatContainer) return;
        this.chatContainer.empty();
        if (this.chatHistory.length === 0) {
            this.chatContainer.createEl('div', { text: 'Ask me anything about your thoughts and tasks.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; text-align: center; margin-top: 20px;' } });
            return;
        }
        for (const msg of this.chatHistory) {
            const isUser = msg.role === 'user';
            const bubble = this.chatContainer.createEl('div', { attr: { style: `max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 0.9em; line-height: 1.5; white-space: pre-wrap; word-break: break-word; align-self: ${isUser ? 'flex-end' : 'flex-start'}; background: ${isUser ? 'var(--interactive-accent)' : 'var(--background-secondary)'}; color: ${isUser ? 'var(--text-on-accent)' : 'var(--text-normal)'};` } });
            bubble.setText(msg.text);
        }
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    async callGemini(userMessage: string): Promise<string> {
        const { vault } = this.plugin.app;
        const s = this.plugin.settings;

        const readFile = async (folder: string, file: string) => {
            try {
                const f = vault.getFileByPath(`${folder.trim()}/${file.trim()}`);
                if (f) return await vault.read(f);
            } catch {}
            return '';
        };

        let systemPrompt: string;

        if (this.minaUseFullVault) {
            // Read all markdown files in the vault
            const mdFiles = vault.getMarkdownFiles();
            const sections: string[] = [];
            for (const file of mdFiles) {
                try {
                    const content = await vault.read(file);
                    if (content.trim()) sections.push(`--- ${file.path} ---\n${content}`);
                } catch {}
            }
            systemPrompt = `You are MINA, a personal AI assistant embedded in Obsidian. You have access to the user's entire vault below. Answer questions, summarize, find patterns, suggest actions, or help reflect — based on this data. Be concise and helpful.\n\n${sections.join('\n\n')}`;
        } else {
            const thoughtsContent = await readFile(s.captureFolder, s.captureFilePath);
            const tasksContent = await readFile(s.captureFolder, s.tasksFilePath);
            systemPrompt = `You are MINA, a personal AI assistant embedded in Obsidian. You have access to the user's thoughts and tasks data below. Answer questions, summarize, find patterns, suggest actions, or help reflect — based on this data. Be concise and helpful.

--- THOUGHTS ---
${thoughtsContent || '(empty)'}

--- TASKS ---
${tasksContent || '(empty)'}`;
        }

        const body = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        };

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiApiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err?.error?.message || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '(no response)';
    }

    renderCaptureMode(container: HTMLElement, isThoughtsOnly: boolean = false, isTasksOnly: boolean = false) {
        if (this.replyToId) {
            const replyBanner = container.createEl('div', { attr: { style: 'background-color: var(--background-secondary-alt); padding: 8px 12px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid var(--interactive-accent); display: flex; justify-content: space-between; align-items: center; font-size: 0.85em;' } });
            const bannerText = replyBanner.createEl('div', { attr: { style: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1; margin-right: 10px;' } });
            bannerText.createSpan({ text: 'Replying to: ', attr: { style: 'font-weight: bold; color: var(--text-accent);' } });
            bannerText.createSpan({ text: this.replyToText || '' });
            
            const cancelReply = replyBanner.createEl('button', { text: '✕', attr: { style: 'padding: 2px 6px; font-size: 0.8em; background: transparent; border: none; cursor: pointer;' } });
            cancelReply.addEventListener('click', () => {
                this.replyToId = null;
                this.replyToText = null;
                this.renderView();
            });
        }

        const inputSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; margin-bottom: 10px; display: flex; gap: 10px; align-items: flex-end;' } });
        const textAreaWrapper = inputSection.createEl('div', { attr: { style: 'flex-grow: 1;' } });
        const textArea = textAreaWrapper.createEl('textarea', {
            attr: {
                placeholder: 'Enter your thought, task, or paste/drop an image...',
                rows: '3',
                style: 'width: 100%; font-family: var(--font-text); resize: vertical; display: block;'
            }
        });
        textArea.value = this.content;
        
        if (Platform.isMobile) {
            textArea.addEventListener('focus', () => {
                setTimeout(() => { textArea.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
            });
        }

        let lastValue = this.content;
        textArea.addEventListener('input', (e) => { 
            const target = e.target as HTMLTextAreaElement;
            const val = target.value;
            
            if (val.length > lastValue.length) {
                const cursorPosition = target.selectionStart;
                if (cursorPosition > 0 && val.charAt(cursorPosition - 1) === '\\') {
                    const modal = new FileSuggestModal(this.plugin.app, (file) => {
                        const before = val.substring(0, cursorPosition - 1);
                        const after = val.substring(cursorPosition);
                        const insertText = `[[${file.basename}]]`;
                        target.value = before + insertText + after;
                        this.content = target.value;
                        
                        // Use a short timeout to ensure mobile keyboards and focus behave correctly after the modal closes
                        setTimeout(() => {
                            target.focus();
                            target.setSelectionRange(before.length + insertText.length, before.length + insertText.length);
                        }, 50);
                    });
                    modal.open();
                }
            }
            lastValue = val;
            this.content = val;
        });

        // Event listeners for drag/paste
        textArea.addEventListener('paste', async (e: ClipboardEvent) => {
            e.stopPropagation();
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                let hasImage = false;
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    if (e.clipboardData.items[i].type.startsWith('image/')) { hasImage = true; break; }
                }
                if (hasImage) { e.preventDefault(); await this.handleFiles(e.clipboardData.files); }
            }
        });

        textArea.addEventListener('dragover', (e) => { e.stopPropagation(); e.preventDefault(); });
        textArea.addEventListener('drop', async (e: DragEvent) => {
            e.stopPropagation();
            if (e.dataTransfer && e.dataTransfer.files.length > 0) { e.preventDefault(); await this.handleFiles(e.dataTransfer.files); }
        });

        const submitBtn = inputSection.createEl('button', { text: 'Sync', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 8px 16px; height: 100%; min-height: 40px;' } });
        
        // Contexts
        const controlsDiv = container.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 15px;' } });
        
        const contextsDiv = controlsDiv.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 5px; align-items: center;' } });
        const renderContextTags = () => {
            contextsDiv.empty();
            this.plugin.settings.contexts.forEach(ctx => {
                const isSelected = this.selectedContexts.includes(ctx);
                const tagEl = contextsDiv.createEl('span', {
                    text: `#${ctx}`,
                    attr: { 
                        style: `cursor: pointer; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; user-select: none; border: 1px solid var(--background-modifier-border); ${isSelected ? 'background-color: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);' : 'background-color: var(--background-secondary); color: var(--text-muted);'}` 
                    }
                });
                tagEl.addEventListener('click', async () => {
                    if (isSelected) this.selectedContexts = this.selectedContexts.filter(c => c !== ctx);
                    else this.selectedContexts.push(ctx);
                    this.plugin.settings.selectedContexts = [...this.selectedContexts];
                    await this.plugin.saveSettings();
                    renderContextTags();
                });
                tagEl.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    this.plugin.settings.contexts = this.plugin.settings.contexts.filter(c => c !== ctx);
                    this.selectedContexts = this.selectedContexts.filter(c => c !== ctx);
                    this.plugin.settings.selectedContexts = [...this.selectedContexts];
                    await this.plugin.saveSettings();
                    renderContextTags();
                });
            });
            const newCtxInput = contextsDiv.createEl('input', { type: 'text', placeholder: '+ add', attr: { style: 'padding: 2px 8px; border-radius: 12px; font-size: 0.85em; border: 1px dashed var(--background-modifier-border); background: transparent; width: 60px; outline: none;' } });
            newCtxInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    const val = newCtxInput.value.trim().replace(/^#/, '');
                    if (val && !this.plugin.settings.contexts.includes(val)) {
                        this.plugin.settings.contexts.push(val);
                        this.selectedContexts.push(val);
                        this.plugin.settings.selectedContexts = [...this.selectedContexts];
                        await this.plugin.saveSettings();
                        renderContextTags();
                    }
                }
            });
        };
        renderContextTags();

        if (!isThoughtsOnly && !isTasksOnly) {
            const taskToggleDiv = controlsDiv.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; margin-left: auto;' } });
            const taskCheckbox = taskToggleDiv.createEl('input', { type: 'checkbox', attr: { id: 'is-task-checkbox' } });
            taskCheckbox.checked = this.isTask;
            taskToggleDiv.createEl('label', { attr: { for: 'is-task-checkbox', style: 'cursor: pointer;' }, text: 'As Task' });

            // Due Date Section (only for tasks)
            const dueDateContainer = taskToggleDiv.createEl('div', { 
                attr: { style: `display: ${this.isTask ? 'flex' : 'none'}; align-items: center; gap: 5px; margin-left: 10px;` } 
            });
            dueDateContainer.createSpan({ text: 'Due:', attr: { style: 'font-size: 0.85em; color: var(--text-muted);' } });
            const datePicker = dueDateContainer.createEl('input', { 
                type: 'date', 
                attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } 
            });
            datePicker.value = this.dueDate;
            datePicker.addEventListener('change', (e) => { this.dueDate = (e.target as HTMLInputElement).value; });

            taskCheckbox.addEventListener('change', (e) => { 
                this.isTask = (e.target as HTMLInputElement).checked; 
                dueDateContainer.style.display = this.isTask ? 'flex' : 'none';
            });
        } else if (isTasksOnly) {
            this.isTask = true;
            const taskControlsDiv = controlsDiv.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; margin-left: auto;' } });
            taskControlsDiv.createSpan({ text: 'Due:', attr: { style: 'font-size: 0.85em; color: var(--text-muted);' } });
            const datePicker = taskControlsDiv.createEl('input', { 
                type: 'date', 
                attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } 
            });
            datePicker.value = this.dueDate;
            datePicker.addEventListener('change', (e) => { this.dueDate = (e.target as HTMLInputElement).value; });
        } else {
            this.isTask = false;
        }

        const submitAction = async () => {
            if (this.content.trim().length > 0) {
                await this.plugin.appendCapture(this.content.trim(), this.selectedContexts, this.isTask, this.isTask ? this.dueDate : undefined, this.replyToId || '');
                this.content = ''; 
                textArea.value = '';
                this.replyToId = null;
                this.replyToText = null;
                this.renderView();
            } else { new Notice('Please enter some text'); }
        };
        submitBtn.addEventListener('click', submitAction);
        textArea.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); await submitAction(); } });
    }

    renderReviewTasksMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { 
            attr: { style: `flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;` } 
        });
        
        // Toggle Group (History + Capture)
        let filterBarEl: HTMLElement | null = null;
        const renderToggles = (parent: HTMLElement) => {
            const toggleGroup = parent.createEl('div', { attr: { style: `\ display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: flex-start; width: 100%;` } });

            // Toggle Filter
            const filterToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            filterToggleContainer.createSpan({ text: 'Filter' });
            const filterToggleLabel = filterToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const filterCbT = filterToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            filterCbT.checked = this.showTasksFilter;
            const filterSliderT = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: \; transition: .3s; border-radius: 16px;` } });
            const filterKnobT = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: \;` } });
            filterCbT.addEventListener('change', (e) => {
                this.showTasksFilter = (e.target as HTMLInputElement).checked;
                filterSliderT.style.backgroundColor = this.showTasksFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                filterKnobT.style.transform = this.showTasksFilter ? 'translateX(14px)' : 'translateX(0)';
                if (filterBarEl) filterBarEl.style.display = this.showTasksFilter ? 'flex' : 'none';
            });


            // Toggle History
            const historyToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            historyToggleContainer.createSpan({ text: 'History' });
            
            const historyToggleLabel = historyToggleContainer.createEl('label', { 
                attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } 
            });
            const historyCb = historyToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            historyCb.checked = this.showPreviousTasks;
            const historySlider = historyToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showPreviousTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } 
            });
            const historyKnob = historyToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showPreviousTasks ? 'translateX(14px)' : 'translateX(0)'};` } 
            });

            historyCb.addEventListener('change', (e) => {
                this.showPreviousTasks = (e.target as HTMLInputElement).checked;
                historySlider.style.backgroundColor = this.showPreviousTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                historyKnob.style.transform = this.showPreviousTasks ? 'translateX(14px)' : 'translateX(0)';
                this.updateReviewTasksList();
            });

            // Toggle Capture
            const captureToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            captureToggleContainer.createSpan({ text: 'Capture' });
            
            const captureToggleLabel = captureToggleContainer.createEl('label', { 
                attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } 
            });
            const captureCb = captureToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            captureCb.checked = this.showCaptureInTasks;
            const captureSlider = captureToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showCaptureInTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } 
            });
            const captureKnob = captureToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showCaptureInTasks ? 'translateX(14px)' : 'translateX(0)'};` } 
            });

            captureCb.addEventListener('change', (e) => {
                this.showCaptureInTasks = (e.target as HTMLInputElement).checked;
                captureSlider.style.backgroundColor = this.showCaptureInTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                captureKnob.style.transform = this.showCaptureInTasks ? 'translateX(14px)' : 'translateX(0)';
                if (captureContainer) captureContainer.style.display = this.showCaptureInTasks ? 'block' : 'none';
            });
        };

        renderToggles(headerSection);

        const filterBar = headerSection.createEl('div', { attr: { style: 'display: none; flex-wrap: wrap; gap: 10px; align-items: center;' } });
        filterBarEl = filterBar;
        
        const statusSel = filterBar.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
        [['all', 'All Status'], ['pending', 'Pending'], ['completed', 'Completed']].forEach(([val, label]) => {
            const opt = statusSel.createEl('option', { value: val, text: label });
            if (this.tasksFilterStatus === val) opt.selected = true;
        });
        statusSel.addEventListener('change', (e) => { this.tasksFilterStatus = (e.target as HTMLSelectElement).value as any; this.updateReviewTasksList(); });

        const contextPills = filterBar.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; align-items: center;' } });
        const renderTaskContextPills = () => {
            contextPills.empty();
            this.plugin.settings.contexts.forEach(ctx => {
                const active = this.tasksFilterContext.includes(ctx);
                const pill = contextPills.createEl('span', {
                    text: `#${ctx}`,
                    attr: { style: `cursor: pointer; font-size: 0.8em; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--interactive-accent); background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'}; transition: 0.15s;` }
                });
                pill.addEventListener('click', () => {
                    if (active) this.tasksFilterContext = this.tasksFilterContext.filter(c => c !== ctx);
                    else this.tasksFilterContext = [...this.tasksFilterContext, ctx];
                    renderTaskContextPills();
                    this.updateReviewTasksList();
                });
            });
        };
        renderTaskContextPills();

        const dateContainer = filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
        const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
        [['all', 'All Dates'], ['today', 'Today'], ['this-week', 'This Week'], ['next-week', 'Next Week'], ['overdue', 'Overdue'], ['custom', 'Custom Date']].forEach(([val, label]) => {
            const opt = dateSel.createEl('option', { value: val, text: label });
            if (this.tasksFilterDate === val) opt.selected = true;
        });

        const customDateContainer = dateContainer.createEl('div', { 
            attr: { style: `display: ${this.tasksFilterDate === 'custom' ? 'flex' : 'none'}; gap: 5px; align-items: center; flex-wrap: wrap;` } 
        });

        const customDateStartInput = customDateContainer.createEl('input', { 
            type: 'date', 
            attr: { style: `font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;` } 
        });
        if (this.tasksFilterDateStart) customDateStartInput.value = this.tasksFilterDateStart;

        customDateContainer.createSpan({ text: 'to', attr: { style: 'font-size: 0.85em; color: var(--text-muted); padding: 0 2px;' } });

        const customDateEndInput = customDateContainer.createEl('input', { 
            type: 'date', 
            attr: { style: `font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;` } 
        });
        if (this.tasksFilterDateEnd) customDateEndInput.value = this.tasksFilterDateEnd;

        dateSel.addEventListener('change', (e) => { 
            const val = (e.target as HTMLSelectElement).value;
            this.tasksFilterDate = val;
            if (val === 'custom') {
                customDateContainer.style.display = 'flex';
                // @ts-ignore
                this.tasksFilterDateStart = customDateStartInput.value || moment().format('YYYY-MM-DD');
                if (!customDateStartInput.value) customDateStartInput.value = this.tasksFilterDateStart;
                // @ts-ignore
                this.tasksFilterDateEnd = customDateEndInput.value || moment().format('YYYY-MM-DD');
                if (!customDateEndInput.value) customDateEndInput.value = this.tasksFilterDateEnd;
            } else {
                customDateContainer.style.display = 'none';
            }
            this.updateReviewTasksList(); 
        });

        customDateStartInput.addEventListener('change', (e) => {
            this.tasksFilterDateStart = (e.target as HTMLInputElement).value;
            this.updateReviewTasksList();
        });

        customDateEndInput.addEventListener('change', (e) => {
            this.tasksFilterDateEnd = (e.target as HTMLInputElement).value;
            this.updateReviewTasksList();
        });

        // toggles rendered before filterBar

        const captureContainer = container.createEl('div', { attr: { style: `flex-shrink: 0; display: ${this.showCaptureInTasks ? 'block' : 'none'};` } });
        this.renderCaptureMode(captureContainer, false, true);

        this.reviewTasksContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 5px;' } });
        this.updateReviewTasksList();
    }

    renderReviewThoughtsMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { 
            attr: { style: `flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;` } 
        });
        
        let captureContainer: HTMLElement;

        // Toggle Group (History + Capture)
        let filterBarEl: HTMLElement | null = null;
        const renderToggles = (parent: HTMLElement) => {
            const toggleGroup = parent.createEl('div', { attr: { style: `\ display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: flex-start; width: 100%;` } });

            // Toggle Filter
            const filterToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            filterToggleContainer.createSpan({ text: 'Filter' });
            const filterToggleLabel = filterToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const filterCbTh = filterToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            filterCbTh.checked = this.showThoughtsFilter;
            const filterSliderTh = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: \; transition: .3s; border-radius: 16px;` } });
            const filterKnobTh = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: \;` } });
            filterCbTh.addEventListener('change', (e) => {
                this.showThoughtsFilter = (e.target as HTMLInputElement).checked;
                filterSliderTh.style.backgroundColor = this.showThoughtsFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                filterKnobTh.style.transform = this.showThoughtsFilter ? 'translateX(14px)' : 'translateX(0)';
                if (filterBarEl) filterBarEl.style.display = this.showThoughtsFilter ? 'flex' : 'none';
            });


            // Toggle History
            const historyToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            historyToggleContainer.createSpan({ text: 'History' });
            
            const historyToggleLabel = historyToggleContainer.createEl('label', { 
                attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } 
            });
            const historyCb = historyToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            historyCb.checked = this.showPreviousThoughts;
            const historySlider = historyToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showPreviousThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } 
            });
            const historyKnob = historyToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showPreviousThoughts ? 'translateX(14px)' : 'translateX(0)'};` } 
            });

            historyCb.addEventListener('change', (e) => {
                this.showPreviousThoughts = (e.target as HTMLInputElement).checked;
                historySlider.style.backgroundColor = this.showPreviousThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                historyKnob.style.transform = this.showPreviousThoughts ? 'translateX(14px)' : 'translateX(0)';
                this.updateReviewThoughtsList();
            });

            // Toggle Capture
            const captureToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            captureToggleContainer.createSpan({ text: 'Capture' });
            
            const captureToggleLabel = captureToggleContainer.createEl('label', { 
                attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } 
            });
            const captureCb = captureToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            captureCb.checked = this.showCaptureInThoughts;
            const captureSlider = captureToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showCaptureInThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } 
            });
            const captureKnob = captureToggleLabel.createEl('span', { 
                attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showCaptureInThoughts ? 'translateX(14px)' : 'translateX(0)'};` } 
            });

            captureCb.addEventListener('change', (e) => {
                this.showCaptureInThoughts = (e.target as HTMLInputElement).checked;
                captureSlider.style.backgroundColor = this.showCaptureInThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                captureKnob.style.transform = this.showCaptureInThoughts ? 'translateX(14px)' : 'translateX(0)';
                if (captureContainer) captureContainer.style.display = this.showCaptureInThoughts ? 'block' : 'none';
            });
        };

        renderToggles(headerSection);

        const filterBar = headerSection.createEl('div', { attr: { style: 'display: none; flex-wrap: wrap; gap: 10px; align-items: center;' } });
        filterBarEl = filterBar;
        
        const contextPillsTh = filterBar.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; align-items: center;' } });
        const renderThoughtContextPills = () => {
            contextPillsTh.empty();
            this.plugin.settings.contexts.forEach(ctx => {
                const active = this.thoughtsFilterContext.includes(ctx);
                const pill = contextPillsTh.createEl('span', {
                    text: `#${ctx}`,
                    attr: { style: `cursor: pointer; font-size: 0.8em; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--interactive-accent); background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'}; transition: 0.15s;` }
                });
                pill.addEventListener('click', () => {
                    if (active) this.thoughtsFilterContext = this.thoughtsFilterContext.filter(c => c !== ctx);
                    else this.thoughtsFilterContext = [...this.thoughtsFilterContext, ctx];
                    renderThoughtContextPills();
                    this.updateReviewThoughtsList();
                });
            });
        };
        renderThoughtContextPills();

        const dateContainer= filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
        const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
        [['all', 'All Dates'], ['today', 'Today'], ['this-week', 'This Week'], ['custom', 'Custom Date']].forEach(([val, label]) => {
            const opt = dateSel.createEl('option', { value: val, text: label });
            if (this.thoughtsFilterDate === val) opt.selected = true;
        });

        const customDateContainer = dateContainer.createEl('div', { 
            attr: { style: `display: ${this.thoughtsFilterDate === 'custom' ? 'flex' : 'none'}; gap: 5px; align-items: center; flex-wrap: wrap;` } 
        });

        const customDateStartInput = customDateContainer.createEl('input', { 
            type: 'date', 
            attr: { style: `font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;` } 
        });
        if (this.thoughtsFilterDateStart) customDateStartInput.value = this.thoughtsFilterDateStart;

        customDateContainer.createSpan({ text: 'to', attr: { style: 'font-size: 0.85em; color: var(--text-muted); padding: 0 2px;' } });

        const customDateEndInput = customDateContainer.createEl('input', { 
            type: 'date', 
            attr: { style: `font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;` } 
        });
        if (this.thoughtsFilterDateEnd) customDateEndInput.value = this.thoughtsFilterDateEnd;

        dateSel.addEventListener('change', (e) => { 
            const val = (e.target as HTMLSelectElement).value;
            this.thoughtsFilterDate = val;
            if (val === 'custom') {
                customDateContainer.style.display = 'flex';
                // @ts-ignore
                this.thoughtsFilterDateStart = customDateStartInput.value || moment().format('YYYY-MM-DD');
                if (!customDateStartInput.value) customDateStartInput.value = this.thoughtsFilterDateStart;
                // @ts-ignore
                this.thoughtsFilterDateEnd = customDateEndInput.value || moment().format('YYYY-MM-DD');
                if (!customDateEndInput.value) customDateEndInput.value = this.thoughtsFilterDateEnd;
            } else {
                customDateContainer.style.display = 'none';
            }
            this.updateReviewThoughtsList(); 
        });

        customDateStartInput.addEventListener('change', (e) => {
            this.thoughtsFilterDateStart = (e.target as HTMLInputElement).value;
            this.updateReviewThoughtsList();
        });

        customDateEndInput.addEventListener('change', (e) => {
            this.thoughtsFilterDateEnd = (e.target as HTMLInputElement).value;
            this.updateReviewThoughtsList();
        });

        // toggles rendered before filterBar

        captureContainer = container.createEl('div', { attr: { style: `flex-shrink: 0; display: ${this.showCaptureInThoughts ? 'block' : 'none'};` } });
        this.renderCaptureMode(captureContainer, true);

        this.reviewThoughtsContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 5px;' } });
        this.updateReviewThoughtsList();
    }

    async updateReviewTasksList() {
        if (!this.reviewTasksContainer) return;
        this.reviewTasksContainer.empty();
        
        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = this.plugin.settings.tasksFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;
        
        if (!file) {
            this.reviewTasksContainer.createEl('p', { text: 'No tasks found.', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        try {
            const content = await vault.read(file);
            const lines = content.split('\n');
            const todayMoment = moment().startOf('day');
            const startOfWeek = moment().startOf('week');
            const endOfWeek = moment().endOf('week');

            interface TaskLine {
                line: string;
                index: number;
                modTimestamp: number;
                isDone: boolean;
                dateRaw: string;
                context: string;
            }

            const taskLines: TaskLine[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('|') && !line.includes('---') && !line.includes('| Date |') && !line.includes('| Status |')) {
                    const parts = line.split('|');
                    if (parts.length < 5) continue;

                    const statusPart = parts[1].trim();
                    const isDone = statusPart.includes('x') || statusPart.includes('X');
                    
                    if (this.tasksFilterStatus === 'pending' && isDone) continue;
                    if (this.tasksFilterStatus === 'completed' && !isDone) continue;

                    const captureDateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                    if (!this.showPreviousTasks && captureDateRaw) {
                        const capDate = moment(captureDateRaw, ['YYYY-MM-DD', this.plugin.settings.dateFormat], true);
                        if (capDate.isValid() && !capDate.isSame(todayMoment, 'day')) continue;
                    }

                    // Determine Date Column: Index 6 (Due Date) if 8-column table, else Index 4 (Due Date) or Index 2 (Capture Date)
                    let dateRaw = '';
                    let modDateStr = '';
                    let modTimeStr = '';

                    if (parts.length >= 9) { // 8-column schema
                        modDateStr = parts[4].trim().replace(/[\[\]]/g, '');
                        modTimeStr = parts[5].trim();
                        dateRaw = parts[6]?.trim().replace(/[\[\]]/g, '');
                        if (!dateRaw) dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                    } else if (parts.length >= 7) { // 6-column legacy
                        dateRaw = parts[4]?.trim().replace(/[\[\]]/g, '');
                        if (!dateRaw) dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                        modDateStr = parts[2].trim().replace(/[\[\]]/g, '');
                        modTimeStr = parts[3].trim();
                    } else { // 4-column extreme legacy
                        dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                        modDateStr = parts[2].trim().replace(/[\[\]]/g, '');
                        modTimeStr = parts[3].trim();
                    }

                    if (this.tasksFilterDate !== 'all') {
                        if (!dateRaw) continue;
                        // @ts-ignore
                        let taskDate = moment(dateRaw, ['YYYY-MM-DD', this.plugin.settings.dateFormat], true);
                        
                        if (!taskDate.isValid()) continue;
                        
                        if (this.tasksFilterDate === 'today') {
                            if (!taskDate.isSame(todayMoment, 'day')) continue;
                        } else if (this.tasksFilterDate === 'this-week') {
                            if (!taskDate.isBetween(startOfWeek, endOfWeek, 'day', '[]')) continue;
                        } else if (this.tasksFilterDate === 'next-week') {
                            const startOfNextWeek = moment().add(1, 'week').startOf('week');
                            const endOfNextWeek = moment().add(1, 'week').endOf('week');
                            if (!taskDate.isBetween(startOfNextWeek, endOfNextWeek, 'day', '[]')) continue;
                        } else if (this.tasksFilterDate === 'overdue') {
                            if (isDone || !taskDate.isBefore(todayMoment, 'day')) continue;
                        } else if (this.tasksFilterDate === 'custom') {
                            const startMoment = moment(this.tasksFilterDateStart, 'YYYY-MM-DD').startOf('day');
                            const endMoment = moment(this.tasksFilterDateEnd, 'YYYY-MM-DD').endOf('day');
                            if (!taskDate.isBetween(startMoment, endMoment, 'day', '[]')) continue;
                        }
                    }

                    const contextPart = parts[parts.length - 2]?.trim() || '';
                    if (this.tasksFilterContext.length > 0 && !this.tasksFilterContext.some(ctx => contextPart.includes(`#${ctx}`))) continue;

                    // Calculate modTimestamp for sorting
                    const m = moment(`${modDateStr} ${modTimeStr}`, ['YYYY-MM-DD HH:mm', `${this.plugin.settings.dateFormat} ${this.plugin.settings.timeFormat}`]);
                    const modTimestamp = m.isValid() ? m.valueOf() : 0;

                    taskLines.push({ line, index: i, modTimestamp, isDone, dateRaw, context: contextPart });
                }
            }

            // Sort by modTimestamp descending
            taskLines.sort((a, b) => b.modTimestamp - a.modTimestamp);

            let count = 0;
            for (const tl of taskLines) {
                await this.renderTaskRow(tl.line, tl.index, this.reviewTasksContainer, file.path, true);
                count++;
            }

            if (count === 0) this.reviewTasksContainer.createEl('p', { text: 'No tasks matching filters.', attr: { style: 'color: var(--text-muted);' } });
        } catch (error) {
            this.reviewTasksContainer.createEl('p', { text: 'Error loading tasks.', attr: { style: 'color: var(--text-error);' } });
        }
    }

    async updateReviewThoughtsList() {
        if (!this.reviewThoughtsContainer) return;
        this.reviewThoughtsContainer.empty();
        
        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = this.plugin.settings.captureFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;
        
        if (!file) {
            this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts found.', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        try {
            const content = await vault.read(file);
            const lines = content.split('\n');
            const today = moment().format('YYYY-MM-DD');
            const startOfWeek = moment().startOf('week');
            const endOfWeek = moment().endOf('week');

            const allEntries: ThoughtEntry[] = [];
            const idMap: Map<string, ThoughtEntry> = new Map();

            // First pass: Parse all entries
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('|') && !line.includes('---') && !line.includes('| Date |') && !line.includes('| ID |')) {
                    const parts = line.split('|');
                    if (parts.length < 5) continue;

                    let id = '', parentId = '', dateStr = '', timeStr = '', modDateStr = '', modTimeStr = '', text = '', context = '';
                    
                    if (parts.length >= 9) { // New 8-column schema: | ID | Parent ID | Date | Time | Modified Date | Modified Time | Thought | Context |
                        id = parts[1].trim();
                        parentId = parts[2].trim();
                        dateStr = parts[3].trim();
                        timeStr = parts[4].trim();
                        modDateStr = parts[5].trim();
                        modTimeStr = parts[6].trim();
                        text = parts[7].trim();
                        context = parts[8].trim();
                    } else if (parts.length >= 7) { // Old 6-column schema
                        id = parts[1].trim();
                        parentId = parts[2].trim();
                        dateStr = parts[3].trim();
                        timeStr = parts[4].trim();
                        modDateStr = parts[3].trim(); // default to capture date
                        modTimeStr = parts[4].trim();
                        text = parts[5].trim();
                        context = parts[6].trim();
                    } else { // Legacy 4-column schema: | Date | Time | Thought | Context |
                        dateStr = parts[1].trim();
                        timeStr = parts[2].trim();
                        modDateStr = parts[1].trim();
                        modTimeStr = parts[2].trim();
                        text = parts[3].trim();
                        context = parts[4].trim();
                        // Generate a stable ID for legacy rows
                        id = `legacy-${dateStr}-${timeStr}-${text.substring(0, 10)}`;
                    }
                    const m = moment(`${modDateStr.replace(/[\[\]]/g, '')} ${modTimeStr}`, ['YYYY-MM-DD HH:mm', `${this.plugin.settings.dateFormat} ${this.plugin.settings.timeFormat}`]);
                    const modTimestamp = m.isValid() ? m.valueOf() : 0;

                    const entry: ThoughtEntry = { 
                        id, parentId, date: dateStr, time: timeStr, 
                        modifiedDate: modDateStr, modifiedTime: modTimeStr,
                        text, context, lineIndex: i, children: [],
                        lastThreadUpdate: modTimestamp
                    };
                    allEntries.push(entry);
                    if (id) idMap.set(id, entry);
                }
            }

            // Second pass: Build the tree
            const roots: ThoughtEntry[] = [];
            for (const entry of allEntries) {
                if (entry.parentId && idMap.has(entry.parentId)) {
                    idMap.get(entry.parentId)?.children.push(entry);
                } else {
                    roots.push(entry);
                }
            }

            // Third pass: Calculate thread-wide latest update
            const calculateThreadUpdate = (entry: ThoughtEntry): number => {
                let latest = entry.lastThreadUpdate || 0;
                for (const child of entry.children) {
                    const childLatest = calculateThreadUpdate(child);
                    if (childLatest > latest) latest = childLatest;
                }
                entry.lastThreadUpdate = latest;
                return latest;
            };

            for (const root of roots) {
                calculateThreadUpdate(root);
            }

            // Sort root entries by their thread-wide latest update descending
            roots.sort((a, b) => (b.lastThreadUpdate || 0) - (a.lastThreadUpdate || 0));

            // On first load, collapse all threads that have replies
            if (!this.collapsedThreadsSeeded) {
                const seedCollapsed = (entry: ThoughtEntry) => {
                    if (entry.children.length > 0) {
                        this.collapsedThreads.add(entry.id);
                        for (const child of entry.children) seedCollapsed(child);
                    }
                };
                for (const root of roots) seedCollapsed(root);
                this.collapsedThreadsSeeded = true;
            }

            const timelineContainer = this.reviewThoughtsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
            let count = 0;

            const renderRecursive = async (entry: ThoughtEntry, level: number) => {
                const dateRaw = entry.date.replace(/\[\[|\]\]/g, ''); 
                
                // Filtering only applies to root entries in this implementation for simplicity
                if (level === 0) {
                    if (!this.showPreviousThoughts && dateRaw) {
                        const thoughtDate = moment(dateRaw, this.plugin.settings.dateFormat);
                        const todayMoment = moment().startOf('day');
                        if (thoughtDate.isValid() && !thoughtDate.isSame(todayMoment, 'day')) return;
                    }

                    if (this.thoughtsFilterContext.length > 0 && !this.thoughtsFilterContext.some(ctx => entry.context.includes(`#${ctx}`))) return;

                    if (this.thoughtsFilterDate !== 'all') {
                        const thoughtDate = moment(dateRaw, this.plugin.settings.dateFormat);
                        if (this.thoughtsFilterDate === 'today' && dateRaw !== today) return;
                        if (this.thoughtsFilterDate === 'this-week' && !thoughtDate.isBetween(startOfWeek, endOfWeek, 'day', '[]')) return;
                        if (this.thoughtsFilterDate === 'custom') {
                            const startMoment = moment(this.thoughtsFilterDateStart, 'YYYY-MM-DD').startOf('day');
                            const endMoment = moment(this.thoughtsFilterDateEnd, 'YYYY-MM-DD').endOf('day');
                            if (!thoughtDate.isBetween(startMoment, endMoment, 'day', '[]')) return;
                        }
                    }
                }

                await this.renderThoughtRow(entry, timelineContainer, file.path, level);
                count++;

                if (entry.children.length > 0 && !this.collapsedThreads.has(entry.id)) {
                    // Sort children by modification time ascending (oldest first in thread) or descending?
                    // Usually threads are chronological. Let's keep capture order for children.
                    for (const child of entry.children) {
                        await renderRecursive(child, level + 1);
                    }
                }
            };

            for (const root of roots) {
                await renderRecursive(root, 0);
            }

            if (count === 0) {
                this.reviewThoughtsContainer.empty();
                this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts matching filters.', attr: { style: 'color: var(--text-muted);' } });
            }
        } catch (error) {
            console.error(error);
            this.reviewThoughtsContainer.createEl('p', { text: 'Error loading thoughts.', attr: { style: 'color: var(--text-error);' } });
        }
    }

    async handleFiles(files: FileList) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file || file.size === 0) continue;
            const isImage = file.type.startsWith('image/');
            const hasValidName = file.name && file.name !== 'image.png' && file.name.trim().length > 0;
            if (isImage || hasValidName) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const extension = file.name && file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png');
                    const baseName = (file.name && file.name.includes('.')) ? file.name.substring(0, file.name.lastIndexOf('.')) : `Pasted image ${moment().format('YYYYMMDDHHmmss')}`;
                    const fileName = `${baseName}.${extension}`;
                    const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(fileName);
                    const newFile = await this.plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
                    const isImgExt = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(extension?.toLowerCase() || '');
                    const markdownLink = isImgExt ? `![[${newFile.name}]]` : `[[${newFile.name}]]`;
                    const textArea = this.containerEl.querySelector('textarea') as HTMLTextAreaElement;
                    if (textArea) {
                        const startPos = textArea.selectionStart;
                        const endPos = textArea.selectionEnd;
                        textArea.value = textArea.value.substring(0, startPos) + markdownLink + textArea.value.substring(endPos);
                        this.content = textArea.value;
                        textArea.selectionStart = textArea.selectionEnd = startPos + markdownLink.length;
                        new Notice(`Attached ${newFile.name}`);
                    }
                } catch (err) { new Notice('Failed to save attachment.'); }
            }
        }
    }

    async updateLineInFile(isTask: boolean, lineIndex: number, newText: string | null) {
        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = isTask ? this.plugin.settings.tasksFilePath.trim() : this.plugin.settings.captureFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;
        if (!file) return;
        try {
            const content = await vault.read(file);
            const lines = content.split('\n');
            if (lineIndex >= 0 && lineIndex < lines.length) {
                if (newText === null) {
                    lines.splice(lineIndex, 1);
                    await vault.modify(file, lines.join('\n'));
                    new Notice('Deleted successfully');
                } else {
                    // Update Modification Time in the row itself
                    const parts = newText.split('|');
                    // @ts-ignore
                    const dateCol = ` [[${moment().format(this.plugin.settings.dateFormat)}]] `;
                    // @ts-ignore
                    const timeCol = ` ${moment().format(this.plugin.settings.timeFormat)} `;
                    
                    let parentId = '';
                    if (isTask) {
                        if (parts.length >= 9) { // 8-column schema
                            parts[4] = dateCol;
                            parts[5] = timeCol;
                        }
                    } else {
                        if (parts.length >= 9) { // 8-column schema
                            parts[5] = dateCol;
                            parts[6] = timeCol;
                            parentId = parts[2].trim();
                        }
                    }
                    lines[lineIndex] = parts.join('|');

                    // Bubble up modification time to parents if it's a thought
                    if (!isTask && parentId) {
                        let currentParentToFind = parentId;
                        while (currentParentToFind) {
                            let found = false;
                            for (let i = 2; i < lines.length; i++) {
                                const rowParts = lines[i].split('|');
                                if (rowParts.length >= 2 && rowParts[1].trim() === currentParentToFind) {
                                    rowParts[5] = dateCol;
                                    rowParts[6] = timeCol;
                                    lines[i] = rowParts.join('|');
                                    currentParentToFind = rowParts[2].trim(); // Move to grandparent
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) break;
                        }
                    }

                    await vault.modify(file, lines.join('\n'));
                    new Notice('Updated successfully');
                }
            }
        } catch (error) { new Notice('Error updating file.'); }
    }

    async updatePreview() {
        if (this.activeTab === 'review-tasks') {
            await this.updateReviewTasksList();
        } else if (this.activeTab === 'review-thoughts') {
            await this.updateReviewThoughtsList();
        }
    }

    async renderTaskRow(line: string, lineIndex: number, container: HTMLElement, filePath: string, isReview: boolean = false) {
        const el = container.createEl('div', {
            attr: { style: 'margin-bottom: 8px; padding-bottom: 8px; display: flex; align-items: flex-start;' }
        });

        const parts = line.split('|');
        const isLegacy = parts.length === 6; 
        
        const statusPart = parts[1].trim();
        const isDone = statusPart.includes('x') || statusPart.includes('X');

        // Toggle Switch Container
        const toggleContainer = el.createEl('label', { 
            attr: { style: 'position: relative; display: inline-block; width: 36px; height: 20px; margin-right: 12px; margin-top: 2px; flex-shrink: 0; cursor: pointer;' } 
        });
        
        const cb = toggleContainer.createEl('input', { 
            type: 'checkbox', 
            attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } 
        });
        cb.checked = isDone;

        const slider = toggleContainer.createEl('span', { 
            attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 20px;` } 
        });
        
        const knob = toggleContainer.createEl('span', { 
            attr: { style: `position: absolute; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${isDone ? 'translateX(16px)' : 'translateX(0)'};` } 
        });

        cb.addEventListener('change', async (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            slider.style.backgroundColor = isChecked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
            knob.style.transform = isChecked ? 'translateX(16px)' : 'translateX(0)';
            parts[1] = isChecked ? ' [x] ' : ' [ ] ';
            await this.updateLineInFile(true, lineIndex, parts.join('|'));
            if (isReview) await this.updateReviewTasksList();
        });

        let textToRender = '';
        let contentIndex = -1;
        let dueDateRaw = '';
        let contextStr = '';

        if (parts.length >= 9) { // 8-column schema
            dueDateRaw = parts[6].trim().replace(/[\[\]]/g, '');
            textToRender = parts[7]?.trim() || '';
            contentIndex = 7;
            contextStr = (parts[8] || '').trim();
        } else if (parts.length >= 7) { // 6-column schema
            dueDateRaw = parts.length >= 8 ? parts[4].trim().replace(/[\[\]]/g, '') : '';
            textToRender = parts[5]?.trim() || '';
            contentIndex = 5;
            contextStr = (parts[6] || '').trim();
        } else {
            textToRender = parts[4]?.trim() || '';
            contentIndex = 4;
            contextStr = (parts[5] || '').trim();
        }

        const contentDiv = el.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });

        // Main Content Row (Text + Actions)
        const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 4px;' } });

        const renderTarget = mainContentRow.createEl('div', { cls: 'mina-card', attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word; flex-grow: 1;' } });
        await MarkdownRenderer.render(this.plugin.app, textToRender, renderTarget, filePath, this);
        
        // Remove default margins from the paragraph generated by MarkdownRenderer
        const firstP = renderTarget.querySelector('p');
        if (firstP) {
            firstP.style.marginTop = '0';
            firstP.style.marginBottom = '0';
        }

        const actionsDiv = mainContentRow.createEl('div', { attr: { style: 'display: flex; gap: 8px; align-items: center; flex-shrink: 0; margin-top: 2px;' } });
        const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.85em; opacity: 0.7; transition: opacity 0.2s;' } });
                const deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.85em; opacity: 0.7; transition: opacity 0.2s;' } });
        
        editBtn.addEventListener('mouseenter', () => editBtn.style.opacity = '1');
        editBtn.addEventListener('mouseleave', () => editBtn.style.opacity = '0.7');
        deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.opacity = '1');
        deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.opacity = '0.7');

        deleteBtn.addEventListener('click', async () => {
            const modal = new ConfirmModal(this.plugin.app, 'Delete this task?', async () => {
                await this.updateLineInFile(true, lineIndex, null);
                if (isReview) await this.updateReviewTasksList();
                else await this.updatePreview();
            });
            modal.open();
        });

        // Footer: Due Date & Context (Lower Left) + Capture Date (Lower Right)
        const footerDiv = contentDiv.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 2px; flex-wrap: wrap; gap: 4px;' } });

        const lowerLeftContainer = footerDiv.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px; font-size: 0.75em; color: var(--text-muted); flex-wrap: wrap;' } });
        
        if (parts.length >= 8) {
            const dueDateContainer = lowerLeftContainer.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 4px;' } });
            dueDateContainer.createSpan({ text: '🗓️ Due:' });
            const dateInput = dueDateContainer.createEl('input', { 
                type: 'date', 
                attr: { style: 'font-size: 1em; padding: 0; background: transparent; border: none; color: var(--text-normal); cursor: pointer; outline: none;' } 
            });
            dateInput.value = dueDateRaw;
            dateInput.addEventListener('change', async () => {
                const newVal = dateInput.value;
                parts[4] = newVal ? ` [[${newVal}]] ` : ' ';
                await this.updateLineInFile(true, lineIndex, parts.join('|'));
                if (isReview) await this.updateReviewTasksList();
            });
        }

        if (contextStr) {
            lowerLeftContainer.createSpan({ 
                text: contextStr, 
                attr: { style: 'color: var(--text-accent); font-weight: 500; background-color: var(--background-secondary-alt); padding: 2px 6px; border-radius: 4px;' } 
            });
        }

        const captureDateContainer = footerDiv.createEl('div', { attr: { style: 'font-size: 0.65em; color: var(--text-muted); opacity: 0.7;' } });
        captureDateContainer.createSpan({ text: `${parts[2].trim()} ${parts[3].trim()}` });

        const startEdit = () => {
            const initialContext = (parts.length >= 7 ? parts[6] : parts[5])?.trim() || '';
            const initialDueDate = parts.length >= 8 ? parts[4].trim().replace(/[\[\]]/g, '') : null;
            
            const modal = new EditEntryModal(
                this.plugin.app,
                this.plugin,
                textToRender,
                initialContext,
                initialDueDate,
                true,
                async (newText: string, newContext: string, newDueDate: string | null) => {
                    let changed = false;

                    if (newText !== textToRender) {
                        parts[contentIndex] = ` ${newText} `;
                        changed = true;
                    }

                    if (parts.length >= 8 && newDueDate !== initialDueDate) {
                        parts[4] = newDueDate ? ` [[${newDueDate}]] ` : ' ';
                        changed = true;
                    }

                    const ctxIndex = parts.length >= 7 ? 6 : 5;
                    if (newContext !== initialContext) {
                        parts[ctxIndex] = ` ${newContext} `;
                        changed = true;
                    }

                    if (changed) {
                        await this.updateLineInFile(true, lineIndex, parts.join('|'));
                        await this.updatePreview();
                    }
                }
            );
            modal.open();
        };
        renderTarget.addEventListener('dblclick', startEdit);
        editBtn.addEventListener('click', startEdit);
    }

    async renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level: number = 0) {
        const indentStep = Platform.isMobile ? 12 : 24;
        const itemEl = container.createEl('div', {
            attr: { style: `margin-bottom: 3px; padding-bottom: 3px; display: flex; align-items: flex-start; ${level > 0 ? `margin-left: ${level * indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 6px;` : ''}` }
        });

        // Icon Section (Collapse + Thinking Icon)
        const iconSection = itemEl.createEl('div', { 
            attr: { style: 'width: 28px; margin-right: 6px; margin-top: 2px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2px;' } 
        });

        if (entry.children.length > 0) {
            const isCollapsed = this.collapsedThreads.has(entry.id);
            const collapseBtn = iconSection.createEl('div', { 
                text: isCollapsed ? '▶' : '▼', 
                attr: { style: 'cursor: pointer; font-size: 0.7em; opacity: 0.5; transition: 0.2s;' } 
            });
            collapseBtn.addEventListener('click', () => {
                if (isCollapsed) this.collapsedThreads.delete(entry.id);
                else this.collapsedThreads.add(entry.id);
                this.updateReviewThoughtsList();
            });
        }

        if (level === 0) {
            const iconContainer = iconSection.createEl('div', { attr: { style: 'width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0;' } });
            const img = iconContainer.createEl('img', { attr: { style: 'width: 100%; height: 100%; display: block;' } });
            img.src = `data:image/svg+xml;base64,${btoa(WOLF_SVG)}`;
        }

        if (entry.children.length > 0) {
            iconSection.createEl('div', { 
                text: `${entry.children.length}`, 
                attr: { style: 'font-size: 0.65em; color: var(--text-accent); font-weight: bold; background: var(--background-secondary-alt); padding: 1px 4px; border-radius: 4px; margin-top: 2px;' } 
            });
        }

        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });

        // Main Content Row (full-width card, actions overlaid inside on hover)
        const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; margin-bottom: 0; position: relative;' } });

        const cardWrapper = mainContentRow.createEl('div', { attr: { style: 'position: relative; flex-grow: 1; min-width: 0;' } });
        const renderTarget = cardWrapper.createEl('div', { cls: 'mina-card', attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word;' } });
        renderTarget.createEl('span', {
            text: `${entry.date.replace(/[\[\]]/g, '')} ${entry.time}`,
            attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.7; margin-left: 8px;' }
        });
        const textWithContext = entry.text + (entry.context ? ' ' + entry.context : '');
        await MarkdownRenderer.render(this.plugin.app, textWithContext, renderTarget, filePath, this);

        // Remove default margins from the paragraph generated by MarkdownRenderer
        const firstP = renderTarget.querySelector('p');
        if (firstP) {
            firstP.style.marginTop = '0';
            firstP.style.marginBottom = '0';
        }

        const actionsDiv = cardWrapper.createEl('div', { attr: { style: 'position: absolute; top: 2px; right: 4px; display: flex; gap: 6px; align-items: center; opacity: 0; transition: opacity 0.15s; background: var(--background-secondary); border-radius: 4px; padding: 1px 4px;' } });
        cardWrapper.addEventListener('mouseenter', () => actionsDiv.style.opacity = '1');
        cardWrapper.addEventListener('mouseleave', () => actionsDiv.style.opacity = '0');

        const replyBtn = actionsDiv.createSpan({ text: '↩️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        
        let deleteBtn: HTMLElement | null = null;
        if (entry.children.length === 0) {
            deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
            deleteBtn.addEventListener('click', async () => {
                const modal = new ConfirmModal(this.plugin.app, 'Delete this thought?', async () => {
                    await this.updateLineInFile(false, entry.lineIndex, null);
                    await this.updatePreview();
                });
                modal.open();
            });
        }

        replyBtn.addEventListener('click', () => {
            this.replyToId = entry.id;
            this.replyToText = entry.text.length > 50 ? entry.text.substring(0, 50) + '...' : entry.text;
            this.showCaptureInThoughts = true;
            this.renderView();
            // Focus textarea
            setTimeout(() => {
                const ta = this.containerEl.querySelector('textarea');
                if (ta) ta.focus();
            }, 100);
        });

        // Footer (kept for future use)
        const footerDiv = contentDiv.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 2px;' } });
        const lowerLeftContainer = footerDiv.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px; font-size: 0.75em; color: var(--text-muted);' } });

        const startEdit = () => {
            const modal = new EditEntryModal(
                this.plugin.app,
                this.plugin,
                entry.text,
                entry.context,
                null,
                false,
                async (newText: string, newContext: string, _: string | null) => {
                    const { vault } = this.plugin.app;
                    const folderPath = this.plugin.settings.captureFolder.trim();
                    const fileName = this.plugin.settings.captureFilePath.trim();
                    const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
                    const file = vault.getAbstractFileByPath(fullPath) as TFile;
                    if (!file) return;

                    const content = await vault.read(file);
                    const lines = content.split('\n');
                    const parts = lines[entry.lineIndex].split('|');
                    
                    let changed = false;
                    const textIndex = parts.length >= 8 ? 5 : 3;
                    const ctxIndex = parts.length >= 8 ? 6 : 4;

                    if (newText !== entry.text.replace(/\n/g, '<br>')) { parts[textIndex] = ` ${newText} `; changed = true; }
                    if (newContext !== entry.context) { parts[ctxIndex] = ` ${newContext} `; changed = true; }
                    if (changed) {
                        await this.updateLineInFile(false, entry.lineIndex, parts.join('|'));
                        await this.updatePreview();
                    }
                }
            );
            modal.open();
        };
        renderTarget.addEventListener('dblclick', startEdit);
        editBtn.addEventListener('click', startEdit);
    }
}

class MinaSettingTab extends PluginSettingTab {
	plugin: MinaPlugin;
	constructor(app: App, plugin: MinaPlugin) { super(app, plugin); this.plugin = plugin; }
	display(): void {
		const {containerEl} = this;
		containerEl.empty();
        new Setting(containerEl).setName('Capture Folder').setDesc('Folder for capture files.').addText(text => text.setPlaceholder('Enter folder path...').setValue(this.plugin.settings.captureFolder).onChange(async (value) => { this.plugin.settings.captureFolder = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Thoughts File Name').setDesc('File for thoughts.').addText(text => text.setPlaceholder('Thoughts.md').setValue(this.plugin.settings.captureFilePath).onChange(async (value) => { this.plugin.settings.captureFilePath = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Tasks File Name').setDesc('File for tasks.').addText(text => text.setPlaceholder('Tasks.md').setValue(this.plugin.settings.tasksFilePath).onChange(async (value) => { this.plugin.settings.tasksFilePath = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Date format').addText(text => text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat).onChange(async (value) => { this.plugin.settings.dateFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Time format').addText(text => text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat).onChange(async (value) => { this.plugin.settings.timeFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Gemini API Key').setDesc('API key for the MINA AI chat tab (Google Gemini).').addText(text => { text.setPlaceholder('AIza...').setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => { this.plugin.settings.geminiApiKey = value.trim(); await this.plugin.saveSettings(); }); text.inputEl.type = 'password'; });
        new Setting(containerEl).setName('Gemini Model').setDesc('Model to use for the MINA AI chat.').addDropdown(drop => {
            const models: Record<string, string> = {
                // Gemini 2.5
                'gemini-2.5-pro':                    '2.5 Pro — highest reasoning & multimodal',
                'gemini-2.5-flash':                  '2.5 Flash — fast, general-purpose',
                'gemini-2.5-flash-lite':             '2.5 Flash Lite — ultra-fast, cost-efficient',
                'gemini-2.5-flash-preview':          '2.5 Flash Preview — latest preview',
                // Gemini 2.0
                'gemini-2.0-flash':                  '2.0 Flash — stable, multimodal (default)',
                'gemini-2.0-flash-lite':             '2.0 Flash Lite — budget-friendly',
                // Gemini 1.5
                'gemini-1.5-pro':                    '1.5 Pro — complex reasoning, prior flagship',
                'gemini-1.5-flash':                  '1.5 Flash — fast, previous gen',
                'gemini-1.5-flash-8b':               '1.5 Flash 8B — high-volume, lightweight',
            };
            for (const [value, label] of Object.entries(models)) {
                drop.addOption(value, label);
            }
            drop.setValue(this.plugin.settings.geminiModel || 'gemini-2.0-flash');
            drop.onChange(async (value) => { this.plugin.settings.geminiModel = value; await this.plugin.saveSettings(); });
        });
	}
}
