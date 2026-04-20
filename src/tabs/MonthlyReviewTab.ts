import { moment, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';

export class MonthlyReviewTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderMonthlyReview(container);
    }

    async renderMonthlyReview(container: HTMLElement) {
        container.empty();

        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 18px 16px 200px 16px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header
        const navRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const now = moment();
        const monthYear = now.format('MMMM YYYY');
        wrap.createEl('h2', {
            text: 'Monthly Review',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.03em; line-height: 1.1;' }
        });
        wrap.createEl('span', {
            text: monthYear,
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500;' }
        });

        // 2. Stats Row
        const statsRow = wrap.createEl('div', {
            attr: { style: 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;' }
        });

        const monthStart = now.clone().startOf('month').format('YYYY-MM-DD');
        const monthEnd = now.clone().endOf('month').format('YYYY-MM-DD');

        const allTasks = Array.from(this.index.taskIndex.values());
        const doneTasks = allTasks.filter(t => t.status === 'done' && t.modified >= monthStart && t.modified <= monthEnd);
        // Denominator = tasks created or due this month (not entire vault history)
        const monthTasks = allTasks.filter(t => (t.created >= monthStart && t.created <= monthEnd) || (t.due && t.due >= monthStart && t.due <= monthEnd));
        const completionRate = monthTasks.length > 0 ? Math.round((doneTasks.length / monthTasks.length) * 100) : 0;
        const allOpen = allTasks.filter(t => t.status === 'open');

        const allThoughts = Array.from(this.index.thoughtIndex.values());
        const monthThoughts = allThoughts.filter(t => t.created >= monthStart);
        const processedThoughts = monthThoughts.filter(t => t.synthesized);

        const statCard = (label: string, value: string | number, sub?: string, subColor?: string) => {
            const card = statsRow.createEl('div', {
                attr: { style: 'padding: 16px; background: var(--background-secondary-alt); border-radius: 12px; border: 1px solid var(--background-modifier-border-faint); text-align: center;' }
            });
            card.createEl('div', { text: String(value), attr: { style: 'font-size: 1.8em; font-weight: 900; color: var(--interactive-accent);' } });
            card.createEl('div', { text: label, attr: { style: 'font-size: 0.7em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); margin-top: 2px;' } });
            if (sub) card.createEl('div', { text: sub, attr: { style: `font-size: 0.65em; color: ${subColor || 'var(--text-muted)'}; margin-top: 2px;` } });
        };

        statCard('Tasks Done', doneTasks.length, `${completionRate}% this month`);
        statCard('Thoughts', monthThoughts.length, `${processedThoughts.length} processed`);
        statCard('Open Tasks', allOpen.length, 'remaining');

        // 3. Habit Adherence — scan all daily files in the current month (QW-01)
        const habitsSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px;' } });
        habitsSection.createEl('h3', { text: 'Habit Adherence', attr: { style: 'margin: 0; font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint);' } });

        const habits = (this.settings.habits || []).filter(h => !h.archived);
        if (habits.length === 0) {
            habitsSection.createEl('p', { text: 'No habits configured. Add habits in Settings → Habits.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; font-style: italic;' } });
        } else {
            const daysInMonth = now.daysInMonth();
            // Count completions per habit by reading each day's frontmatter
            const folder = (this.settings.habitsFolder || '000 Bin/MINA V2 Habits').trim();
            const habitCounts = new Map<string, number>(habits.map(h => [h.id, 0]));
            for (let d = 1; d <= now.date(); d++) {
                const dateStr = now.clone().date(d).format('YYYY-MM-DD');
                const file = this.plugin.app.vault.getAbstractFileByPath(`${folder}/${dateStr}.md`);
                if (!(file instanceof TFile)) continue;
                const cache = this.plugin.app.metadataCache.getFileCache(file);
                const completed: string[] = Array.isArray(cache?.frontmatter?.['completed'])
                    ? cache.frontmatter['completed'].map(String) : [];
                for (const id of completed) {
                    if (habitCounts.has(id)) habitCounts.set(id, (habitCounts.get(id) ?? 0) + 1);
                }
            }
            for (const habit of habits) {
                const done = habitCounts.get(habit.id) ?? 0;
                const pct = now.date() > 0 ? Math.round((done / now.date()) * 100) : 0;
                const row = habitsSection.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--background-secondary-alt); border-radius: 10px; border: 1px solid var(--background-modifier-border-faint);' } });
                row.createEl('span', { text: `${habit.icon || '•'} ${habit.name}`, attr: { style: 'font-size: 0.9em; font-weight: 600;' } });
                const right = row.createEl('span', { attr: { style: 'display: flex; flex-direction: column; align-items: flex-end; gap: 1px;' } });
                right.createEl('span', { text: `${done}/${daysInMonth}`, attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: 700;' } });
                right.createEl('span', { text: `${pct}%`, attr: { style: `font-size: 0.65em; font-weight: 600; color: ${pct >= 80 ? 'var(--color-green)' : pct >= 50 ? 'var(--interactive-accent)' : 'var(--text-faint)'};` } });
            }
        }

        // 4. Project Progress
        const projectsSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px;' } });
        projectsSection.createEl('h3', { text: 'Project Progress', attr: { style: 'margin: 0; font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint);' } });

        const projectMap = new Map<string, { open: number; done: number }>();
        allTasks.forEach(t => {
            if (!t.project) return;
            const entry = projectMap.get(t.project) || { open: 0, done: 0 };
            if (t.status === 'done') entry.done++;
            else entry.open++;
            projectMap.set(t.project, entry);
        });

        if (projectMap.size === 0) {
            this.renderEmptyState(projectsSection, 'No project tasks found.');
        } else {
            Array.from(projectMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, counts]) => {
                const total = counts.open + counts.done;
                const pct = total > 0 ? Math.round((counts.done / total) * 100) : 0;
                const row = projectsSection.createEl('div', { attr: { style: 'padding: 12px 16px; background: var(--background-secondary-alt); border-radius: 10px; border: 1px solid var(--background-modifier-border-faint);' } });
                const labelRow = row.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; margin-bottom: 6px;' } });
                labelRow.createEl('span', { text: name, attr: { style: 'font-size: 0.85em; font-weight: 700;' } });
                labelRow.createEl('span', { text: `${counts.done}/${total} · ${pct}%`, attr: { style: 'font-size: 0.75em; color: var(--text-muted);' } });
                const bar = row.createEl('div', { attr: { style: 'height: 4px; border-radius: 2px; background: var(--background-modifier-border);' } });
                bar.createEl('div', { attr: { style: `height: 100%; border-radius: 2px; width: ${pct}%; background: var(--interactive-accent); transition: width 0.3s;` } });
            });
        }

        // 5. Next Month Focus
        const focusSection = wrap.createEl('div', {
            attr: { style: 'padding: 20px; background: var(--background-secondary-alt); border-radius: 16px; border: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 12px;' }
        });
        focusSection.createEl('h3', { text: 'Next Month\'s Focus', attr: { style: 'margin: 0; font-size: 0.8em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-normal);' } });

        const goals = this.settings.monthlyGoals || [];
        for (let i = 0; i < 3; i++) {
            const val = goals[i] || '';
            const inp = focusSection.createEl('input', {
                type: 'text',
                attr: { placeholder: `Monthly goal ${i + 1}...`, value: val, style: 'width: 100%; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 10px; font-size: 0.95em;' }
            });
            inp.addEventListener('change', async () => {
                const newGoals = [...(this.settings.monthlyGoals || [])];
                newGoals[i] = inp.value;
                this.settings.monthlyGoals = newGoals;
                await this.plugin.saveSettings();
            });
        }
    }
}
