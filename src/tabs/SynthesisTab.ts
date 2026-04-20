import { moment, Platform, MarkdownRenderer, TFile, Notice } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry } from '../types';
import { BaseTab } from "./BaseTab";
import { InsightTitleModal } from '../modals/InsightTitleModal';
import { isTablet } from '../utils';


export class SynthesisTab extends BaseTab {
    private filterQuery = '';

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderSynthesisMode(container);
    }

    async renderSynthesisMode(container: HTMLElement) {
        container.empty();

        const wrap = container.createEl('div', { cls: 'mina-synthesis-shell' });
        const isPhone = Platform.isMobile && !isTablet();

        // Sidebar (Unprocessed Thought Feed)
        const showSidebar = !isPhone || !this.view.activeMasterNote;
        const sidebar = wrap.createEl('div', { cls: `mina-synthesis-sidebar${showSidebar ? '' : ' is-hidden'}` });

        // Sidebar Header
        const sideHeader = sidebar.createEl('div', { cls: 'mina-synthesis-side-header' });
        this.renderHomeIcon(sideHeader);
        const headerLabel = sideHeader.createEl('div', { cls: 'mina-synthesis-side-title-group' });
        headerLabel.createEl('h3', { text: 'Synthesis Feed', cls: 'mina-synthesis-side-title' });

        // Get unprocessed thoughts
        const allUnprocessed = Array.from(this.index.thoughtIndex.values())
            .filter(t => !t.project && !t.synthesized)
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        // Count badge
        headerLabel.createEl('span', { text: String(allUnprocessed.length), cls: 'mina-synthesis-count-badge' });

        // Search input
        const searchWrap = sidebar.createEl('div', { cls: 'mina-synthesis-search-wrap' });
        const searchInput = searchWrap.createEl('input', {
            type: 'text',
            cls: 'mina-synthesis-search',
            attr: { placeholder: 'Filter thoughts…' }
        });
        searchInput.value = this.filterQuery;
        searchInput.addEventListener('input', () => {
            this.filterQuery = searchInput.value;
            this.renderThoughtList(sideScroll, this.getFilteredThoughts(allUnprocessed));
        });

        // Scrollable thought list
        const sideScroll = sidebar.createEl('div', { cls: 'mina-synthesis-side-scroll' });
        this.renderThoughtList(sideScroll, this.getFilteredThoughts(allUnprocessed));

        // Main Canvas
        const showMain = !isPhone || !!this.view.activeMasterNote;
        const main = wrap.createEl('div', { cls: `mina-synthesis-main${showMain ? '' : ' is-hidden'}` });

        // Main Header
        const mainHeader = main.createEl('div', { cls: 'mina-synthesis-main-header' });

        if (isPhone && this.view.activeMasterNote) {
            const backBtn = mainHeader.createEl('button', { text: '←', cls: 'mina-synthesis-back-btn' });
            backBtn.addEventListener('click', () => { this.view.activeMasterNote = null; this.view.renderView(); });
        }

        const titleStack = mainHeader.createEl('div', { cls: 'mina-synthesis-title-stack' });
        titleStack.createEl('h2', {
            text: this.view.activeMasterNote ? this.view.activeMasterNote.basename : 'Canvas',
            cls: 'mina-synthesis-canvas-title'
        });
        if (this.view.activeMasterNote) {
            titleStack.createEl('span', { text: 'Master Insight Note', cls: 'mina-synthesis-canvas-badge' });
        }

        const actions = mainHeader.createEl('div', { cls: 'mina-synthesis-actions' });
        const newBtn = actions.createEl('button', { text: '+ New Insight', cls: 'mina-synthesis-new-btn' });

        newBtn.addEventListener('click', () => {
            new InsightTitleModal(this.app, async (name) => {
                if (!name) return;
                try {
                    const folder = this.settings.newNoteFolder.trim() || '000 Bin';
                    const filename = `${name}.md`;
                    const fullPath = folder && folder !== '/' ? `${folder}/${filename}` : filename;
                    const existingFile = this.app.vault.getAbstractFileByPath(fullPath);

                    if (existingFile instanceof TFile) {
                        this.view.activeMasterNote = existingFile;
                        this.view.renderView();
                        new Notice(`Switched to: ${existingFile.basename}`);
                        return;
                    }

                    const content = `---\narea: INSIGHT\ncreated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n---\n\n# ${name}\n\n`;
                    const file = await this.vault.createFile(folder, filename, content);
                    this.view.activeMasterNote = file;
                    this.view.renderView();
                    new Notice(`Ready: ${file.basename}`);
                } catch (e) { new Notice(`Error: ${e.message}`); }
            }).open();
        });

        // Main Content Area
        const content = main.createEl('div', { cls: 'mina-synthesis-canvas' });

        if (this.view.activeMasterNote) {
            const rawContent = await this.app.vault.read(this.view.activeMasterNote);
            const renderTarget = content.createEl('div', { cls: 'mina-insight-content' });
            await MarkdownRenderer.render(this.app, rawContent, renderTarget, this.view.activeMasterNote.path, this.view);
            this.hookInternalLinks(renderTarget, this.view.activeMasterNote.path);
            this.hookImageZoom(renderTarget);

            // Drop Zone
            renderTarget.addEventListener('dragover', (e) => e.preventDefault());
            renderTarget.addEventListener('drop', async (e) => {
                e.preventDefault();
                const jsonData = e.dataTransfer?.getData('application/mina-thought');
                if (!jsonData || !this.view.activeMasterNote) return;
                let parsed: { filePath?: string; content?: string };
                try { parsed = JSON.parse(jsonData); } catch { return; }
                const { filePath, content: appendText } = parsed;
                if (!filePath || typeof filePath !== 'string') return;
                const fileCheck = this.app.vault.getAbstractFileByPath(filePath);
                if (!fileCheck || !(fileCheck instanceof TFile)) {
                    new Notice('MINA: Invalid drag source');
                    return;
                }
                const safeText = (appendText || '').slice(0, 50000);
                const existing = await this.app.vault.read(this.view.activeMasterNote);
                await this.app.vault.modify(this.view.activeMasterNote, existing.trimEnd() + '\n\n' + safeText);
                await this.vault.markAsSynthesized(filePath);
                this.view.renderView();
                new Notice('Thought Synthesized.');
            });
        } else {
            const empty = content.createEl('div', { cls: 'mina-synthesis-empty' });
            empty.createSpan({ text: '🧠', cls: 'mina-synthesis-empty-icon' });
            empty.createSpan({ text: 'Select a note to start building knowledge.', cls: 'mina-synthesis-empty-text' });
        }
    }

    private getFilteredThoughts(thoughts: ThoughtEntry[]): ThoughtEntry[] {
        const q = this.filterQuery.toLowerCase().trim();
        if (!q) return thoughts.slice(0, 30);
        return thoughts
            .filter(t => t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q))
            .slice(0, 30);
    }

    private renderThoughtList(container: HTMLElement, thoughts: ThoughtEntry[]) {
        container.empty();
        if (thoughts.length === 0) {
            const empty = container.createEl('div', { cls: 'mina-synthesis-side-empty' });
            empty.createSpan({ text: '🌊' });
            empty.createSpan({ text: this.filterQuery ? 'No matches.' : 'Inbox clear.' });
            return;
        }
        for (const thought of thoughts) {
            const card = container.createEl('div', { cls: 'mina-card mina-synthesis-thought-card', attr: { draggable: 'true' } });

            // Timestamp row
            const meta = card.createEl('div', { cls: 'mina-synthesis-thought-meta' });
            meta.createEl('span', { text: moment(thought.lastThreadUpdate).fromNow(), cls: 'mina-synthesis-thought-time' });

            // Title
            card.createEl('div', { text: thought.title, cls: 'mina-synthesis-thought-title' });

            // Body preview
            const preview = thought.body.length > 120 ? thought.body.substring(0, 120) + '…' : thought.body;
            card.createEl('div', { text: preview, cls: 'mina-synthesis-thought-body' });

            // Action row
            const actionRow = card.createEl('div', { cls: 'mina-synthesis-thought-actions' });
            const processBtn = actionRow.createEl('button', { text: '✓ Process', cls: 'mina-synthesis-process-btn' });
            processBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.vault.markAsSynthesized(thought.filePath);
                new Notice('Marked as processed.');
                this.view.renderView();
            });

            // Drag handlers
            card.addEventListener('dragstart', (e) => {
                if (e.dataTransfer) {
                    e.dataTransfer.setData('application/mina-thought', JSON.stringify({ filePath: thought.filePath, content: `[[${thought.filePath}|${thought.title}]]\n\n${thought.body}` }));
                    card.addClass('is-dragging');
                }
            });
            card.addEventListener('dragend', () => card.removeClass('is-dragging'));

            card.addEventListener('click', () => {
                if (this.view.activeMasterNote) this.appendToMasterNote(thought);
                else new Notice('Select or create a Master Note first.');
            });
        }
    }

    private async appendToMasterNote(thought: ThoughtEntry) {
        if (!this.view.activeMasterNote) return;
        const existing = await this.app.vault.read(this.view.activeMasterNote);
        const data = `[[${thought.filePath}|${thought.title}]]\n\n${thought.body}`;
        await this.app.vault.modify(this.view.activeMasterNote, existing.trimEnd() + '\n\n' + data);
        await this.vault.markAsSynthesized(thought.filePath);
        new Notice('Thought Synthesized.');
        this.view.renderView();
    }
}
