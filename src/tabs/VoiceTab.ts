import { ConfirmModal } from '../modals/ConfirmModal';
import { moment, Platform, Notice, TFile, Modal } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { NotePickerModal } from '../modals/NotePickerModal';

export class VoiceTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderVoiceMode(container);
    }

    async renderVoiceMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 16px 14px 200px 14px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header (Ultra-minimalist)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: baseline; justify-content: space-between;' } });

        titleRow.createEl('h2', {
            text: 'Voice',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        titleRow.createEl('span', {
            text: moment().format('dddd, MMMM D'),
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' }
        });

        // 2. High-Focus Recorder (Clean & Floating Feel)
        const recorderSection = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 20px; background: var(--background-primary); border: 1px solid var(--background-modifier-border-faint); border-radius: 24px; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.05);' }
        });

        const timerDisplay = recorderSection.createEl('div', {
            text: '00:00',
            attr: { style: 'font-family: var(--font-monospace); font-size: 2.2em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em;' }
        });

        const statusDisplay = recorderSection.createEl('div', {
            text: 'Ready to capture',
            attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;' }
        });

        const recordButton = recorderSection.createEl('button', {
            attr: { style: 'width: 80px; height: 80px; border-radius: 50%; border: none; background: var(--background-secondary-alt); color: #e74c3c; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); margin-top: 10px; border: 4px solid var(--background-modifier-border);' }
        });
        
        const recordIcon = recordButton.createSpan({ 
            text: '●', 
            attr: { style: 'font-size: 2em; line-height: 1;' } 
        });

        // Event: Recording logic
        recordButton.addEventListener('click', () => {
            if (this.view.isRecording) {
                this.view.stopRecording();
                recordIcon.setText('●');
                recordButton.style.color = '#e74c3c';
                recordButton.style.transform = 'scale(1)';
                recordButton.style.boxShadow = 'none';
                statusDisplay.setText('Processing...');
            } else {
                this.view.startRecording(recordButton, timerDisplay, statusDisplay);
                recordIcon.setText('■');
                recordButton.style.color = 'var(--text-on-accent)';
                recordButton.style.background = '#e74c3c';
                recordButton.style.transform = 'scale(1.1)';
                recordButton.style.boxShadow = '0 0 0 8px rgba(231, 76, 60, 0.15)';
                statusDisplay.setText('Listening...');
            }
        });

        // 3. Activity Section
        const activityWrap = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 16px; margin-top: 10px;' }
        });

        const activityHeader = activityWrap.createEl('div', {
            attr: { style: 'display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 8px;' }
        });
        
        activityHeader.createEl('span', { 
            text: 'Activity', 
            attr: { style: 'font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);' } 
        });

        const recordingsContainer = activityWrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px;' }
        });

        const voiceFolder = this.view.plugin.settings.voiceMemoFolder;
        const files = this.view.app.vault.getFiles().filter(f => f.path.startsWith(voiceFolder + '/') && (f.extension === 'webm' || f.extension === 'mp3' || f.extension === 'wav' || f.extension === 'm4a'));
        files.sort((a, b) => b.stat.ctime - a.stat.ctime);

        if (files.length === 0) {
            recordingsContainer.createEl('p', { 
                text: 'No captures yet.', 
                attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 32px; font-size: 0.85em; opacity: 0.5; font-style: italic;' } 
            });
        } else {
            for (const file of files) {
                this.renderRecordingCard(recordingsContainer, file, container);
            }
        }
    }

    private async renderRecordingCard(container: HTMLElement, file: TFile, fullContainer: HTMLElement) {
        const card = container.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--background-secondary-alt); border-radius: 16px; transition: transform 0.1s; border: 1px solid transparent;' }
        });

        const topRow = card.createEl('div', {
            attr: { style: 'display: flex; align-items: center; justify-content: space-between;' }
        });

        // Left side: Time and Date
        const timeInfo = topRow.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
        timeInfo.createSpan({ 
            text: moment(file.stat.ctime).format('h:mm A'), 
            attr: { style: 'font-size: 0.85em; font-weight: 700; color: var(--text-normal);' } 
        });
        timeInfo.createSpan({ 
            text: '•', 
            attr: { style: 'color: var(--text-faint); font-size: 0.8em;' } 
        });
        timeInfo.createSpan({ 
            text: moment(file.stat.ctime).format('MMM D'), 
            attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: 500;' } 
        });

        // Right side: Actions and Status
        const actions = topRow.createEl('div', {
            attr: { style: 'display: flex; align-items: center; gap: 12px;' }
        });

        const actionStyle = 'background: transparent; border: none; padding: 0; font-size: 0.7em; font-weight: 800; cursor: pointer; transition: opacity 0.15s; text-transform: uppercase; letter-spacing: 0.05em;';
        
        const transcribe = actions.createEl('button', {
            text: 'Transcribe',
            attr: { style: actionStyle + ' color: var(--text-accent);' }
        });

        const statusTag = actions.createEl('div');
        this.view.getTranscriptionStatus(file).then(isTranscribed => {
            if (isTranscribed) {
                transcribe.style.display = 'none';
                statusTag.createSpan({ 
                    text: 'DONE', 
                    attr: { style: 'font-size: 0.6em; font-weight: 900; color: var(--text-success); letter-spacing: 0.08em; background: rgba(var(--success-rgb), 0.1); padding: 2px 6px; border-radius: 4px;' } 
                });
            }
        });

        transcribe.addEventListener('click', async (e) => {
            e.stopPropagation();
            transcribe.setText('...');
            transcribe.style.opacity = '0.5';
            try {
                const text = await this.view.transcribeAudio(file);
                
                // Synergy Routing UI
                transcribe.remove();
                const routeRow = actions.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
                
                const routeBtnStyle = 'background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 2px 6px; font-size: 0.65em; font-weight: 700; cursor: pointer; color: var(--text-muted);';
                
                const saveAsNote = routeRow.createEl('button', { text: 'Note', attr: { style: routeBtnStyle + ' color: var(--text-accent);' } });
                saveAsNote.addEventListener('click', async () => {
                    await this.view.plugin.createThoughtFile(`Transcription of [[${file.path}]]\n\n${text}`, ['transcribed', 'voice-note']);
                    new Notice('Saved as thought');
                    this.render(fullContainer);
                });

                const saveAsTask = routeRow.createEl('button', { text: 'Task', attr: { style: routeBtnStyle } });
                saveAsTask.addEventListener('click', async () => {
                    new EditEntryModal(this.app, this.view.plugin, text, 'transcribed', moment().format('YYYY-MM-DD'), true, async (txt, ctxs, due, project) => {
                        const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                        const file = await this.view.plugin.createTaskFile(txt, contexts, due || undefined);
                        if (project) await this.app.fileManager.processFrontMatter(file, (fm) => { fm['project'] = project; });
                        this.render(fullContainer);
                    }, 'New Task from Voice').open();
                });

                const saveToProject = routeRow.createEl('button', { text: 'Project', attr: { style: routeBtnStyle } });
                saveToProject.addEventListener('click', async () => {
                    const projects = new Set<string>();
                    this.view.plugin.thoughtIndex.forEach(t => { if (t.project) projects.add(t.project); });
                    this.view.plugin.taskIndex.forEach(t => { if (t.project) projects.add(t.project); });
                    const projectList = Array.from(projects).sort();

                    if (projectList.length === 0) {
                        new Notice('No active projects found.');
                        return;
                    }

                    // Simple picker for demo/mvp - using a native prompt or a mini modal
                    const projectName = await this.promptProjectSelection(projectList);
                    if (projectName) {
                        const thought = await this.view.plugin.createThoughtFile(`Transcription of [[${file.path}]]\n\n${text}`, ['transcribed', 'voice-note']);
                        await this.app.fileManager.processFrontMatter(thought, (fm) => { fm['project'] = projectName; });
                        new Notice(`Added to project: ${projectName}`);
                        this.render(fullContainer);
                    }
                });

            } catch (err) {
                new Notice('Transcription failed');
                transcribe.setText('Transcribe');
                transcribe.style.opacity = '1';
            }
        });

        const del = actions.createEl('button', {
            text: 'Delete',
            attr: { style: actionStyle + ' color: var(--text-error); opacity: 0.5;' }
        });

        del.addEventListener('click', (e) => {
            e.stopPropagation();
            new ConfirmModal(this.app, 'Delete recording?', async () => {
                await this.app.vault.delete(file);
                this.render(fullContainer);
            }).open();
        });

        // Audio player remains in the body of the card
        const audioPlayer = card.createEl('audio', {
            attr: { 
                controls: true, 
                src: this.view.app.vault.getResourcePath(file), 
                style: 'width: 100%; height: 32px; filter: grayscale(1) opacity(0.8);' 
            }
        });
    }

    private async promptProjectSelection(projects: string[]): Promise<string | null> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText('Select Project');
            modal.contentEl.createEl('p', { text: 'Choose a project to link this transcription to:', attr: { style: 'font-size: 0.9em; color: var(--text-muted); margin-bottom: 12px;' } });
            const list = modal.contentEl.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
            projects.forEach(p => {
                const btn = list.createEl('button', { text: p, attr: { style: 'width: 100%; text-align: left; padding: 10px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); cursor: pointer;' } });
                btn.addEventListener('click', () => { modal.close(); resolve(p); });
            });
            modal.onClose = () => resolve(null);
            modal.open();
        });
    }
}
