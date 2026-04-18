import { moment, Platform, MarkdownRenderer, TFile, Notice, Modal } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry } from '../types';
import { BaseTab } from "./BaseTab";

export class SynthesisTab extends BaseTab {
    activeMasterNote: TFile | null = null;

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
            attr: { style: `width: ${isMobilePhone ? '100%' : '350px'}; display: ${isMobilePhone && this.activeMasterNote ? 'none' : 'flex'}; flex-direction: column; border-right: 1px solid var(--background-modifier-border-faint);` }
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
            .filter(t => !t.project)
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
                        e.dataTransfer.setData('text/plain', `[[${thought.filePath}|${thought.title}]]\n\n${thought.body}`);
                        card.style.opacity = '0.5';
                    }
                });
                card.addEventListener('dragend', () => card.style.opacity = '1');
                
                card.addEventListener('click', () => {
                    if (this.activeMasterNote) {
                        this.appendToMasterNote(thought, container);
                    } else {
                        new Notice('Select or create a Master Note first.');
                    }
                });
            }
        }

        // 2. Main Canvas (Active Insight)
        const main = wrap.createEl('div', {
            attr: { style: `flex-grow: 1; display: ${isMobilePhone && !this.activeMasterNote ? 'none' : 'flex'}; flex-direction: column; background: var(--background-primary);` }
        });

        const mainHeader = main.createEl('div', {
            attr: { style: 'padding: 16px 20px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between;' }
        });

        if (isMobilePhone) {
            const backBtn = mainHeader.createEl('button', { text: '←', attr: { style: 'background:transparent; border:none; font-size:1.2em; cursor:pointer;' } });
            backBtn.addEventListener('click', () => { this.activeMasterNote = null; this.render(container); });
        }

        const titleStack = mainHeader.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        titleStack.createEl('h2', { 
            text: this.activeMasterNote ? this.activeMasterNote.basename : 'Select Insight Note', 
            attr: { style: 'margin: 0; font-size: 1.1em; font-weight: 800;' } 
        });

        const actions = mainHeader.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
        const newBtn = actions.createEl('button', {
            text: '+ New Insight',
            attr: { style: 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.6em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 700; text-transform: uppercase;' }
        });
        newBtn.addEventListener('click', async () => {
            const name = await this.promptForName();
            if (name) {
                const folder = this.settings.newNoteFolder;
                const path = `${folder}/${name}.md`;
                const file = await this.app.vault.create(path, `---\narea: INSIGHT\ncreated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n---\n\n# ${name}\n\n`);
                this.activeMasterNote = file;
                this.render(container);
            }
        });

        const content = main.createEl('div', {
            attr: { style: 'flex-grow: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;' }
        });

        if (this.activeMasterNote) {
            const rawContent = await this.app.vault.read(this.activeMasterNote);
            const renderTarget = content.createEl('div', { cls: 'mina-insight-content', attr: { style: 'line-height: 1.6; font-size: 1.05em;' } });
            await MarkdownRenderer.render(this.app, rawContent, renderTarget, this.activeMasterNote.path, this.view);
            
            renderTarget.addEventListener('dragover', (e) => e.preventDefault());
            renderTarget.addEventListener('drop', async (e) => {
                e.preventDefault();
                const data = e.dataTransfer?.getData('text/plain');
                if (data && this.activeMasterNote) {
                    const existing = await this.app.vault.read(this.activeMasterNote);
                    await this.app.vault.modify(this.activeMasterNote, existing.trimEnd() + '\n\n' + data);
                    this.render(container);
                    new Notice('Thought synthesized.');
                }
            });
        } else {
            const empty = content.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; align-items: center; justify-content: center; opacity: 0.3; flex-direction: column; gap: 10px;' } });
            empty.createSpan({ text: '🧠', attr: { style: 'font-size: 3em;' } });
            empty.createSpan({ text: 'Select a note to start synthesizing knowledge.', attr: { style: 'font-weight: 600;' } });
        }
    }

    private async appendToMasterNote(thought: ThoughtEntry, container: HTMLElement) {
        if (!this.activeMasterNote) return;
        const existing = await this.app.vault.read(this.activeMasterNote);
        const data = `[[${thought.filePath}|${thought.title}]]\n\n${thought.body}`;
        await this.app.vault.modify(this.activeMasterNote, existing.trimEnd() + '\n\n' + data);
        new Notice('Thought synthesized.');
        this.render(container);
    }

    private promptForName(): Promise<string | null> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText('New Insight Note');
            const inp = modal.contentEl.createEl('input', { type: 'text', attr: { placeholder: 'Insight Title...', style: 'width: 100%; margin-bottom: 12px;' } });
            const btn = modal.contentEl.createEl('button', { text: 'Create', attr: { style: 'width: 100%;' } });
            btn.addEventListener('click', () => { modal.close(); resolve(inp.value.trim()); });
            modal.onClose = () => resolve(null);
            modal.open();
        });
    }
}
