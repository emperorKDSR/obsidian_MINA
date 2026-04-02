import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, ItemView, WorkspaceLeaf, MarkdownRenderer, Platform, FuzzySuggestModal, SuggestModal, Modal, moment, addIcon, ViewStateResult } from 'obsidian';

export const VIEW_TYPE_MINA = "mina-v2-view";

// Custom icon — Alien head
const KATANA_ICON_ID = "mina-katana";
const MINA_ALIEN_PATH_HEAD = "M12 2C7.03 2 3 6.03 3 11c0 4.97 4.03 11 9 11s9-6.03 9-11c0-4.97-4.03-9-9-9z";
const MINA_ALIEN_PATH_EYE_L = "M9 11a3 2 0 0 1-3 2 3 2 0 0 1 3-2z";
const MINA_ALIEN_PATH_EYE_R = "M15 11a3 2 0 0 0 3 2 3 2 0 0 0-3-2z";

// addIcon content — transform maps 24x24 coords into Obsidian's 100×100 icon space
const KATANA_ICON_SVG = `<g transform="translate(2,2) scale(4)">
    <path d="${MINA_ALIEN_PATH_HEAD}" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="${MINA_ALIEN_PATH_EYE_L}" fill="#39FF14" stroke="none"/>
    <path d="${MINA_ALIEN_PATH_EYE_R}" fill="#39FF14" stroke="none"/>
</g>`;
const NINJA_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#39FF14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="${MINA_ALIEN_PATH_HEAD}"/>
    <path d="${MINA_ALIEN_PATH_EYE_L}" fill="#39FF14" stroke="none"/>
    <path d="${MINA_ALIEN_PATH_EYE_R}" fill="#39FF14" stroke="none"/>
</svg>`;
const WOLF_SVG = NINJA_AVATAR_SVG;

interface MinaSettings {
    captureFolder: string;
	captureFilePath: string;
    tasksFilePath: string;
    thoughtsFolder: string;
    tasksFolder: string;
    pfFolder: string;
	dateFormat: string;
    timeFormat: string;
    contexts: string[];
    selectedContexts: string[];
    geminiApiKey: string;
    geminiModel: string;
    maxOutputTokens: number;
    newNoteFolder: string;
    voiceMemoFolder: string;
    transcriptionLanguage: string;
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
	captureFilePath: 'mina_v2.md',
    tasksFilePath: 'mina_2.md',
    thoughtsFolder: '000 Bin/MINA V2',
    tasksFolder: '000 Bin/MINA V2 Tasks',
    pfFolder: '000 Bin/MINA V2 PF',
	dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    contexts: [], 
    selectedContexts: [],
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    maxOutputTokens: 65536,
    newNoteFolder: '000 Bin',
    voiceMemoFolder: '000 Bin/MINA V2 Voice',
    transcriptionLanguage: 'English'
}

export default class MinaPlugin extends Plugin {
	settings: MinaSettings;
    settingsInitialized: boolean = false;
    thoughtIndex: Map<string, ThoughtEntry> = new Map();
    taskIndex: Map<string, TaskEntry> = new Map();
    private thoughtIndexReady = false;
    private _thoughtIndexDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private _taskIndexDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();

        this.app.workspace.onLayoutReady(() => {
            this.scanForContexts();
            this.buildThoughtIndex();
            this.registerEvent(this.app.vault.on('create', async (f) => { if (this.isThoughtFile(f.path)) { await this.indexThoughtFile(f as TFile); this.notifyViewRefresh(); } }));
            this.registerEvent(this.app.vault.on('modify', async (f) => { if (this.isThoughtFile(f.path)) { await this.indexThoughtFile(f as TFile); this.notifyViewRefresh(); } }));
            this.registerEvent(this.app.vault.on('delete', (f) => { if (this.isThoughtFile(f.path)) { this.thoughtIndex.delete(f.path); this.notifyViewRefresh(); } }));
            this.registerEvent(this.app.vault.on('rename', (f, oldPath) => {
                if (this.isThoughtFile(oldPath)) this.thoughtIndex.delete(oldPath);
                if (this.isThoughtFile(f.path)) this.indexThoughtFile(f as TFile);
                this.notifyViewRefresh();
            }));

            this.buildTaskIndex();
            this.registerEvent(this.app.vault.on('create', async (f) => { if (this.isTaskFile(f.path)) { await this.indexTaskFile(f as TFile); this.notifyTaskViewRefresh(); } }));
            this.registerEvent(this.app.vault.on('modify', async (f) => { if (this.isTaskFile(f.path)) { await this.indexTaskFile(f as TFile); this.notifyTaskViewRefresh(); } }));
            this.registerEvent(this.app.vault.on('delete', (f) => { if (this.isTaskFile(f.path)) { this.taskIndex.delete(f.path); this.notifyTaskViewRefresh(); } }));
            this.registerEvent(this.app.vault.on('rename', async (f, oldPath) => {
                if (this.isTaskFile(oldPath)) this.taskIndex.delete(oldPath);
                if (this.isTaskFile(f.path)) await this.indexTaskFile(f as TFile);
                this.notifyTaskViewRefresh();
            }));
        });

        this.registerView(
            VIEW_TYPE_MINA,
            (leaf) => new MinaView(leaf, this)
        );

		addIcon(KATANA_ICON_ID, KATANA_ICON_SVG);

		const ribbonIconEl = this.addRibbonIcon(KATANA_ICON_ID, 'MINA V2', (evt: MouseEvent) => {
			this.activateView();
		});


		this.addCommand({
			id: 'open-mina-v2',
			name: 'Open MINA V2',
			icon: KATANA_ICON_ID,
			callback: () => {
				this.activateView();
			}
		});

		this.addCommand({
			id: 'open-mina-daily',
			name: 'Open MINA Daily',
			icon: KATANA_ICON_ID,
			callback: () => {
				this.activateView('daily');
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

    async activateView(tabId?: string) {
        const { workspace } = this.app;

        if (Platform.isMobile) {
            // Detach any existing MINA leaves
            workspace.getLeavesOfType(VIEW_TYPE_MINA).forEach(l => l.detach());

            if (isTablet()) {
                // iPad: reuse the active leaf so MINA fills the full workspace pane
                // (no new tab strip — the tab header is hidden in onOpen)
                const leaf = workspace.getLeaf(false);
                if (leaf) {
                    await leaf.setViewState({ 
                        type: VIEW_TYPE_MINA, 
                        active: true,
                        state: tabId ? { activeTab: tabId } : undefined
                    });
                    workspace.revealLeaf(leaf);
                }
            } else {
                // iPhone: open as a main content tab
                const leaf = workspace.getLeaf('tab');
                await leaf.setViewState({ 
                    type: VIEW_TYPE_MINA, 
                    active: true,
                    state: tabId ? { activeTab: tabId } : undefined
                });
                workspace.revealLeaf(leaf);
            }
            return;
        }

        // Desktop: reuse existing window or open new one
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
        if (leaves.length > 0) {
            leaf = leaves[0];
            if (tabId) {
                await leaf.setViewState({
                    type: VIEW_TYPE_MINA,
                    active: true,
                    state: { activeTab: tabId }
                });
            }
        } else {
            leaf = workspace.getLeaf('window');
            if (leaf) await leaf.setViewState({ 
                type: VIEW_TYPE_MINA, 
                active: true,
                state: tabId ? { activeTab: tabId } : undefined
            });
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
            if (loadedData.newNoteFolder !== undefined) this.settings.newNoteFolder = loadedData.newNoteFolder;
            if (loadedData.thoughtsFolder !== undefined) this.settings.thoughtsFolder = loadedData.thoughtsFolder;
            if (loadedData.tasksFolder !== undefined) this.settings.tasksFolder = loadedData.tasksFolder;
            if (loadedData.pfFolder !== undefined) this.settings.pfFolder = loadedData.pfFolder;
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

    generateThoughtFilename(): string {
        const now = new Date();
        const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
        const date = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
        const rand = Math.random().toString(36).substring(2, 5);
        return `${date}_${time}_${rand}.md`;
    }

    extractTitle(text: string): string {
        const firstLine = text.split('\n').find(l => l.trim()) || text;
        return firstLine.replace(/[#*_`\[\]]/g, '').trim().substring(0, 60);
    }

    buildFrontmatter(title: string, created: string, modified: string, dayStr: string, contexts: string[]): string {
        const contextYaml = contexts.length > 0 ? contexts.map(c => `  - ${c}`).join('\n') : '  []';
        const tagsYaml = contextYaml;
        return `---\ntitle: "${title.replace(/"/g, "'")}"\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: MINA\ncontext:\n${contextYaml}\ntags:\n${tagsYaml}\n---\n`;
    }

    async createThoughtFile(text: string, contexts: string[]): Promise<TFile> {
        const { vault } = this.app;
        const folder = this.settings.thoughtsFolder.trim() || '000 Bin/MINA V2';
        const parts = folder.split('/');
        let pathSoFar = '';
        for (const part of parts) {
            pathSoFar = pathSoFar ? pathSoFar + '/' + part : part;
            if (!vault.getAbstractFileByPath(pathSoFar)) {
                try { await vault.createFolder(pathSoFar); } catch {}
            }
        }
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const title = this.extractTitle(text);
        const fm = this.buildFrontmatter(title, created, created, dayStr, contexts);
        const filename = this.generateThoughtFilename();
        const fullPath = `${folder}/${filename}`;
        try {
            const file = await vault.create(fullPath, fm + text);
            new Notice('Thought saved!');
            return file;
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
            throw e;
        }
    }

    async appendReplyToFile(parentPath: string, text: string): Promise<boolean> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(parentPath) as TFile;
        if (!file) {
            new Notice('MINA Error: parent thought not found');
            return false;
        }
        try {
            const now = new Date();
            const anchor = `reply-${Date.now()}`;
            const dateStr = this.formatDate(now);
            const timeStr = this.formatTime(now);
            const header = `## [[${dateStr}]] ${timeStr} ^${anchor}`;
            const existing = await vault.read(file);
            const updated = existing.trimEnd() + `\n\n${header}\n${text}\n`;
            await vault.modify(file, updated);
            await this.updateModifiedFrontmatter(file, now);
            return true;
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
            return false;
        }
    }

    async updateModifiedFrontmatter(file: TFile, now: Date): Promise<void> {
        const { vault } = this.app;
        try {
            const raw = await vault.read(file);
            const content = raw.replace(/\r\n/g, '\n');
            const modified = this.formatDateTime(now);
            const updated = content.replace(/^modified: .+$/m, `modified: ${modified}`);
            if (updated !== raw) await vault.modify(file, updated);
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    async editThoughtBody(filePath: string, newText: string, contexts: string[]): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const content = (await vault.read(file)).replace(/\r\n/g, '\n');
            const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
            if (!fmMatch) return;
            const bodyStart = fmMatch[0].length;
            const body = content.slice(bodyStart);
            const replyIdx = body.search(/^## \[\[/m);
            const replies = replyIdx >= 0 ? body.slice(replyIdx) : '';
            const now = new Date();
            const dayStr = this.formatDate(now);
            const title = this.extractTitle(newText);
            const modifiedStr = this.formatDateTime(now);
            const oldFm = fmMatch[0];
            const createdMatch = oldFm.match(/^created: (.+)$/m);
            const created = createdMatch ? createdMatch[1] : modifiedStr;
            const newFm = this.buildFrontmatter(title, created, modifiedStr, dayStr, contexts);
            await vault.modify(file, newFm + newText + (replies ? '\n\n' + replies : '\n'));
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    async editReply(filePath: string, anchor: string, newText: string): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const content = (await vault.read(file)).replace(/\r\n/g, '\n');
            const lines = content.split('\n');
            const headerIdx = lines.findIndex(l => l.includes(`^${anchor}`));
            if (headerIdx < 0) return;
            let endIdx = lines.findIndex((l, i) => i > headerIdx && l.startsWith('## '));
            if (endIdx < 0) endIdx = lines.length;
            const newLines = [...lines.slice(0, headerIdx + 1), newText, ...lines.slice(endIdx)];
            await vault.modify(file, newLines.join('\n'));
            await this.updateModifiedFrontmatter(file, new Date());
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    async deleteThoughtFile(filePath: string): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const trashFolder = (this.settings.thoughtsFolder.trim() || '000 Bin/MINA V2') + '/trash';
            if (!vault.getAbstractFileByPath(trashFolder)) {
                await vault.createFolder(trashFolder);
            }
            const baseTrashPath = `${trashFolder}/${file.name}`;
            const trashPath = vault.getAbstractFileByPath(baseTrashPath)
                ? `${trashFolder}/${file.basename}_${Date.now()}.md`
                : baseTrashPath;
            await vault.rename(file, trashPath);
            new Notice('Thought moved to trash.');
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    async deleteReply(filePath: string, anchor: string): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const content = (await vault.read(file)).replace(/\r\n/g, '\n');
            const lines = content.split('\n');
            const headerIdx = lines.findIndex(l => l.includes(`^${anchor}`));
            if (headerIdx < 0) return;
            let endIdx = lines.findIndex((l, i) => i > headerIdx && l.startsWith('## '));
            if (endIdx < 0) endIdx = lines.length;
            const start = headerIdx > 0 && lines[headerIdx - 1] === '' ? headerIdx - 1 : headerIdx;
            const newLines = [...lines.slice(0, start), ...lines.slice(endIdx)];
            await vault.modify(file, newLines.join('\n'));
            await this.updateModifiedFrontmatter(file, new Date());
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    formatDateTime(d: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    formatDate(d: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }

    formatTime(d: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    isThoughtFile(path: string): boolean {
        const folder = (this.settings.thoughtsFolder.trim() || '000 Bin/MINA V2').replace(/\\/g, '/');
        const trashFolder = folder + '/trash';
        return path.startsWith(folder + '/') && !path.startsWith(trashFolder + '/') && path.endsWith('.md');
    }

    async buildThoughtIndex(): Promise<void> {
        const folder = this.settings.thoughtsFolder.trim() || '000 Bin/MINA V2';
        const folderObj = this.app.vault.getAbstractFileByPath(folder);
        if (!folderObj) { this.thoughtIndexReady = true; this.notifyViewRefresh(); return; }
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isThoughtFile(f.path));
        this.thoughtIndex.clear();
        for (const f of files) {
            await this.indexThoughtFile(f);
        }
        this.thoughtIndexReady = true;
        this.notifyViewRefresh();
    }

    async indexThoughtFile(file: TFile): Promise<void> {
        try {
            const content = await this.app.vault.read(file);
            const entry = this.parseThoughtFile(file.path, content);
            if (entry) this.thoughtIndex.set(file.path, entry);
        } catch {}
    }

    parseThoughtFile(filePath: string, content: string): ThoughtEntry | null {
        content = content.replace(/\r\n/g, '\n');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (!fmMatch) return null;
        const fm = fmMatch[1];
        const body = content.slice(fmMatch[0].length);

        const get = (key: string) => { const m = fm.match(new RegExp(`^${key}: (.+)$`, 'm')); return m ? m[1].trim() : ''; };
        const getList = (key: string): string[] => {
            const m = fm.match(new RegExp(`^${key}:\\n((?:\\s*- .+\\n?)+)`, 'm'));
            if (!m) return [];
            return m[1].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^\s*-\s*/, '').trim());
        };

        const title   = get('title').replace(/^"|"$/g, '');
        const created = get('created');
        const modified = get('modified');
        const day     = get('day').replace(/^\"|\"$|^\[\[|\]\]$/g, '').replace(/['"]/g, '');
        const area    = get('area');
        if (area !== 'MINA') return null;
        const context = getList('context');

        const replyRegex = /^## \[\[[\d-]+\]\] [\d:]+ \^(reply-\d+)/gm;
        const children: ReplyEntry[] = [];
        let bodyText = body;
        let match;
        const sections: { headerIdx: number; anchor: string; dateStr: string; timeStr: string }[] = [];
        while ((match = replyRegex.exec(body)) !== null) {
            const headerLine = body.slice(match.index, body.indexOf('\n', match.index));
            const dateM = headerLine.match(/\[\[([\d-]+)\]\]/);
            const timeM = headerLine.match(/\]\] ([\d:]+)/);
            sections.push({ headerIdx: match.index, anchor: match[1], dateStr: dateM?.[1] || '', timeStr: timeM?.[1] || '' });
        }
        if (sections.length > 0) {
            bodyText = body.slice(0, sections[0].headerIdx).trim();
            for (let i = 0; i < sections.length; i++) {
                const s = sections[i];
                const start = body.indexOf('\n', sections[i].headerIdx) + 1;
                const end = i + 1 < sections.length ? sections[i + 1].headerIdx : body.length;
                children.push({ anchor: s.anchor, date: s.dateStr, time: s.timeStr, text: body.slice(start, end).trim() });
            }
        }

        const parsedModMs = Date.parse(modified ? modified.replace(' ', 'T') : '');
        const modMs = isNaN(parsedModMs) ? 0 : parsedModMs;
        const parsedLastChild = children.length > 0 ? Date.parse(children[children.length-1].date + 'T' + children[children.length-1].time) : NaN;
        const lastChild = isNaN(parsedLastChild) ? 0 : parsedLastChild;

        return { filePath, title, created, modified, day, context, body: bodyText, children, lastThreadUpdate: Math.max(modMs, lastChild) };
    }

    notifyViewRefresh(): void {
        if (this._thoughtIndexDebounceTimer) clearTimeout(this._thoughtIndexDebounceTimer);
        this._thoughtIndexDebounceTimer = setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINA);
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && typeof view.updateReviewThoughtsList === 'function') {
                    view.updateReviewThoughtsList();
                }
            }
        }, 300);
    }

    isTaskFile(path: string): boolean {
        const folder = (this.settings.tasksFolder.trim() || '000 Bin/MINA V2 Tasks').replace(/\\/g, '/');
        const trashFolder = folder + '/trash';
        return path.startsWith(folder + '/') && !path.startsWith(trashFolder + '/') && path.endsWith('.md');
    }

    async buildTaskIndex(): Promise<void> {
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isTaskFile(f.path));
        this.taskIndex.clear();
        for (const f of files) await this.indexTaskFile(f);
        this.notifyTaskViewRefresh();
    }

    async indexTaskFile(file: TFile): Promise<void> {
        try {
            const content = await this.app.vault.read(file);
            const entry = this.parseTaskFile(file.path, content);
            if (entry) this.taskIndex.set(file.path, entry);
            else this.taskIndex.delete(file.path);
        } catch {}
    }

    parseTaskFile(filePath: string, content: string): TaskEntry | null {
        content = content.replace(/\r\n/g, '\n');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (!fmMatch) return null;
        const fm = fmMatch[1];
        const body = content.slice(fmMatch[0].length).trim();

        const get = (key: string) => { const m = fm.match(new RegExp(`^${key}: (.+)$`, 'm')); return m ? m[1].trim() : ''; };
        const getList = (key: string): string[] => {
            const m = fm.match(new RegExp(`^${key}:\\n((?:\\s*- .+\\n?)+)`, 'm'));
            if (!m) return [];
            return m[1].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^\s*-\s*/, '').trim());
        };

        const area = get('area');
        if (area !== 'MINA_TASKS') return null;

        const title    = get('title').replace(/^"|"$/g, '');
        const created  = get('created');
        const modified = get('modified');
        const day      = get('day').replace(/['"[\]]/g, '');
        const status   = get('status') === 'done' ? 'done' : 'open';
        const dueRaw   = get('due').replace(/['"[\]]/g, '');
        const context  = getList('context');
        const parsedLastUpdate = Date.parse(modified ? modified.replace(' ', 'T') : '');
        const lastUpdate = isNaN(parsedLastUpdate) ? 0 : parsedLastUpdate;

        return { filePath, title, created, modified, day, status, due: dueRaw, context, body, lastUpdate };
    }

    notifyTaskViewRefresh(): void {
        if (this._taskIndexDebounceTimer) clearTimeout(this._taskIndexDebounceTimer);
        this._taskIndexDebounceTimer = setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINA);
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && typeof view.updateReviewTasksList === 'function') {
                    view.updateReviewTasksList();
                }
            }
        }, 300);
    }

    generateTaskFilename(): string {
        const now = new Date();
        const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
        const date = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
        const rand = Math.random().toString(36).substring(2, 5);
        return `${date}_${time}_${rand}.md`;
    }

    buildTaskFrontmatter(title: string, created: string, modified: string, dayStr: string, status: string, due: string, contexts: string[]): string {
        const contextYaml = contexts.length > 0 ? contexts.map(c => `  - ${c}`).join('\n') : '  []';
        const dueYaml = due ? `"[[${due}]]"` : '""';
        return `---\ntitle: "${title.replace(/"/g, "'")}"\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: MINA_TASKS\nstatus: ${status}\ndue: ${dueYaml}\ncontext:\n${contextYaml}\ntags:\n${contextYaml}\n---\n`;
    }

    async createTaskFile(text: string, contexts: string[], dueDate?: string): Promise<TFile> {
        const { vault } = this.app;
        const folder = this.settings.tasksFolder.trim() || '000 Bin/MINA V2 Tasks';
        const parts = folder.split('/');
        let pathSoFar = '';
        for (const part of parts) {
            pathSoFar = pathSoFar ? pathSoFar + '/' + part : part;
            if (!vault.getAbstractFileByPath(pathSoFar)) {
                try { await vault.createFolder(pathSoFar); } catch {}
            }
        }
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const title = this.extractTitle(text);
        const due = dueDate || '';
        const fm = this.buildTaskFrontmatter(title, created, created, dayStr, 'open', due, contexts);
        const filename = this.generateTaskFilename();
        try {
            const file = await vault.create(`${folder}/${filename}`, fm + text);
            new Notice('Task saved!');
            return file;
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
            throw e;
        }
    }

    async toggleTaskStatus(filePath: string, done: boolean): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const content = (await vault.read(file)).replace(/\r\n/g, '\n');
            const newStatus = done ? 'done' : 'open';
            let updated: string;
            if (/^status:\s*(open|done)/m.test(content)) {
                updated = content.replace(/^status:\s*(open|done).*/m, `status: ${newStatus}`);
            } else {
                updated = content.replace(/^(---\n[\s\S]*?)\n---/m, `$1\nstatus: ${newStatus}\n---`);
            }
            if (updated !== content) {
                const withMod = updated.replace(/^modified: .+$/m, `modified: ${this.formatDateTime(new Date())}`);
                await vault.modify(file, withMod);
            }
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    async editTaskBody(filePath: string, newText: string, contexts: string[], dueDate?: string): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const content = (await vault.read(file)).replace(/\r\n/g, '\n');
            const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
            if (!fmMatch) return;
            const oldFm = fmMatch[0];
            const createdMatch = oldFm.match(/^created: (.+)$/m);
            const statusMatch = oldFm.match(/^status: (.+)$/m);
            const created = createdMatch ? createdMatch[1].trim() : this.formatDateTime(new Date());
            const status = statusMatch ? statusMatch[1].trim() : 'open';
            const now = new Date();
            const title = this.extractTitle(newText);
            const due = dueDate ?? (oldFm.match(/^due: "?\[?\[?([\d-]*)\]?\]?"?$/m)?.[1] || '');
            const newFm = this.buildTaskFrontmatter(title, created, this.formatDateTime(now), this.formatDate(now), status, due, contexts);
            await vault.modify(file, newFm + newText + '\n');
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    async deleteTaskFile(filePath: string): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const trashFolder = (this.settings.tasksFolder.trim() || '000 Bin/MINA V2 Tasks') + '/trash';
            if (!vault.getAbstractFileByPath(trashFolder)) await vault.createFolder(trashFolder);
            const baseTrashPath = `${trashFolder}/${file.name}`;
            const trashPath = vault.getAbstractFileByPath(baseTrashPath)
                ? `${trashFolder}/${file.basename}_${Date.now()}.md`
                : baseTrashPath;
            await vault.rename(file, trashPath);
            new Notice('Task moved to trash.');
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }
}

type FileOrCreate = TFile | string;

export class FileSuggestModal extends SuggestModal<FileOrCreate> {
    onChoose: (file: TFile) => void;
    newNoteFolder: string;

    constructor(app: App, onChoose: (file: TFile) => void, newNoteFolder: string = '000 Bin') {
        super(app);
        this.onChoose = onChoose;
        this.newNoteFolder = newNoteFolder;
        this.setPlaceholder('Search notes… or type a name to create one');
    }

    getSuggestions(query: string): FileOrCreate[] {
        const q = query.toLowerCase().trim();
        const files = this.app.vault.getFiles()
            .filter(f => f.extension === 'md')
            .filter(f => !q || f.basename.toLowerCase().includes(q))
            .sort((a, b) => a.basename.localeCompare(b.basename));

        const results: FileOrCreate[] = [...files];

        // Offer "create" when query is non-empty and no file has that exact basename
        if (q && !files.some(f => f.basename.toLowerCase() === q)) {
            results.unshift(query.trim());
        }

        return results;
    }

    renderSuggestion(item: FileOrCreate, el: HTMLElement) {
        if (typeof item === 'string') {
            el.style.cssText = 'display:flex; align-items:center; gap:6px;';
            el.createSpan({ text: '＋', attr: { style: 'font-weight:700; color:var(--interactive-accent); font-size:1.1em;' } });
            el.createEl('div', {
                attr: { style: 'display:flex; flex-direction:column;' }
            }).createEl('span', {
                text: `Create "${item}"`,
                attr: { style: 'color:var(--interactive-accent); font-style:italic;' }
            });
        } else {
            const wrap = el.createEl('div', { attr: { style: 'display:flex; flex-direction:column;' } });
            wrap.createEl('span', { text: item.basename });
            if (item.parent && item.parent.path !== '/') {
                wrap.createEl('span', { text: item.parent.path, attr: { style: 'font-size:0.8em; color:var(--text-muted);' } });
            }
        }
    }

    async onChooseSuggestion(item: FileOrCreate, evt: MouseEvent | KeyboardEvent) {
        if (typeof item === 'string') {
            try {
                const folder = this.newNoteFolder.trim().replace(/\/$/, '');
                const path = folder ? `${folder}/${item}.md` : `${item}.md`;
                // Ensure folder exists
                if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
                    await this.app.vault.createFolder(folder);
                }
                const newFile = await this.app.vault.create(path, '');
                this.onChoose(newFile);
            } catch (e: any) {
                new Notice(`Could not create note: ${e.message}`);
            }
        } else {
            this.onChoose(item);
        }
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
                    }, this.plugin.settings.newNoteFolder);
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

class ConvertToTaskModal extends Modal {
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

        // Preview of thought text
        const preview = contentEl.createEl('div', { attr: { style: 'font-size: 0.85em; color: var(--text-muted); background: var(--background-secondary); border-radius: 4px; padding: 8px 10px; margin-bottom: 14px; max-height: 80px; overflow-y: auto; word-break: break-word;' } });
        preview.setText(this.thoughtText.length > 120 ? this.thoughtText.substring(0, 120) + '…' : this.thoughtText);

        // Due date picker
        const label = contentEl.createEl('label', { text: 'Due Date', attr: { style: 'font-size: 0.9em; font-weight: 600; display: block; margin-bottom: 6px;' } });
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
        // Also allow Enter key to confirm
        dateInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.onConvert(dateInput.value); this.close(); } });
        setTimeout(() => dateInput.focus(), 50);
    }

    onClose() { this.contentEl.empty(); }
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
    private defaultPayDate: string;

    constructor(app: App, file: TFile, currentDueDate: string, onPaid: () => void, defaultPayDate?: string) {
        super(app);
        this.file = file;
        this.currentDueDate = currentDueDate;
        this.onPaid = onPaid;
        this.defaultPayDate = defaultPayDate || moment().format('YYYY-MM-DD');
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
        dateInput.value = this.defaultPayDate;

        // Next Due Date
        const nextDueWrap = field('Next Due Date');
        const nextDueInput = nextDueWrap.createEl('input', { type: 'date', attr: { style: 'padding: 5px 8px; border-radius: 5px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.9em;' } });
        
        // Initial setup for next due date
        const updateNextDueDate = () => {
            const payDate = dateInput.value;
            if (payDate) {
                nextDueInput.value = moment(payDate).add(1, 'month').format('YYYY-MM-DD');
            }
        };
        updateNextDueDate();

        // Update next due date when payment date changes
        dateInput.addEventListener('change', updateNextDueDate);

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
                const newDue = nextDueInput.value 
                    ? nextDueInput.value 
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

interface ReplyEntry {
    anchor: string;   // e.g. "reply-1774590963512"
    date: string;     // YYYY-MM-DD
    time: string;     // HH:mm:ss
    text: string;     // reply body text
}

interface ThoughtEntry {
    filePath: string;          // vault path to the file
    title: string;             // from frontmatter
    created: string;           // YYYY-MM-DD HH:mm:ss
    modified: string;          // YYYY-MM-DD HH:mm:ss
    day: string;               // e.g. "2026-03-28"
    context: string[];         // from frontmatter context list
    body: string;              // text before first ## reply header
    children: ReplyEntry[];    // parsed from ## sections in body
    lastThreadUpdate: number;  // ms timestamp for sorting
}

interface TaskEntry {
    filePath: string;
    title: string;
    created: string;       // "YYYY-MM-DD HH:mm:ss"
    modified: string;
    day: string;           // "YYYY-MM-DD"
    status: 'open' | 'done';
    due: string;           // "YYYY-MM-DD" or ""
    context: string[];
    body: string;
    lastUpdate: number;    // ms timestamp of modified for sorting
}

class NotePickerModal extends FuzzySuggestModal<TFile> {
    onChoose: (file: TFile) => void;
    constructor(app: App, onChoose: (file: TFile) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder('Search notes to ground the chat on…');
    }
    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles().sort((a, b) => a.basename.localeCompare(b.basename));
    }
    getItemText(file: TFile): string {
        return file.basename + ' — ' + file.path;
    }
    onChooseItem(file: TFile): void {
        this.onChoose(file);
    }
}

class MinaView extends ItemView {
    plugin: MinaPlugin;
    content: string;
    isTask: boolean;
    dueDate: string; // YYYY-MM-DD
    activeTab: 'daily' | 'review-tasks' | 'review-thoughts' | 'mina-ai' | 'settings' | 'dues' | 'vo' = 'daily';

    // Voice Recording State
    mediaRecorder: MediaRecorder | null = null;
    audioChunks: Blob[] = [];
    isRecording: boolean = false;
    recordingStartTime: number = 0;
    recordingTimerInterval: any = null;
    playbackAudio: HTMLAudioElement | null = null;
    currentObjectUrl: string | null = null;

    // AI Chat State
    chatHistory: { role: 'user' | 'assistant'; text: string }[] = [];
    chatContainer: HTMLElement;
    groundedNotes: TFile[] = [];
    groundedNotesBar: HTMLElement | null = null;
    webSearchEnabled: boolean = false;
    
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
    thoughtsFilterDate: string = 'last-5-days';
    thoughtsFilterDateStart: string = '';
    thoughtsFilterDateEnd: string = '';
    thoughtsFilterTodo: boolean = false;
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
    getDisplayText() { return "MINA V2"; }
    getIcon() { return KATANA_ICON_ID; }

    getState() {
        return { activeTab: this.activeTab };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state && state.activeTab) {
            this.activeTab = state.activeTab;
            this.renderView();
        }
        await super.setState(state, result);
    }

    async detachTab(tabId: any) {
        const leaf = this.app.workspace.getLeaf('window');
        await leaf.setViewState({
            type: VIEW_TYPE_MINA,
            active: true,
            state: { activeTab: tabId }
        });
    }

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
            // Desktop: ensure container is flex column
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.height = '100%';
            container.style.overflow = 'hidden';

            // Drag handle for desktop
            const dragHandle = container.createEl('div', { attr: { style: 'height: 14px; width: 100%; -webkit-app-region: drag; flex-shrink: 0; display: flex; justify-content: center; align-items: center; margin-bottom: 8px; cursor: grab;' } });
            dragHandle.createEl('div', { attr: { style: 'width: 40px; height: 4px; background-color: var(--background-modifier-border); border-radius: 4px;' }});
        }

        // --- Navigation Tabs ---
        const nav = container.createEl('div', { attr: { style: 'display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px; flex-shrink: 0;' } });

        const addTab = (id: string, label: string) => {
            const btnWrap = nav.createEl('div', { attr: { style: 'flex: 1; display: flex; align-items: stretch; gap: 0;' } });
            const hasPopout = !Platform.isMobile && id !== 'settings';
            
            const btn = btnWrap.createEl('button', { 
                text: label, 
                attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${hasPopout ? 'border-top-right-radius: 0; border-bottom-right-radius: 0;' : ''} ${this.activeTab === id ? 'background-color: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);' : ''}` } 
            });
            btn.addEventListener('click', () => { this.activeTab = id as any; this.renderView(); });
            
            if (hasPopout) {
                const detachBtn = btnWrap.createEl('button', {
                    text: '⧉',
                    attr: { title: 'Pop out tab', style: `padding: 5px 4px; font-size: 0.7em; border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 1px solid var(--background-modifier-border); ${this.activeTab === id ? 'background-color: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);' : ''}` }
                });
                detachBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.detachTab(id);
                });
            }
        };

        addTab('daily', 'Da');
        addTab('review-thoughts', 'Th');
        addTab('review-tasks', 'Ta');
        addTab('mina-ai', 'Ai');
        addTab('dues', 'Du');
        addTab('vo', 'Vo');
        addTab('settings', 'Se');

        if (this.activeTab === 'review-tasks') {
            this.renderReviewTasksMode(container);
        } else if (this.activeTab === 'mina-ai') {
            this.renderMinaMode(container);
        } else if (this.activeTab === 'dues') {
            this.renderDuesMode(container);
        } else if (this.activeTab === 'settings') {
            this.renderSettingsMode(container);
        } else if (this.activeTab === 'vo') {
            this.renderVoiceMode(container);
        } else if (this.activeTab === 'daily') {
            this.renderDailyMode(container);
        } else {
            this.renderReviewThoughtsMode(container);
        }
    }

    renderDailyMode(container: HTMLElement) {
        const wrap = container.createEl('div', { 
            attr: { 
                style: 'padding: 12px 12px 200px 12px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch;' 
            } 
        });

        const header = wrap.createEl('div', { 
            attr: { 
                style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);' 
            } 
        });

        header.createEl('h3', { 
            text: `Daily View — ${moment().format('YYYY-MM-DD')}`,
            attr: { 
                style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' 
            } 
        });

        wrap.createEl('p', { 
            text: 'This is the new Daily View tab. Implementation is coming soon.',
            attr: { 
                style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 40px;' 
            } 
        });
    }

    renderDuesMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 12px 12px 200px 12px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch;' } });

        // Header row: title + Add button
        const duesHeaderRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;' } });
        duesHeaderRow.createEl('span', { text: 'Personal Finance', attr: { style: 'font-size: 0.9em; font-weight: 600; color: var(--text-muted);' } });
        const addBtn = duesHeaderRow.createEl('button', { text: '+ Add', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
        addBtn.addEventListener('click', () => {
            new NewDueModal(this.plugin.app, this.plugin.settings.pfFolder, () => this.renderView()).open();
        });

        // Filter row: pill toggle for Recurring Payments
        const filterRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;' } });
        filterRow.createEl('span', { text: 'Filter:', attr: { style: 'font-size: 0.78em; color: var(--text-muted);' } });

        let recurringOnly = false;
        let activeOnly = true;
        const pillStyle = (active: boolean) =>
            `padding: 3px 12px; border-radius: 20px; border: 1.5px solid var(--interactive-accent); font-size: 0.78em; font-weight: 600; cursor: pointer; transition: all 0.15s; background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'};`;

        const recurringPill = filterRow.createEl('button', { text: 'Recurring', attr: { style: pillStyle(false) } });
        const activePill = filterRow.createEl('button', { text: 'Active', attr: { style: pillStyle(true) } });

        const { metadataCache, vault } = this.plugin.app;
        const pfFolder = (this.plugin.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');

        interface DueEntry { title: string; path: string; dueDate: string; lastPayment: string; dueMoment: any; hasRecurring: boolean; isActive: boolean; }

        const buildEntries = (): DueEntry[] => {
            const all: DueEntry[] = [];
            for (const file of vault.getMarkdownFiles()) {
                if (!file.path.startsWith(pfFolder + '/') && file.path !== pfFolder) continue;
                const fm = metadataCache.getFileCache(file)?.frontmatter;
                const dueDate = (fm?.['next_duedate'] ?? '').toString().trim();
                const lastPayment = (fm?.['last_payment'] ?? '').toString().trim();
                const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;
                const hasRecurring = !!(dueDate);
                const activeStatus = fm?.['active_status'];
                const isActive = activeStatus === true || activeStatus === 'true' || activeStatus === 'True';
                all.push({ title: file.basename, path: file.path, dueDate, lastPayment, dueMoment, hasRecurring, isActive });
            }
            all.sort((a, b) => {
                if (!a.dueMoment?.isValid() && !b.dueMoment?.isValid()) return a.title.localeCompare(b.title);
                if (!a.dueMoment?.isValid()) return 1;
                if (!b.dueMoment?.isValid()) return -1;
                return a.dueMoment.valueOf() - b.dueMoment.valueOf();
            });
            return all;
        };

        // Table container (re-rendered on filter change)
        const tableWrap = wrap.createEl('div');

        const renderTable = () => {
            tableWrap.empty();
            const entries = buildEntries().filter(e => (!recurringOnly || e.hasRecurring) && (!activeOnly || e.isActive));

            if (entries.length === 0) {
                tableWrap.createEl('p', { text: 'No entries found.', attr: { style: 'color: var(--text-muted); font-size: 0.85em;' } });
                return;
            }

            const table = tableWrap.createEl('table', { attr: { style: 'width: 100%; border-collapse: collapse; font-size: 0.88em;' } });
            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');
            ['Payable', 'Due Date', 'Last Payment', ''].forEach(h => {
                headerRow.createEl('th', { text: h, attr: { style: 'text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--background-modifier-border); color: var(--text-muted); font-weight: 600; white-space: nowrap;' } });
            });

            const tbody = table.createEl('tbody');
            const today = moment().startOf('day');

            entries.forEach(entry => {
                const tr = tbody.createEl('tr', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border); transition: background 0.15s;' } });
                tr.addEventListener('mouseenter', () => tr.style.background = 'var(--background-secondary)');
                tr.addEventListener('mouseleave', () => tr.style.background = '');

                // Payable
                const tdPayable = tr.createEl('td', { attr: { style: 'padding: 7px 10px;' } });
                const link = tdPayable.createEl('a', { text: entry.title, attr: { style: 'color: var(--text-accent); cursor: pointer; text-decoration: none; font-weight: 500;' } });
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.plugin.app.workspace.openLinkText(entry.title, entry.path, Platform.isMobile ? 'tab' : 'window');
                });

                // Due Date
                const tdDue = tr.createEl('td', { attr: { style: 'padding: 7px 10px; white-space: nowrap;' } });
                if (entry.dueMoment?.isValid()) {
                    const isOverdue = entry.dueMoment.isBefore(today);
                    const isToday = entry.dueMoment.isSame(today, 'day');
                    const color = isOverdue ? 'var(--text-error)' : isToday ? 'var(--interactive-accent)' : 'var(--text-normal)';
                    tdDue.createEl('span', { text: entry.dueDate, attr: { style: `color: ${color}; font-weight: ${isOverdue || isToday ? '600' : '400'};` } });
                    if (isOverdue) tdDue.createEl('span', { text: ' ⚠', attr: { style: 'color: var(--text-error); font-size: 0.85em;' } });
                } else {
                    tdDue.createEl('span', { text: '—', attr: { style: 'color: var(--text-muted);' } });
                }

                // Last Payment
                tr.createEl('td', { text: entry.lastPayment || '—', attr: { style: 'padding: 7px 10px; color: var(--text-muted); white-space: nowrap;' } });

                // Pay button (only for recurring entries with due dates)
                const tdPay = tr.createEl('td', { attr: { style: 'padding: 4px 8px; text-align: right;' } });
                if (entry.hasRecurring) {
                    const payWrap = tdPay.createEl('div', { attr: { style: 'display: flex; gap: 6px; justify-content: flex-end; align-items: center;' } });
                    
                    const quickDateInput = payWrap.createEl('input', { type: 'date', attr: { style: 'padding: 2px 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.85em;' } });
                    quickDateInput.value = moment().format('YYYY-MM-DD');

                    const payBtn = payWrap.createEl('button', { text: 'Pay', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
                    payBtn.addEventListener('click', () => {
                        const fileObj = vault.getFileByPath(entry.path) as TFile;
                        if (!fileObj) { new Notice('Note file not found.'); return; }
                        new PaymentModal(this.plugin.app, fileObj, entry.dueDate, () => { this.renderView(); }, quickDateInput.value).open();
                    });
                }
            });
        };

        recurringPill.addEventListener('click', () => {
            recurringOnly = !recurringOnly;
            recurringPill.setAttribute('style', pillStyle(recurringOnly));
            renderTable();
        });

        activePill.addEventListener('click', () => {
            activeOnly = !activeOnly;
            activePill.setAttribute('style', pillStyle(activeOnly));
            renderTable();
        });

        renderTable();
    }

    renderSettingsMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex-grow: 1; padding-bottom: 200px;' } });

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

        field('Tasks Folder', 'Folder where MINA V2 task files are stored.', row => input(row, this.plugin.settings.tasksFolder, '000 Bin/MINA V2 Tasks', 'text', async v => { this.plugin.settings.tasksFolder = v; await this.plugin.saveSettings(); }));
        field('Thoughts Folder', 'Folder where MINA V2 thought files are stored.', row => input(row, this.plugin.settings.thoughtsFolder, '000 Bin/MINA V2', 'text', async v => { this.plugin.settings.thoughtsFolder = v; await this.plugin.saveSettings(); }));
        field('Personal Finance Folder', 'Folder scanned by the Dues tab for recurring payment notes.', row => input(row, this.plugin.settings.pfFolder, '000 Bin/MINA V2 PF', 'text', async v => { this.plugin.settings.pfFolder = v; await this.plugin.saveSettings(); }));
        field('Date Format', 'moment.js format, e.g. YYYY-MM-DD', row => input(row, this.plugin.settings.dateFormat, 'YYYY-MM-DD', 'text', async v => { this.plugin.settings.dateFormat = v; await this.plugin.saveSettings(); }));
        field('Time Format', 'moment.js format, e.g. HH:mm', row => input(row, this.plugin.settings.timeFormat, 'HH:mm', 'text', async v => { this.plugin.settings.timeFormat = v; await this.plugin.saveSettings(); }));
        field('New Note Folder', 'Folder where notes created via \\ link are saved.', row => input(row, this.plugin.settings.newNoteFolder, '000 Bin', 'text', async v => { this.plugin.settings.newNoteFolder = v; await this.plugin.saveSettings(); }));
        field('Voice Memo Folder', 'Folder where recorded voice notes will be stored.', row => input(row, this.plugin.settings.voiceMemoFolder, '000 Bin/MINA V2 Voice', 'text', async v => { this.plugin.settings.voiceMemoFolder = v; await this.plugin.saveSettings(); }));
        field('Transcription Language', 'Target language for audio transcription (e.g., English, Japanese).', row => input(row, this.plugin.settings.transcriptionLanguage, 'English', 'text', async v => { this.plugin.settings.transcriptionLanguage = v; await this.plugin.saveSettings(); }));
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

        field('Max Output Tokens', 'Maximum tokens in Gemini responses (256–65536). Higher = longer answers.', row => {
            const inp = row.createEl('input', { attr: { type: 'number', min: '256', max: '65536', step: '256', style: 'width: 100px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);' } });
            inp.value = String(this.plugin.settings.maxOutputTokens ?? 65536);
            inp.addEventListener('change', async () => {
                const val = Math.min(65536, Math.max(256, parseInt(inp.value) || 65536));
                inp.value = String(val);
                this.plugin.settings.maxOutputTokens = val;
                await this.plugin.saveSettings();
            });
        });
    }

    async renderMinaMode(container: HTMLElement) {
        if (!this.plugin.settings.geminiApiKey) {
            const warn = container.createEl('div', { attr: { style: 'flex-grow:1;padding:20px;color:var(--text-muted);font-size:0.9em;' } });
            warn.createEl('p', { text: '⚠️ No Gemini API key set.' });
            warn.createEl('p', { text: 'Add your key in Settings → MINA → Gemini API Key.' });
            return;
        }

        const isMobilePhone = Platform.isMobile && !isTablet();

        // ── Wrapper ─────────────────────────────────────────────────────────
        const wrapper = container.createEl('div', {
            attr: {
                style: Platform.isMobile
                    ? 'flex-grow:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;'
                    : 'flex-grow:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;'
            }
        });

        // ── Grounded notes bar — always at top ──────────────────────────────
        const groundedBar = wrapper.createEl('div', {
            attr: { style: 'flex-shrink:0;display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;padding:5px 10px;border-bottom:1px solid var(--background-modifier-border);background:var(--background-secondary);-webkit-overflow-scrolling:touch;' }
        });
        this.groundedNotesBar = groundedBar;

        const defaultChips = [{ icon: '💭', label: 'Th' }, { icon: '✅', label: 'Ta' }, { icon: '💳', label: 'Du' }];
        const defChipSty  = 'flex-shrink:0;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:var(--background-modifier-border);color:var(--text-muted);font-size:0.78em;font-weight:500;';
        const userChipSty = 'flex-shrink:0;display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:var(--interactive-accent-hover);color:var(--text-normal);font-size:0.78em;font-weight:500;cursor:default;';

        // mobileInputArea reference — set later by the mobile branch, used by refreshGroundedBar
        let mobileInputArea: HTMLElement | null = null;

        const refreshGroundedBar = () => {
            groundedBar.empty();
            groundedBar.createEl('span', { text: '📎', attr: { style: 'flex-shrink:0;font-size:0.8em;color:var(--text-muted);align-self:center;margin-right:2px;' } });
            for (const d of defaultChips) {
                const chip = groundedBar.createEl('span', { attr: { style: defChipSty } });
                chip.createEl('span', { text: d.icon + ' ' + d.label });
            }
            for (const f of [...this.groundedNotes]) {
                const chip = groundedBar.createEl('span', { attr: { style: userChipSty } });
                const ns = chip.createEl('span', { text: '📄 ' + f.basename, attr: { style: 'cursor:pointer;text-decoration:underline;white-space:nowrap;' } });
                ns.addEventListener('click', () => this.plugin.app.workspace.openLinkText(f.basename, f.path, 'window'));
                const x = chip.createEl('span', { text: '×', attr: { style: 'cursor:pointer;opacity:0.7;margin-left:2px;' } });
                x.addEventListener('click', () => { this.groundedNotes = this.groundedNotes.filter(n => n.path !== f.path); refreshGroundedBar(); });
            }
            const webChip = groundedBar.createEl('span', {
                attr: { style: `flex-shrink:0;margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:12px;font-size:0.78em;font-weight:600;cursor:pointer;border:1px solid ${this.webSearchEnabled ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};background:${this.webSearchEnabled ? 'var(--interactive-accent)' : 'transparent'};color:${this.webSearchEnabled ? 'var(--text-on-accent)' : 'var(--text-muted)'};`, title: 'Connect to Web' }
            });
            webChip.createEl('span', { text: '🌐 Web' });
            webChip.addEventListener('click', () => { this.webSearchEnabled = !this.webSearchEnabled; refreshGroundedBar(); });

            // Mobile: alien button at the end of the grounded bar
            if (isMobilePhone) {
                const alienBtn = groundedBar.createEl('span', {
                    attr: {
                        style: 'flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--interactive-accent);cursor:pointer;-webkit-tap-highlight-color:transparent;margin-left:6px;',
                        title: 'Ask MINA'
                    }
                });
                alienBtn.innerHTML = NINJA_AVATAR_SVG;
                const svgEl = alienBtn.querySelector('svg');
                if (svgEl) { svgEl.setAttribute('width', '16'); svgEl.setAttribute('height', '16'); svgEl.style.stroke = '#39FF14'; }

                alienBtn.addEventListener('click', () => {
                    if (!mobileInputArea) return;
                    const isVisible = mobileInputArea.style.display !== 'none';
                    mobileInputArea.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) setTimeout(() => textarea.focus(), 50);
                });
            }
        };
        refreshGroundedBar();

        // ── Chat container — scrollable area ────────────────────────────────
        this.chatContainer = wrapper.createEl('div', {
            attr: { style: 'flex-grow:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 8px 160px 8px;' }
        });
        await this.renderChatHistory();

        // ── Input area — shared textarea + buttons (created once) ───────────
        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Ask MINA…';
        textarea.rows = isMobilePhone ? 4 : 3;
        textarea.style.cssText = 'width:100%;resize:none;font-size:0.9em;padding:8px 110px 8px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);font-family:inherit;box-sizing:border-box;';

        const overlayBtns = document.createElement('div');
        overlayBtns.style.cssText = 'position:absolute;bottom:16px;right:16px;display:flex;gap:4px;align-items:center;';
        const sendBtn        = overlayBtns.createEl('button', { text: '↑',  attr: { style: 'padding:3px 10px;font-size:1em;font-weight:700;border-radius:5px;background:var(--interactive-accent);color:var(--text-on-accent);border:none;cursor:pointer;', title: 'Send' } });
        const saveSessionBtn = overlayBtns.createEl('button', { text: '📥', attr: { style: 'padding:3px 6px;font-size:0.85em;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;', title: 'Save session' } });
        const newChatBtn     = overlayBtns.createEl('button', { text: '🗒️', attr: { style: 'padding:3px 6px;font-size:0.85em;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;', title: 'New chat' } });
        const recallBtn      = overlayBtns.createEl('button', { text: '📂', attr: { style: 'padding:3px 6px;font-size:0.85em;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;', title: 'Recall session' } });

        // ── Send logic ───────────────────────────────────────────────────────
        let send = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            textarea.value = '';
            textarea.disabled = true;
            sendBtn.disabled = true;

            this.chatHistory.push({ role: 'user', text });
            await this.renderChatHistory();

            const thinking = this.chatContainer.createEl('div', { attr: { style: 'font-size:0.85em;color:var(--text-muted);font-style:italic;margin-bottom:8px;padding-left:4px;' } });
            thinking.setText('MINA is thinking…');
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

            try {
                const reply = await this.callGemini(text, [...this.groundedNotes], this.webSearchEnabled);
                thinking.remove();
                this.chatHistory.push({ role: 'assistant', text: reply });
            } catch (e: any) {
                thinking.remove();
                this.chatHistory.push({ role: 'assistant', text: `⚠️ Error: ${e.message}` });
            }
            await this.renderChatHistory();
            textarea.disabled = false;
            sendBtn.disabled = false;
            if (!isMobilePhone) textarea.focus();
        };

        sendBtn.addEventListener('click', send);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
            if (e.key === '\\') {
                e.preventDefault();
                new NotePickerModal(this.plugin.app, async (file) => {
                    if (!this.groundedNotes.find(n => n.path === file.path)) { this.groundedNotes.push(file); refreshGroundedBar(); new Notice(`📎 Grounded on: ${file.basename}`); }
                }).open();
            }
        });

        saveSessionBtn.addEventListener('click', async () => {
            if (this.chatHistory.length === 0) { new Notice('No chat to save.'); return; }
            const ts = moment().locale('en').format('YYYY-MM-DD HH:mm');
            const folder = (this.plugin.settings.thoughtsFolder || '000 Bin/MINA V2').trim();
            const filename = `MINA Chat ${moment().locale('en').format('YYYY-MM-DD HHmm')}.md`;
            const lines: string[] = [`# MINA Chat Session — ${ts}`, ''];
            for (const msg of this.chatHistory) { lines.push(msg.role === 'user' ? `**You:** ${msg.text}` : `**MINA:** ${msg.text}`); lines.push(''); }
            try {
                const { vault } = this.plugin.app;
                if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
                await vault.create(`${folder}/${filename}`, lines.join('\n'));
                new Notice(`✅ Chat saved to ${folder}/${filename}`);
            } catch (e) { new Notice('Error saving chat: ' + (e instanceof Error ? e.message : String(e))); }
        });

        newChatBtn.addEventListener('click', () => {
            if (this.chatHistory.length === 0) return;
            new ConfirmModal(this.plugin.app, 'Start a new chat session? Current history will be cleared.', async () => { this.chatHistory = []; await this.renderChatHistory(); }).open();
        });

        recallBtn.addEventListener('click', () => {
            const folder = (this.plugin.settings.thoughtsFolder || '000 Bin/MINA V2').trim();
            const files = this.plugin.app.vault.getFiles().filter(f => f.path.startsWith(folder) && f.basename.startsWith('MINA Chat ')).sort((a, b) => b.stat.mtime - a.stat.mtime);
            if (files.length === 0) { new Notice('No saved chat sessions found.'); return; }
            new ChatSessionPickerModal(this.plugin.app, files, async (file) => {
                try { this.chatHistory = this.parseChatSession(await this.plugin.app.vault.read(file)); await this.renderChatHistory(); new Notice(`📂 Loaded: ${file.basename}`); }
                catch (e) { new Notice('Error loading chat: ' + (e instanceof Error ? e.message : String(e))); }
            }).open();
        });

        // ── Mobile: inline input area toggled by alien button in grounded bar ─
        // Everything in normal document flow — no absolute/fixed positioning.
        if (isMobilePhone) {
            // The input area sits between groundedBar and chatContainer in the flex column.
            mobileInputArea = document.createElement('div');
            mobileInputArea.style.cssText = 'flex-shrink:0;padding:8px;border-bottom:1px solid var(--background-modifier-border);background:var(--background-secondary);display:none;';
            const inputWrap = mobileInputArea.createEl('div', { attr: { style: 'position:relative;' } });
            inputWrap.appendChild(textarea);
            inputWrap.appendChild(overlayBtns);
            // Insert mobileInputArea after groundedBar but before chatContainer
            wrapper.insertBefore(mobileInputArea, this.chatContainer);
            // Re-run refreshGroundedBar now that mobileInputArea is set, so alien button works
            refreshGroundedBar();

            const closeMobileInput = () => {
                if (mobileInputArea) mobileInputArea.style.display = 'none';
            };

            textarea.addEventListener('blur', () => {
                setTimeout(() => {
                    if (!textarea.value.trim() && document.activeElement !== textarea) {
                        closeMobileInput();
                    }
                }, 200);
            });

            // Override send for mobile
            send = async () => {
                const text = textarea.value.trim();
                if (!text) return;
                textarea.value = '';
                textarea.blur();
                closeMobileInput();
                textarea.disabled = true;
                sendBtn.disabled = true;

                this.chatHistory.push({ role: 'user', text });
                await this.renderChatHistory();

                const thinking = this.chatContainer.createEl('div', { attr: { style: 'font-size:0.85em;color:var(--text-muted);font-style:italic;margin-bottom:8px;padding-left:4px;' } });
                thinking.setText('MINA is thinking…');
                this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

                try {
                    const reply = await this.callGemini(text, [...this.groundedNotes], this.webSearchEnabled);
                    thinking.remove();
                    this.chatHistory.push({ role: 'assistant', text: reply });
                } catch (e: any) {
                    thinking.remove();
                    this.chatHistory.push({ role: 'assistant', text: `⚠️ Error: ${e.message}` });
                }
                await this.renderChatHistory();
                textarea.disabled = false;
                sendBtn.disabled = false;
            };
            sendBtn.onclick = () => send();
        } else {
            // Desktop: input row sits at the bottom of the flex column
            const inputRow = wrapper.createEl('div', {
                attr: { style: 'flex-shrink:0;position:relative;padding:8px;border-top:1px solid var(--background-modifier-border);background:var(--background-secondary);' }
            });
            inputRow.appendChild(textarea);
            inputRow.appendChild(overlayBtns);
            setTimeout(() => textarea.focus(), 50);
        }
    }

    async renderChatHistory() {
        if (!this.chatContainer) return;
        this.chatContainer.empty();
        if (this.chatHistory.length === 0) {
            this.chatContainer.createEl('div', { text: 'Ask me anything about your thoughts, tasks and dues.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; text-align: center; margin-top: 20px;' } });
            return;
        }

        const maxW = Platform.isMobile ? '95%' : '85%';

        // Render oldest → newest (natural order), scroll to bottom after
        for (const msg of this.chatHistory) {
            const isUser = msg.role === 'user';

            // Row wrapper handles left/right alignment without constraining height
            const row = this.chatContainer.createEl('div', {
                attr: { style: `display: flex; justify-content: ${isUser ? 'flex-end' : 'flex-start'}; margin-bottom: 8px;` }
            });
            const bubble = row.createEl('div', {
                attr: { style: `max-width: ${maxW}; padding: 8px 12px; border-radius: 12px; font-size: 0.9em; line-height: 1.5; word-break: break-word; background: ${isUser ? 'var(--interactive-accent)' : 'var(--background-secondary)'}; color: ${isUser ? 'var(--text-on-accent)' : 'var(--text-normal)'};` }
            });

            if (isUser) {
                bubble.style.whiteSpace = 'pre-wrap';
                bubble.setText(msg.text);
            } else {
                // Wrap bubble in position:relative so save icon can be overlaid
                bubble.style.position = 'relative';
                await MarkdownRenderer.render(this.plugin.app, msg.text, bubble, '', this);
                this.hookInternalLinks(bubble, '');
                bubble.querySelectorAll('p').forEach((p: HTMLElement) => { p.style.marginTop = '0'; p.style.marginBottom = '4px'; });
                bubble.querySelectorAll('table').forEach((table: HTMLElement) => {
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; margin: 6px 0;';
                    table.parentNode?.insertBefore(wrapper, table);
                    wrapper.appendChild(table);
                    table.style.cssText = 'min-width: max-content; border-collapse: collapse; font-size: 0.9em;';
                    table.querySelectorAll('th, td').forEach((cell: HTMLElement) => {
                        cell.style.cssText = 'padding: 4px 8px; border: 1px solid var(--background-modifier-border); white-space: nowrap;';
                    });
                });
                // 7. Save-as-Thought: icon only, overlaid bottom-right of assistant bubble
                const saveBtn = bubble.createEl('button', {
                    text: '💾',
                    attr: {
                        title: 'Save as Thought',
                        style: 'position:absolute;bottom:6px;right:6px;padding:2px 5px;font-size:0.8em;border-radius:6px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;opacity:0.5;transition:opacity 0.15s;'
                    }
                });
                saveBtn.addEventListener('mouseenter', () => { saveBtn.style.opacity = '1'; });
                saveBtn.addEventListener('mouseleave', () => { if (!saveBtn.disabled) saveBtn.style.opacity = '0.5'; });
                saveBtn.addEventListener('click', async () => {
                    try {
                        saveBtn.disabled = true;
                        saveBtn.textContent = '✓';
                        saveBtn.style.opacity = '1';
                        await this.plugin.createThoughtFile(msg.text, this.plugin.settings.selectedContexts ?? []);
                        setTimeout(() => { saveBtn.textContent = '💾'; saveBtn.style.opacity = '0.5'; saveBtn.disabled = false; }, 2000);
                    } catch (e) {
                        saveBtn.textContent = '💾'; saveBtn.style.opacity = '0.5'; saveBtn.disabled = false;
                        new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
                    }
                });
                // Add bottom padding so the icon doesn't overlap last text line
                bubble.style.paddingBottom = '24px';
            }
        }

        // Scroll to bottom so newest message is always visible
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    async callGemini(userMessage: string, groundedFiles: TFile[] = [], webSearch: boolean = false): Promise<string> {
        const { vault, metadataCache } = this.plugin.app;
        const s = this.plugin.settings;

        // Collect grounded note content + their linked and backlinked notes
        let groundedContent = '';
        if (groundedFiles.length > 0) {
            const seen = new Set<string>();
            const collectNote = async (file: TFile, depth: number) => {
                if (seen.has(file.path) || depth > 1) return '';
                seen.add(file.path);
                let text = '';
                try { text = await vault.read(file); } catch {}

                // Get outgoing wikilinks
                const cache = metadataCache.getFileCache(file);
                const outLinks: TFile[] = (cache?.links ?? [])
                    .map(l => metadataCache.getFirstLinkpathDest(l.link, file.path))
                    .filter((f): f is TFile => f instanceof TFile && !seen.has(f.path));

                // Get backlinks (notes that link to this file)
                const resolved = metadataCache.resolvedLinks;
                const backlinks: TFile[] = Object.entries(resolved)
                    .filter(([, targets]) => file.path in targets)
                    .map(([src]) => vault.getFileByPath(src))
                    .filter((f): f is TFile => f instanceof TFile && !seen.has(f.path));

                const related = [...outLinks, ...backlinks].slice(0, 10);
                const relatedTexts = await Promise.all(related.map(f => collectNote(f, depth + 1)));

                let section = `### [[${file.basename}]]\n${text.trim()}`;
                const linked = relatedTexts.filter(Boolean);
                if (linked.length) section += '\n\n#### Linked/Related Notes\n' + linked.join('\n\n---\n');
                return section;
            };

            const sections = await Promise.all(groundedFiles.map(f => collectNote(f, 0)));
            groundedContent = sections.filter(Boolean).join('\n\n===\n\n');
        }

        const readFile = async (folder: string, file: string) => {
            try {
                const f = vault.getFileByPath(`${folder.trim()}/${file.trim()}`);
                if (f) return await vault.read(f);
            } catch {}
            return '';
        };

        const thoughtsContent = Array.from(this.plugin.thoughtIndex.values())
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate)
            .slice(0, 50)
            .map(e => `[${e.day}] ${e.body}${e.children.length > 0 ? '\n' + e.children.map(r => `  → ${r.text}`).join('\n') : ''}`)
            .join('\n\n');
        const tasksContent = await readFile(s.captureFolder, s.tasksFilePath);

        // Build dues context from pfFolder
        const pfFolder = (s.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
        const duesLines: string[] = [];
        for (const file of vault.getMarkdownFiles()) {
            if (!file.path.startsWith(pfFolder + '/') && file.path !== pfFolder) continue;
            const fm = metadataCache.getFileCache(file)?.frontmatter;
            const active = fm?.['active_status'];
            if (active === false || active === 'false' || active === 'False') continue;
            duesLines.push(`- ${file.basename}: due ${fm?.['next_duedate'] ?? '?'}, last paid ${fm?.['last_payment'] ?? '?'}`);
        }
        duesLines.sort();
        const duesContent = duesLines.length ? duesLines.join('\n') : '(none)';

        const groundedSection = groundedContent
            ? `\n\n--- GROUNDED NOTES (user-selected context) ---\n${groundedContent}`
            : '';

        const systemPrompt = `You are MINA, a personal AI assistant embedded in Obsidian. You have access to the user's thoughts, tasks, dues, and any grounded notes below. Answer questions, summarize, find patterns, suggest actions, or help reflect — based on this data. Be concise and helpful. When referencing a specific note by name, always write it as [[Note Name]] so it becomes a clickable link.

--- THOUGHTS ---
${thoughtsContent || '(empty)'}

--- TASKS ---
${tasksContent || '(empty)'}

--- DUES (recurring payments) ---
${duesContent}${groundedSection}`;

        const body: any = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: this.chatHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            })),
            generationConfig: { temperature: 0.7, maxOutputTokens: s.maxOutputTokens ?? 65536 }
        };

        if (webSearch) {
            body.tools = [{ googleSearch: {} }];
        }

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiApiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err?.error?.message || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
        const text = parts.map((p: any) => p.text ?? '').join('').trim();
        return text || '(no response)';
    }

    parseChatSession(content: string): { role: 'user' | 'assistant'; text: string }[] {
        const history: { role: 'user' | 'assistant'; text: string }[] = [];
        let currentRole: 'user' | 'assistant' | null = null;
        let currentLines: string[] = [];
        for (const line of content.split('\n')) {
            if (line.startsWith('**You:** ')) {
                if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
                currentRole = 'user';
                currentLines = [line.substring('**You:** '.length)];
            } else if (line.startsWith('**MINA:** ')) {
                if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
                currentRole = 'assistant';
                currentLines = [line.substring('**MINA:** '.length)];
            } else if (currentRole && !line.startsWith('#')) {
                currentLines.push(line);
            }
        }
        if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
        return history;
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
                        const newRaw = entry.body.replace(/- \[([ x])\] /g, (match: string, state: string) => {
                            if (count++ === idx) return state === ' ' ? '- [x] ' : '- [ ] ';
                            return match;
                        });
                        if (newRaw === entry.body) return;
                        entry.body = newRaw;
                        await this.plugin.editThoughtBody(entry.filePath, newRaw, entry.context);
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

        // ── Context picker panel (mobile phone only) ─────────────────────────
        let ctxPanelEl: HTMLElement | null = null;

        const hideCtxPanel = () => {
            ctxPanelEl?.remove();
            ctxPanelEl = null;
        };

        const renderCtxPanel = () => {
            ctxPanelEl?.remove();
            const all = this.plugin.settings.contexts;

            ctxPanelEl = textAreaWrapper.createEl('div', {
                attr: {
                    style: [
                        'position:absolute', 'top:calc(100% + 4px)', 'left:0', 'right:0',
                        'background:var(--background-primary)',
                        'border:1px solid var(--background-modifier-border)',
                        'border-radius:10px',
                        'box-shadow:0 4px 16px rgba(0,0,0,0.22)',
                        'z-index:200',
                        'overflow:hidden',
                        'display:flex', 'flex-direction:column'
                    ].join(';')
                }
            });

            // ── 2-row horizontally scrollable pill strip ───────────────────────
            const grid = ctxPanelEl.createEl('div', {
                attr: {
                    style: [
                        'display:grid',
                        'grid-template-rows:repeat(2,auto)',
                        'grid-auto-flow:column',
                        'gap:6px',
                        'padding:8px 10px',
                        'overflow-x:auto',
                        'overflow-y:hidden',
                        '-webkit-overflow-scrolling:touch',
                        'flex-shrink:0'
                    ].join(';')
                }
            });

            all.forEach((ctx) => {
                const isSelected = this.selectedContexts.includes(ctx);
                const pill = grid.createEl('div', {
                    attr: {
                        style: [
                            'display:inline-flex', 'align-items:center', 'gap:4px',
                            'padding:6px 14px', 'border-radius:20px',
                            'font-size:0.85em', 'cursor:pointer', 'flex-shrink:0',
                            'user-select:none', 'transition:background 0.1s',
                            isSelected
                                ? 'background:var(--interactive-accent); color:var(--text-on-accent); border:1px solid var(--interactive-accent);'
                                : 'background:var(--background-secondary); color:var(--text-normal); border:1px solid var(--background-modifier-border);'
                        ].join(';')
                    }
                });
                if (isSelected) pill.createSpan({ text: '✓', attr: { style: 'font-size:0.75em; font-weight:bold; flex-shrink:0;' } });
                pill.createSpan({ text: `#${ctx}` });

                pill.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    if (isSelected) {
                        this.selectedContexts = this.selectedContexts.filter(c => c !== ctx);
                    } else {
                        this.selectedContexts.push(ctx);
                    }
                    renderCtxPanel();
                });
            });

            // ── Add new + Done row ─────────────────────────────────────────────
            const addRow = ctxPanelEl.createEl('div', {
                attr: {
                    style: [
                        'display:flex', 'align-items:center', 'gap:6px',
                        'padding:7px 10px',
                        'border-top:1px solid var(--background-modifier-border)'
                    ].join(';')
                }
            });

            const newInput = addRow.createEl('input', {
                attr: {
                    type: 'text',
                    placeholder: 'New context…',
                    style: [
                        'flex:1', 'min-width:0',
                        'padding:5px 10px', 'border-radius:16px',
                        'border:1px solid var(--background-modifier-border)',
                        'background:var(--background-secondary)',
                        'color:var(--text-normal)', 'font-size:0.85em',
                        'outline:none'
                    ].join(';')
                }
            }) as HTMLInputElement;

            const addBtn = addRow.createEl('button', {
                attr: {
                    style: [
                        'padding:5px 10px', 'border-radius:16px', 'border:none',
                        'background:var(--interactive-accent)', 'color:var(--text-on-accent)',
                        'font-size:0.85em', 'font-weight:600', 'cursor:pointer', 'flex-shrink:0'
                    ].join(';')
                },
                text: '＋'
            });

            const doneBtn = addRow.createEl('button', {
                attr: {
                    style: [
                        'padding:5px 12px', 'border-radius:16px', 'border:none',
                        'background:var(--background-modifier-border)',
                        'color:var(--text-muted)', 'font-size:0.85em', 'cursor:pointer', 'flex-shrink:0'
                    ].join(';')
                },
                text: 'Done'
            });

            const doAdd = async () => {
                const val = newInput.value.trim().replace(/^#+/, '');
                if (!val) return;
                if (!this.plugin.settings.contexts.includes(val)) {
                    this.plugin.settings.contexts.push(val);
                    await this.plugin.saveSettings();
                }
                if (!this.selectedContexts.includes(val)) this.selectedContexts.push(val);
                newInput.value = '';
                renderCtxPanel();
            };
            addBtn.addEventListener('mousedown', (ev) => { ev.preventDefault(); doAdd(); });
            newInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doAdd(); } });
            doneBtn.addEventListener('mousedown', (ev) => { ev.preventDefault(); hideCtxPanel(); textArea.focus(); });
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
                    }, this.plugin.settings.newNoteFolder);
                    modal.open();
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

        textArea.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideCtxPanel(); });

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
                    'position:absolute', 'bottom:6px', 'right:34px',
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

        // ── Context button (mobile phone only) — opens tag picker panel ──────
        if (Platform.isMobile && !isTablet()) {
            const ctxBtn = textAreaWrapper.createEl('button', {
                attr: {
                    title: 'Add context',
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
            ctxBtn.textContent = '#';
            ctxBtn.style.fontWeight = '700';
            ctxBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (ctxPanelEl) { hideCtxPanel(); } else { renderCtxPanel(); }
            });
        }

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
                if (this.isTask) {
                    await this.plugin.createTaskFile(this.content.trim(), this.selectedContexts, this.dueDate || undefined);
                } else if (this.replyToId) {
                    const replied = await this.plugin.appendReplyToFile(this.replyToId, this.content.trim());
                    if (replied) new Notice('Reply added!');
                } else {
                    await this.plugin.createThoughtFile(this.content.trim(), this.selectedContexts);
                }
                this.content = ''; 
                textArea.value = '';
                this.replyToId = null;
                this.replyToText = null;
                if (Platform.isMobile && !isTablet()) {
                    this.selectedContexts = [];
                    this.plugin.settings.selectedContexts = [];
                    await this.plugin.saveSettings();
                }
                hideCtxPanel();
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
        [['all', 'All Dates'], ['today', 'Today'], ['today+overdue', 'Today + Overdue'], ['this-week', 'This Week'], ['next-week', 'Next Week'], ['overdue', 'Overdue Only'], ['no-due', 'No Due Date'], ['custom', 'Custom Date']].forEach(([val, label]) => {
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

        this.reviewTasksContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 5px 5px 200px 5px;' } });
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

            // Toggle TO-DOs
            const todoToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            todoToggleContainer.createSpan({ text: 'TO-DOs' });
            const todoToggleLabel = todoToggleContainer.createEl('label', {
                attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' }
            });
            const todoCb = todoToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            todoCb.checked = this.thoughtsFilterTodo;
            const todoSlider = todoToggleLabel.createEl('span', {
                attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.thoughtsFilterTodo ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` }
            });
            const todoKnob = todoToggleLabel.createEl('span', {
                attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.thoughtsFilterTodo ? 'translateX(14px)' : 'translateX(0)'};` }
            });
            todoCb.addEventListener('change', (e) => {
                this.thoughtsFilterTodo = (e.target as HTMLInputElement).checked;
                todoSlider.style.backgroundColor = this.thoughtsFilterTodo ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                todoKnob.style.transform = this.thoughtsFilterTodo ? 'translateX(14px)' : 'translateX(0)';
                this.updateReviewThoughtsList();
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
        [['all', 'All Dates'], ['today', 'Today'], ['last-5-days', 'Last 5 Days'], ['this-week', 'This Week'], ['custom', 'Custom Date']].forEach(([val, label]) => {
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

        this.reviewThoughtsContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 5px 5px 200px 5px;' } });
        this.updateReviewThoughtsList();
    }

    async updateReviewTasksList(appendMore = false) {
        if (!this.reviewTasksContainer) return;
        if (!appendMore) {
            this.tasksOffset = 0;
            this.reviewTasksContainer.empty();
            this.tasksRowContainer = null;
        }

        let tasks: TaskEntry[] = Array.from(this.plugin.taskIndex.values());

        // Apply status filter
        if (this.tasksFilterStatus === 'pending') {
            tasks = tasks.filter(e => e.status === 'open');
        } else if (this.tasksFilterStatus === 'completed') {
            tasks = tasks.filter(e => e.status === 'done');
        }

        // Apply context filter
        if (this.tasksFilterContext && this.tasksFilterContext.length > 0) {
            tasks = tasks.filter(e => this.tasksFilterContext.every((ctx: string) => e.context.includes(ctx)));
        }

        // Apply date filter on due date
        const today = moment().locale('en').format('YYYY-MM-DD');
        if (this.tasksFilterDate === 'today') {
            tasks = tasks.filter(e => e.due === today);
        } else if (this.tasksFilterDate === 'today+overdue') {
            tasks = tasks.filter(e => e.due === today || (e.due && e.due < today));
        } else if (this.tasksFilterDate === 'overdue') {
            tasks = tasks.filter(e => e.due && e.due < today);
        } else if (this.tasksFilterDate === 'this-week') {
            const weekEnd = moment().locale('en').endOf('week').format('YYYY-MM-DD');
            tasks = tasks.filter(e => e.due && e.due >= today && e.due <= weekEnd);
        } else if (this.tasksFilterDate === 'next-week') {
            const nextStart = moment().locale('en').add(1, 'week').startOf('week').format('YYYY-MM-DD');
            const nextEnd   = moment().locale('en').add(1, 'week').endOf('week').format('YYYY-MM-DD');
            tasks = tasks.filter(e => e.due && e.due >= nextStart && e.due <= nextEnd);
        } else if (this.tasksFilterDate === 'no-due') {
            tasks = tasks.filter(e => !e.due || e.due.trim() === '');
        } else if (this.tasksFilterDate === 'custom' && this.tasksFilterDateStart && this.tasksFilterDateEnd) {
            tasks = tasks.filter(e => e.due && e.due >= this.tasksFilterDateStart && e.due <= this.tasksFilterDateEnd);
        }

        // Sort: open tasks first, then by due date (earliest first), then by lastUpdate
        tasks.sort((a, b) => {
            if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
            if (a.due && b.due) return a.due.localeCompare(b.due);
            if (a.due) return -1;
            if (b.due) return 1;
            return b.lastUpdate - a.lastUpdate;
        });

        if (!appendMore) {
            if (tasks.length === 0) {
                this.reviewTasksContainer.createEl('p', { text: 'No tasks found.', attr: { style: 'color: var(--text-muted);' } });
                return;
            }
            this.tasksRowContainer = this.reviewTasksContainer.createEl('div');
        }

        if (!this.tasksRowContainer) return;

        this.reviewTasksContainer.querySelector('.mina-load-more')?.remove();

        const PAGE_SIZE = 30;
        const page = tasks.slice(this.tasksOffset, this.tasksOffset + PAGE_SIZE);

        for (const entry of page) {
            try {
                await this.renderTaskRow(entry, this.tasksRowContainer!);
            } catch (err) {
                console.error('MINA: renderTaskRow failed', err);
            }
        }
        this.tasksOffset += page.length;

        if (this.tasksOffset < tasks.length) {
            const btn = this.reviewTasksContainer.createEl('button', {
                text: `Load more (${tasks.length - this.tasksOffset} remaining)`,
                cls: 'mina-load-more',
                attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' }
            });
            btn.addEventListener('click', () => this.updateReviewTasksList(true));
        }
    }

    async updateReviewThoughtsList(appendMore = false) {
        if (!this.reviewThoughtsContainer) return;
        if (!appendMore) {
            this.thoughtsOffset = 0;
            this.reviewThoughtsContainer.empty();
            this._parsedRoots = [];

            let roots: ThoughtEntry[] = Array.from(this.plugin.thoughtIndex.values());

            // Apply context filter
            if (this.thoughtsFilterContext.length > 0) {
                roots = roots.filter(e => this.thoughtsFilterContext.every(ctx => e.context.includes(ctx)));
            }

            // Apply history filter
            if (!this.showPreviousThoughts) {
                const today = this.plugin.formatDate(new Date());
                roots = roots.filter(e => e.day === today);
            }

            // Apply date filter
            if (this.thoughtsFilterDate === 'today') {
                const today = this.plugin.formatDate(new Date());
                roots = roots.filter(e => e.day === today);
            } else if (this.thoughtsFilterDate === 'last-5-days') {
                const cutoff = moment().subtract(4, 'days').startOf('day').format('YYYY-MM-DD');
                roots = roots.filter(e => e.day >= cutoff);
            } else if (this.thoughtsFilterDate === 'this-week') {
                const weekStart = moment().startOf('week').valueOf();
                roots = roots.filter(e => new Date(e.created.replace(' ', 'T')).getTime() >= weekStart);
            } else if (this.thoughtsFilterDate === 'custom' && this.thoughtsFilterDateStart && this.thoughtsFilterDateEnd) {
                roots = roots.filter(e => e.day >= this.thoughtsFilterDateStart && e.day <= this.thoughtsFilterDateEnd);
            }

            // Sort by lastThreadUpdate descending
            roots.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

            // Filter: only thoughts with at least one open checkbox
            if (this.thoughtsFilterTodo) {
                roots = roots.filter(e => {
                    const fullText = e.body + e.children.map(r => r.text).join('\n');
                    return /- \[ \]/.test(fullText);
                });
            }

            this._parsedRoots = roots;

            if (roots.length === 0) {
                this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts found.', attr: { style: 'color: var(--text-muted);' } });
                return;
            }

            this.thoughtsRowContainer = this.reviewThoughtsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
        }

        if (!this.thoughtsRowContainer) return;

        this.reviewThoughtsContainer.querySelector('.mina-load-more')?.remove();

        const PAGE_SIZE = 20;
        const page = this._parsedRoots.slice(this.thoughtsOffset, this.thoughtsOffset + PAGE_SIZE);

        for (const entry of page) {
            try {
                await this.renderThoughtRow(entry, this.thoughtsRowContainer!, entry.filePath, 0);
            } catch (err) {
                console.error('MINA: renderThoughtRow failed', err);
            }
        }
        this.thoughtsOffset += page.length;

        if (this.thoughtsOffset < this._parsedRoots.length) {
            const loadMoreBtn = this.reviewThoughtsContainer.createEl('button', {
                text: `Load more (${this._parsedRoots.length - this.thoughtsOffset} remaining)`,
                cls: 'mina-load-more',
                attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' }
            });
            loadMoreBtn.addEventListener('click', () => this.updateReviewThoughtsList(true));
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
        const folderPath = this.plugin.settings.captureFolder.trim();
        const tasksPath = folderPath && folderPath !== '/' ? `${folderPath}/${this.plugin.settings.tasksFilePath.trim()}` : this.plugin.settings.tasksFilePath.trim();
        this.invalidateCache(tasksPath);

        if (this.activeTab === 'review-tasks') {
            await this.updateReviewTasksList();
        } else if (this.activeTab === 'review-thoughts') {
            await this.updateReviewThoughtsList();
        }
    }

    async renderTaskRow(entry: TaskEntry, container: HTMLElement) {
        const isDone = entry.status === 'done';
        const row = container.createEl('div', { attr: { style: `display:flex; flex-direction:column; padding:8px; margin-bottom:4px; border-radius:6px; background:var(--background-secondary); opacity:${isDone ? '0.5' : '1'};` } });

        // Top row: toggle + body text + action icons
        const topRow = row.createEl('div', { attr: { style: 'display:flex; gap:8px; align-items:flex-start;' } });

        // Pill toggle
        const toggleContainer = topRow.createEl('label', {
            attr: { style: 'position:relative; display:inline-block; width:36px; height:20px; margin-right:4px; margin-top:2px; flex-shrink:0; cursor:pointer;' }
        });
        const cb = toggleContainer.createEl('input', { type: 'checkbox', attr: { style: 'opacity:0; width:0; height:0; position:absolute;' } }) as HTMLInputElement;
        cb.checked = isDone;
        const slider = toggleContainer.createEl('span', {
            attr: { style: `position:absolute; top:0; left:0; right:0; bottom:0; background-color:${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition:.3s; border-radius:20px;` }
        });
        const knob = toggleContainer.createEl('span', {
            attr: { style: `position:absolute; height:14px; width:14px; left:3px; bottom:3px; background-color:var(--text-on-accent,white); transition:.3s; border-radius:50%; transform:${isDone ? 'translateX(16px)' : 'translateX(0)'};` }
        });
        cb.addEventListener('change', async () => {
            const checked = cb.checked;
            slider.style.backgroundColor = checked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
            knob.style.transform = checked ? 'translateX(16px)' : 'translateX(0)';
            row.style.opacity = checked ? '0.5' : '1';
            await this.plugin.toggleTaskStatus(entry.filePath, checked);
            this.updateReviewTasksList();
        });

        // Body text
        const content = topRow.createEl('div', { attr: { style: 'flex:1; min-width:0;' } });
        const textEl = content.createEl('div', { attr: { style: `word-break:break-word; font-size:0.95em; line-height:1.4; ${isDone ? 'text-decoration:line-through; opacity:0.7;' : ''}` } });
        const bodyText = entry.body || entry.title;
        await MarkdownRenderer.render(this.plugin.app, bodyText, textEl, entry.filePath, this);
        this.hookInternalLinks(textEl, entry.filePath);
        this.hookImageZoom(textEl);
        const firstP = textEl.querySelector('p');
        if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }

        // Action icons
        const actions = topRow.createEl('div', { attr: { style: 'display:flex; gap:4px; align-items:flex-start; flex-shrink:0;' } });
        const editBtn = actions.createEl('span', { text: '✏️', attr: { style: 'cursor:pointer; font-size:0.85em; opacity:0.7; transition:opacity 0.2s;', title: 'Edit' } });
        editBtn.addEventListener('mouseenter', () => editBtn.style.opacity = '1');
        editBtn.addEventListener('mouseleave', () => editBtn.style.opacity = '0.7');
        const delBtn = actions.createEl('span', { text: '🗑️', attr: { style: 'cursor:pointer; font-size:0.85em; opacity:0.7; transition:opacity 0.2s;', title: 'Delete' } });
        delBtn.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
        delBtn.addEventListener('mouseleave', () => delBtn.style.opacity = '0.7');

        editBtn.addEventListener('click', () => {
            const modal = new EditEntryModal(
                this.plugin.app, this.plugin,
                entry.body,
                entry.context.map(c => `#${c}`).join(' '),
                entry.due || null,
                true,
                async (newText: string, newCtxStr: string, newDue: string | null) => {
                    const ctxArr = newCtxStr ? newCtxStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                    await this.plugin.editTaskBody(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                    this.updateReviewTasksList();
                }
            );
            modal.open();
        });

        delBtn.addEventListener('click', () => {
            new ConfirmModal(this.plugin.app, 'Move this task to trash?', async () => {
                await this.plugin.deleteTaskFile(entry.filePath);
                this.updateReviewTasksList();
            }).open();
        });

        // Bottom meta row: due date (left) + context pills (right)
        const metaRow = row.createEl('div', { attr: { style: 'display:flex; justify-content:space-between; align-items:center; margin-top:5px; flex-wrap:wrap; gap:4px;' } });

        const dueLeft = metaRow.createEl('div', { attr: { style: 'display:flex; align-items:center; gap:4px;' } });
        if (entry.due) {
            const dueM = moment(entry.due, 'YYYY-MM-DD', true);
            const todayM = moment().startOf('day');
            const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(todayM, 'day');
            const color = isOverdue ? 'var(--text-error)' : 'var(--text-muted)';
            dueLeft.createEl('span', {
                text: `📅 ${entry.due}`,
                attr: { style: `font-size:0.8em; color:${color}; ${isOverdue ? 'font-weight:600;' : ''}` }
            });
            if (isOverdue) dueLeft.createEl('span', { text: '⚠', attr: { style: 'font-size:0.8em; color:var(--text-error);' } });
        }

        const ctxRight = metaRow.createEl('div', { attr: { style: 'display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end;' } });
        for (const ctx of entry.context) {
            ctxRight.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size:0.8em; color:var(--text-accent); background:var(--background-secondary-alt); padding:1px 6px; border-radius:4px;' } });
        }
    }

    async renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level: number = 0) {
        const isCollapsed = this.collapsedThreads.has(entry.filePath);
        const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24;

        const itemEl = container.createEl('div', {
            attr: { style: `margin-bottom: 3px; padding-bottom: 3px; display: flex; align-items: flex-start; ${level > 0 ? `margin-left: ${level * indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 6px;` : ''}` }
        });

        // Icon Section
        const iconSection = itemEl.createEl('div', {
            attr: { style: 'width: 28px; margin-right: 6px; margin-top: 2px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2px;' }
        });

        if (level === 0 && entry.children.length > 0) {
            const collapseBtn = iconSection.createEl('div', {
                text: isCollapsed ? '▶' : '▼',
                attr: { style: 'cursor: pointer; font-size: 0.7em; opacity: 0.5; transition: 0.2s;' }
            });
            collapseBtn.addEventListener('click', () => {
                if (isCollapsed) this.collapsedThreads.delete(entry.filePath);
                else this.collapsedThreads.add(entry.filePath);
                this.updateReviewThoughtsList();
            });
        }

        if (level === 0) {
            const iconContainer = iconSection.createEl('div', { attr: { style: 'width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0;' } });
            const img = iconContainer.createEl('img', { attr: { style: 'width: 100%; height: 100%; display: block;' } });
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}`;
        }

        if (level === 0 && entry.children.length > 0) {
            iconSection.createEl('div', {
                text: `${entry.children.length}`,
                attr: { style: 'font-size: 0.65em; color: var(--text-accent); font-weight: bold; background: var(--background-secondary-alt); padding: 1px 4px; border-radius: 4px; margin-top: 2px;' }
            });
        }

        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });
        const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; margin-bottom: 0; position: relative;' } });
        const cardWrapper = mainContentRow.createEl('div', { attr: { style: 'position: relative; flex-grow: 1; min-width: 0;' } });
        const renderTarget = cardWrapper.createEl('div', { cls: 'mina-card', attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word;' } });

        // Date/time display in top right
        const timeDisplay = `${entry.day} ${entry.created.split(' ')[1] || ''}`;
        renderTarget.createEl('span', {
            text: timeDisplay,
            attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.7; margin-left: 8px;' }
        });

        // Render body markdown
        await MarkdownRenderer.render(this.plugin.app, entry.body, renderTarget, filePath, this);
        this.hookInternalLinks(renderTarget, filePath);
        this.hookImageZoom(renderTarget);
        this.hookCheckboxes(renderTarget, entry);
        const firstP = renderTarget.querySelector('p');
        if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }

        // Actions overlay (on hover)
        const actionsDiv = cardWrapper.createEl('div', { attr: { style: 'position: absolute; top: 2px; right: 4px; display: flex; gap: 6px; align-items: center; opacity: 0; transition: opacity 0.15s; background: var(--background-secondary); border-radius: 4px; padding: 1px 4px;' } });
        cardWrapper.addEventListener('mouseenter', () => actionsDiv.style.opacity = '1');
        cardWrapper.addEventListener('mouseleave', () => actionsDiv.style.opacity = '0');

        // Open file link
        const openBtn = actionsDiv.createSpan({ text: '🔗', attr: { style: 'cursor: pointer; font-size: 0.8em;', title: 'Open file' } });
        openBtn.addEventListener('click', () => {
            this.plugin.app.workspace.openLinkText(entry.filePath, '', 'window');
        });

        const replyBtn = actionsDiv.createSpan({ text: '↩️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        const convertBtn = actionsDiv.createSpan({ text: '📋', attr: { style: 'cursor: pointer; font-size: 0.8em;', title: 'Convert to task' } });
        const deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });

        deleteBtn.addEventListener('click', async () => {
            new ConfirmModal(this.plugin.app, 'Move this thought to trash?', async () => {
                await this.plugin.deleteThoughtFile(entry.filePath);
                this.updateReviewThoughtsList();
            }).open();
        });

        replyBtn.addEventListener('click', () => {
            this.replyToId = entry.filePath;
            this.replyToText = entry.body.length > 50 ? entry.body.substring(0, 50) + '...' : entry.body;
            this.showCaptureInThoughts = true;
            this.renderView();
            setTimeout(() => {
                const ta = this.containerEl.querySelector('textarea');
                if (ta) (ta as HTMLTextAreaElement).focus();
            }, 100);
        });

        const startEdit = () => {
            const modal = new EditEntryModal(
                this.plugin.app,
                this.plugin,
                entry.body,
                entry.context.map(c => `#${c}`).join(' '),
                null,
                false,
                async (newText: string, newContextStr: string, _: string | null) => {
                    const newContexts = newContextStr ? newContextStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                    await this.plugin.editThoughtBody(entry.filePath, newText.replace(/<br>/g, '\n'), newContexts);
                }
            );
            modal.open();
        };
        renderTarget.addEventListener('dblclick', startEdit);
        editBtn.addEventListener('click', startEdit);

        convertBtn.addEventListener('click', () => {
            new ConvertToTaskModal(
                this.plugin.app,
                entry.body,
                entry.context,
                async (dueDate: string) => {
                    await this.plugin.createTaskFile(entry.body.replace(/<br>/g, '\n'), entry.context, dueDate || undefined);
                    // Tag the original thought with converted_to_tasks context
                    const updatedContexts = [...new Set([...entry.context, 'converted_to_tasks'])];
                    await this.plugin.editThoughtBody(entry.filePath, entry.body.replace(/<br>/g, '\n'), updatedContexts);
                    new Notice('✅ Thought converted to task!');
                    this.updateReviewThoughtsList();
                }
            ).open();
        });

        // Context pills appended at end of body text
        if (entry.context.length > 0) {
            const ctxRow = renderTarget.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;' } });
            for (const ctx of entry.context) {
                ctxRow.createEl('span', {
                    text: `#${ctx}`,
                    attr: { style: 'font-size: 0.75em; color: var(--text-accent); font-weight: 500; background-color: var(--background-secondary-alt); padding: 2px 6px; border-radius: 4px;' }
                });
            }
        }

        // Render replies if not collapsed
        if (level === 0 && !isCollapsed && entry.children.length > 0) {
            for (const reply of entry.children) {
                await this.renderReplyRow(reply, entry, container);
            }
        }
    }

    async renderReplyRow(reply: ReplyEntry, parent: ThoughtEntry, container: HTMLElement) {
        const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24;
        const itemEl = container.createEl('div', {
            attr: { style: `margin-bottom: 3px; padding-bottom: 3px; display: flex; align-items: flex-start; margin-left: ${indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 6px;` }
        });

        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });
        const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; margin-bottom: 0; position: relative;' } });
        const cardWrapper = mainContentRow.createEl('div', { attr: { style: 'position: relative; flex-grow: 1; min-width: 0;' } });
        const renderTarget = cardWrapper.createEl('div', { cls: 'mina-card', attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word;' } });

        renderTarget.createEl('span', {
            text: `${reply.date} ${reply.time}`,
            attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.7; margin-left: 8px;' }
        });

        await MarkdownRenderer.render(this.plugin.app, reply.text, renderTarget, parent.filePath, this);
        this.hookInternalLinks(renderTarget, parent.filePath);
        this.hookImageZoom(renderTarget);
        const firstP = renderTarget.querySelector('p');
        if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }

        const actionsDiv = cardWrapper.createEl('div', { attr: { style: 'position: absolute; top: 2px; right: 4px; display: flex; gap: 6px; align-items: center; opacity: 0; transition: opacity 0.15s; background: var(--background-secondary); border-radius: 4px; padding: 1px 4px;' } });
        cardWrapper.addEventListener('mouseenter', () => actionsDiv.style.opacity = '1');
        cardWrapper.addEventListener('mouseleave', () => actionsDiv.style.opacity = '0');

        const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        const deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });

        deleteBtn.addEventListener('click', async () => {
            new ConfirmModal(this.plugin.app, 'Delete this reply?', async () => {
                await this.plugin.deleteReply(parent.filePath, reply.anchor);
                this.updateReviewThoughtsList();
            }).open();
        });

        const startReplyEdit = () => {
            const modal = new EditEntryModal(
                this.plugin.app,
                this.plugin,
                reply.text,
                '',
                null,
                false,
                async (newText: string, _: string, __: string | null) => {
                    await this.plugin.editReply(parent.filePath, reply.anchor, newText.replace(/<br>/g, '\n'));
                }
            );
            modal.open();
        };
        renderTarget.addEventListener('dblclick', startReplyEdit);
        editBtn.addEventListener('click', startReplyEdit);
    }

    async renderVoiceMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 12px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; padding-bottom: 200px;' } });

        const recorderSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 15px; background: var(--background-secondary); border-radius: 8px;' } });
        const recordButton = recorderSection.createEl('button', { attr: { style: 'width: 80px; height: 80px; border-radius: 50%; border: 4px solid var(--background-modifier-border); background-color: #c0392b; color: white; font-size: 1.2em; cursor: pointer; transition: all 0.2s;' } });
        recordButton.setText('●');

        const timerDisplay = recorderSection.createEl('div', { text: '00:00', attr: { style: 'font-family: monospace; font-size: 1.1em; color: var(--text-muted);' } });
        const statusDisplay = recorderSection.createEl('div', { text: 'Ready to record', attr: { style: 'font-size: 0.8em; color: var(--text-faint);' } });

        recordButton.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording(recordButton, timerDisplay, statusDisplay);
            }
        });

        const listSection = wrap.createEl('div');
        listSection.createEl('h4', { text: 'Your Voice Notes', attr: { style: 'margin-bottom: 10px;' } });
        const recordingsContainer = listSection.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });

        const voiceFolder = this.plugin.settings.voiceMemoFolder;
        const files = this.app.vault.getFiles().filter(f => f.path.startsWith(voiceFolder + '/') && (f.extension === 'webm' || f.extension === 'mp3' || f.extension === 'wav' || f.extension === 'm4a'));
        files.sort((a, b) => b.stat.ctime - a.stat.ctime);

        if (files.length === 0) {
            recordingsContainer.createEl('p', { text: 'No voice notes recorded yet.', attr: { style: 'color: var(--text-muted); font-size: 0.9em;' } });
        } else {
            for (const file of files) {
                const card = recordingsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--background-secondary); border-radius: 8px;' } });

                const header = card.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
                header.createEl('div', { text: moment(file.stat.ctime).format('YYYY-MM-DD HH:mm'), attr: { style: 'font-weight: 500;' } });

                const transcriptionStatusContainer = header.createEl('div');
                this.getTranscriptionStatus(file).then(isTranscribed => {
                    if (isTranscribed) {
                        transcriptionStatusContainer.createEl('span', { text: '✅ Transcribed', attr: { style: 'font-size: 0.8em; color: var(--text-success); background-color: var(--background-primary); padding: 3px 7px; border-radius: 4px;' } });
                    }
                });

                const audioEl = card.createEl('audio', { attr: { controls: true, src: this.app.vault.getResourcePath(file), style: 'width: 100%; height: 35px;' } });

                const actions = card.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });

                const transcribeBtn = actions.createEl('button', { text: 'Transcribe', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.85em; padding: 5px 12px; border-radius: 5px;' } });
                transcribeBtn.addEventListener('click', async () => {
                    transcribeBtn.setText('...');
                    transcribeBtn.disabled = true;
                    try {
                        new Notice('Starting transcription...');
                        const transcription = await this.transcribeAudio(file);
                        const thoughtText = `Transcription of [[${file.path}]]\n\n${transcription}`;
                        await this.plugin.createThoughtFile(thoughtText, ['#transcribed', '#voice-note']);
                        new Notice('Transcription saved as thought.');
                        this.renderView();
                    } catch (error) {
                        new Notice('Transcription failed: ' + error.message);
                        transcribeBtn.setText('Transcribe');
                        transcribeBtn.disabled = false;
                    }
                });

                const deleteBtn = actions.createEl('button', { text: '🗑️', attr: { title: 'Delete', style: 'background: none; border: none; font-size: 1.2em; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 5px;' } });
                deleteBtn.addEventListener('click', async () => {
                    new ConfirmModal(this.app, 'Delete this voice note?', async () => {
                        await this.app.vault.delete(file);
                        new Notice(`Voice note deleted.`);
                        this.renderView();
                    }).open();
                });
            }        }
    }

    async startRecording(recordButton: HTMLElement, timerDisplay: HTMLElement, statusDisplay: HTMLElement) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            let mimeType = 'audio/webm';
            let ext = 'webm';
            if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
                ext = 'webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
                ext = 'm4a';
            } else if (MediaRecorder.isTypeSupported('audio/mpeg')) {
                mimeType = 'audio/mpeg';
                ext = 'mp3';
            } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                mimeType = 'audio/ogg';
                ext = 'ogg';
            } else {
                mimeType = '';
                ext = 'm4a'; // safe fallback
            }

            this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            this.audioChunks = [];
            this.isRecording = true;
            
            this.mediaRecorder.ondataavailable = event => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = mimeType ? new Blob(this.audioChunks, { type: mimeType }) : new Blob(this.audioChunks);
                const arrayBuffer = await audioBlob.arrayBuffer();

                const folderPath = this.plugin.settings.voiceMemoFolder;
                if (!this.app.vault.getAbstractFileByPath(folderPath)) {
                    await this.app.vault.createFolder(folderPath);
                }

                const filename = `voice-${moment().format('YYYYMMDD-HHmmss')}.${ext}`;
                const filePath = `${folderPath}/${filename}`;
                
                await this.app.vault.createBinary(filePath, arrayBuffer);
                
                new Notice(`Voice note saved: ${filename}`);
                this.isRecording = false;
                stream.getTracks().forEach(track => track.stop());
                this.renderView();
            };

            this.mediaRecorder.start();
            statusDisplay.setText('Recording...');
            recordButton.style.backgroundColor = '#e74c3c';
            recordButton.setText('■');

            this.recordingStartTime = Date.now();
            this.recordingTimerInterval = setInterval(() => {
                const elapsed = Date.now() - this.recordingStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                timerDisplay.setText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            }, 1000);

        } catch (err) {
            new Notice('Microphone access denied. Please enable it in your browser settings.');
            console.error("Error accessing microphone:", err);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            if (this.recordingTimerInterval) {
                clearInterval(this.recordingTimerInterval);
                this.recordingTimerInterval = null;
            }
        }
    }

    async getTranscriptionStatus(audioFile: TFile): Promise<boolean> {
        // @ts-ignore - getBacklinksForFile is an undocumented but stable API
        const backlinks = (this.app.metadataCache as any).getBacklinksForFile(audioFile);
        const thoughtFolder = this.plugin.settings.thoughtsFolder.trim();
        if(!backlinks || !backlinks.data) return false;
        
        for (const path in backlinks.data) {
            if (path.startsWith(thoughtFolder)) {
                return true;
            }
        }
        return false;
    }

    async transcribeAudio(file: TFile): Promise<string> {
        const { geminiApiKey, geminiModel, transcriptionLanguage } = this.plugin.settings;
        if (!geminiApiKey) throw new Error("Gemini API key is not set.");

        const audioBuffer = await this.app.vault.readBinary(file);
        
        // Browser-compatible way to convert ArrayBuffer to base64
        let binary = '';
        const bytes = new Uint8Array(audioBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);
        
        let mimeType = 'audio/webm';
        if (file.extension === 'm4a' || file.extension === 'mp4') mimeType = 'audio/mp4';
        else if (file.extension === 'mp3') mimeType = 'audio/mp3';
        else if (file.extension === 'wav') mimeType = 'audio/wav';
        else if (file.extension === 'ogg') mimeType = 'audio/ogg';

        const requestBody = {
            "contents": [{
                "parts": [
                    { "text": `First, transcribe the audio in its original language. Second, translate the transcribed text into ${transcriptionLanguage}.` },
                    {
                        "inline_data": {
                            "mime_type": mimeType,
                            "data": base64Audio
                        }
                    }
                ]
            }]
        };

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error("Gemini API Error:", error);
            throw new Error(error?.error?.message || `HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            throw new Error("Could not extract transcription from Gemini response.");
        }
        
        return text.trim();
    }
}

class ChatSessionPickerModal extends FuzzySuggestModal<TFile> {
    files: TFile[];
    onChoose: (file: TFile) => void;

    constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onChoose = onChoose;
        this.setPlaceholder('Select a saved chat session…');
    }

    getItems(): TFile[] { return this.files; }

    getItemText(file: TFile): string {
        return `${file.basename} (${moment(file.stat.mtime).locale('en').format('YYYY-MM-DD HH:mm')})`;
    }

    onChooseItem(file: TFile): void { this.onChoose(file); }
}

class MinaSettingTab extends PluginSettingTab {
	plugin: MinaPlugin;
	constructor(app: App, plugin: MinaPlugin) { super(app, plugin); this.plugin = plugin; }
	display(): void {
		const {containerEl} = this;
		containerEl.empty();
        new Setting(containerEl).setName('Tasks Folder').setDesc('Folder where MINA V2 task files are stored.').addText(text => text.setPlaceholder('000 Bin/MINA V2 Tasks').setValue(this.plugin.settings.tasksFolder).onChange(async (value) => { this.plugin.settings.tasksFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Thoughts Folder').setDesc('Folder where MINA V2 thought files are stored.').addText(text => text.setPlaceholder('000 Bin/MINA V2').setValue(this.plugin.settings.thoughtsFolder).onChange(async (value) => { this.plugin.settings.thoughtsFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Personal Finance Folder').setDesc('Folder scanned by the Dues tab for recurring payment notes.').addText(text => text.setPlaceholder('000 Bin/MINA V2 PF').setValue(this.plugin.settings.pfFolder).onChange(async (value) => { this.plugin.settings.pfFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Date format').addText(text => text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat).onChange(async (value) => { this.plugin.settings.dateFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Time format').addText(text => text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat).onChange(async (value) => { this.plugin.settings.timeFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('New Note Folder').setDesc('Folder where notes created via the \\ link picker are saved.').addText(text => text.setPlaceholder('000 Bin').setValue(this.plugin.settings.newNoteFolder).onChange(async (value) => { this.plugin.settings.newNoteFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Voice Memo Folder').setDesc('Folder where recorded voice notes will be stored.').addText(text => text.setPlaceholder('000 Bin/MINA V2 Voice').setValue(this.plugin.settings.voiceMemoFolder).onChange(async (value) => { this.plugin.settings.voiceMemoFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Transcription Language').setDesc('The target language for audio transcription (e.g., English, Japanese).').addText(text => text.setPlaceholder('English').setValue(this.plugin.settings.transcriptionLanguage).onChange(async (value) => { this.plugin.settings.transcriptionLanguage = value; await this.plugin.saveSettings(); }));
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
        new Setting(containerEl).setName('Max Output Tokens').setDesc('Maximum tokens in Gemini AI responses (256–65536). Higher = longer answers. Default: 65536.').addText(text => {
            text.setPlaceholder('65536').setValue(String(this.plugin.settings.maxOutputTokens ?? 65536));
            text.inputEl.type = 'number';
            text.inputEl.min = '256';
            text.inputEl.max = '65536';
            text.onChange(async (value) => {
                const val = Math.min(65536, Math.max(256, parseInt(value) || 65536));
                this.plugin.settings.maxOutputTokens = val;
                await this.plugin.saveSettings();
            });
        });
	}
}


