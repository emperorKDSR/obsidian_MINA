import { Plugin, TFile, Notice, WorkspaceLeaf, Platform, moment, addIcon } from 'obsidian';
import { VIEW_TYPE_MINA, KATANA_ICON_ID, KATANA_ICON_SVG, DEFAULT_SETTINGS, JOURNAL_ICON_ID, JOURNAL_ICON_SVG, DAILY_ICON_ID, DAILY_ICON_SVG, AI_CHAT_ICON_ID, AI_CHAT_ICON_SVG, TIMELINE_ICON_ID, TIMELINE_ICON_SVG, FOCUS_ICON_ID, FOCUS_ICON_SVG, GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG, MEMENTO_ICON_ID, MEMENTO_ICON_SVG, TASK_ICON_ID, TASK_ICON_SVG, PF_ICON_ID, PF_ICON_SVG, SETTINGS_ICON_ID, SETTINGS_ICON_SVG, VOICE_ICON_ID, VOICE_ICON_SVG, HOME_ICON_ID, HOME_ICON_SVG, PROJECT_ICON_ID, PROJECT_ICON_SVG, SYNTHESIS_ICON_ID, SYNTHESIS_ICON_SVG, COMPASS_ICON_ID, COMPASS_ICON_SVG, REVIEW_ICON_ID, REVIEW_ICON_SVG } from './constants';
import { MinaSettings } from './types';
import { isTablet } from './utils';
import { MinaView } from './view';
import { MinaSettingTab } from './settings';

import { AiService } from './services/AiService';
import { VaultService } from './services/VaultService';
import { IndexService } from './services/IndexService';

export default class MinaPlugin extends Plugin {
	settings: MinaSettings;
    settingsInitialized: boolean = false;
    
    // Services
    ai: AiService;
    vault: VaultService;
    index: IndexService;

    private _indexDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();

        // Initialize Services
        this.ai = new AiService(this.app, this.settings);
        this.vault = new VaultService(this.app, this.settings);
        this.index = new IndexService(this.app, this.settings);

        this.app.workspace.onLayoutReady(async () => {
            await this.index.buildIndices();
            this.notifyRefresh(); // ensure view re-renders with freshly-built index
            this.scanForContexts();
            
            // --- REACTIVE NERVE SYSTEM ---
            // vault events: fast path for local writes (create/delete/rename)
            this.registerEvent(this.app.vault.on('create', async (f) => { 
                if (this.index.isThoughtFile(f.path)) await this.index.indexThoughtFile(f as TFile);
                else if (this.index.isTaskFile(f.path)) await this.index.indexTaskFile(f as TFile);
                else if (f.path.startsWith((this.settings.habitsFolder || '000 Bin/MINA V2 Habits').replace(/\\/g, '/'))) await this.index.refreshHabitIndex();
                this.notifyRefresh(); 
            }));
            
            this.registerEvent(this.app.vault.on('modify', async (f) => { 
                await this._reindexFile(f as TFile);
                this.notifyRefresh();
            }));

            this.registerEvent(this.app.vault.on('delete', (f) => { 
                this.index.thoughtIndex.delete(f.path); 
                this.index.taskIndex.delete(f.path); 
                this.notifyRefresh(); 
            }));
            
            this.registerEvent(this.app.vault.on('rename', async (f, oldPath) => {
                this.index.thoughtIndex.delete(oldPath);
                this.index.taskIndex.delete(oldPath);
                if (this.index.isThoughtFile(f.path)) await this.index.indexThoughtFile(f as TFile);
                else if (this.index.isTaskFile(f.path)) await this.index.indexTaskFile(f as TFile);
                this.notifyRefresh();
            }));

            // metadataCache.changed: authoritative trigger for cloud-synced files
            // (OneDrive/iCloud sync may not fire vault 'modify'/'create' reliably)
            this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
                await this._reindexFile(file);
                this.notifyRefresh();
            }));
        });

        this.registerView(VIEW_TYPE_MINA, (leaf) => new MinaView(leaf, this));

		addIcon(KATANA_ICON_ID, KATANA_ICON_SVG);
		addIcon(JOURNAL_ICON_ID, JOURNAL_ICON_SVG);
		addIcon(DAILY_ICON_ID, DAILY_ICON_SVG);
		addIcon(AI_CHAT_ICON_ID, AI_CHAT_ICON_SVG);
		addIcon(TIMELINE_ICON_ID, TIMELINE_ICON_SVG);
		addIcon(FOCUS_ICON_ID, FOCUS_ICON_SVG);
		addIcon(GRUNDFOS_ICON_ID, GRUNDFOS_ICON_SVG);
		addIcon(MEMENTO_ICON_ID, MEMENTO_ICON_SVG);
		addIcon(PF_ICON_ID, PF_ICON_SVG);
		addIcon(VOICE_ICON_ID, VOICE_ICON_SVG);
		addIcon(PROJECT_ICON_ID, PROJECT_ICON_SVG);
		addIcon(SYNTHESIS_ICON_ID, SYNTHESIS_ICON_SVG);
		addIcon(COMPASS_ICON_ID, COMPASS_ICON_SVG);
		addIcon(REVIEW_ICON_ID, REVIEW_ICON_SVG);
		addIcon(SETTINGS_ICON_ID, SETTINGS_ICON_SVG);
        addIcon(HOME_ICON_ID, HOME_ICON_SVG);

		this.addRibbonIcon(HOME_ICON_ID, 'MINA Hub', () => { this.activateView('home', true); });

        this.addCommand({ id: 'open-mina-home-mode', name: 'MINA: Open Command Center', icon: HOME_ICON_ID, callback: () => { this.activateView('home', true); } });

		this.addSettingTab(new MinaSettingTab(this.app, this));
        setTimeout(() => this.migrateLegacyTableData(), 2000);
	}

    async onunload() {
        // leak-01: Clear pending debounce timer to prevent firing on torn-down plugin state
        if (this._indexDebounceTimer) {
            clearTimeout(this._indexDebounceTimer);
            this._indexDebounceTimer = null;
        }
    }

    async migrateLegacyTableData() {
        const { vault } = this.app;
        const thoughtsPath = this.settings.captureFolder + '/' + this.settings.captureFilePath;
        const tasksPath = this.settings.captureFolder + '/' + this.settings.tasksFilePath;
        const migrateFile = async (path: string, isTask: boolean) => {
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return;
            const content = await vault.read(file);
            const lines = content.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---') && !l.includes('Date'));
            for (const line of lines) {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 8) {
                    const text = parts[7].replace(/<br>/g, '\n');
                    const ctxs = (parts[8].match(/#[^#\s|]+/g) || []).map(c => c.substring(1));
                    if (isTask) {
                        const due = parts[6].replace(/\[\[|\]\]/g, '');
                        await this.vault.createTaskFile(text, ctxs, due);
                    } else await this.vault.createThoughtFile(text, ctxs);
                }
            }
            await vault.rename(file, path + '.bak');
            new Notice(`Migrated legacy ${isTask ? 'tasks' : 'thoughts'}.`);
        };
        await migrateFile(thoughtsPath, false);
        await migrateFile(tasksPath, true);
    }

    async activateView(tabId?: string, isDedicated: boolean = false) {
        const { workspace } = this.app;
        const targetTab = tabId || (isDedicated ? 'home' : 'review-thoughts');
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
        let targetLeaf: WorkspaceLeaf | null = null;
        for (const leaf of leaves) {
            const view = leaf.view as MinaView;
            if (view && view.isDedicated === isDedicated && view.activeTab === targetTab) { targetLeaf = leaf; break; }
        }
        if (!targetLeaf && isDedicated && !Platform.isMobile) {
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && view.isDedicated) {
                    targetLeaf = leaf;
                    break;
                }
            }
        }
        if (!targetLeaf) targetLeaf = Platform.isMobile ? (isTablet() ? workspace.getLeaf(false) : workspace.getLeaf('tab')) : workspace.getLeaf('window');
        if (targetLeaf) {
            await targetLeaf.setViewState({ type: VIEW_TYPE_MINA, active: true, state: { activeTab: targetTab, isDedicated } });
            workspace.revealLeaf(targetLeaf);
        }
    }

    async scanForContexts() {
        const foundContexts = await this.index.scanForContexts();
        let newCtx = false;
        foundContexts.forEach(c => { if (c && typeof c === 'string' && !this.settings.contexts.includes(c)) { this.settings.contexts.push(c); newCtx = true; } });
        if (newCtx) await this.saveSettings();
    }

	async loadSettings() {
		const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        if (loadedData) Object.assign(this.settings, loadedData);
        // Sanitize: remove null/non-string entries that can creep in from malformed YAML frontmatter
        if (this.settings.contexts) {
            this.settings.contexts = this.settings.contexts.filter((c: any) => c && typeof c === 'string');
        }
        this.settingsInitialized = true;
	}

	async saveSettings() {
	    if (!this.settingsInitialized) return;
	    await this.saveData(this.settings);
        if (this.ai) this.ai.updateSettings(this.settings);
        if (this.vault) this.vault.updateSettings(this.settings);
        if (this.index) this.index.updateSettings(this.settings);
	}

    /** Re-indexes a single file based on its type. Called by both vault and metadataCache events. */
    private async _reindexFile(file: TFile): Promise<void> {
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/MINA V2 Habits').replace(/\\/g, '/');
        const capPath = `${this.settings.captureFolder.trim() || '000 Bin/MINA V2'}/${this.settings.captureFilePath.trim() || 'Daily Capture.md'}`;

        if (this.index.isThoughtFile(file.path)) await this.index.indexThoughtFile(file);
        else if (this.index.isTaskFile(file.path)) await this.index.indexTaskFile(file);

        if (file.path.startsWith(habitsFolder)) await this.index.refreshHabitIndex();
        else if (file.path === capPath) await this.index.buildChecklistIndex();
    }

    notifyRefresh(): void {
        if (this._indexDebounceTimer) clearTimeout(this._indexDebounceTimer);
        this._indexDebounceTimer = setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINA);
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && typeof view.renderView === 'function') {
                    // Don't re-render while the user is mid-toggle — let optimistic UI stand
                    if (view._taskTogglePending > 0 || view._habitTogglePending > 0 || view._checklistTogglePending > 0 || view._capturePending > 0) continue;
                    view.renderView();
                }
            }
        }, 400); // 400ms: handles cloud-sync bursts and gives async indexing headroom
    }

    getProjects(): string[] {
        return this.index ? this.index.getProjects() : [];
    }

    async getHabitStatus(date: string): Promise<string[]> {
        return this.index ? this.index.habitStatusIndex : [];
    }

    async toggleHabit(date: string, habitId: string): Promise<void> {
        if (this.vault) {
            await this.vault.toggleHabit(date, habitId);
            await this.index.refreshHabitIndex();
            this.notifyRefresh();
        }
    }
}
