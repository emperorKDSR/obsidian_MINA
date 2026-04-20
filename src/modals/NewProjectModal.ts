import { App, Modal, moment } from 'obsidian';
import type { ProjectEntry } from '../types';
import type { VaultService } from '../services/VaultService';

const PROJECT_COLORS = [
    { hex: '#6366f1', label: 'Indigo' },
    { hex: '#8b5cf6', label: 'Purple' },
    { hex: '#ec4899', label: 'Pink' },
    { hex: '#f59e0b', label: 'Amber' },
    { hex: '#10b981', label: 'Emerald' },
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#ef4444', label: 'Red' },
    { hex: '#64748b', label: 'Slate' },
];

export class NewProjectModal extends Modal {
    private vaultService: VaultService;
    private onCreated: (entry: ProjectEntry) => void;

    private name = '';
    private goal = '';
    private status: ProjectEntry['status'] = 'active';
    private due = '';
    private color = '#6366f1';

    constructor(app: App, vaultService: VaultService, onCreated: (entry: ProjectEntry) => void) {
        super(app);
        this.vaultService = vaultService;
        this.onCreated = onCreated;
    }

    onOpen() {
        this.modalEl.addClass('mina-new-project-modal');
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'New Project', cls: 'mina-modal-title' });

        // Name
        const nameWrap = contentEl.createDiv('mina-field-group');
        nameWrap.createEl('label', { text: 'Project Name', cls: 'mina-field-label' });
        const nameInput = nameWrap.createEl('input', {
            type: 'text',
            cls: 'mina-field-input',
            attr: { placeholder: 'e.g. Launch MINA Plugin', autocomplete: 'off' }
        });
        nameInput.value = this.name;
        nameInput.addEventListener('input', () => { this.name = nameInput.value.trim(); });
        setTimeout(() => nameInput.focus(), 50);

        // Goal
        const goalWrap = contentEl.createDiv('mina-field-group');
        goalWrap.createEl('label', { text: 'Goal / Outcome', cls: 'mina-field-label' });
        const goalTextarea = goalWrap.createEl('textarea', {
            cls: 'mina-field-textarea',
            attr: { placeholder: 'What does success look like?', rows: '3' }
        });
        goalTextarea.value = this.goal;
        goalTextarea.addEventListener('input', () => { this.goal = goalTextarea.value.trim(); });

        // Status
        const statusWrap = contentEl.createDiv('mina-field-group');
        statusWrap.createEl('label', { text: 'Status', cls: 'mina-field-label' });
        const segBar = statusWrap.createDiv('mina-seg-bar');
        const statuses: { val: ProjectEntry['status']; label: string }[] = [
            { val: 'active', label: 'Active' },
            { val: 'on-hold', label: 'On Hold' },
        ];
        const segBtns: HTMLButtonElement[] = [];
        statuses.forEach(s => {
            const btn = segBar.createEl('button', { text: s.label, cls: 'mina-seg-btn' });
            if (s.val === this.status) btn.addClass('is-active');
            btn.addEventListener('click', () => {
                this.status = s.val;
                segBtns.forEach(b => b.removeClass('is-active'));
                btn.addClass('is-active');
            });
            segBtns.push(btn);
        });

        // Due date
        const dueWrap = contentEl.createDiv('mina-field-group');
        dueWrap.createEl('label', { text: 'Due Date (optional)', cls: 'mina-field-label' });
        const dueInput = dueWrap.createEl('input', {
            type: 'date',
            cls: 'mina-field-input'
        });
        dueInput.value = this.due;
        dueInput.addEventListener('change', () => { this.due = dueInput.value; });

        // Color picker
        const colorWrap = contentEl.createDiv('mina-field-group');
        colorWrap.createEl('label', { text: 'Color', cls: 'mina-field-label' });
        const colorPicker = colorWrap.createDiv('mina-project-color-picker');
        const swatches: HTMLElement[] = [];
        PROJECT_COLORS.forEach(c => {
            const swatch = colorPicker.createDiv('mina-color-swatch');
            swatch.style.setProperty('--swatch-color', c.hex);
            swatch.setAttribute('title', c.label);
            if (c.hex === this.color) swatch.addClass('is-selected');
            swatch.addEventListener('click', () => {
                this.color = c.hex;
                swatches.forEach(s => s.removeClass('is-selected'));
                swatch.addClass('is-selected');
            });
            swatches.push(swatch);
        });

        // Actions
        const actions = contentEl.createDiv('mina-modal-actions');
        const cancelBtn = actions.createEl('button', { text: 'Cancel', cls: 'mina-btn mina-btn--ghost' });
        cancelBtn.addEventListener('click', () => this.close());

        const createBtn = actions.createEl('button', { text: 'Create Project', cls: 'mina-btn mina-btn--primary' });
        createBtn.addEventListener('click', () => this.submit());

        // Allow Enter to submit from name field
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
            if (e.key === 'Escape') this.close();
        });
    }

    private async submit() {
        if (!this.name) return;
        const id = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const entry: ProjectEntry = {
            id,
            name: this.name,
            status: this.status,
            goal: this.goal,
            due: this.due || undefined,
            created: moment().format('YYYY-MM-DD HH:mm:ss'),
            color: this.color,
            filePath: '',
        };
        try {
            const file = await this.vaultService.createProject(entry);
            entry.filePath = file.path;
            this.onCreated(entry);
            this.close();
        } catch (e) {
            console.error('[MINA] createProject failed', e);
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
