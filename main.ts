import { App, Plugin, PluginSettingTab, Setting, TFile, Notice, ItemView, WorkspaceLeaf, MarkdownRenderer, Platform } from 'obsidian';

export const VIEW_TYPE_MINA = "mina-view";

interface MinaSettings {
    captureFolder: string;
	captureFilePath: string;
    tasksFilePath: string;
	dateFormat: string;
    timeFormat: string;
    contexts: string[];
    selectedContexts: string[];
}

const DEFAULT_SETTINGS: MinaSettings = {
    captureFolder: '000 Bin',
	captureFilePath: 'mina_1.md',
    tasksFilePath: 'mina_2.md',
	dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    contexts: [], 
    selectedContexts: []
}

export default class MinaPlugin extends Plugin {
	settings: MinaSettings;
    settingsInitialized: boolean = false;

	async onload() {
		await this.loadSettings();

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

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_MINA);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            if (Platform.isMobile) {
                leaf = workspace.getRightLeaf(false);
            } else {
                leaf = workspace.getLeaf('window');
            }
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_MINA, active: true });
            }
        }
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

	async loadSettings() {
		const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS);

        if (!loadedData || Object.keys(loadedData).length === 0) {
            this.settings.contexts = ['work', 'personal', 'games', 'finances'];
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
            this.settingsInitialized = true;
        }

        if (this.settings.dateFormat === 'YYYY-MM-DD HH:mm') {
            this.settings.dateFormat = 'YYYY-MM-DD';
            this.settings.timeFormat = 'HH:mm';
        }
	}

	async saveSettings() {
        if (!this.settingsInitialized) return;
		await this.saveData(this.settings);
	}

    async appendCapture(content: string, contexts: string[], isTask: boolean, dueDate?: string) {
        const { vault } = this.app;
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

        // @ts-ignore
        const dateStr = window.moment().format(this.settings.dateFormat);
        // @ts-ignore
        const timeStr = window.moment().format(this.settings.timeFormat);
        
        const dateCol = `[[${dateStr}]]`;
        const timeCol = timeStr;
        const contextsCol = contexts.map(ctx => `#${ctx}`).join(' ');
        const sanitizedContent = content.replace(/\n/g, '<br>');
        
        let newRow = '';
        let header = '';
        let separator = '';

        if (isTask) {
            const dueDateCol = dueDate ? `[[${dueDate}]]` : '';
            // Task Table Structure: | Status | Date | Time | Due Date | Task | Context |
            newRow = `| [ ] | ${dateCol} | ${timeCol} | ${dueDateCol} | ${sanitizedContent} | ${contextsCol} |`;
            header = `| Status | Date | Time | Due Date | Task | Context |`;
            separator = `| :---: | --- | --- | --- | --- | --- |`;
        } else {
            // Thought Table Structure: | Date | Time | Thought | Context |
            newRow = `| ${dateCol} | ${timeCol} | ${sanitizedContent} | ${contextsCol} |`;
            header = `| Date | Time | Thought | Context |`;
            separator = `| --- | --- | --- | --- |`;
        }

        try {
            const currentContent = await vault.read(file);
            const lines = currentContent.split('\n');
            let newContent = '';
            if (lines.length < 2 || !lines[0].includes('Date') || !lines[1].includes('---')) {
                newContent = header + '\n' + separator + '\n' + newRow + (currentContent ? '\n' + currentContent : '');
            } else {
                lines.splice(2, 0, newRow);
                newContent = lines.join('\n');
            }
            await vault.modify(file, newContent);
            new Notice('Synced successfully!');
        } catch (error) {
            new Notice('Error writing to file');
        }
    }
}

class MinaView extends ItemView {
    plugin: MinaPlugin;
    content: string;
    isTask: boolean;
    dueDate: string; // YYYY-MM-DD
    activeTab: 'capture' | 'review-tasks' | 'review-thoughts' = 'capture';
    
    // Tasks Review Filters
    tasksFilterStatus: 'all' | 'pending' | 'completed' = 'all';
    tasksFilterContext: string = 'all';
    tasksFilterDate: 'all' | 'today' | 'this-week' = 'all';

    // Thoughts Review Filters
    thoughtsFilterContext: string = 'all';
    thoughtsFilterDate: 'all' | 'today' | 'this-week' = 'all';

    thoughtsPreviewContainer: HTMLElement;
    tasksPreviewContainer: HTMLElement;
    reviewTasksContainer: HTMLElement;
    reviewThoughtsContainer: HTMLElement;
    selectedContexts: string[];

    constructor(leaf: WorkspaceLeaf, plugin: MinaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.content = '';
        this.isTask = false;
        // @ts-ignore
        this.dueDate = window.moment().format('YYYY-MM-DD');
        this.selectedContexts = Array.isArray(this.plugin.settings.selectedContexts) ? [...this.plugin.settings.selectedContexts] : [];
    }

    getViewType() { return VIEW_TYPE_MINA; }
    getDisplayText() { return "MINA V1"; }
    getIcon() { return "brain"; }

    async onOpen() {
        this.renderView();
    }

    renderView() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        if (Platform.isMobile) {
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.height = '100%';
            container.style.overflow = 'hidden';
        }

        // --- Navigation Tabs ---
        const nav = container.createEl('div', { attr: { style: 'display: flex; gap: 5px; margin-bottom: 15px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 10px; flex-shrink: 0;' } });
        
        const captureTab = nav.createEl('button', { 
            text: 'Capture', 
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'capture' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` } 
        });
        captureTab.addEventListener('click', () => { this.activeTab = 'capture'; this.renderView(); });

        const reviewTasksTab = nav.createEl('button', { 
            text: 'Tasks', 
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'review-tasks' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` } 
        });
        reviewTasksTab.addEventListener('click', () => { this.activeTab = 'review-tasks'; this.renderView(); });

        const reviewThoughtsTab = nav.createEl('button', { 
            text: 'Thoughts', 
            attr: { style: `flex: 1; font-size: 0.85em; padding: 5px 2px; ${this.activeTab === 'review-thoughts' ? 'background-color: var(--interactive-accent); color: var(--text-on-accent);' : ''}` } 
        });
        reviewThoughtsTab.addEventListener('click', () => { this.activeTab = 'review-thoughts'; this.renderView(); });

        if (this.activeTab === 'capture') {
            this.renderCaptureMode(container);
        } else if (this.activeTab === 'review-tasks') {
            this.renderReviewTasksMode(container);
        } else {
            this.renderReviewThoughtsMode(container);
        }
    }

    renderCaptureMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0;' } });
        headerSection.createEl('h2', {text: 'Capture'});

        const inputSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; margin-bottom: 10px;' } });
        const textArea = inputSection.createEl('textarea', {
            attr: {
                placeholder: 'Enter your thought, task, or paste/drop an image...',
                rows: '5',
                style: 'width: 100%; font-family: var(--font-text); resize: vertical;'
            }
        });
        textArea.value = this.content;
        
        if (Platform.isMobile) {
            textArea.addEventListener('focus', () => {
                setTimeout(() => { textArea.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
            });
        }

        textArea.addEventListener('input', (e) => { this.content = (e.target as HTMLTextAreaElement).value; });

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

        // Contexts
        const contextsDiv = container.createEl('div', { attr: { style: 'margin-bottom: 15px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; flex-shrink: 0;' } });
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

        const controlsDiv = container.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 10px;' } });
        
        const taskToggleDiv = controlsDiv.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px;' } });
        const taskCheckbox = taskToggleDiv.createEl('input', { type: 'checkbox', attr: { id: 'is-task-checkbox' } });
        taskCheckbox.checked = this.isTask;
        taskToggleDiv.createEl('label', { attr: { for: 'is-task-checkbox', style: 'margin-left: 5px;' }, text: 'As Task' });

        // Due Date Picker (only for tasks)
        const datePicker = taskToggleDiv.createEl('input', { 
            type: 'date', 
            attr: { style: `font-size: 0.8em; padding: 2px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); ${this.isTask ? '' : 'display: none;'}` } 
        });
        datePicker.value = this.dueDate;
        datePicker.addEventListener('change', (e) => { this.dueDate = (e.target as HTMLInputElement).value; });

        taskCheckbox.addEventListener('change', (e) => { 
            this.isTask = (e.target as HTMLInputElement).checked; 
            datePicker.style.display = this.isTask ? 'inline-block' : 'none';
        });

        const submitBtn = controlsDiv.createEl('button', { text: 'Sync', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent);' } });
        const submitAction = async () => {
            if (this.content.trim().length > 0) {
                await this.plugin.appendCapture(this.content.trim(), this.selectedContexts, this.isTask, this.isTask ? this.dueDate : undefined);
                this.content = ''; textArea.value = '';
                await this.updatePreview();
            } else { new Notice('Please enter some text'); }
        };
        submitBtn.addEventListener('click', submitAction);
        textArea.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); await submitAction(); } });

        const previewRoot = container.createEl('div', { attr: { style: `margin-top: 10px; flex-grow: 1; overflow-y: auto;` } });
        const tasksSection = previewRoot.createEl('details', { attr: { open: 'true', style: 'margin-bottom: 15px;' } });
        tasksSection.createEl('summary', { text: 'Recent Tasks', attr: { style: 'font-size: 1.1em; color: var(--text-normal); cursor: pointer;' } });
        this.tasksPreviewContainer = tasksSection.createEl('div', { attr: { style: 'font-size: 0.9em; padding: 10px; background-color: var(--background-secondary); border-radius: 5px; border: 1px solid var(--background-modifier-border);' } });

        const thoughtsSection = previewRoot.createEl('details', { attr: { open: 'true' } });
        thoughtsSection.createEl('summary', { text: 'Recent Thoughts', attr: { style: 'font-size: 1.1em; color: var(--text-normal); cursor: pointer;' } });
        this.thoughtsPreviewContainer = thoughtsSection.createEl('div', { attr: { style: 'font-size: 0.9em; padding: 10px; background-color: var(--background-secondary); border-radius: 5px; border: 1px solid var(--background-modifier-border);' } });

        this.updatePreview();
    }

    renderReviewTasksMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0;' } });
        headerSection.createEl('h2', {text: 'Review Tasks'});

        const filterBar = container.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; flex-shrink: 0; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
        
        const statusSel = filterBar.createEl('select');
        [['all', 'All Status'], ['pending', 'Pending'], ['completed', 'Completed']].forEach(([val, label]) => {
            const opt = statusSel.createEl('option', { value: val, text: label });
            if (this.tasksFilterStatus === val) opt.selected = true;
        });
        statusSel.addEventListener('change', (e) => { this.tasksFilterStatus = (e.target as HTMLSelectElement).value as any; this.updateReviewTasksList(); });

        const contextSel = filterBar.createEl('select');
        contextSel.createEl('option', { value: 'all', text: 'All Contexts' });
        this.plugin.settings.contexts.forEach(ctx => {
            const opt = contextSel.createEl('option', { value: ctx, text: `#${ctx}` });
            if (this.tasksFilterContext === ctx) opt.selected = true;
        });
        contextSel.addEventListener('change', (e) => { this.tasksFilterContext = (e.target as HTMLSelectElement).value; this.updateReviewTasksList(); });

        const dateSel = filterBar.createEl('select');
        [['all', 'All Dates'], ['today', 'Today'], ['this-week', 'This Week']].forEach(([val, label]) => {
            const opt = dateSel.createEl('option', { value: val, text: label });
            if (this.tasksFilterDate === val) opt.selected = true;
        });
        dateSel.addEventListener('change', (e) => { this.tasksFilterDate = (e.target as HTMLSelectElement).value as any; this.updateReviewTasksList(); });

        this.reviewTasksContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 5px;' } });
        this.updateReviewTasksList();
    }

    renderReviewThoughtsMode(container: HTMLElement) {
        const headerSection = container.createEl('div', { attr: { style: 'flex-shrink: 0;' } });
        headerSection.createEl('h2', {text: 'Review Thoughts'});

        const filterBar = container.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; flex-shrink: 0; background-color: var(--background-secondary); padding: 10px; border-radius: 5px;' } });
        
        const contextSel = filterBar.createEl('select');
        contextSel.createEl('option', { value: 'all', text: 'All Contexts' });
        this.plugin.settings.contexts.forEach(ctx => {
            const opt = contextSel.createEl('option', { value: ctx, text: `#${ctx}` });
            if (this.thoughtsFilterContext === ctx) opt.selected = true;
        });
        contextSel.addEventListener('change', (e) => { this.thoughtsFilterContext = (e.target as HTMLSelectElement).value; this.updateReviewThoughtsList(); });

        const dateSel = filterBar.createEl('select');
        [['all', 'All Dates'], ['today', 'Today'], ['this-week', 'This Week']].forEach(([val, label]) => {
            const opt = dateSel.createEl('option', { value: val, text: label });
            if (this.thoughtsFilterDate === val) opt.selected = true;
        });
        dateSel.addEventListener('change', (e) => { this.thoughtsFilterDate = (e.target as HTMLSelectElement).value as any; this.updateReviewThoughtsList(); });

        this.reviewThoughtsContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 5px;' } });
        this.updateReviewThoughtsList();
    }

    async updateReviewTasksList() {
        if (!this.reviewTasksContainer) return;
        this.reviewTasksContainer.empty();
        
        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = this.plugin.settings.tasksFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;
        
        if (!file) {
            this.reviewTasksContainer.createEl('p', { text: 'No tasks found.', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        try {
            const content = await vault.read(file);
            const lines = content.split('\n');
            let count = 0;

            // @ts-ignore
            const todayMoment = window.moment().startOf('day');
            // @ts-ignore
            const startOfWeek = window.moment().startOf('week');
            // @ts-ignore
            const endOfWeek = window.moment().endOf('week');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('|') && !line.includes('---') && !line.includes('| Date |') && !line.includes('| Status |')) {
                    const parts = line.split('|');
                    if (parts.length < 5) continue;

                    const statusPart = parts[1].trim();
                    const isDone = statusPart.includes('x') || statusPart.includes('X');
                    
                    if (this.tasksFilterStatus === 'pending' && isDone) continue;
                    if (this.tasksFilterStatus === 'completed' && !isDone) continue;

                    // Determine Date Column: Index 4 (Due Date) if 6-column table, else Index 2 (Capture Date)
                    let dateRaw = '';
                    if (parts.length >= 8) {
                        dateRaw = parts[4]?.trim().replace(/[\[\]]/g, '');
                        if (!dateRaw) dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                    } else {
                        dateRaw = parts[2]?.trim().replace(/[\[\]]/g, '');
                    }

                    if (this.tasksFilterDate !== 'all') {
                        if (!dateRaw) continue;
                        // @ts-ignore
                        let taskDate = window.moment(dateRaw, ['YYYY-MM-DD', this.plugin.settings.dateFormat], true);
                        
                        if (!taskDate.isValid()) continue;
                        
                        if (this.tasksFilterDate === 'today') {
                            if (!taskDate.isSame(todayMoment, 'day')) continue;
                        } else if (this.tasksFilterDate === 'this-week') {
                            if (!taskDate.isBetween(startOfWeek, endOfWeek, 'day', '[]')) continue;
                        }
                    }

                    const contextPart = parts[parts.length - 2]?.trim() || '';
                    if (this.tasksFilterContext !== 'all' && !contextPart.includes(`#${this.tasksFilterContext}`)) continue;

                    await this.renderTaskRow(line, i, this.reviewTasksContainer, file.path, true);
                    count++;
                }
            }
            if (count === 0) this.reviewTasksContainer.createEl('p', { text: 'No tasks matching filters.', attr: { style: 'color: var(--text-muted);' } });
        } catch (error) {
            this.reviewTasksContainer.createEl('p', { text: 'Error loading tasks.', attr: { style: 'color: var(--text-error);' } });
        }
    }

    async updateReviewThoughtsList() {
        if (!this.reviewThoughtsContainer) return;
        this.reviewThoughtsContainer.empty();
        
        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = this.plugin.settings.captureFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;
        
        if (!file) {
            this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts found.', attr: { style: 'color: var(--text-muted);' } });
            return;
        }

        try {
            const content = await vault.read(file);
            const lines = content.split('\n');
            let count = 0;

            // @ts-ignore
            const today = window.moment().format('YYYY-MM-DD');
            // @ts-ignore
            const startOfWeek = window.moment().startOf('week');
            // @ts-ignore
            const endOfWeek = window.moment().endOf('week');

            const tableEl = this.reviewThoughtsContainer.createEl('table', { attr: { style: 'width: 100%; border-collapse: collapse; font-size: 0.9em;' } });
            const thead = tableEl.createEl('thead');
            const headerRow = thead.createEl('tr');
            ['Date', 'Time', 'Thought', 'Context'].forEach(h => {
                headerRow.createEl('th', { text: h, attr: { style: 'border-bottom: 2px solid var(--background-modifier-border); text-align: left; padding: 4px;' } });
            });
            const tbodyEl = tableEl.createEl('tbody');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('|') && !line.includes('---') && !line.includes('| Date |')) {
                    const parts = line.split('|');
                    const dateRaw = parts[1].trim().replace(/\[\[|\]\]/g, ''); 
                    const contextPart = parts[4]?.trim() || '';

                    if (this.thoughtsFilterContext !== 'all' && !contextPart.includes(`#${this.thoughtsFilterContext}`)) continue;

                    if (this.thoughtsFilterDate !== 'all') {
                        // @ts-ignore
                        const thoughtDate = window.moment(dateRaw, this.plugin.settings.dateFormat);
                        if (this.thoughtsFilterDate === 'today' && dateRaw !== today) continue;
                        if (this.thoughtsFilterDate === 'this-week' && !thoughtDate.isBetween(startOfWeek, endOfWeek, 'day', '[]')) continue;
                    }

                    await this.renderThoughtRow(line, i, tbodyEl, file.path);
                    count++;
                }
            }
            if (count === 0) {
                this.reviewThoughtsContainer.empty();
                this.reviewThoughtsContainer.createEl('p', { text: 'No thoughts matching filters.', attr: { style: 'color: var(--text-muted);' } });
            }
        } catch (error) {
            this.reviewThoughtsContainer.createEl('p', { text: 'Error loading thoughts.', attr: { style: 'color: var(--text-error);' } });
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
                    const baseName = (file.name && file.name.includes('.')) ? file.name.substring(0, file.name.lastIndexOf('.')) : `Pasted image ${window.moment().format('YYYYMMDDHHmmss')}`;
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

    async updateLineInFile(isTask: boolean, lineIndex: number, newText: string) {
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
                lines[lineIndex] = newText;
                await vault.modify(file, lines.join('\n'));
                new Notice('Updated successfully');
            }
        } catch (error) { new Notice('Error updating file.'); }
    }

    async updatePreview() {
        if (this.activeTab === 'capture') {
            await this.renderFilePreview(false, this.thoughtsPreviewContainer);
            await this.renderFilePreview(true, this.tasksPreviewContainer);
        } else if (this.activeTab === 'review-tasks') {
            await this.updateReviewTasksList();
        } else {
            await this.updateReviewThoughtsList();
        }
    }

    async renderFilePreview(isTask: boolean, container: HTMLElement) {
        if (!container) return;
        container.empty();
        const { vault } = this.plugin.app;
        const folderPath = this.plugin.settings.captureFolder.trim();
        const fileName = isTask ? this.plugin.settings.tasksFilePath.trim() : this.plugin.settings.captureFilePath.trim();
        const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
        const file = vault.getAbstractFileByPath(fullPath) as TFile;
        
        if (!file) {
            container.createEl('p', { text: 'No captures yet.', attr: { style: 'color: var(--text-muted); margin: 0;' } });
            return;
        }

        try {
            const content = await vault.read(file);
            const lines = content.split('\n');
            let count = 0;
            let tbodyEl: HTMLElement | null = null;

            if (!isTask) {
                const tableEl = container.createEl('table', { attr: { style: 'width: 100%; border-collapse: collapse; font-size: 0.9em;' } });
                const thead = tableEl.createEl('thead');
                const headerRow = thead.createEl('tr');
                ['Date', 'Time', 'Thought', 'Context'].forEach(h => {
                    headerRow.createEl('th', { text: h, attr: { style: 'border-bottom: 2px solid var(--background-modifier-border); text-align: left; padding: 4px;' } });
                });
                tbodyEl = tableEl.createEl('tbody');
            }

            for (let i = 0; i < lines.length; i++) {
                if (count >= 15) break;
                const line = lines[i];
                if (line.trim().startsWith('|') && !line.includes('---') && !line.includes('| Date |') && !line.includes('| Status |')) {
                    if (isTask) await this.renderTaskRow(line, i, container, file.path);
                    else await this.renderThoughtRow(line, i, tbodyEl!, file.path);
                    count++;
                }
            }
            if (count === 0) {
                container.empty();
                container.createEl('p', { text: 'No captures yet.', attr: { style: 'color: var(--text-muted); margin: 0;' } });
            }
        } catch (error) { container.createEl('p', { text: 'Error loading preview.', attr: { style: 'color: var(--text-error); margin: 0;' } }); }
    }

    async renderTaskRow(line: string, lineIndex: number, container: HTMLElement, filePath: string, isReview: boolean = false) {
        const el = container.createEl('div', {
            attr: { style: 'margin-bottom: 8px; border-bottom: 1px solid var(--background-modifier-border-hover); padding-bottom: 5px; display: flex; align-items: flex-start;' }
        });

        const parts = line.split('|');
        // Structure: | Status | Date | Time | Due Date | Task | Context |
        const isLegacy = parts.length === 6; // Old tasks only had 5 columns (plus empty strings at start/end)
        
        const statusPart = parts[1].trim();
        const cb = el.createEl('input', { type: 'checkbox', attr: { style: 'margin-right: 8px; margin-top: 5px; cursor: pointer;' } });
        if (statusPart.includes('x') || statusPart.includes('X')) cb.checked = true;
        
        cb.addEventListener('change', async (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            parts[1] = isChecked ? ' [x] ' : ' [ ] ';
            await this.updateLineInFile(true, lineIndex, parts.join('|'));
            if (isReview) await this.updateReviewTasksList();
        });

        let textToRender = '';
        let metaText = '';

        if (parts.length >= 7) {
            // New structure: | Status | Date | Time | Due Date | Task | Context |
            const dueDate = parts[4].trim();
            textToRender = parts[5]?.trim() || '';
            metaText = `${parts[2].trim()} ${parts[3].trim()} ${dueDate ? `| Due: ${dueDate}` : ''} | ${parts[6]?.trim() || ''}`;
        } else {
            // Legacy structure: | Status | Date | Time | Task | Context |
            textToRender = parts[4]?.trim() || '';
            metaText = `${parts[2].trim()} ${parts[3].trim()} | ${parts[5]?.trim() || ''}`;
        }

        const contentDiv = el.createEl('div', { attr: { style: 'flex-grow: 1;' } });
        contentDiv.createEl('div', { text: metaText, attr: { style: 'font-size: 0.8em; color: var(--text-muted); margin-bottom: 3px;' } });
        const renderTarget = contentDiv.createEl('div', { attr: { style: 'cursor: text;' } });
        await MarkdownRenderer.render(this.plugin.app, textToRender, renderTarget, filePath, this);

        renderTarget.addEventListener('dblclick', () => {
            renderTarget.empty();
            const input = renderTarget.createEl('textarea', {
                text: line.replace(/<br>/g, '\n'),
                attr: { style: 'width: 100%; min-height: 60px; font-family: var(--font-text); background: transparent; border: 1px solid var(--background-modifier-border);' }
            });
            input.focus();
            input.addEventListener('blur', async () => {
                const newRaw = input.value.replace(/\n/g, '<br>');
                if (newRaw !== line) await this.updateLineInFile(true, lineIndex, newRaw);
                await this.updatePreview();
            });
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.blur(); } });
        });
    }

    async renderThoughtRow(line: string, lineIndex: number, tbody: HTMLElement, filePath: string) {
        const tr = tbody.createEl('tr', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border-hover);' } });
        const parts = line.split('|');
        tr.createEl('td', { text: parts[1].trim(), attr: { style: 'padding: 4px; white-space: nowrap;' } });
        tr.createEl('td', { text: parts[2].trim(), attr: { style: 'padding: 4px; white-space: nowrap;' } });
        const thoughtCell = tr.createEl('td', { attr: { style: 'padding: 4px; cursor: text;' } });
        tr.createEl('td', { text: parts[4].trim(), attr: { style: 'padding: 4px;' } });

        await MarkdownRenderer.render(this.plugin.app, parts[3].trim(), thoughtCell, filePath, this);

        thoughtCell.addEventListener('dblclick', () => {
            thoughtCell.empty();
            const input = thoughtCell.createEl('textarea', {
                text: line.replace(/<br>/g, '\n'),
                attr: { style: 'width: 100%; min-height: 60px; font-family: var(--font-text); background: transparent; border: 1px solid var(--background-modifier-border);' }
            });
            input.focus();
            input.addEventListener('blur', async () => {
                const newRaw = input.value.replace(/\n/g, '<br>');
                if (newRaw !== line) await this.updateLineInFile(false, lineIndex, newRaw);
                await this.updatePreview();
            });
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.blur(); } });
        });
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
        new Setting(containerEl).setName('Capture Contexts').addText(text => text.setPlaceholder('work, personal...').setValue(this.plugin.settings.contexts.join(', ')).onChange(async (value) => { this.plugin.settings.contexts = value.split(',').map(c => c.trim()).filter(c => c.length > 0); await this.plugin.saveSettings(); }));
	}
}