import { moment } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";

export class ReviewTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderReviewMode(container);
    }

    async renderReviewMode(container: HTMLElement) {
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
            text: 'Weekly Review',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em; line-height: 1.1;' }
        });

        const week = `Week ${moment().format('ww, YYYY')}`;
        header.createEl('span', {
            text: `Reflection for ${week}`,
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' }
        });

        // 2. Inbox Clearing (Action Pillar)
        const inboxHeader = wrap.createEl('h3', { text: '📥 Inbox Clearing', attr: { style: 'margin: 0; font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint);' } });
        const inboxList = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px;' } });

        const inboxTasks = Array.from(this.index.taskIndex.values()).filter(t => t.status === 'open' && !t.due && !t.project);
        const inboxThoughts = Array.from(this.index.thoughtIndex.values()).filter(t => t.context.length === 0 && !t.project);

        if (inboxTasks.length === 0 && inboxThoughts.length === 0) {
            inboxList.createEl('p', { text: 'Inbox is clean. Excellent!', attr: { style: 'color: var(--text-success); font-size: 0.9em; font-style: italic;' } });
        } else {
            for (const task of inboxTasks.slice(0, 5)) await this.renderTaskRow(task, inboxList, true);
            for (const thought of inboxThoughts.slice(0, 5)) await this.renderThoughtRow(thought, inboxList, thought.filePath, 0, true);
        }

        // 3. Weekly Focus (Reflection Pillar)
        const focusSection = wrap.createEl('div', {
            attr: { style: 'padding: 20px; background: var(--background-secondary-alt); border-radius: 16px; border: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 12px;' }
        });
        focusSection.createEl('h3', { text: '🎯 Next Week\'s Focus', attr: { style: 'margin: 0; font-size: 0.8em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-normal);' } });

        const goals = this.settings.weeklyGoals || [];
        for (let i = 0; i < 3; i++) {
            const val = goals[i] || '';
            const inp = focusSection.createEl('input', {
                type: 'text',
                attr: { placeholder: `Goal ${i+1}...`, value: val, style: 'width: 100%; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 10px; font-size: 0.95em;' }
            });
            inp.addEventListener('change', async () => {
                const newGoals = [...(this.settings.weeklyGoals || [])];
                newGoals[i] = inp.value;
                this.settings.weeklyGoals = newGoals;
                await this.plugin.saveSettings();
            });
        }
    }
}
