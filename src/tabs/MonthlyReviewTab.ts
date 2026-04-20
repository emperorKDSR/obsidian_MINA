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

        const wrap = container.createEl('div', { cls: 'mina-tab-wrap mina-monthly-wrap' });

        // Header
        const now = moment();
        this.renderPageHeader(wrap, 'Monthly Review', now.format('MMMM YYYY'));

        // Stats Row
        const statsRow = wrap.createEl('div', { cls: 'mina-monthly-stats' });

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
            const card = statsRow.createEl('div', { cls: 'mina-monthly-stat-card' });
            card.createEl('div', { text: String(value), cls: 'mina-monthly-stat-value' });
            card.createEl('div', { text: label, cls: 'mina-monthly-stat-label' });
            if (sub) card.createEl('div', { text: sub, cls: 'mina-monthly-stat-sub', attr: { style: subColor ? `color: ${subColor}` : '' } });
        };

        statCard('Tasks Done', doneTasks.length, `${completionRate}% this month`);
        statCard('Thoughts', monthThoughts.length, `${processedThoughts.length} processed`);
        statCard('Open Tasks', allOpen.length, 'remaining');

        // 3. Habit Adherence — scan all daily files in the current month (QW-01)
        const habitsSection = wrap.createEl('div', { cls: 'mina-monthly-section' });
        habitsSection.createEl('h3', { text: 'Habit Adherence', cls: 'mina-section-label' });

        const habits = (this.settings.habits || []).filter(h => !h.archived);
        if (habits.length === 0) {
            this.renderEmptyState(habitsSection, 'No habits configured. Add habits in Settings → Habits.');
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
                const row = habitsSection.createEl('div', { cls: 'mina-monthly-habit-row' });
                row.createEl('span', { text: `${habit.icon || '•'} ${habit.name}`, cls: 'mina-monthly-habit-name' });
                const right = row.createEl('span', { cls: 'mina-monthly-habit-stats' });
                right.createEl('span', { text: `${done}/${daysInMonth}`, cls: 'mina-monthly-habit-count' });
                const pctColor = pct >= 80 ? 'var(--color-green)' : pct >= 50 ? 'var(--interactive-accent)' : 'var(--text-faint)';
                right.createEl('span', { text: `${pct}%`, cls: 'mina-monthly-habit-pct', attr: { style: `color: ${pctColor}` } });
            }
        }

        // 4. Project Progress
        const projectsSection = wrap.createEl('div', { cls: 'mina-monthly-section' });
        projectsSection.createEl('h3', { text: 'Project Progress', cls: 'mina-section-label' });

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
                const row = projectsSection.createEl('div', { cls: 'mina-monthly-project-row' });
                const labelRow = row.createEl('div', { cls: 'mina-monthly-project-header' });
                labelRow.createEl('span', { text: name, cls: 'mina-monthly-project-name' });
                labelRow.createEl('span', { text: `${counts.done}/${total} · ${pct}%`, cls: 'mina-monthly-project-stat' });
                const bar = row.createEl('div', { cls: 'mina-monthly-progress-track' });
                bar.createEl('div', { cls: 'mina-monthly-progress-fill', attr: { style: `width: ${pct}%` } });
            });
        }

        // 5. Next Month Focus
        const focusSection = wrap.createEl('div', { cls: 'mina-monthly-focus' });
        focusSection.createEl('h3', { text: 'Next Month\'s Focus', cls: 'mina-monthly-focus-title' });

        const goals = this.settings.monthlyGoals || [];
        for (let i = 0; i < 3; i++) {
            const val = goals[i] || '';
            const inp = focusSection.createEl('input', {
                type: 'text',
                cls: 'mina-monthly-goal-input',
                attr: { placeholder: `Monthly goal ${i + 1}...`, value: val }
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
