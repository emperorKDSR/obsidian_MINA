import { App, Modal, Platform, Notice, moment } from 'obsidian';
import MinaPlugin from '../main';
import { isTablet, parseNaturalDate, parseContextString } from '../utils';
import { FileSuggestModal } from './FileSuggestModal';
import { ContextSuggestModal } from './ContextSuggestModal';
export class EditEntryModal extends Modal {
    initialText: string;
    initialContexts: string[];
    initialDueDate: string | null;
    isTask: boolean;
    plugin: MinaPlugin;
    onSave: (newText: string, newContexts: string, newDueDate: string | null, project: string | null) => void;
    customTitle?: string;
    stayOpen: boolean;
    
    currentProject: string | null = null;
    classificationTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        app: App,
        plugin: MinaPlugin,
        initialText: string,
        initialContext: string,
        initialDueDate: string | null,
        isTask: boolean,
        onSave: (newText: string, newContexts: string, newDueDate: string | null, project: string | null) => void,
        customTitle?: string,
        stayOpen: boolean = false
    ) {
        super(app);
        this.plugin = plugin;
        this.initialText = initialText.replace(/<br>/g, '\n');
        this.initialContexts = initialContext ? parseContextString(initialContext) : [];
        this.initialDueDate = initialDueDate;
        this.isTask = isTask;
        this.onSave = onSave;
        this.customTitle = customTitle;
        this.stayOpen = stayOpen;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('mina-clean-modal');

        // Layout Constants
        modalEl.style.width = '650px';
        modalEl.style.maxWidth = '95vw';
        modalEl.style.borderRadius = '20px';
        modalEl.style.padding = '0';
        modalEl.style.overflow = 'hidden';
        modalEl.style.background = 'var(--background-primary)';
        modalEl.style.boxShadow = '0 30px 60px rgba(0,0,0,0.4)';
        modalEl.style.border = '1px solid var(--background-modifier-border-faint)';

        if (Platform.isMobile) {
            modalEl.style.width = '100vw';
            modalEl.style.height = '100vh';
            modalEl.style.borderRadius = '0';
        }

        // 1. MAIN CANVAS
        const canvas = contentEl.createEl('div', {
            attr: { style: 'padding: 32px 32px 10px 32px; display: flex; flex-direction: column; gap: 16px;' }
        });

        const textArea = canvas.createEl('textarea', {
            text: this.initialText,
            attr: { 
                placeholder: this.isTask ? "Execute intent..." : "Capture thought...",
                style: 'width: 100%; min-height: 200px; font-size: 1.25em; line-height: 1.5; font-family: var(--font-text); border: none; background: transparent; color: var(--text-normal); resize: none; outline: none; padding: 0;' 
            }
        });
        textArea.focus();

        // 2. METADATA BAR (DOCK)
        const dock = contentEl.createEl('div', {
            attr: { style: 'padding: 12px 32px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;' }
        });

        const leftDock = dock.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 12px; flex-grow: 1;' } });
        
        // Context Pills
        const chipContainer = leftDock.createDiv({ attr: { style: 'display: flex; gap: 6px; flex-wrap: wrap;' } });
        const renderChips = () => {
            chipContainer.empty();
            this.initialContexts.forEach(ctx => {
                const chip = chipContainer.createEl('span', { 
                    text: `#${ctx}`, 
                    attr: { style: 'font-size: 0.65em; font-weight: 800; padding: 3px 10px; border-radius: 8px; background: var(--background-primary); color: var(--text-muted); border: 1px solid var(--background-modifier-border-faint); text-transform: uppercase; cursor: pointer; transition: all 0.2s;' } 
                });
                chip.addEventListener('click', () => { this.initialContexts = this.initialContexts.filter(c => c !== ctx); renderChips(); });
            });
            const addBtn = chipContainer.createEl('button', { 
                text: '+', 
                attr: { style: 'background: transparent; border: 1px dashed var(--text-faint); color: var(--text-faint); border-radius: 8px; width: 24px; height: 24px; font-size: 0.8em; cursor: pointer;' } 
            });
            addBtn.addEventListener('click', () => {
                new ContextSuggestModal(this.app, this.plugin.settings.contexts, async (ctx) => {
                    if (!this.initialContexts.includes(ctx)) { this.initialContexts.push(ctx); renderChips(); }
                }).open();
            });
        };
        renderChips();

        // Project Chip
        const projectArea = leftDock.createDiv();
        const updateProjectChip = (project: string | null) => {
            projectArea.empty();
            if (!project) return;
            const pChip = projectArea.createEl('span', { 
                text: `[${project}]`, 
                attr: { style: 'font-size: 0.65em; font-weight: 900; color: var(--interactive-accent); text-transform: uppercase; letter-spacing: 0.05em;' } 
            });
            pChip.addEventListener('click', () => { this.currentProject = null; updateProjectChip(null); });
        };
        if (this.currentProject) updateProjectChip(this.currentProject);

        // Date Picker (Tasks only)
        let dateInput: HTMLInputElement | null = null;
        if (this.isTask) {
            dateInput = leftDock.createEl('input', {
                type: 'date',
                value: this.initialDueDate || moment().format('YYYY-MM-DD'),
                attr: { style: 'font-size: 0.7em; background: transparent; border: none; color: var(--text-faint); cursor: pointer;' }
            });
        }

        // 3. ACTION CLUSTER
        const rightDock = dock.createDiv({ attr: { style: 'display: flex; gap: 8px;' } });
        
        const cancelBtn = rightDock.createEl('button', { text: 'CANCEL', attr: { style: 'background: transparent; border: none; color: var(--text-faint); font-size: 0.65em; font-weight: 900; padding: 8px 12px; cursor: pointer;' } });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = rightDock.createEl('button', { 
            text: this.stayOpen ? 'ADD' : 'SAVE', 
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 6px 20px; border-radius: 8px; font-size: 0.7em; font-weight: 900; cursor: pointer; box-shadow: 0 4px 15px rgba(var(--interactive-accent-rgb), 0.3);' } 
        });

        const handleSave = () => {
            if (!textArea.value.trim()) return;
            const text = textArea.value.replace(/\n/g, '<br>');
            const contexts = this.initialContexts.map(c => `#${c}`).join(' ');
            const due = dateInput ? dateInput.value : null;
            this.onSave(text, contexts, due, this.currentProject);
            if (this.stayOpen) { textArea.value = ''; textArea.focus(); new Notice('Capture saved.'); }
            else this.close();
        };

        saveBtn.addEventListener('click', handleSave);
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSave(); }
            if (e.key === 'Escape') this.close();
        });

        // Inline triggers: @ → NLP date, [[ → file link, + at line start → checklist item
        textArea.addEventListener('input', () => {
            const val = textArea.value;
            const pos = textArea.selectionStart ?? val.length;
            const before = val.substring(0, pos);

            // @ trigger → natural language date (fires when space typed after @word)
            // Replaces @word with [[YYYY-MM-DD]] inline and also sets the date input if present
            const atMatch = before.match(/@(\S+)\s$/);
            if (atMatch) {
                const parsed = parseNaturalDate(atMatch[1]);
                if (parsed) {
                    const removeFrom = pos - atMatch[0].length;
                    const wikiDate = `[[${parsed}]] `;
                    textArea.value = val.substring(0, removeFrom) + wikiDate + val.substring(pos);
                    textArea.setSelectionRange(removeFrom + wikiDate.length, removeFrom + wikiDate.length);
                    if (dateInput) {
                        dateInput.value = parsed;
                        dateInput.style.color = 'var(--interactive-accent)';
                        setTimeout(() => { if (dateInput) dateInput.style.color = ''; }, 1500);
                    }
                    return;
                }
            }

            // [[ trigger → wiki-link insertion
            if (before.endsWith('[[')) {
                textArea.value = val.substring(0, pos - 2) + val.substring(pos);
                const insertAt = pos - 2;
                textArea.setSelectionRange(insertAt, insertAt);
                new FileSuggestModal(this.app, (file) => {
                    const link = `[[${file.basename}]]`;
                    const cur = textArea.value;
                    const curPos = textArea.selectionStart ?? insertAt;
                    textArea.value = cur.substring(0, curPos) + link + cur.substring(curPos);
                    textArea.setSelectionRange(curPos + link.length, curPos + link.length);
                    textArea.focus();
                }).open();
                return;
            }

            // + at line start → insert checklist item
            if (before.endsWith('\n+') || before === '+') {
                const insertAt = pos - 1;
                textArea.value = val.substring(0, insertAt) + '- [ ] ' + val.substring(pos);
                textArea.setSelectionRange(insertAt + 6, insertAt + 6);
                return;
            }
        });

        // sec-004: AI Auto-Classification — only runs when user has explicitly opted in
        if (this.plugin.settings.enableAutoClassification) {
            textArea.addEventListener('input', () => {
                if (this.classificationTimeout) clearTimeout(this.classificationTimeout);
                this.classificationTimeout = setTimeout(async () => {
                    const text = textArea.value;
                    if (text.length < 15) return;
                    const projects = this.plugin.index.getProjects();
                    const prompt = `Classify this note into one of these projects: ${projects.join(', ')}. Note: "${text}". Return ONLY the name or "None".`;
                    try {
                        const result = await this.plugin.ai.callGemini(prompt, [], false, [], this.plugin.index.thoughtIndex);
                        const match = projects.find(p => result.includes(p));
                        if (match) { this.currentProject = match; updateProjectChip(match); }
                    } catch (e) {}
                }, 1500);
            });
        }
    }

    onClose() { this.contentEl.empty(); }
}
