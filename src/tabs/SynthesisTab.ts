import { moment, Platform, MarkdownRenderer, TFile, Notice, Modal, App, Setting } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry } from '../types';
import { BaseTab } from "./BaseTab";

class InsightTitleModal extends Modal {
    result: string = '';
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'New Insight Note' });

        new Setting(contentEl)
            .setName('Title')
            .addText((text) =>
                text.onChange((value) => {
                    this.result = value;
                }));

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Create')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.result);
                    }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

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
            attr: { style: `width: ${isMobilePhone ? '100%' : '350px'}; display: ${isMobilePhone && this.view.activeMasterNote ? 'none' : 'flex'}; flex-direction: column; border-right: 1px solid var(--background-modifier-border-faint);` }
        });

        const sideHeader = sidebar.createEl('div', {
            attr: { style: 'padding: 16px 14px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; gap: 10px;' }
        });
        this.renderHomeIcon(sideHeader);
        sideHeader.createEl('h3', { text: 'Synthesis Feed', attr: { style: 'margin: 0; font-size: 0.9em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;' } });

        const sideScroll = sidebar.createEl('div', {
            attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; -webkit-overflow-scrolling: touch;' }
        });

        const recentThoughts = Array.from(this.index.thoughtIndex.values())
            .filter(t => !t.project && !t.synthesized) // Only show unorganized and unsynthesized thoughts
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate)
            .slice(0, 30);

        if (recentThoughts.length === 0) {
            sideScroll.createEl('p', { text: 'No unorganized thoughts.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin-top: 20px; opacity: 0.6;' } });
        } else {
            for (const thought of recentThoughts) {
                const card = sideScroll.createEl('div', {
                    attr: { 
                        draggable: 'true',
                        style: 'background: var(--background-secondary-alt); border-radius: 8px; padding: 10px; border: 1px solid var(--background-modifier-border-faint); cursor: grab; transition: transform 0.1s;' 
                    }
                });
                card.createEl('div', { text: thought.title, attr: { style: 'font-size: 0.8em; font-weight: 700; color: var(--text-normal); margin-bottom: 4px;' } });
                card.createEl('div', { text: thought.body.substring(0, 100) + '...', attr: { style: 'font-size: 0.7em; color: var(--text-muted); line-height: 1.4;' } });

                card.addEventListener('dragstart', (e) => {
                    if (e.dataTransfer) {
                        e.dataTransfer.setData('application/json', JSON.stringify({ filePath: thought.filePath, content: `[[${thought.filePath}|${thought.title}]]\n\n${thought.body}` }));
                        card.style.opacity = '0.5';
                    }
                });
                card.addEventListener('dragend', () => card.style.opacity = '1');
                
                card.addEventListener('click', () => {
                    if (this.view.activeMasterNote) {
                        this.appendToMasterNote(thought);
                    } else {
                        new Notice('Select or create a Master Note first.');
                    }
                });
            }
        }

        // 2. Main Canvas (Active Insight)
        const main = wrap.createEl('div', {
            attr: { style: `flex-grow: 1; display: ${isMobilePhone && !this.view.activeMasterNote ? 'none' : 'flex'}; flex-direction: column; background: var(--background-primary);` }
        });

        const mainHeader = main.createEl('div', {
            attr: { style: 'padding: 16px 20px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between;' }
        });

        if (isMobilePhone) {
            const backBtn = mainHeader.createEl('button', { text: '←', attr: { style: 'background:transparent; border:none; font-size:1.2em; cursor:pointer;' } });
            backBtn.addEventListener('click', () => { this.view.activeMasterNote = null; this.view.renderView(); });
        }

        const titleStack = mainHeader.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        titleStack.createEl('h2', { 
            text: this.view.activeMasterNote ? this.view.activeMasterNote.basename : 'Select Insight Note', 
            attr: { style: 'margin: 0; font-size: 1.1em; font-weight: 800;' } 
        });

        const actions = mainHeader.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
        const newBtn = actions.createEl('button', {
            text: '+ New Insight',
            attr: { style: 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.6em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 700; text-transform: uppercase;' }
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
                        new Notice(`Using existing insight: ${existingFile.basename}`);
                        return;
                    }

                    new Notice(`Creating insight: ${name}...`);
                    const content = `---\narea: INSIGHT\ncreated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n---\n\n# ${name}\n\n`;
                    const file = await this.vault.createFile(folder, filename, content);
                    this.view.activeMasterNote = file;
                    this.view.renderView();
                    new Notice(`Success: ${file.basename} ready.`);
                } catch (e) {
                    new Notice(`Synthesis Error: ${e.message}`);
                }
            }).open();
        });

        const content = main.createEl('div', {
            attr: { style: 'flex-grow: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;' }
        });

        if (this.view.activeMasterNote) {
            const rawContent = await this.app.vault.read(this.view.activeMasterNote);
            const renderTarget = content.createEl('div', { cls: 'mina-insight-content', attr: { style: 'line-height: 1.6; font-size: 1.05em;' } });
            await MarkdownRenderer.render(this.app, rawContent, renderTarget, this.view.activeMasterNote.path, this.view);
            this.hookInternalLinks(renderTarget, this.view.activeMasterNote.path);
            this.hookImageZoom(renderTarget);
            
            // Drop Zone
            renderTarget.addEventListener('dragover', (e) => e.preventDefault());
            renderTarget.addEventListener('drop', async (e) => {
                e.preventDefault();
                const jsonData = e.dataTransfer?.getData('application/json');
                if (jsonData && this.view.activeMasterNote) {
                    const { filePath, content: appendText } = JSON.parse(jsonData);
                    const existing = await this.app.vault.read(this.view.activeMasterNote);
                    await this.app.vault.modify(this.view.activeMasterNote, existing.trimEnd() + '\n\n' + appendText);
                    
                    // Auto-Clear logic: mark as synthesized
                    await this.vault.markAsSynthesized(filePath);
                    
                    this.view.renderView();
                    new Notice('Thought synthesized.');
                }
            });
        } else {
            const empty = content.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; align-items: center; justify-content: center; opacity: 0.3; flex-direction: column; gap: 10px;' } });
            empty.createSpan({ text: '🧠', attr: { style: 'font-size: 3em;' } });
            empty.createSpan({ text: 'Select a note to start synthesizing knowledge.', attr: { style: 'font-weight: 600;' } });
        }
    }

    private async appendToMasterNote(thought: ThoughtEntry) {
        if (!this.view.activeMasterNote) return;
        const existing = await this.app.vault.read(this.view.activeMasterNote);
        const data = `[[${thought.filePath}|${thought.title}]]\n\n${thought.body}`;
        await this.app.vault.modify(this.view.activeMasterNote, existing.trimEnd() + '\n\n' + data);
        
        // Auto-Clear logic: mark as synthesized
        await this.vault.markAsSynthesized(thought.filePath);
        
        new Notice('Thought synthesized.');
        this.view.renderView();
    }
}
