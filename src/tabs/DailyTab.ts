import { moment, Platform, MarkdownRenderer, TFile } from 'obsidian';
import type { MinaView } from '../view';
import type { MinaSettings, DueEntry } from '../types';
import { PaymentModal } from '../modals/PaymentModal';
import { BaseTab } from "./BaseTab";

export class DailyTab extends BaseTab {
    // Container references for targeted updates
    checklistContainer: HTMLElement | null = null;
    tasksContainer: HTMLElement | null = null;
    duesContainer: HTMLElement | null = null;
    pinnedContainer: HTMLElement | null = null;
    thoughtsContainer: HTMLElement | null = null;
    summaryContainer: HTMLElement | null = null;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderDailyMode(container);
    }

    renderDailyMode(container: HTMLElement) {
        container.empty();
        
        if (this.view.plugin.settings.showDailySummary === undefined) {
            this.view.plugin.settings.showDailySummary = true;
        }
        const s = this.view.plugin.settings;
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 16px 14px 200px 14px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 4px;' }
        });

        const titleStack = header.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        titleStack.createEl('h2', {
            text: 'Daily Focus',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });
        titleStack.createEl('span', {
            text: moment().format('dddd, MMMM D'),
            attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-weight: 500; margin-top: 2px;' }
        });

        const toggleRow = header.createEl('div', {
            attr: { style: 'display: flex; gap: 4px; padding: 3px; background: var(--background-secondary-alt); border-radius: 8px; width: fit-content; border: 1px solid var(--background-modifier-border-faint);' }
        });

        const renderPillToggle = (label: string, settingKey: keyof MinaSettings) => {
            const isActive = !!(s as any)[settingKey];
            const pill = toggleRow.createEl('button', {
                text: label,
                attr: { 
                    style: `padding: 4px 8px; border-radius: 6px; border: none; font-size: 0.7em; font-weight: 700; cursor: pointer; transition: all 0.15s; 
                    background: ${isActive ? 'var(--interactive-accent)' : 'transparent'}; 
                    color: ${isActive ? 'var(--text-on-accent)' : 'var(--text-muted)'};` 
                }
            });

            pill.addEventListener('click', async () => {
                (this.view.plugin.settings[settingKey as keyof MinaSettings] as any) = !isActive;
                await this.view.plugin.saveSettings();
                this.renderDailyMode(container); 
            });
        };

        renderPillToggle('SU', 'showDailySummary');
        renderPillToggle('CL', 'showDailyChecklist');
        renderPillToggle('TA', 'showDailyTasks');
        renderPillToggle('PF', 'showDailyDues');
        renderPillToggle('PI', 'showDailyPinned');
        renderPillToggle('TH', 'showDailyThoughts');

        const contentGrid = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 14px;' }
        });

        if (s.showDailySummary) {
            this.summaryContainer = this.renderRedesignedSection(contentGrid, "Intelligent Summary", 'summary', '🤖');
            this.updateDailySummary(this.summaryContainer);
        } else this.summaryContainer = null;

        if (s.showDailyChecklist) {
            this.checklistContainer = this.renderRedesignedSection(contentGrid, "Checklist", 'checklist', '✅');
            this.updateDailyThoughtTodos(this.checklistContainer);
        } else this.checklistContainer = null;

        if (s.showDailyTasks) {
            this.tasksContainer = this.renderRedesignedSection(contentGrid, 'Tasks', 'tasks', '📝');
            this.updateDailyTasks(this.tasksContainer);
        } else this.tasksContainer = null;

        if (s.showDailyDues) {
            this.duesContainer = this.renderRedesignedSection(contentGrid, 'Finance', 'dues', '💳');
            this.updateDailyDues(this.duesContainer);
        } else this.duesContainer = null;

        if (s.showDailyPinned) {
            this.pinnedContainer = this.renderRedesignedSection(contentGrid, "Pinned", 'pinned', '📌');
            this.updatePinnedThoughts(this.pinnedContainer);
        } else this.pinnedContainer = null;

        if (s.showDailyThoughts) {
            this.thoughtsContainer = this.renderRedesignedSection(contentGrid, "Activity", 'thoughts', '📅');
            this.updateDailyThoughts(this.thoughtsContainer);
        } else this.thoughtsContainer = null;
    }

    refreshAllVisibleSections() {
        if (this.checklistContainer) this.updateDailyThoughtTodos(this.checklistContainer);
        if (this.tasksContainer) this.updateDailyTasks(this.tasksContainer);
        if (this.duesContainer) this.updateDailyDues(this.duesContainer);
        if (this.pinnedContainer) this.updatePinnedThoughts(this.pinnedContainer);
        if (this.thoughtsContainer) this.updateDailyThoughts(this.thoughtsContainer);
    }

    renderRedesignedSection(container: HTMLElement, title: string, key: string, emoji: string): HTMLElement {
        if (!this.view.plugin.settings.dailySectionStates) this.view.plugin.settings.dailySectionStates = {};
        const isOpen = this.view.plugin.settings.dailySectionStates[key] !== false;

        const sectionCard = container.createEl('div', {
            attr: { style: `background: var(--background-secondary); border-radius: 12px; border: 1px solid var(--background-modifier-border); overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.03);` }
        });

        const header = sectionCard.createEl('div', {
            attr: { style: 'padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; user-select: none; border-bottom: 1px solid var(--background-modifier-border-faint);' }
        });

        header.createSpan({ text: emoji, attr: { style: 'font-size: 1.1em; display: flex; align-items: center;' } });
        header.createEl('span', { text: title, attr: { style: 'font-weight: 700; font-size: 0.85em; color: var(--text-normal); flex-grow: 1; letter-spacing: 0.02em; text-transform: uppercase;' } });

        const chevron = header.createSpan({ text: isOpen ? '▼' : '▶', attr: { style: 'font-size: 0.7em; opacity: 0.4; width: 20px; text-align: center;' } });
        const content = sectionCard.createEl('div', { attr: { style: `padding: 14px; display: ${isOpen ? 'block' : 'none'};` } });

        header.addEventListener('click', async () => {
            const newState = content.style.display === 'none';
            content.style.display = newState ? 'block' : 'none';
            chevron.textContent = newState ? '▼' : '▶';
            this.view.plugin.settings.dailySectionStates[key] = newState;
            await this.view.plugin.saveSettings();
        });

        return content;
    }

    async updateDailySummary(container: HTMLElement) {
        container.empty();
        const loading = container.createEl('p', { text: 'Generating summary...', attr: { style: 'color: var(--text-muted); font-size: 0.85em; font-style: italic; text-align: center;' } });

        try {
            const today = moment().format('YYYY-MM-DD');
            const checklistItems: string[] = [];
            for (const entry of Array.from(this.view.plugin.thoughtIndex.values())) {
                const matches = entry.body.matchAll(/- \[ \] (.*)/g);
                for (const m of matches) checklistItems.push(`- [Checklist] ${m[1]}`);
                for (const child of entry.children) {
                    const cMatches = child.text.matchAll(/- \[ \] (.*)/g);
                    for (const cm of cMatches) checklistItems.push(`- [Checklist] ${cm[1]}`);
                }
            }
            const tasks = Array.from(this.view.plugin.taskIndex.values()).filter(t => t.status === 'open' && (t.due && t.due <= today)).map(t => `- [Task] ${t.title} (Due: ${t.due})`);
            const dues: string[] = [];
            const pfFolder = (this.view.plugin.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
            for (const file of this.view.app.vault.getMarkdownFiles()) {
                if (!file.path.startsWith(pfFolder + '/') && file.path !== pfFolder) continue;
                const fm = this.view.app.metadataCache.getFileCache(file)?.frontmatter;
                if (fm?.['active_status'] === false) continue;
                const dueDate = (fm?.['next_duedate'] ?? '').toString();
                if (dueDate && moment(dueDate).isSameOrBefore(moment(), 'day')) dues.push(`- [Due] ${file.basename} (Due: ${dueDate})`);
            }
            const thoughts = Array.from(this.view.plugin.thoughtIndex.values()).filter(e => e.allDates && e.allDates.includes(today)).map(t => `- [Thought] ${t.body.substring(0, 300)}`);
            const pinned = Array.from(this.view.plugin.thoughtIndex.values()).filter(e => e.pinned).map(t => `- [Pinned] ${t.title}`);
            const contextData = ["### PINNED NOTES", ...pinned, "### PENDING TASKS", ...tasks, "### CHECKLIST ITEMS", ...checklistItems, "### PENDING DUES", ...dues, "### TODAY'S THOUGHTS", ...thoughts].join('\n');
            const prompt = `You are a productivity assistant. Based on the data below, show me a concise summary for today and suggest exactly 3 high-priority topics or items I need to focus on. Keep it professional, encouraging, and clear. If no data is provided, encourage me to capture my first thought of the day.\n\nDATA FOR CONTEXT:\n${contextData || 'No data captured yet for today.'}`;
            const response = await this.view.callGemini(prompt, [], false, [{ role: 'user', text: prompt }]);
            loading.remove();
            const summaryText = container.createEl('div', { attr: { style: 'font-size: 0.9em; line-height: 1.5; color: var(--text-normal);' } });
            MarkdownRenderer.render(this.view.plugin.app, response, summaryText, '', this.view);
            const btnRow = container.createEl('div', { attr: { style: 'display: flex; gap: 8px; margin-top: 12px;' } });
            const refreshBtn = btnRow.createEl('button', { text: 'Refresh Summary', attr: { style: 'flex: 1; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: transparent; color: var(--text-muted); font-size: 0.75em; cursor: pointer;' } });
            refreshBtn.addEventListener('click', () => this.updateDailySummary(container));
        } catch (err) { loading.setText('Failed to generate summary. Check console.'); console.error('AI Summary Error:', err); }
    }

    async updateDailyDues(container: HTMLElement) {
        container.empty();
        const { metadataCache, vault } = this.view.plugin.app;
        const pfFolder = (this.view.plugin.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
        const today = moment().startOf('day');
        let dues: DueEntry[] = [];
        for (const file of vault.getMarkdownFiles()) {
            if (!file.path.startsWith(pfFolder + '/') && file.path !== pfFolder) continue;
            const fm = metadataCache.getFileCache(file)?.frontmatter;
            if (fm?.['active_status'] === false || fm?.['active_status'] === 'false' || fm?.['active_status'] === 'False') continue;
            const dueDate = (fm?.['next_duedate'] ?? '').toString().trim();
            const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;
            if (dueMoment && dueMoment.isValid() && dueMoment.isSameOrBefore(today, 'day')) {
                dues.push({ title: file.basename, path: file.path, dueDate, lastPayment: (fm?.['last_payment'] ?? '').toString().trim(), dueMoment, hasRecurring: true, isActive: true });
            }
        }
        if (dues.length === 0) { container.createEl('p', { text: 'Clear for today.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; text-align: center; margin: 0; opacity: 0.6;' } }); return; }
        dues.sort((a, b) => a.dueMoment.valueOf() - b.dueMoment.valueOf());
        const duesList = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        for (const entry of dues) {
            const row = duesList.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border-faint);' } });
            const textEl = row.createEl('div', { text: entry.title, attr: { style: 'font-size: 0.9em; font-weight: 600; flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-accent); cursor: pointer;' } });
            textEl.addEventListener('click', () => this.view.app.workspace.openLinkText(entry.title, entry.path, 'window'));
            const isOverdue = entry.dueMoment.isBefore(today, 'day');
            row.createSpan({ text: entry.dueDate, attr: { style: `font-size: 0.8em; color: ${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; font-weight: 600;` } });
            const payBtn = row.createEl('button', { text: 'Pay', attr: { style: 'padding: 4px 12px; border-radius: 6px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.75em; font-weight: 700; cursor: pointer;' } });
            payBtn.addEventListener('click', (e) => { e.stopPropagation(); const fileObj = vault.getAbstractFileByPath(entry.path) as TFile; if (fileObj) new PaymentModal(this.view.plugin.app, fileObj, entry.dueDate, () => this.updateDailyDues(container)).open(); });
        }
    }

    async updateDailyThoughts(container: HTMLElement) {
        container.empty();
        const today = moment().format('YYYY-MM-DD');
        const thoughts = Array.from(this.view.plugin.thoughtIndex.values()).filter(e => e.allDates && e.allDates.includes(today));
        thoughts.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
        if (thoughts.length === 0) { container.createEl('p', { text: 'No activity.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; text-align: center; margin: 0; opacity: 0.6;' } }); return; }
        const list = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        for (const entry of thoughts) await this.renderThoughtRow(entry, list, entry.filePath, 0, true, true);
    }

    async updatePinnedThoughts(container: HTMLElement) {
        container.empty();
        const thoughts = Array.from(this.view.plugin.thoughtIndex.values()).filter(e => e.pinned);
        thoughts.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
        if (thoughts.length === 0) { container.createEl('p', { text: 'No pinned items.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; text-align: center; margin: 0; opacity: 0.6;' } }); return; }
        const list = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        for (const entry of thoughts) await this.renderThoughtRow(entry, list, entry.filePath, 0, true, true);
    }

    async updateDailyThoughtTodos(container: HTMLElement) {
        container.empty();
        const thoughts = Array.from(this.view.plugin.thoughtIndex.values());
        let foundAny = false;
        const list = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        for (const entry of thoughts) {
            const renderTodo = (text: string, sourceFilePath: string, isChild: boolean = false, anchor?: string) => {
                foundAny = true;
                const row = list.createEl('div', { attr: { style: 'display: flex; align-items: flex-start; gap: 10px; padding: 6px; background: var(--background-primary); border-radius: 8px; border: 1px solid var(--background-modifier-border-faint);' } });
                const circle = row.createEl('span');
                const applyStyle = (checked: boolean) => { circle.style.cssText = `margin-top: 3px; display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; border:2px solid var(--interactive-accent); cursor:pointer; flex-shrink:0; transition:all 0.15s; background:${checked ? 'var(--interactive-accent)' : 'transparent'}; font-size:10px; color:var(--text-on-accent); user-select:none;`; circle.textContent = checked ? '✓' : ''; };
                applyStyle(false);
                circle.addEventListener('click', async (e) => {
                    e.stopPropagation(); applyStyle(true); row.style.opacity = '0.4'; row.style.textDecoration = 'line-through';
                    if (isChild && anchor) {
                        const file = this.view.app.vault.getAbstractFileByPath(sourceFilePath) as TFile;
                        if (file) {
                            const content = await this.view.app.vault.read(file); const lines = content.split('\n');
                            const idx = lines.findIndex(l => l.includes(`^${anchor}`));
                            if (idx !== -1) {
                                for (let i = idx + 1; i < lines.length && !lines[i].startsWith('## '); i++) { if (lines[i].includes(`- [ ] ${text}`)) { lines[i] = lines[i].replace('- [ ] ', '- [x] '); break; } }
                                await this.view.app.vault.modify(file, lines.join('\n')); await this.view.plugin.indexThoughtFile(file);
                            }
                        }
                    } else { const newBody = entry.body.replace(`- [ ] ${text}`, `- [x] ${text}`); await this.view.plugin.editThoughtBody(sourceFilePath, newBody, entry.context); }
                    setTimeout(() => this.updateDailyThoughtTodos(container), 500);
                });
                const textEl = row.createEl('div', { attr: { style: 'font-size: 0.9em; line-height: 1.4; color: var(--text-normal); flex-grow: 1; min-width: 0;' } });
                MarkdownRenderer.render(this.view.plugin.app, text, textEl, sourceFilePath, this.view);
                const p = textEl.querySelector('p'); if (p) { p.style.margin = '0'; p.style.display = 'inline'; }
                const link = row.createEl('span', { text: '↗', attr: { style: 'font-size: 0.8em; cursor: pointer; opacity: 0.3; flex-shrink: 0; padding: 2px; margin-top: 2px;', title: 'Go to source' } });
                link.addEventListener('click', (e) => { e.stopPropagation(); this.view.app.workspace.openLinkText(sourceFilePath, '', 'window'); });
            };
            const bodyMatches = entry.body.matchAll(/- \[ \] (.*)/g);
            for (const m of bodyMatches) renderTodo(m[1], entry.filePath);
            for (const child of entry.children) {
                const childMatches = child.text.matchAll(/- \[ \] (.*)/g);
                for (const m of childMatches) renderTodo(m[1], entry.filePath, true, child.anchor);
            }
        }
        if (!foundAny) container.createEl('p', { text: 'Done!', attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin: 0; opacity: 0.6;' } });
    }

    async updateDailyTasks(container: HTMLElement) {
        container.empty();
        const today = moment().format('YYYY-MM-DD');
        const tasks = Array.from(this.view.plugin.taskIndex.values()).filter(t => t.status === 'open' && (t.due && t.due <= today));
        tasks.sort((a, b) => (a.due || '').localeCompare(b.due || ''));
        if (tasks.length === 0) { container.createEl('p', { text: 'No pending tasks.', attr: { style: 'color: var(--text-muted); font-size: 0.9em; text-align: center; margin: 0; opacity: 0.6;' } }); return; }
        const list = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        for (const task of tasks) await this.renderTaskRow(task, list, true);
    }
}
