import { ConfirmModal } from '../modals/ConfirmModal';
import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";
import { ChatSessionPickerModal } from "../modals/ChatSessionPickerModal";
import { NotePickerModal } from "../modals/NotePickerModal";

export class VoiceTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderVoiceMode(container);
    }
        async renderVoiceMode(container: HTMLElement) {
            const wrap = container.createEl('div', { attr: { style: 'padding: 12px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; padding-bottom: 200px;' } });
            const recorderSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 15px; background: var(--background-secondary); border-radius: 8px;' } });
            const recordButton = recorderSection.createEl('button', { attr: { style: 'width: 80px; height: 80px; border-radius: 50%; border: 4px solid var(--background-modifier-border); background-color: #c0392b; color: white; font-size: 1.2em; cursor: pointer; transition: all 0.2s;' } });
            recordButton.setText('●');
            const timerDisplay = recorderSection.createEl('div', { text: '00:00', attr: { style: 'font-family: monospace; font-size: 1.1em; color: var(--text-muted);' } });
            const statusDisplay = recorderSection.createEl('div', { text: 'Ready to record', attr: { style: 'font-size: 0.8em; color: var(--text-faint);' } });
            recordButton.addEventListener('click', () => { if (this.view.isRecording) this.view.stopRecording(); else this.view.startRecording(recordButton, timerDisplay, statusDisplay); });
            const listSection = wrap.createEl('div'); listSection.createEl('h4', { text: 'Your Voice Notes', attr: { style: 'margin-bottom: 10px;' } });
            const recordingsContainer = listSection.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
            const voiceFolder = this.view.plugin.settings.voiceMemoFolder; const files = this.view.app.vault.getFiles().filter(f => f.path.startsWith(voiceFolder + '/') && (f.extension === 'webm' || f.extension === 'mp3' || f.extension === 'wav' || f.extension === 'm4a'));
            files.sort((a, b) => b.stat.ctime - a.stat.ctime);
            if (files.length === 0) recordingsContainer.createEl('p', { text: 'No voice notes recorded yet.', attr: { style: 'color: var(--text-muted); font-size: 0.9em;' } });
            else {
                for (const file of files) {
                    const card = recordingsContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--background-secondary); border-radius: 8px;' } });
                    const header = card.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
                    header.createEl('div', { text: moment(file.stat.ctime).format('YYYY-MM-DD HH:mm'), attr: { style: 'font-weight: 500;' } });
                    const transcriptionStatusContainer = header.createEl('div'); this.view.getTranscriptionStatus(file).then(isTranscribed => { if (isTranscribed) transcriptionStatusContainer.createEl('span', { text: '✅ Transcribed', attr: { style: 'font-size: 0.8em; color: var(--text-success); background-color: var(--background-primary); padding: 3px 7px; border-radius: 4px;' } }); });
                    card.createEl('audio', { attr: { controls: true, src: this.view.app.vault.getResourcePath(file), style: 'width: 100%; height: 35px;' } });
                    const actions = card.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
                    const transcribeBtn = actions.createEl('button', { text: 'Transcribe', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.85em; padding: 5px 12px; border-radius: 5px;' } });
                    transcribeBtn.addEventListener('click', async () => {
                        transcribeBtn.setText('...'); transcribeBtn.disabled = true;
                        try { new Notice('Starting transcription...'); const transcription = await this.view.transcribeAudio(file); await this.view.plugin.createThoughtFile(`Transcription of [[${file.path}]]\n\n${transcription}`, ['#transcribed', '#voice-note']); new Notice('Transcription saved as thought.'); this.view.renderView(); }
                        catch (error) { new Notice('Transcription failed: ' + error.message); transcribeBtn.setText('Transcribe'); transcribeBtn.disabled = false; }
                    });
                    const deleteBtn = actions.createEl('button', { text: '🗑️', attr: { title: 'Delete', style: 'background: none; border: none; font-size: 1.2em; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 5px;' } });
                    deleteBtn.addEventListener('click', () => { new ConfirmModal(this.view.app, 'Delete this voice note?', async () => { await this.view.app.vault.delete(file); new Notice('Voice note deleted.'); this.view.renderView(); }).open(); });
                }
            }
        }
    
    
}
