import { ItemView, WorkspaceLeaf, MarkdownRenderer, Platform, moment, Notice, TFile, ViewStateResult, App } from 'obsidian';
import MinaPlugin from './main';
import { VIEW_TYPE_MINA, KATANA_ICON_ID, NINJA_AVATAR_SVG } from './constants';
import { ThoughtEntry, TaskEntry, ReplyEntry, DueEntry } from './types';
import { isTablet, toAsciiDigits } from './utils';
import { FileSuggestModal } from './modals/FileSuggestModal';
import { EditEntryModal } from './modals/EditEntryModal';
import { ConfirmModal } from './modals/ConfirmModal';
import { ConvertToTaskModal } from './modals/ConvertToTaskModal';
import { PaymentModal } from './modals/PaymentModal';
import { NewDueModal } from './modals/NewDueModal';
import { NotePickerModal } from './modals/NotePickerModal';
import { ChatSessionPickerModal } from './modals/ChatSessionPickerModal';

export class MinaView extends ItemView {
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
    tasksFilterDate: string = 'today+overdue';
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

    private contentCache = new Map<string, { content: string; mtime: number }>();
    private readonly PAGE_SIZE = 50;
    private _parsedRoots: ThoughtEntry[] = [];
    private tasksOffset   = 0;
    private thoughtsOffset = 0;
    private tasksRowContainer: HTMLElement | null = null;
    private thoughtsRowContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.content = '';
        this.isTask = false;
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
        if (!Platform.isMobile || isTablet()) {
            const headerEl = this.containerEl.querySelector('.view-header');
            if (headerEl) (headerEl as HTMLElement).style.display = 'none';
            setTimeout(() => {
                const tabContainer = this.containerEl.closest('.workspace-tabs');
                if (tabContainer) {
                    const tabHeader = tabContainer.querySelector('.workspace-tab-header-container');
                    if (tabHeader) (tabHeader as HTMLElement).style.display = 'none';
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
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.height = '100%';
            container.style.overflow = 'hidden';
            const dragHandle = container.createEl('div', { attr: { style: 'height: 14px; width: 100%; -webkit-app-region: drag; flex-shrink: 0; display: flex; justify-content: center; align-items: center; margin-bottom: 8px; cursor: grab;' } });
            dragHandle.createEl('div', { attr: { style: 'width: 40px; height: 4px; background-color: var(--background-modifier-border); border-radius: 4px;' }});
        }

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
                detachBtn.addEventListener('click', (e) => { e.stopPropagation(); this.detachTab(id); });
            }
        };

        addTab('daily', 'Da');
        addTab('review-thoughts', 'Th');
        addTab('review-tasks', 'Ta');
        addTab('mina-ai', 'Ai');
        addTab('dues', 'Du');
        addTab('vo', 'Vo');
        addTab('settings', 'Se');

        if (this.activeTab === 'review-tasks') this.renderReviewTasksMode(container);
        else if (this.activeTab === 'mina-ai') this.renderMinaMode(container);
        else if (this.activeTab === 'dues') this.renderDuesMode(container);
        else if (this.activeTab === 'settings') this.renderSettingsMode(container);
        else if (this.activeTab === 'vo') this.renderVoiceMode(container);
        else if (this.activeTab === 'daily') this.renderDailyMode(container);
        else this.renderReviewThoughtsMode(container);
    }

    renderDailyMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 12px 12px 200px 12px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch;' } });
        const header = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);' } });
        header.createEl('h3', { text: `Daily View — ${moment().format('YYYY-MM-DD')}`, attr: { style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' } });
        wrap.createEl('p', { text: 'This is the new Daily View tab. Implementation is coming soon.', attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 40px;' } });
    }

    renderDuesMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 12px 12px 200px 12px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch;' } });
        const duesHeaderRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;' } });
        duesHeaderRow.createEl('span', { text: 'Personal Finance', attr: { style: 'font-size: 0.9em; font-weight: 600; color: var(--text-muted);' } });
        const addBtn = duesHeaderRow.createEl('button', { text: '+ Add', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
        addBtn.addEventListener('click', () => { new NewDueModal(this.plugin.app, this.plugin.settings.pfFolder, () => this.renderView()).open(); });

        const filterRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;' } });
        filterRow.createEl('span', { text: 'Filter:', attr: { style: 'font-size: 0.78em; color: var(--text-muted);' } });
        let recurringOnly = false; let activeOnly = true;
        const pillStyle = (active: boolean) => `padding: 3px 12px; border-radius: 20px; border: 1.5px solid var(--interactive-accent); font-size: 0.78em; font-weight: 600; cursor: pointer; transition: all 0.15s; background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'};`;
        const recurringPill = filterRow.createEl('button', { text: 'Recurring', attr: { style: pillStyle(false) } });
        const activePill = filterRow.createEl('button', { text: 'Active', attr: { style: pillStyle(true) } });

        const { metadataCache, vault } = this.plugin.app;
        const pfFolder = (this.plugin.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');

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

        const tableWrap = wrap.createEl('div');
        const renderTable = () => {
            tableWrap.empty();
            const entries = buildEntries().filter(e => (!recurringOnly || e.hasRecurring) && (!activeOnly || e.isActive));
            if (entries.length === 0) { tableWrap.createEl('p', { text: 'No entries found.', attr: { style: 'color: var(--text-muted); font-size: 0.85em;' } }); return; }
            const table = tableWrap.createEl('table', { attr: { style: 'width: 100%; border-collapse: collapse; font-size: 0.88em;' } });
            const headerRow = table.createEl('thead').createEl('tr');
            ['Payable', 'Due Date', 'Last Payment', ''].forEach(h => { headerRow.createEl('th', { text: h, attr: { style: 'text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--background-modifier-border); color: var(--text-muted); font-weight: 600; white-space: nowrap;' } }); });
            const tbody = table.createEl('tbody'); const today = moment().startOf('day');
            entries.forEach(entry => {
                const tr = tbody.createEl('tr', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border); transition: background 0.15s;' } });
                tr.addEventListener('mouseenter', () => tr.style.background = 'var(--background-secondary)');
                tr.addEventListener('mouseleave', () => tr.style.background = '');
                const tdPayable = tr.createEl('td', { attr: { style: 'padding: 7px 10px;' } });
                const link = tdPayable.createEl('a', { text: entry.title, attr: { style: 'color: var(--text-accent); cursor: pointer; text-decoration: none; font-weight: 500;' } });
                link.addEventListener('click', (e) => { e.preventDefault(); this.plugin.app.workspace.openLinkText(entry.title, entry.path, Platform.isMobile ? 'tab' : 'window'); });
                const tdDue = tr.createEl('td', { attr: { style: 'padding: 7px 10px; white-space: nowrap;' } });
                if (entry.dueMoment?.isValid()) {
                    const isOverdue = entry.dueMoment.isBefore(today); const isToday = entry.dueMoment.isSame(today, 'day');
                    const color = isOverdue ? 'var(--text-error)' : isToday ? 'var(--interactive-accent)' : 'var(--text-normal)';
                    tdDue.createEl('span', { text: entry.dueDate, attr: { style: `color: ${color}; font-weight: ${isOverdue || isToday ? '600' : '400'};` } });
                    if (isOverdue) tdDue.createEl('span', { text: ' ⚠', attr: { style: 'color: var(--text-error); font-size: 0.85em;' } });
                } else tdDue.createEl('span', { text: '—', attr: { style: 'color: var(--text-muted);' } });
                tr.createEl('td', { text: entry.lastPayment || '—', attr: { style: 'padding: 7px 10px; color: var(--text-muted); white-space: nowrap;' } });
                const tdPay = tr.createEl('td', { attr: { style: 'padding: 4px 8px; text-align: right;' } });
                if (entry.hasRecurring) {
                    const payWrapInner = tdPay.createEl('div', { attr: { style: 'display: flex; gap: 6px; justify-content: flex-end; align-items: center;' } });
                    const quickDateInput = payWrapInner.createEl('input', { type: 'date', attr: { style: 'padding: 2px 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.85em;' } });
                    quickDateInput.value = moment().format('YYYY-MM-DD');
                    const payBtn = payWrapInner.createEl('button', { text: 'Pay', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
                    payBtn.addEventListener('click', () => {
                        const fileObj = vault.getAbstractFileByPath(entry.path) as TFile;
                        if (!fileObj) { new Notice('Note file not found.'); return; }
                        new PaymentModal(this.plugin.app, entry, quickDateInput.value, (p, n, notes, files) => { this.plugin.savePayment(fileObj, p, n, notes, files); this.renderView(); }).open();
                    });
                }
            });
        };
        recurringPill.addEventListener('click', () => { recurringOnly = !recurringOnly; recurringPill.setAttribute('style', pillStyle(recurringOnly)); renderTable(); });
        activePill.addEventListener('click', () => { activeOnly = !activeOnly; activePill.setAttribute('style', pillStyle(activeOnly)); renderTable(); });
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
        field('Tasks Folder', 'Folder where tasks are stored.', row => input(row, this.plugin.settings.tasksFolder, '', 'text', async v => { this.plugin.settings.tasksFolder = v; await this.plugin.saveSettings(); }));
        field('Thoughts Folder', 'Folder where thoughts are stored.', row => input(row, this.plugin.settings.thoughtsFolder, '', 'text', async v => { this.plugin.settings.thoughtsFolder = v; await this.plugin.saveSettings(); }));
        field('Personal Finance Folder', 'Folder for dues notes.', row => input(row, this.plugin.settings.pfFolder, '', 'text', async v => { this.plugin.settings.pfFolder = v; await this.plugin.saveSettings(); }));
        field('Date Format', 'moment.js format.', row => input(row, this.plugin.settings.dateFormat, '', 'text', async v => { this.plugin.settings.dateFormat = v; await this.plugin.saveSettings(); }));
        field('Time Format', 'moment.js format.', row => input(row, this.plugin.settings.timeFormat, '', 'text', async v => { this.plugin.settings.timeFormat = v; await this.plugin.saveSettings(); }));
        field('New Note Folder', 'Folder for new notes.', row => input(row, this.plugin.settings.newNoteFolder, '', 'text', async v => { this.plugin.settings.newNoteFolder = v; await this.plugin.saveSettings(); }));
        field('Voice Memo Folder', 'Folder for voice notes.', row => input(row, this.plugin.settings.voiceMemoFolder, '', 'text', async v => { this.plugin.settings.voiceMemoFolder = v; await this.plugin.saveSettings(); }));
        field('Transcription Language', 'Language for audio.', row => input(row, this.plugin.settings.transcriptionLanguage, '', 'text', async v => { this.plugin.settings.transcriptionLanguage = v; await this.plugin.saveSettings(); }));
        field('Gemini API Key', 'Google Gemini key.', row => input(row, this.plugin.settings.geminiApiKey, '', 'password', async v => { this.plugin.settings.geminiApiKey = v.trim(); await this.plugin.saveSettings(); }));
        field('Gemini Model', 'Model for AI chat.', row => {
            const models = [['gemini-2.5-flash', '2.5 Flash'], ['gemini-2.5-pro', '2.5 Pro'], ['gemini-2.0-flash', '2.0 Flash']];
            const sel = row.createEl('select', { attr: { style: 'width: 100%;' } });
            models.forEach(([val, label]) => { const opt = sel.createEl('option', { value: val, text: label }); if (this.plugin.settings.geminiModel === val) opt.selected = true; });
            sel.addEventListener('change', async () => { this.plugin.settings.geminiModel = sel.value; await this.plugin.saveSettings(); });
        });
    }

    async renderMinaMode(container: HTMLElement) {
        if (!this.plugin.settings.geminiApiKey) { container.createEl('div', { text: '⚠️ No Gemini API key set.', attr: { style: 'padding:20px;color:var(--text-muted);' } }); return; }
        const isMobilePhone = Platform.isMobile && !isTablet();
        const wrapper = container.createEl('div', { attr: { style: 'flex-grow:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;' } });
        const groundedBar = wrapper.createEl('div', { attr: { style: 'flex-shrink:0;display:flex;overflow-x:auto;gap:6px;padding:5px 10px;border-bottom:1px solid var(--background-modifier-border);background:var(--background-secondary);' } });
        const textarea = document.createElement('textarea'); textarea.placeholder = 'Ask MINA…'; textarea.rows = isMobilePhone ? 4 : 3; textarea.style.cssText = 'width:100%;resize:none;padding:8px 110px 8px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);';
        const overlayBtns = document.createElement('div'); overlayBtns.style.cssText = 'position:absolute;bottom:16px;right:16px;display:flex;gap:4px;';
        const sendBtn = overlayBtns.createEl('button', { text: '↑', attr: { style: 'padding:3px 10px;border-radius:5px;background:var(--interactive-accent);color:var(--text-on-accent);border:none;cursor:pointer;' } });
        const newChatBtn = overlayBtns.createEl('button', { text: '🗒️', attr: { style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
        const refreshGroundedBar = () => {
            groundedBar.empty();
            const webChip = groundedBar.createEl('span', { attr: { style: `margin-left:auto;padding:2px 10px;border-radius:12px;font-size:0.78em;cursor:pointer;border:1px solid ${this.webSearchEnabled ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};background:${this.webSearchEnabled ? 'var(--interactive-accent)' : 'transparent'};color:${this.webSearchEnabled ? 'var(--text-on-accent)' : 'var(--text-muted)'};` } });
            webChip.setText('🌐 Web'); webChip.addEventListener('click', () => { this.webSearchEnabled = !this.webSearchEnabled; refreshGroundedBar(); });
            if (isMobilePhone) {
                const alienBtn = groundedBar.createEl('span', { attr: { style: 'width:28px;height:28px;border-radius:50%;background:var(--interactive-accent);display:inline-flex;align-items:center;justify-content:center;' } });
                alienBtn.innerHTML = NINJA_AVATAR_SVG;
                alienBtn.addEventListener('click', () => { const area = wrapper.querySelector('.mobile-input-area') as HTMLElement; area.style.display = area.style.display === 'none' ? 'block' : 'none'; if (area.style.display === 'block') textarea.focus(); });
            }
        };
        refreshGroundedBar();
        this.chatContainer = wrapper.createEl('div', { attr: { style: 'flex-grow:1;overflow-y:auto;padding:8px 8px 160px 8px;' } });
        await this.renderChatHistory();
        const send = async () => {
            const text = textarea.value.trim(); if (!text) return; textarea.value = ''; textarea.disabled = true;
            this.chatHistory.push({ role: 'user', text }); await this.renderChatHistory();
            const thinking = this.chatContainer.createEl('div', { text: 'MINA is thinking…', attr: { style: 'font-size:0.85em;color:var(--text-muted);font-style:italic;' } });
            try { const reply = await this.callGemini(text, [...this.groundedNotes], this.webSearchEnabled); thinking.remove(); this.chatHistory.push({ role: 'assistant', text: reply }); }
            catch (e: any) { thinking.remove(); this.chatHistory.push({ role: 'assistant', text: `⚠️ Error: ${e.message}` }); }
            await this.renderChatHistory(); textarea.disabled = false; if (!isMobilePhone) textarea.focus();
        };
        sendBtn.addEventListener('click', send);
        textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        newChatBtn.addEventListener('click', () => { this.chatHistory = []; this.renderChatHistory(); });
        if (isMobilePhone) {
            const mia = wrapper.createEl('div', { cls: 'mobile-input-area', attr: { style: 'display:none;padding:8px;background:var(--background-secondary);border-top:1px solid var(--background-modifier-border);position:relative;' } });
            mia.appendChild(textarea); mia.appendChild(overlayBtns);
        } else {
            const inputRow = wrapper.createEl('div', { attr: { style: 'padding:8px;background:var(--background-secondary);border-top:1px solid var(--background-modifier-border);position:relative;' } });
            inputRow.appendChild(textarea); inputRow.appendChild(overlayBtns); setTimeout(() => textarea.focus(), 50);
        }
    }

    async renderChatHistory() {
        if (!this.chatContainer) return; this.chatContainer.empty();
        if (this.chatHistory.length === 0) { this.chatContainer.createEl('div', { text: 'Ask me anything.', attr: { style: 'text-align:center;margin-top:20px;color:var(--text-muted);' } }); return; }
        for (const msg of this.chatHistory) {
            const isUser = msg.role === 'user';
            const row = this.chatContainer.createEl('div', { attr: { style: `display:flex;justify-content:${isUser ? 'flex-end' : 'flex-start'};margin-bottom:8px;` } });
            const bubble = row.createEl('div', { attr: { style: `max-width:85%;padding:8px 12px;border-radius:12px;background:${isUser ? 'var(--interactive-accent)' : 'var(--background-secondary)'};color:${isUser ? 'var(--text-on-accent)' : 'var(--text-normal)'};` } });
            if (isUser) bubble.setText(msg.text); else await MarkdownRenderer.render(this.plugin.app, msg.text, bubble, '', this);
        }
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    async callGemini(userMessage: string, groundedFiles: TFile[] = [], webSearch: boolean = false): Promise<string> {
        const s = this.plugin.settings;
        const body: any = {
            contents: this.chatHistory.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] })),
            generationConfig: { temperature: 0.7, maxOutputTokens: s.maxOutputTokens || 65536 }
        };
        if (webSearch) body.tools = [{ googleSearch: {} }];
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiApiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    }

    renderReviewTasksMode(container: HTMLElement) {
        this.reviewTasksContainer = container.createEl('div', { attr: { style: 'flex-grow:1;overflow-y:auto;padding:10px;' } });
        this.updateReviewTasksList();
    }

    async updateReviewTasksList() {
        if (!this.reviewTasksContainer) return; this.reviewTasksContainer.empty();
        const tasks = Array.from(this.plugin.taskIndex.values()).sort((a, b) => b.lastUpdate - a.lastUpdate);
        for (const entry of tasks) {
            const row = this.reviewTasksContainer.createEl('div', { attr: { style: 'padding:8px;margin-bottom:4px;background:var(--background-secondary);border-radius:6px;' } });
            row.createEl('div', { text: entry.body || entry.title });
        }
    }

    renderReviewThoughtsMode(container: HTMLElement) {
        this.reviewThoughtsContainer = container.createEl('div', { attr: { style: 'flex-grow:1;overflow-y:auto;padding:10px;' } });
        this.updateReviewThoughtsList();
    }

    async updateReviewThoughtsList() {
        if (!this.reviewThoughtsContainer) return; this.reviewThoughtsContainer.empty();
        const thoughts = Array.from(this.plugin.thoughtIndex.values()).sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
        for (const entry of thoughts) {
            const row = this.reviewThoughtsContainer.createEl('div', { attr: { style: 'padding:10px;margin-bottom:8px;background:var(--background-secondary);border-radius:8px;' } });
            row.createEl('div', { text: entry.body });
        }
    }

    async renderVoiceMode(container: HTMLElement) {
        container.createEl('div', { text: 'Voice mode coming soon.', attr: { style: 'padding:20px;text-align:center;' } });
    }

    parseChatSession(content: string): { role: 'user' | 'assistant'; text: string }[] {
        const history: { role: 'user' | 'assistant'; text: string }[] = [];
        let currentRole: 'user' | 'assistant' | null = null; let currentLines: string[] = [];
        for (const line of content.split('\n')) {
            if (line.startsWith('**You:** ')) { if (currentRole) history.push({ role: currentRole, text: currentLines.join('\n').trim() }); currentRole = 'user'; currentLines = [line.substring(9)]; }
            else if (line.startsWith('**MINA:** ')) { if (currentRole) history.push({ role: currentRole, text: currentLines.join('\n').trim() }); currentRole = 'assistant'; currentLines = [line.substring(10)]; }
            else if (currentRole) currentLines.push(line);
        }
        if (currentRole) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
        return history;
    }
    hookInternalLinks(el: HTMLElement, sourcePath: string) {}
    hookImageZoom(el: HTMLElement) {}
    hookCheckboxes(el: HTMLElement, entry: ThoughtEntry) {}
}
