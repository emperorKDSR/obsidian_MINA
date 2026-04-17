import { ItemView, WorkspaceLeaf, Platform, moment, Notice, TFile, ViewStateResult, App, Menu, MenuItem } from 'obsidian';
import MinaPlugin from './main';
import { VIEW_TYPE_MINA, KATANA_ICON_ID, NINJA_AVATAR_SVG } from './constants';
import { ThoughtEntry, TaskEntry, ReplyEntry, DueEntry, MinaSettings } from './types';
import { BaseTab } from './tabs/BaseTab';
import { EditEntryModal } from './modals/EditEntryModal';

export class MinaView extends ItemView {
    plugin: MinaPlugin;
    content: string = '';
    isTask: boolean = false;
    dueDate: string = moment().format('YYYY-MM-DD');
    activeTab: string = 'daily';
    isDedicated: boolean = false;
    timelineSelectedDate: string = moment().format('YYYY-MM-DD');
    // Timeline State
    timelineScrollBody: HTMLElement;
    timelineCarousel: HTMLElement;
    timelineDateElements: Map<string, HTMLElement> = new Map();
    timelineDaySections: Map<string, HTMLElement> = new Map();
    timelineStartDate: moment.Moment;
    timelineEndDate: moment.Moment;


    // Voice Recording State
    mediaRecorder: MediaRecorder | null = null;
    audioChunks: Blob[] = [];
    isRecording: boolean = false;
    recordingStartTime: number = 0;
    recordingTimerInterval: any = null;
    playbackAudio: HTMLAudioElement | null = null;
    currentObjectUrl: string | null = null;

    // AI Chat State
    chatHistory: { role: 'user' | 'assistant'; text: string; sources?: string[] }[] = [];
    chatContainer: HTMLElement;
    groundedNotes: TFile[] = [];
    groundedNotesBar: HTMLElement | null = null;
    webSearchEnabled: boolean = false;
    currentChatFile: string | null = null;
    
    // Tasks Review Filters
    tasksFilterStatus: 'all' | 'pending' | 'completed' = 'pending';
    tasksFilterContext: string[] = [];
    tasksFilterDate: string = 'today+overdue';
    tasksFilterDateStart: string = '';
    tasksFilterDateEnd: string = '';
    showPreviousTasks: boolean = true;
    showCaptureInTasks: boolean = false;
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
    showCaptureInThoughts: boolean = false;
    showThoughtsFilter: boolean = false;
    searchQuery: string = '';
    showSearch: boolean = !Platform.isMobile;

    reviewTasksContainer: HTMLElement;
    reviewThoughtsContainer: HTMLElement;
    focusRowContainer: HTMLElement | null = null;
    selectedContexts: string[];

    private _baseTabDelegate: BaseTab;

    // Pagination/Offset state for tabs
    tasksOffset = 0;
    thoughtsOffset = 0;
    _parsedRoots: ThoughtEntry[] = [];
    tasksRowContainer: HTMLElement | null = null;
    thoughtsRowContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.selectedContexts = Array.isArray(this.plugin.settings.selectedContexts) ? [...this.plugin.settings.selectedContexts] : [];
        this._baseTabDelegate = new BaseTab(this);
    }

    getViewType() { return VIEW_TYPE_MINA; }
    getDisplayText() { 
        const title = this.getModeTitle();
        if (Platform.isMobile) return `MINA - ${title}`;
        return title;
    }
    getIcon() { return KATANA_ICON_ID; }

    getModeTitle(): string {
        switch (this.activeTab) {
            case 'daily': return "Daily";
            case 'review-thoughts': return "Thoughts";
            case 'review-tasks': return "Tasks";
            case 'mina-ai': return "AI Chat";
            case 'dues': return "Dues";
            case 'vo': return "Voice";
            case 'settings': return "Settings";
            case 'timeline': return "Timeline";
            case 'journal': return "Journal";
            case 'focus': return "Focus";
            case 'grundfos': return "Grundfos";
            case 'pf': return "Personal Finance";
            case 'memento-mori': return "Memento Mori";
            default: {
                const custom = this.plugin.settings.customModes.find(m => m.id === this.activeTab);
                return custom ? custom.name : "Dashboard";
            }
        }
    }

    getState() { return { activeTab: this.activeTab, isDedicated: this.isDedicated }; }
    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state) {
            if (state.activeTab) this.activeTab = state.activeTab;
            if (state.isDedicated !== undefined) this.isDedicated = state.isDedicated;
            this.renderView();
            (this.leaf as any).updateHeader();
        }
        await super.setState(state, result);
    }

    async detachTab(tabId: string) {
        const leaf = this.app.workspace.getLeaf('window');
        await leaf.setViewState({
            type: VIEW_TYPE_MINA,
            active: true,
            state: { activeTab: tabId, isDedicated: true }
        });
    }

    async onOpen() {
        this.renderView();
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
    }

    async onClose() { (this as any)._vvMainCleanup?.(); }

    renderView() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        if (Platform.isMobile) {
            const vv = window.visualViewport;
            const vvh = vv ? vv.height : window.innerHeight;
            container.style.position = 'fixed';
            container.style.top = `${vv ? vv.offsetTop : 0}px`;
            container.style.left = `${vv ? vv.offsetLeft : 0}px`;
            container.style.width = `${vv ? vv.width : window.innerWidth}px`;
            container.style.height = `${vvh}px`;
            container.style.maxHeight = `${vvh}px`;
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.overflow = 'hidden';
        } else {
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.height = '100%';
            container.style.overflow = 'hidden';
            const dragHandle = container.createEl('div', { attr: { style: 'height: 14px; width: 100%; -webkit-app-region: drag; flex-shrink: 0; display: flex; justify-content: center; align-items: center; margin-bottom: 8px; cursor: grab;' } });
            dragHandle.createEl('div', { attr: { style: 'width: 40px; height: 4px; background-color: var(--background-modifier-border); border-radius: 4px;' }});
        }

        const isWindow = !Platform.isMobile && this.containerEl.closest('.mod-window') !== null;
        if (isWindow && !this.isDedicated && this.activeTab !== 'timeline') {
            const header = container.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-primary-alt);' } });
            const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            const closeBtn = leftHeader.createEl('button', { text: '✕', attr: { style: 'padding: 4px 8px; border-radius: 4px; background: transparent; color: var(--text-muted); font-size: 1.2em; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;' } });
            closeBtn.addEventListener('click', () => { this.leaf.detach(); });
            leftHeader.createEl('h3', { text: this.getModeTitle(), attr: { style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' } });
        }

        if (!this.isDedicated && this.activeTab !== 'timeline') {
            const nav = container.createEl('div', { attr: { style: 'display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px; flex-shrink: 0;' } });
            const addTab = (id: string, label: string) => {
                const btnWrap = nav.createEl('div', { attr: { style: 'flex: 1; display: flex; align-items: stretch; gap: 0;' } });
                const hasPopout = !Platform.isMobile && id !== 'settings';
                const btn = btnWrap.createEl('button', { text: label, attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${hasPopout ? 'border-top-right-radius: 0; border-bottom-right-radius: 0;' : ''} ${this.activeTab === id ? 'background-color: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);' : ''}` } });
                btn.addEventListener('click', () => { this.activeTab = id; this.renderView(); (this.leaf as any).updateHeader(); });
                if (hasPopout) {
                    const detachBtn = btnWrap.createEl('button', { text: '⧉', attr: { title: 'Pop out tab', style: `padding: 5px 4px; font-size: 0.7em; border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 1px solid var(--background-modifier-border); ${this.activeTab === id ? 'background-color: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent);' : ''}` } });
                    detachBtn.addEventListener('click', (e) => { e.stopPropagation(); this.detachTab(id); });
                }
            };
            addTab('review-thoughts', 'Th'); addTab('review-tasks', 'Ta'); addTab('mina-ai', 'Ai'); addTab('dues', 'Du'); addTab('vo', 'Vo'); addTab('settings', 'Se');
        }

        if (this.activeTab === 'daily') import('./tabs/DailyTab').then(({ DailyTab }) => new DailyTab(this).render(container));
        else if (this.activeTab === 'review-tasks') import('./tabs/TasksTab').then(({ TasksTab }) => new TasksTab(this).render(container));
        else if (this.activeTab === 'review-thoughts') import('./tabs/ThoughtsTab').then(({ ThoughtsTab }) => new ThoughtsTab(this).render(container));
        else if (this.activeTab === 'mina-ai') import('./tabs/AiTab').then(({ AiTab }) => new AiTab(this).render(container));
        else if (this.activeTab === 'dues') import('./tabs/DuesTab').then(({ DuesTab }) => new DuesTab(this).render(container));
        else if (this.activeTab === 'settings') import('./tabs/SettingsTab').then(({ SettingsTab }) => new SettingsTab(this).render(container));
        else if (this.activeTab === 'vo') import('./tabs/VoiceTab').then(({ VoiceTab }) => new VoiceTab(this).render(container));
        else if (this.activeTab === 'timeline') import('./tabs/TimelineTab').then(({ TimelineTab }) => new TimelineTab(this).render(container));
        else if (this.activeTab === 'focus') import('./tabs/FocusTab').then(({ FocusTab }) => new FocusTab(this).render(container));
        else if (this.activeTab === 'memento-mori') import('./tabs/MementoMoriTab').then(({ MementoMoriTab }) => new MementoMoriTab(this).render(container));
        else if (this.activeTab === 'journal' || this.activeTab === 'grundfos' || this.plugin.settings.customModes.some(m => m.id === this.activeTab)) {
            import('./tabs/ContextTab').then(({ ContextTab }) => new ContextTab(this).render(container, this.activeTab));
        }

        this.renderFAB();
    }

    refreshCurrentList() { this._baseTabDelegate.refreshCurrentList(); }
    hookInternalLinks(el: HTMLElement, sourcePath: string) { this._baseTabDelegate.hookInternalLinks(el, sourcePath); }
    hookImageZoom(el: HTMLElement) { this._baseTabDelegate.hookImageZoom(el); }
    hookCheckboxes(el: HTMLElement, entry: ThoughtEntry) { this._baseTabDelegate.hookCheckboxes(el, entry); }
    renderSearchInput(container: HTMLElement, updateFn: () => void) { this._baseTabDelegate.renderSearchInput(container, updateFn); }
    renderCaptureMode(container: HTMLElement, isThoughtsOnly = false, isTasksOnly = false) { this._baseTabDelegate.renderCaptureMode(container, isThoughtsOnly, isTasksOnly); }
    renderTaskRow(entry: TaskEntry, container: HTMLElement, hideMetadata = false) { return this._baseTabDelegate.renderTaskRow(entry, container, hideMetadata); }
    renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level = 0, hideAvatar = false, hideMetadata = false, blur?: boolean) { 
        return this._baseTabDelegate.renderThoughtRow(entry, container, filePath, level, hideAvatar, hideMetadata, blur); 
    }

    async handleFiles(files: FileList) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i]; if (!file || file.size === 0) continue;
            const arrayBuffer = await file.arrayBuffer(); const ext = file.name.split('.').pop() || 'png';
            const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(file.name);
            const newFile = await this.plugin.app.vault.createBinary(attachmentPath, arrayBuffer);
            const isImg = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext.toLowerCase());
            const link = isImg ? `![[${newFile.name}]]` : `[[${newFile.name}]]`;
            const ta = this.containerEl.querySelector('textarea') as HTMLTextAreaElement;
            if (ta) {
                const start = ta.selectionStart;
                ta.value = ta.value.substring(0, start) + link + ta.value.substring(ta.selectionEnd);
                this.content = ta.value;
                new Notice(`Attached ${newFile.name}`);
            }
        }
    }

    async startRecording(recordButton: HTMLElement, timerDisplay: HTMLElement, statusDisplay: HTMLElement) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            let mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
            let ext = mimeType === 'audio/webm' ? 'webm' : 'm4a';
            this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            this.audioChunks = []; this.isRecording = true;
            this.mediaRecorder.ondataavailable = e => this.audioChunks.push(e.data);
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                const folder = this.plugin.settings.voiceMemoFolder;
                if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
                const filename = `voice-${moment().format('YYYYMMDD-HHmmss')}.${ext}`;
                await this.app.vault.createBinary(`${folder}/${filename}`, await audioBlob.arrayBuffer());
                new Notice(`Voice note saved: ${filename}`); this.isRecording = false; stream.getTracks().forEach(t => t.stop()); this.renderView();
            };
            this.mediaRecorder.start(); statusDisplay.setText('Recording...'); recordButton.style.backgroundColor = '#e74c3c'; recordButton.setText('■');
            this.recordingStartTime = Date.now();
            this.recordingTimerInterval = setInterval(() => {
                const elapsed = Date.now() - this.recordingStartTime;
                const m = Math.floor(elapsed / 60000); const s = Math.floor((elapsed % 60000) / 1000);
                timerDisplay.setText(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }, 1000);
        } catch (err) { new Notice('Microphone access denied.'); }
    }

    stopRecording() { if (this.mediaRecorder && this.isRecording) { this.mediaRecorder.stop(); this.isRecording = false; if (this.recordingTimerInterval) clearInterval(this.recordingTimerInterval); } }

    async transcribeAudio(file: TFile): Promise<string> {
        const { geminiApiKey, geminiModel, transcriptionLanguage } = this.plugin.settings;
        const audioBuffer = await this.app.vault.readBinary(file);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
        const mimeType = (file.extension === 'm4a' || file.extension === 'mp4') ? 'audio/mp4' : `audio/${file.extension}`;
        const body = { "contents": [{ "parts": [{ "text": `Transcribe audio and translate to ${transcriptionLanguage}.` }, { "inline_data": { "mime_type": mimeType, "data": base64 } }] }] };
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, { method: 'POST', body: JSON.stringify(body) });
        const data = await resp.json(); return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Transcription failed.";
    }

    
    updateReviewThoughtsList() {
        if (this.activeTab === 'review-thoughts') {
            import('./tabs/ThoughtsTab').then(({ ThoughtsTab }) => new ThoughtsTab(this).updateReviewThoughtsList());
        }
    }
    updateReviewTasksList() {
        if (this.activeTab === 'review-tasks') {
            import('./tabs/TasksTab').then(({ TasksTab }) => new TasksTab(this).updateReviewTasksList());
        }
    }
    updateContextList(modeId: string) {
        import('./tabs/ContextTab').then(({ ContextTab }) => new ContextTab(this).updateContextList(modeId));
    }
    updateFocusList() {
        import('./tabs/FocusTab').then(({ FocusTab }) => new FocusTab(this).updateFocusList());
    }
    saveFocusOrder() {
        import('./tabs/FocusTab').then(({ FocusTab }) => new FocusTab(this).saveFocusOrder());
    }
    getTranscriptionStatus(audioFile: TFile): Promise<boolean> {
        const backlinks = (this.app.metadataCache as any).getBacklinksForFile(audioFile);
        const thoughtFolder = this.plugin.settings.thoughtsFolder.trim();
        if(!backlinks || !backlinks.data) return Promise.resolve(false);
        for (const path in backlinks.data) if (path.startsWith(thoughtFolder)) return Promise.resolve(true);
        return Promise.resolve(false);
    }

    renderFAB() {
        if (this.containerEl.querySelector('.mina-fab')) return;
        const fabEl = this.containerEl.createEl('div', { cls: 'mina-fab', attr: { style: 'position: absolute; bottom: 20px; right: 20px; width: 50px; height: 50px; border-radius: 50%; background-color: var(--interactive-accent); color: var(--text-on-accent); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer; z-index: 100;' } });
        const img = fabEl.createEl('img', { attr: { style: 'width: 70%; height: 70%;', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}` } });
        fabEl.addEventListener('click', () => {
            const menu = new Menu();
            menu.addItem(item => item.setTitle('Add thought').setIcon('pencil').onClick(() => {
                 new EditEntryModal(this.plugin.app, this.plugin, '', '', null, false, async (text, ctx) => {
                     await this.plugin.createThoughtFile(text, ctx.split('#').map(c => c.trim()).filter(c => c));
                     this.renderView();
                 }).open();
            }));
            menu.showAtMouseEvent(new MouseEvent('click'));
        });
    }

    matchesSearch(query: string, fields: string[]): boolean {
        if (!query) return true;
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const combined = fields.map(f => (f || '').toLowerCase()).join(' ');
        return tokens.every(token => combined.includes(token));
    }
}
