import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { DAILY_ICON_ID, TASK_ICON_ID, PF_ICON_ID, PROJECT_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID, COMPASS_ICON_ID, SETTINGS_ICON_ID, VOICE_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID } from '../constants';
import { parseContextString } from '../utils';

export class CommandCenterTab extends BaseTab {
    private parentContainer: HTMLElement;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.parentContainer = container;
        container.empty();
        container.addClass('mina-cockpit-root');
        if (this.view.isZenMode) container.addClass('is-zen-mode');
        else container.removeClass('is-zen-mode');

        const wrap = container.createEl('div', {
            attr: { style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 900px; margin: 0 auto;' }
        });

        this.renderHeader(wrap);
        this.renderTacticalStack(wrap);
        this.renderNavigationFooter(wrap);
    }

    private renderHeader(parent: HTMLElement) {
        const headerRow = parent.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: -16px;' } });
        const topRow = headerRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
        
        topRow.createEl('h1', { text: `${greeting}, Emperor!`, attr: { style: 'margin: 0; font-size: 2em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.04em;' } });

        const vision = this.settings.northStarGoals?.[0];
        if (vision) topRow.createEl('p', { text: `Objective: ${vision}`, attr: { style: 'margin: 0; font-size: 0.9em; color: var(--text-muted); font-weight: 600; font-style: italic; opacity: 0.8;' } });

        const zenToggle = headerRow.createEl('button', {
            attr: { 
                title: this.view.isZenMode ? 'Exit Zen' : 'Enter Zen',
                style: `background: ${this.view.isZenMode ? 'var(--interactive-accent)' : 'var(--background-secondary-alt)'}; color: ${this.view.isZenMode ? 'var(--text-on-accent)' : 'var(--text-muted)'}; border: none; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: var(--mina-shadow);` 
            }
        });
        setIcon(zenToggle, 'lucide-target');
        zenToggle.addEventListener('click', () => { this.view.isZenMode = !this.view.isZenMode; this.render(this.parentContainer); });
    }

    private renderTacticalStack(parent: HTMLElement) {
        const stack = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px;' } });

        // 1. Global Capture
        const cap = stack.createEl('div', { attr: { style: 'background: var(--background-secondary-alt); border-radius: 20px; padding: 16px 20px; border: 1px solid var(--background-modifier-border-faint); cursor: text; transition: all 0.2s; box-shadow: var(--mina-shadow); display: flex; align-items: center; gap: 12px;' } });
        const capIcon = cap.createDiv(); setIcon(capIcon, 'lucide-plus-circle'); capIcon.style.color = 'var(--interactive-accent)';
        cap.createEl('span', { text: "Focus your intent...", attr: { style: 'color: var(--text-faint); font-size: 1.1em; font-weight: 500;' } });
        cap.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', null, false, async (text, ctxs) => {
                if (!text.trim()) return;
                await this.vault.createThoughtFile(text, parseContextString(ctxs));
            }, 'Global Capture').open();
        });

        // 2. Intelligence
        const intel = stack.createEl('div', { cls: 'mina-card', attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 14px; border-width: 1.5px;' } });
        const intelHeader = intel.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        const intelTitle = intelHeader.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
        const iIcon = intelTitle.createDiv(); setIcon(iIcon, 'lucide-sparkles'); iIcon.style.color = 'var(--interactive-accent)';
        intelTitle.createSpan({ text: 'INTELLIGENCE', attr: { style: 'font-size: 0.6em; font-weight: 900; color: var(--interactive-accent); letter-spacing: 0.15em;' } });
        const analyzeBtn = intelHeader.createEl('button', { text: 'ANALYZE', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; font-size: 0.65em; padding: 4px 12px; cursor: pointer; font-weight: 700; box-shadow: 0 4px 10px rgba(var(--interactive-accent-rgb), 0.2);' } });
        
        const summaryPlaceholder = intel.createEl('div', { text: 'Strategic briefing pending analysis.', attr: { style: 'font-size: 0.9em; color: var(--text-muted); font-style: italic; line-height: 1.6; opacity: 0.8;' } });
        
        analyzeBtn.addEventListener('click', async () => {
            summaryPlaceholder.empty();
            const loading = summaryPlaceholder.createEl('div', { text: 'Synthesizing Personal OS...', attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            const spin = loading.createDiv(); setIcon(spin, 'lucide-loader-2'); spin.style.animation = 'spin 1s linear infinite';
            try {
                // life-ai-ground: Build real context from live indices instead of empty placeholder
                const idx = this.index;
                const today = moment().startOf('day');
                const openTasks = Array.from(idx.taskIndex.values()).filter(t => t.status === 'open');
                const overdueTasks = openTasks.filter(t => t.due && moment(t.due, 'YYYY-MM-DD', true).isValid() && moment(t.due, 'YYYY-MM-DD').isBefore(today, 'day'));
                const unprocessedThoughts = Array.from(idx.thoughtIndex.values()).filter(t => !t.synthesized);
                const completedHabits = idx.habitStatusIndex.length;
                const totalHabits = this.settings.habits?.length || 0;

                const contextBlock = [
                    `## Personal OS Status — ${moment().format('dddd, MMMM D, YYYY')}`,
                    `**Open Tasks:** ${openTasks.length} (${overdueTasks.length} overdue)`,
                    `**Habits Today:** ${completedHabits}/${totalHabits} completed`,
                    `**Unprocessed Thoughts:** ${unprocessedThoughts.length}`,
                    `**Total Financial Obligations:** $${(idx.totalDues || 0).toFixed(2)}`,
                    (this.settings.weeklyGoals?.length ? `**Weekly Goals:** ${this.settings.weeklyGoals.join(', ')}` : ''),
                    (this.settings.northStarGoals?.length ? `**North Star:** ${this.settings.northStarGoals[0]}` : ''),
                    (overdueTasks.length > 0 ? `**Overdue Tasks:** ${overdueTasks.slice(0, 5).map(t => t.title).join(', ')}` : ''),
                ].filter(Boolean).join('\n');

                const summary = await this.ai.callGemini(
                    `${contextBlock}\n\nGive me a sharp strategic briefing: what needs my attention right now? What's on track? What's at risk? Be direct, no fluff.`,
                    [], false, [], idx.thoughtIndex
                );
                loading.remove();
                summaryPlaceholder.setText(summary);
                summaryPlaceholder.style.fontStyle = 'normal';
                summaryPlaceholder.style.opacity = '1';
            } catch (e: any) { loading.setText('Intelligence offline: ' + e.message); }
        });

        this.renderExecutionUnit(stack);
    }

    private renderExecutionUnit(parent: HTMLElement) {
        const unit = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 16px;' } });

        // DAILY ROUTINE (Checklist from Index)
        if (this.index.checklistIndex.length > 0) {
            unit.createEl('h3', { text: 'DAILY ROUTINE', attr: { style: 'margin: 0; font-size: 0.7em; font-weight: 900; letter-spacing: 0.2em; color: var(--text-faint);' } });
            const list = unit.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 6px;' } });
            this.index.checklistIndex.forEach(item => {
                this.renderTacticalRow(list, item.text, item.done, async () => {
                    item.done = !item.done;
                    this.render(this.parentContainer);
                    const file = this.app.vault.getAbstractFileByPath(`${this.settings.captureFolder}/${this.settings.captureFilePath}`) as TFile;
                    if (file) {
                        const content = await this.app.vault.read(file);
                        const updated = content.replace(item.line, item.line.replace(item.done ? '- [ ]' : '- [x]', item.done ? '- [x]' : '- [ ]'));
                        await this.app.vault.modify(file, updated);
                    }
                });
            });
        }
    }

    private renderTacticalRow(parent: HTMLElement, text: string, done: boolean, onToggle: () => void, meta?: string) {
        const row = parent.createEl('div', { cls: 'mina-tactical-row' + (done ? ' is-done' : ''), attr: { style: 'cursor: default;' } });
        const cbWrap = row.createDiv({ attr: { style: 'padding: 4px; cursor: pointer;' } });
        const cb = cbWrap.createDiv({ cls: 'mina-tactical-checkbox' });
        if (done) setIcon(cb, 'lucide-check');
        cbWrap.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
        const label = row.createEl('span', { text, cls: 'mina-tactical-text', attr: { style: `${done ? 'text-decoration: line-through;' : ''}` } });
        if (meta) row.createEl('span', { text: meta, attr: { style: 'font-size: 0.65em; font-weight: 800; color: var(--text-muted); margin-left: auto; white-space: nowrap; opacity: 0.6;' } });
    }

    private renderNavigationFooter(parent: HTMLElement) {
        const nav = parent.createEl('div', { cls: 'mina-nav-container', attr: { style: 'margin-top: 20px; display: flex; flex-direction: column; gap: 24px;' } });
        const renderCluster = (title: string, items: {label: string, icon: string, tab: string}[]) => {
            const section = nav.createEl('div', { cls: 'mina-nav-section' });
            section.createEl('h3', { text: title, attr: { style: 'margin: 0; font-size: 0.7em; font-weight: 900; letter-spacing: 0.2em; color: var(--text-faint);' } });
            const cluster = section.createEl('div', { cls: 'mina-pillar-cluster' });
            items.forEach(i => {
                const item = cluster.createEl('div', { cls: 'mina-pillar-item' });
                const iconWrap = item.createDiv({ cls: 'mina-pillar-icon' }); setIcon(iconWrap, i.icon);
                item.createSpan({ text: i.label, cls: 'mina-pillar-label' });
                item.addEventListener('click', () => { this.view.activeTab = i.tab; this.view.renderView(); });
            });
        };
        renderCluster('ACTION', [
            { label: 'Tasks',    icon: 'lucide-check-square-2', tab: 'review-tasks' },
            { label: 'Finance',  icon: PF_ICON_ID, tab: 'dues' },
            { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' }
        ]);
        renderCluster('MANAGEMENT', [{ label: 'Projects', icon: 'lucide-briefcase', tab: 'projects' }, { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' }, { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' }]);
        renderCluster('SYSTEM', [{ label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'mina-ai' }, { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' }, { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' }]);
    }
}
