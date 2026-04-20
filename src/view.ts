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

    selectedContexts: string[] = [];
    collapsedThreads: Set<string> = new Set();
    thoughtsFilterTodo: boolean = false;
    thoughtsFilterDate: string = 'today';
    thoughtsFilterDateStart: string = '';
    thoughtsFilterDateEnd: string = '';
    thoughtsFilterContext: string[] = [];
    showPreviousThoughts: boolean = true;
    showCaptureInThoughts: boolean = true;
    thoughtsOffset: number = 0;
    focusRowContainer: HTMLElement;
    activeMasterNote: TFile | null = null;
    isZenMode: boolean = false;

    // Daily Workspace State
    dailyWorkspaceDate: string = moment().format('YYYY-MM-DD');

    searchQuery: string = '';

    // Tasks state — persists across re-renders (viewMode survives vault events)
    tasksViewMode: string = 'open';
    _taskTogglePending: number = 0;       // > 0 = suppress vault-event re-renders
    _habitTogglePending: number = 0;      // > 0 = suppress vault-event re-renders
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
            case 'settings': return "Settings";
            case 'timeline': return "Timeline";
            case 'journal': return "Journal";
            case 'focus': return "Focus";
            case 'memento-mori': return "Memento Mori";
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
        const tab = this.activeTab;
        if (tab === 'home' || tab === 'daily') import('./tabs/CommandCenterTab').then(({ CommandCenterTab }) => new CommandCenterTab(this).render(container)).catch(loadErr);
        else if (tab === 'review-thoughts') import('./tabs/ThoughtsTab').then(({ ThoughtsTab }) => new ThoughtsTab(this).render(container)).catch(loadErr);
        else if (tab === 'review-tasks') import('./tabs/TasksTab').then(({ TasksTab }) => new TasksTab(this).render(container)).catch(loadErr);
        else if (tab === 'mina-ai') import('./tabs/AiTab').then(({ AiTab }) => new AiTab(this).render(container)).catch(loadErr);
        else if (tab === 'dues') import('./tabs/DuesTab').then(({ DuesTab }) => new DuesTab(this).render(container)).catch(loadErr);
        else if (tab === 'projects') import('./tabs/ProjectsTab').then(({ ProjectsTab }) => new ProjectsTab(this).render(container)).catch(loadErr);
        else if (tab === 'synthesis') import('./tabs/SynthesisTab').then(({ SynthesisTab }) => new SynthesisTab(this).render(container)).catch(loadErr);
        else if (tab === 'compass') import('./tabs/CompassTab').then(({ CompassTab }) => new CompassTab(this).render(container)).catch(loadErr);
        else if (tab === 'review') import('./tabs/ReviewTab').then(({ ReviewTab }) => new ReviewTab(this).render(container)).catch(loadErr);
        else if (tab === 'monthly-review') import('./tabs/MonthlyReviewTab').then(({ MonthlyReviewTab }) => new MonthlyReviewTab(this).render(container)).catch(loadErr);
        else if (tab === 'voice-note') import('./tabs/VoiceTab').then(({ VoiceTab }) => new VoiceTab(this).render(container)).catch(loadErr);
        else if (tab === 'settings') import('./tabs/SettingsTab').then(({ SettingsTab }) => new SettingsTab(this).render(container)).catch(loadErr);
        else if (tab === 'timeline') import('./tabs/TimelineTab').then(({ TimelineTab }) => new TimelineTab(this).render(container)).catch(loadErr);
        else if (tab === 'focus') import('./tabs/FocusTab').then(({ FocusTab }) => new FocusTab(this).render(container)).catch(loadErr);
        else if (tab === 'memento-mori') import('./tabs/MementoMoriTab').then(({ MementoMoriTab }) => new MementoMoriTab(this).render(container)).catch(loadErr);
        else if (tab === 'journal') import('./tabs/JournalTab').then(({ JournalTab }) => new JournalTab(this).render(container)).catch(loadErr);
        else if (tab === 'daily-workspace') import('./tabs/DailyWorkspaceTab').then(({ DailyWorkspaceTab }) => new DailyWorkspaceTab(this).render(container)).catch(loadErr);
        else if (tab === 'habits') import('./tabs/HabitsTab').then(({ HabitsTab }) => new HabitsTab(this).render(container)).catch(loadErr);
        else if (tab === 'grundfos' || this.plugin.settings.customModes.some(m => m.id === tab)) {
            import('./tabs/ContextTab').then(({ ContextTab }) => new ContextTab(this).render(container, tab)).catch(loadErr);
        }
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
