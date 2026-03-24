import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, ItemView, WorkspaceLeaf, MarkdownRenderer, Platform, FuzzySuggestModal, Modal } from 'obsidian';

export const VIEW_TYPE_MINA = "mina-view";

interface MinaSettings {
    captureFolder: string;
	captureFilePath: string;
    tasksFilePath: string;
	dateFormat: string;
    timeFormat: string;
    contexts: string[];
    selectedContexts: string[];
}

const DEFAULT_SETTINGS: MinaSettings = {
    captureFolder: '000 Bin',
	captureFilePath: 'mina_1.md',
    tasksFilePath: 'mina_2.md',
	dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    contexts: [], 
    selectedContexts: []
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
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            if (Platform.isMobile) {
                leaf = workspace.getRightLeaf(false);
            } else {
                leaf = workspace.getLeaf('window');
            }
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_MINA, active: true });
            }
        }
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
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

    async appendCapture(content: string, contexts: string[], isTask: boolean, dueDate?: string) {
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

        // @ts-ignore
        const dateStr = window.moment().format(this.settings.dateFormat);
        // @ts-ignore
        const timeStr = window.moment().format(this.settings.timeFormat);
        
        const dateCol = `[[${dateStr}]]`;
        const timeCol = timeStr;
        const contextsCol = contexts.map(ctx => `#${ctx}`).join(' ');
        const sanitizedContent = content.replace(/\n/g, '<br>');
        
        let newRow = '';
        let header = '';
        let separator = '';

        if (isTask) {
            const dueDateCol = dueDate ? `[[${dueDate}]]` : '';
            // Task Table Structure: | Status | Date | Time | Due Date | Task | Context |
            newRow = `| [ ] | ${dateCol} | ${timeCol} | ${dueDateCol} | ${sanitizedContent} | ${contextsCol} |`;
            header = `| Status | Date | Time | Due Date | Task | Context |`;
            separator = `| :---: | --- | --- | --- | --- | --- |`;
        } else {
            // Thought Table Structure: | Date | Time | Thought | Context |
            newRow = `| ${dateCol} | ${timeCol} | ${sanitizedContent} | ${contextsCol} |`;
            header = `| Date | Time | Thought | Context |`;
            separator = `| --- | --- | --- | --- |`;
        }

        try {
            const currentContent = await vault.read(file);
            const lines = currentContent.split('\n');
            let newContent = '';
            if (lines.length < 2 || !lines[0].includes('Date') || !lines[1].includes('---')) {
                newContent = header + '\n' + separator + '\n' + newRow + (currentContent ? '\n' + currentContent : '');
            } else {
                lines.splice(2, 0, newRow);
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
                        const baseName = (file.name && file.name.includes('.')) ? file.name.substring(0, file.name.lastIndexOf('.')) : `Pasted image ${window.moment().format('YYYYMMDDHHmmss')}`;
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

class MinaView extends ItemView {
    plugin: MinaPlugin;
    content: string;
    isTask: boolean;
    dueDate: string; // YYYY-MM-DD
    activeTab: 'capture' | 'review-tasks' | 'review-thoughts' = 'review-thoughts';
    
    // Tasks Review Filters
    tasksFilterStatus: 'all' | 'pending' | 'completed' = 'pending';
    tasksFilterContext: string = 'all';
    tasksFilterDate: string = 'today'; // 'all' | 'today' | 'this-week' | 'next-week' | 'overdue' | 'custom'
    tasksFilterDateStart: string = '';
    tasksFilterDateEnd: string = '';
    showPreviousTasks: boolean = true;

    // Thoughts Review Filters
    thoughtsFilterContext: string = 'all';
    thoughtsFilterDate: string = 'all'; // 'all' | 'today' | 'this-week' | 'custom'
    thoughtsFilterDateStart: string = '';
    thoughtsFilterDateEnd: string = '';
    showPreviousThoughts: boolean = true;
    showCaptureInThoughts: boolean = true;

    reviewTasksContainer: HTMLElement;
    reviewThoughtsContainer: HTMLElement;
    selectedContexts: string[];

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.content = '';
        this.isTask = false;
        // @ts-ignore
        this.dueDate = window.moment().format('YYYY-MM-DD');
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

        if (this.activeTab === 'review-tasks') {
            this.renderReviewTasksMode(container);
        } else {
            this.renderReviewThoughtsMode(container);
        }
    }

    renderCaptureMode(container: HTMLElement, isThoughtsOnly: boolean = false) {
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

        if (!isThoughtsOnly) {
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
        } else {
            this.isTask = false;
        }

        const submitAction = async () => {
            if (this.content.trim().length > 0) {
                await this.plugin.appendCapture(this.content.trim(), this.selectedContexts, this.isTask, this.isTask ? this.dueDate : undefined);
                this.content = ''; textArea.value = '';
                if (this.activeTab === 'review-tasks') {
                    await this.updateReviewTasksList();
                } else if (this.activeTab === 'review-thoughts') {
                    await this.updateReviewThoughtsList();
                }
            } else { new Notice('Please enter some text'); }
        };
        submitBtn.addEventListener('click', submitAction);
        textArea.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); await submitAction(); } });
    }

    renderReviewTasksMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
        
        const addBtn = headerSection.createEl('button', { 
            text: '+ Add Task', 
            attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.85em; padding: 4px 10px;' } 
        });

        addBtn.addEventListener('click', () => {
            const modal = new EditEntryModal(
                this.plugin.app,
                this.plugin,
                '', // initialText
                '', // initialContext
                // @ts-ignore
                window.moment().format('YYYY-MM-DD'), // initialDueDate (default to today)
                true, // isTask
                async (newText: string, newContexts: string, newDueDate: string | null) => {
                    const contexts = newContexts.split('#').map(c => c.trim()).filter(c => c.length > 0);
                    await this.plugin.appendCapture(newText.replace(/<br>/g, '\n'), contexts, true, newDueDate || undefined);
                    await this.updateReviewTasksList();
                },
                'Add Task',
                true // stayOpen
            );
            modal.open();
        });

        const filterBar = headerSection.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 10px; align-items: center;' } });
        
        const statusSel = filterBar.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px;' }});
        [['all', 'All Status'], ['pending', 'Pending'], ['completed', 'Completed']].forEach(([val, label]) => {
            const opt = statusSel.createEl('option', { value: val, text: label });
            if (this.tasksFilterStatus === val) opt.selected = true;
        });
        statusSel.addEventListener('change', (e) => { this.tasksFilterStatus = (e.target as HTMLSelectElement).value as any; this.updateReviewTasksList(); });

        const contextSel = filterBar.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px;' }});
        contextSel.createEl('option', { value: 'all', text: 'All Contexts' });
        this.plugin.settings.contexts.forEach(ctx => {
            const opt = contextSel.createEl('option', { value: ctx, text: `#${ctx}` });
            if (this.tasksFilterContext === ctx) opt.selected = true;
        });
        contextSel.addEventListener('change', (e) => { this.tasksFilterContext = (e.target as HTMLSelectElement).value; this.updateReviewTasksList(); });

        const dateContainer = filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
        const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px;' }});
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
                this.tasksFilterDateStart = customDateStartInput.value || window.moment().format('YYYY-MM-DD');
                if (!customDateStartInput.value) customDateStartInput.value = this.tasksFilterDateStart;
                // @ts-ignore
                this.tasksFilterDateEnd = customDateEndInput.value || window.moment().format('YYYY-MM-DD');
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

        this.reviewTasksContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 5px;' } });
        this.updateReviewTasksList();
    }

    renderReviewThoughtsMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
        
        const filterBar = headerSection.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 10px; align-items: center;' } });
        
        const contextSel = filterBar.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px;' }});
        contextSel.createEl('option', { value: 'all', text: 'All Contexts' });
        this.plugin.settings.contexts.forEach(ctx => {
            const opt = contextSel.createEl('option', { value: ctx, text: `#${ctx}` });
            if (this.thoughtsFilterContext === ctx) opt.selected = true;
        });
        contextSel.addEventListener('change', (e) => { this.thoughtsFilterContext = (e.target as HTMLSelectElement).value; this.updateReviewThoughtsList(); });

        const dateContainer = filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
        const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px;' }});
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
                this.thoughtsFilterDateStart = customDateStartInput.value || window.moment().format('YYYY-MM-DD');
                if (!customDateStartInput.value) customDateStartInput.value = this.thoughtsFilterDateStart;
                // @ts-ignore
                this.thoughtsFilterDateEnd = customDateEndInput.value || window.moment().format('YYYY-MM-DD');
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

        // Toggle Group (History + Capture)
        const toggleGroup = headerSection.createEl('div', { attr: { style: 'margin-left: auto; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;' } });

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

        const captureContainer = container.createEl('div', { attr: { style: `flex-shrink: 0; display: ${this.showCaptureInThoughts ? 'block' : 'none'};` } });
        this.renderCaptureMode(captureContainer, true);

        captureCb.addEventListener('change', (e) => {
            this.showCaptureInThoughts = (e.target as HTMLInputElement).checked;
            captureSlider.style.backgroundColor = this.showCaptureInThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
            captureKnob.style.transform = this.showCaptureInThoughts ? 'translateX(14px)' : 'translateX(0)';
            captureContainer.style.display = this.showCaptureInThoughts ? 'block' : 'none';
        });

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
            let count = 0;

            // @ts-ignore
            const todayMoment = window.moment().startOf('day');
            // @ts-ignore
            const startOfWeek = window.moment().startOf('week');
            // @ts-ignore
            const endOfWeek = window.moment().endOf('week');

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
                        // @ts-ignore
                        const capDate = window.moment(captureDateRaw, ['YYYY-MM-DD', this.plugin.settings.dateFormat], true);
                        if (capDate.isValid() && !capDate.isSame(todayMoment, 'day')) continue;
                    }

                    // Determine Date Column: Index 4 (Due Date) if 6-column table, else Index 2 (Capture Date)
                    let dateRaw = '';
                    if (parts.length >= 8) {
                        dateRaw = parts[4]?.trim().replace(/[\[\]]/g, '');
                        if (!dateRaw) dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                    } else {
                        dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                    }

                    if (this.tasksFilterDate !== 'all') {
                        if (!dateRaw) continue;
                        // @ts-ignore
                        let taskDate = window.moment(dateRaw, ['YYYY-MM-DD', this.plugin.settings.dateFormat], true);
                        
                        if (!taskDate.isValid()) continue;
                        
                        if (this.tasksFilterDate === 'today') {
                            if (!taskDate.isSame(todayMoment, 'day')) continue;
                        } else if (this.tasksFilterDate === 'this-week') {
                            if (!taskDate.isBetween(startOfWeek, endOfWeek, 'day', '[]')) continue;
                        } else if (this.tasksFilterDate === 'next-week') {
                            // @ts-ignore
                            const startOfNextWeek = window.moment().add(1, 'week').startOf('week');
                            // @ts-ignore
                            const endOfNextWeek = window.moment().add(1, 'week').endOf('week');
                            if (!taskDate.isBetween(startOfNextWeek, endOfNextWeek, 'day', '[]')) continue;
                        } else if (this.tasksFilterDate === 'overdue') {
                            // Overdue = Date is before today AND not completed
                            if (isDone || !taskDate.isBefore(todayMoment, 'day')) continue;
                        } else if (this.tasksFilterDate === 'custom') { // Custom Date Range
                            // @ts-ignore
                            const startMoment = window.moment(this.tasksFilterDateStart, 'YYYY-MM-DD').startOf('day');
                            // @ts-ignore
                            const endMoment = window.moment(this.tasksFilterDateEnd, 'YYYY-MM-DD').endOf('day');
                            if (!taskDate.isBetween(startMoment, endMoment, 'day', '[]')) continue;
                        }
                    }

                    const contextPart = parts[parts.length - 2]?.trim() || '';
                    if (this.tasksFilterContext !== 'all' && !contextPart.includes(`#${this.tasksFilterContext}`)) continue;

                    await this.renderTaskRow(line, i, this.reviewTasksContainer, file.path, true);
                    count++;
                }
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
            let count = 0;

            // @ts-ignore
            const today = window.moment().format('YYYY-MM-DD');
            // @ts-ignore
            const startOfWeek = window.moment().startOf('week');
            // @ts-ignore
            const endOfWeek = window.moment().endOf('week');

            const timelineContainer = this.reviewThoughtsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('|') && !line.includes('---') && !line.includes('| Date |')) {
                    const parts = line.split('|');
                    if (parts.length < 5) continue;
                    
                    const dateRaw = parts[1].trim().replace(/\[\[|\]\]/g, ''); 
                    
                    if (!this.showPreviousThoughts && dateRaw) {
                        // @ts-ignore
                        const thoughtDate = window.moment(dateRaw, this.plugin.settings.dateFormat);
                        // @ts-ignore
                        const todayMoment = window.moment().startOf('day');
                        if (thoughtDate.isValid() && !thoughtDate.isSame(todayMoment, 'day')) continue;
                    }

                    const contextPart = parts[4]?.trim() || '';

                    if (this.thoughtsFilterContext !== 'all' && !contextPart.includes(`#${this.thoughtsFilterContext}`)) continue;

                    if (this.thoughtsFilterDate !== 'all') {
                        // @ts-ignore
                        const thoughtDate = window.moment(dateRaw, this.plugin.settings.dateFormat);
                        if (this.thoughtsFilterDate === 'today' && dateRaw !== today) continue;
                        if (this.thoughtsFilterDate === 'this-week' && !thoughtDate.isBetween(startOfWeek, endOfWeek, 'day', '[]')) continue;
                        if (this.thoughtsFilterDate === 'custom') {
                            // @ts-ignore
                            const startMoment = window.moment(this.thoughtsFilterDateStart, 'YYYY-MM-DD').startOf('day');
                            // @ts-ignore
                            const endMoment = window.moment(this.thoughtsFilterDateEnd, 'YYYY-MM-DD').endOf('day');
                            if (!thoughtDate.isBetween(startMoment, endMoment, 'day', '[]')) continue;
                        }
                    }

                    await this.renderThoughtRow(line, i, timelineContainer, file.path);
                    count++;
                }
            }
            if (count === 0) {
                this.reviewThoughtsContainer.empty();
                this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts matching filters.', attr: { style: 'color: var(--text-muted);' } });
            }
        } catch (error) {
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
                    const baseName = (file.name && file.name.includes('.')) ? file.name.substring(0, file.name.lastIndexOf('.')) : `Pasted image ${window.moment().format('YYYYMMDDHHmmss')}`;
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
                    lines[lineIndex] = newText;
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

        if (parts.length >= 7) {
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

    async renderThoughtRow(line: string, lineIndex: number, container: HTMLElement, filePath: string) {
        const itemEl = container.createEl('div', {
            attr: { style: 'margin-bottom: 8px; padding-bottom: 8px; display: flex; align-items: flex-start;' }
        });
        const parts = line.split('|');
        const dateStr = parts[1].trim();
        const timeStr = parts[2].trim();
        const thoughtText = parts[3]?.trim() || '';
        const contextStr = parts[4]?.trim() || '';

        // Thinking Icon Container (replaces toggle)
        const iconContainer = itemEl.createEl('div', { 
            attr: { style: 'width: 36px; margin-right: 12px; margin-top: 2px; flex-shrink: 0; display: flex; justify-content: center; align-items: flex-start; font-size: 1.2em; opacity: 0.8;' } 
        });
        iconContainer.createSpan({ text: '💭' });

        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });

        // Main Content Row (Text + Actions)
        const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 4px;' } });

        const renderTarget = mainContentRow.createEl('div', { cls: 'mina-card', attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word; flex-grow: 1;' } });
        await MarkdownRenderer.render(this.plugin.app, thoughtText, renderTarget, filePath, this);

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
            const modal = new ConfirmModal(this.plugin.app, 'Delete this thought?', async () => {
                await this.updateLineInFile(false, lineIndex, null);
                await this.updatePreview();
            });
            modal.open();
        });

        // Footer: Context (Lower Left) + Capture Date (Lower Right)
        const footerDiv = contentDiv.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: 2px;' } });

        const lowerLeftContainer = footerDiv.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px; font-size: 0.75em; color: var(--text-muted);' } });

        if (contextStr) {
            lowerLeftContainer.createSpan({ 
                text: contextStr, 
                attr: { style: 'color: var(--text-accent); font-weight: 500; background-color: var(--background-secondary-alt); padding: 2px 6px; border-radius: 4px;' } 
            });
        }

        const captureDateContainer = footerDiv.createEl('div', { attr: { style: 'font-size: 0.65em; color: var(--text-muted); opacity: 0.7;' } });
        captureDateContainer.createSpan({ text: `${dateStr.replace(/[\[\]]/g, '')} ${timeStr}` });

        const startEdit = () => {
            const modal = new EditEntryModal(
                this.plugin.app,
                this.plugin,
                thoughtText,
                contextStr,
                null,
                false,
                async (newText: string, newContext: string, _: string | null) => {
                    let changed = false;
                    if (newText !== thoughtText.replace(/\n/g, '<br>')) { parts[3] = ` ${newText} `; changed = true; }
                    if (newContext !== contextStr) { parts[4] = ` ${newContext} `; changed = true; }
                    if (changed) {
                        await this.updateLineInFile(false, lineIndex, parts.join('|'));
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
	}
}