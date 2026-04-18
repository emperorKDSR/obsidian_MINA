import { moment, Notice } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';

export class DailyTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderDailyMode(container);
    }

    async renderDailyMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header (Strategic)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 4px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleStack = header.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        const titleRow = titleStack.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: 'Daily Focus',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const pillContainer = titleRow.createEl('div', {
            attr: { style: 'display: flex; gap: 4px; padding: 2px; background: var(--background-secondary-alt); border-radius: 20px; border: 1px solid var(--background-modifier-border-faint);' }
        });

        const renderNavPill = (parent: HTMLElement, label: string, tabId: string) => {
            const pill = parent.createEl('button', {
                text: label,
                attr: { style: 'background: transparent; border: none; font-size: 0.55em; font-weight: 800; color: var(--text-muted); cursor: pointer; padding: 3px 8px; border-radius: 12px; transition: all 0.1s;' }
            });
            pill.addEventListener('mouseenter', () => pill.style.color = 'var(--text-accent)');
            pill.addEventListener('mouseleave', () => pill.style.color = 'var(--text-muted)');
            pill.addEventListener('click', () => { this.view.activeTab = tabId; this.view.renderView(); });
        };

        renderNavPill(pillContainer, 'SU', 'daily');
        renderNavPill(pillContainer, 'CL', 'timeline');
        renderNavPill(pillContainer, 'TA', 'review-tasks');
        renderNavPill(pillContainer, 'PF', 'dues');
        renderNavPill(pillContainer, 'PI', 'focus');
        renderNavPill(pillContainer, 'TH', 'review-thoughts');

        titleStack.createEl('span', {
            text: moment().format('dddd, MMMM D, YYYY'),
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' }
        });

        // 2. Intelligence Section (Summary)
        const summaryBox = wrap.createEl('div', {
            attr: { style: 'background: var(--background-secondary-alt); border-radius: 16px; padding: 18px; border: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.03);' }
        });

        const summaryHeader = summaryBox.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        summaryHeader.createEl('h3', { text: '✨ Intelligence', attr: { style: 'margin: 0; font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--interactive-accent);' } });
        
        const summaryBtn = summaryHeader.createEl('button', {
            text: 'Generate Summary',
            attr: { style: 'background: transparent; border: 1px solid var(--interactive-accent); color: var(--interactive-accent); border-radius: 6px; font-size: 0.6em; padding: 2px 8px; cursor: pointer; font-weight: 700; text-transform: uppercase; transition: all 0.2s;' }
        });

        const summaryPlaceholder = summaryBox.createEl('div', {
            text: 'Click generate for an AI-powered digest of your activities.',
            attr: { style: 'font-size: 0.9em; color: var(--text-muted); font-style: italic; line-height: 1.5;' }
        });

        summaryBtn.addEventListener('click', async () => {
            summaryPlaceholder.empty();
            const loading = summaryPlaceholder.createEl('div', { text: 'Analyzing vault...', attr: { style: 'opacity: 0.6;' } });
            try {
                const today = moment().format('YYYY-MM-DD');
                const tasks = Array.from(this.index.taskIndex.values()).filter(e => e.day === today || e.due === today).map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`);
                const thoughts = Array.from(this.index.thoughtIndex.values()).filter(e => e.allDates?.includes(today)).map(t => `- [Thought] ${t.body.substring(0, 300)}`);
                const contextData = `### TASKS\n${tasks.join('\n')}\n\n### THOUGHTS\n${thoughts.join('\n')}`;
                
                const prompt = `You are a productivity assistant. Summarize today's activities based on: ${contextData || 'No data yet.'}. Suggest 3 focus items.`;
                const response = await this.ai.callGemini(prompt, [], false, [], this.index.thoughtIndex);
                
                loading.remove();
                summaryPlaceholder.setText(response);
                summaryPlaceholder.style.fontStyle = 'normal';
            } catch (e) {
                loading.setText('Failed to generate summary.');
            }
        });

        // 3. Habit Lab (Stitch Dots)
        const habitLab = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px;' } });
        habitLab.createEl('h3', { text: 'Habit Lab', attr: { style: 'margin: 0; font-size: 0.7em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-faint);' } });
        
        const dotsContainer = habitLab.createDiv({ attr: { style: 'display: flex; flex-wrap: wrap; gap: 10px; background: var(--background-secondary-alt); border-radius: 12px; padding: 14px; border: 1px solid var(--background-modifier-border-faint);' } });
        
        const todayStr = moment().format('YYYY-MM-DD');
        const completedHabits = await this.vault.getHabitStatus(todayStr);
        
        this.settings.habits.forEach(h => {
            const isDone = completedHabits.includes(h.id);
            const dot = dotsContainer.createDiv({
                attr: { 
                    title: h.name,
                    style: `width: 14px; height: 14px; border-radius: 50%; border: 2px solid ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; background: ${isDone ? 'var(--interactive-accent)' : 'transparent'}; cursor: pointer; transition: all 0.2s; box-shadow: ${isDone ? '0 0 8px var(--interactive-accent)' : 'none'};` 
                }
            });
            dot.addEventListener('click', async () => {
                await this.vault.toggleHabit(todayStr, h.id);
                this.renderDailyMode(container);
            });
        });

        // 4. Quick Actions
        const actionRow = wrap.createEl('div', { attr: { style: 'display: flex; gap: 10px;' } });
        const actionBtnStyle = 'flex: 1; padding: 12px; border-radius: 12px; border: 1px solid var(--background-modifier-border-faint); background: var(--background-secondary-alt); color: var(--text-normal); font-size: 0.85em; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.1s;';
        
        const addThoughtBtn = actionRow.createEl('button', { attr: { style: actionBtnStyle } });
        addThoughtBtn.createSpan({ text: '✍️' }); addThoughtBtn.createSpan({ text: 'Thought' });
        addThoughtBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', null, false, async (text: string, ctxs: string) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createThoughtFile(text, contexts);
                this.renderDailyMode(container);
            }, 'New Thought').open();
        });

        const addTaskBtn = actionRow.createEl('button', { attr: { style: actionBtnStyle } });
        addTaskBtn.createSpan({ text: '✅' }); addTaskBtn.createSpan({ text: 'Task' });
        addTaskBtn.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text: string, ctxs: string, due: string | null) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createTaskFile(text, contexts, due || undefined);
                this.renderDailyMode(container);
            }, 'New Task').open();
        });
    }
}
