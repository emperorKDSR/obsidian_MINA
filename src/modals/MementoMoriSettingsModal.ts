import { App, Modal, Notice, Setting } from 'obsidian';
import DiwaPlugin from '../main';

export class MementoMoriSettingsModal extends Modal {
    plugin: DiwaPlugin;
    onRefresh: () => void;

    constructor(app: App, plugin: DiwaPlugin, onRefresh: () => void) {
        super(app);
        this.plugin = plugin;
        this.onRefresh = onRefresh;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.style.borderRadius = '16px';
        modalEl.style.padding = '0';
        modalEl.style.border = '1px solid var(--background-modifier-border)';

        // Header
        const header = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-bottom: 1px solid var(--background-modifier-border-faint);' }
        });
        header.createEl('span', { 
            text: 'MEMENTO MORI SETTINGS', 
            attr: { style: 'font-weight: 800; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);' } 
        });

        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 16px;' } });

        // Birth Date Input
        new Setting(body)
            .setName('Birth Date')
            .setDesc('When were you born?')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD')
                .setValue(this.plugin.settings.birthDate)
                .onChange(async (value) => {
                    this.plugin.settings.birthDate = value;
                }));

        // Life Expectancy Input
        new Setting(body)
            .setName('Life Expectancy')
            .setDesc('How many years do you expect to live?')
            .addText(text => text
                .setPlaceholder('90')
                .setValue(this.plugin.settings.lifeExpectancy.toString())
                .onChange(async (value) => {
                    this.plugin.settings.lifeExpectancy = parseInt(value) || 90;
                }));

        // Footer Actions
        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: flex-end; gap: 12px;' }
        });

        const cancelBtn = footer.createEl('button', { text: 'Close', attr: { style: 'background: transparent; border: none; color: var(--text-muted); font-weight: 600; cursor: pointer;' } });
        cancelBtn.addEventListener('click', () => this.close());

        const refreshBtn = footer.createEl('button', { 
            text: 'Save and Refresh View', 
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.1);' } 
        });

        refreshBtn.addEventListener('click', async () => {
            await this.plugin.saveSettings();
            this.close();
            this.onRefresh();
            new Notice('Memento Mori updated');
        });
    }

    onClose() { this.contentEl.empty(); }
}

