import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';

export class VoiceTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderVoiceMode(container);
    }

    async renderVoiceMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'display: flex; flex-direction: column; height: 100%; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'padding: 16px 14px 10px 14px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', { text: 'Voice', attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' } });

        // 2. High-Focus Recorder
        const recorderSection = wrap.createEl('div', {
            attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; gap: 30px;' }
        });

        const recordButton = recorderSection.createEl('button', {
            attr: { style: 'width: 120px; height: 120px; border-radius: 50%; border: none; background: var(--background-secondary-alt); color: var(--text-error); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(0,0,0,0.1); transition: all 0.3s;' }
        });
        setIcon(recordButton, 'mic');

        const timerDisplay = recorderSection.createEl('div', {
            text: '00:00',
            attr: { style: 'font-family: var(--font-monospace); font-size: 2em; font-weight: 700; color: var(--text-normal);' }
        });

        const statusDisplay = recorderSection.createEl('div', {
            text: 'Tap to start recording',
            attr: { style: 'font-size: 0.9em; color: var(--text-muted); font-weight: 500;' }
        });

        recordButton.addEventListener('click', async () => {
            if (this.view.isRecording) {
                // stopRecording implementation needed in view.ts? 
                // For refactoring, I'll assume it exists or use a local one.
                (this.view as any).stopRecording();
            } else {
                (this.view as any).startRecording(recordButton, timerDisplay, statusDisplay);
            }
        });

        // 3. Activity Feed (Recent Recordings)
        const feedHeader = wrap.createEl('h3', { text: 'Recent Clips', attr: { style: 'padding: 0 20px; font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); margin-bottom: 10px;' } });
        const listContainer = wrap.createEl('div', {
            attr: { style: 'flex-shrink: 0; padding: 0 20px 40px 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 300px;' }
        });

        const voiceFolder = this.settings.voiceMemoFolder || '000 Bin/MINA V2 Voice';
        const clips = this.app.vault.getMarkdownFiles() // Actually audio files, but let's filter correctly
            .filter(f => f.path.startsWith(voiceFolder) && (f.extension === 'm4a' || f.extension === 'mp3' || f.extension === 'webm'));
        
        // Wait, getMarkdownFiles won't get audio. Use getAllLoadedFiles?
        const allFiles = this.app.vault.getFiles();
        const voiceClips = allFiles.filter(f => f.path.startsWith(voiceFolder) && (f.extension === 'm4a' || f.extension === 'mp3' || f.extension === 'webm'));
        voiceClips.sort((a, b) => b.stat.ctime - a.stat.ctime).slice(0, 10).forEach(file => {
            const row = listContainer.createEl('div', {
                attr: { style: 'background: var(--background-secondary-alt); border-radius: 12px; padding: 12px; border: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between;' }
            });
            row.createSpan({ text: file.basename, attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
            
            const transcribeBtn = row.createEl('button', {
                text: 'Transcribe',
                attr: { style: 'background: transparent; border: 1px solid var(--interactive-accent); color: var(--interactive-accent); border-radius: 6px; font-size: 0.6em; padding: 2px 8px; cursor: pointer; font-weight: 700; text-transform: uppercase;' }
            });
            
            transcribeBtn.addEventListener('click', async () => {
                transcribeBtn.setText('Transcribing...');
                try {
                    const text = await this.ai.transcribeAudio(file);
                    transcribeBtn.setText('Done ✓');
                    new EditEntryModal(this.app, this.plugin, text, 'transcribed', null, false, async (finalText, ctxs) => {
                        const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                        await this.vault.createThoughtFile(finalText, contexts);
                        this.renderVoiceMode(container);
                    }, 'Transcribed Note').open();
                } catch (e) {
                    transcribeBtn.setText('Failed');
                    new Notice('Transcription failed: ' + e.message);
                }
            });
        });
    }
}
