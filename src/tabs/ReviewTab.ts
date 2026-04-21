import { moment, setIcon, MarkdownRenderer, Platform, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import type { ProjectEntry, TaskEntry, DueEntry } from '../types';

interface GlanceData {
    tasks: { completed: TaskEntry[]; overdue: TaskEntry[] };
    habits: { habit: { id: string; name: string; icon: string }; count: number }[];
    projects: ProjectEntry[];
    finance: { paid: DueEntry[]; overdue: DueEntry[] };
}

export class ReviewTab extends BaseTab {
    private glanceCollapsed = false;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderReviewMode(container);
    }

    private getWeekId(): string {
        return moment().format('YYYY-[W]WW');
    }

    private getWeekDateRange(): string {
        const start = moment().startOf('isoWeek');
        const end = moment().endOf('isoWeek');
        return `${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`;
    }

    private getWeekLabel(): string {
        const weekNum = moment().isoWeek();
        const start = moment().startOf('isoWeek');
        const end = moment().endOf('isoWeek');
        return `Week ${weekNum}  ·  ${start.format('MMM D')}–${end.format('MMM D')}`;
    }

    private getPrevWeekId(): string {
        return moment().subtract(1, 'week').format('YYYY-[W]WW');
    }

    private getPrevWeekLabel(): string {
        const weekNum = moment().subtract(1, 'week').isoWeek();
        const start = moment().subtract(1, 'week').startOf('isoWeek');
        const end = moment().subtract(1, 'week').endOf('isoWeek');
        return `Week ${weekNum}  ·  ${start.format('MMM D')}–${end.format('MMM D')}`;
    }

    private getHabitHighlightText(): string {
        const habits = (this.settings.habits || []).filter(h => !h.archived);
        if (habits.length === 0) return '';
        const weekStart = moment().startOf('isoWeek');
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/MINA V2 Habits').replace(/\\/g, '/');
        const completionCounts: Map<string, number> = new Map();
        habits.forEach(h => completionCounts.set(h.id, 0));
        for (let d = 0; d < 7; d++) {
            const dateStr = moment(weekStart).add(d, 'days').format('YYYY-MM-DD');
            const file = this.app.vault.getAbstractFileByPath(`${habitsFolder}/${dateStr}.md`);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const completed: string[] = Array.isArray(cache?.frontmatter?.['completed']) ? cache!.frontmatter!['completed'].map(String) : [];
            completed.forEach(id => {
                if (completionCounts.has(id)) completionCounts.set(id, (completionCounts.get(id) || 0) + 1);
            });
        }
        let best: { habit: (typeof habits)[0]; count: number } | null = null;
        habits.forEach(h => {
            const count = completionCounts.get(h.id) || 0;
            if (!best || count > best.count) best = { habit: h, count };
        });
        if (!best || (best as { habit: (typeof habits)[0]; count: number }).count === 0) return '';
        const b = best as { habit: (typeof habits)[0]; count: number };
        return `**${b.habit.icon} ${b.habit.name}** — 🔥 ${b.count}/7 days this week`;
    }

    private createSection(parent: HTMLElement, id: string, emoji: string, label: string): { section: HTMLElement; body: HTMLElement; toggle: HTMLElement } {
        const section = parent.createEl('div', { cls: 'mina-review-section' });
        const header = section.createEl('div', { cls: 'mina-review-section-header' });
        header.setAttribute('data-section-id', id);

        const left = header.createEl('div', { cls: 'mina-review-section-header-left' });
        left.createEl('span', { cls: 'mina-review-section-icon', text: emoji });
        left.createEl('span', { cls: 'mina-review-section-title', text: label });

        const toggleEl = header.createEl('span', { cls: 'mina-review-section-toggle' });
        setIcon(toggleEl, 'chevron-down');

        const body = section.createEl('div', { cls: 'mina-review-section-body' });

        const storageKey = `mina-review-collapse-${id}`;
        const isCollapsed = sessionStorage.getItem(storageKey) === 'true';
        if (isCollapsed) {
            body.style.display = 'none';
            toggleEl.style.transform = 'rotate(-90deg)';
        }

        header.addEventListener('click', () => {
            const collapsed = body.style.display === 'none';
            if (collapsed) {
                body.style.opacity = '0';
                body.style.display = 'flex';
                requestAnimationFrame(() => { body.style.opacity = '1'; });
                toggleEl.style.transform = 'rotate(0deg)';
                sessionStorage.removeItem(storageKey);
            } else {
                body.style.opacity = '0';
                setTimeout(() => { body.style.display = 'none'; }, 120);
                toggleEl.style.transform = 'rotate(-90deg)';
                sessionStorage.setItem(storageKey, 'true');
            }
        });

        return { section, body, toggle: toggleEl };
    }

    private createAutoResizeTextarea(parent: HTMLElement, cls: string, placeholder: string, value: string, onChange: (v: string) => void): HTMLTextAreaElement {
        const ta = parent.createEl('textarea', { cls, attr: { placeholder } }) as HTMLTextAreaElement;
        ta.value = value;
        ta.style.height = 'auto';
        ta.style.height = (ta.scrollHeight || 88) + 'px';
        ta.addEventListener('input', () => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            onChange(ta.value);
        });
        ta.addEventListener('focus', () => {
            ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        return ta;
    }

    async renderReviewMode(container: HTMLElement) {
        container.empty();

        const weekId = this.getWeekId();
        const prevWeekId = this.getPrevWeekId();
        const weekLabel = this.getWeekLabel();
        const prevWeekLabel = this.getPrevWeekLabel();
        const dateRange = this.getWeekDateRange();

        // Load existing data
        const existing = await this.vault.loadWeeklyReview(weekId);
        let wins = existing?.wins ?? '';
        let lessons = existing?.lessons ?? '';
        let focus = existing?.focus ?? ['', '', ''];
        while (focus.length < 3) focus.push('');
        let isDirty = false;

        const wrap = container.createEl('div', { cls: 'mina-review-wrap' });
        wrap.setAttribute('container-type', 'inline-size');

        // ── Header ──────────────────────────────────────────────
        const header = wrap.createEl('div', { cls: 'mina-review-header' });
        const navRow = header.createEl('div', { cls: 'mina-review-nav-row' });
        this.renderHomeIcon(navRow);
        const dirtyDot = navRow.createEl('span', { cls: 'mina-review-dirty-dot' });
        dirtyDot.style.display = 'none';

        header.createEl('h2', { text: 'Weekly Review', cls: 'mina-tab-title' });
        const subtitleRow = header.createEl('div', { cls: 'mina-review-subtitle-row' });
        subtitleRow.createEl('span', { cls: 'mina-review-week-label', text: weekLabel });
        if (existing?.saved) {
            const rel = moment(existing.saved, 'YYYY-MM-DD HH:mm:ss').fromNow();
            subtitleRow.createEl('span', { cls: 'mina-review-saved-badge', text: `Saved ${rel}` });
        }

        const markDirty = () => {
            if (!isDirty) { isDirty = true; dirtyDot.style.display = 'inline-block'; }
        };

        // ── Week at a Glance ─────────────────────────────────────
        this.renderGlancePanel(wrap, weekId);

        // ── Body: two-column on desktop ──────────────────────────
        const body = wrap.createEl('div', { cls: 'mina-review-body' });
        const leftCol = body.createEl('div', { cls: 'mina-review-col--left' });
        const rightCol = body.createEl('div', { cls: 'mina-review-col--right' });

        // Wins section
        const { body: winsBody } = this.createSection(leftCol, 'wins', '🏆', 'THIS WEEK\'S WINS');
        this.createAutoResizeTextarea(winsBody, 'mina-review-textarea', 'What went well this week…', wins, v => { wins = v; markDirty(); });

        // Lessons section
        const { body: lessonsBody } = this.createSection(leftCol, 'lessons', '📚', 'LESSONS LEARNED');
        this.createAutoResizeTextarea(lessonsBody, 'mina-review-textarea', 'What would you do differently…', lessons, v => { lessons = v; markDirty(); });

        // Focus section
        const { body: focusBody } = this.createSection(rightCol, 'focus', '🎯', 'NEXT WEEK\'S FOCUS');
        const focusList = focusBody.createEl('div', { cls: 'mina-review-focus-list' });
        const placeholders = ['Primary focus for next week…', 'Secondary focus…', 'Third priority…'];
        const focusInputs: HTMLInputElement[] = [];
        for (let i = 0; i < 3; i++) {
            const item = focusList.createEl('div', { cls: 'mina-review-focus-item' });
            item.createEl('span', { cls: 'mina-review-focus-num', text: String(i + 1) });
            const inp = item.createEl('input', { cls: 'mina-review-input', attr: { type: 'text', placeholder: placeholders[i], value: focus[i] || '' } }) as HTMLInputElement;
            inp.addEventListener('input', () => { focus[i] = inp.value; markDirty(); });
            focusInputs.push(inp);
        }

        // Habit Highlight section (read-only)
        const { body: habitBody } = this.createSection(rightCol, 'habit-highlight', '💡', 'HABIT HIGHLIGHT');
        const highlightText = this.getHabitHighlightText();
        if (highlightText) {
            const hlCard = habitBody.createEl('div', { cls: 'mina-review-habit-highlight' });
            const habits = (this.settings.habits || []).filter(h => !h.archived);
            const found = habits.find(h => highlightText.includes(h.name));
            hlCard.createEl('span', { cls: 'mina-review-habit-highlight-emoji', text: found?.icon || '💡' });
            const hlInfo = hlCard.createEl('div', { cls: 'mina-review-habit-highlight-info' });
            hlInfo.createEl('div', { cls: 'mina-review-habit-name', text: found?.name || 'Top Habit' });
            hlInfo.createEl('div', { cls: 'mina-review-habit-streak', text: highlightText.split('—')[1]?.trim() || '' });
        } else {
            habitBody.createEl('div', {
                cls: 'mina-review-habit-highlight--empty',
                text: 'No habit data yet — complete habits to see highlights'
            });
        }

        // ── Save Row ─────────────────────────────────────────────
        const saveRow = wrap.createEl('div', { cls: 'mina-review-save-row' });
        const kbdHint = saveRow.createEl('span', { cls: 'mina-review-kbd-hint' });
        kbdHint.textContent = Platform.isMacOS ? '⌘↵ to save' : 'Ctrl+↵ to save';
        const saveBtn = saveRow.createEl('button', { cls: 'mina-review-save-btn', text: '💾  Save Review' });

        const doSave = async () => {
            if (saveBtn.disabled) return;
            saveBtn.textContent = 'Saving…';
            saveBtn.disabled = true;
            const habitHighlight = this.getHabitHighlightText();
            try {
                await this.vault.saveWeeklyReview(weekId, dateRange, wins, lessons, focus, habitHighlight);
                isDirty = false;
                dirtyDot.style.display = 'none';
                saveBtn.textContent = '✓  Saved';
                saveBtn.classList.add('is-saved');
                setTimeout(() => {
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-saved');
                    saveBtn.disabled = false;
                }, 1800);
            } catch {
                saveBtn.textContent = '⚠ Save Failed — Retry';
                saveBtn.classList.add('is-error');
                saveBtn.disabled = false;
                setTimeout(() => {
                    saveBtn.textContent = '💾  Save Review';
                    saveBtn.classList.remove('is-error');
                }, 3000);
            }
        };

        saveBtn.addEventListener('click', doSave);
        wrap.addEventListener('keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doSave(); }
        });

        // ── Previous Week Card ────────────────────────────────────
        const prevCard = wrap.createEl('div', { cls: 'mina-review-prev-card is-collapsed' });
        const prevTrigger = prevCard.createEl('div', { cls: 'mina-review-prev-card__trigger' });
        const prevLeft = prevTrigger.createEl('div', { cls: 'mina-review-prev-card__left' });
        prevLeft.createEl('span', { cls: 'mina-section-label', text: '📅 PREVIOUS WEEK' });
        prevLeft.createEl('span', { cls: 'mina-review-prev-week-chip', text: prevWeekLabel });
        const prevChevron = prevTrigger.createEl('span', { cls: 'mina-review-prev-card__chevron' });
        setIcon(prevChevron, 'chevron-down');

        const prevBody = prevCard.createEl('div', { cls: 'mina-review-prev-card__body' });
        let prevLoaded = false;

        prevTrigger.addEventListener('click', async () => {
            const isCollapsed = prevCard.classList.contains('is-collapsed');
            prevCard.classList.toggle('is-collapsed');
            if (isCollapsed && !prevLoaded) {
                prevLoaded = true;
                const reviewsRoot = (this.settings.reviewsFolder || '000 Bin/MINA V2 Reviews').trim();
                const prevFile = this.app.vault.getAbstractFileByPath(`${reviewsRoot}/Weekly/${prevWeekId}.md`);
                if (prevFile instanceof TFile) {
                    prevBody.createEl('span', { cls: 'mina-review-readonly-badge', text: 'READ-ONLY' });
                    const rendered = prevBody.createEl('div', { cls: 'mina-review-prev-content' });
                    const content = await this.app.vault.read(prevFile);
                    const bodyOnly = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
                    await MarkdownRenderer.render(this.app, bodyOnly, rendered, prevFile.path, this.view);
                    const openBtn = prevBody.createEl('button', { cls: 'mina-btn-secondary mina-review-prev-open-btn', text: 'Open in Vault →' });
                    openBtn.addEventListener('click', () => {
                        this.app.workspace.openLinkText(prevFile.path, '', Platform.isMobile ? 'tab' : 'window');
                    });
                } else {
                    prevBody.createEl('div', { text: 'No review found for last week.', cls: 'mina-review-prev-empty' });
                }
            }
        });
    }

    private renderGlancePanel(parent: HTMLElement, weekId: string): void {
        const glance = parent.createEl('div', { cls: 'mina-review-glance' });
        if (this.glanceCollapsed) glance.classList.add('is-collapsed');

        const glanceHeader = glance.createEl('div', { cls: 'mina-review-glance__header' });
        glanceHeader.createEl('span', { cls: 'mina-review-glance__title', text: '⚡ WEEK AT A GLANCE' });

        const glanceActions = glanceHeader.createEl('div', { cls: 'mina-review-glance__actions' });
        const refreshBtn = glanceActions.createEl('button', { cls: 'mina-review-glance__refresh', attr: { title: 'Refresh' } });
        setIcon(refreshBtn, 'refresh-cw');
        const toggleBtn = glanceActions.createEl('button', { cls: 'mina-review-glance__toggle', attr: { title: 'Collapse' } });
        setIcon(toggleBtn, this.glanceCollapsed ? 'chevron-right' : 'chevron-down');

        const glanceBody = glance.createEl('div', { cls: 'mina-review-glance__body' });
        const render = () => {
            glanceBody.empty();
            const data = this.computeGlanceData(weekId);
            this.renderGlanceTasks(glanceBody, data.tasks);
            this.renderGlanceHabits(glanceBody, data.habits);
            this.renderGlanceProjects(glanceBody, data.projects);
            this.renderGlanceFinance(glanceBody, data.finance);
        };
        render();

        toggleBtn.addEventListener('click', () => {
            this.glanceCollapsed = !this.glanceCollapsed;
            glance.classList.toggle('is-collapsed', this.glanceCollapsed);
            setIcon(toggleBtn, this.glanceCollapsed ? 'chevron-right' : 'chevron-down');
        });
        refreshBtn.addEventListener('click', render);
    }

    private computeGlanceData(weekId: string): GlanceData {
        const today = moment();
        const weekStart = moment().startOf('isoWeek');
        const weekEnd = moment().endOf('isoWeek');

        // Tasks
        const allTasks = Array.from(this.index.taskIndex.values());
        const completed = allTasks.filter(t => {
            if (t.status !== 'done') return false;
            const mod = moment(t.modified, 'YYYY-MM-DD HH:mm:ss');
            return mod.isSameOrAfter(weekStart) && mod.isSameOrBefore(weekEnd);
        });
        const overdue = allTasks.filter(t => {
            if (t.status !== 'open' || !t.due) return false;
            return moment(t.due, 'YYYY-MM-DD').isBefore(today, 'day');
        });

        // Habits
        const habits = (this.settings.habits || []).filter(h => !h.archived);
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/MINA V2 Habits').replace(/\\/g, '/');
        const counts: Map<string, number> = new Map();
        habits.forEach(h => counts.set(h.id, 0));
        for (let d = 0; d < 7; d++) {
            const dateStr = moment(weekStart).add(d, 'days').format('YYYY-MM-DD');
            const file = this.app.vault.getAbstractFileByPath(`${habitsFolder}/${dateStr}.md`);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const done: string[] = Array.isArray(cache?.frontmatter?.['completed'])
                ? cache!.frontmatter!['completed'].map(String) : [];
            done.forEach(id => { if (counts.has(id)) counts.set(id, (counts.get(id) || 0) + 1); });
        }
        const habitsData = habits.map(h => ({ habit: h, count: counts.get(h.id) || 0 }));

        // Projects active this week
        const projects = Array.from(this.index.projectIndex.values()).filter(p => {
            if (p.status === 'archived') return false;
            const file = this.app.vault.getAbstractFileByPath(p.filePath);
            if (!(file instanceof TFile)) return false;
            return moment(file.stat.mtime).isSameOrAfter(weekStart);
        });

        // Finance
        const allDues = Array.from(this.index.dueIndex.values());
        const finPaid = allDues.filter(d => {
            if (!d.lastPayment) return false;
            const lp = moment(d.lastPayment, 'YYYY-MM-DD');
            return lp.isSameOrAfter(weekStart) && lp.isSameOrBefore(weekEnd);
        });
        const paidPaths = new Set(finPaid.map(d => d.path));
        const finOverdue = allDues.filter(d => {
            if (paidPaths.has(d.path)) return false;
            if (!d.dueMoment) return false;
            return moment(d.dueMoment).isBefore(today, 'day');
        });

        return { tasks: { completed, overdue }, habits: habitsData, projects, finance: { paid: finPaid, overdue: finOverdue } };
    }

    private renderGlanceTasks(parent: HTMLElement, tasks: { completed: TaskEntry[]; overdue: TaskEntry[] }): void {
        const card = parent.createEl('div', { cls: 'mina-glance-card' });
        const hdr = card.createEl('div', { cls: 'mina-glance-card__header' });
        hdr.createEl('span', { cls: 'mina-glance-card__icon', text: '✅' });
        hdr.createEl('span', { cls: 'mina-glance-card__title', text: 'TASKS' });

        const statRow = card.createEl('div', { cls: 'mina-glance-stat-row' });
        statRow.createEl('span', { cls: 'mina-glance-stat mina-glance-stat--done', text: `${tasks.completed.length} done` });
        statRow.createEl('span', { cls: 'mina-glance-stat-sep', text: '·' });
        statRow.createEl('span', { cls: 'mina-glance-stat mina-glance-stat--overdue', text: `${tasks.overdue.length} overdue` });

        const list = card.createEl('ul', { cls: 'mina-glance-list' });
        tasks.completed.slice(0, 6).forEach(t => {
            list.createEl('li', { cls: 'mina-glance-item mina-glance-item--done', text: t.title });
        });
        if (tasks.completed.length === 0 && tasks.overdue.length === 0) {
            list.createEl('li', { cls: 'mina-glance-item mina-glance-item--empty', text: 'No task activity this week' });
        }
    }

    private renderGlanceHabits(parent: HTMLElement, habits: { habit: { id: string; name: string; icon: string }; count: number }[]): void {
        if (habits.length === 0) return;
        const card = parent.createEl('div', { cls: 'mina-glance-card' });
        const hdr = card.createEl('div', { cls: 'mina-glance-card__header' });
        hdr.createEl('span', { cls: 'mina-glance-card__icon', text: '🔁' });
        hdr.createEl('span', { cls: 'mina-glance-card__title', text: 'HABITS' });

        habits.forEach(({ habit, count }) => {
            const row = card.createEl('div', { cls: 'mina-glance-habit-row' });
            row.createEl('span', { cls: 'mina-glance-habit-icon', text: habit.icon });
            row.createEl('span', { cls: 'mina-glance-habit-name', text: habit.name });
            const barWrap = row.createEl('div', { cls: 'mina-glance-habit-bar' });
            const fill = barWrap.createEl('div', { cls: 'mina-glance-habit-fill' });
            fill.style.width = `${Math.round((count / 7) * 100)}%`;
            row.createEl('span', { cls: 'mina-glance-habit-count', text: `${count}/7` });
        });
    }

    private renderGlanceProjects(parent: HTMLElement, projects: ProjectEntry[]): void {
        if (projects.length === 0) return;
        const card = parent.createEl('div', { cls: 'mina-glance-card' });
        const hdr = card.createEl('div', { cls: 'mina-glance-card__header' });
        hdr.createEl('span', { cls: 'mina-glance-card__icon', text: '🗂' });
        hdr.createEl('span', { cls: 'mina-glance-card__title', text: 'ACTIVE PROJECTS' });

        projects.forEach(p => {
            const row = card.createEl('div', { cls: 'mina-glance-project-row' });
            const dot = row.createEl('span', { cls: 'mina-glance-project-dot' });
            if (p.color) dot.style.background = p.color;
            row.createEl('span', { cls: 'mina-glance-project-name', text: p.name });
            row.createEl('span', { cls: `mina-glance-project-status mina-glance-project-status--${p.status}`, text: p.status });
        });
    }

    private renderGlanceFinance(parent: HTMLElement, finance: { paid: DueEntry[]; overdue: DueEntry[] }): void {
        if (finance.paid.length === 0 && finance.overdue.length === 0) return;
        const card = parent.createEl('div', { cls: 'mina-glance-card' });
        const hdr = card.createEl('div', { cls: 'mina-glance-card__header' });
        hdr.createEl('span', { cls: 'mina-glance-card__icon', text: '💳' });
        hdr.createEl('span', { cls: 'mina-glance-card__title', text: 'FINANCE' });

        finance.paid.forEach(d => {
            const row = card.createEl('div', { cls: 'mina-glance-finance-row mina-glance-finance-row--paid' });
            row.createEl('span', { cls: 'mina-glance-finance-icon', text: '✓' });
            row.createEl('span', { cls: 'mina-glance-finance-name', text: d.title });
        });
        finance.overdue.forEach(d => {
            const row = card.createEl('div', { cls: 'mina-glance-finance-row mina-glance-finance-row--overdue' });
            row.createEl('span', { cls: 'mina-glance-finance-icon', text: '⚠' });
            row.createEl('span', { cls: 'mina-glance-finance-name', text: d.title });
        });
    }
}

