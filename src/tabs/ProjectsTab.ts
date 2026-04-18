import { moment, Platform, MarkdownRenderer, TFile, Notice } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry, TaskEntry } from '../types';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';

export class ProjectsTab extends BaseTab {
    activeProject: string | null = null;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        if (this.activeProject) {
            this.renderProjectDetail(container, this.activeProject);
        } else {
            this.renderProjectDashboard(container);
        }
    }

    async renderProjectDashboard(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 16px 14px 200px 14px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;' }
        });

        header.createEl('h2', {
            text: 'Projects',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        header.createEl('span', {
            text: 'Organize your work by objective.',
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' }
        });

        // 2. Project Grid
        const grid = wrap.createEl('div', {
            attr: { style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 10px;' }
        });

        const projects = this.getAllProjects();

        if (projects.length === 0) {
            wrap.createEl('p', { text: 'No projects found. Add "project: Name" to your notes YAML to start.', attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin-top: 40px; opacity: 0.6;' } });
        } else {
            projects.forEach(name => {
                const card = grid.createEl('div', {
                    attr: { style: 'background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border-faint); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.1s;' }
                });
                
                card.createSpan({ text: '📁', attr: { style: 'font-size: 1.5em;' } });
                card.createEl('div', { text: name, attr: { style: 'font-size: 0.85em; font-weight: 700; color: var(--text-normal); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;' } });

                card.addEventListener('click', () => {
                    this.activeProject = name;
                    this.render(container);
                });
            });
        }
    }

    async renderProjectDetail(container: HTMLElement, projectName: string) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 16px 14px 200px 14px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px;' }
        });

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px;' } });
        
        const backBtn = titleRow.createEl('button', {
            text: '←',
            attr: { style: 'background: transparent; border: none; font-size: 1.2em; color: var(--text-muted); cursor: pointer; padding: 0;' }
        });
        backBtn.addEventListener('click', () => {
            this.activeProject = null;
            this.render(container);
        });

        titleRow.createEl('h2', {
            text: projectName,
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        // 2. Action Row
        const actionRow = header.createEl('div', {
            attr: { style: 'display: flex; gap: 8px; margin-top: 4px;' }
        });

        const actionBtnStyle = 'flex: 1; padding: 8px; border-radius: 10px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary); color: var(--text-normal); font-size: 0.75em; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.1s;';

        const addNoteBtn = actionRow.createEl('button', { attr: { style: actionBtnStyle } });
        addNoteBtn.createSpan({ text: '✍️' }); addNoteBtn.createSpan({ text: 'Add Note' });
        addNoteBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', '', null, false, async (text, ctxs) => {
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                const file = await this.view.plugin.createThoughtFile(text, contexts);
                await this.app.fileManager.processFrontMatter(file, (fm) => { fm['project'] = projectName; });
                this.render(container);
            }, `New ${projectName} Note`).open();
        });

        const addTaskBtn = actionRow.createEl('button', { attr: { style: actionBtnStyle } });
        addTaskBtn.createSpan({ text: '✅' }); addTaskBtn.createSpan({ text: 'Add Task' });
        addTaskBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                const file = await this.view.plugin.createTaskFile(text, contexts, due || undefined);
                await this.app.fileManager.processFrontMatter(file, (fm) => { fm['project'] = projectName; });
                this.render(container);
            }, `New ${projectName} Task`).open();
        });

        // 3. Lists
        const projectTasks = Array.from(this.view.plugin.taskIndex.values()).filter(t => t.project === projectName && t.status === 'open');
        const projectThoughts = Array.from(this.view.plugin.thoughtIndex.values()).filter(t => t.project === projectName);

        if (projectTasks.length > 0) {
            const taskHeader = wrap.createEl('div', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 6px;' } });
            taskHeader.createEl('span', { text: 'Pending Tasks', attr: { style: 'font-size: 0.7em; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;' } });
            const taskList = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px;' } });
            for (const task of projectTasks) await this.renderTaskRow(task, taskList, true);
        }

        if (projectThoughts.length > 0) {
            const thoughtHeader = wrap.createEl('div', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 6px;' } });
            thoughtHeader.createEl('span', { text: 'Project Notes', attr: { style: 'font-size: 0.7em; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;' } });
            const thoughtList = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px;' } });
            projectThoughts.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
            for (const thought of projectThoughts) await this.renderThoughtRow(thought, thoughtList, thought.filePath, 0, true, true);
        }
    }

    private getAllProjects(): string[] {
        const projects = new Set<string>();
        this.view.plugin.thoughtIndex.forEach(t => { if (t.project) projects.add(t.project); });
        this.view.plugin.taskIndex.forEach(t => { if (t.project) projects.add(t.project); });
        return Array.from(projects).sort();
    }
}
