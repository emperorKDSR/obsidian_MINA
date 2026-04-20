import { moment, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';
import { NewProjectModal } from '../modals/NewProjectModal';
import { EditProjectModal } from '../modals/EditProjectModal';
import type { ProjectEntry } from '../types';

type ProjectFilter = 'all' | 'active' | 'on-hold' | 'completed';

const FILTER_LABELS: { val: ProjectFilter; label: string }[] = [
    { val: 'all', label: 'All' },
    { val: 'active', label: 'Active' },
    { val: 'on-hold', label: 'On Hold' },
    { val: 'completed', label: 'Completed' },
];

const STATUS_ORDER: ProjectEntry['status'][] = ['active', 'on-hold', 'completed', 'archived'];

const STATUS_LABELS: Record<ProjectEntry['status'], string> = {
    active: 'Active',
    'on-hold': 'On Hold',
    completed: 'Completed',
    archived: 'Archived',
};

export class ProjectsTab extends BaseTab {
    private filter: ProjectFilter = 'all';
    private expandedIds: Set<string> = new Set();

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createDiv('mina-projects-wrap');

        // Header
        const header = wrap.createDiv('mina-projects-header');
        header.createEl('h2', { text: 'Projects', cls: 'mina-projects-title' });
        const newBtn = header.createEl('button', { text: '+ New', cls: 'mina-btn mina-btn--primary mina-btn--sm' });
        newBtn.addEventListener('click', () => {
            new NewProjectModal(this.app, this.vault, (entry) => {
                this.index.projectIndex.set(entry.id, entry);
                this.render(container);
            }).open();
        });

        // Filter pills
        const filterRow = wrap.createDiv('mina-filter-pills');
        FILTER_LABELS.forEach(f => {
            const pill = filterRow.createEl('button', { text: f.label, cls: 'mina-filter-pill' });
            if (f.val === this.filter) pill.addClass('is-active');
            pill.addEventListener('click', () => {
                this.filter = f.val;
                this.render(container);
            });
        });

        // Get and sort projects
        const allProjects = Array.from(this.index.projectIndex.values());
        const visible = allProjects
            .filter(p => p.status !== 'archived')
            .filter(p => this.filter === 'all' || p.status === this.filter)
            .sort((a, b) => {
                const oa = STATUS_ORDER.indexOf(a.status);
                const ob = STATUS_ORDER.indexOf(b.status);
                if (oa !== ob) return oa - ob;
                return a.name.localeCompare(b.name);
            });

        if (visible.length === 0) {
            const empty = wrap.createDiv('mina-empty-state');
            empty.createEl('p', { text: 'No projects yet. Tap "+ New" to create one.', cls: 'mina-empty-msg' });
            return;
        }

        const list = wrap.createDiv('mina-projects-list');
        visible.forEach(p => this.renderCard(list, p, container));
    }

    private renderCard(list: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement) {
        const card = list.createDiv({ cls: `mina-project-card mina-project-card--${project.status}` });
        if (project.color) card.style.setProperty('--project-color', project.color);

        // Task counts from index
        const tasks = Array.from(this.index.taskIndex.values())
            .filter(t => t.project === project.id || t.project === project.name);
        const openCount = tasks.filter(t => t.status === 'open').length;
        const doneCount = tasks.filter(t => t.status === 'done').length;
        const totalCount = tasks.length;

        // Card header row
        const cardHeader = card.createDiv('mina-project-card__header');
        const nameLine = cardHeader.createDiv('mina-project-card__name-line');
        nameLine.createEl('span', { text: project.name, cls: 'mina-project-card__name' });

        // Status badge (clickable)
        const badge = nameLine.createEl('span', {
            text: STATUS_LABELS[project.status],
            cls: `mina-status-badge mina-status--${project.status}`
        });
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openStatusPicker(badge, project, rootContainer);
        });

        // Header actions cluster (edit button)
        const headerActions = nameLine.createDiv('mina-project-card__header-actions');
        const editBtn = headerActions.createEl('button', {
            cls: 'mina-project-card__edit-btn',
            attr: { 'aria-label': `Edit ${project.name}`, title: 'Edit project' }
        });
        const editIcon = editBtn.createEl('span');
        setIcon(editIcon, 'pencil');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new EditProjectModal(this.app, this.vault, project, (updated) => {
                this.index.projectIndex.set(updated.id, updated);
                this.render(rootContainer);
            }).open();
        });

        // Goal text
        if (project.goal) {
            card.createEl('p', { text: project.goal, cls: 'mina-project-card__goal' });
        }

        // Meta row
        const meta = card.createDiv('mina-project-card__meta');
        if (totalCount > 0) {
            meta.createEl('span', { text: `${openCount} open · ${doneCount} done`, cls: 'mina-project-card__task-count' });
        }
        if (project.due) {
            const dueM = moment(project.due);
            const isOverdue = dueM.isBefore(moment(), 'day');
            meta.createEl('span', {
                text: `📅 ${dueM.format('MMM D')}`,
                cls: `mina-chip mina-chip--date${isOverdue ? ' is-overdue' : ''}`
            });
        }

        // Next task preview
        const nextTask = tasks.filter(t => t.status === 'open').sort((a, b) => {
            if (a.due && b.due) return a.due.localeCompare(b.due);
            if (a.due) return -1;
            if (b.due) return 1;
            return 0;
        })[0];
        if (nextTask) {
            const nextRow = card.createDiv('mina-project-card__next');
            nextRow.createEl('span', { text: 'NEXT', cls: 'mina-project-card__next-label' });
            nextRow.createEl('span', { text: nextTask.title, cls: 'mina-project-card__next-title' });
        }

        // Expand toggle
        const isExpanded = this.expandedIds.has(project.id);
        const expandPanel = card.createDiv({ cls: `mina-project-card__expand${isExpanded ? ' is-open' : ''}` });

        // Expand toggle button
        const toggleRow = card.createDiv('mina-project-card__toggle-row');
        const toggleBtn = toggleRow.createEl('button', { cls: 'mina-project-card__toggle-btn' });
        const toggleIcon = toggleBtn.createEl('span');
        setIcon(toggleIcon, isExpanded ? 'chevron-up' : 'chevron-down');
        toggleBtn.addEventListener('click', () => {
            if (this.expandedIds.has(project.id)) {
                this.expandedIds.delete(project.id);
            } else {
                this.expandedIds.add(project.id);
            }
            this.render(rootContainer);
        });

        if (isExpanded) {
            this.renderExpandPanel(expandPanel, project, rootContainer);
        }
    }

    private renderExpandPanel(panel: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement) {
        panel.empty();

        // Task list (max 5)
        const tasks = Array.from(this.index.taskIndex.values())
            .filter(t => t.project === project.id || t.project === project.name)
            .filter(t => t.status === 'open')
            .slice(0, 5);

        if (tasks.length > 0) {
            const taskList = panel.createDiv('mina-project-expand__tasks');
            tasks.forEach(task => {
                const row = taskList.createDiv('mina-project-expand__task-row');
                const dot = row.createEl('span', { cls: 'mina-project-expand__dot' });
                setIcon(dot, 'circle');
                row.createEl('span', { text: task.title, cls: 'mina-project-expand__task-title' });
                if (task.due) {
                    row.createEl('span', { text: moment(task.due).format('MMM D'), cls: 'mina-chip mina-chip--date mina-chip--sm' });
                }
            });
        }

        // Actions
        const actions = panel.createDiv('mina-project-expand__actions');

        const viewBtn = actions.createEl('button', { text: 'View', cls: 'mina-btn mina-btn--ghost mina-btn--sm' });
        viewBtn.addEventListener('click', () => {
            const file = this.app.vault.getAbstractFileByPath(project.filePath);
            if (file instanceof TFile) this.app.workspace.getLeaf().openFile(file);
        });

        const archiveBtn = actions.createEl('button', { text: 'Archive', cls: 'mina-btn mina-btn--danger mina-btn--sm' });
        archiveBtn.addEventListener('click', async () => {
            const file = this.app.vault.getAbstractFileByPath(project.filePath);
            if (file instanceof TFile) {
                await this.vault.archiveProject(file);
                this.index.projectIndex.delete(project.id);
                this.expandedIds.delete(project.id);
                this.render(rootContainer);
            }
        });
    }

    private openStatusPicker(anchor: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement) {
        const existing = document.querySelector('.mina-status-picker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.className = 'mina-status-picker';

        const statuses: ProjectEntry['status'][] = ['active', 'on-hold', 'completed'];
        statuses.forEach(s => {
            const opt = picker.createEl('button', {
                text: STATUS_LABELS[s],
                cls: `mina-status-picker__opt mina-status--${s}${s === project.status ? ' is-current' : ''}`
            });
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                const file = this.app.vault.getAbstractFileByPath(project.filePath);
                if (file instanceof TFile) {
                    await this.vault.updateProject(file, { status: s });
                    project.status = s;
                    this.index.projectIndex.set(project.id, project);
                }
                picker.remove();
                this.render(rootContainer);
            });
        });

        document.body.appendChild(picker);

        // Position near anchor
        const rect = anchor.getBoundingClientRect();
        picker.style.top = `${rect.bottom + 4}px`;
        picker.style.left = `${rect.left}px`;

        // Close on outside click
        const close = (e: MouseEvent) => {
            if (!picker.contains(e.target as Node)) {
                picker.remove();
                document.removeEventListener('click', close, true);
            }
        };
        setTimeout(() => document.addEventListener('click', close, true), 10);
    }
}
