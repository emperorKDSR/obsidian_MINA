import { moment, Notice, setIcon, Platform } from 'obsidian';
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
                style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 28px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 900px; margin: 0 auto;'
            }
        });

        // 1. Header (Strategic Title Stack)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 10px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleStack = header.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        const titleRow = titleStack.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: 'Daily Focus',
            attr: { style: 'margin: 0; font-size: 1.6em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const pillContainer = titleRow.createEl('div', {
            attr: { style: 'display: flex; gap: 4px; padding: 3px; background: var(--background-secondary-alt); border-radius: 20px; border: 1px solid var(--background-modifier-border-faint);' }
        });

        const renderNavPill = (parent: HTMLElement, label: string, tabId: string) => {
            const pill = parent.createEl('button', {
                text: label,
                attr: { style: 'background: transparent; border: none; font-size: 0.6em; font-weight: 800; color: var(--text-muted); cursor: pointer; padding: 4px 10px; border-radius: 12px; transition: all 0.2s;' }
            });
            pill.addEventListener('click', () => { this.view.activeTab = tabId; this.view.renderView(); });
            if (this.view.activeTab === tabId) {
                pill.style.color = 'var(--interactive-accent)';
                pill.style.background = 'rgba(var(--interactive-accent-rgb), 0.1)';
            }
        };

        renderNavPill(pillContainer, 'SU', 'daily');
        renderNavPill(pillContainer, 'CL', 'timeline');
        renderNavPill(pillContainer, 'TA', 'review-tasks');
        renderNavPill(pillContainer, 'PF', 'dues');
        renderNavPill(pillContainer, 'PI', 'focus');
        renderNavPill(pillContainer, 'TH', 'review-thoughts');

        titleStack.createEl('span', {
            text: moment().format('dddd, MMMM D, YYYY'),
            attr: { style: 'font-size: 0.9em; color: var(--text-muted); font-weight: 500; opacity: 0.8;' }
        });

        // 2. Intelligence Section (Elevated Surface)
        const summaryBox = wrap.createEl('div', {
            cls: 'mina-card',
            attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 14px; background: var(--background-secondary-alt); border-width: 1.5px;' }
        });

        const summaryHeader = summaryBox.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        const summaryTitle = summaryHeader.createEl('h3', { text: 'Intelligence', attr: { style: 'margin: 0; font-size: 0.8em; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: var(--interactive-accent); display: flex; align-items: center; gap: 8px;' } });
        const intelIcon = summaryTitle.createDiv(); setIcon(intelIcon, 'lucide-sparkles');
        
        const summaryBtn = summaryHeader.createEl('button', {
            text: 'Analyze Day',
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; font-size: 0.65em; padding: 4px 12px; cursor: pointer; font-weight: 700; text-transform: uppercase; box-shadow: 0 4px 10px rgba(var(--interactive-accent-rgb), 0.2);' }
        });

        const summaryPlaceholder = summaryBox.createEl('div', {
            text: 'Your AI-powered digest will appear here.',
            attr: { style: 'font-size: 0.95em; color: var(--text-muted); font-style: italic; line-height: 1.6; opacity: 0.8;' }
        });

        summaryBtn.addEventListener('click', async () => {
            summaryPlaceholder.empty();
            const loading = summaryPlaceholder.createEl('div', { text: 'Processing vault...', attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
            const spin = loading.createDiv(); setIcon(spin, 'lucide-loader-2'); spin.style.animation = 'spin 1s linear infinite';
            
            try {
                const today = moment().format('YYYY-MM-DD');
                const tasks = Array.from(this.index.taskIndex.values()).filter(e => e.day === today || e.due === today).map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`);
                const thoughts = Array.from(this.index.thoughtIndex.values()).filter(e => e.allDates?.includes(today)).map(t => `- [Thought] ${t.body.substring(0, 300)}`);
                const contextData = `### TASKS\n${tasks.join('\n')}\n\n### THOUGHTS\n${thoughts.join('\n')}`;
                
                const prompt = `Summarize today's activities: ${contextData || 'No data yet.'}. Suggest 3 focus items.`;
                const response = await this.ai.callGemini(prompt, [], false, [], this.index.thoughtIndex);
                
                loading.remove();
                summaryPlaceholder.setText(response);
                summaryPlaceholder.style.fontStyle = 'normal';
                summaryPlaceholder.style.opacity = '1';
            } catch (e) {
                loading.setText('Intelligence offline. Check settings.');
            }
        });

        // 3. Habit Lab
        const habitLab = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 14px;' } });
        habitLab.createEl('h3', { text: 'Habit Lab', attr: { style: 'margin: 0; font-size: 0.75em; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: var(--text-faint);' } });
        
        const dotsContainer = habitLab.createDiv({ 
            cls: 'mina-card',
            attr: { style: 'display: flex; flex-wrap: wrap; gap: 12px; padding: 20px; background: var(--background-primary-alt);' } 
        });
        
        const todayStr = moment().format('YYYY-MM-DD');
        const completedHabits = await this.vault.getHabitStatus(todayStr);
        
        this.settings.habits.forEach(h => {
            const isDone = completedHabits.includes(h.id);
            const dot = dotsContainer.createDiv({
                attr: { 
                    title: h.name,
                    style: `width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border-faint)'}; background: ${isDone ? 'var(--interactive-accent)' : 'transparent'}; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: ${isDone ? '0 0 12px rgba(var(--interactive-accent-rgb), 0.4)' : 'none'};` 
                }
            });
            dot.addEventListener('click', async () => {
                await this.vault.toggleHabit(todayStr, h.id);
                this.renderDailyMode(container);
            });
        });

        // 4. Quick Actions (Refined Layout)
        const actionRow = wrap.createEl('div', { attr: { style: 'display: flex; gap: 12px;' } });
        
        const renderActionBtn = (parent: HTMLElement, icon: string, label: string, onClick: () => void, accent = false) => {
            const btn = parent.createEl('button', { 
                attr: { style: `flex: 1; padding: 14px; border-radius: 16px; border: 1.5px solid var(--background-modifier-border-faint); background: ${accent ? 'var(--background-secondary-alt)' : 'var(--background-primary-alt)'}; color: var(--text-normal); font-size: 0.9em; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s;` } 
            });
            const iWrap = btn.createDiv(); setIcon(iWrap, icon);
            btn.createSpan({ text: label });
            btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-2px)'; btn.style.borderColor = 'var(--interactive-accent)'; btn.style.boxShadow = 'var(--mina-shadow)'; });
            btn.addEventListener('mouseleave', () => { btn.style.transform = 'none'; btn.style.borderColor = 'var(--background-modifier-border-faint)'; btn.style.boxShadow = 'none'; });
            btn.addEventListener('click', onClick);
        };

        renderActionBtn(actionRow, 'lucide-pen-line', 'New Thought', () => {
            new EditEntryModal(this.app, this.plugin, '', '', null, false, async (text, ctxs) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createThoughtFile(text, contexts);
                this.renderDailyMode(container);
            }, 'New Thought').open();
        }, true);

        renderActionBtn(actionRow, 'lucide-check-circle-2', 'Add Task', () => {
            new EditEntryModal(this.app, this.plugin, '', '', moment().format('YYYY-MM-DD'), true, async (text, ctxs, due) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                await this.vault.createTaskFile(text, contexts, due || undefined);
                this.renderDailyMode(container);
            }, 'New Task').open();
        });
    }
}
