import { Plugin, TFile, Notice, WorkspaceLeaf, Platform, moment, addIcon } from 'obsidian';
import { VIEW_TYPE_MINA, KATANA_ICON_ID, KATANA_ICON_SVG, DEFAULT_SETTINGS } from './constants';
import { MinaSettings, ThoughtEntry, TaskEntry, ReplyEntry } from './types';
import { isTablet, toAsciiDigits } from './utils';
import { MinaView } from './view';
import { MinaSettingTab } from './settings';

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

		this.addRibbonIcon(KATANA_ICON_ID, 'Full Mode', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-mina-full-mode',
			name: 'Full Mode',
			icon: KATANA_ICON_ID,
			callback: () => {
				this.activateView('daily');
			}
		});

		this.addCommand({
			id: 'open-mina-daily-mode',
			name: 'Daily Mode',
			icon: KATANA_ICON_ID,
			callback: () => {
				this.activateView('daily', true);
			}
		});

		this.addCommand({
			id: 'open-mina-timeline',
			name: 'Timeline Mode',
			icon: KATANA_ICON_ID,
			callback: () => {
				this.activateView('timeline', true);
			}
		});

		this.addCommand({
			id: 'open-mina-task-mode',
			name: 'Task Mode',
			icon: KATANA_ICON_ID,
			callback: () => {
				this.activateView('review-tasks', true);
			}
		});

		this.addCommand({
			id: 'open-mina-ai-mode',
			name: 'AI Mode',
			icon: KATANA_ICON_ID,
			callback: () => {
				this.activateView('mina-ai', true);
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

    async activateView(tabId?: string, isDedicated: boolean = false) {
        const { workspace } = this.app;
        const targetTab = tabId || (isDedicated ? 'daily' : 'review-thoughts');

        if (Platform.isMobile) {
            const leaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
            let targetLeaf: WorkspaceLeaf | null = null;

            // Try to find a leaf that matches our desired mode/tab
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && view.isDedicated === isDedicated && (isDedicated ? view.activeTab === targetTab : true)) {
                    targetLeaf = leaf;
                    break;
                }
            }

            if (!targetLeaf) {
                targetLeaf = isTablet() ? workspace.getLeaf(false) : workspace.getLeaf('tab');
            }

            if (targetLeaf) {
                await targetLeaf.setViewState({ 
                    type: VIEW_TYPE_MINA, 
                    active: true,
                    state: { activeTab: targetTab, isDedicated }
                });
                workspace.revealLeaf(targetLeaf);
            }
            return;
        }

        // Desktop: Simultaneous Instances
        const allLeaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
        let targetLeaf: WorkspaceLeaf | null = null;

        // Try to find an existing leaf that matches the specific mode and tab (if dedicated)
        for (const leaf of allLeaves) {
            const view = leaf.view as MinaView;
            if (view && view.isDedicated === isDedicated) {
                // For dedicated views, we want a tab match (e.g. unique window for Daily, unique for Timeline)
                if (isDedicated && view.activeTab === targetTab) {
                    targetLeaf = leaf;
                    break;
                }
                // For Full Mode, we just want the one instance
                if (!isDedicated) {
                    targetLeaf = leaf;
                    break;
                }
            }
        }

        if (!targetLeaf) {
            targetLeaf = workspace.getLeaf('window');
        }

        if (targetLeaf) {
            await targetLeaf.setViewState({
                type: VIEW_TYPE_MINA,
                active: true,
                state: { activeTab: targetTab, isDedicated }
            });
            workspace.revealLeaf(targetLeaf);
        }
    }

	async loadSettings() {
		const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        // Ensure dailySectionStates is a fresh object even if loadedData is empty
        this.settings.dailySectionStates = { ...DEFAULT_SETTINGS.dailySectionStates };

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
            if (loadedData.voiceMemoFolder !== undefined) this.settings.voiceMemoFolder = loadedData.voiceMemoFolder;
            if (loadedData.transcriptionLanguage !== undefined) this.settings.transcriptionLanguage = loadedData.transcriptionLanguage;
            if (loadedData.maxOutputTokens !== undefined) this.settings.maxOutputTokens = loadedData.maxOutputTokens;
            if (loadedData.dailySectionStates !== undefined) this.settings.dailySectionStates = { ...loadedData.dailySectionStates };
            if (loadedData.showDailySections !== undefined) this.settings.showDailySections = loadedData.showDailySections;
            if (loadedData.showDailyChecklist !== undefined) this.settings.showDailyChecklist = loadedData.showDailyChecklist;
            if (loadedData.showDailyTasks !== undefined) this.settings.showDailyTasks = loadedData.showDailyTasks;
            if (loadedData.showDailyDues !== undefined) this.settings.showDailyDues = loadedData.showDailyDues;
            if (loadedData.showDailyThoughts !== undefined) this.settings.showDailyThoughts = loadedData.showDailyThoughts;
            if (loadedData.showDailyPinned !== undefined) this.settings.showDailyPinned = loadedData.showDailyPinned;
            this.settingsInitialized = true;
        }

        if (this.settings.dateFormat === 'YYYY-MM-DD HH:mm') {
            this.settings.dateFormat = 'YYYY-MM-DD';
            this.settings.timeFormat = 'HH:mm';
        }
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
            newRow = `| [ ] | ${dateCol} | ${timeCol} | ${dateCol} | ${timeCol} | ${dueDateCol} | ${sanitizedContent} | ${contextsCol} |`;
            header = `| Status | Date | Time | Modified Date | Modified Time | Due Date | Task | Context |`;
            separator = `| :---: | --- | --- | --- | --- | --- | --- | --- |`;
        } else {
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
                lines[0] = header;
                lines[1] = separator;
                lines.splice(2, 0, newRow);

                if (!isTask && parentId) {
                    let currentParentToFind = parentId;
                    while (currentParentToFind) {
                        let found = false;
                        for (let i = 2; i < lines.length; i++) {
                            const rowParts = lines[i].split('|');
                            if (rowParts.length >= 2 && rowParts[1].trim() === currentParentToFind) {
                                rowParts[5] = ` ${dateCol} `;
                                rowParts[6] = ` ${timeCol} `;
                                lines[i] = rowParts.join('|');
                                currentParentToFind = rowParts[2].trim();
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

    buildFrontmatter(title: string, created: string, modified: string, dayStr: string, contexts: string[], pinned: boolean = false): string {
        const contextYaml = contexts.length > 0 ? contexts.map(c => `  - ${c}`).join('\n') : '  []';
        const tagsYaml = contextYaml;
        return `---\ntitle: "${title.replace(/"/g, "'")}"\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: MINA\ncontext:\n${contextYaml}\ntags:\n${tagsYaml}\npinned: ${pinned}\n---\n`;
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
            const oldFm = fmMatch[0];
            const createdMatch = oldFm.match(/^created: (.+)$/m);
            const created = createdMatch ? createdMatch[1] : this.formatDateTime(new Date());
            const now = new Date();
            const dayStr = this.formatDate(now);
            const title = this.extractTitle(newText);
            const modifiedStr = this.formatDateTime(now);
            const pinnedMatch = oldFm.match(/^pinned: (.+)$/m);
            const pinned = pinnedMatch ? pinnedMatch[1].trim() === 'true' : false;
            const newFm = this.buildFrontmatter(title, created, modifiedStr, dayStr, contexts, pinned);
            await vault.modify(file, newFm + newText + (content.includes('## [[') ? '\n\n' + content.slice(content.indexOf('## [[')) : '\n'));
        } catch (e) {
            new Notice('MINA Error: ' + (e instanceof Error ? e.message : String(e)));
        }
    }

    async toggleThoughtPin(filePath: string, pinned: boolean): Promise<void> {
        const { vault } = this.app;
        const file = vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) return;
        try {
            const content = (await vault.read(file)).replace(/\r\n/g, '\n');
            let updated: string;
            if (/^pinned:\s*(true|false)/m.test(content)) {
                updated = content.replace(/^pinned:\s*(true|false).*/m, `pinned: ${pinned}`);
            } else {
                updated = content.replace(/^(modified: .*)$/m, `$1\npinned: ${pinned}`);
            }
            if (updated !== content) {
                await vault.modify(file, updated);
                const entry = this.thoughtIndex.get(filePath);
                if (entry) { entry.pinned = pinned; this.notifyViewRefresh(); }
            }
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
            if (!vault.getAbstractFileByPath(trashFolder)) await vault.createFolder(trashFolder);
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
        const pinned  = get('pinned') === 'true';

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

        const allDates: string[] = [];
        const dateLinkRegex = /\[\[(\d{4}-\d{2}-\d{2})\]\]/g;
        let dMatch;
        while ((dMatch = dateLinkRegex.exec(content)) !== null) { if (!allDates.includes(dMatch[1])) allDates.push(dMatch[1]); }
        if (day && !allDates.includes(day)) allDates.push(day);

        return { filePath, title, created, modified, day, allDates, context, body: bodyText, children, lastThreadUpdate: Math.max(modMs, lastChild), pinned };
    }

    notifyViewRefresh(): void {
        if (this._thoughtIndexDebounceTimer) clearTimeout(this._thoughtIndexDebounceTimer);
        this._thoughtIndexDebounceTimer = setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINA);
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && typeof view.updateReviewThoughtsList === 'function') view.updateReviewThoughtsList();
                if (view && typeof view.renderView === 'function') view.renderView();
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
                if (view && typeof view.renderView === 'function') view.renderView();
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

    async savePayment(file: TFile, payDate: string, nextDue: string, notes: string, files: File[]): Promise<void> {
        // Implementation of savePayment used by Dues tab
        try {
            await this.app.fileManager.processFrontMatter(file, (fm: any) => {
                fm['last_payment'] = payDate;
                fm['next_duedate'] = nextDue;
            });

            const folder = file.parent?.path ?? '';
            const saveAttachment = async (name: string, buffer: ArrayBuffer) => {
                const destPath = folder ? `${folder}/${name}` : name;
                try {
                    await this.app.vault.createBinary(destPath, buffer);
                } catch {
                    await this.app.vault.adapter.writeBinary(destPath, buffer);
                }
                return name;
            };

            const lines: string[] = [`## Payment — ${payDate}`];
            if (notes.trim()) lines.push('', notes.trim());

            for (const f of files) {
                const buf = await f.arrayBuffer();
                await saveAttachment(f.name, buf);
                lines.push('', `![[${f.name}]]`);
            }
            lines.push('');

            const current = await this.app.vault.read(file);
            const fmEnd = current.indexOf('---', 3);
            let insertPos = 0;
            if (current.startsWith('---') && fmEnd !== -1) {
                insertPos = fmEnd + 3;
                if (current[insertPos] === '\n') insertPos++;
            }
            const entry = '\n' + lines.join('\n') + '\n';
            await this.app.vault.modify(file, current.slice(0, insertPos) + entry + current.slice(insertPos));
        } catch (e) {
            new Notice(`Error saving payment: ${e.message}`);
        }
    }

    async createFile(filename: string, content: string): Promise<TFile> {
        const { vault } = this.app;
        const folder = this.settings.captureFolder.trim() || '000 Bin/MINA V2';
        
        // Ensure folder exists
        if (folder && folder !== '/') {
            const parts = folder.split('/');
            let currentPath = '';
            for (const part of parts) {
                currentPath += (currentPath ? '/' : '') + part;
                if (!vault.getAbstractFileByPath(currentPath)) {
                    await vault.createFolder(currentPath);
                }
            }
        }

        const fullPath = folder ? `${folder}/${filename}` : filename;
        
        // Handle duplicate filenames
        let finalPath = fullPath;
        let counter = 1;
        while (vault.getAbstractFileByPath(finalPath)) {
            const extIdx = fullPath.lastIndexOf('.');
            if (extIdx !== -1) {
                finalPath = `${fullPath.substring(0, extIdx)} (${counter})${fullPath.substring(extIdx)}`;
            } else {
                finalPath = `${fullPath} (${counter})`;
            }
            counter++;
        }

        try {
            const file = await vault.create(finalPath, content);
            new Notice(`Created file: ${file.path}`);
            return file;
        } catch (e) {
            new Notice(`Error creating file: ${e.message}`);
            throw e;
        }
    }
}
