import { App, Modal, TFile, Notice, MarkdownRenderer, moment } from 'obsidian';
import MinaPlugin from '../main';
import { toAsciiDigits } from '../utils';

export class EditEntryModal extends Modal {
    plugin: MinaPlugin;
    entry: any;
    isTask: boolean;
    onSave: (newBody: string, newContexts: string[]) => void;

    constructor(app: App, plugin: MinaPlugin, entry: any, isTask: boolean, onSave: (newBody: string, newContexts: string[]) => void) {
        super(app);
        this.plugin = plugin;
        this.entry = entry;
        this.isTask = isTask;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mina-edit-modal');
        
        const header = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;' } });
        header.createEl('h3', { text: this.isTask ? 'Edit Task' : 'Edit Thought', attr: { style: 'margin: 0;' } });

        const mainContainer = contentEl.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 15px;' } });

        // Body Text Area
        const bodyWrapper = mainContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        bodyWrapper.createEl('label', { text: 'Content', attr: { style: 'font-size: 0.8em; font-weight: 600; color: var(--text-muted);' } });
        const textArea = bodyWrapper.createEl('textarea', {
            value: this.entry.body,
            attr: { style: 'width: 100%; height: 200px; resize: vertical; padding: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border); font-family: var(--font-monospace);' }
        });

        // Context Management
        const ctxWrapper = mainContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        ctxWrapper.createEl('label', { text: 'Contexts', attr: { style: 'font-size: 0.8em; font-weight: 600; color: var(--text-muted);' } });
        
        const activeContexts = new Set<string>(this.entry.context || []);
        const allContexts = Array.from(new Set<string>([...(this.plugin.settings.contexts || []), ...activeContexts])).sort();

        const pillsContainer = ctxWrapper.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto; padding: 4px;' } });

        const renderPills = () => {
            pillsContainer.empty();
            allContexts.forEach(ctx => {
                const isActive = activeContexts.has(ctx);
                const pill = pillsContainer.createEl('div', {
                    text: ctx,
                    attr: { 
                        style: `padding: 4px 10px; border-radius: 12px; font-size: 0.8em; cursor: pointer; transition: all 0.2s; border: 1px solid ${isActive ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; background-color: ${isActive ? 'var(--interactive-accent)' : 'transparent'}; color: ${isActive ? 'var(--text-on-accent)' : 'var(--text-muted)'};`
                    }
                });
                pill.addEventListener('click', () => {
                    if (activeContexts.has(ctx)) activeContexts.delete(ctx);
                    else activeContexts.add(ctx);
                    renderPills();
                });
            });
        };
        renderPills();

        // Add New Context Row
        const addCtxRow = ctxWrapper.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
        const newCtxInput = addCtxRow.createEl('input', { type: 'text', placeholder: 'New context...', attr: { style: 'flex: 1; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border);' } });
        const addBtn = addCtxRow.createEl('button', { text: 'Add', attr: { style: 'padding: 4px 12px;' } });

        const handleAddContext = async () => {
            const val = newCtxInput.value.trim().replace(/^#/, '');
            if (val && !allContexts.includes(val)) {
                allContexts.push(val);
                allContexts.sort();
                activeContexts.add(val);
                if (!this.plugin.settings.contexts.includes(val)) {
                    this.plugin.settings.contexts.push(val);
                    await this.plugin.saveSettings();
                }
                newCtxInput.value = '';
                renderPills();
            }
        };
        addBtn.addEventListener('click', handleAddContext);
        newCtxInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddContext(); } });

        // Footer Actions
        const footer = contentEl.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 12px; margin-top: 25px; padding-top: 15px; border-top: 1px solid var(--background-modifier-border);' } });
        const cancelBtn = footer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 6px 18px;' } });
        const saveBtn = footer.createEl('button', { text: 'Save Changes', attr: { style: 'padding: 6px 22px; background-color: var(--interactive-accent); color: var(--text-on-accent); font-weight: 600;' } });

        const saveChanges = () => {
            this.onSave(textArea.value, Array.from(activeContexts));
            this.close();
        };

        cancelBtn.addEventListener('click', () => this.close());
        saveBtn.addEventListener('click', saveChanges);

        // Command+Enter or Shift+Enter = save
        textArea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); saveChanges(); } });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
