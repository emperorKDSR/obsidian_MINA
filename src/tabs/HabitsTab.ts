import { moment, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';
import type { Habit } from '../types';

export class HabitsTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderHabitsView(container);
    }

    private async renderHabitsView(container: HTMLElement) {
        container.empty();

        const wrap = container.createEl('div', {
            attr: { style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);' }
        });

        // Header
        const header = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: 2px;' } });
        this.renderHomeIcon(navRow);
        header.createEl('h2', { text: 'Habits', attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em;' } });
        header.createEl('p', { text: moment().format('dddd, MMMM D'), attr: { style: 'margin: 0; font-size: 0.85em; color: var(--text-muted);' } });

        const habits: Habit[] = this.settings.habits || [];
        if (habits.length === 0) {
            wrap.createEl('div', {
                text: 'No habits configured. Open Settings → Habits to add your daily habits.',
                attr: { style: 'color: var(--text-muted); font-size: 0.9em; font-style: italic; text-align: center; margin-top: 40px; padding: 24px; background: var(--background-secondary); border-radius: 12px;' }
            });
            return;
        }

        // Today's completions from index
        const completedToday = new Set<string>(this.index.habitStatusIndex);
        const today = moment().format('YYYY-MM-DD');

        // Progress bar
        const doneCount = habits.filter(h => completedToday.has(h.id)).length;
        const pct = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0;
        const progressSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        const progressLabel = progressSection.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
        progressLabel.createEl('span', { text: `${doneCount} of ${habits.length} complete`, attr: { style: 'font-size: 0.8em; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em;' } });
        progressLabel.createEl('span', { text: `${pct}%`, attr: { style: 'font-size: 0.8em; font-weight: 800; color: var(--interactive-accent);' } });
        const barBg = progressSection.createEl('div', { attr: { style: 'height: 6px; background: var(--background-modifier-border); border-radius: 3px; overflow: hidden;' } });
        barBg.createEl('div', { attr: { style: `height: 100%; width: ${pct}%; background: var(--interactive-accent); border-radius: 3px; transition: width 0.4s ease;` } });

        // Habit list
        const list = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });

        for (const habit of habits) {
            const isDone = completedToday.has(habit.id);
            const row = list.createEl('div', {
                attr: {
                    style: `display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; background: var(--background-secondary-alt); border: 1px solid ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border-faint)'}; cursor: pointer; transition: border-color 0.2s, opacity 0.2s; opacity: ${isDone ? '0.75' : '1'};`
                }
            });

            // Icon / checkmark
            const iconWrap = row.createEl('div', {
                attr: { style: `width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1em; background: ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};` }
            });
            if (isDone) {
                const check = iconWrap.createEl('span');
                setIcon(check, 'check');
                check.style.color = 'var(--text-on-accent)';
                check.style.width = '16px';
            } else {
                iconWrap.createEl('span', { text: habit.icon || '●', attr: { style: 'line-height: 1;' } });
            }

            // Name
            const textWrap = row.createEl('div', { attr: { style: 'flex: 1; min-width: 0;' } });
            textWrap.createEl('div', {
                text: habit.name,
                attr: { style: `font-weight: 700; font-size: 0.95em; color: var(--text-normal); text-decoration: ${isDone ? 'line-through' : 'none'}; opacity: ${isDone ? '0.6' : '1'};` }
            });

            // Toggle on click
            row.addEventListener('click', async () => {
                await this.plugin.toggleHabit(today, habit.id);
                this.renderHabitsView(container);
            });
        }

        // Weekly streak section
        const streakSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px; margin-top: 4px;' } });
        streakSection.createEl('div', { text: 'Last 7 Days', attr: { style: 'font-size: 0.7em; font-weight: 900; letter-spacing: 0.18em; color: var(--text-faint); text-transform: uppercase;' } });

        const weekDays: string[] = [];
        for (let i = 6; i >= 0; i--) weekDays.push(moment().subtract(i, 'days').format('YYYY-MM-DD'));

        // Load habit files for the past 6 days (today already loaded via index)
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/MINA V2 Habits').replace(/\\/g, '/');
        const weekCompletions: Map<string, Set<string>> = new Map();
        weekCompletions.set(today, completedToday);

        for (const day of weekDays.filter(d => d !== today)) {
            const filePath = `${habitsFolder}/${day}.md`;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            const daySet = new Set<string>();
            if (file) {
                try {
                    const content = await this.app.vault.read(file as any);
                    const matches = content.match(/id:\s*([a-zA-Z0-9_-]+)/g);
                    if (matches) matches.forEach(m => daySet.add(m.split(':')[1].trim()));
                } catch (_) { /* file unreadable */ }
            }
            weekCompletions.set(day, daySet);
        }

        const grid = streakSection.createEl('div', { attr: { style: 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;' } });

        for (const day of weekDays) {
            const dayData = weekCompletions.get(day) || new Set<string>();
            const dayDone = habits.filter(h => dayData.has(h.id)).length;
            const dayPct = habits.length > 0 ? dayDone / habits.length : 0;
            const col = grid.createEl('div', { attr: { style: 'display: flex; flex-direction: column; align-items: center; gap: 4px;' } });
            col.createEl('div', { text: moment(day).format('dd')[0], attr: { style: 'font-size: 0.65em; color: var(--text-faint); font-weight: 700; text-transform: uppercase;' } });
            const intensity = dayPct === 0 ? 'var(--background-modifier-border)' : dayPct < 0.5 ? 'rgba(var(--interactive-accent-rgb), 0.3)' : dayPct < 1 ? 'rgba(var(--interactive-accent-rgb), 0.6)' : 'var(--interactive-accent)';
            col.createEl('div', { attr: { style: `width: 28px; height: 28px; border-radius: 6px; background: ${intensity};` } });
            col.createEl('div', { text: `${dayDone}/${habits.length}`, attr: { style: 'font-size: 0.6em; color: var(--text-faint);' } });
        }
    }
}
