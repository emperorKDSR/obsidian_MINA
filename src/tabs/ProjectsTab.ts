import { moment, Platform, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';

export class ProjectsTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderProjectDashboard(container);
    }

    async renderProjectDashboard(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: 2px;' } });
        this.renderHomeIcon(navRow);

        header.createEl('h2', {
            text: 'Projects',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em; line-height: 1.1;' }
        });

        // 2. Project Grid
        const grid = wrap.createEl('div', {
            attr: { style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;' }
        });

        const projects = new Set<string>();
        this.index.thoughtIndex.forEach(t => { if (t.project) projects.add(t.project); });
        this.index.taskIndex.forEach(t => { if (t.project) projects.add(t.project); });

        if (projects.size === 0) {
            wrap.createEl('p', { text: 'No projects found. Add "project: Name" to your notes or tasks.', attr: { style: 'color: var(--text-muted); font-size: 0.9em; font-style: italic; text-align: center; margin-top: 40px;' } });
        } else {
            Array.from(projects).sort().forEach(projectName => {
                const card = grid.createEl('div', {
                    attr: { style: 'background: var(--background-secondary-alt); border-radius: 12px; padding: 16px; border: 1px solid var(--background-modifier-border-faint); cursor: pointer; transition: transform 0.1s;' }
                });
                card.createEl('div', { text: projectName, attr: { style: 'font-weight: 800; font-size: 0.9em; color: var(--text-normal);' } });
                
                const count = Array.from(this.index.taskIndex.values()).filter(t => t.project === projectName && t.status === 'open').length;
                card.createEl('div', { text: `${count} active tasks`, attr: { style: 'font-size: 0.7em; color: var(--text-muted); margin-top: 4px;' } });

                card.addEventListener('click', () => this.renderProjectFocus(container, projectName));
            });
        }
    }

    async renderProjectFocus(container: HTMLElement, projectName: string) {
        container.empty();
        const wrap = container.createEl('div', { attr: { style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1;' } });

        const header = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px;' } });
        const backBtn = header.createEl('button', { text: '←', attr: { style: 'background: transparent; border: none; font-size: 1.2em; cursor: pointer; color: var(--text-muted);' } });
        backBtn.addEventListener('click', () => this.renderProjectDashboard(container));
        header.createEl('h2', { text: projectName, attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800;' } });

        // Quick Add
        const actionRow = wrap.createEl('div', { attr: { style: 'display: flex; gap: 10px;' } });
        const addBtn = (label: string, isTask: boolean) => {
            const btn = actionRow.createEl('button', { text: label, attr: { style: 'flex: 1; padding: 8px; border-radius: 8px; background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border-faint); font-weight: 600; cursor: pointer;' } });
            btn.addEventListener('click', () => {
                new EditEntryModal(this.app, this.plugin, '', '', isTask ? moment().format('YYYY-MM-DD') : null, isTask, async (text, ctxs, due) => {
                    const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                    const file = isTask ? await this.vault.createTaskFile(text, contexts, due || undefined, projectName) : await this.vault.createThoughtFile(text, contexts, projectName);
                    this.renderProjectFocus(container, projectName);
                }, `New ${projectName} ${isTask ? 'Task' : 'Thought'}`).open();
            });
        };
        addBtn('✍️ Note', false);
        addBtn('✅ Task', true);

        // Lists
        const projectTasks = Array.from(this.index.taskIndex.values()).filter(t => t.project === projectName);
        const projectThoughts = Array.from(this.index.thoughtIndex.values()).filter(t => t.project === projectName);

        if (projectTasks.length > 0) {
            wrap.createEl('h3', { text: 'Tasks', attr: { style: 'margin: 10px 0 0 0; font-size: 0.8em; text-transform: uppercase; color: var(--text-faint);' } });
            for (const task of projectTasks) await this.renderTaskRow(task, wrap, true);
        }

        if (projectThoughts.length > 0) {
            wrap.createEl('h3', { text: 'Thoughts', attr: { style: 'margin: 10px 0 0 0; font-size: 0.8em; text-transform: uppercase; color: var(--text-faint);' } });
            projectThoughts.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
            for (const thought of projectThoughts) await this.renderThoughtRow(thought, wrap, thought.filePath, 0, true);
        }
    }
}
