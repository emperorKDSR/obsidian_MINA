import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, ItemView, WorkspaceLeaf, MarkdownRenderer, Platform, FuzzySuggestModal, Modal, moment } from 'obsidian';

export const VIEW_TYPE_MINA = "mina-view";

const WOLF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- Background circle -->
  <circle cx="50" cy="50" r="50" fill="#1a1a1a"/>
  <!-- Blade (long, tapered, slightly angled) -->
  <polygon points="50,8 53,16 52,80 48,80 47,16" fill="#d0d8e8"/>
  <!-- Blade edge highlight -->
  <polygon points="50,8 53,16 52,80 50,80" fill="#f0f4ff" opacity="0.7"/>
  <!-- Blade fuller (groove) -->
  <rect x="49.5" y="18" width="1.5" height="58" rx="0.5" fill="#a0aabb" opacity="0.6"/>
  <!-- Tsuba (guard) — circular -->
  <ellipse cx="50" cy="82" rx="14" ry="5" fill="#c8a84b"/>
  <ellipse cx="50" cy="82" rx="11" ry="3.5" fill="#e8c86a"/>
  <!-- Tsuba detail lines -->
  <line x1="36" y1="82" x2="64" y2="82" stroke="#a07830" stroke-width="0.8"/>
  <line x1="50" y1="77" x2="50" y2="87" stroke="#a07830" stroke-width="0.8"/>
  <!-- Tsuka (handle / grip) -->
  <rect x="46" y="87" width="8" height="22" rx="3" fill="#5a2d0c"/>
  <!-- Handle wrap (ito) -->
  <line x1="46" y1="91" x2="54" y2="91" stroke="#c8a84b" stroke-width="1.2" opacity="0.8"/>
  <line x1="46" y1="95" x2="54" y2="95" stroke="#c8a84b" stroke-width="1.2" opacity="0.8"/>
  <line x1="46" y1="99" x2="54" y2="99" stroke="#c8a84b" stroke-width="1.2" opacity="0.8"/>
  <line x1="46" y1="103" x2="54" y2="103" stroke="#c8a84b" stroke-width="1.2" opacity="0.8"/>
  <!-- Kashira (pommel) -->
  <ellipse cx="50" cy="109" rx="5" ry="2.5" fill="#c8a84b"/>
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

/** Convert any locale-specific digit characters to ASCII 0-9.
 *  Covers Arabic-Indic (٠-٩), Persian (۰-۹), Devanagari (०-९),
 *  Bengali (০-৯), and Thai (๐-๙) so stored timestamps are always plain numbers
 *  regardless of the device's locale setting. */
function toAsciiDigits(s: string): string {
    return s
        .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0))
        .replace(/[\u0966-\u096F]/g, c => String(c.charCodeAt(0) - 0x0966))
        .replace(/[\u09E6-\u09EF]/g, c => String(c.charCodeAt(0) - 0x09E6))
        .replace(/[\u0E50-\u0E59]/g, c => String(c.charCodeAt(0) - 0x0E50));
}

/** True when running on an iPad (or large Android tablet).
 *  Obsidian's Platform.isMobile is true for both phones AND tablets.
 *  We distinguish tablets by their short-edge being ≥ 768 px. */
function isTablet(): boolean {
    return Platform.isMobile && Math.min(screen.width, screen.height) >= 768;
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
    geminiModel: 'gemini-2.5-flash'
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
            // Detach any existing MINA leaves
            workspace.getLeavesOfType(VIEW_TYPE_MINA).forEach(l => l.detach());

            if (isTablet()) {
                // iPad: reuse the active leaf so MINA fills the full workspace pane
                // (no new tab strip — the tab header is hidden in onOpen)
                const leaf = workspace.getLeaf(false);
                if (leaf) {
                    await leaf.setViewState({ type: VIEW_TYPE_MINA, active: true });
                    workspace.revealLeaf(leaf);
                }
            } else {
                // iPhone: open as a main content tab
                const leaf = workspace.getLeaf('tab');
                await leaf.setViewState({ type: VIEW_TYPE_MINA, active: true });
                workspace.revealLeaf(leaf);
            }
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
        // Guard against corrupted format strings (e.g. "Obsidian" ending up as timeFormat).
        // A valid time format must contain at least one hour token (H, h, or k).
        // A valid date format must contain at least one of Y, M, or D.
        if (this.settings.timeFormat && !/[Hhk]/.test(this.settings.timeFormat)) {
            this.settings.timeFormat = DEFAULT_SETTINGS.timeFormat;
        }
        if (this.settings.dateFormat && !/[YMD]/.test(this.settings.dateFormat)) {
            this.settings.dateFormat = DEFAULT_SETTINGS.dateFormat;
        }
	}

	async saveSettings() {
        if (!this.settingsInitialized) return;
		await this.saveData(this.settings);
	}

    async appendCapture(content: string, contexts: string[], isTask: boolean, dueDate?: string, parentId: string = '') {
        const { vault } = this.app;

        // Always format stored timestamps with English locale AND strip any
        // locale-specific digit glyphs so the table always contains plain ASCII.
        const fmtDate = () => toAsciiDigits(moment().locale('en').format(this.settings.dateFormat));
        const fmtTime = () => toAsciiDigits(moment().locale('en').format(this.settings.timeFormat));

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
        const dateStr = fmtDate();
        const timeStr = fmtTime();
        
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
            // iPad has much more screen real estate — cap at 75vw instead of 95vw
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

            // Auto-convert "** " at line start to a checklist item "- [ ] "
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

            // All contexts to show = union of plugin settings contexts + any on this entry not in settings
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
                    const x = tagEl.createSpan({ text: '×', attr: { style: 'font-size: 1em; line-height: 1; opacity: 0.7;' } });
                }
                tagEl.addEventListener('click', () => {
                    if (isSelected) this.initialContexts = this.initialContexts.filter(c => c !== ctx);
                    else this.initialContexts.push(ctx);
                    renderContextTags();
                });
            });

            // New context input row
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
                // Push to initialContexts synchronously BEFORE any await so that
                // if the Save button fires on the next tick (e.g. via blur→click),
                // saveChanges() already sees the new context.
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
            newCtxInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitNewCtx(); }
            });
            // Mobile: "Go"/"Done" fires blur — commit on blur if there's a value
            newCtxInput.addEventListener('blur', () => {
                if (newCtxInput.value.trim()) commitNewCtx();
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
        // Enter = new line (default); Shift+Enter = save
        textArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); saveChanges(); } });
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

class PaymentModal extends Modal {
    private file: TFile;
    private currentDueDate: string;
    private onPaid: () => void;

    constructor(app: App, file: TFile, currentDueDate: string, onPaid: () => void) {
        super(app);
        this.file = file;
        this.currentDueDate = currentDueDate;
        this.onPaid = onPaid;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.style.width = 'min(500px, 95vw)';

        // Phone: anchor to top edge (keeps content above keyboard).
        // iPad/desktop: let Obsidian center it naturally.
        if (Platform.isMobile && !isTablet()) {
            const bg = modalEl.parentElement;
            if (bg) {
                bg.style.display = 'flex';
                bg.style.alignItems = 'flex-start';
                bg.style.justifyContent = 'center';
            }
            modalEl.style.position = 'relative';
            modalEl.style.top = '0';
            modalEl.style.left = '';
            modalEl.style.transform = '';
            modalEl.style.margin = '0';
            modalEl.style.borderRadius = '0 0 12px 12px';
            modalEl.style.maxHeight = '100vh';
        }

        contentEl.empty();
        contentEl.style.padding = '16px';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        contentEl.style.gap = '12px';
        contentEl.style.overflowY = 'auto';

        // Shrink content area when virtual keyboard appears
        const setMaxHeight = () => {
            const vv = (window as any).visualViewport;
            const available = vv ? vv.height : window.innerHeight;
            contentEl.style.maxHeight = `${available - 16}px`;
        };
        setMaxHeight();
        const vv = (window as any).visualViewport;
        if (vv) vv.addEventListener('resize', setMaxHeight);
        // cleanup on close via onClose override stores ref
        (this as any)._vvCleanup = () => { if (vv) vv.removeEventListener('resize', setMaxHeight); };

        // Auto-scroll focused input into view
        const scrollFocused = (e: FocusEvent) => {
            setTimeout(() => (e.target as HTMLElement)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        };
        contentEl.addEventListener('focusin', scrollFocused);

        contentEl.createEl('h3', { text: `Pay — ${this.file.basename}`, attr: { style: 'margin: 0; font-size: 1em; color: var(--text-normal); flex-shrink: 0;' } });

        const field = (label: string) => {
            const wrap = contentEl.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
            wrap.createEl('label', { text: label, attr: { style: 'font-size: 0.82em; color: var(--text-muted); font-weight: 600;' } });
            return wrap;
        };

        // Payment date
        const dateWrap = field('Payment Date');
        const dateInput = dateWrap.createEl('input', { type: 'date', attr: { style: 'padding: 5px 8px; border-radius: 5px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.9em;' } });
        dateInput.value = moment().format('YYYY-MM-DD');

        // Combined notes + image paste area
        const notesWrap = field('Notes, reference, snippets — paste images with Ctrl+V');
        const notesArea = notesWrap.createEl('textarea', { attr: { rows: '5', placeholder: 'e.g. REF-20260325-001, paid online, notes…', style: 'padding: 6px 8px; border-radius: 5px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.9em; resize: vertical; font-family: inherit; width: 100%; box-sizing: border-box;' } });

        // Preview strip for pasted/attached images
        const pastedFiles: { name: string; buffer: ArrayBuffer }[] = [];
        const previewStrip = notesWrap.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;' } });

        const addImagePreview = (name: string, buffer: ArrayBuffer, dataUrl: string) => {
            pastedFiles.push({ name, buffer });
            const thumb = previewStrip.createEl('div', { attr: { style: 'position: relative; display: inline-block;' } });
            thumb.createEl('img', { attr: { src: dataUrl, style: 'height: 60px; border-radius: 4px; border: 1px solid var(--background-modifier-border); display: block;' } });
            const label = thumb.createEl('span', { text: name, attr: { style: 'font-size: 0.7em; color: var(--text-muted); display: block; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' } });
            const rm = thumb.createEl('span', { text: '✕', attr: { style: 'position: absolute; top: -4px; right: -4px; background: var(--background-modifier-border); border-radius: 50%; width: 14px; height: 14px; font-size: 0.65em; display: flex; align-items: center; justify-content: center; cursor: pointer; line-height: 14px; text-align: center;' } });
            rm.addEventListener('click', () => {
                const idx = pastedFiles.findIndex(f => f.name === name);
                if (idx !== -1) pastedFiles.splice(idx, 1);
                thumb.remove();
            });
        };

        // Clipboard paste handler — intercept images
        notesArea.addEventListener('paste', async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items ?? [];
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (!blob) continue;
                    const ext = item.type.split('/')[1] ?? 'png';
                    const name = `payment-${moment().format('YYYYMMDDHHmmss')}.${ext}`;
                    const buffer = await blob.arrayBuffer();
                    const dataUrl = await new Promise<string>(res => {
                        const reader = new FileReader();
                        reader.onload = () => res(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    addImagePreview(name, buffer, dataUrl);
                }
            }
        });

        // File attachment (non-image or extra files)
        const attachWrap = field('Attach file (optional)');
        const attachInput = attachWrap.createEl('input', { type: 'file', attr: { accept: '*/*', style: 'font-size: 0.85em; color: var(--text-muted);' } });
        attachInput.setAttribute('multiple', 'true');

        // Buttons
        const btnRow = contentEl.createEl('div', { attr: { style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;' } });
        const cancelBtn = btnRow.createEl('button', { text: 'Cancel', attr: { style: 'padding: 6px 16px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); cursor: pointer; font-size: 0.9em;' } });
        const saveBtn = btnRow.createEl('button', { text: 'Record Payment', attr: { style: 'padding: 6px 16px; border-radius: 6px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer; font-size: 0.9em; font-weight: 600;' } });

        cancelBtn.addEventListener('click', () => this.close());

        saveBtn.addEventListener('click', async () => {
            const payDate = dateInput.value.trim();
            if (!payDate) { new Notice('Please enter a payment date.'); return; }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';

            try {
                // Compute new next_duedate = current next_duedate + 1 month
                const dueMoment = moment(this.currentDueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true);
                const newDue = dueMoment.isValid()
                    ? dueMoment.add(1, 'month').format('YYYY-MM-DD')
                    : moment(payDate).add(1, 'month').format('YYYY-MM-DD');

                // Update frontmatter
                await this.app.fileManager.processFrontMatter(this.file, (fm: any) => {
                    fm['last_payment'] = payDate;
                    fm['next_duedate'] = newDue;
                });

                const folder = this.file.parent?.path ?? '';
                const saveAttachment = async (name: string, buffer: ArrayBuffer) => {
                    const destPath = folder ? `${folder}/${name}` : name;
                    try {
                        await this.app.vault.createBinary(destPath, buffer);
                    } catch {
                        await this.app.vault.adapter.writeBinary(destPath, buffer);
                    }
                    return name;
                };

                // Build note body entry
                const lines: string[] = [`## Payment — ${payDate}`];
                if (notesArea.value.trim()) lines.push('', notesArea.value.trim());

                // Pasted images
                for (const pf of pastedFiles) {
                    await saveAttachment(pf.name, pf.buffer);
                    lines.push('', `![[${pf.name}]]`);
                }

                // File input attachments
                const inputFiles = Array.from(attachInput.files ?? []);
                for (const f of inputFiles) {
                    const buf = await f.arrayBuffer();
                    await saveAttachment(f.name, buf);
                    lines.push('', `![[${f.name}]]`);
                }

                lines.push('');

                // Insert into note body right after frontmatter
                const current = await this.app.vault.read(this.file);
                const fmEnd = current.indexOf('---', 3);
                let insertPos = 0;
                if (current.startsWith('---') && fmEnd !== -1) {
                    insertPos = fmEnd + 3;
                    if (current[insertPos] === '\n') insertPos++;
                }
                const entry = '\n' + lines.join('\n') + '\n';
                await this.app.vault.modify(this.file, current.slice(0, insertPos) + entry + current.slice(insertPos));

                new Notice(`✅ Payment recorded. Next due: ${newDue}`);
                this.close();
                this.onPaid();
            } catch (e) {
                new Notice(`Error: ${e.message}`);
                saveBtn.disabled = false;
                saveBtn.textContent = 'Record Payment';
            }
        });
    }

    onClose() { (this as any)._vvCleanup?.(); this.contentEl.empty(); }
}

class NewDueModal extends Modal {
    private captureFolder: string;
    private onCreated: () => void;

    constructor(app: App, captureFolder: string, onCreated: () => void) {
        super(app);
        this.captureFolder = captureFolder;
        this.onCreated = onCreated;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.style.width = 'min(460px, 95vw)';

        // Phone: anchor to top edge (keeps content above keyboard).
        // iPad/desktop: let Obsidian center it naturally.
        if (Platform.isMobile && !isTablet()) {
            const bg = modalEl.parentElement;
            if (bg) {
                bg.style.display = 'flex';
                bg.style.alignItems = 'flex-start';
                bg.style.justifyContent = 'center';
            }
            modalEl.style.position = 'relative';
            modalEl.style.top = '0';
            modalEl.style.left = '';
            modalEl.style.transform = '';
            modalEl.style.margin = '0';
            modalEl.style.borderRadius = '0 0 12px 12px';
            modalEl.style.maxHeight = '100vh';
        }

        contentEl.empty();
        contentEl.style.padding = '16px';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        contentEl.style.gap = '12px';
        contentEl.style.overflowY = 'auto';

        // Shrink when virtual keyboard appears
        const setMaxHeight = () => {
            const vv = (window as any).visualViewport;
            const available = vv ? vv.height : window.innerHeight;
            contentEl.style.maxHeight = `${available - 16}px`;
        };
        setMaxHeight();
        const vv = (window as any).visualViewport;
        if (vv) vv.addEventListener('resize', setMaxHeight);
        (this as any)._vvCleanup = () => { if (vv) vv.removeEventListener('resize', setMaxHeight); };

        // Auto-scroll focused input into view
        contentEl.addEventListener('focusin', (e: FocusEvent) => {
            setTimeout(() => (e.target as HTMLElement)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        });

        contentEl.createEl('h3', { text: 'Add Recurring Due', attr: { style: 'margin: 0; font-size: 1em; color: var(--text-normal); flex-shrink: 0;' } });

        const field = (label: string, hint = '') => {
            const wrap = contentEl.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 3px;' } });
            wrap.createEl('label', { text: label, attr: { style: 'font-size: 0.82em; color: var(--text-muted); font-weight: 600;' } });
            if (hint) wrap.createEl('span', { text: hint, attr: { style: 'font-size: 0.75em; color: var(--text-faint);' } });
            return wrap;
        };

        const inputStyle = 'padding: 5px 8px; border-radius: 5px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.9em; width: 100%; box-sizing: border-box;';

        // Payable name → note filename
        const nameWrap = field('Payable Name', 'This will be the note\'s filename');
        const nameInput = nameWrap.createEl('input', { type: 'text', attr: { placeholder: 'e.g. Netflix, Rent, Electricity', style: inputStyle } });

        // Folder for the note
        const folderWrap = field('Save in folder', 'Leave blank to use plugin capture folder');
        const folderInput = folderWrap.createEl('input', { type: 'text', attr: { placeholder: this.captureFolder || '/', style: inputStyle } });
        folderInput.value = this.captureFolder || '';

        // Next due date
        const dueWrap = field('Next Due Date');
        const dueInput = dueWrap.createEl('input', { type: 'date', attr: { style: inputStyle } });
        dueInput.value = moment().add(1, 'month').format('YYYY-MM-DD');

        // Last payment date (optional)
        const lastWrap = field('Last Payment Date (optional)');
        const lastInput = lastWrap.createEl('input', { type: 'date', attr: { style: inputStyle } });

        // Amount (optional, informational)
        const amtWrap = field('Amount (optional)', 'Stored as "amount" property');
        const amtInput = amtWrap.createEl('input', { type: 'text', attr: { placeholder: 'e.g. 15.99', style: inputStyle } });

        // Notes (optional body content)
        const notesWrap = field('Notes (optional)');
        const notesArea = notesWrap.createEl('textarea', { attr: { rows: '3', placeholder: 'Additional details about this recurring payment…', style: inputStyle + ' resize: vertical; font-family: inherit;' } });

        // Buttons
        const btnRow = contentEl.createEl('div', { attr: { style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;' } });
        btnRow.createEl('button', { text: 'Cancel', attr: { style: 'padding: 6px 16px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); cursor: pointer; font-size: 0.9em;' } })
            .addEventListener('click', () => this.close());
        const saveBtn = btnRow.createEl('button', { text: 'Create', attr: { style: 'padding: 6px 16px; border-radius: 6px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer; font-size: 0.9em; font-weight: 600;' } });

        saveBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) { new Notice('Payable Name is required.'); return; }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Creating…';

            try {
                const folder = folderInput.value.trim().replace(/\/$/, '');
                const filePath = folder ? `${folder}/${name}.md` : `${name}.md`;

                // Check for duplicate
                if (this.app.vault.getFileByPath(filePath)) {
                    new Notice(`Note "${filePath}" already exists.`);
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Create';
                    return;
                }

                // Ensure folder exists
                if (folder) {
                    const folderExists = this.app.vault.getFolderByPath(folder);
                    if (!folderExists) await this.app.vault.createFolder(folder);
                }

                // Build frontmatter
                const fm: string[] = [
                    '---',
                    'category: recurring payment',
                    'active_status: true',
                    `next_duedate: ${dueInput.value || moment().add(1, 'month').format('YYYY-MM-DD')}`,
                ];
                if (lastInput.value) fm.push(`last_payment: ${lastInput.value}`);
                if (amtInput.value.trim()) fm.push(`amount: ${amtInput.value.trim()}`);
                fm.push('---');

                const body = notesArea.value.trim() ? `\n${notesArea.value.trim()}\n` : '';
                const content = fm.join('\n') + '\n' + body;

                await this.app.vault.create(filePath, content);
                new Notice(`✅ "${name}" added to recurring dues.`);
                this.close();
                this.onCreated();
            } catch (e) {
                new Notice(`Error: ${e.message}`);
                saveBtn.disabled = false;
                saveBtn.textContent = 'Create';
            }
        });

        setTimeout(() => nameInput.focus(), 50);
    }

    onClose() { (this as any)._vvCleanup?.(); this.contentEl.empty(); }
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
    activeTab: 'review-tasks' | 'review-thoughts' | 'mina-ai' | 'settings' | 'dues' = 'review-thoughts';

    // AI Chat State
    chatHistory: { role: 'user' | 'assistant'; text: string }[] = [];
    chatContainer: HTMLElement;
    
    // Tasks Review Filters
    tasksFilterStatus: 'all' | 'pending' | 'completed' = 'pending';
    tasksFilterContext: string[] = [];
    tasksFilterDate: string = 'today+overdue'; // 'all'|'today'|'today+overdue'|'this-week'|'next-week'|'overdue'|'custom'
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

    // ── Performance: file content cache ──────────────────────────────────────
    private contentCache = new Map<string, { content: string; mtime: number }>();

    private async readCached(file: TFile): Promise<string> {
        const cached = this.contentCache.get(file.path);
        if (cached && cached.mtime === file.stat.mtime) return cached.content;
        const content = await this.plugin.app.vault.read(file);
        this.contentCache.set(file.path, { content, mtime: file.stat.mtime });
        return content;
    }

    private invalidateCache(path: string) {
        this.contentCache.delete(path);
    }

    // ── Performance: pagination state ─────────────────────────────────────────
    private readonly PAGE_SIZE = 50;

    // Parsed+filtered arrays survive across "load more" clicks
    private _parsedTaskLines: { line: string; index: number; modTimestamp: number; isDone: boolean; dateRaw: string; context: string }[] = [];
    private _parsedRoots: ThoughtEntry[] = [];
    private tasksOffset   = 0;
    private thoughtsOffset = 0;

    // Scroll containers used by "load more" appenders
    private tasksRowContainer: HTMLElement | null = null;
    private thoughtsRowContainer: HTMLElement | null = null;

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

        // Mobile: iOS WebKit scrolls the whole page when a text input is focused,
        // causing the area above the visual viewport to appear as a black bar.
        // Fix: pin the container to the screen using position:fixed + visualViewport
        // coordinates, and update on both resize (keyboard height) and scroll (page shift).
        if (Platform.isMobile && window.visualViewport) {
            const vv = window.visualViewport;
            const syncViewport = () => {
                const container = this.containerEl.children[1] as HTMLElement;
                if (!container) return;
                container.style.position = 'fixed';
                container.style.top    = `${vv.offsetTop}px`;
                container.style.left   = `${vv.offsetLeft}px`;
                container.style.width  = `${vv.width}px`;
                container.style.height = `${vv.height}px`;
                container.style.maxHeight = `${vv.height}px`;
            };
            syncViewport();
            vv.addEventListener('resize', syncViewport);
            vv.addEventListener('scroll', syncViewport);
            (this as any)._vvMainCleanup = () => {
                vv.removeEventListener('resize', syncViewport);
                vv.removeEventListener('scroll', syncViewport);
            };
        }

        // Hide headers for a cleaner full-screen experience on desktop and iPad
        if (!Platform.isMobile || isTablet()) {
            const headerEl = this.containerEl.querySelector('.view-header');
            if (headerEl) {
                (headerEl as HTMLElement).style.display = 'none';
            }
            
            // Hide the tab header strip so the view fills the entire screen
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

    async onClose() {
        (this as any)._vvMainCleanup?.();
    }

    renderView() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        if (Platform.isMobile) {
            const vv = window.visualViewport;
            const vvh = vv ? vv.height : window.innerHeight;
            const vvTop = vv ? vv.offsetTop : 0;
            const vvLeft = vv ? vv.offsetLeft : 0;
            const vvw = vv ? vv.width : window.innerWidth;
            // position:fixed pins the container to screen coords so iOS page-scroll
            // (triggered by keyboard focus) never shifts our view off-screen.
            container.style.position   = 'fixed';
            container.style.top        = `${vvTop}px`;
            container.style.left       = `${vvLeft}px`;
            container.style.width      = `${vvw}px`;
            container.style.display    = 'flex';
            container.style.flexDirection = 'column';
            container.style.height     = `${vvh}px`;
            container.style.maxHeight  = `${vvh}px`;
            container.style.overflow   = 'hidden';
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

        const duesTab = nav.createEl('button', {
            text: 'Dues',
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'dues' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` }
        });
        duesTab.addEventListener('click', () => { this.activeTab = 'dues'; this.renderView(); });

        const settingsTab = nav.createEl('button', {
            text: 'Settings',
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'settings' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` }
        });
        settingsTab.addEventListener('click', () => { this.activeTab = 'settings'; this.renderView(); });

        if (this.activeTab === 'review-tasks') {
            this.renderReviewTasksMode(container);
        } else if (this.activeTab === 'mina-ai') {
            this.renderMinaMode(container);
        } else if (this.activeTab === 'dues') {
            this.renderDuesMode(container);
        } else if (this.activeTab === 'settings') {
            this.renderSettingsMode(container);
        } else {
            this.renderReviewThoughtsMode(container);
        }
    }

    renderDuesMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 12px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex-grow: 1;' } });

        // Header row with title and add button
        const duesHeaderRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;' } });
        duesHeaderRow.createEl('span', { text: 'Recurring Dues', attr: { style: 'font-size: 0.9em; font-weight: 600; color: var(--text-muted);' } });
        const addBtn = duesHeaderRow.createEl('button', { text: '+ Add', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
        addBtn.addEventListener('click', () => {
            new NewDueModal(this.plugin.app, this.plugin.settings.captureFolder, () => this.renderView()).open();
        });

        const { metadataCache, vault } = this.plugin.app;

        // Collect all notes with category containing "recurring payment" and active_status = true
        const hasRecurringPayment = (raw: any): boolean => {
            if (!raw) return false;
            if (Array.isArray(raw)) return raw.some((v: any) => v.toString().toLowerCase().includes('recurring payment'));
            return raw.toString().toLowerCase().includes('recurring payment');
        };
        interface DueEntry { title: string; path: string; dueDate: string; lastPayment: string; dueMoment: any; }
        const entries: DueEntry[] = [];

        for (const file of vault.getMarkdownFiles()) {
            const fm = metadataCache.getFileCache(file)?.frontmatter;
            if (!fm) continue;

            const category = fm['category'];
            const activeStatus = fm['active_status'];
            const isActive = activeStatus === true || activeStatus === 'true' || activeStatus === 'True';

            if (!hasRecurringPayment(category) || !isActive) continue;

            const dueDate = (fm['next_duedate'] ?? '').toString().trim();
            const lastPayment = (fm['last_payment'] ?? '').toString().trim();
            const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;

            entries.push({ title: file.basename, path: file.path, dueDate, lastPayment, dueMoment });
        }

        // Sort by due date ascending (undated go to bottom)
        entries.sort((a, b) => {
            if (!a.dueMoment?.isValid() && !b.dueMoment?.isValid()) return 0;
            if (!a.dueMoment?.isValid()) return 1;
            if (!b.dueMoment?.isValid()) return -1;
            return a.dueMoment.valueOf() - b.dueMoment.valueOf();
        });

        if (entries.length === 0) {
            wrap.createEl('p', { text: 'No recurring payments found. Add frontmatter: category: recurring payment, active_status: true, next_duedate, last_payment.', attr: { style: 'color: var(--text-muted); font-size: 0.85em;' } });
            return;
        }

        // Table
        const table = wrap.createEl('table', { attr: { style: 'width: 100%; border-collapse: collapse; font-size: 0.88em;' } });

        // Header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        ['Payable', 'Due Date', 'Last Payment', ''].forEach(h => {
            headerRow.createEl('th', { text: h, attr: { style: 'text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--background-modifier-border); color: var(--text-muted); font-weight: 600; white-space: nowrap;' } });
        });

        // Body
        const tbody = table.createEl('tbody');
        const today = moment().startOf('day');

        entries.forEach(entry => {
            const tr = tbody.createEl('tr', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border); transition: background 0.15s;' } });
            tr.addEventListener('mouseenter', () => tr.style.background = 'var(--background-secondary)');
            tr.addEventListener('mouseleave', () => tr.style.background = '');

            // Payable (clickable note link)
            const tdPayable = tr.createEl('td', { attr: { style: 'padding: 7px 10px;' } });
            const link = tdPayable.createEl('a', { text: entry.title, attr: { style: 'color: var(--text-accent); cursor: pointer; text-decoration: none; font-weight: 500;' } });
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.plugin.app.workspace.openLinkText(entry.title, entry.path, Platform.isMobile ? 'tab' : 'window');
            });

            // Due Date (highlight overdue in red, due today in accent)
            const tdDue = tr.createEl('td', { attr: { style: 'padding: 7px 10px; white-space: nowrap;' } });
            if (entry.dueMoment?.isValid()) {
                const isOverdue = entry.dueMoment.isBefore(today);
                const isToday = entry.dueMoment.isSame(today, 'day');
                const color = isOverdue ? 'var(--text-error)' : isToday ? 'var(--interactive-accent)' : 'var(--text-normal)';
                tdDue.createEl('span', { text: entry.dueDate, attr: { style: `color: ${color}; font-weight: ${isOverdue || isToday ? '600' : '400'};` } });
                if (isOverdue) tdDue.createEl('span', { text: ' ⚠', attr: { style: 'color: var(--text-error); font-size: 0.85em;' } });
            } else {
                tdDue.createEl('span', { text: entry.dueDate || '—', attr: { style: 'color: var(--text-muted);' } });
            }

            // Last Payment
            tr.createEl('td', { text: entry.lastPayment || '—', attr: { style: 'padding: 7px 10px; color: var(--text-muted); white-space: nowrap;' } });

            // Pay button
            const tdPay = tr.createEl('td', { attr: { style: 'padding: 4px 8px; text-align: right;' } });
            const payBtn = tdPay.createEl('button', { text: 'Pay', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
            payBtn.addEventListener('click', () => {
                const fileObj = vault.getFileByPath(entry.path) as TFile;
                if (!fileObj) { new Notice('Note file not found.'); return; }
                new PaymentModal(this.plugin.app, fileObj, entry.dueDate, () => {
                    this.renderView();
                }).open();
            });
        });
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
                ['gemini-2.5-flash',         '2.5 Flash — fast, general-purpose (default)'],
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
        // Desktop: prime the container as a flex column.
        // Mobile: renderView already did that with a fixed pixel height.
        if (!Platform.isMobile) {
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.height = '100%';
            container.style.overflow = 'hidden';
        }

        if (!this.plugin.settings.geminiApiKey) {
            const warn = container.createEl('div', { attr: { style: 'padding: 20px; color: var(--text-muted); font-size: 0.9em;' } });
            warn.createEl('p', { text: '⚠️ No Gemini API key set.' });
            warn.createEl('p', { text: 'Add your key in Settings → MINA → Gemini API Key.' });
            return;
        }

        // Input row — at the TOP, flex-shrink: 0 (same pattern as capture area in Thoughts tab)
        const inputRow = container.createEl('div', {
            attr: { style: 'flex-shrink: 0; display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid var(--background-modifier-border); align-items: stretch; background: var(--background-secondary);' }
        });
        const textarea = inputRow.createEl('textarea', { attr: { placeholder: 'Ask MINA about your thoughts, tasks and dues…', rows: '2', style: 'flex-grow: 1; resize: none; font-size: 0.9em; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-family: inherit;' } });
        const sendBtn = inputRow.createEl('button', { text: '↑', attr: { style: 'padding: 0 16px; font-size: 1.3em; border-radius: 6px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; cursor: pointer; flex-shrink: 0;' } });

        const send = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            textarea.value = '';
            textarea.disabled = true;
            sendBtn.disabled = true;

            this.chatHistory.push({ role: 'user', text });
            this.renderChatHistory();

            // "Thinking" indicator prepended at the top (newest-first order)
            const thinking = this.chatContainer.createEl('div', { attr: { style: 'align-self: flex-start; font-size: 0.85em; color: var(--text-muted); font-style: italic;' } });
            this.chatContainer.prepend(thinking);
            thinking.setText('MINA is thinking…');

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

        if (!Platform.isMobile) {
            setTimeout(() => textarea.focus(), 50);
        }

        // Chat history — scrollable area below the input
        this.chatContainer = container.createEl('div', {
            attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 8px; display: flex; flex-direction: column; gap: 8px;' }
        });
        this.renderChatHistory();
    }

    renderChatHistory() {
        if (!this.chatContainer) return;
        this.chatContainer.empty();
        if (this.chatHistory.length === 0) {
            this.chatContainer.createEl('div', { text: 'Ask me anything about your thoughts, tasks and dues.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; text-align: center; margin-top: 20px;' } });
            return;
        }
        // Render newest first
        for (const msg of [...this.chatHistory].reverse()) {
            const isUser = msg.role === 'user';
            const bubble = this.chatContainer.createEl('div', { attr: { style: `max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 0.9em; line-height: 1.5; white-space: pre-wrap; word-break: break-word; align-self: ${isUser ? 'flex-end' : 'flex-start'}; background: ${isUser ? 'var(--interactive-accent)' : 'var(--background-secondary)'}; color: ${isUser ? 'var(--text-on-accent)' : 'var(--text-normal)'};` } });
            bubble.setText(msg.text);
        }
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

        const thoughtsContent = await readFile(s.captureFolder, s.captureFilePath);
        const tasksContent = await readFile(s.captureFolder, s.tasksFilePath);

        // Build dues context from vault frontmatter
        const { metadataCache, vault: v } = this.plugin.app;
        const duesLines: string[] = [];
        for (const file of v.getMarkdownFiles()) {
            const fm = metadataCache.getFileCache(file)?.frontmatter;
            if (!fm) continue;
            const catRaw = fm['category'];
            const catMatches = catRaw && (Array.isArray(catRaw)
                ? catRaw.some((v: any) => v.toString().toLowerCase().includes('recurring payment'))
                : catRaw.toString().toLowerCase().includes('recurring payment'));
            const active = fm['active_status'];
            const isActive = active === true || active === 'true' || active === 'True';
            if (!catMatches || !isActive) continue;
            duesLines.push(`- ${file.basename}: due ${fm['next_duedate'] ?? '?'}, last paid ${fm['last_payment'] ?? '?'}`);
        }
        duesLines.sort();
        const duesContent = duesLines.length ? duesLines.join('\n') : '(none)';

        const systemPrompt = `You are MINA, a personal AI assistant embedded in Obsidian. You have access to the user's thoughts, tasks, and recurring dues below. Answer questions, summarize, find patterns, suggest actions, or help reflect — based on this data. Be concise and helpful.

--- THOUGHTS ---
${thoughtsContent || '(empty)'}

--- TASKS ---
${tasksContent || '(empty)'}

--- DUES (recurring payments) ---
${duesContent}`;

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

    hookInternalLinks(el: HTMLElement, sourcePath: string) {
        el.querySelectorAll('a.internal-link').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const href = a.getAttribute('data-href') || a.getAttribute('href') || '';
                if (href) this.plugin.app.workspace.openLinkText(href, sourcePath, Platform.isMobile ? 'tab' : 'window');
            });
        });
    }

    hookImageZoom(el: HTMLElement) {
        el.querySelectorAll('img').forEach((img) => {
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // ── Overlay ──────────────────────────────────────────────────
                const overlay = document.body.createEl('div', {
                    attr: {
                        style: [
                            'position:fixed', 'inset:0', 'z-index:99999',
                            'background:rgba(0,0,0,0.88)',
                            'display:flex', 'align-items:center', 'justify-content:center',
                            'overflow:hidden', 'touch-action:none'
                        ].join(';')
                    }
                });

                // ── Image ─────────────────────────────────────────────────────
                const zoomed = overlay.createEl('img', {
                    attr: {
                        src: img.src,
                        style: [
                            'max-width:90vw', 'max-height:90vh',
                            'object-fit:contain',
                            'border-radius:6px',
                            'box-shadow:0 8px 40px rgba(0,0,0,0.6)',
                            'user-select:none', 'will-change:transform',
                            'transform-origin:center center',
                            'cursor:grab', 'transition:none'
                        ].join(';')
                    }
                });

                // ── Hint bar ─────────────────────────────────────────────────
                const hint = overlay.createEl('div', {
                    attr: {
                        style: [
                            'position:absolute', 'bottom:16px', 'left:50%',
                            'transform:translateX(-50%)',
                            'background:rgba(0,0,0,0.55)',
                            'color:#fff', 'font-size:0.78em',
                            'padding:4px 14px', 'border-radius:20px',
                            'pointer-events:none', 'white-space:nowrap',
                            'opacity:0.8'
                        ].join(';')
                    },
                    text: Platform.isMobile
                        ? 'Pinch to zoom · drag to pan · tap outside to close'
                        : 'Scroll to zoom · drag to pan · click outside to close · Esc'
                });

                // ── State ─────────────────────────────────────────────────────
                let scale = 1, tx = 0, ty = 0;

                const applyTransform = () => {
                    zoomed.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
                    zoomed.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
                };

                const clampTranslate = () => {
                    const r = zoomed.getBoundingClientRect();
                    const ow = overlay.clientWidth, oh = overlay.clientHeight;
                    const excess = Math.max(0, (r.width - ow) / 2 + 20);
                    const excessY = Math.max(0, (r.height - oh) / 2 + 20);
                    tx = Math.max(-excess, Math.min(excess, tx));
                    ty = Math.max(-excessY, Math.min(excessY, ty));
                };

                // ── Close ─────────────────────────────────────────────────────
                const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
                overlay.addEventListener('click', close);
                zoomed.addEventListener('click', (ev) => ev.stopPropagation());

                const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
                document.addEventListener('keydown', onKey);

                // ── Mouse wheel zoom ──────────────────────────────────────────
                overlay.addEventListener('wheel', (ev: WheelEvent) => {
                    ev.preventDefault();
                    const delta = ev.deltaY < 0 ? 0.15 : -0.15;
                    scale = Math.max(0.2, Math.min(8, scale + delta));
                    clampTranslate();
                    applyTransform();
                }, { passive: false });

                // ── Mouse drag to pan ─────────────────────────────────────────
                let dragStart: { x: number; y: number } | null = null;
                let dragTx = 0, dragTy = 0;

                zoomed.addEventListener('mousedown', (ev) => {
                    if (scale <= 1) return;
                    ev.preventDefault();
                    dragStart = { x: ev.clientX, y: ev.clientY };
                    dragTx = tx; dragTy = ty;
                    zoomed.style.cursor = 'grabbing';
                });
                document.addEventListener('mousemove', (ev) => {
                    if (!dragStart) return;
                    tx = dragTx + (ev.clientX - dragStart.x);
                    ty = dragTy + (ev.clientY - dragStart.y);
                    clampTranslate();
                    applyTransform();
                });
                document.addEventListener('mouseup', () => {
                    dragStart = null;
                    applyTransform(); // restores grab cursor
                });

                // ── Touch: pinch-to-zoom + drag ───────────────────────────────
                let lastPinchDist = 0, lastPinchScale = 1;
                let touchStart: { x: number; y: number; tx: number; ty: number } | null = null;

                overlay.addEventListener('touchstart', (ev: TouchEvent) => {
                    if (ev.touches.length === 2) {
                        const dx = ev.touches[0].clientX - ev.touches[1].clientX;
                        const dy = ev.touches[0].clientY - ev.touches[1].clientY;
                        lastPinchDist = Math.hypot(dx, dy);
                        lastPinchScale = scale;
                        touchStart = null;
                    } else if (ev.touches.length === 1 && scale > 1) {
                        touchStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, tx, ty };
                    }
                }, { passive: true });

                overlay.addEventListener('touchmove', (ev: TouchEvent) => {
                    ev.preventDefault();
                    if (ev.touches.length === 2) {
                        const dx = ev.touches[0].clientX - ev.touches[1].clientX;
                        const dy = ev.touches[0].clientY - ev.touches[1].clientY;
                        const dist = Math.hypot(dx, dy);
                        scale = Math.max(0.2, Math.min(8, lastPinchScale * (dist / lastPinchDist)));
                        clampTranslate();
                        applyTransform();
                    } else if (ev.touches.length === 1 && touchStart) {
                        tx = touchStart.tx + (ev.touches[0].clientX - touchStart.x);
                        ty = touchStart.ty + (ev.touches[0].clientY - touchStart.y);
                        clampTranslate();
                        applyTransform();
                    }
                }, { passive: false });

                // Single tap on overlay (not image) → close only when not zoomed in
                overlay.addEventListener('touchend', (ev: TouchEvent) => {
                    if (ev.changedTouches.length === 1 && scale <= 1.05) {
                        const t = ev.changedTouches[0];
                        if (!(ev.target as HTMLElement).closest('img')) close();
                    }
                });

                hint.remove(); // briefly show then remove
                setTimeout(() => { if (overlay.isConnected) overlay.appendChild(hint); }, 50);
                setTimeout(() => hint.style.opacity = '0', 2500);
            });
        });
    }

    hookCheckboxes(el: HTMLElement, entry: ThoughtEntry) {
        try {
            const checkboxEls = Array.from(el.querySelectorAll('input[type="checkbox"]'));
            checkboxEls.forEach((cb, idx) => {
                try {
                    const checkbox = cb as HTMLInputElement;
                    const isChecked = checkbox.checked;

                    const circle = document.createElement('span');
                    const applyCircleStyle = (checked: boolean) => {
                        circle.style.cssText = [
                            'display:inline-flex', 'align-items:center', 'justify-content:center',
                            'width:15px', 'height:15px', 'border-radius:50%',
                            'border:2px solid var(--interactive-accent)',
                            'cursor:pointer', 'flex-shrink:0',
                            'transition:background 0.15s',
                            `background:${checked ? 'var(--interactive-accent)' : 'transparent'}`,
                            'font-size:10px', 'color:var(--background-primary)',
                            'user-select:none', 'vertical-align:middle', 'margin-right:4px'
                        ].join(';');
                        circle.textContent = checked ? '✓' : '';
                        circle.setAttribute('data-checked', checked ? '1' : '0');
                        circle.title = checked ? 'Mark incomplete' : 'Mark complete';
                    };
                    applyCircleStyle(isChecked);

                    // Use insertBefore + removeChild (more compatible than replaceWith)
                    const parent = checkbox.parentElement;
                    if (parent) {
                        parent.insertBefore(circle, checkbox);
                        parent.removeChild(checkbox);
                    }

                    circle.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const currentlyChecked = circle.getAttribute('data-checked') === '1';
                        const newChecked = !currentlyChecked;
                        applyCircleStyle(newChecked);

                        let count = 0;
                        const newRaw = entry.text.replace(/- \[([ x])\] /g, (match: string, state: string) => {
                            if (count++ === idx) return state === ' ' ? '- [x] ' : '- [ ] ';
                            return match;
                        });
                        if (newRaw === entry.text) return;
                        entry.text = newRaw;

                        const { vault } = this.plugin.app;
                        const folderPath = this.plugin.settings.captureFolder.trim();
                        const fileName = this.plugin.settings.captureFilePath.trim();
                        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
                        const file = vault.getAbstractFileByPath(fullPath) as TFile;
                        if (!file) return;
                        try {
                            const content = await vault.read(file);
                            const lines = content.split('\n');
                            if (entry.lineIndex >= 0 && entry.lineIndex < lines.length) {
                                const parts = lines[entry.lineIndex].split('|');
                                let textIndex: number;
                                if (parts.length >= 9) textIndex = 7;
                                else if (parts.length >= 7) textIndex = 5;
                                else textIndex = 3;
                                parts[textIndex] = ` ${newRaw} `;
                                lines[entry.lineIndex] = parts.join('|');
                                await vault.modify(file, lines.join('\n'));
                                this.invalidateCache(fullPath);
                            }
                        } catch (_) { /* silent */ }
                    });
                } catch (itemErr) {
                    console.warn('MINA: hookCheckboxes item error', itemErr);
                }
            });
        } catch (err) {
            console.warn('MINA: hookCheckboxes error', err);
        }
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
                placeholder: Platform.isMobile && !isTablet()
                    ? 'Type your thought… use @ for context, \\ for links'
                    : 'Enter your thought or task… Shift+Enter to save',
                rows: isTablet() ? '4' : '3',
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

        // ── @ context picker (mobile only) ───────────────────────────────────
        let atStartIndex = -1;
        let ctxPickerEl: HTMLElement | null = null;
        let currentCtxQuery = '';

        const hideCtxPicker = () => {
            // splice out the @query token when picker closes
            if (atStartIndex !== -1 && ctxPickerEl) {
                const cursorNow = textArea.selectionStart;
                const endOfQuery = Math.max(cursorNow, atStartIndex + 1 + currentCtxQuery.length);
                textArea.value = textArea.value.substring(0, atStartIndex) + textArea.value.substring(endOfQuery);
                this.content = textArea.value;
                textArea.setSelectionRange(atStartIndex, atStartIndex);
            }
            ctxPickerEl?.remove(); ctxPickerEl = null; atStartIndex = -1; currentCtxQuery = '';
        };

        const showCtxPicker = (query: string) => {
            currentCtxQuery = query;
            ctxPickerEl?.remove();
            const all = this.plugin.settings.contexts;
            const filtered = query
                ? all.filter(c => c.toLowerCase().includes(query.toLowerCase()))
                : all;
            const isNew = query && !all.some(c => c.toLowerCase() === query.toLowerCase());

            if (!filtered.length && !isNew) { ctxPickerEl = null; return; }

            // ── Horizontal scrollable pill strip below the textarea ───────────
            ctxPickerEl = textAreaWrapper.createEl('div', {
                attr: {
                    style: [
                        'position:absolute', 'top:calc(100% + 4px)', 'left:0', 'right:0',
                        'display:flex', 'flex-direction:row', 'align-items:center',
                        'gap:6px', 'padding:8px 10px',
                        'overflow-x:auto', 'white-space:nowrap',
                        '-webkit-overflow-scrolling:touch',
                        'background:var(--background-primary)',
                        'border:1px solid var(--background-modifier-border)',
                        'border-radius:10px',
                        'box-shadow:0 4px 16px rgba(0,0,0,0.22)',
                        'z-index:200'
                    ].join(';')
                }
            });

            const rows = [...filtered, ...(isNew ? [query] : [])];

            rows.forEach((ctx, i) => {
                const isCreateRow = i === rows.length - 1 && isNew;
                const isSelected = this.selectedContexts.includes(ctx);

                const pill = ctxPickerEl!.createEl('div', {
                    attr: {
                        style: [
                            'display:inline-flex', 'align-items:center', 'gap:5px',
                            'padding:6px 14px', 'border-radius:20px',
                            'font-size:0.85em', 'cursor:pointer', 'flex-shrink:0',
                            'user-select:none', 'transition:background 0.1s',
                            isCreateRow
                                ? 'border:1px dashed var(--interactive-accent); color:var(--interactive-accent);'
                                : isSelected
                                    ? 'background:var(--interactive-accent); color:var(--text-on-accent); border:1px solid var(--interactive-accent);'
                                    : 'background:var(--background-secondary); color:var(--text-normal); border:1px solid var(--background-modifier-border);'
                        ].join(';')
                    }
                });

                if (isCreateRow) {
                    pill.createSpan({ text: '➕' });
                    pill.createSpan({ text: `"${ctx}"` });
                } else {
                    if (isSelected) pill.createSpan({ text: '✓', attr: { style: 'font-size:0.8em; font-weight:bold;' } });
                    pill.createSpan({ text: `#${ctx}` });
                }

                pill.addEventListener('mousedown', async (ev) => {
                    ev.preventDefault();

                    if (isCreateRow && !this.plugin.settings.contexts.includes(ctx)) {
                        this.plugin.settings.contexts.push(ctx);
                    }
                    if (isSelected && !isCreateRow) {
                        this.selectedContexts = this.selectedContexts.filter(c => c !== ctx);
                    } else if (!this.selectedContexts.includes(ctx)) {
                        this.selectedContexts.push(ctx);
                    }
                    this.plugin.settings.selectedContexts = [...this.selectedContexts];
                    await this.plugin.saveSettings();

                    // Re-render picker in place so multiple items can be selected
                    showCtxPicker(currentCtxQuery);
                    textArea.focus();
                });
            });

            // ── "Done" pill at the end ────────────────────────────────────────
            const donePill = ctxPickerEl.createEl('div', {
                attr: {
                    style: [
                        'display:inline-flex', 'align-items:center',
                        'padding:6px 14px', 'border-radius:20px',
                        'font-size:0.85em', 'cursor:pointer', 'flex-shrink:0',
                        'margin-left:auto',
                        'background:var(--background-modifier-border)',
                        'color:var(--text-muted)', 'border:1px solid transparent'
                    ].join(';')
                },
                text: 'Done'
            });
            donePill.addEventListener('mousedown', (ev) => { ev.preventDefault(); hideCtxPicker(); textArea.focus(); });
        };

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

            // @ context picker: phone-only; iPad/desktop use the persistent pill row
            if (Platform.isMobile && !isTablet()) {
                const cursor = target.selectionStart;
                const before = val.substring(0, cursor);
                const atIdx = before.lastIndexOf('@');
                // valid trigger: @ found and no space between @ and cursor
                if (atIdx !== -1 && !before.substring(atIdx + 1).includes(' ')) {
                    atStartIndex = atIdx;
                    showCtxPicker(before.substring(atIdx + 1));
                } else {
                    hideCtxPicker();
                }
            }

            // Auto-convert "** " at line start to a markdown checklist item "- [ ] "
            const converted = val.replace(/^\*\* /gm, '- [ ] ');
            if (converted !== val) {
                const cursor = target.selectionStart;
                const diff = converted.length - val.length;
                target.value = converted;
                target.setSelectionRange(cursor + diff, cursor + diff);
            }

            lastValue = target.value;
            this.content = target.value;
        });

        textArea.addEventListener('blur', () => setTimeout(hideCtxPicker, 150));
        textArea.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideCtxPicker(); });

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

        // ── Attach button (📎) — overlaid on lower-right of the textarea ─────
        // Make textAreaWrapper a positioning context so the icon floats over the textarea.
        textAreaWrapper.style.position = 'relative';

        const fileInput = textAreaWrapper.createEl('input', {
            attr: {
                type: 'file', multiple: '', style: 'display:none;',
                accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*'
            }
        }) as HTMLInputElement;
        fileInput.addEventListener('change', async () => {
            if (fileInput.files && fileInput.files.length > 0) {
                await this.handleFiles(fileInput.files);
                fileInput.value = '';
            }
        });

        const attachBtn = textAreaWrapper.createEl('button', {
            attr: {
                title: 'Attach image or file',
                style: [
                    'position:absolute', 'bottom:6px', 'right:6px',
                    'background:transparent', 'border:none',
                    'color:var(--text-muted)', 'opacity:0.5',
                    'padding:2px 4px', 'cursor:pointer',
                    'font-size:1em', 'line-height:1',
                    'transition:opacity 0.15s', 'z-index:1'
                ].join(';')
            }
        });
        attachBtn.textContent = '📎';
        attachBtn.addEventListener('mouseenter', () => attachBtn.style.opacity = '1');
        attachBtn.addEventListener('mouseleave', () => attachBtn.style.opacity = '0.5');
        attachBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });

        const submitBtn = inputSection.createEl('button', { text: 'Sync', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 8px 16px; height: 100%; min-height: 40px;' } });
        
        // Contexts — desktop+iPad: pill row; phone: hidden (use @ in textarea instead)
        const controlsDiv = container.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 15px;' } });
        
        const contextsDiv = controlsDiv.createEl('div', { attr: { style: `display: ${Platform.isMobile && !isTablet() ? 'none' : 'flex'}; flex-wrap: wrap; gap: 5px; align-items: center;` } });
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
            const taskToggleDiv = controlsDiv.createEl('div', { attr: { style: `display: flex; align-items: center; gap: 8px; ${Platform.isMobile && !isTablet() ? '' : 'margin-left: auto;'}` } });
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
            const taskControlsDiv = controlsDiv.createEl('div', { attr: { style: `display: flex; align-items: center; gap: 8px; ${Platform.isMobile && !isTablet() ? '' : 'margin-left: auto;'}` } });
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
        // Enter = new line (default); Shift+Enter = save
        textArea.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); await submitAction(); } });
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
        [['all', 'All Dates'], ['today', 'Today'], ['today+overdue', 'Today + Overdue'], ['this-week', 'This Week'], ['next-week', 'Next Week'], ['overdue', 'Overdue Only'], ['custom', 'Custom Date']].forEach(([val, label]) => {
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

    async updateReviewTasksList(appendMore = false) {
        if (!this.reviewTasksContainer) return;

        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = this.plugin.settings.tasksFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;

        if (!appendMore) {
            // Full re-render: clear everything and rebuild the parsed list
            this.reviewTasksContainer.empty();
            this._parsedTaskLines = [];
            this.tasksOffset = 0;

            if (!file) {
                this.reviewTasksContainer.createEl('p', { text: 'No tasks found.', attr: { style: 'color: var(--text-muted);' } });
                return;
            }

            try {
                const content = await this.readCached(file);
                const lines = content.split('\n');
                const todayMoment = moment().startOf('day');
                const startOfWeek = moment().startOf('week');
                const endOfWeek = moment().endOf('week');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line.startsWith('|') || line.includes('---') || line.includes('| Date |') || line.includes('| Status |')) continue;
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

                    let dateRaw = '', modDateStr = '', modTimeStr = '';
                    if (parts.length >= 9) {
                        modDateStr = parts[4].trim().replace(/[\[\]]/g, '');
                        modTimeStr = parts[5].trim();
                        dateRaw = parts[6]?.trim().replace(/[\[\]]/g, '');
                        if (!dateRaw) dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                    } else if (parts.length >= 7) {
                        dateRaw = parts[4]?.trim().replace(/[\[\]]/g, '');
                        if (!dateRaw) dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                        modDateStr = parts[2].trim().replace(/[\[\]]/g, '');
                        modTimeStr = parts[3].trim();
                    } else {
                        dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                        modDateStr = parts[2].trim().replace(/[\[\]]/g, '');
                        modTimeStr = parts[3].trim();
                    }

                    if (this.tasksFilterDate !== 'all') {
                        if (!dateRaw) continue;
                        const taskDate = moment(dateRaw, ['YYYY-MM-DD', this.plugin.settings.dateFormat], true);
                        if (!taskDate.isValid()) continue;
                        if (this.tasksFilterDate === 'today' && !taskDate.isSame(todayMoment, 'day')) continue;
                        else if (this.tasksFilterDate === 'today+overdue') {
                            const isOverdue = !isDone && taskDate.isBefore(todayMoment, 'day');
                            const isToday = taskDate.isSame(todayMoment, 'day');
                            if (!isToday && !isOverdue) continue;
                        } else if (this.tasksFilterDate === 'this-week' && !taskDate.isBetween(startOfWeek, endOfWeek, 'day', '[]')) continue;
                        else if (this.tasksFilterDate === 'next-week') {
                            const s = moment().add(1, 'week').startOf('week'), e = moment().add(1, 'week').endOf('week');
                            if (!taskDate.isBetween(s, e, 'day', '[]')) continue;
                        } else if (this.tasksFilterDate === 'overdue') {
                            if (isDone || !taskDate.isBefore(todayMoment, 'day')) continue;
                        } else if (this.tasksFilterDate === 'custom') {
                            const s = moment(this.tasksFilterDateStart, 'YYYY-MM-DD').startOf('day');
                            const e = moment(this.tasksFilterDateEnd, 'YYYY-MM-DD').endOf('day');
                            if (!taskDate.isBetween(s, e, 'day', '[]')) continue;
                        }
                    }

                    const contextPart = parts[parts.length - 2]?.trim() || '';
                    if (this.tasksFilterContext.length > 0 && !this.tasksFilterContext.some(ctx => contextPart.includes(`#${ctx}`))) continue;

                    const m = moment(`${modDateStr} ${modTimeStr}`, ['YYYY-MM-DD HH:mm', `${this.plugin.settings.dateFormat} ${this.plugin.settings.timeFormat}`]);
                    this._parsedTaskLines.push({ line, index: i, modTimestamp: m.isValid() ? m.valueOf() : 0, isDone, dateRaw, context: contextPart });
                }

                this._parsedTaskLines.sort((a, b) => b.modTimestamp - a.modTimestamp);
            } catch {
                this.reviewTasksContainer.createEl('p', { text: 'Error loading tasks.', attr: { style: 'color: var(--text-error);' } });
                return;
            }

            // Create a stable row container inside the scroll area
            this.tasksRowContainer = this.reviewTasksContainer.createEl('div');
        }

        if (!this.tasksRowContainer || !file) return;

        // Remove previous "load more" footer before appending
        this.reviewTasksContainer.querySelector('.mina-load-more')?.remove();

        if (this._parsedTaskLines.length === 0 && !appendMore) {
            this.reviewTasksContainer.createEl('p', { text: 'No tasks matching filters.', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        const slice = this._parsedTaskLines.slice(this.tasksOffset, this.tasksOffset + this.PAGE_SIZE);
        for (const tl of slice) {
            await this.renderTaskRow(tl.line, tl.index, this.tasksRowContainer, file.path, true);
        }
        this.tasksOffset += slice.length;

        const remaining = this._parsedTaskLines.length - this.tasksOffset;
        if (remaining > 0) {
            const btn = this.reviewTasksContainer.createEl('button', {
                text: `Load ${Math.min(remaining, this.PAGE_SIZE)} more tasks…`,
                cls: 'mina-load-more',
                attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' }
            });
            btn.addEventListener('click', () => this.updateReviewTasksList(true));
        }
    }

    async updateReviewThoughtsList(appendMore = false) {
        if (!this.reviewThoughtsContainer) return;

        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = this.plugin.settings.captureFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;

        if (!appendMore) {
            this.reviewThoughtsContainer.empty();
            this._parsedRoots = [];
            this.thoughtsOffset = 0;

            if (!file) {
                this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts found.', attr: { style: 'color: var(--text-muted);' } });
                return;
            }

            try {
                const content = await this.readCached(file);
                const lines = content.split('\n');
                const today = moment().locale('en').format('YYYY-MM-DD');
                const startOfWeek = moment().startOf('week');
                const endOfWeek = moment().endOf('week');

                const allEntries: ThoughtEntry[] = [];
                const idMap = new Map<string, ThoughtEntry>();

                // First pass: parse
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line.startsWith('|') || line.includes('---') || line.includes('| Date |') || line.includes('| ID |')) continue;
                    const parts = line.split('|');
                    if (parts.length < 5) continue;

                    let id = '', parentId = '', dateStr = '', timeStr = '', modDateStr = '', modTimeStr = '', text = '', context = '';
                    if (parts.length >= 9) {
                        id = parts[1].trim(); parentId = parts[2].trim(); dateStr = parts[3].trim();
                        timeStr = parts[4].trim(); modDateStr = parts[5].trim(); modTimeStr = parts[6].trim();
                        text = parts[7].trim(); context = parts[8].trim();
                    } else if (parts.length >= 7) {
                        id = parts[1].trim(); parentId = parts[2].trim(); dateStr = parts[3].trim();
                        timeStr = parts[4].trim(); modDateStr = parts[3].trim(); modTimeStr = parts[4].trim();
                        text = parts[5].trim(); context = parts[6].trim();
                    } else {
                        dateStr = parts[1].trim(); timeStr = parts[2].trim();
                        modDateStr = parts[1].trim(); modTimeStr = parts[2].trim();
                        text = parts[3].trim(); context = parts[4].trim();
                        id = `legacy-${dateStr}-${timeStr}-${text.substring(0, 10)}`;
                    }

                    const m = moment(`${modDateStr.replace(/[\[\]]/g, '')} ${modTimeStr}`, ['YYYY-MM-DD HH:mm', `${this.plugin.settings.dateFormat} ${this.plugin.settings.timeFormat}`]);
                    const entry: ThoughtEntry = { id, parentId, date: dateStr, time: timeStr, modifiedDate: modDateStr, modifiedTime: modTimeStr, text, context, lineIndex: i, children: [], lastThreadUpdate: m.isValid() ? m.valueOf() : 0 };
                    allEntries.push(entry);
                    if (id) idMap.set(id, entry);
                }

                // Second pass: tree
                const roots: ThoughtEntry[] = [];
                for (const entry of allEntries) {
                    if (entry.parentId && idMap.has(entry.parentId)) idMap.get(entry.parentId)!.children.push(entry);
                    else roots.push(entry);
                }

                // Third pass: thread-wide latest update
                const calcUpdate = (e: ThoughtEntry): number => {
                    let latest = e.lastThreadUpdate || 0;
                    for (const c of e.children) { const cl = calcUpdate(c); if (cl > latest) latest = cl; }
                    e.lastThreadUpdate = latest;
                    return latest;
                };
                for (const root of roots) calcUpdate(root);

                // Filter roots
                const todayMoment = moment().startOf('day');
                for (const root of roots) {
                    const dateRaw = root.date.replace(/\[\[|\]\]/g, '');
                    if (!this.showPreviousThoughts && dateRaw) {
                        const d = moment(dateRaw, this.plugin.settings.dateFormat);
                        if (d.isValid() && !d.isSame(todayMoment, 'day')) continue;
                    }
                    if (this.thoughtsFilterContext.length > 0 && !this.thoughtsFilterContext.some(ctx => root.context.includes(`#${ctx}`))) continue;
                    if (this.thoughtsFilterDate !== 'all') {
                        const d = moment(dateRaw, this.plugin.settings.dateFormat);
                        if (this.thoughtsFilterDate === 'today' && dateRaw !== today) continue;
                        if (this.thoughtsFilterDate === 'this-week' && !d.isBetween(startOfWeek, endOfWeek, 'day', '[]')) continue;
                        if (this.thoughtsFilterDate === 'custom') {
                            const s = moment(this.thoughtsFilterDateStart, 'YYYY-MM-DD').startOf('day');
                            const e = moment(this.thoughtsFilterDateEnd, 'YYYY-MM-DD').endOf('day');
                            if (!d.isBetween(s, e, 'day', '[]')) continue;
                        }
                    }
                    this._parsedRoots.push(root);
                }

                this._parsedRoots.sort((a, b) => (b.lastThreadUpdate || 0) - (a.lastThreadUpdate || 0));

                // Seed collapsed state once
                if (!this.collapsedThreadsSeeded) {
                    const seed = (e: ThoughtEntry) => { if (e.children.length > 0) { this.collapsedThreads.add(e.id); for (const c of e.children) seed(c); } };
                    for (const root of this._parsedRoots) seed(root);
                    this.collapsedThreadsSeeded = true;
                }
            } catch (err) {
                console.error(err);
                this.reviewThoughtsContainer.createEl('p', { text: 'Error loading thoughts.', attr: { style: 'color: var(--text-error);' } });
                return;
            }

            this.thoughtsRowContainer = this.reviewThoughtsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
        }

        if (!this.thoughtsRowContainer || !file) return;

        this.reviewThoughtsContainer.querySelector('.mina-load-more')?.remove();

        if (this._parsedRoots.length === 0 && !appendMore) {
            this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts matching filters.', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        const slice = this._parsedRoots.slice(this.thoughtsOffset, this.thoughtsOffset + this.PAGE_SIZE);

        const renderRecursive = async (entry: ThoughtEntry, level: number) => {
            try {
                await this.renderThoughtRow(entry, this.thoughtsRowContainer!, file.path, level);
            } catch (err) {
                console.error('MINA: renderThoughtRow failed', err);
                this.thoughtsRowContainer!.createEl('div', { text: '[Error rendering entry]', attr: { style: 'color:var(--text-error);font-size:0.8em;padding:4px 8px;' } });
            }
            if (entry.children.length > 0 && !this.collapsedThreads.has(entry.id)) {
                for (const child of entry.children) await renderRecursive(child, level + 1);
            }
        };

        for (const root of slice) await renderRecursive(root, 0);
        this.thoughtsOffset += slice.length;

        const remaining = this._parsedRoots.length - this.thoughtsOffset;
        if (remaining > 0) {
            const btn = this.reviewThoughtsContainer.createEl('button', {
                text: `Load ${Math.min(remaining, this.PAGE_SIZE)} more thoughts…`,
                cls: 'mina-load-more',
                attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' }
            });
            btn.addEventListener('click', () => this.updateReviewThoughtsList(true));
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
                    this.invalidateCache(fullPath);
                    new Notice('Deleted successfully');
                } else {
                    const parts = newText.split('|');
                    const dateCol = ` [[${toAsciiDigits(moment().locale('en').format(this.plugin.settings.dateFormat))}]] `;
                    const timeCol = ` ${toAsciiDigits(moment().locale('en').format(this.plugin.settings.timeFormat))} `;
                    
                    let parentId = '';
                    if (isTask) {
                        if (parts.length >= 9) { parts[4] = dateCol; parts[5] = timeCol; }
                    } else {
                        if (parts.length >= 9) { parts[5] = dateCol; parts[6] = timeCol; parentId = parts[2].trim(); }
                    }
                    lines[lineIndex] = parts.join('|');

                    if (!isTask && parentId) {
                        let currentParentToFind = parentId;
                        while (currentParentToFind) {
                            let found = false;
                            for (let i = 2; i < lines.length; i++) {
                                const rowParts = lines[i].split('|');
                                if (rowParts.length >= 2 && rowParts[1].trim() === currentParentToFind) {
                                    rowParts[5] = dateCol; rowParts[6] = timeCol;
                                    lines[i] = rowParts.join('|');
                                    currentParentToFind = rowParts[2].trim();
                                    found = true; break;
                                }
                            }
                            if (!found) break;
                        }
                    }

                    await vault.modify(file, lines.join('\n'));
                    this.invalidateCache(fullPath);
                    new Notice('Updated successfully');
                }
            }
        } catch (error) { new Notice('Error updating file.'); }
    }

    async updatePreview() {
        // Invalidate cache so the next read picks up the freshly written content
        const folderPath = this.plugin.settings.captureFolder.trim();
        const thoughtsPath = folderPath && folderPath !== '/' ? `${folderPath}/${this.plugin.settings.captureFilePath.trim()}` : this.plugin.settings.captureFilePath.trim();
        const tasksPath = folderPath && folderPath !== '/' ? `${folderPath}/${this.plugin.settings.tasksFilePath.trim()}` : this.plugin.settings.tasksFilePath.trim();
        this.invalidateCache(thoughtsPath);
        this.invalidateCache(tasksPath);

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
        this.hookInternalLinks(renderTarget, filePath);
        this.hookImageZoom(renderTarget);
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
            
            // Overdue indicator — shown on the row itself so it's visible at a glance
            if (dueDateRaw && !isDone) {
                const dueM = moment(dueDateRaw, ['YYYY-MM-DD', this.plugin.settings.dateFormat], true);
                const todayM = moment().startOf('day');
                if (dueM.isValid() && dueM.isBefore(todayM, 'day')) {
                    el.style.borderLeft = '3px solid var(--text-error)';
                    el.style.paddingLeft = '8px';
                    dueDateContainer.createSpan({
                        text: '⚠ OVERDUE',
                        attr: { style: 'color: var(--text-error); font-weight: 700; font-size: 0.85em; letter-spacing: 0.03em;' }
                    });
                }
            }

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
            const initialContext = contextStr; // already parsed correctly from the right column above
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

                    // Match the same schema thresholds used when reading contextStr above
                    const ctxIndex = parts.length >= 10 ? 8 : parts.length >= 8 ? 6 : 5;
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
        const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24;
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
        // Decode <br> storage artifact → real newlines so markdown lists/checklists render correctly
        const decodedText = entry.text.replace(/<br>/gi, '\n');
        const textWithContext = decodedText + (entry.context ? ' ' + entry.context : '');
        await MarkdownRenderer.render(this.plugin.app, textWithContext, renderTarget, filePath, this);
        this.hookInternalLinks(renderTarget, filePath);
        this.hookImageZoom(renderTarget);
        this.hookCheckboxes(renderTarget, entry);
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
                    // Match the same schema thresholds used when parsing ThoughtEntry
                    let textIndex: number, ctxIndex: number;
                    if (parts.length >= 9) { textIndex = 7; ctxIndex = 8; }       // 8-column new format
                    else if (parts.length >= 7) { textIndex = 5; ctxIndex = 6; }  // 6-column old format
                    else { textIndex = 3; ctxIndex = 4; }                          // legacy 4-column

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
                'gemini-2.0-flash':                  '2.0 Flash — stable, multimodal',
                'gemini-2.0-flash-lite':             '2.0 Flash Lite — budget-friendly',
                // Gemini 1.5
                'gemini-1.5-pro':                    '1.5 Pro — complex reasoning, prior flagship',
                'gemini-1.5-flash':                  '1.5 Flash — fast, previous gen',
                'gemini-1.5-flash-8b':               '1.5 Flash 8B — high-volume, lightweight',
            };
            for (const [value, label] of Object.entries(models)) {
                drop.addOption(value, label);
            }
            drop.setValue(this.plugin.settings.geminiModel || 'gemini-2.5-flash');
            drop.onChange(async (value) => { this.plugin.settings.geminiModel = value; await this.plugin.saveSettings(); });
        });
	}
}
