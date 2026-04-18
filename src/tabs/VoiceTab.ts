import { moment, Notice, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { parseContextString } from '../utils';

export class VoiceTab extends BaseTab {
    // arch-05: Recording state owned by VoiceTab — eliminates broken (view as any) casts
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private recordingTimerInterval: number | null = null;
    private recordingStartTime: number = 0;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderVoiceMode(container);
    }

    async renderVoiceMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; height: 100%; background: var(--background-primary);' }
        });

        const header = wrap.createEl('div', {
            attr: { style: 'padding: 16px 14px 10px 14px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', { text: 'Voice', attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' } });

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
                this.stopRecording(recordButton, timerDisplay, statusDisplay);
            } else {
                await this.startRecording(recordButton, timerDisplay, statusDisplay);
            }
        });

        // Recent Clips feed
        wrap.createEl('h3', { text: 'Recent Clips', attr: { style: 'padding: 0 20px; font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); margin-bottom: 10px;' } });
        const listContainer = wrap.createEl('div', {
            attr: { style: 'flex-shrink: 0; padding: 0 20px 40px 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 300px;' }
        });

        const voiceFolder = this.settings.voiceMemoFolder || '000 Bin/MINA V2 Voice';
        const voiceClips = this.app.vault.getFiles()
            .filter(f => f.path.startsWith(voiceFolder) && ['m4a', 'mp3', 'webm', 'wav'].includes(f.extension))
            .sort((a, b) => b.stat.ctime - a.stat.ctime)
            .slice(0, 10);

        voiceClips.forEach(file => {
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
                        const contexts = parseContextString(ctxs);
                        await this.vault.createThoughtFile(finalText, contexts);
                        this.renderVoiceMode(container);
                    }, 'Transcribed Note').open();
                } catch (e: any) {
                    transcribeBtn.setText('Failed');
                    console.error('[MINA VoiceTab]', e);
                    new Notice('Transcription failed. Check the Gemini API key and model in settings.');
                }
            });
        });
    }

    private async startRecording(button: HTMLElement, timer: HTMLElement, status: HTMLElement) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                           : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
            this.audioChunks = [];
            this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';

            this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
            this.mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(this.audioChunks, { type: mimeType || 'audio/webm' });
                await this.saveRecording(blob, ext);
                this.view.isRecording = false;
                button.style.background = 'var(--background-secondary-alt)';
                button.style.color = 'var(--text-error)';
                button.style.boxShadow = 'none';
                setIcon(button, 'mic');
                timer.setText('00:00');
                status.setText('Tap to start recording');
            };

            this.mediaRecorder.start();
            this.view.isRecording = true;
            this.recordingStartTime = Date.now();
            button.style.background = '#e74c3c';
            button.style.color = 'white';
            button.style.boxShadow = '0 0 0 10px rgba(192, 57, 43, 0.2)';
            setIcon(button, 'square');
            status.setText('Recording...');

            this.recordingTimerInterval = window.setInterval(() => {
                const elapsed = Date.now() - this.recordingStartTime;
                const m = Math.floor(elapsed / 60000).toString().padStart(2, '0');
                const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
                timer.setText(`${m}:${s}`);
            }, 1000);
        } catch (e: any) {
            console.error('[MINA VoiceTab] mic access', e);
            const friendly = (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')
                ? 'Microphone access denied — allow permission in your OS/browser settings.'
                : 'Could not start recording. Ensure a microphone is connected.';
            new Notice(friendly);
        }
    }

    private stopRecording(button: HTMLElement, timer: HTMLElement, status: HTMLElement) {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.recordingTimerInterval) {
            clearInterval(this.recordingTimerInterval);
            this.recordingTimerInterval = null;
        }
        status.setText('Saving...');
        button.style.boxShadow = 'none';
    }

    private async saveRecording(blob: Blob, ext: string) {
        const folder = this.settings.voiceMemoFolder || '000 Bin/MINA V2 Voice';
        if (!this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder);
        }
        const filename = `voice-${moment().format('YYYYMMDD-HHmmss')}.${ext}`;
        const arrayBuffer = await blob.arrayBuffer();
        await this.app.vault.createBinary(`${folder}/${filename}`, arrayBuffer);
        new Notice(`Voice memo saved: ${filename}`);
    }
}
