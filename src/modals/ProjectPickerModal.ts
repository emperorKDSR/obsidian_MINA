import { App, SuggestModal } from 'obsidian';
import type { ProjectEntry } from '../types';

export class ProjectPickerModal extends SuggestModal<ProjectEntry | null> {
    private projects: ProjectEntry[];
    private onChoose: (project: ProjectEntry | null) => void;

    constructor(app: App, projects: ProjectEntry[], onChoose: (project: ProjectEntry | null) => void) {
        super(app);
        this.projects = projects;
        this.onChoose = onChoose;
        this.setPlaceholder('Search projects…');
    }

    getSuggestions(query: string): (ProjectEntry | null)[] {
        const q = query.toLowerCase().trim();
        const activeProjects = this.projects
            .filter(p => p.status !== 'archived')
            .filter(p => !q || p.name.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
        return [null, ...activeProjects];
    }

    renderSuggestion(item: ProjectEntry | null, el: HTMLElement) {
        if (!item) {
            el.style.cssText = 'display:flex; align-items:center; gap:8px; color:var(--text-muted);';
            el.createSpan({ text: '✕', attr: { style: 'font-weight:700;' } });
            el.createSpan({ text: 'No project (clear)' });
            return;
        }
        el.style.cssText = 'display:flex; align-items:center; gap:8px;';
        const dot = el.createSpan();
        dot.style.cssText = `width:10px; height:10px; border-radius:50%; background:${item.color || 'var(--interactive-accent)'}; flex-shrink:0;`;
        const name = el.createSpan({ text: item.name });
        name.style.cssText = 'font-weight:600; flex:1;';
        const badge = el.createSpan({ text: item.status });
        badge.style.cssText = 'font-size:0.7em; color:var(--text-faint); text-transform:uppercase; letter-spacing:0.05em;';
    }

    onChooseSuggestion(item: ProjectEntry | null) {
        this.onChoose(item);
    }
}
