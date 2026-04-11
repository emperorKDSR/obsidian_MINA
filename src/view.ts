import { ItemView, WorkspaceLeaf, MarkdownRenderer, Platform, moment, Notice, TFile, ViewStateResult, App, Menu, MenuItem } from 'obsidian';
import MinaPlugin from './main';
import { VIEW_TYPE_MINA, KATANA_ICON_ID, NINJA_AVATAR_SVG } from './constants';
import { ThoughtEntry, TaskEntry, ReplyEntry, DueEntry, MinaSettings } from './types';
import { isTablet, toAsciiDigits, parseNaturalDate } from './utils';
import { FileSuggestModal } from './modals/FileSuggestModal';
import { ContextSuggestModal } from './modals/ContextSuggestModal';
import { EditEntryModal } from './modals/EditEntryModal';
import { ConfirmModal } from './modals/ConfirmModal';
import { ConvertToTaskModal } from './modals/ConvertToTaskModal';
import { PaymentModal } from './modals/PaymentModal';
import { NewDueModal } from './modals/NewDueModal';
import { NotePickerModal } from './modals/NotePickerModal';
import { ChatSessionPickerModal } from './modals/ChatSessionPickerModal';
import { VoiceMemoModal } from './modals/VoiceMemoModal';

export class MinaView extends ItemView {
    plugin: MinaPlugin;
    content: string;
    isTask: boolean;
    dueDate: string; // YYYY-MM-DD
    activeTab: 'daily' | 'review-tasks' | 'review-thoughts' | 'mina-ai' | 'settings' | 'dues' | 'vo' | 'timeline' | 'journal' = 'daily';
    isDedicated: boolean = false;
    timelineSelectedDate: string = moment().format('YYYY-MM-DD');

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
        // @ts-ignore
        this.dueDate = moment().format('YYYY-MM-DD');
        this.showPreviousThoughts = true;
        this.showCaptureInThoughts = false;
        this.selectedContexts = Array.isArray(this.plugin.settings.selectedContexts) ? [...this.plugin.settings.selectedContexts] : [];
    }

    getViewType() { return VIEW_TYPE_MINA; }
    getDisplayText() { 
        if (this.activeTab === 'timeline') return "Timeline";
        if (this.activeTab === 'mina-ai' && this.isDedicated) return "AI Chat";
        return this.isDedicated ? "Daily Focus" : "Full Mode"; 
    }
    getIcon() { return KATANA_ICON_ID; }

    getState() {
        return { activeTab: this.activeTab, isDedicated: this.isDedicated };
    }

    async setState(state: any, result: ViewStateResult): Promise<void> {
        if (state) {
            if (state.activeTab) this.activeTab = state.activeTab;
            if (state.isDedicated !== undefined) this.isDedicated = state.isDedicated;
            this.renderView();
        }
        await super.setState(state, result);
    }

    async detachTab(tabId: any) {
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
        if (!Platform.isMobile) {
            const hideNativeHeaders = () => {
                const headerEl = this.containerEl.querySelector('.view-header');
                if (headerEl) (headerEl as HTMLElement).style.display = 'none';
                
                const tabContainer = this.containerEl.closest('.workspace-tabs');
                if (tabContainer) {
                    const tabHeader = tabContainer.querySelector('.workspace-tab-header-container');
                    if (tabHeader) (tabHeader as HTMLElement).style.display = 'none';
                }
            };
            
            hideNativeHeaders();
            setTimeout(hideNativeHeaders, 100);
            setTimeout(hideNativeHeaders, 500);
            setTimeout(hideNativeHeaders, 1000);
            setTimeout(hideNativeHeaders, 2000);
        } else if (isTablet() || this.isDedicated) {
            const hideNativeHeaders = () => {
                const headerEl = this.containerEl.querySelector('.view-header');
                if (headerEl) (headerEl as HTMLElement).style.display = 'none';
                
                const tabContainer = this.containerEl.closest('.workspace-tabs');
                if (tabContainer) {
                    const tabHeader = tabContainer.querySelector('.workspace-tab-header-container');
                    if (tabHeader) (tabHeader as HTMLElement).style.display = 'none';
                }
            };
            
            hideNativeHeaders();
            setTimeout(hideNativeHeaders, 100);
            setTimeout(hideNativeHeaders, 500);
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

        const isWindow = !Platform.isMobile && this.containerEl.closest('.mod-window') !== null;

        if (isWindow && !this.isDedicated && this.activeTab !== 'timeline') {
            const header = container.createEl('div', { 
                attr: { 
                    style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-primary-alt);' 
                } 
            });
            const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            const closeBtn = leftHeader.createEl('button', {
                text: '✕',
                attr: { style: 'padding: 4px 8px; border-radius: 4px; background: transparent; color: var(--text-muted); font-size: 1.2em; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;' }
            });
            closeBtn.addEventListener('click', () => {
                this.leaf.detach();
            });
            leftHeader.createEl('h3', { 
                text: 'Full Mode',
                attr: { style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' } 
            });
        }

        if (!this.isDedicated && this.activeTab !== 'timeline') {
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

            addTab('review-thoughts', 'Th');
            addTab('review-tasks', 'Ta');
            addTab('mina-ai', 'Ai');
            addTab('dues', 'Du');
            addTab('vo', 'Vo');
            addTab('settings', 'Se');
        }

        if (this.activeTab === 'review-tasks') this.renderReviewTasksMode(container);
        else if (this.activeTab === 'mina-ai') this.renderMinaMode(container);
        else if (this.activeTab === 'journal') this.renderJournalMode(container);
        else if (this.activeTab === 'dues') this.renderDuesMode(container);
        else if (this.activeTab === 'settings') this.renderSettingsMode(container);
        else if (this.activeTab === 'vo') this.renderVoiceMode(container);
        else if (this.activeTab === 'daily') this.renderDailyMode(container);
        else if (this.activeTab === 'timeline') this.renderTimelineMode(container);
        else this.renderReviewThoughtsMode(container);

        this.renderFAB();
    }

    renderFAB() {
        if (this.fabEl && this.fabEl.parentElement === this.containerEl) return;
        if (this.fabEl) this.fabEl.remove();

        this.fabEl = this.containerEl.createEl('div', {
            cls: 'mina-fab',
            attr: { style: `position: absolute; bottom: ${this.fabPos.bottom}px; right: ${this.fabPos.right}px; width: 50px; height: 50px; border-radius: 50%; background-color: var(--interactive-accent); color: var(--text-on-accent); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: grab; z-index: 100; user-select: none; touch-action: none; overflow: hidden;` }
        });
        const img = this.fabEl.createEl('img', { 
            attr: { style: 'width: 70%; height: 70%; display: block;' } 
        });
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}`;

        let isDragging = false;
        let moved = false;
        let startX: number, startY: number;
        let startRight: number, startBottom: number;

        this.fabEl.addEventListener('pointerdown', (e) => {
            isDragging = true;
            moved = false;
            this.fabEl!.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            startRight = this.fabPos.right;
            startBottom = this.fabPos.bottom;
            this.fabEl!.setPointerCapture(e.pointerId);
            e.stopPropagation();
        });

        this.fabEl.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = startX - e.clientX;
            const dy = startY - e.clientY;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                moved = true;
            }

            this.fabPos.right = startRight + dx;
            this.fabPos.bottom = startBottom + dy;
            
            this.fabEl!.style.right = `${this.fabPos.right}px`;
            this.fabEl!.style.bottom = `${this.fabPos.bottom}px`;
        });

        this.fabEl.addEventListener('pointerup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.fabEl!.style.cursor = 'grab';
            this.fabEl!.releasePointerCapture(e.pointerId);
        });

        this.fabEl.addEventListener('click', (e) => {
            if (moved) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            const menu = new Menu();
            
            menu.addItem((item: MenuItem) =>
                item
                    .setTitle('Add thought')
                    .setIcon('pencil')
                    .onClick(() => {
                        new EditEntryModal(
                            this.plugin.app,
                            this.plugin,
                            '', 
                            '', 
                            null, 
                            false, 
                            async (newText, newContextStr) => {
                                const ctxArr = newContextStr ? newContextStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                                await this.plugin.createThoughtFile(newText.replace(/<br>/g, '\n'), ctxArr);
                                this.renderView();
                            },
                            'New Thought'
                        ).open();
                    })
            );

            menu.addItem((item: MenuItem) =>
                item
                    .setTitle('Add task')
                    .setIcon('checkmark')
                    .onClick(() => {
                        new EditEntryModal(
                            this.plugin.app,
                            this.plugin,
                            '', 
                            '', 
                            moment().format('YYYY-MM-DD'), 
                            true, 
                            async (newText, newContextStr, newDue) => {
                                const ctxArr = newContextStr ? newContextStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                                await this.plugin.createTaskFile(newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                                this.renderView();
                            },
                            'New Task'
                        ).open();
                    })
            );

            menu.addItem((item: MenuItem) =>
                item
                    .setTitle('Add voice memo')
                    .setIcon('microphone')
                    .onClick(() => {
                        new VoiceMemoModal(this.plugin.app, this.plugin, async (file: TFile) => {
                            if (this.activeTab === 'journal') {
                                await this.plugin.createThoughtFile(`Voice memo: [[${file.path}]]`, ['journal']);
                            }
                            this.renderView();
                        }).open();
                    })
            );

            menu.addItem((item: MenuItem) =>
                item
                    .setTitle('AI Mode')
                    .setIcon('bot')
                    .onClick(() => {
                        this.plugin.activateView('mina-ai', true);
                    })
            );

            menu.showAtMouseEvent(e);
        });
    }

    renderDailyMode(container: HTMLElement) {
        const wrap = container.createEl('div', { 
            attr: { 
                style: 'padding: 12px 12px 200px 12px; display: flex; flex-direction: column; gap: 5px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch;' 
            } 
        });

        const header = wrap.createEl('div', { 
            attr: { 
                style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);' 
            } 
        });

        const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });

        if (this.isDedicated) {
            const closeBtn = leftHeader.createEl('button', {
                text: '✕',
                attr: { style: 'padding: 4px 8px; border-radius: 4px; background: transparent; color: var(--text-muted); font-size: 1.2em; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;' }
            });
            closeBtn.addEventListener('click', () => {
                this.leaf.detach();
            });
        }

        const isMobileDedicated = Platform.isMobile && this.isDedicated;

        leftHeader.createEl('h3', { 
            text: isMobileDedicated ? moment().format('ddd, MMM D') : `Daily Focus — ${moment().format('ddd, MMM D')}`,
            attr: { 
                style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' 
            } 
        });

        const btnGroup = header.createEl('div', { attr: { style: 'display: flex; gap: 8px; align-items: center;' } });

        let toggleTarget = btnGroup;

        if (isMobileDedicated) {
            // Row 2: Section Toggles (Action buttons now share Row 1)
            toggleTarget = wrap.createEl('div', { 
                attr: { style: 'display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);' } 
            });
        }

        // Individual Section Toggles
        const renderToggle = (label: string, settingKey: keyof MinaSettings) => {
            const toggleContainer = toggleTarget.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 4px; font-size: 0.75em; color: var(--text-muted); cursor: pointer;' } });
            toggleContainer.createSpan({ text: label });
            const toggleLabel = toggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 24px; height: 12px; cursor: pointer;' } });
            const cb = toggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            cb.checked = !!this.plugin.settings[settingKey];
            const slider = toggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${cb.checked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 12px;` } });
            const knob = toggleLabel.createEl('span', { attr: { style: `position: absolute; height: 8px; width: 8px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${cb.checked ? 'translateX(12px)' : 'translateX(0)'};` } });
            
            cb.addEventListener('change', async () => {
                (this.plugin.settings[settingKey] as any) = cb.checked;
                slider.style.backgroundColor = cb.checked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                knob.style.transform = cb.checked ? 'translateX(12px)' : 'translateX(0)';
                await this.plugin.saveSettings();
                this.renderView();
            });
        };

        renderToggle('Cl', 'showDailyChecklist');
        renderToggle('Ta', 'showDailyTasks');
        renderToggle('Du', 'showDailyDues');
        renderToggle('Pi', 'showDailyPinned');
        renderToggle('Th', 'showDailyThoughts');

        if (this.plugin.settings.showDailyChecklist) {
            const section1 = this.renderDailySection(wrap, "TODAY'S CHECKLIST", 'checklist');
            this.updateDailyThoughtTodos(section1);
        }

        if (this.plugin.settings.showDailyTasks) {
            const section2 = this.renderDailySection(wrap, 'PENDING TASKS', 'tasks');
            this.updateDailyTasks(section2);
        }

        if (this.plugin.settings.showDailyDues) {
            const sectionDues = this.renderDailySection(wrap, 'PENDING DUES', 'dues');
            this.updateDailyDues(sectionDues);
        }

        if (this.plugin.settings.showDailyPinned) {
            const sectionPinned = this.renderDailySection(wrap, "PINNED THOUGHTS", 'pinned');
            this.updatePinnedThoughts(sectionPinned);
        }

        if (this.plugin.settings.showDailyThoughts) {
            const section3 = this.renderDailySection(wrap, "TODAY'S THOUGHTS", 'thoughts');
            this.updateDailyThoughts(section3);
        }
    }

    async updateDailyDues(container: HTMLElement) {
        container.empty();
        const { metadataCache, vault } = this.plugin.app;
        const pfFolder = (this.plugin.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
        const today = moment().startOf('day');
        
        const dues: DueEntry[] = [];
        for (const file of vault.getMarkdownFiles()) {
            if (!file.path.startsWith(pfFolder + '/') && file.path !== pfFolder) continue;
            const fm = metadataCache.getFileCache(file)?.frontmatter;
            const activeStatus = fm?.['active_status'];
            if (activeStatus === false || activeStatus === 'false' || activeStatus === 'False') continue;
            
            const dueDate = (fm?.['next_duedate'] ?? '').toString().trim();
            const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;
            
            if (dueMoment && dueMoment.isValid() && dueMoment.isSameOrBefore(today, 'day')) {
                dues.push({ 
                    title: file.basename, 
                    path: file.path, 
                    dueDate, 
                    lastPayment: (fm?.['last_payment'] ?? '').toString().trim(),
                    dueMoment,
                    hasRecurring: true,
                    isActive: true
                });
            }
        }

        if (dues.length === 0) {
            container.createEl('p', { text: 'No pending dues.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
            return;
        }

        dues.sort((a, b) => a.dueMoment.valueOf() - b.dueMoment.valueOf());
        const duesList = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });

        for (const entry of dues) {
            const row = duesList.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--background-modifier-border-faint); width: 100%; min-width: 0;' } });
            row.createSpan({ text: '💳', attr: { style: 'font-size: 0.9em; flex-shrink: 0;' } });
            const textEl = row.createEl('div', { 
                text: entry.title,
                attr: { style: 'font-size: 0.85em; line-height: 1.2; flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-accent); cursor: pointer;' } 
            });
            textEl.addEventListener('click', () => this.app.workspace.openLinkText(entry.title, entry.path, 'window'));

            const isOverdue = entry.dueMoment.isBefore(today, 'day');
            row.createSpan({ 
                text: entry.dueDate, 
                attr: { style: `font-size: 0.75em; color: ${isOverdue ? 'var(--text-error)' : 'var(--interactive-accent)'}; font-weight: 600; flex-shrink: 0;` } 
            });

            const payBtn = row.createEl('button', { 
                text: 'Pay', 
                attr: { style: 'padding: 2px 8px; border-radius: 4px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.7em; font-weight: 600; cursor: pointer; flex-shrink: 0;' } 
            });
            payBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileObj = vault.getAbstractFileByPath(entry.path) as TFile;
                if (fileObj) new PaymentModal(this.plugin.app, fileObj, entry.dueDate, () => this.renderView()).open();
            });
        }
    }

    async updateDailyThoughts(container: HTMLElement) {
        container.empty();
        const today = moment().format('YYYY-MM-DD');
        const thoughts = Array.from(this.plugin.thoughtIndex.values())
            .filter(e => e.allDates && e.allDates.includes(today))
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        if (thoughts.length === 0) {
            container.createEl('p', { text: 'No thoughts captured today.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
            return;
        }

        const thoughtsRowContainer = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; width: 100%;' } });
        for (const entry of thoughts) {
            await this.renderThoughtRow(entry, thoughtsRowContainer, entry.filePath, 0, true, true);
        }
    }

    async updatePinnedThoughts(container: HTMLElement) {
        container.empty();
        const thoughts = Array.from(this.plugin.thoughtIndex.values())
            .filter(e => e.pinned)
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        if (thoughts.length === 0) {
            container.createEl('p', { text: 'No pinned thoughts.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
            return;
        }

        const thoughtsRowContainer = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; width: 100%;' } });
        for (const entry of thoughts) {
            await this.renderThoughtRow(entry, thoughtsRowContainer, entry.filePath, 0, true, true);
        }
    }

    timelineDateElements: Map<string, HTMLElement> = new Map();
    timelineDaySections: Map<string, HTMLElement> = new Map();
    timelineCarousel: HTMLElement;
    timelineScrollBody: HTMLElement;
    timelineStartDate: moment.Moment;
    timelineEndDate: moment.Moment;

    fabEl: HTMLElement | null = null;
    fabPos = { right: 30, bottom: 100 };

    async renderTimelineMode(container: HTMLElement) {
        const wrap = container.createEl('div', { 
            attr: { 
                style: 'display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--background-primary);' 
            } 
        });

        // Header with Date Carousel
        const carouselContainer = wrap.createEl('div', {
            attr: {
                style: 'flex-shrink: 0; position: relative; border-bottom: 1px solid var(--background-modifier-border); padding: 10px 0; background: var(--background-primary-alt); display: flex; align-items: center;'
            }
        });

        this.timelineCarousel = carouselContainer.createEl('div', {
            attr: {
                class: 'mina-timeline-carousel',
                style: 'flex-grow: 1; display: flex; gap: 5px; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding: 0 calc(50% - 35px); scrollbar-width: none;'
            }
        });
        (this.timelineCarousel.style as any).msOverflowStyle = 'none';
        (this.timelineCarousel.style as any).scrollbarWidth = 'none';

        this.timelineScrollBody = wrap.createEl('div', {
            attr: {
                class: 'mina-timeline-body',
                style: 'flex-grow: 1; overflow-y: auto; padding: 15px; -webkit-overflow-scrolling: touch;'
            }
        });

        this.timelineDateElements.clear();
        this.timelineDaySections.clear();

        const today = moment();
        this.timelineStartDate = today.clone().subtract(10, 'days');
        this.timelineEndDate = today.clone().add(10, 'days');

        for (let m = this.timelineStartDate.clone(); m.isSameOrBefore(this.timelineEndDate); m.add(1, 'days')) {
            await this.addTimelineDay(m.format('YYYY-MM-DD'), 'append');
        }

        // Sync Vertical Scroll with Carousel
        let isScrollingBody = false;
        this.timelineScrollBody.addEventListener('scroll', () => {
            if (isScrollingBody) return;
            isScrollingBody = true;
            requestAnimationFrame(async () => {
                const rect = this.timelineScrollBody.getBoundingClientRect();
                const centerY = rect.top + 50; 
                const elements = document.elementsFromPoint(rect.left + rect.width / 2, centerY);
                const section = elements.find(el => (el as HTMLElement).hasAttribute('data-date')) as HTMLElement;
                if (section) {
                    const dateStr = section.getAttribute('data-date')!;
                    if (this.timelineSelectedDate !== dateStr) {
                        this.timelineSelectedDate = dateStr;
                        this.updateCarouselSelection(dateStr, true);
                    }
                }

                // Check for infinite scroll
                if (this.timelineScrollBody.scrollTop < 200) {
                    await this.loadMoreTimelineDays('prepend');
                } else if (this.timelineScrollBody.scrollHeight - this.timelineScrollBody.scrollTop - this.timelineScrollBody.clientHeight < 200) {
                    await this.loadMoreTimelineDays('append');
                }

                isScrollingBody = false;
            });
        });

        // Initial scroll to today
        const todayStr = today.format('YYYY-MM-DD');
        setTimeout(() => {
            this.timelineDaySections.get(todayStr)?.scrollIntoView({ block: 'start' });
            this.updateCarouselSelection(todayStr);
        }, 100);
    }

    async loadMoreTimelineDays(direction: 'append' | 'prepend') {
        if (direction === 'prepend') {
            const currentTopDay = this.timelineStartDate.clone();
            for (let i = 1; i <= 10; i++) {
                const dateStr = currentTopDay.subtract(1, 'days').format('YYYY-MM-DD');
                await this.addTimelineDay(dateStr, 'prepend');
                this.timelineStartDate = currentTopDay.clone();
            }
        } else {
            const currentBottomDay = this.timelineEndDate.clone();
            for (let i = 1; i <= 10; i++) {
                const dateStr = currentBottomDay.add(1, 'days').format('YYYY-MM-DD');
                await this.addTimelineDay(dateStr, 'append');
                this.timelineEndDate = currentBottomDay.clone();
            }
        }
    }

    async addTimelineDay(dateStr: string, position: 'append' | 'prepend') {
        const dateMoment = moment(dateStr);
        
        // Date Carousel Item
        const dateItem = document.createElement('div');
        dateItem.style.cssText = 'flex-shrink: 0; min-width: 70px; text-align: center; cursor: pointer; scroll-snap-align: center; padding: 10px 0; font-size: 0.85em; transition: all 0.2s;';
        dateItem.textContent = dateMoment.format('MMM D');
        
        if (position === 'prepend') {
            this.timelineCarousel.prepend(dateItem);
        } else {
            this.timelineCarousel.append(dateItem);
        }
        this.timelineDateElements.set(dateStr, dateItem);

        dateItem.addEventListener('click', () => {
            this.timelineSelectedDate = dateStr;
            this.timelineDaySections.get(dateStr)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            this.updateCarouselSelection(dateStr);
        });

        // Day Section in Scroll Body
        const section = document.createElement('div');
        section.setAttribute('data-date', dateStr);
        section.style.cssText = 'margin-bottom: 40px; min-height: 100px;';
        
        const dividerContainer = section.createEl('div', {
            attr: { style: 'display: flex; align-items: center; justify-content: center; margin-bottom: 20px; position: relative; height: 20px;' }
        });
        
        dividerContainer.createEl('div', {
            attr: { style: 'position: absolute; width: 100%; height: 1px; background-color: var(--background-modifier-border); top: 50%; left: 0;' }
        });

        dividerContainer.createEl('span', {
            text: dateMoment.format('dddd, MMMM D, YYYY'),
            attr: { style: 'position: relative; background-color: var(--background-primary); padding: 0 10px; font-size: 0.75em; color: var(--text-muted); font-weight: 400;' }
        });

        await this.renderTimelineDay(dateStr, section);

        if (position === 'prepend') {
            const oldScrollHeight = this.timelineScrollBody.scrollHeight;
            const oldScrollTop = this.timelineScrollBody.scrollTop;
            this.timelineScrollBody.prepend(section);
            // Adjust scroll to prevent jumping when prepending
            this.timelineScrollBody.scrollTop = oldScrollTop + (this.timelineScrollBody.scrollHeight - oldScrollHeight);
        } else {
            this.timelineScrollBody.append(section);
        }
        this.timelineDaySections.set(dateStr, section);
    }

    updateCarouselSelection(selectedDate: string, smoothScroll: boolean = false) {
        this.timelineDateElements.forEach((el, date) => {
            if (date === selectedDate) {
                el.style.color = 'var(--interactive-accent)';
                el.style.opacity = '1';
                el.style.fontWeight = '700';
                if (smoothScroll) {
                    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                } else {
                    el.scrollIntoView({ inline: 'center', block: 'nearest' });
                }
            } else {
                el.style.color = 'var(--text-muted)';
                el.style.opacity = '0.6';
                el.style.fontWeight = '400';
            }
        });
    }

    async renderTimelineDay(dateStr: string, container: HTMLElement) {
        const tasks = Array.from(this.plugin.taskIndex.values()).filter(t => t.due === dateStr);
        const thoughts = Array.from(this.plugin.thoughtIndex.values()).filter(t => t.allDates.includes(dateStr) && !t.context.includes('journal'));

        if (tasks.length === 0 && thoughts.length === 0) {
            container.createEl('p', { text: 'No tasks or thoughts for this day.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; font-style: italic; text-align: center;' } });
            return;
        }

        for (const task of tasks) {
            await this.renderTaskRow(task, container, true);
        }

        for (const thought of thoughts) {
            await this.renderThoughtRow(thought, container, thought.filePath, 0, true, true);
        }
    }

    renderDailySection(container: HTMLElement, title: string, key: string): HTMLElement {
        if (!this.plugin.settings.dailySectionStates) this.plugin.settings.dailySectionStates = {};
        const isOpen = this.plugin.settings.dailySectionStates[key] !== false;
        
        const details = container.createEl('details', { 
            attr: { 
                style: 'margin-bottom: 10px; background: var(--background-secondary); border-radius: 8px; overflow: hidden; border: 1px solid var(--background-modifier-border); flex-shrink: 0; width: 100%;' 
            } 
        });
        details.open = isOpen;

        const summary = details.createEl('summary', { 
            attr: { 
                style: 'padding: 10px 12px; cursor: pointer; font-weight: 700; color: var(--text-accent); font-size: 0.85em; list-style: none; display: flex; align-items: center; gap: 8px; letter-spacing: 0.05em; user-select: none;' 
            } 
        });
        
        const chevron = summary.createSpan({ 
            text: isOpen ? '▼' : '▶', 
            attr: { style: 'font-size: 0.7em; transition: transform 0.2s; width: 1.2em; text-align: center; opacity: 0.6; flex-shrink: 0;' } 
        });
        
        summary.createSpan({ text: title, attr: { style: 'flex-grow: 1;' } });

        details.addEventListener('toggle', async () => {
            const newState = details.open;
            chevron.textContent = newState ? '▼' : '▶';
            
            // Only update and save if the state actually changed from the stored preference
            if (this.plugin.settings.dailySectionStates[key] !== newState) {
                this.plugin.settings.dailySectionStates[key] = newState;
                await this.plugin.saveSettings();
            }
        });

        const content = details.createEl('div', { 
            attr: { style: 'padding: 0 12px 12px 12px; display: block; width: 100%;' } 
        });
        return content;
    }

    async updateDailyThoughtTodos(container: HTMLElement) {
        container.empty();
        const thoughts = Array.from(this.plugin.thoughtIndex.values());
        let foundAny = false;

        const todoList = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });

        for (const entry of thoughts) {
            const renderTodo = (text: string, sourceFilePath: string, isChild: boolean = false, anchor?: string) => {
                foundAny = true;
                const row = todoList.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding: 2px 0; width: 100%; min-width: 0;' } });
                
                const circle = row.createEl('span');
                const applyStyle = (checked: boolean) => {
                    circle.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border-radius:50%; border:2px solid var(--interactive-accent); cursor:pointer; flex-shrink:0; transition:background 0.15s; background:${checked ? 'var(--interactive-accent)' : 'transparent'}; font-size:9px; color:var(--background-primary); user-select:none;`;
                    circle.textContent = checked ? '✓' : '';
                };
                applyStyle(false);

                circle.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    applyStyle(true);
                    row.style.opacity = '0.5';
                    row.style.textDecoration = 'line-through';
                    
                    if (isChild && anchor) {
                        const file = this.app.vault.getAbstractFileByPath(sourceFilePath) as TFile;
                        if (file) {
                            const content = await this.app.vault.read(file);
                            const lines = content.split('\n');
                            const idx = lines.findIndex(l => l.includes(`^${anchor}`));
                            if (idx !== -1) {
                                for (let i = idx + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
                                    if (lines[i].includes(`- [ ] ${text}`)) {
                                        lines[i] = lines[i].replace('- [ ] ', '- [x] ');
                                        break;
                                    }
                                }
                                await this.app.vault.modify(file, lines.join('\n'));
                                await this.plugin.indexThoughtFile(file);
                            }
                        }
                    } else {
                        const newBody = entry.body.replace(`- [ ] ${text}`, `- [x] ${text}`);
                        await this.plugin.editThoughtBody(sourceFilePath, newBody, entry.context);
                    }
                    
                    setTimeout(() => this.renderView(), 500);
                });

                const textEl = row.createEl('div', { attr: { style: 'font-size: 0.85em; line-height: 1.2; word-break: break-word; flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' } });
                MarkdownRenderer.render(this.plugin.app, text, textEl, sourceFilePath, this);
                
                const p = textEl.querySelector('p');
                if (p) { p.style.margin = '0'; p.style.display = 'inline'; }

                const link = row.createEl('span', { 
                    text: '🔗', 
                    attr: { style: 'font-size: 0.75em; cursor: pointer; opacity: 0.3; flex-shrink: 0;', title: 'Go to source' } 
                });
                link.addEventListener('click', (e) => { e.stopPropagation(); this.app.workspace.openLinkText(sourceFilePath, '', 'window'); });
            };

            const bodyMatches = entry.body.matchAll(/- \[ \] (.*)/g);
            for (const m of bodyMatches) renderTodo(m[1], entry.filePath);

            for (const child of entry.children) {
                const childMatches = child.text.matchAll(/- \[ \] (.*)/g);
                for (const m of childMatches) renderTodo(m[1], entry.filePath, true, child.anchor);
            }
        }

        if (!foundAny) {
            container.createEl('p', { text: 'No open to-dos.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
        }
    }

    async updateDailyTasks(container: HTMLElement) {
        container.empty();
        const today = moment().format('YYYY-MM-DD');
        const tasks = Array.from(this.plugin.taskIndex.values())
            .filter(t => t.status === 'open' && (t.due && t.due <= today))
            .sort((a, b) => (a.due || '').localeCompare(b.due || ''));

        if (tasks.length === 0) {
            container.createEl('p', { text: 'No pending tasks.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
            return;
        }

        const taskList = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });

        for (const task of tasks) {
            const row = taskList.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--background-modifier-border-faint); width: 100%; min-width: 0;' } });
            
            const cb = row.createEl('input', { type: 'checkbox', attr: { style: 'width: 14px; height: 14px; flex-shrink: 0; margin: 0;' } });
            cb.addEventListener('change', async () => {
                if (cb.checked) {
                    row.style.opacity = '0.5';
                    row.style.textDecoration = 'line-through';
                    await this.plugin.toggleTaskStatus(task.filePath, true);
                    setTimeout(() => this.renderView(), 500);
                }
            });

            const textEl = row.createEl('div', { attr: { style: 'font-size: 0.85em; line-height: 1.2; word-break: break-word; flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' } });
            MarkdownRenderer.render(this.plugin.app, task.body || task.title, textEl, task.filePath, this);
            
            const p = textEl.querySelector('p');
            if (p) { p.style.margin = '0'; p.style.display = 'inline'; }

            const isOverdue = task.due && task.due < today;
            if (isOverdue) {
                row.createSpan({ 
                    text: '⚠', 
                    attr: { style: 'font-size: 0.75em; color: var(--text-error); flex-shrink: 0; margin-left: auto;', title: `Overdue: ${task.due}` } 
                });
            }
        }
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
                        new PaymentModal(this.plugin.app, fileObj, entry.dueDate, () => { this.renderView(); }, quickDateInput.value).open();
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
        field('Tasks Folder', 'Folder where MINA V2 task files are stored.', row => input(row, this.plugin.settings.tasksFolder, '000 Bin/MINA V2 Tasks', 'text', async v => { this.plugin.settings.tasksFolder = v; await this.plugin.saveSettings(); }));
        field('Thoughts Folder', 'Folder where MINA V2 thought files are stored.', row => input(row, this.plugin.settings.thoughtsFolder, '000 Bin/MINA V2', 'text', async v => { this.plugin.settings.thoughtsFolder = v; await this.plugin.saveSettings(); }));
        field('Personal Finance Folder', 'Folder scanned by the Dues tab for recurring payment notes.', row => input(row, this.plugin.settings.pfFolder, '000 Bin/MINA V2 PF', 'text', async v => { this.plugin.settings.pfFolder = v; await this.plugin.saveSettings(); }));
        field('Date Format', 'moment.js format, e.g. YYYY-MM-DD', row => input(row, this.plugin.settings.dateFormat, 'YYYY-MM-DD', 'text', async v => { this.plugin.settings.dateFormat = v; await this.plugin.saveSettings(); }));
        field('Time Format', 'moment.js format, e.g. HH:mm', row => input(row, this.plugin.settings.timeFormat, 'HH:mm', 'text', async v => { this.plugin.settings.timeFormat = v; await this.plugin.saveSettings(); }));
        field('New Note Folder', 'Folder where notes created via [[ link are saved.', row => input(row, this.plugin.settings.newNoteFolder, '000 Bin', 'text', async v => { this.plugin.settings.newNoteFolder = v; await this.plugin.saveSettings(); }));
        field('Voice Memo Folder', 'Folder where recorded voice notes will be stored.', row => input(row, this.plugin.settings.voiceMemoFolder, '000 Bin/MINA V2 Voice', 'text', async v => { this.plugin.settings.voiceMemoFolder = v; await this.plugin.saveSettings(); }));
        field('Transcription Language', 'Language for audio transcription.', row => input(row, this.plugin.settings.transcriptionLanguage, 'English', 'text', async v => { this.plugin.settings.transcriptionLanguage = v; await this.plugin.saveSettings(); }));
        field('Gemini API Key', 'Google Gemini API key.', row => input(row, this.plugin.settings.geminiApiKey, 'AIza...', 'password', async v => { this.plugin.settings.geminiApiKey = v.trim(); await this.plugin.saveSettings(); }));

        field('Gemini Model', 'Model to use for MINA AI chat.', row => {
            const models: [string, string][] = [
                ['gemini-2.5-pro',           '2.5 Pro — highest reasoning'],
                ['gemini-2.5-flash',         '2.5 Flash — fast (default)'],
                ['gemini-2.0-flash',         '2.0 Flash — stable'],
            ];
            const sel = row.createEl('select', { attr: { style: 'font-size: 0.85em; width: 100%;' } });
            models.forEach(([val, label]) => {
                const opt = sel.createEl('option', { value: val, text: label });
                if (this.plugin.settings.geminiModel === val) opt.selected = true;
            });
            sel.addEventListener('change', async () => { this.plugin.settings.geminiModel = sel.value; await this.plugin.saveSettings(); });
        });

        field('Max Output Tokens', 'Max Gemini tokens.', row => {
            const inp = row.createEl('input', { attr: { type: 'number', min: '256', max: '65536', style: 'width: 100px;' } });
            inp.value = String(this.plugin.settings.maxOutputTokens ?? 65536);
            inp.addEventListener('change', async () => {
                const val = Math.min(65536, Math.max(256, parseInt(inp.value) || 65536));
                this.plugin.settings.maxOutputTokens = val;
                await this.plugin.saveSettings();
            });
        });
    }

    async renderMinaMode(container: HTMLElement) {
        if (!this.plugin.settings.geminiApiKey) {
            container.createEl('div', { text: '⚠️ No Gemini API key set.', attr: { style: 'padding:20px;color:var(--text-muted);' } });
            return;
        }

        const isMobilePhone = Platform.isMobile && !isTablet();
        const wrapper = container.createEl('div', { attr: { style: 'flex-grow:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;' } });

        if (this.isDedicated) {
            const header = wrapper.createEl('div', { 
                attr: { 
                    style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-primary-alt);' 
                } 
            });
            const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            leftHeader.createEl('h3', { 
                text: 'AI Chat',
                attr: { style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' } 
            });
        }

        const groundedBar = wrapper.createEl('div', { attr: { style: 'flex-shrink:0;display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;padding:5px 10px;border-bottom:1px solid var(--background-modifier-border);background:var(--background-secondary);' } });
        this.groundedNotesBar = groundedBar;

        const refreshGroundedBar = () => {
            groundedBar.empty();
            this.groundedNotes.forEach(file => {
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(file.extension.toLowerCase());
                const chip = groundedBar.createEl('span', {
                    attr: { style: 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:0.78em;background:var(--background-primary-alt);border:1px solid var(--background-modifier-border);color:var(--text-muted);cursor:pointer;' }
                });
                chip.createSpan({ text: (isImage ? '🖼️ ' : '📄 ') + file.basename });
                chip.addEventListener('click', () => {
                    this.app.workspace.openLinkText(file.path, '', 'window');
                });
                const unpin = chip.createSpan({ text: '×', attr: { style: 'margin-left:4px;opacity:0.5;cursor:pointer;font-weight:bold;' } });
                unpin.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.groundedNotes = this.groundedNotes.filter(f => f.path !== file.path);
                    refreshGroundedBar();
                });
            });

            const webChip = groundedBar.createEl('span', {
                attr: { style: `margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:12px;font-size:0.78em;cursor:pointer;border:1px solid ${this.webSearchEnabled ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};background:${this.webSearchEnabled ? 'var(--interactive-accent)' : 'transparent'};color:${this.webSearchEnabled ? 'var(--text-on-accent)' : 'var(--text-muted)'};` }
            });
            webChip.setText('🌐 Web');
            webChip.addEventListener('click', () => { this.webSearchEnabled = !this.webSearchEnabled; refreshGroundedBar(); });
        };
        refreshGroundedBar();

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Ask MINA…';
        textarea.rows = 3;
        textarea.style.cssText = 'width:100%;resize:none;padding:8px 140px 8px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);';

        const handleChatFiles = async (files: FileList) => {
            const attachmentFolder = '998 Attachments';
            const { vault } = this.plugin.app;
            if (!vault.getAbstractFileByPath(attachmentFolder)) {
                await vault.createFolder(attachmentFolder);
            }

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file || file.size === 0) continue;
                try {
                    const isImage = file.type.startsWith('image/');
                    const arrayBuffer = await file.arrayBuffer();
                    const extension = file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png');
                    const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : `AI Attachment ${moment().format('YYYYMMDDHHmmss')}`;
                    const fileName = `${baseName}.${extension}`;
                    
                    let finalPath = '';
                    if (isImage) {
                        finalPath = `${attachmentFolder}/${fileName}`;
                        let counter = 1;
                        while (vault.getAbstractFileByPath(finalPath)) {
                            finalPath = `${attachmentFolder}/${baseName} (${counter}).${extension}`;
                            counter++;
                        }
                    } else {
                        finalPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(fileName);
                    }

                    const newFile = await vault.createBinary(finalPath, arrayBuffer);
                    if (!this.groundedNotes.some(f => f.path === newFile.path)) {
                        this.groundedNotes.push(newFile);
                        refreshGroundedBar();
                    }
                    new Notice(`Grounded: ${newFile.name}`);
                } catch (err) {
                    new Notice('Failed to ground file.');
                }
            }
        };

        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';
        fileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*';
        fileInput.addEventListener('change', async () => { if (fileInput.files) await handleChatFiles(fileInput.files); fileInput.value = ''; });

        const overlayBtns = document.createElement('div');
        overlayBtns.style.cssText = 'position:absolute;bottom:16px;right:16px;display:flex;gap:4px;';
        const attachBtn = overlayBtns.createEl('button', { text: '📎', attr: { title: 'Attach for Grounding', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
        const saveBtn = overlayBtns.createEl('button', { text: '📥', attr: { title: 'Save Session', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
        const recallBtn = overlayBtns.createEl('button', { text: '📂', attr: { title: 'Recall Session', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
        const sendBtn = overlayBtns.createEl('button', { text: '↑',  attr: { style: 'padding:3px 10px;border-radius:5px;background:var(--interactive-accent);color:var(--text-on-accent);border:none;cursor:pointer;' } });
        const newChatBtn = overlayBtns.createEl('button', { text: '🗒️', attr: { title: 'New Chat', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });

        const send = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            textarea.value = ''; textarea.disabled = true;
            this.chatHistory.push({ role: 'user', text });
            await this.renderChatHistory();
            await this.saveChatSession();
            const thinking = this.chatContainer.createEl('div', { text: 'MINA is thinking…', attr: { style: 'font-size:0.85em;color:var(--text-muted);font-style:italic;' } });
            try {
                const reply = await this.callGemini(text, [...this.groundedNotes], this.webSearchEnabled);
                thinking.remove();
                this.chatHistory.push({ role: 'assistant', text: reply });
            } catch (e: any) {
                thinking.remove();
                this.chatHistory.push({ role: 'assistant', text: `⚠️ Error: ${e.message}` });
            }
            await this.renderChatHistory();
            await this.saveChatSession();
            textarea.disabled = false; if (!isMobilePhone) textarea.focus();
        };

        sendBtn.addEventListener('click', send);
        attachBtn.addEventListener('click', () => fileInput.click());
        textarea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                e.preventDefault();
                await handleChatFiles(e.clipboardData.files);
            }
        });
        textarea.addEventListener('drop', async (e: DragEvent) => {
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                await handleChatFiles(e.dataTransfer.files);
            }
        });
        textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        textarea.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            const pos = target.selectionStart;
            if (pos >= 2 && target.value.substring(pos - 2, pos) === '[[') {
                new NotePickerModal(this.plugin.app, (file) => {
                    if (!this.groundedNotes.some(f => f.path === file.path)) {
                        this.groundedNotes.push(file);
                        refreshGroundedBar();
                    }
                    const before = target.value.substring(0, pos - 2);
                    const after = target.value.substring(pos);
                    target.value = before + after;
                    target.focus();
                    target.setSelectionRange(before.length, before.length);
                }).open();
            }
        });
        saveBtn.addEventListener('click', async () => {
            await this.saveChatSession();
            new Notice('Chat session saved');
        });
        recallBtn.addEventListener('click', () => {
            const folder = this.plugin.settings.aiChatFolder.trim() || '000 Bin/MINA V2 AI Chat';
            const files = this.plugin.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + '/'));
            if (files.length === 0) {
                new Notice('No saved chat sessions found');
                return;
            }
            new ChatSessionPickerModal(this.plugin.app, files, async (file) => {
                const content = await this.plugin.app.vault.read(file);
                this.chatHistory = this.parseChatSession(content);
                this.currentChatFile = file.path;
                await this.renderChatHistory();
                new Notice(`Loaded: ${file.basename}`);
            }).open();
        });
        newChatBtn.addEventListener('click', () => { 
            this.chatHistory = []; 
            this.currentChatFile = null;
            this.renderChatHistory(); 
        });

        const inputRow = document.createElement('div');
        inputRow.style.cssText = `flex-shrink:0;position:relative;padding:8px;background:var(--background-secondary);z-index:10;${Platform.isMobile ? 'border-bottom:1px solid var(--background-modifier-border);' : 'border-top:1px solid var(--background-modifier-border);'}`;
        inputRow.appendChild(textarea); inputRow.appendChild(overlayBtns);

        if (Platform.isMobile) {
            wrapper.appendChild(inputRow);
        }

        this.chatContainer = wrapper.createEl('div', { attr: { style: `flex-grow:1;min-height:0;overflow-y:auto;padding:8px;padding-bottom:${Platform.isMobile ? '120px' : '8px'};` } });
        await this.renderChatHistory();

        if (!Platform.isMobile) {
            wrapper.appendChild(inputRow);
            setTimeout(() => textarea.focus(), 50);
        }
    }

    async renderChatHistory() {
        if (!this.chatContainer) return;
        this.chatContainer.empty();
        if (this.chatHistory.length === 0) {
            this.chatContainer.createEl('div', { text: 'Ask me anything.', attr: { style: 'text-align:center;margin-top:20px;color:var(--text-muted);' } });
            return;
        }
        for (const msg of this.chatHistory) {
            const isUser = msg.role === 'user';
            const row = this.chatContainer.createEl('div', { attr: { style: `display: flex; justify-content: ${isUser ? 'flex-end' : 'flex-start'}; margin-bottom: 12px;` } });
            const bubble = row.createEl('div', { attr: { style: `max-width: 85%; padding: 10px 14px; border-radius: 12px; background: ${isUser ? 'var(--interactive-accent)' : 'var(--background-secondary)'}; color: ${isUser ? 'var(--text-on-accent)' : 'var(--text-normal)'}; position: relative; min-width: 60px;` } });
            
            const textContent = bubble.createEl('div', { attr: { style: 'margin-bottom: 4px;' } });
            if (isUser) {
                textContent.setText(msg.text);
            } else {
                await MarkdownRenderer.render(this.plugin.app, msg.text, textContent, '', this);
                this.hookInternalLinks(textContent, '');
                this.hookImageZoom(textContent);
            }

            const actions = bubble.createEl('div', { attr: { style: 'position: absolute; bottom: 4px; right: 8px; display: flex; gap: 6px; opacity: 0; transition: opacity 0.2s; background: inherit; padding-left: 10px; border-bottom-right-radius: 12px;' } });
            bubble.addEventListener('mouseenter', () => actions.style.opacity = '1');
            bubble.addEventListener('mouseleave', () => actions.style.opacity = '0');

            const copyBtn = actions.createEl('span', { text: '📋', attr: { style: 'cursor: pointer; font-size: 0.75em; filter: grayscale(1) brightness(1.5);', title: 'Copy' } });
            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(msg.text);
                new Notice('Copied to clipboard');
            });

            if (!isUser) {
                const saveBtn = actions.createEl('span', { text: '💾', attr: { style: 'cursor: pointer; font-size: 0.75em; filter: grayscale(1) brightness(1.5);', title: 'Save as Thought' } });
                saveBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.plugin.createThoughtFile(msg.text, ['#ai-response']);
                    new Notice('Saved as thought');
                });
            }
        }
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    async saveChatSession() {
        if (this.chatHistory.length === 0) return;
        const s = this.plugin.settings;
        const folder = s.aiChatFolder.trim() || '000 Bin/MINA V2 AI Chat';
        const { vault } = this.plugin.app;

        if (!vault.getAbstractFileByPath(folder)) {
            const parts = folder.split('/');
            let currentPath = '';
            for (const part of parts) {
                currentPath += (currentPath ? '/' : '') + part;
                if (!vault.getAbstractFileByPath(currentPath)) {
                    await vault.createFolder(currentPath);
                }
            }
        }

        if (!this.currentChatFile) {
            this.currentChatFile = `${folder}/MINA Chat ${moment().format('YYYY-MM-DD HHmm')}.md`;
        }

        let content = `---\ntitle: "AI Chat ${moment().format('YYYY-MM-DD HH:mm')}"\ncreated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n---\n\n`;
        
        // Explicitly list session-wide grounding sources if any
        const allSources = new Set<string>();
        this.chatHistory.forEach(msg => msg.sources?.forEach(src => allSources.add(src)));
        
        if (allSources.size > 0) {
            content += `### Session Grounding Sources\n`;
            allSources.forEach(src => content += `- [[${src}]]\n`);
            content += `\n---\n\n`;
        }

        for (const msg of this.chatHistory) {
            const role = msg.role === 'user' ? 'You' : 'MINA';
            content += `**${role}:** ${msg.text}\n\n`;
            if (msg.sources && msg.sources.length > 0) {
                content += `*Sources: ${msg.sources.map(s => `[[${s}]]`).join(', ')}*\n\n`;
            }
            content += `---\n\n`;
        }

        const file = vault.getAbstractFileByPath(this.currentChatFile);
        if (file instanceof TFile) {
            await vault.modify(file, content);
        } else {
            await vault.create(this.currentChatFile, content);
        }
    }

    async callGemini(userMessage: string, groundedFiles: TFile[] = [], webSearch: boolean = false): Promise<string> {
        const s = this.plugin.settings;
        
        // 1. Gather all potential sources
        const allThoughts = Array.from(this.plugin.thoughtIndex.values())
            .filter(t => !t.context.includes('journal'))
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate)
            .slice(0, 50);

        interface SourceItem {
            id: number;
            title: string;
            path: string;
            type: 'thought' | 'file' | 'image';
            content?: string;
            file?: TFile;
        }

        const sources: SourceItem[] = [];
        let sourceCounter = 1;

        // Add thoughts as sources
        allThoughts.forEach(t => {
            sources.push({ id: sourceCounter++, title: t.title, path: t.filePath, type: 'thought', content: t.body });
        });

        const imageParts: any[] = [];
        // Add specific grounded files/images as sources
        for (const file of groundedFiles) {
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(file.extension.toLowerCase());
            if (isImage) {
                const buffer = await this.app.vault.readBinary(file);
                let binary = '';
                const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                const mimeType = `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
                imageParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'image', file });
            } else {
                const content = await this.app.vault.read(file);
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'file', content, file });
            }
        }

        // 2. Build System Prompt with Citations instructions
        let systemPrompt = "You are MINA AI, a helpful personal assistant integrated into an Obsidian vault.\n\n";
        systemPrompt += "CRITICAL INSTRUCTION: When you use information from the provided sources, you MUST cite them using numeric tags like [1], [2], etc.\n";
        systemPrompt += "If there are multiple sources for one statement, cite them individually like [1][2] instead of [1, 2].\n";
        systemPrompt += "The user will see these as hyperlinks to the actual notes.\n\n";
        
        if (sources.length > 0) {
            systemPrompt += "### SOURCES AVAILABLE:\n";
            sources.forEach(src => {
                systemPrompt += `[${src.id}] Source: ${src.title} (${src.path})\n`;
                if (src.content) systemPrompt += `Content: ${src.content}\n`;
                if (src.type === 'image') systemPrompt += `(This is an image attached to the current message)\n`;
                systemPrompt += `---\n`;
            });
        }

        const tools = [
            {
                function_declarations: [
                    {
                        name: "create_file",
                        description: "Create a new file in the Obsidian vault. Use this when the user asks to save data, reports, tables, or lists to a file (CSV, MD, TXT, etc.).",
                        parameters: {
                            type: "object",
                            properties: {
                                filename: { type: "string", description: "The name of the file, including extension (e.g. 'data.csv', 'report.md')." },
                                content: { type: "string", description: "The full text content of the file." }
                            },
                            required: ["filename", "content"]
                        }
                    }
                ]
            }
        ];

        const contents = this.chatHistory.map((msg, idx) => {
            const isLastMessage = idx === this.chatHistory.length - 1;
            const parts: any[] = [{ text: msg.text }];
            if (isLastMessage && msg.role === 'user' && imageParts.length > 0) {
                parts.push(...imageParts);
            }
            return { role: msg.role === 'user' ? 'user' : 'model', parts: parts };
        });
        
        const body: any = {
            contents: contents,
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: s.maxOutputTokens ?? 65536 }
        };

        if (webSearch) body.tools = [{ googleSearch: {} }]; else body.tools = tools;

        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiApiKey}`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) 
        });
        
        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(`HTTP ${resp.status}: ${errData.error?.message || resp.statusText}`);
        }
        const data = await resp.json();
        const candidate = data?.candidates?.[0];
        const part = candidate?.content?.parts?.[0];

        if (part?.functionCall) {
            const { name, args } = part.functionCall;
            if (name === 'create_file') {
                try {
                    await this.plugin.createFile(args.filename, args.content);
                    return `✅ I've created the file "${args.filename}" for you.`;
                } catch (err) { return `❌ Failed to create file: ${err.message}`; }
            }
        }

        let reply = (candidate?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim() || '(no response)';

        // 3. Post-process response to add hyperlinks to citations
        // First, normalize grouped citations: [1, 2, 3] -> [1][2][3]
        reply = reply.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (match: string, p1: string) => {
            if (!p1.includes(',')) return match;
            return p1.split(',').map((num: string) => `[${num.trim()}]`).join('');
        });

        sources.forEach(src => {
            const citationTag = `[${src.id}]`;
            // If it's a vault file, use [[Path|[n]]]
            // If it's a thought, we can use [[FilePath|[n]]]
            const link = `[[${src.path}|${citationTag}]]`;
            // Use a regex to replace the citation tag only when it's not already inside a link
            const regex = new RegExp(`\\${citationTag}(?![^\\[]*\\]\\])`, 'g');
            reply = reply.replace(regex, link);
        });

        // 4. Update the last message in history with the sources used
        const lastUserMsg = this.chatHistory[this.chatHistory.length - 1];
        if (lastUserMsg && lastUserMsg.role === 'user') {
            lastUserMsg.sources = sources.filter(src => groundedFiles.some(gf => gf.path === src.path)).map(src => src.path);
        }

        return reply;
    }

    parseChatSession(content: string): { role: 'user' | 'assistant'; text: string }[] {
        const history: { role: 'user' | 'assistant'; text: string }[] = [];
        let currentRole: 'user' | 'assistant' | null = null; let currentLines: string[] = [];
        for (const line of content.split('\n')) {
            if (line.startsWith('**You:** ')) {
                if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
                currentRole = 'user'; currentLines = [line.substring(9)];
            } else if (line.startsWith('**MINA:** ')) {
                if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
                currentRole = 'assistant'; currentLines = [line.substring(10)];
            } else if (currentRole && !line.startsWith('#')) currentLines.push(line);
        }
        if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
        return history;
    }

    hookInternalLinks(el: HTMLElement, sourcePath: string) {
        el.querySelectorAll('a.internal-link').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const href = a.getAttribute('data-href') || a.getAttribute('href') || '';
                if (href) this.plugin.app.workspace.openLinkText(href, sourcePath, Platform.isMobile ? 'tab' : 'window');
            });
        });
    }

    hookImageZoom(el: HTMLElement) {
        el.querySelectorAll('img').forEach((img) => {
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const overlay = document.body.createEl('div', { attr: { style: 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.88); display:flex; align-items:center; justify-content:center; overflow:hidden; touch-action:none' } });
                const zoomed = overlay.createEl('img', { attr: { src: img.src, style: 'max-width:90vw; max-height:90vh; object-fit:contain; border-radius:6px; box-shadow:0 8px 40px rgba(0,0,0,0.6); user-select:none; will-change:transform; transform-origin:center center; cursor:grab; transition:none' } });
                const hint = overlay.createEl('div', { attr: { style: 'position:absolute; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.55); color:#fff; font-size:0.78em; padding:4px 14px; border-radius:20px; pointer-events:none; white-space:nowrap; opacity:0.8' }, text: Platform.isMobile ? 'Pinch to zoom · drag to pan · tap outside to close' : 'Scroll to zoom · drag to pan · click outside to close · Esc' });
                let scale = 1, tx = 0, ty = 0;
                const applyTransform = () => { zoomed.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; zoomed.style.cursor = scale > 1 ? 'grab' : 'zoom-in'; };
                const clampTranslate = () => { const r = zoomed.getBoundingClientRect(); const ow = overlay.clientWidth, oh = overlay.clientHeight; const excess = Math.max(0, (r.width - ow) / 2 + 20); const excessY = Math.max(0, (r.height - oh) / 2 + 20); tx = Math.max(-excess, Math.min(excess, tx)); ty = Math.max(-excessY, Math.min(excessY, ty)); };
                const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
                overlay.addEventListener('click', close); zoomed.addEventListener('click', (ev) => ev.stopPropagation());
                const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
                document.addEventListener('keydown', onKey);
                overlay.addEventListener('wheel', (ev: WheelEvent) => { ev.preventDefault(); const delta = ev.deltaY < 0 ? 0.15 : -0.15; scale = Math.max(0.2, Math.min(8, scale + delta)); clampTranslate(); applyTransform(); }, { passive: false });
                let dragStart: { x: number; y: number } | null = null; let dragTx = 0, dragTy = 0;
                zoomed.addEventListener('mousedown', (ev) => { if (scale <= 1) return; ev.preventDefault(); dragStart = { x: ev.clientX, y: ev.clientY }; dragTx = tx; dragTy = ty; zoomed.style.cursor = 'grabbing'; });
                document.addEventListener('mousemove', (ev) => { if (!dragStart) return; tx = dragTx + (ev.clientX - dragStart.x); ty = dragTy + (ev.clientY - dragStart.y); clampTranslate(); applyTransform(); });
                document.addEventListener('mouseup', () => { dragStart = null; applyTransform(); });
                let lastPinchDist = 0, lastPinchScale = 1; let touchStart: { x: number; y: number; tx: number; ty: number } | null = null;
                overlay.addEventListener('touchstart', (ev: TouchEvent) => { if (ev.touches.length === 2) { const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; lastPinchDist = Math.hypot(dx, dy); lastPinchScale = scale; touchStart = null; } else if (ev.touches.length === 1 && scale > 1) { touchStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, tx, ty }; } }, { passive: true });
                overlay.addEventListener('touchmove', (ev: TouchEvent) => { ev.preventDefault(); if (ev.touches.length === 2) { const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; const dist = Math.hypot(dx, dy); scale = Math.max(0.2, Math.min(8, lastPinchScale * (dist / lastPinchDist))); clampTranslate(); applyTransform(); } else if (ev.touches.length === 1 && touchStart) { tx = touchStart.tx + (ev.touches[0].clientX - touchStart.x); ty = touchStart.ty + (ev.touches[0].clientY - touchStart.y); clampTranslate(); applyTransform(); } }, { passive: false });
                overlay.addEventListener('touchend', (ev: TouchEvent) => { if (ev.changedTouches.length === 1 && scale <= 1.05) { if (!(ev.target as HTMLElement).closest('img')) close(); } });
                setTimeout(() => hint.style.opacity = '0', 2500);
            });
        });
    }

    hookCheckboxes(el: HTMLElement, entry: ThoughtEntry) {
        try {
            const checkboxEls = Array.from(el.querySelectorAll('input[type="checkbox"]'));
            checkboxEls.forEach((cb, idx) => {
                try {
                    const checkbox = cb as HTMLInputElement; const isChecked = checkbox.checked;
                    const circle = document.createElement('span');
                    const applyCircleStyle = (checked: boolean) => {
                        circle.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; border-radius:50%; border:2px solid var(--interactive-accent); cursor:pointer; flex-shrink:0; transition:background 0.15s; background:${checked ? 'var(--interactive-accent)' : 'transparent'}; font-size:10px; color:var(--background-primary); user-select:none; vertical-align:middle; margin-right:4px`;
                        circle.textContent = checked ? '✓' : ''; circle.setAttribute('data-checked', checked ? '1' : '0'); circle.title = checked ? 'Mark incomplete' : 'Mark complete';
                    };
                    applyCircleStyle(isChecked);
                    const parent = checkbox.parentElement; if (parent) { parent.insertBefore(circle, checkbox); parent.removeChild(checkbox); }
                    circle.addEventListener('click', async (e) => {
                        e.preventDefault(); e.stopPropagation();
                        const currentlyChecked = circle.getAttribute('data-checked') === '1'; const newChecked = !currentlyChecked; applyCircleStyle(newChecked);
                        let count = 0; const newRaw = entry.body.replace(/- \[([ x])\] /g, (match: string, state: string) => { if (count++ === idx) return state === ' ' ? '- [x] ' : '- [ ] '; return match; });
                        if (newRaw !== entry.body) { entry.body = newRaw; await this.plugin.editThoughtBody(entry.filePath, newRaw, entry.context); }
                    });
                } catch (itemErr) { console.warn('MINA: hookCheckboxes item error', itemErr); }
            });
        } catch (err) { console.warn('MINA: hookCheckboxes error', err); }
    }

    renderCaptureMode(container: HTMLElement, isThoughtsOnly: boolean = false, isTasksOnly: boolean = false) {
        if (this.replyToId) {
            const replyBanner = container.createEl('div', { attr: { style: 'background-color: var(--background-secondary-alt); padding: 8px 12px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid var(--interactive-accent); display: flex; justify-content: space-between; align-items: center; font-size: 0.85em;' } });
            const bannerText = replyBanner.createEl('div', { attr: { style: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1; margin-right: 10px;' } });
            bannerText.createSpan({ text: 'Replying to: ', attr: { style: 'font-weight: bold; color: var(--text-accent);' } });
            bannerText.createSpan({ text: this.replyToText || '' });
            const cancelReply = replyBanner.createEl('button', { text: '✕', attr: { style: 'padding: 2px 6px; font-size: 0.8em; background: transparent; border: none; cursor: pointer;' } });
            cancelReply.addEventListener('click', () => { this.replyToId = null; this.replyToText = null; this.renderView(); });
        }
        const inputSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; margin-bottom: 10px; display: flex; gap: 10px; align-items: flex-end;' } });
        const textAreaWrapper = inputSection.createEl('div', { attr: { style: 'flex-grow: 1;' } });
        const textArea = textAreaWrapper.createEl('textarea', { attr: { placeholder: Platform.isMobile && !isTablet() ? 'Type thought… use @ for date, # for context, [[ for links, + for checklist' : 'Enter thought or task… Shift+Enter to save', rows: isTablet() ? '4' : '3', style: 'width: 100%; font-family: var(--font-text); resize: vertical; display: block;' } });
        textArea.value = this.content;
        if (Platform.isMobile) textArea.addEventListener('focus', () => { setTimeout(() => { textArea.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); });
        let lastValue = this.content;
        textArea.addEventListener('input', (e) => { 
            const target = e.target as HTMLTextAreaElement; const val = target.value;
            const pos = target.selectionStart;
            const textBeforeCursor = val.substring(0, pos);
            
            // Natural Language Date conversion: @date followed by space/newline
            const dateMatch = textBeforeCursor.match(/@([^@\n\s]+(?: [^@\n\s]+)*)([\s\n])$/);
            if (dateMatch) {
                const rawDate = dateMatch[1];
                const terminator = dateMatch[2];
                const parsed = parseNaturalDate(rawDate);
                if (parsed) {
                    const matchStart = dateMatch.index!;
                    const before = val.substring(0, matchStart);
                    const after = val.substring(pos);
                    const insertText = `[[${parsed}]]${terminator}`;
                    target.value = before + insertText + after;
                    this.content = target.value;
                    const newPos = matchStart + insertText.length;
                    target.setSelectionRange(newPos, newPos);
                    lastValue = target.value;
                    return;
                }
            }

            if (val.length > lastValue.length) {
                const cursorPosition = target.selectionStart;
                if (cursorPosition >= 2 && val.substring(cursorPosition - 2, cursorPosition) === '[[') {
                    new FileSuggestModal(this.plugin.app, (file) => {
                        const before = val.substring(0, cursorPosition - 2); const after = val.substring(cursorPosition); const insertText = `[[${file.basename}]]`;
                        target.value = before + insertText + after; this.content = target.value;
                        setTimeout(() => { target.focus(); target.setSelectionRange(before.length + insertText.length, before.length + insertText.length); }, 50);
                    }, this.plugin.settings.newNoteFolder).open();
                } else if (cursorPosition > 0 && val.charAt(cursorPosition - 1) === '#') {
                    new ContextSuggestModal(this.plugin.app, this.plugin.settings.contexts, async (ctx) => {
                        if (!this.plugin.settings.contexts.includes(ctx)) {
                            this.plugin.settings.contexts.push(ctx);
                            await this.plugin.saveSettings();
                        }
                        if (!this.selectedContexts.includes(ctx)) {
                            this.selectedContexts.push(ctx);
                            this.plugin.settings.selectedContexts = [...this.selectedContexts];
                            await this.plugin.saveSettings();
                        }
                        const before = val.substring(0, cursorPosition - 1);
                        const after = val.substring(cursorPosition);
                        target.value = before + after;
                        this.content = target.value;
                        
                        setTimeout(() => { target.focus(); target.setSelectionRange(before.length, before.length); }, 50);
                    }).open();
                }
            }
            const converted = val.replace(/^\+ /gm, '- [ ] '); if (converted !== val) { const cursor = target.selectionStart; const diff = converted.length - val.length; target.value = converted; target.setSelectionRange(cursor + diff, cursor + diff); }
            lastValue = target.value; this.content = target.value;
        });
        textArea.addEventListener('keydown', (ev) => { });
        textArea.addEventListener('paste', async (e: ClipboardEvent) => { e.stopPropagation(); if (e.clipboardData && e.clipboardData.files.length > 0) { let hasImage = false; for (let i = 0; i < e.clipboardData.items.length; i++) { if (e.clipboardData.items[i].type.indexOf('image') !== -1) { hasImage = true; break; } } if (hasImage) { e.preventDefault(); await this.handleFiles(e.clipboardData.files); } } });
        textArea.addEventListener('dragover', (e) => { e.stopPropagation(); e.preventDefault(); });
        textArea.addEventListener('drop', async (e: DragEvent) => { e.stopPropagation(); if (e.dataTransfer && e.dataTransfer.files.length > 0) { e.preventDefault(); await this.handleFiles(e.dataTransfer.files); } });
        textAreaWrapper.style.position = 'relative';
        const fileInput = textAreaWrapper.createEl('input', { attr: { type: 'file', multiple: '', style: 'display:none;', accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*' } }) as HTMLInputElement;
        fileInput.addEventListener('change', async () => { if (fileInput.files && fileInput.files.length > 0) { await this.handleFiles(fileInput.files); fileInput.value = ''; } });
        const attachBtn = textAreaWrapper.createEl('button', { attr: { title: 'Attach image or file', style: 'position:absolute; bottom:6px; right:34px; background:transparent; border:none; color:var(--text-muted); opacity:0.5; padding:2px 4px; cursor:pointer; font-size:1em; line-height:1; transition:opacity 0.15s; z-index:1' } });
        attachBtn.textContent = '📎'; attachBtn.addEventListener('mouseenter', () => attachBtn.style.opacity = '1'); attachBtn.addEventListener('mouseleave', () => attachBtn.style.opacity = '0.5'); attachBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
        const submitBtn = inputSection.createEl('button', { text: 'Sync', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 8px 16px; height: 100%; min-height: 40px;' } });
        const controlsDiv = container.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 15px;' } });
        
        if (!isThoughtsOnly && !isTasksOnly) {
            const taskToggleDiv = controlsDiv.createEl('div', { attr: { style: `display: flex; align-items: center; gap: 8px; ${Platform.isMobile && !isTablet() ? '' : 'margin-left: auto;'}` } });
            const taskCheckbox = taskToggleDiv.createEl('input', { type: 'checkbox', attr: { id: 'is-task-checkbox' } }); taskCheckbox.checked = this.isTask;
            taskToggleDiv.createEl('label', { attr: { for: 'is-task-checkbox', style: 'cursor: pointer;' }, text: 'As Task' });
            const dueDateContainer = taskToggleDiv.createEl('div', { attr: { style: `display: ${this.isTask ? 'flex' : 'none'}; align-items: center; gap: 5px; margin-left: 10px;` } });
            dueDateContainer.createSpan({ text: 'Due:', attr: { style: 'font-size: 0.85em; color: var(--text-muted);' } });
            const datePicker = dueDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
            datePicker.value = this.dueDate; datePicker.addEventListener('change', (e) => { this.dueDate = (e.target as HTMLInputElement).value; });
            taskCheckbox.addEventListener('change', (e) => { this.isTask = (e.target as HTMLInputElement).checked; dueDateContainer.style.display = this.isTask ? 'flex' : 'none'; });
        } else if (isTasksOnly) {
            this.isTask = true;
            const taskControlsDiv = controlsDiv.createEl('div', { attr: { style: `display: flex; align-items: center; gap: 8px; ${Platform.isMobile && !isTablet() ? '' : 'margin-left: auto;'}` } });
            taskControlsDiv.createSpan({ text: 'Due:', attr: { style: 'font-size: 0.85em; color: var(--text-muted);' } });
            const datePicker = taskControlsDiv.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
            datePicker.value = this.dueDate; datePicker.addEventListener('change', (e) => { this.dueDate = (e.target as HTMLInputElement).value; });
        } else this.isTask = false;
        const submitAction = async () => {
            if (this.content.trim().length > 0) {
                const contextsToSave = this.activeTab === 'journal' ? ['journal'] : this.selectedContexts;
                if (this.isTask) await this.plugin.createTaskFile(this.content.trim(), contextsToSave, this.dueDate || undefined);
                else if (this.replyToId) { const replied = await this.plugin.appendReplyToFile(this.replyToId, this.content.trim()); if (replied) new Notice('Reply added!'); }
                else await this.plugin.createThoughtFile(this.content.trim(), contextsToSave);
                this.content = ''; textArea.value = ''; this.replyToId = null; this.replyToText = null;
                if (Platform.isMobile && !isTablet()) { this.selectedContexts = []; this.plugin.settings.selectedContexts = []; await this.plugin.saveSettings(); }
                this.renderView();
            } else new Notice('Please enter some text');
        };
        submitBtn.addEventListener('click', submitAction);
        textArea.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); await submitAction(); } });
    }

    renderJournalMode(container: HTMLElement) {
        const captureContainer = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: block; margin-top: 10px; margin-bottom: 10px;' } });
        this.renderCaptureMode(captureContainer, true, false);
        this.reviewThoughtsContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 5px 5px 200px 5px;' } });
        this.updateJournalList();
    }

    async updateJournalList(appendMore = false) {
        if (!this.reviewThoughtsContainer) return;
        if (!appendMore) {
            this.thoughtsOffset = 0; this.reviewThoughtsContainer.empty(); this._parsedRoots = [];
            let roots: ThoughtEntry[] = Array.from(this.plugin.thoughtIndex.values());
            roots = roots.filter(e => e.context.includes('journal'));
            roots.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
            this._parsedRoots = roots;
            if (roots.length === 0) { this.reviewThoughtsContainer.createEl('p', { text: 'No journal entries found.', attr: { style: 'color: var(--text-muted);' } }); return; }
            this.thoughtsRowContainer = this.reviewThoughtsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
        }
        if (!this.thoughtsRowContainer) return;
        this.reviewThoughtsContainer.querySelector('.mina-load-more')?.remove();
        const PAGE_SIZE = 20; const page = this._parsedRoots.slice(this.thoughtsOffset, this.thoughtsOffset + PAGE_SIZE);
        for (const entry of page) await this.renderThoughtRow(entry, this.thoughtsRowContainer!, entry.filePath, 0, true, true);
        this.thoughtsOffset += page.length;
        if (this.thoughtsOffset < this._parsedRoots.length) { const loadMoreBtn = this.reviewThoughtsContainer.createEl('button', { text: `Load more (${this._parsedRoots.length - this.thoughtsOffset} remaining)`, cls: 'mina-load-more', attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' } }); loadMoreBtn.addEventListener('click', () => this.updateJournalList(true)); }
    }

    renderReviewTasksMode(container: HTMLElement) {
        if (this.isDedicated) {
            const header = container.createEl('div', { 
                attr: { 
                    style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-primary-alt);' 
                } 
            });
            const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            leftHeader.createEl('h3', { 
                text: 'Task Mode',
                attr: { style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' } 
            });
        }
        const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
        let filterBarEl: HTMLElement | null = null;
        const renderToggles = (parent: HTMLElement) => {
            const toggleGroup = parent.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: flex-start; width: 100%;' } });
            const filterToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            filterToggleContainer.createSpan({ text: 'Filter' });
            const filterToggleLabel = filterToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const filterCbT = filterToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            filterCbT.checked = this.showTasksFilter;
            const filterSliderT = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showTasksFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
            const filterKnobT = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showTasksFilter ? 'translateX(14px)' : 'translateX(0)'};` } });
            filterCbT.addEventListener('change', (e) => { this.showTasksFilter = (e.target as HTMLInputElement).checked; filterSliderT.style.backgroundColor = this.showTasksFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; filterKnobT.style.transform = this.showTasksFilter ? 'translateX(14px)' : 'translateX(0)'; if (filterBarEl) filterBarEl.style.display = this.showTasksFilter ? 'flex' : 'none'; });
            const captureToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            captureToggleContainer.createSpan({ text: 'Capture' });
            const captureToggleLabel = captureToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const captureCb = captureToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            captureCb.checked = this.showCaptureInTasks;
            const captureSlider = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showCaptureInTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
            const captureKnob = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showCaptureInTasks ? 'translateX(14px)' : 'translateX(0)'};` } });
            captureCb.addEventListener('change', (e) => { this.showCaptureInTasks = (e.target as HTMLInputElement).checked; captureSlider.style.backgroundColor = this.showCaptureInTasks ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; captureKnob.style.transform = this.showCaptureInTasks ? 'translateX(14px)' : 'translateX(0)'; if (captureContainer) captureContainer.style.display = this.showCaptureInTasks ? 'block' : 'none'; });
        };
        renderToggles(headerSection);
        const filterBar = headerSection.createEl('div', { attr: { style: 'display: none; flex-wrap: wrap; gap: 10px; align-items: center;' } });
        filterBarEl = filterBar;
        const statusSel = filterBar.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
        [['all', 'All Status'], ['pending', 'Pending'], ['completed', 'Completed']].forEach(([val, label]) => { const opt = statusSel.createEl('option', { value: val, text: label }); if (this.tasksFilterStatus === val) opt.selected = true; });
        statusSel.addEventListener('change', (e) => { this.tasksFilterStatus = (e.target as HTMLSelectElement).value as any; this.updateReviewTasksList(); });
        const contextPills = filterBar.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; align-items: center;' } });
        const renderTaskContextPills = () => {
            contextPills.empty();
            this.plugin.settings.contexts.forEach(ctx => {
                const active = this.tasksFilterContext.includes(ctx);
                const pill = contextPills.createEl('span', { text: `#${ctx}`, attr: { style: `cursor: pointer; font-size: 0.8em; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--interactive-accent); background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'}; transition: 0.15s;` } });
                pill.addEventListener('click', () => { if (active) this.tasksFilterContext = this.tasksFilterContext.filter(c => c !== ctx); else this.tasksFilterContext = [...this.tasksFilterContext, ctx]; renderTaskContextPills(); this.updateReviewTasksList(); });
            });
        };
        renderTaskContextPills();
        const dateContainer = filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
        const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
        [['all', 'All Dates'], ['today', 'Today'], ['today+overdue', 'Today + Overdue'], ['this-week', 'This Week'], ['next-week', 'Next Week'], ['overdue', 'Overdue Only'], ['no-due', 'No Due Date'], ['custom', 'Custom Date']].forEach(([val, label]) => { const opt = dateSel.createEl('option', { value: val, text: label }); if (this.tasksFilterDate === val) opt.selected = true; });
        const customDateContainer = dateContainer.createEl('div', { attr: { style: `display: ${this.tasksFilterDate === 'custom' ? 'flex' : 'none'}; gap: 5px; align-items: center; flex-wrap: wrap;` } });
        const customDateStartInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
        if (this.tasksFilterDateStart) customDateStartInput.value = this.tasksFilterDateStart;
        customDateContainer.createSpan({ text: 'to', attr: { style: 'font-size: 0.85em; color: var(--text-muted); padding: 0 2px;' } });
        const customDateEndInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
        if (this.tasksFilterDateEnd) customDateEndInput.value = this.tasksFilterDateEnd;
        dateSel.addEventListener('change', (e) => { const val = (e.target as HTMLSelectElement).value; this.tasksFilterDate = val; if (val === 'custom') { customDateContainer.style.display = 'flex'; this.tasksFilterDateStart = customDateStartInput.value || moment().format('YYYY-MM-DD'); this.tasksFilterDateEnd = customDateEndInput.value || moment().format('YYYY-MM-DD'); } else customDateContainer.style.display = 'none'; this.updateReviewTasksList(); });
        customDateStartInput.addEventListener('change', () => { this.tasksFilterDateStart = customDateStartInput.value; this.updateReviewTasksList(); });
        customDateEndInput.addEventListener('change', () => { this.tasksFilterDateEnd = customDateEndInput.value; this.updateReviewTasksList(); });
        const captureContainer = container.createEl('div', { attr: { style: `flex-shrink: 0; display: ${this.showCaptureInTasks ? 'block' : 'none'};` } });
        this.renderCaptureMode(captureContainer, false, true);
        this.reviewTasksContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 5px 5px 200px 5px;' } });
        this.updateReviewTasksList();
    }

    renderReviewThoughtsMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
        let captureContainer: HTMLElement;
        let filterBarEl: HTMLElement | null = null;
        const renderToggles = (parent: HTMLElement) => {
            const toggleGroup = parent.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: flex-start; width: 100%;' } });
            const filterToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            filterToggleContainer.createSpan({ text: 'Filter' });
            const filterToggleLabel = filterToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const filterCbTh = filterToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            filterCbTh.checked = this.showThoughtsFilter;
            const filterSliderTh = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showThoughtsFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
            const filterKnobTh = filterToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showThoughtsFilter ? 'translateX(14px)' : 'translateX(0)'};` } });
            filterCbTh.addEventListener('change', (e) => { this.showThoughtsFilter = (e.target as HTMLInputElement).checked; filterSliderTh.style.backgroundColor = this.showThoughtsFilter ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; filterKnobTh.style.transform = this.showThoughtsFilter ? 'translateX(14px)' : 'translateX(0)'; if (filterBarEl) filterBarEl.style.display = this.showThoughtsFilter ? 'flex' : 'none'; });
            const historyToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            historyToggleContainer.createSpan({ text: 'History' });
            const historyToggleLabel = historyToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const historyCb = historyToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            historyCb.checked = this.showPreviousThoughts;
            const historySlider = historyToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showPreviousThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
            const historyKnob = historyToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showPreviousThoughts ? 'translateX(14px)' : 'translateX(0)'};` } });
            historyCb.addEventListener('change', (e) => { this.showPreviousThoughts = (e.target as HTMLInputElement).checked; historySlider.style.backgroundColor = this.showPreviousThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; historyKnob.style.transform = this.showPreviousThoughts ? 'translateX(14px)' : 'translateX(0)'; this.updateReviewThoughtsList(); });
            const captureToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            captureToggleContainer.createSpan({ text: 'Capture' });
            const captureToggleLabel = captureToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const captureCb = captureToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            captureCb.checked = this.showCaptureInThoughts;
            const captureSlider = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.showCaptureInThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
            const captureKnob = captureToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.showCaptureInThoughts ? 'translateX(14px)' : 'translateX(0)'};` } });
            captureCb.addEventListener('change', (e) => { this.showCaptureInThoughts = (e.target as HTMLInputElement).checked; captureSlider.style.backgroundColor = this.showCaptureInThoughts ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; captureKnob.style.transform = this.showCaptureInThoughts ? 'translateX(14px)' : 'translateX(0)'; if (captureContainer) captureContainer.style.display = this.showCaptureInThoughts ? 'block' : 'none'; });
            const todoToggleContainer = toggleGroup.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 6px; font-size: 0.85em; color: var(--text-muted); cursor: pointer;' } });
            todoToggleContainer.createSpan({ text: 'TO-DOs' });
            const todoToggleLabel = todoToggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 30px; height: 16px; cursor: pointer;' } });
            const todoCb = todoToggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
            todoCb.checked = this.thoughtsFilterTodo;
            const todoSlider = todoToggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${this.thoughtsFilterTodo ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 16px;` } });
            const todoKnob = todoToggleLabel.createEl('span', { attr: { style: `position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${this.thoughtsFilterTodo ? 'translateX(14px)' : 'translateX(0)'};` } });
            todoCb.addEventListener('change', (e) => { this.thoughtsFilterTodo = (e.target as HTMLInputElement).checked; todoSlider.style.backgroundColor = this.thoughtsFilterTodo ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; todoKnob.style.transform = this.thoughtsFilterTodo ? 'translateX(14px)' : 'translateX(0)'; this.updateReviewThoughtsList(); });
        };
        renderToggles(headerSection);
        const filterBar = headerSection.createEl('div', { attr: { style: 'display: none; flex-wrap: wrap; gap: 10px; align-items: center;' } });
        filterBarEl = filterBar;
        const contextPillsTh = filterBar.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; align-items: center;' } });
        const renderThoughtContextPills = () => {
            contextPillsTh.empty();
            this.plugin.settings.contexts.forEach(ctx => {
                const active = this.thoughtsFilterContext.includes(ctx);
                const pill = contextPillsTh.createEl('span', { text: `#${ctx}`, attr: { style: `cursor: pointer; font-size: 0.8em; padding: 2px 8px; border-radius: 12px; border: 1px solid var(--interactive-accent); background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'}; transition: 0.15s;` } });
                pill.addEventListener('click', () => { if (active) this.thoughtsFilterContext = this.thoughtsFilterContext.filter(c => c !== ctx); else this.thoughtsFilterContext = [...this.thoughtsFilterContext, ctx]; renderThoughtContextPills(); this.updateReviewThoughtsList(); });
            });
        };
        renderThoughtContextPills();
        const dateContainer= filterBar.createEl('div', { attr: { style: 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap;' } });
        const dateSel = dateContainer.createEl('select', { attr: { style: 'font-size: 0.85em; padding: 2px 4px; text-align: center; text-align-last: center;' }});
        [['all', 'All Dates'], ['today', 'Today'], ['last-5-days', 'Last 5 Days'], ['this-week', 'This Week'], ['custom', 'Custom Date']].forEach(([val, label]) => { const opt = dateSel.createEl('option', { value: val, text: label }); if (this.thoughtsFilterDate === val) opt.selected = true; });
        const customDateContainer = dateContainer.createEl('div', { attr: { style: `display: ${this.thoughtsFilterDate === 'custom' ? 'flex' : 'none'}; gap: 5px; align-items: center; flex-wrap: wrap;` } });
        const customDateStartInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
        if (this.thoughtsFilterDateStart) customDateStartInput.value = this.thoughtsFilterDateStart;
        customDateContainer.createSpan({ text: 'to', attr: { style: 'font-size: 0.85em; color: var(--text-muted); padding: 0 2px;' } });
        const customDateEndInput = customDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
        if (this.thoughtsFilterDateEnd) customDateEndInput.value = this.thoughtsFilterDateEnd;
        dateSel.addEventListener('change', (e) => { const val = (e.target as HTMLSelectElement).value; this.thoughtsFilterDate = val; if (val === 'custom') { customDateContainer.style.display = 'flex'; this.thoughtsFilterDateStart = customDateStartInput.value || moment().format('YYYY-MM-DD'); this.thoughtsFilterDateEnd = customDateEndInput.value || moment().format('YYYY-MM-DD'); } else customDateContainer.style.display = 'none'; this.updateReviewThoughtsList(); });
        customDateStartInput.addEventListener('change', () => { this.thoughtsFilterDateStart = customDateStartInput.value; this.updateReviewThoughtsList(); });
        customDateEndInput.addEventListener('change', () => { this.thoughtsFilterDateEnd = customDateEndInput.value; this.updateReviewThoughtsList(); });
        captureContainer = container.createEl('div', { attr: { style: `flex-shrink: 0; display: ${this.showCaptureInThoughts ? 'block' : 'none'};` } });
        this.renderCaptureMode(captureContainer, true);
        this.reviewThoughtsContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 5px 5px 200px 5px;' } });
        this.updateReviewThoughtsList();
    }

    async updateReviewTasksList(appendMore = false) {
        if (!this.reviewTasksContainer) return;
        if (!appendMore) { this.tasksOffset = 0; this.reviewTasksContainer.empty(); this.tasksRowContainer = null; }
        let tasks: TaskEntry[] = Array.from(this.plugin.taskIndex.values());
        if (this.tasksFilterStatus === 'pending') tasks = tasks.filter(e => e.status === 'open'); else if (this.tasksFilterStatus === 'completed') tasks = tasks.filter(e => e.status === 'done');
        if (this.tasksFilterContext.length > 0) tasks = tasks.filter(e => this.tasksFilterContext.every(ctx => e.context.includes(ctx)));
        const today = moment().locale('en').format('YYYY-MM-DD');
        if (this.tasksFilterDate === 'today') tasks = tasks.filter(e => e.due === today);
        else if (this.tasksFilterDate === 'today+overdue') tasks = tasks.filter(e => e.due === today || (e.due && e.due < today));
        else if (this.tasksFilterDate === 'overdue') tasks = tasks.filter(e => e.due && e.due < today);
        else if (this.tasksFilterDate === 'this-week') { const weekEnd = moment().locale('en').endOf('week').format('YYYY-MM-DD'); tasks = tasks.filter(e => e.due && e.due >= today && e.due <= weekEnd); }
        else if (this.tasksFilterDate === 'next-week') { const nextStart = moment().locale('en').add(1, 'week').startOf('week').format('YYYY-MM-DD'); const nextEnd = moment().locale('en').add(1, 'week').endOf('week').format('YYYY-MM-DD'); tasks = tasks.filter(e => e.due && e.due >= nextStart && e.due <= nextEnd); }
        else if (this.tasksFilterDate === 'no-due') tasks = tasks.filter(e => !e.due || e.due.trim() === '');
        else if (this.tasksFilterDate === 'custom' && this.tasksFilterDateStart && this.tasksFilterDateEnd) tasks = tasks.filter(e => e.due && e.due >= this.tasksFilterDateStart && e.due <= this.tasksFilterDateEnd);
        tasks.sort((a, b) => { if (a.status !== b.status) return a.status === 'open' ? -1 : 1; if (a.due && b.due) return a.due.localeCompare(b.due); if (a.due) return -1; if (b.due) return 1; return b.lastUpdate - a.lastUpdate; });
        if (!appendMore) { if (tasks.length === 0) { this.reviewTasksContainer.createEl('p', { text: 'No tasks found.', attr: { style: 'color: var(--text-muted);' } }); return; } this.tasksRowContainer = this.reviewTasksContainer.createEl('div'); }
        if (!this.tasksRowContainer) return;
        this.reviewTasksContainer.querySelector('.mina-load-more')?.remove();
        const PAGE_SIZE = 30; const page = tasks.slice(this.tasksOffset, this.tasksOffset + PAGE_SIZE);
        for (const entry of page) await this.renderTaskRow(entry, this.tasksRowContainer!);
        this.tasksOffset += page.length;
        if (this.tasksOffset < tasks.length) { const btn = this.reviewTasksContainer.createEl('button', { text: `Load more (${tasks.length - this.tasksOffset} remaining)`, cls: 'mina-load-more', attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' } }); btn.addEventListener('click', () => this.updateReviewTasksList(true)); }
    }

    async updateReviewThoughtsList(appendMore = false) {
        if (!this.reviewThoughtsContainer) return;
        if (!appendMore) {
            this.thoughtsOffset = 0; this.reviewThoughtsContainer.empty(); this._parsedRoots = [];
            let roots: ThoughtEntry[] = Array.from(this.plugin.thoughtIndex.values());
            if (this.thoughtsFilterContext.length > 0) roots = roots.filter(e => this.thoughtsFilterContext.every(ctx => e.context.includes(ctx)));
            if (!this.showPreviousThoughts) { const today = moment().locale('en').format('YYYY-MM-DD'); roots = roots.filter(e => e.day === today); }
            if (this.thoughtsFilterDate === 'today') { const today = moment().locale('en').format('YYYY-MM-DD'); roots = roots.filter(e => e.day === today); }
            else if (this.thoughtsFilterDate === 'last-5-days') { const cutoff = moment().subtract(4, 'days').startOf('day').format('YYYY-MM-DD'); roots = roots.filter(e => e.day >= cutoff); }
            else if (this.thoughtsFilterDate === 'this-week') { const weekStart = moment().startOf('week').valueOf(); roots = roots.filter(e => new Date(e.created.replace(' ', 'T')).getTime() >= weekStart); }
            else if (this.thoughtsFilterDate === 'custom' && this.thoughtsFilterDateStart && this.thoughtsFilterDateEnd) roots = roots.filter(e => e.day >= this.thoughtsFilterDateStart && e.day <= this.thoughtsFilterDateEnd);
            roots.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
            if (this.thoughtsFilterTodo) roots = roots.filter(e => /- \[ \]/.test(e.body + e.children.map(r => r.text).join('\n')));
            this._parsedRoots = roots;
            if (roots.length === 0) { this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts found.', attr: { style: 'color: var(--text-muted);' } }); return; }
            this.thoughtsRowContainer = this.reviewThoughtsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
        }
        if (!this.thoughtsRowContainer) return;
        this.reviewThoughtsContainer.querySelector('.mina-load-more')?.remove();
        const PAGE_SIZE = 20; const page = this._parsedRoots.slice(this.thoughtsOffset, this.thoughtsOffset + PAGE_SIZE);
        for (const entry of page) await this.renderThoughtRow(entry, this.thoughtsRowContainer!, entry.filePath, 0);
        this.thoughtsOffset += page.length;
        if (this.thoughtsOffset < this._parsedRoots.length) { const loadMoreBtn = this.reviewThoughtsContainer.createEl('button', { text: `Load more (${this._parsedRoots.length - this.thoughtsOffset} remaining)`, cls: 'mina-load-more', attr: { style: 'width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.85em;' } }); loadMoreBtn.addEventListener('click', () => this.updateReviewThoughtsList(true)); }
    }

    async handleFiles(files: FileList) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i]; if (!file || file.size === 0) continue;
            const isImage = file.type.startsWith('image/'); const hasValidName = file.name && file.name !== 'image.png' && file.name.trim().length > 0;
            if (isImage || hasValidName) {
                try {
                    const arrayBuffer = await file.arrayBuffer(); const extension = file.name && file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png'); const baseName = (file.name && file.name.includes('.')) ? file.name.substring(0, file.name.lastIndexOf('.')) : `Pasted image ${moment().format('YYYYMMDDHHmmss')}`;
                    const fileName = `${baseName}.${extension}`; const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(fileName);
                    const newFile = await this.plugin.app.vault.createBinary(attachmentPath, arrayBuffer); const isImgExt = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(extension?.toLowerCase() || '');
                    const markdownLink = isImgExt ? `![[${newFile.name}]]` : `[[${newFile.name}]]`; const textArea = this.containerEl.querySelector('textarea') as HTMLTextAreaElement;
                    if (textArea) { const startPos = textArea.selectionStart; const endPos = textArea.selectionEnd; textArea.value = textArea.value.substring(0, startPos) + markdownLink + textArea.value.substring(endPos); this.content = textArea.value; textArea.selectionStart = textArea.selectionEnd = startPos + markdownLink.length; new Notice(`Attached ${newFile.name}`); }
                } catch (err) { new Notice('Failed to save attachment.'); }
            }
        }
    }

    async renderTaskRow(entry: TaskEntry, container: HTMLElement, hideMetadata: boolean = false) {
        const isDone = entry.status === 'done';
        const row = container.createEl('div', { attr: { style: `display:flex; flex-direction:column; padding:8px; margin-bottom:4px; border-radius:6px; background:var(--background-secondary); opacity:${isDone ? '0.5' : '1'};` } });
        const topRow = row.createEl('div', { attr: { style: 'display:flex; gap:8px; align-items:flex-start;' } });
        const toggleContainer = topRow.createEl('label', { attr: { style: 'position:relative; display:inline-block; width:36px; height:20px; margin-right:4px; margin-top:2px; flex-shrink:0; cursor:pointer;' } });
        const cb = toggleContainer.createEl('input', { type: 'checkbox', attr: { style: 'opacity:0; width:0; height:0; position:absolute;' } }) as HTMLInputElement; cb.checked = isDone;
        const slider = toggleContainer.createEl('span', { attr: { style: `position:absolute; top:0; left:0; right:0; bottom:0; background-color:${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition:.3s; border-radius:20px;` } });
        const knob = toggleContainer.createEl('span', { attr: { style: `position:absolute; height:14px; width:14px; left:3px; bottom:3px; background-color:var(--text-on-accent,white); transition:.3s; border-radius:50%; transform:${isDone ? 'translateX(16px)' : 'translateX(0)'};` } });
        cb.addEventListener('change', async () => { const checked = cb.checked; slider.style.backgroundColor = checked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; knob.style.transform = checked ? 'translateX(16px)' : 'translateX(0)'; row.style.opacity = checked ? '0.5' : '1'; await this.plugin.toggleTaskStatus(entry.filePath, checked); this.updateReviewTasksList(); });
        const content = topRow.createEl('div', { attr: { style: 'flex:1; min-width:0;' } });
        const textEl = content.createEl('div', { attr: { style: `word-break:break-word; font-size:0.95em; line-height:1.4; ${isDone ? 'text-decoration:line-through; opacity:0.7;' : ''}` } });
        await MarkdownRenderer.render(this.plugin.app, entry.body || entry.title, textEl, entry.filePath, this);
        this.hookInternalLinks(textEl, entry.filePath); this.hookImageZoom(textEl);
        const firstP = textEl.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }

        const isTaskMode = this.activeTab === 'review-tasks' && this.isDedicated;
        if (isTaskMode && entry.due) {
            const dueM = moment(entry.due, 'YYYY-MM-DD', true);
            const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(moment().startOf('day'), 'day');
            const inlineDue = textEl.createSpan({ 
                text: `  📅 ${entry.due}`, 
                attr: { style: `font-size:0.8em; color:${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; ${isOverdue ? 'font-weight:600;' : ''}` } 
            });
            if (isOverdue) inlineDue.createSpan({ text: ' ⚠', attr: { style: 'font-size:0.8em; color:var(--text-error);' } });
        }

        const actions = topRow.createEl('div', { attr: { style: 'display:flex; gap:4px; align-items:flex-start; flex-shrink:0;' } });
        const editBtn = actions.createEl('span', { text: '✏️', attr: { style: 'cursor:pointer; font-size:0.85em; opacity:0.7; transition:opacity 0.2s;', title: 'Edit' } });
        const delBtn = actions.createEl('span', { text: '🗑️', attr: { style: 'cursor:pointer; font-size:0.85em; opacity:0.7; transition:opacity 0.2s;', title: 'Delete' } });
        editBtn.addEventListener('click', () => {
            new EditEntryModal(this.plugin.app, this.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), entry.due || null, true, async (newText, newCtxStr, newDue) => {
                const ctxArr = newCtxStr ? newCtxStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                await this.plugin.editTaskBody(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                this.updateReviewTasksList();
            }).open();
        });
        delBtn.addEventListener('click', () => { new ConfirmModal(this.plugin.app, 'Move this task to trash?', async () => { await this.plugin.deleteTaskFile(entry.filePath); this.updateReviewTasksList(); }).open(); });
        
        if (!hideMetadata && !isTaskMode) {
            const metaRow = row.createEl('div', { attr: { style: 'display:flex; justify-content:space-between; align-items:center; margin-top:5px; flex-wrap:wrap; gap:4px;' } });
            const dueLeft = metaRow.createEl('div', { attr: { style: 'display:flex; align-items:center; gap:4px;' } });
            if (entry.due) {
                const dueM = moment(entry.due, 'YYYY-MM-DD', true); const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(moment().startOf('day'), 'day');
                dueLeft.createEl('span', { text: `📅 ${entry.due}`, attr: { style: `font-size:0.8em; color:${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; ${isOverdue ? 'font-weight:600;' : ''}` } });
                if (isOverdue) dueLeft.createEl('span', { text: '⚠', attr: { style: 'font-size:0.8em; color:var(--text-error);' } });
            }
            const ctxRight = metaRow.createEl('div', { attr: { style: 'display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end;' } });
            for (const ctx of entry.context) ctxRight.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size:0.8em; color:var(--text-accent); background:var(--background-secondary-alt); padding:1px 6px; border-radius:4px;' } });
        }
    }

    async renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level: number = 0, hideAvatar: boolean = false, hideMetadata: boolean = false) {
        const isCollapsed = this.collapsedThreads.has(entry.filePath); const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24;
        const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 3px; padding-bottom: 3px; display: flex; align-items: flex-start; ${level > 0 ? `margin-left: ${level * indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 6px;` : ''}` } });
        
        // Icon Section
        const iconWidth = hideAvatar && level === 0 ? (entry.children.length > 0 ? 16 : 0) : 28;
        const iconSection = itemEl.createEl('div', { attr: { style: `width: ${iconWidth}px; margin-right: ${iconWidth > 0 ? 6 : 0}px; margin-top: 2px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2px;` } });
        
        if (level === 0 && entry.children.length > 0) {
            const collapseBtn = iconSection.createEl('div', { text: isCollapsed ? '▶' : '▼', attr: { style: 'cursor: pointer; font-size: 0.7em; opacity: 0.5; transition: 0.2s;' } });
            collapseBtn.addEventListener('click', () => { if (isCollapsed) this.collapsedThreads.delete(entry.filePath); else this.collapsedThreads.add(entry.filePath); this.updateReviewThoughtsList(); });
        }
        
        if (level === 0 && !hideAvatar) {
            const iconContainer = iconSection.createEl('div', { attr: { style: 'width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0;' } });
            const img = iconContainer.createEl('img', { attr: { style: 'width: 100%; height: 100%; display: block;' } }); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}`;
        }
        
        if (level === 0 && entry.children.length > 0 && !hideAvatar) iconSection.createEl('div', { text: `${entry.children.length}`, attr: { style: 'font-size: 0.65em; color: var(--text-accent); font-weight: bold; background: var(--background-secondary-alt); padding: 1px 4px; border-radius: 4px; margin-top: 2px;' } });
        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });
        const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; margin-bottom: 0; position: relative;' } });
        const cardWrapper = mainContentRow.createEl('div', { attr: { style: 'position: relative; flex-grow: 1; min-width: 0;' } });
        const renderTarget = cardWrapper.createEl('div', { cls: 'mina-card', attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word;' } });
        renderTarget.createEl('span', { text: `${entry.day} ${entry.created.split(' ')[1] || ''}`, attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.7; margin-left: 8px;' } });
        await MarkdownRenderer.render(this.plugin.app, entry.body, renderTarget, filePath, this);
        this.hookInternalLinks(renderTarget, filePath); this.hookImageZoom(renderTarget); this.hookCheckboxes(renderTarget, entry);
        const firstP = renderTarget.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }
        const actionsDiv = cardWrapper.createEl('div', { attr: { style: 'position: absolute; top: 2px; right: 4px; display: flex; gap: 6px; align-items: center; opacity: 0; transition: opacity 0.15s; background: var(--background-secondary); border-radius: 4px; padding: 1px 4px;' } });
        cardWrapper.addEventListener('mouseenter', () => actionsDiv.style.opacity = '1'); cardWrapper.addEventListener('mouseleave', () => actionsDiv.style.opacity = '0');
        
        const pinBtn = actionsDiv.createSpan({ 
            text: entry.pinned ? '📌' : '📍', 
            attr: { style: 'cursor: pointer; font-size: 0.8em;', title: entry.pinned ? 'Unpin' : 'Pin' } 
        });
        pinBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.plugin.toggleThoughtPin(entry.filePath, !entry.pinned);
        });

        const openBtn = actionsDiv.createSpan({ text: '🔗', attr: { style: 'cursor: pointer; font-size: 0.8em;', title: 'Open file' } }); openBtn.addEventListener('click', () => { this.plugin.app.workspace.openLinkText(entry.filePath, '', 'window'); });
        const replyBtn = actionsDiv.createSpan({ text: '↩️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        const convertBtn = actionsDiv.createSpan({ text: '📋', attr: { style: 'cursor: pointer; font-size: 0.8em;', title: 'Convert to task' } });
        const deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        deleteBtn.addEventListener('click', async () => { new ConfirmModal(this.plugin.app, 'Move this thought to trash?', async () => { await this.plugin.deleteThoughtFile(entry.filePath); this.updateReviewThoughtsList(); }).open(); });
        replyBtn.addEventListener('click', () => { this.replyToId = entry.filePath; this.replyToText = entry.body.length > 50 ? entry.body.substring(0, 50) + '...' : entry.body; this.showCaptureInThoughts = true; this.renderView(); setTimeout(() => { const ta = this.containerEl.querySelector('textarea'); if (ta) (ta as HTMLTextAreaElement).focus(); }, 100); });
        const startEdit = () => { new EditEntryModal(this.plugin.app, this.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), null, false, async (newText, newContextStr) => { const newContexts = newContextStr ? newContextStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : []; await this.plugin.editThoughtBody(entry.filePath, newText.replace(/<br>/g, '\n'), newContexts); this.updateReviewThoughtsList(); }).open(); };
        renderTarget.addEventListener('dblclick', startEdit); editBtn.addEventListener('click', startEdit);
        convertBtn.addEventListener('click', () => { new ConvertToTaskModal(this.plugin.app, entry.body, entry.context, async (dueDate) => { await this.plugin.createTaskFile(entry.body.replace(/<br>/g, '\n'), entry.context, dueDate || undefined); const updatedContexts = [...new Set([...entry.context, 'converted_to_tasks'])]; await this.plugin.editThoughtBody(entry.filePath, entry.body.replace(/<br>/g, '\n'), updatedContexts); new Notice('✅ Thought converted to task!'); this.updateReviewThoughtsList(); }).open(); });
        
        if (!hideMetadata && entry.context.length > 0) { 
            const ctxRow = renderTarget.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;' } }); for (const ctx of entry.context) ctxRow.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size: 0.75em; color: var(--text-accent); font-weight: 500; background-color: var(--background-secondary-alt); padding: 2px 6px; border-radius: 4px;' } }); 
        }
        
        if (level === 0 && !isCollapsed && entry.children.length > 0) { for (const reply of entry.children) await this.renderReplyRow(reply, entry, container); }
    }

    async renderReplyRow(reply: ReplyEntry, parent: ThoughtEntry, container: HTMLElement) {
        const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24; const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 3px; padding-bottom: 3px; display: flex; align-items: flex-start; margin-left: ${indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 6px;` } });
        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });
        const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; margin-bottom: 0; position: relative;' } });
        const cardWrapper = mainContentRow.createEl('div', { attr: { style: 'position: relative; flex-grow: 1; min-width: 0;' } });
        const renderTarget = cardWrapper.createEl('div', { cls: 'mina-card', attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word;' } });
        renderTarget.createEl('span', { text: `${reply.date} ${reply.time}`, attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.7; margin-left: 8px;' } });
        await MarkdownRenderer.render(this.plugin.app, reply.text, renderTarget, parent.filePath, this);
        this.hookInternalLinks(renderTarget, parent.filePath); this.hookImageZoom(renderTarget);
        const firstP = renderTarget.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }
        const actionsDiv = cardWrapper.createEl('div', { attr: { style: 'position: absolute; top: 2px; right: 4px; display: flex; gap: 6px; align-items: center; opacity: 0; transition: opacity 0.15s; background: var(--background-secondary); border-radius: 4px; padding: 1px 4px;' } });
        cardWrapper.addEventListener('mouseenter', () => actionsDiv.style.opacity = '1'); cardWrapper.addEventListener('mouseleave', () => actionsDiv.style.opacity = '0');
        const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        const deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
        deleteBtn.addEventListener('click', async () => { new ConfirmModal(this.plugin.app, 'Delete this reply?', async () => { await this.plugin.deleteReply(parent.filePath, reply.anchor); this.updateReviewThoughtsList(); }).open(); });
        const startReplyEdit = () => { new EditEntryModal(this.plugin.app, this.plugin, reply.text, '', null, false, async (newText) => { await this.plugin.editReply(parent.filePath, reply.anchor, newText.replace(/<br>/g, '\n')); this.updateReviewThoughtsList(); }).open(); };
        renderTarget.addEventListener('dblclick', startReplyEdit); editBtn.addEventListener('click', startReplyEdit);
    }

    async renderVoiceMode(container: HTMLElement) {
        const wrap = container.createEl('div', { attr: { style: 'padding: 12px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; padding-bottom: 200px;' } });
        const recorderSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 15px; background: var(--background-secondary); border-radius: 8px;' } });
        const recordButton = recorderSection.createEl('button', { attr: { style: 'width: 80px; height: 80px; border-radius: 50%; border: 4px solid var(--background-modifier-border); background-color: #c0392b; color: white; font-size: 1.2em; cursor: pointer; transition: all 0.2s;' } });
        recordButton.setText('●');
        const timerDisplay = recorderSection.createEl('div', { text: '00:00', attr: { style: 'font-family: monospace; font-size: 1.1em; color: var(--text-muted);' } });
        const statusDisplay = recorderSection.createEl('div', { text: 'Ready to record', attr: { style: 'font-size: 0.8em; color: var(--text-faint);' } });
        recordButton.addEventListener('click', () => { if (this.isRecording) this.stopRecording(); else this.startRecording(recordButton, timerDisplay, statusDisplay); });
        const listSection = wrap.createEl('div'); listSection.createEl('h4', { text: 'Your Voice Notes', attr: { style: 'margin-bottom: 10px;' } });
        const recordingsContainer = listSection.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        const voiceFolder = this.plugin.settings.voiceMemoFolder; const files = this.app.vault.getFiles().filter(f => f.path.startsWith(voiceFolder + '/') && (f.extension === 'webm' || f.extension === 'mp3' || f.extension === 'wav' || f.extension === 'm4a'));
        files.sort((a, b) => b.stat.ctime - a.stat.ctime);
        if (files.length === 0) recordingsContainer.createEl('p', { text: 'No voice notes recorded yet.', attr: { style: 'color: var(--text-muted); font-size: 0.9em;' } });
        else {
            for (const file of files) {
                const card = recordingsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--background-secondary); border-radius: 8px;' } });
                const header = card.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
                header.createEl('div', { text: moment(file.stat.ctime).format('YYYY-MM-DD HH:mm'), attr: { style: 'font-weight: 500;' } });
                const transcriptionStatusContainer = header.createEl('div'); this.getTranscriptionStatus(file).then(isTranscribed => { if (isTranscribed) transcriptionStatusContainer.createEl('span', { text: '✅ Transcribed', attr: { style: 'font-size: 0.8em; color: var(--text-success); background-color: var(--background-primary); padding: 3px 7px; border-radius: 4px;' } }); });
                card.createEl('audio', { attr: { controls: true, src: this.app.vault.getResourcePath(file), style: 'width: 100%; height: 35px;' } });
                const actions = card.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
                const transcribeBtn = actions.createEl('button', { text: 'Transcribe', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.85em; padding: 5px 12px; border-radius: 5px;' } });
                transcribeBtn.addEventListener('click', async () => {
                    transcribeBtn.setText('...'); transcribeBtn.disabled = true;
                    try { new Notice('Starting transcription...'); const transcription = await this.transcribeAudio(file); await this.plugin.createThoughtFile(`Transcription of [[${file.path}]]\n\n${transcription}`, ['#transcribed', '#voice-note']); new Notice('Transcription saved as thought.'); this.renderView(); }
                    catch (error) { new Notice('Transcription failed: ' + error.message); transcribeBtn.setText('Transcribe'); transcribeBtn.disabled = false; }
                });
                const deleteBtn = actions.createEl('button', { text: '🗑️', attr: { title: 'Delete', style: 'background: none; border: none; font-size: 1.2em; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 5px;' } });
                deleteBtn.addEventListener('click', () => { new ConfirmModal(this.app, 'Delete this voice note?', async () => { await this.app.vault.delete(file); new Notice('Voice note deleted.'); this.renderView(); }).open(); });
            }
        }
    }

    async startRecording(recordButton: HTMLElement, timerDisplay: HTMLElement, statusDisplay: HTMLElement) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            let mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
            let ext = mimeType === 'audio/webm' ? 'webm' : 'm4a';
            this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            this.audioChunks = []; this.isRecording = true;
            this.mediaRecorder.ondataavailable = event => this.audioChunks.push(event.data);
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: mimeType }); const arrayBuffer = await audioBlob.arrayBuffer();
                const folderPath = this.plugin.settings.voiceMemoFolder; if (!this.app.vault.getAbstractFileByPath(folderPath)) await this.app.vault.createFolder(folderPath);
                const filename = `voice-${moment().format('YYYYMMDD-HHmmss')}.${ext}`;
                await this.app.vault.createBinary(`${folderPath}/${filename}`, arrayBuffer);
                new Notice(`Voice note saved: ${filename}`); this.isRecording = false; stream.getTracks().forEach(track => track.stop()); this.renderView();
            };
            this.mediaRecorder.start(); statusDisplay.setText('Recording...'); recordButton.style.backgroundColor = '#e74c3c'; recordButton.setText('■');
            this.recordingStartTime = Date.now();
            this.recordingTimerInterval = setInterval(() => { const elapsed = Date.now() - this.recordingStartTime; const minutes = Math.floor(elapsed / 60000); const seconds = Math.floor((elapsed % 60000) / 1000); timerDisplay.setText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`); }, 1000);
        } catch (err) { new Notice('Microphone access denied.'); console.error(err); }
    }

    stopRecording() { if (this.mediaRecorder && this.isRecording) { this.mediaRecorder.stop(); this.isRecording = false; if (this.recordingTimerInterval) { clearInterval(this.recordingTimerInterval); this.recordingTimerInterval = null; } } }

    async getTranscriptionStatus(audioFile: TFile): Promise<boolean> {
        const backlinks = (this.app.metadataCache as any).getBacklinksForFile(audioFile);
        const thoughtFolder = this.plugin.settings.thoughtsFolder.trim();
        if(!backlinks || !backlinks.data) return false;
        for (const path in backlinks.data) if (path.startsWith(thoughtFolder)) return true;
        return false;
    }

    async transcribeAudio(file: TFile): Promise<string> {
        const { geminiApiKey, geminiModel, transcriptionLanguage } = this.plugin.settings; if (!geminiApiKey) throw new Error("Gemini API key is not set.");
        const audioBuffer = await this.app.vault.readBinary(file); let binary = ''; const bytes = new Uint8Array(audioBuffer); for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64Audio = btoa(binary); let mimeType = (file.extension === 'm4a' || file.extension === 'mp4') ? 'audio/mp4' : `audio/${file.extension}`;
        const requestBody = { "contents": [{ "parts": [{ "text": `First, transcribe the audio in its original language. Second, translate the transcribed text into ${transcriptionLanguage}.` }, { "inline_data": { "mime_type": mimeType, "data": base64Audio } }] }] };
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
        if (!response.ok) throw new Error((await response.json())?.error?.message || `HTTP Error: ${response.status}`);
        const data = await response.json(); const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Could not extract transcription.");
        return text.trim();
    }
}
