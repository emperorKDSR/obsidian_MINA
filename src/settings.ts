import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MinaPlugin from './main';
import { FolderSettingsModal } from './modals/FolderSettingsModal';

export class MinaSettingTab extends PluginSettingTab {
	plugin: MinaPlugin;
	constructor(app: App, plugin: MinaPlugin) { super(app, plugin); this.plugin = plugin; }
	display(): void {
		const {containerEl} = this;
		containerEl.empty();

        new Setting(containerEl)
            .setName('Folder Configuration')
            .setDesc('Configure the storage locations for tasks, thoughts, finance, and voice notes.')
            .addButton(btn => btn
                .setButtonText('Open Folder Config')
                .onClick(() => {
                    new FolderSettingsModal(this.app, this.plugin).open();
                }));

        new Setting(containerEl).setName('Date format').addText(text => text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat).onChange(async (value) => { this.plugin.settings.dateFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Time format').addText(text => text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat).onChange(async (value) => { this.plugin.settings.timeFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Transcription Language').setDesc('Target language for audio transcription/translation.').addText(text => text.setPlaceholder('English').setValue(this.plugin.settings.transcriptionLanguage).onChange(async (value) => { this.plugin.settings.transcriptionLanguage = value; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Memento Mori' });
        new Setting(containerEl).setName('Birth Date').setDesc('Your birth date for Memento Mori visualization.').addText(text => {
            text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.birthDate).onChange(async (value) => {
                this.plugin.settings.birthDate = value;
                await this.plugin.saveSettings();
                this.plugin.notifyViewRefresh();
            });
            text.inputEl.type = 'date';
        });
        new Setting(containerEl).setName('Life Expectancy').setDesc('Expected years of life.').addText(text => {
            text.setPlaceholder('90').setValue(String(this.plugin.settings.lifeExpectancy)).onChange(async (value) => {
                const val = parseInt(value) || 90;
                this.plugin.settings.lifeExpectancy = val;
                await this.plugin.saveSettings();
                this.plugin.notifyViewRefresh();
            });
            text.inputEl.type = 'number';
        });

        containerEl.createEl('h3', { text: 'Mode Filters' });
        new Setting(containerEl).setName('Journal Keywords').setDesc('Additional keywords or notes (e.g. [[Note Name]]) to include in Journal Mode. Separate with commas.').addTextArea(text => {
            text.setPlaceholder('keyword1, [[Note]]').setValue(this.plugin.settings.journalKeywords.join(', ')).onChange(async (value) => {
                this.plugin.settings.journalKeywords = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                await this.plugin.saveSettings();
            });
            text.inputEl.rows = 2;
            text.inputEl.style.width = '100%';
        });
        new Setting(containerEl).setName('Grundfos Keywords').setDesc('Additional keywords or notes to include in Grundfos Mode. Separate with commas.').addTextArea(text => {
            text.setPlaceholder('keyword1, [[Note]]').setValue(this.plugin.settings.grundfosKeywords.join(', ')).onChange(async (value) => {
                this.plugin.settings.grundfosKeywords = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                await this.plugin.saveSettings();
            });
            text.inputEl.rows = 2;
            text.inputEl.style.width = '100%';
        });

        containerEl.createEl('h3', { text: 'Custom Modes' });
        const customModesHeader = containerEl.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;' } });
        const refreshBtn = customModesHeader.createEl('button', { text: 'Refresh Contexts', attr: { style: 'font-size: 0.8em;' } });
        refreshBtn.addEventListener('click', async () => {
            await this.plugin.scanForContexts();
            this.display();
            new Notice('Contexts refreshed.');
        });

        const modeContainer = containerEl.createDiv();
        
        const renderCustomModes = () => {
            modeContainer.empty();
            this.plugin.settings.customModes.forEach((mode, index) => {
                const s = new Setting(modeContainer).setName(`Mode: ${mode.name || 'Unnamed'}`);
                
                s.addText(text => text
                    .setPlaceholder('Name')
                    .setValue(mode.name)
                    .onChange(async (val) => {
                        mode.name = val;
                        await this.plugin.saveSettings();
                    }));

                s.addDropdown(drop => {
                    drop.addOption('', 'No Context');
                    this.plugin.settings.contexts.forEach(ctx => drop.addOption(ctx, ctx));
                    drop.setValue(mode.context);
                    drop.onChange(async (val) => {
                        mode.context = val;
                        await this.plugin.saveSettings();
                    });
                });

                s.addText(text => text
                    .setPlaceholder('Keywords (e.g. key1, -exclude)')
                    .setValue(mode.keywords.join(', '))
                    .onChange(async (val) => {
                        mode.keywords = val.split(',').map(k => k.trim()).filter(k => k.length > 0);
                        await this.plugin.saveSettings();
                    }));

                s.addDropdown(drop => {
                    const icons = ['pencil', 'flask', 'briefcase', 'heart', 'star', 'target', 'flame', 'book', 'coffee', 'cloud', 'anchor', 'zap'];
                    icons.forEach(i => drop.addOption(i, i));
                    drop.setValue(mode.icon || 'pencil');
                    drop.onChange(async (val) => {
                        mode.icon = val;
                        await this.plugin.saveSettings();
                    });
                });

                s.addButton(btn => {
                    btn.setIcon('trash').setWarning().onClick(async () => {
                        this.plugin.settings.customModes.splice(index, 1);
                        await this.plugin.saveSettings();
                        renderCustomModes();
                        new Notice('Mode removed. Restart Obsidian to update ribbon.');
                    });
                });

                s.infoEl.style.display = 'none';
                s.controlEl.style.width = '100%';
                s.controlEl.style.display = 'flex';
                s.controlEl.style.flexWrap = 'wrap';
                s.controlEl.style.gap = '5px';
                s.controlEl.querySelectorAll('input, select').forEach(el => (el as HTMLElement).style.flex = '1');
            });
        };
        renderCustomModes();

        new Setting(containerEl)
            .setName('Add New Mode')
            .setDesc('Create a new high-focus mode.')
            .addButton(btn => {
                btn.setButtonText('+ Add Mode').setCta().onClick(async () => {
                    const newMode = { 
                        id: 'custom-' + Date.now(), 
                        name: '', 
                        context: '', 
                        keywords: [], 
                        icon: 'pencil' 
                    };
                    this.plugin.settings.customModes.push(newMode);
                    await this.plugin.saveSettings();
                    renderCustomModes();
                });
            });
	}
}
