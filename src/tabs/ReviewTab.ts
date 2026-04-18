import { moment, Platform, MarkdownRenderer, TFile, Notice } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry, TaskEntry } from '../types';
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
                style: 'padding: 16px 14px 200px 14px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;' }
        });

        header.createEl('h2', {
            text: 'Weekly Review',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        header.createEl('span', {
            text: 'Reflect, refine, and focus for the week ahead.',
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' }
        });

        // 2. Weekly Goals Section
        const goalsSection = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--background-secondary-alt); border-radius: 16px; border: 1px solid var(--background-modifier-border-faint);' }
        });

        goalsSection.createEl('h3', { text: '🎯 Weekly Focus', attr: { style: 'margin: 0; font-size: 0.9em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-normal);' } });

        const goals = this.view.plugin.settings.weeklyGoals || [];
        for (let i = 0; i < 3; i++) {
            const val = goals[i] || '';
            const inp = goalsSection.createEl('input', {
                type: 'text',
                attr: { 
                    placeholder: `Goal ${i+1}...`,
                    value: val,
                    style: 'width: 100%; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 8px 12px; font-size: 0.9em; color: var(--text-normal);' 
                }
            });
            inp.addEventListener('change', async () => {
                const newGoals = [...(this.view.plugin.settings.weeklyGoals || [])];
                newGoals[i] = inp.value;
                this.view.plugin.settings.weeklyGoals = newGoals;
                await this.view.plugin.saveSettings();
                new Notice('Goal updated');
            });
        }

        // 3. Inbox (Unorganized items)
        const inboxTasks = Array.from(this.view.plugin.taskIndex.values()).filter(t => t.status === 'open' && !t.due && !t.project);
        const inboxThoughts = Array.from(this.view.plugin.thoughtIndex.values()).filter(t => t.context.length === 0 && !t.project);

        if (inboxTasks.length > 0 || inboxThoughts.length > 0) {
            const inboxHeader = wrap.createEl('div', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 6px;' } });
            inboxHeader.createEl('span', { text: '📥 Inbox (Unorganized)', attr: { style: 'font-size: 0.75em; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;' } });
            
            const inboxList = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px;' } });
            for (const task of inboxTasks.slice(0, 5)) await this.renderTaskRow(task, inboxList, true);
            for (const thought of inboxThoughts.slice(0, 5)) await this.renderThoughtRow(thought, inboxList, thought.filePath, 0, true, true);
        }

        // 4. Seven Day Summary
        const last7Days = Array.from({length: 7}, (_, i) => moment().subtract(i, 'days').format('YYYY-MM-DD'));
        const recentActivityHeader = wrap.createEl('div', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border-faint); padding-bottom: 6px;' } });
        recentActivityHeader.createEl('span', { text: '📅 Last 7 Days Activity', attr: { style: 'font-size: 0.75em; font-weight: 800; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;' } });

        const statsRow = wrap.createEl('div', { attr: { style: 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;' } });
        
        const thoughtsLast7 = Array.from(this.view.plugin.thoughtIndex.values()).filter(t => last7Days.some(d => t.allDates.includes(d)));
        const tasksCompleted7 = Array.from(this.view.plugin.taskIndex.values()).filter(t => t.status === 'done' && last7Days.some(d => t.day === d));
        
        const statCard = (label: string, val: string) => {
            const card = statsRow.createEl('div', { attr: { style: 'background: var(--background-secondary-alt); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid var(--background-modifier-border-faint);' } });
            card.createSpan({ text: val, attr: { style: 'font-size: 1.2em; font-weight: 800; color: var(--interactive-accent);' } });
            card.createSpan({ text: label, attr: { style: 'font-size: 0.6em; font-weight: 700; color: var(--text-muted); text-transform: uppercase;' } });
        };

        statCard('Notes', thoughtsLast7.length.toString());
        statCard('Done', tasksCompleted7.length.toString());
        statCard('Voice', '0'); // Placeholder for future voice stats
    }
}
