import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MinaPlugin from './main';

export class MinaSettingTab extends PluginSettingTab {
	plugin: MinaPlugin;

	constructor(app: App, plugin: MinaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'MINA V2 Settings'});

        containerEl.createEl('h3', { text: 'Storage & Capture' });
		new Setting(containerEl).setName('Capture Folder').setDesc('Folder for daily capture logs (tables).').addText(text => text.setPlaceholder('000 Bin/MINA V2').setValue(this.plugin.settings.captureFolder).onChange(async (value) => { this.plugin.settings.captureFolder = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Thoughts Folder').setDesc('Folder for individual thought files (YAML).').addText(text => text.setPlaceholder('000 Bin/MINA V2').setValue(this.plugin.settings.thoughtsFolder).onChange(async (value) => { this.plugin.settings.thoughtsFolder = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Tasks Folder').setDesc('Folder for individual task files (YAML).').addText(text => text.setPlaceholder('000 Bin/MINA V2 Tasks').setValue(this.plugin.settings.tasksFolder).onChange(async (value) => { this.plugin.settings.tasksFolder = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Finance Folder').setDesc('Folder for personal finance (PF) dues.').addText(text => text.setPlaceholder('000 Bin/MINA V2 PF').setValue(this.plugin.settings.pfFolder).onChange(async (value) => { this.plugin.settings.pfFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Voice Memo Folder').setDesc('Folder for voice recording clips.').addText(text => text.setPlaceholder('000 Bin/MINA V2 Voice').setValue(this.plugin.settings.voiceMemoFolder).onChange(async (value) => { this.plugin.settings.voiceMemoFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Habits Folder').setDesc('Folder for habit tracking files.').addText(text => text.setPlaceholder('000 Bin/MINA V2 Habits').setValue(this.plugin.settings.habitsFolder).onChange(async (value) => { this.plugin.settings.habitsFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Attachments Folder').setDesc('Folder where pasted/dropped images and files are saved.').addText(text => text.setPlaceholder('000 Bin/MINA V2 Attachments').setValue(this.plugin.settings.attachmentsFolder ?? '000 Bin/MINA V2 Attachments').onChange(async (value) => { this.plugin.settings.attachmentsFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('New Note Folder').setDesc('Default folder for new synthesized notes.').addText(text => text.setPlaceholder('000 Bin').setValue(this.plugin.settings.newNoteFolder).onChange(async (value) => { this.plugin.settings.newNoteFolder = value; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Formats' });
		new Setting(containerEl).setName('Date Format').setDesc('moment.js format for dates.').addText(text => text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat).onChange(async (value) => { this.plugin.settings.dateFormat = value; await this.plugin.saveSettings(); this.plugin.notifyRefresh(); }));
		new Setting(containerEl).setName('Time Format').setDesc('moment.js format for time.').addText(text => text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat).onChange(async (value) => { this.plugin.settings.timeFormat = value; await this.plugin.saveSettings(); this.plugin.notifyRefresh(); }));

        containerEl.createEl('h3', { text: 'Intelligence (Gemini AI)' });
        // sec-002: API key masked as password — was plain text
        new Setting(containerEl).setName('Gemini API Key').setDesc('Your Google AI Studio API key.').addText(text => {
            text.setPlaceholder('AIza...').setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => { this.plugin.settings.geminiApiKey = value; await this.plugin.saveSettings(); });
            text.inputEl.type = 'password';
        });
		new Setting(containerEl).setName('Gemini Model').setDesc('Model ID to use (e.g. gemini-1.5-pro).').addText(text => text.setPlaceholder('gemini-1.5-pro').setValue(this.plugin.settings.geminiModel).onChange(async (value) => { this.plugin.settings.geminiModel = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Transcription Language').setDesc('Target language for audio transcription/translation.').addText(text => text.setPlaceholder('English').setValue(this.plugin.settings.transcriptionLanguage).onChange(async (value) => { this.plugin.settings.transcriptionLanguage = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Monthly Income').setDesc('Used for the Cashflow Dashboard in Finance Mode.').addText(text => text.setPlaceholder('0').setValue(this.plugin.settings.monthlyIncome.toString()).onChange(async (value) => { this.plugin.settings.monthlyIncome = parseFloat(value) || 0; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: 'Contexts & Tags' });
        const contextSetting = new Setting(containerEl).setName('Manage Contexts').setDesc('Click to rescan your vault for context tags (#tag).');
        contextSetting.addButton(btn => btn.setButtonText('Scan Vault').onClick(async () => {
            const found = await this.plugin.index.scanForContexts();
            let added = 0;
            found.forEach(c => { if (!this.plugin.settings.contexts.includes(c)) { this.plugin.settings.contexts.push(c); added++; } });
            if (added > 0) {
                await this.plugin.saveSettings();
                new Notice(`Found and added ${added} new contexts.`);
                this.display();
            } else {
                new Notice('No new contexts found.');
            }
        }));

        containerEl.createEl('h3', { text: 'Memento Mori' });
        new Setting(containerEl).setName('Birth Date').setDesc('Your date of birth (YYYY-MM-DD).').addText(text => text.setPlaceholder('1990-01-01').setValue(this.plugin.settings.birthDate).onChange(async (value) => { this.plugin.settings.birthDate = value; await this.plugin.saveSettings(); this.plugin.notifyRefresh(); }));
        new Setting(containerEl).setName('Life Expectancy').setDesc('Target age (e.g. 90).').addText(text => text.setPlaceholder('90').setValue(this.plugin.settings.lifeExpectancy.toString()).onChange(async (value) => { this.plugin.settings.lifeExpectancy = parseInt(value) || 90; await this.plugin.saveSettings(); this.plugin.notifyRefresh(); }));
	}
}
