import { moment, Platform, MarkdownRenderer, TFile, Notice } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry } from '../types';
import { BaseTab } from "./BaseTab";
import { InsightTitleModal } from '../modals/InsightTitleModal';


export class SynthesisTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderSynthesisMode(container);
    }

    async renderSynthesisMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'display: flex; height: 100%; overflow: hidden; background: var(--background-primary);'
            }
        });

        const isMobilePhone = Platform.isMobile && container.clientWidth < 600;

        // 1. Sidebar (Recent Raw Captures)
        const sidebar = wrap.createEl('div', {
            attr: { style: `width: ${isMobilePhone ? '100%' : '380px'}; display: ${isMobilePhone && this.view.activeMasterNote ? 'none' : 'flex'}; flex-direction: column; border-right: 1px solid var(--background-modifier-border-faint); background: var(--background-primary);` }
        });

        const sideHeader = sidebar.createEl('div', {
            attr: { style: 'padding: 20px 16px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; gap: 12px;' }
        });
        this.renderHomeIcon(sideHeader);
        sideHeader.createEl('h3', { text: 'Synthesis Feed', attr: { style: 'margin: 0; font-size: 0.85em; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-faint);' } });

        const sideScroll = sidebar.createEl('div', {
            attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; -webkit-overflow-scrolling: touch;' }
        });

        const recentThoughts = Array.from(this.index.thoughtIndex.values())
            .filter(t => !t.project && !t.synthesized)
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate)
            .slice(0, 30);

        if (recentThoughts.length === 0) {
            const empty = sideScroll.createEl('div', { attr: { style: 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; opacity: 0.4; gap: 12px;' } });
            empty.createSpan({ text: '🌊', attr: { style: 'font-size: 2em;' } });
            empty.createSpan({ text: 'Inbox clear.', attr: { style: 'font-weight: 700; font-size: 0.85em;' } });
        } else {
            for (const thought of recentThoughts) {
                const card = sideScroll.createEl('div', {
                    cls: 'mina-card',
                    attr: { 
                        draggable: 'true',
                        style: 'cursor: grab; padding: 16px; background: var(--background-primary-alt);' 
                    }
                });
                card.createEl('div', { text: thought.title, attr: { style: 'font-size: 0.85em; font-weight: 800; color: var(--text-normal); margin-bottom: 6px;' } });
                card.createEl('div', { text: thought.body.substring(0, 120) + '...', attr: { style: 'font-size: 0.75em; color: var(--text-muted); line-height: 1.5; opacity: 0.8;' } });

                card.addEventListener('dragstart', (e) => {
                    if (e.dataTransfer) {
                        // sec-011: Use custom MIME type to distinguish internal drags from external
                        e.dataTransfer.setData('application/mina-thought', JSON.stringify({ filePath: thought.filePath, content: `[[${thought.filePath}|${thought.title}]]\n\n${thought.body}` }));
                        card.style.opacity = '0.5';
                    }
                });
                card.addEventListener('dragend', () => card.style.opacity = '1');
                
                card.addEventListener('click', () => {
                    if (this.view.activeMasterNote) this.appendToMasterNote(thought);
                    else new Notice('Select or create a Master Note first.');
                });
            }
        }

        // 2. Main Canvas (Active Insight)
        const main = wrap.createEl('div', {
            attr: { style: `flex-grow: 1; display: ${isMobilePhone && !this.view.activeMasterNote ? 'none' : 'flex'}; flex-direction: column; background: var(--background-primary);` }
        });

        const mainHeader = main.createEl('div', {
            attr: { style: 'padding: 20px 24px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between; background: var(--background-primary);' }
        });

        if (isMobilePhone) {
            const backBtn = mainHeader.createEl('button', { text: '←', attr: { style: 'background:transparent; border:none; font-size:1.4em; cursor:pointer; margin-right: 12px;' } });
            backBtn.addEventListener('click', () => { this.view.activeMasterNote = null; this.view.renderView(); });
        }

        const titleStack = mainHeader.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 2px;' } });
        titleStack.createEl('h2', { 
            text: this.view.activeMasterNote ? this.view.activeMasterNote.basename : 'Canvas', 
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.02em;' } 
        });
        if (this.view.activeMasterNote) titleStack.createEl('span', { text: 'Master Insight Note', attr: { style: 'font-size: 0.7em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--interactive-accent);' } });

        const actions = mainHeader.createEl('div', { attr: { style: 'display: flex; gap: 10px;' } });
        const newBtn = actions.createEl('button', {
            text: '+ New Insight',
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; font-size: 0.65em; padding: 6px 14px; cursor: pointer; font-weight: 800; text-transform: uppercase; transition: all 0.2s;' }
        });
        
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

        const content = main.createEl('div', {
            attr: { style: 'flex-grow: 1; padding: 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px;' }
        });

        if (this.view.activeMasterNote) {
            const rawContent = await this.app.vault.read(this.view.activeMasterNote);
            const renderTarget = content.createEl('div', { cls: 'mina-insight-content', attr: { style: 'line-height: 1.7; font-size: 1.1em; color: var(--text-normal); max-width: 800px;' } });
            await MarkdownRenderer.render(this.app, rawContent, renderTarget, this.view.activeMasterNote.path, this.view);
            this.hookInternalLinks(renderTarget, this.view.activeMasterNote.path);
            this.hookImageZoom(renderTarget);
            
            // Drop Zone
            renderTarget.addEventListener('dragover', (e) => e.preventDefault());
            renderTarget.addEventListener('drop', async (e) => {
                e.preventDefault();
                // sec-011: Use custom MIME type to reject external drag sources
                const jsonData = e.dataTransfer?.getData('application/mina-thought');
                if (!jsonData || !this.view.activeMasterNote) return;
                let parsed: { filePath?: string; content?: string };
                try { parsed = JSON.parse(jsonData); } catch { return; }
                const { filePath, content: appendText } = parsed;
                if (!filePath || typeof filePath !== 'string') return;
                // sec-011: Validate filePath exists in vault before operating
                const fileCheck = this.app.vault.getAbstractFileByPath(filePath);
                if (!fileCheck || !(fileCheck instanceof TFile)) {
                    new Notice('MINA: Invalid drag source');
                    return;
                }
                // sec-011: Cap appended content size to prevent runaway modifications
                const safeText = (appendText || '').slice(0, 50000);
                const existing = await this.app.vault.read(this.view.activeMasterNote);
                await this.app.vault.modify(this.view.activeMasterNote, existing.trimEnd() + '\n\n' + safeText);
                await this.vault.markAsSynthesized(filePath);
                this.view.renderView();
                new Notice('Thought Synthesized.');
            });
        } else {
            const empty = content.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; align-items: center; justify-content: center; opacity: 0.2; flex-direction: column; gap: 14px;' } });
            empty.createSpan({ text: '🧠', attr: { style: 'font-size: 4em;' } });
            empty.createSpan({ text: 'Select a note to start building knowledge.', attr: { style: 'font-weight: 800; font-size: 1.1em; letter-spacing: 0.05em;' } });
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
