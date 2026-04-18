import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";
import { ChatSessionPickerModal } from "../modals/ChatSessionPickerModal";
import { NotePickerModal } from "../modals/NotePickerModal";

export class SettingsTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderSettingsMode(container);
    }
        renderSettingsMode(container: HTMLElement) {
            const wrap = container.createEl('div', { attr: { style: 'padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex-grow: 1; padding-bottom: 200px;' } });
            const field = (label: string, desc: string, inputFn: (row: HTMLElement) => void) => {
                const row = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 12px;' } });
                row.createEl('div', { text: label, attr: { style: 'font-size: 0.9em; font-weight: 600; color: var(--text-normal);' } });
                if (desc) row.createEl('div', { text: desc, attr: { style: 'font-size: 0.78em; color: var(--text-muted);' } });
                inputFn(row);
            };
            const input = (parent: HTMLElement, value: string, placeholder: string, type = 'text', onChange: (v: string) => void) => {
                const el = parent.createEl('input', { type, attr: { value, placeholder, style: 'font-size: 0.85em; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); width: 100%; box-sizing: border-box;' } });
                el.addEventListener('change', () => onChange(el.value));
            };
            field('Tasks Folder', 'Folder where MINA V2 task files are stored.', row => input(row, this.view.plugin.settings.tasksFolder, '000 Bin/MINA V2 Tasks', 'text', async v => { this.view.plugin.settings.tasksFolder = v; await this.view.plugin.saveSettings(); }));
            field('Thoughts Folder', 'Folder where MINA V2 thought files are stored.', row => input(row, this.view.plugin.settings.thoughtsFolder, '000 Bin/MINA V2', 'text', async v => { this.view.plugin.settings.thoughtsFolder = v; await this.view.plugin.saveSettings(); }));
            field('Personal Finance Folder', 'Folder scanned by the Dues tab for recurring payment notes.', row => input(row, this.view.plugin.settings.pfFolder, '000 Bin/MINA V2 PF', 'text', async v => { this.view.plugin.settings.pfFolder = v; await this.view.plugin.saveSettings(); }));
            field('Date Format', 'moment.js format, e.g. YYYY-MM-DD', row => input(row, this.view.plugin.settings.dateFormat, 'YYYY-MM-DD', 'text', async v => { this.view.plugin.settings.dateFormat = v; await this.view.plugin.saveSettings(); }));
            field('Time Format', 'moment.js format, e.g. HH:mm', row => input(row, this.view.plugin.settings.timeFormat, 'HH:mm', 'text', async v => { this.view.plugin.settings.timeFormat = v; await this.view.plugin.saveSettings(); }));
            field('New Note Folder', 'Folder where notes created via [[ link are saved.', row => input(row, this.view.plugin.settings.newNoteFolder, '000 Bin', 'text', async v => { this.view.plugin.settings.newNoteFolder = v; await this.view.plugin.saveSettings(); }));
            field('Voice Memo Folder', 'Folder where recorded voice notes will be stored.', row => input(row, this.view.plugin.settings.voiceMemoFolder, '000 Bin/MINA V2 Voice', 'text', async v => { this.view.plugin.settings.voiceMemoFolder = v; await this.view.plugin.saveSettings(); }));
            field('Transcription Language', 'Language for audio transcription.', row => input(row, this.view.plugin.settings.transcriptionLanguage, 'English', 'text', async v => { this.view.plugin.settings.transcriptionLanguage = v; await this.view.plugin.saveSettings(); }));
        }
    
    
}
