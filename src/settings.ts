import { App, PluginSettingTab, Setting } from 'obsidian';
import MinaPlugin from './main';

export class MinaSettingTab extends PluginSettingTab {
	plugin: MinaPlugin;
	constructor(app: App, plugin: MinaPlugin) { super(app, plugin); this.plugin = plugin; }
	display(): void {
		const {containerEl} = this;
		containerEl.empty();
        new Setting(containerEl).setName('Tasks Folder').setDesc('Folder where MINA V2 task files are stored.').addText(text => text.setPlaceholder('000 Bin/MINA V2 Tasks').setValue(this.plugin.settings.tasksFolder).onChange(async (value) => { this.plugin.settings.tasksFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Thoughts Folder').setDesc('Folder where MINA V2 thought files are stored.').addText(text => text.setPlaceholder('000 Bin/MINA V2').setValue(this.plugin.settings.thoughtsFolder).onChange(async (value) => { this.plugin.settings.thoughtsFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Personal Finance Folder').setDesc('Folder scanned by the Dues tab for recurring payment notes.').addText(text => text.setPlaceholder('000 Bin/MINA V2 PF').setValue(this.plugin.settings.pfFolder).onChange(async (value) => { this.plugin.settings.pfFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Date format').addText(text => text.setPlaceholder('YYYY-MM-DD').setValue(this.plugin.settings.dateFormat).onChange(async (value) => { this.plugin.settings.dateFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Time format').addText(text => text.setPlaceholder('HH:mm').setValue(this.plugin.settings.timeFormat).onChange(async (value) => { this.plugin.settings.timeFormat = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('New Note Folder').setDesc('Folder where notes created via the \\ link picker are saved.').addText(text => text.setPlaceholder('000 Bin').setValue(this.plugin.settings.newNoteFolder).onChange(async (value) => { this.plugin.settings.newNoteFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Voice Memo Folder').setDesc('Folder where recorded voice notes will be stored.').addText(text => text.setPlaceholder('000 Bin/MINA V2 Voice').setValue(this.plugin.settings.voiceMemoFolder).onChange(async (value) => { this.plugin.settings.voiceMemoFolder = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Transcription Language').setDesc('The target language for audio transcription (e.g., English, Japanese).').addText(text => text.setPlaceholder('English').setValue(this.plugin.settings.transcriptionLanguage).onChange(async (value) => { this.plugin.settings.transcriptionLanguage = value; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('Gemini API Key').setDesc('API key for the MINA AI chat tab (Google Gemini).').addText(text => { text.setPlaceholder('AIza...').setValue(this.plugin.settings.geminiApiKey).onChange(async (value) => { this.plugin.settings.geminiApiKey = value.trim(); await this.plugin.saveSettings(); }); text.inputEl.type = 'password'; });
        new Setting(containerEl).setName('Gemini Model').setDesc('Model to use for the MINA AI chat.').addDropdown(drop => {
            const models: Record<string, string> = {
                'gemini-2.5-pro':                    '2.5 Pro — highest reasoning & multimodal',
                'gemini-2.5-flash':                  '2.5 Flash — fast, general-purpose',
                'gemini-2.5-flash-lite':             '2.5 Flash Lite — ultra-fast, cost-efficient',
                'gemini-2.5-flash-preview':          '2.5 Flash Preview — latest preview',
                'gemini-2.0-flash':                  '2.0 Flash — stable, multimodal',
                'gemini-2.0-flash-lite':             '2.0 Flash Lite — budget-friendly',
                'gemini-1.5-pro':                    '1.5 Pro — complex reasoning, prior flagship',
                'gemini-1.5-flash':                  '1.5 Flash — fast, previous gen',
                'gemini-1.5-flash-8b':               '1.5 Flash 8B — high-volume, lightweight',
            };
            for (const [value, label] of Object.entries(models)) {
                drop.addOption(value, label);
            }
            drop.setValue(this.plugin.settings.geminiModel || 'gemini-2.5-flash');
            drop.onChange(async (value) => { this.plugin.settings.geminiModel = value; await this.plugin.saveSettings(); });
        });
        new Setting(containerEl).setName('Max Output Tokens').setDesc('Maximum tokens in Gemini AI responses (256–65536). Higher = longer answers. Default: 65536.').addText(text => {
            text.setPlaceholder('65536').setValue(String(this.plugin.settings.maxOutputTokens ?? 65536));
            text.inputEl.type = 'number';
            text.inputEl.min = '256';
            text.inputEl.max = '65536';
            text.onChange(async (value) => {
                const val = Math.min(65536, Math.max(256, parseInt(value) || 65536));
                this.plugin.settings.maxOutputTokens = val;
                await this.plugin.saveSettings();
            });
        });
	}
}
