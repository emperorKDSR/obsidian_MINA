import { ItemView, WorkspaceLeaf, moment, TFile, Platform, ViewStateResult } from 'obsidian';
import { VIEW_TYPE_MINA, KATANA_ICON_ID } from './constants';
import type MinaPlugin from './main';
import { BaseTab } from './tabs/BaseTab';
import type { ChatMessage } from './types';

export class MinaView extends ItemView {
    plugin: MinaPlugin;
    content: string = '';
    dueDate: string = moment().format('YYYY-MM-DD');
    activeTab: string = 'home';
    isDedicated: boolean = false;
    
    // UI State
    timelineSelectedDate: string = moment().format('YYYY-MM-DD');
    timelineScrollBody: HTMLElement;
    timelineCarousel: HTMLElement;

    collapsedThreads: Set<string> = new Set();
    activeMasterNote: TFile | null = null;
    activeSynthesisContext: string | null = null;
    synthesisFeedFilter: 'no-context' | 'with-context' | 'processed' = 'no-context';
    isZenMode: boolean = false;

    // Daily Workspace State
    dailyWorkspaceDate: string = moment().format('YYYY-MM-DD');

    searchQuery: string = '';

    // Tasks state — persists across re-renders (viewMode survives vault events)
    tasksViewMode: string = 'open';
    _taskTogglePending: number = 0;       // > 0 = suppress vault-event re-renders
    _habitTogglePending: number = 0;      // > 0 = suppress vault-event re-renders (CommandCenter habits)
    _checklistTogglePending: number = 0;  // > 0 = suppress vault-event re-renders
    _capturePending: number = 0;          // > 0 = capture bar is expanded; suppress re-renders
    checklistOrder: string[] = [];        // persisted drag-reorder keys: "filePath:lineIndex"
    checklistShowDone: boolean = true;    // persisted show/hide completed checklist items
    // key = "filePath:lineIndex", value = YYYY-MM-DD — keeps completed items visible for the day
    checklistCompletedToday: Map<string, { text: string; date: string }> = new Map();
    
    // AI State
    chatHistory: ChatMessage[] = [];
    isAiLoading: boolean = false;
    webSearchEnabled: boolean = false;
    groundedFiles: TFile[] = [];
    groundedNotesBar: HTMLElement;
    chatContainer: HTMLElement;
    currentChatFile: string | null = null;

    // Voice State
    isRecording: boolean = false;

    private _baseTabDelegate: BaseTab;
    // Managed current tab instance for lifecycle cleanup
    private currentTab: BaseTab | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this._baseTabDelegate = new (class extends BaseTab { render() {} })(this);
    }

    getViewType(): string { return VIEW_TYPE_MINA; }
    getDisplayText(): string {
        if (Platform.isMobile) return `M.I.N.A.`;
        return this.getModeTitle();
    }
    getIcon() { return KATANA_ICON_ID; }

    getModeTitle(): string {
        switch (this.activeTab) {
            case 'home': return "MINA Hub";
            case 'daily': return "Daily";
            case 'review-thoughts': return "Thoughts";
            case 'review-tasks': return "Tasks";
            case 'mina-ai': return "AI Chat";
            case 'dues': return "Dues";
            case 'projects': return "Projects";
            case 'synthesis': return "Synthesis";
            case 'compass': return "Compass";
            case 'review': return "Weekly Review";
            case 'monthly-review': return "Monthly Review";
            case 'voice-note': return "Voice Notes";
            case 'habits': return "Habits";
            case 'settings': return "Settings";
            case 'timeline': return "Timeline";
            case 'journal': return "Journal";
            case 'daily-workspace': return "Daily Workspace";
            default: return "MINA";
        }
    }

    async onOpen() {
        // Hide Obsidian's view header (title bar inside leaf content)
        const header = this.containerEl.children[0] as HTMLElement;
        if (header) header.style.display = 'none';
        this.renderView();
    }

    async onClose() {}

    /** Persist activeTab + isDedicated so Obsidian can restore the window on reload. */
    getState(): Record<string, unknown> {
        return { activeTab: this.activeTab, isDedicated: this.isDedicated };
    }

    /** Called by Obsidian after setViewState() — apply activeTab/isDedicated then re-render. */
    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state?.activeTab) this.activeTab = state.activeTab;
        if (state?.isDedicated !== undefined) this.isDedicated = state.isDedicated;
        await super.setState(state, result);
        this.renderView();
    }

    renderView() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('mina-view-root');
        const contentArea = container.createEl('div', { cls: 'mina-view-content', attr: { style: 'flex-grow: 1; overflow: hidden; display: flex; flex-direction: column;' } });
        this.renderTab(contentArea);
    }

    private renderTab(container: HTMLElement) {
        // arch-04: Error boundaries on all dynamic imports — silent failures leave blank panels
        const loadErr = (e: any) => container.createEl('p', { text: `Failed to load tab: ${e.message}`, attr: { style: 'color: var(--text-error); padding: 20px;' } });
        const instantiate = (promise: Promise<any>, name: string) => {
            promise.then((mod: any) => {
                try {
                    if (this.currentTab && typeof (this.currentTab as any).onunload === 'function') (this.currentTab as any).onunload();
                } catch (e) { console.warn('[MINA View] error during previous tab unload', e); }
                const TabClass = mod[name];
                const instance = new TabClass(this);
                this.currentTab = instance;
                instance.render(container);
            }).catch(loadErr);
        };

        const tab = this.activeTab;
        if (tab === 'home' || tab === 'daily') instantiate(import('./tabs/CommandCenterTab'), 'CommandCenterTab');
        else if (tab === 'review-tasks') instantiate(import('./tabs/TasksTab'), 'TasksTab');
        else if (tab === 'mina-ai') instantiate(import('./tabs/AiTab'), 'AiTab');
        else if (tab === 'dues') instantiate(import('./tabs/DuesTab'), 'DuesTab');
        else if (tab === 'projects') instantiate(import('./tabs/ProjectsTab'), 'ProjectsTab');
        else if (tab === 'synthesis') instantiate(import('./tabs/SynthesisTab'), 'SynthesisTab');
        else if (tab === 'compass') instantiate(import('./tabs/CompassTab'), 'CompassTab');
        else if (tab === 'review') instantiate(import('./tabs/ReviewTab'), 'ReviewTab');
        else if (tab === 'monthly-review') instantiate(import('./tabs/MonthlyReviewTab'), 'MonthlyReviewTab');
        else if (tab === 'voice-note') instantiate(import('./tabs/VoiceTab'), 'VoiceTab');
        else if (tab === 'habits') instantiate(import('./tabs/HabitsTab'), 'HabitsTab');
        else if (tab === 'settings') instantiate(import('./tabs/SettingsTab'), 'SettingsTab');
        else if (tab === 'timeline') instantiate(import('./tabs/TimelineTab'), 'TimelineTab');
        else if (tab === 'journal') instantiate(import('./tabs/JournalTab'), 'JournalTab');
        else if (tab === 'daily-workspace') instantiate(import('./tabs/DailyWorkspaceTab'), 'DailyWorkspaceTab');
    }

    // Bridge methods to Services
    async callGemini(msg: string, files: TFile[] = [], search: boolean = false, history?: any[]) {
        return await this.plugin.ai.callGemini(msg, files, search, history, this.plugin.index.thoughtIndex);
    }

    async transcribeAudio(file: TFile) {
        return await this.plugin.ai.transcribeAudio(file);
    }

    matchesSearch(query: string, fields: string[]): boolean {
        if (!query) return true;
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const combined = fields.map(f => (f || '').toLowerCase()).join(' ');
        return tokens.every(token => combined.includes(token));
    }
}
