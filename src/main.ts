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
            const foundContexts = await this.index.scanForContexts();
            let newCtx = false;
            foundContexts.forEach(c => { if (!this.settings.contexts.includes(c)) { this.settings.contexts.push(c); newCtx = true; } });
            if (newCtx) await this.saveSettings();

            await this.index.buildIndices();
            
            this.registerEvent(this.app.vault.on('create', async (f) => { 
                if (this.index.isThoughtFile(f.path)) { await this.index.indexThoughtFile(f as TFile); this.notifyRefresh(); }
                else if (this.index.isTaskFile(f.path)) { await this.index.indexTaskFile(f as TFile); this.notifyRefresh(); }
            }));
            this.registerEvent(this.app.vault.on('modify', async (f) => { 
                if (this.index.isThoughtFile(f.path)) { await this.index.indexThoughtFile(f as TFile); this.notifyRefresh(); }
                else if (this.index.isTaskFile(f.path)) { await this.index.indexTaskFile(f as TFile); this.notifyRefresh(); }
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
		this.addRibbonIcon(DAILY_ICON_ID, 'Daily Mode', () => { this.activateView('daily', true); });
		this.addRibbonIcon(REVIEW_ICON_ID, 'Weekly Review', () => { this.activateView('review', true); });
		this.addRibbonIcon(PROJECT_ICON_ID, 'Projects Mode', () => { this.activateView('projects', true); });
		this.addRibbonIcon(SYNTHESIS_ICON_ID, 'Synthesis Mode', () => { this.activateView('synthesis', true); });
		this.addRibbonIcon(COMPASS_ICON_ID, 'Quarterly Compass', () => { this.activateView('compass', true); });
		this.addRibbonIcon(VOICE_ICON_ID, 'Voice Note Mode', () => { this.activateView('voice-note', true); });
		this.addRibbonIcon(JOURNAL_ICON_ID, 'Journal Mode', () => { this.activateView('journal', true); });
		this.addRibbonIcon(TASK_ICON_ID, 'Task Mode', () => { this.activateView('review-tasks', true); });
		this.addRibbonIcon(PF_ICON_ID, 'Personal Finance', () => { this.activateView('pf', true); });
		this.addRibbonIcon(SETTINGS_ICON_ID, 'MINA Settings', () => { this.activateView('settings', true); });
		this.addRibbonIcon(AI_CHAT_ICON_ID, 'AI Mode', () => { this.activateView('mina-ai', true); });
		this.addRibbonIcon(TIMELINE_ICON_ID, 'Timeline Mode', () => { this.activateView('timeline', true); });
		this.addRibbonIcon(FOCUS_ICON_ID, 'Focus Mode', () => { this.activateView('focus', true); });
		this.addRibbonIcon(GRUNDFOS_ICON_ID, 'Grundfos Mode', () => { this.activateView('grundfos', true); });
		this.addRibbonIcon(MEMENTO_ICON_ID, 'Memento Mori', () => { this.activateView('memento-mori', true); });

        this.addCommand({ id: 'open-mina-home-mode', name: 'MINA Hub', icon: HOME_ICON_ID, callback: () => { this.activateView('home', true); } });
		this.addCommand({ id: 'open-mina-journal-mode', name: 'Journal Mode', icon: JOURNAL_ICON_ID, callback: () => { this.activateView('journal', true); } });
		this.addCommand({ id: 'open-mina-daily-mode', name: 'Daily Mode', icon: DAILY_ICON_ID, callback: () => { this.activateView('daily', true); } });
		this.addCommand({ id: 'open-mina-timeline', name: 'Timeline Mode', icon: TIMELINE_ICON_ID, callback: () => { this.activateView('timeline', true); } });
		this.addCommand({ id: 'open-mina-focus-mode', name: 'Focus Mode', icon: FOCUS_ICON_ID, callback: () => { this.activateView('focus', true); } });
		this.addCommand({ id: 'open-mina-grundfos-mode', name: 'Grundfos Mode', icon: GRUNDFOS_ICON_ID, callback: () => { this.activateView('grundfos', true); } });
		this.addCommand({ id: 'open-mina-memento-mori', name: 'Memento Mori', icon: MEMENTO_ICON_ID, callback: () => { this.activateView('memento-mori', true); } });
		this.addCommand({ id: 'open-mina-voice-note', name: 'Voice Note Mode', icon: VOICE_ICON_ID, callback: () => { this.activateView('voice-note', true); } });
		this.addCommand({ id: 'open-mina-projects-mode', name: 'Projects Mode', icon: PROJECT_ICON_ID, callback: () => { this.activateView('projects', true); } });
		this.addCommand({ id: 'open-mina-synthesis-mode', name: 'Synthesis Mode', icon: SYNTHESIS_ICON_ID, callback: () => { this.activateView('synthesis', true); } });
		this.addCommand({ id: 'open-mina-compass-mode', name: 'Quarterly Compass', icon: COMPASS_ICON_ID, callback: () => { this.activateView('compass', true); } });
		this.addCommand({ id: 'open-mina-weekly-review', name: 'Weekly Review', icon: REVIEW_ICON_ID, callback: () => { this.activateView('review', true); } });
		this.addCommand({ id: 'open-mina-pf-mode', name: 'Personal Finance Mode', icon: PF_ICON_ID, callback: () => { this.activateView('pf', true); } });
		this.addCommand({ id: 'open-mina-settings', name: 'Settings Mode', icon: SETTINGS_ICON_ID, callback: () => { this.activateView('settings', true); } });
		this.addCommand({ id: 'open-mina-task-mode', name: 'Task Mode', icon: TASK_ICON_ID, callback: () => { this.activateView('review-tasks', true); } });
		this.addCommand({ id: 'open-mina-ai-mode', name: 'AI Mode', icon: AI_CHAT_ICON_ID, callback: () => { this.activateView('mina-ai', true); } });

		this.addCommand({
			id: 'enable-compact-view',
			name: 'Enable Compact View',
			callback: async () => {
				this.settings.isCompactView = true;
				await this.saveSettings();
				new Notice('Compact View enabled');
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINA);
                for (const leaf of leaves) {
                    const view = leaf.view as MinaView;
                    if (view && typeof view.renderView === 'function') view.renderView();
                }
			}
		});

		this.addCommand({
			id: 'disable-compact-view',
			name: 'Enable Full View',
			callback: async () => {
				this.settings.isCompactView = false;
				await this.saveSettings();
				new Notice('Full View enabled');
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINA);
                for (const leaf of leaves) {
                    const view = leaf.view as MinaView;
                    if (view && typeof view.renderView === 'function') view.renderView();
                }
			}
		});

        this.registerCustomModes();
		this.addSettingTab(new MinaSettingTab(this.app, this));
        
        // Phase 3: Legacy Bridge
        setTimeout(() => this.migrateLegacyTableData(), 2000);
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
                if (isTask && parts.length >= 8) {
                    const taskText = parts[7].replace(/<br>/g, '\n');
                    const contexts = (parts[8].match(/#[^#\s|]+/g) || []).map(c => c.substring(1));
                    const due = parts[6].replace(/\[\[|\]\]/g, '');
                    await this.vault.createTaskFile(taskText, contexts, due);
                } else if (!isTask && parts.length >= 8) {
                    const thoughtText = parts[7].replace(/<br>/g, '\n');
                    const contexts = (parts[8].match(/#[^#\s|]+/g) || []).map(c => c.substring(1));
                    await this.vault.createThoughtFile(thoughtText, contexts);
                }
            }
            await vault.rename(file, path + '.bak');
            new Notice(`Migrated legacy ${isTask ? 'tasks' : 'thoughts'} to new unified file model.`);
        };

        await migrateFile(thoughtsPath, false);
        await migrateFile(tasksPath, true);
    }

    async activateView(tabId?: string, isDedicated: boolean = false) {
        const { workspace } = this.app;
        const targetTab = tabId || (isDedicated ? 'home' : 'review-thoughts');

        if (Platform.isMobile) {
            const leaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
            let targetLeaf: WorkspaceLeaf | null = null;
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && view.isDedicated === isDedicated && (isDedicated ? view.activeTab === targetTab : true)) { targetLeaf = leaf; break; }
            }
            if (!targetLeaf) targetLeaf = isTablet() ? workspace.getLeaf(false) : workspace.getLeaf('tab');
            if (targetLeaf) {
                await targetLeaf.setViewState({ type: VIEW_TYPE_MINA, active: true, state: { activeTab: targetTab, isDedicated } });
                workspace.revealLeaf(targetLeaf);
            }
            return;
        }

        const allLeaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
        let targetLeaf: WorkspaceLeaf | null = null;
        for (const leaf of allLeaves) {
            const view = leaf.view as MinaView;
            if (view && view.isDedicated === isDedicated) {
                if (isDedicated && view.activeTab === targetTab) { targetLeaf = leaf; break; }
                if (!isDedicated) { targetLeaf = leaf; break; }
            }
        }
        if (!targetLeaf) targetLeaf = workspace.getLeaf('window');
        if (targetLeaf) {
            await targetLeaf.setViewState({ type: VIEW_TYPE_MINA, active: true, state: { activeTab: targetTab, isDedicated } });
            workspace.revealLeaf(targetLeaf);
        }
    }

    registerCustomModes() {
        for (const mode of this.settings.customModes) {
            this.addRibbonIcon(mode.icon || 'pencil', mode.name, () => { this.activateView(mode.id, true); });
            this.addCommand({ id: `open-mina-mode-${mode.id}`, name: mode.name, icon: mode.icon || 'pencil', callback: () => { this.activateView(mode.id, true); } });
        }
    }

	async loadSettings() {
		const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);
        this.settings.dailySectionStates = { ...DEFAULT_SETTINGS.dailySectionStates };
        if (loadedData) {
            Object.assign(this.settings, loadedData);
            this.settingsInitialized = true;
        } else {
            this.settings.contexts = [];
            this.settingsInitialized = true;
        }
	}

	async saveSettings() {
	    if (!this.settingsInitialized) return;
	    await this.saveData(this.settings);
        if (this.ai) this.ai.updateSettings(this.settings);
        if (this.vault) this.vault.updateSettings(this.settings);
        if (this.index) this.index.updateSettings(this.settings);
	}

    notifyRefresh(): void {
        if (this._indexDebounceTimer) clearTimeout(this._indexDebounceTimer);
        this._indexDebounceTimer = setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINA);
            for (const leaf of leaves) {
                const view = leaf.view as MinaView;
                if (view && typeof view.renderView === 'function') view.renderView();
            }
        }, 300);
    }

    getProjects(): string[] {
        return this.index ? this.index.getProjects() : [];
    }

    async getHabitStatus(date: string): Promise<string[]> {
        return this.vault ? await this.vault.getHabitStatus(date) : [];
    }

    async toggleHabit(date: string, habitId: string): Promise<void> {
        if (this.vault) await this.vault.toggleHabit(date, habitId);
    }
}
