import { moment, TFile, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { NewProjectModal } from '../modals/NewProjectModal';
import { EditProjectModal } from '../modals/EditProjectModal';
import type { ProjectEntry, Milestone } from '../types';

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

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createDiv('diwa-projects-wrap');

        // Header
        const header = wrap.createDiv('diwa-projects-header');
        header.createEl('h2', { text: 'Projects', cls: 'diwa-projects-title' });
        const newBtn = header.createEl('button', { text: '+ New', cls: 'diwa-btn diwa-btn--primary diwa-btn--sm' });
        newBtn.addEventListener('click', () => {
            new NewProjectModal(this.app, this.vault, (entry) => {
                this.index.projectIndex.set(entry.id, entry);
                this.render(container);
            }).open();
        });

        // Filter pills
        const filterRow = wrap.createDiv('diwa-filter-pills');
        FILTER_LABELS.forEach(f => {
            const pill = filterRow.createEl('button', { text: f.label, cls: 'diwa-filter-pill' });
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
            const empty = wrap.createDiv('diwa-empty-state');
            empty.createEl('p', { text: 'No projects yet. Tap "+ New" to create one.', cls: 'diwa-empty-msg' });
            return;
        }

        const list = wrap.createDiv('diwa-projects-list');
        visible.forEach(p => this.renderCard(list, p, container));
    }

    private renderCard(list: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement) {
        const card = list.createDiv({ cls: `diwa-project-card diwa-project-card--${project.status}` });
        if (project.color) card.style.setProperty('--project-color', project.color);

        // Task counts from index
        const tasks = Array.from(this.index.taskIndex.values())
            .filter(t => t.project === project.id || t.project === project.name);
        const openCount = tasks.filter(t => t.status === 'open').length;
        const doneCount = tasks.filter(t => t.status === 'done').length;
        const totalCount = tasks.length;

        // Card header row
        const cardHeader = card.createDiv('diwa-project-card__header');
        const nameLine = cardHeader.createDiv('diwa-project-card__name-line');
        nameLine.createEl('span', { text: project.name, cls: 'diwa-project-card__name' });

        // Status badge (clickable)
        const badge = nameLine.createEl('span', {
            text: STATUS_LABELS[project.status],
            cls: `diwa-status-badge diwa-status--${project.status}`
        });
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openStatusPicker(badge, project, rootContainer);
        });

        // Header actions cluster (edit button)
        const headerActions = nameLine.createDiv('diwa-project-card__header-actions');
        const editBtn = headerActions.createEl('button', {
            cls: 'diwa-project-card__edit-btn',
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
            card.createEl('p', { text: project.goal, cls: 'diwa-project-card__goal' });
        }

        // Meta row
        const meta = card.createDiv('diwa-project-card__meta');
        if (totalCount > 0) {
            meta.createEl('span', { text: `${openCount} open · ${doneCount} done`, cls: 'diwa-project-card__task-count' });
        }
        if (project.due) {
            const dueM = moment(project.due);
            const isOverdue = dueM.isBefore(moment(), 'day');
            meta.createEl('span', {
                text: `📅 ${dueM.format('MMM D')}`,
                cls: `diwa-chip diwa-chip--date${isOverdue ? ' is-overdue' : ''}`
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
            const nextRow = card.createDiv('diwa-project-card__next');
            nextRow.createEl('span', { text: 'NEXT', cls: 'diwa-project-card__next-label' });
            nextRow.createEl('span', { text: nextTask.title, cls: 'diwa-project-card__next-title' });
        }

        // Expand toggle
        const isExpanded = this.expandedIds.has(project.id);
        const expandPanel = card.createDiv({ cls: `diwa-project-card__expand${isExpanded ? ' is-open' : ''}` });

        // Expand toggle button
        const toggleRow = card.createDiv('diwa-project-card__toggle-row');
        const toggleBtn = toggleRow.createEl('button', { cls: 'diwa-project-card__toggle-btn' });
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
            const taskList = panel.createDiv('diwa-project-expand__tasks');
            tasks.forEach(task => {
                const row = taskList.createDiv('diwa-project-expand__task-row');
                const dot = row.createEl('span', { cls: 'diwa-project-expand__dot' });
                setIcon(dot, 'circle');
                row.createEl('span', { text: task.title, cls: 'diwa-project-expand__task-title' });
                if (task.due) {
                    row.createEl('span', { text: moment(task.due).format('MMM D'), cls: 'diwa-chip diwa-chip--date diwa-chip--sm' });
                }
            });
        }

        // Actions
        const actions = panel.createDiv('diwa-project-expand__actions');

        const viewBtn = actions.createEl('button', { text: 'View', cls: 'diwa-btn diwa-btn--ghost diwa-btn--sm' });
        viewBtn.addEventListener('click', () => {
            const file = this.app.vault.getAbstractFileByPath(project.filePath);
            if (file instanceof TFile) this.app.workspace.getLeaf().openFile(file);
        });

        const archiveBtn = actions.createEl('button', { text: 'Archive', cls: 'diwa-btn diwa-btn--danger diwa-btn--sm' });
        archiveBtn.addEventListener('click', async () => {
            const file = this.app.vault.getAbstractFileByPath(project.filePath);
            if (file instanceof TFile) {
                await this.vault.archiveProject(file);
                this.index.projectIndex.delete(project.id);
                this.expandedIds.delete(project.id);
                this.render(rootContainer);
            }
        });

        // Milestones section
        this.renderMilestonesSection(panel, project, rootContainer);
    }

    private renderMilestonesSection(panel: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement) {
        const wrap = panel.createDiv('diwa-milestones-wrap');

        // Collapsible toggle header
        const toggle = wrap.createEl('button', { text: '▸ Milestones', cls: 'diwa-milestones-toggle' });
        const body = wrap.createDiv('diwa-milestones-body');
        body.style.display = 'none';

        let isOpen = false;
        const toggleOpen = () => {
            isOpen = !isOpen;
            toggle.textContent = `${isOpen ? '▾' : '▸'} Milestones`;
            body.style.display = isOpen ? '' : 'none';
            if (isOpen) this.loadAndRenderMilestones(body, project, rootContainer);
        };
        toggle.addEventListener('click', toggleOpen);
    }

    private loadAndRenderMilestones(container: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement) {
        container.empty();
        const loading = container.createEl('span', { text: 'Loading…', cls: 'diwa-milestones-loading' });

        this.vault.readMilestones(project.filePath).then(milestones => {
            loading.remove();
            this.renderMilestonesBody(container, milestones, project, rootContainer);
        }).catch(() => {
            loading.textContent = 'Failed to load milestones.';
        });
    }

    private renderMilestonesBody(container: HTMLElement, milestones: Milestone[], project: ProjectEntry, rootContainer: HTMLElement) {
        const done = milestones.filter(m => m.done).length;
        const total = milestones.length;

        // Progress bar
        if (total > 0) {
            const progressWrap = container.createDiv('diwa-milestone-progress-wrap');
            progressWrap.createEl('span', { text: `${done}/${total} complete`, cls: 'diwa-milestone-progress-label' });
            const track = progressWrap.createDiv('diwa-milestone-progress-track');
            const bar = track.createDiv('diwa-milestone-progress');
            bar.style.width = `${Math.round((done / total) * 100)}%`;
        }

        // Milestone list
        milestones.forEach((m, idx) => {
            const row = container.createDiv('diwa-milestone-row');
            const cb = row.createEl('input', { attr: { type: 'checkbox' } }) as HTMLInputElement;
            cb.checked = m.done;
            cb.addEventListener('change', async () => {
                milestones[idx].done = cb.checked;
                await this.vault.writeMilestones(project.filePath, milestones);
                this.renderMilestonesBody(container, milestones, project, rootContainer);
            });
            row.createEl('span', { text: m.title, cls: `diwa-milestone-title${m.done ? ' is-done' : ''}` });
            if (m.dueDate) {
                row.createEl('span', { text: m.dueDate, cls: 'diwa-chip diwa-chip--date diwa-chip--sm' });
            }
        });

        // Add milestone form
        const addRow = container.createDiv('diwa-milestone-add-row');
        const titleInput = addRow.createEl('input', {
            cls: 'diwa-milestone-add-input',
            attr: { type: 'text', placeholder: 'New milestone…' }
        }) as HTMLInputElement;
        const dateInput = addRow.createEl('input', {
            cls: 'diwa-milestone-add-date',
            attr: { type: 'date' }
        }) as HTMLInputElement;
        const addBtn = addRow.createEl('button', { text: '+ Add', cls: 'diwa-btn diwa-btn--ghost diwa-btn--sm' });
        addBtn.addEventListener('click', async () => {
            const title = titleInput.value.trim();
            if (!title) return;
            const newMilestone: Milestone = {
                id: `m-${Date.now()}`,
                title,
                done: false,
                dueDate: dateInput.value || undefined,
            };
            milestones.push(newMilestone);
            await this.vault.writeMilestones(project.filePath, milestones);
            titleInput.value = '';
            dateInput.value = '';
            this.renderMilestonesBody(container, milestones, project, rootContainer);
        });
        titleInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') addBtn.click();
        });
    }

    private openStatusPicker(anchor: HTMLElement, project: ProjectEntry, rootContainer: HTMLElement) {
        const existing = document.querySelector('.diwa-status-picker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.className = 'diwa-status-picker';

        const statuses: ProjectEntry['status'][] = ['active', 'on-hold', 'completed'];
        statuses.forEach(s => {
            const opt = picker.createEl('button', {
                text: STATUS_LABELS[s],
                cls: `diwa-status-picker__opt diwa-status--${s}${s === project.status ? ' is-current' : ''}`
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

