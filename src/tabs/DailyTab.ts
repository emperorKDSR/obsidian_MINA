import { moment, Platform, MarkdownRenderer, TFile } from 'obsidian';
import type { MinaView } from '../view';
import type { MinaSettings, DueEntry } from '../types';
import { PaymentModal } from '../modals/PaymentModal';

import { BaseTab } from "./BaseTab";

export class DailyTab extends BaseTab {
    view: MinaView;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderDailyMode(container);
    }

        renderDailyMode(container: HTMLElement) {
            const wrap = container.createEl('div', {
                attr: {
                    style: 'padding: 12px 12px 200px 12px; display: flex; flex-direction: column; gap: 5px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch;'
                }
            });
    
            const header = wrap.createEl('div', {
                attr: {
                    style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);'
                }
            });
    
            const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
    
            if (this.view.isDedicated) {
                const closeBtn = leftHeader.createEl('button', {
                    text: '✕',
                    attr: { style: 'padding: 4px 8px; border-radius: 4px; background: transparent; color: var(--text-muted); font-size: 1.2em; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;' }
                });
                closeBtn.addEventListener('click', () => {
                    this.view.leaf.detach();
                });
            }
    
            const isMobileDedicated = Platform.isMobile && this.view.isDedicated;
    
            leftHeader.createEl('h3', {
                text: isMobileDedicated ? moment().format('ddd, MMM D') : `Daily Focus — ${moment().format('ddd, MMM D')}`,
                attr: {
                    style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);'
                }
            });
    
            const btnGroup = header.createEl('div', { attr: { style: 'display: flex; gap: 8px; align-items: center;' } });
    
            let toggleTarget = btnGroup;
    
            if (isMobileDedicated) {
                // Row 2: Section Toggles (Action buttons now share Row 1)
                toggleTarget = wrap.createEl('div', {
                    attr: { style: 'display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--background-modifier-border);' }
                });
            }
    
            // Individual Section Toggles
            const renderToggle = (label: string, settingKey: keyof MinaSettings) => {
                const toggleContainer = toggleTarget.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 4px; font-size: 0.75em; color: var(--text-muted); cursor: pointer;' } });
                toggleContainer.createSpan({ text: label });
                const toggleLabel = toggleContainer.createEl('label', { attr: { style: 'position: relative; display: inline-block; width: 24px; height: 12px; cursor: pointer;' } });
                const cb = toggleLabel.createEl('input', { type: 'checkbox', attr: { style: 'opacity: 0; width: 0; height: 0; position: absolute;' } });
                cb.checked = !!this.view.plugin.settings[settingKey];
                const slider = toggleLabel.createEl('span', { attr: { style: `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${cb.checked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition: .3s; border-radius: 12px;` } });
                const knob = toggleLabel.createEl('span', { attr: { style: `position: absolute; height: 8px; width: 8px; left: 2px; bottom: 2px; background-color: var(--text-on-accent, white); transition: .3s; border-radius: 50%; transform: ${cb.checked ? 'translateX(12px)' : 'translateX(0)'};` } });
    
                cb.addEventListener('change', async () => {
                    (this.view.plugin.settings[settingKey] as any) = cb.checked;
                    slider.style.backgroundColor = cb.checked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
                    knob.style.transform = cb.checked ? 'translateX(12px)' : 'translateX(0)';
                    await this.view.plugin.saveSettings();
                    this.view.renderView();
                });
            };
    
            renderToggle('Cl', 'showDailyChecklist');
            renderToggle('Ta', 'showDailyTasks');
            renderToggle('Du', 'showDailyDues');
            renderToggle('Pi', 'showDailyPinned');
            renderToggle('Th', 'showDailyThoughts');
    
            this.renderSearchInput(wrap, () => this.view.renderView());
    
            if (this.view.plugin.settings.showDailyChecklist) {
                const section1 = this.renderDailySection(wrap, "TODAY'S CHECKLIST", 'checklist');
                this.updateDailyThoughtTodos(section1);
            }
    
            if (this.view.plugin.settings.showDailyTasks) {
                const section2 = this.renderDailySection(wrap, 'PENDING TASKS', 'tasks');
                this.updateDailyTasks(section2);
            }
    
            if (this.view.plugin.settings.showDailyDues) {
                const sectionDues = this.renderDailySection(wrap, 'PENDING DUES', 'dues');
                this.updateDailyDues(sectionDues);
            }
    
            if (this.view.plugin.settings.showDailyPinned) {
                const sectionPinned = this.renderDailySection(wrap, "PINNED THOUGHTS", 'pinned');
                this.updatePinnedThoughts(sectionPinned);
            }
    
            if (this.view.plugin.settings.showDailyThoughts) {
                const section3 = this.renderDailySection(wrap, "TODAY'S THOUGHTS", 'thoughts');
                this.updateDailyThoughts(section3);
            }
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
                const activeStatus = fm?.['active_status'];
                if (activeStatus === false || activeStatus === 'false' || activeStatus === 'False') continue;
    
                const dueDate = (fm?.['next_duedate'] ?? '').toString().trim();
                const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;
    
                if (dueMoment && dueMoment.isValid() && dueMoment.isSameOrBefore(today, 'day')) {
                    dues.push({
                        title: file.basename,
                        path: file.path,
                        dueDate,
                        lastPayment: (fm?.['last_payment'] ?? '').toString().trim(),
                        dueMoment,
                        hasRecurring: true,
                        isActive: true
                    });
                }
            }
    
            if (this.view.searchQuery) {
                dues = dues.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.title]));
            }
    
            if (dues.length === 0) {
                container.createEl('p', { text: this.view.searchQuery ? 'No matching dues.' : 'No pending dues.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
                return;
            }
    
            dues.sort((a, b) => a.dueMoment.valueOf() - b.dueMoment.valueOf());
            const duesList = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
    
            for (const entry of dues) {
                const row = duesList.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--background-modifier-border-faint); width: 100%; min-width: 0;' } });
                row.createSpan({ text: '💳', attr: { style: 'font-size: 0.9em; flex-shrink: 0;' } });
                const textEl = row.createEl('div', {
                    text: entry.title,
                    attr: { style: 'font-size: 0.85em; line-height: 1.2; flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-accent); cursor: pointer;' }
                });
                textEl.addEventListener('click', () => this.view.app.workspace.openLinkText(entry.title, entry.path, 'window'));
    
                const isOverdue = entry.dueMoment.isBefore(today, 'day');
                row.createSpan({
                    text: entry.dueDate,
                    attr: { style: `font-size: 0.75em; color: ${isOverdue ? 'var(--text-error)' : 'var(--interactive-accent)'}; font-weight: 600; flex-shrink: 0;` }
                });
    
                const payBtn = row.createEl('button', {
                    text: 'Pay',
                    attr: { style: 'padding: 2px 8px; border-radius: 4px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.7em; font-weight: 600; cursor: pointer; flex-shrink: 0;' }
                });
                payBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const fileObj = vault.getAbstractFileByPath(entry.path) as TFile;
                    if (fileObj) new PaymentModal(this.view.plugin.app, fileObj, entry.dueDate, () => this.view.renderView()).open();
                });
            }
        }
    
        async updateDailyThoughts(container: HTMLElement) {
            container.empty();
            const today = moment().format('YYYY-MM-DD');
            let thoughts = Array.from(this.view.plugin.thoughtIndex.values())
                .filter(e => e.allDates && e.allDates.includes(today));
    
            if (this.view.searchQuery) {
                thoughts = thoughts.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
            }
    
            thoughts.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
    
            if (thoughts.length === 0) {
                container.createEl('p', { text: this.view.searchQuery ? 'No matching thoughts.' : 'No thoughts captured today.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
                return;
            }
    
            const thoughtsRowContainer = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; width: 100%;' } });
            for (const entry of thoughts) {
                await this.renderThoughtRow(entry, thoughtsRowContainer, entry.filePath, 0, true, true);
            }
        }
    
        async updatePinnedThoughts(container: HTMLElement) {
            container.empty();
            let thoughts = Array.from(this.view.plugin.thoughtIndex.values())
                .filter(e => e.pinned);
    
            if (this.view.searchQuery) {
                thoughts = thoughts.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
            }
    
            thoughts.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);
    
            if (thoughts.length === 0) {
                container.createEl('p', { text: this.view.searchQuery ? 'No matching pinned thoughts.' : 'No pinned thoughts.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
                return;
            }
    
            const thoughtsRowContainer = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px; width: 100%;' } });
            for (const entry of thoughts) {
                await this.renderThoughtRow(entry, thoughtsRowContainer, entry.filePath, 0, true, true);
            }
        }
    
        renderDailySection(container: HTMLElement, title: string, key: string): HTMLElement {
            if (!this.view.plugin.settings.dailySectionStates) this.view.plugin.settings.dailySectionStates = {};
            const isOpen = this.view.plugin.settings.dailySectionStates[key] !== false;
    
            const details = container.createEl('details', {
                attr: {
                    style: 'margin-bottom: 10px; background: var(--background-secondary); border-radius: 8px; overflow: hidden; border: 1px solid var(--background-modifier-border); flex-shrink: 0; width: 100%;'
                }
            });
            details.open = isOpen;
    
            const summary = details.createEl('summary', {
                attr: {
                    style: 'padding: 10px 12px; cursor: pointer; font-weight: 700; color: var(--text-accent); font-size: 0.85em; list-style: none; display: flex; align-items: center; gap: 8px; letter-spacing: 0.05em; user-select: none;'
                }
            });
    
            const chevron = summary.createSpan({
                text: isOpen ? '▼' : '▶',
                attr: { style: 'font-size: 0.7em; transition: transform 0.2s; width: 1.2em; text-align: center; opacity: 0.6; flex-shrink: 0;' }
            });
    
            summary.createSpan({ text: title, attr: { style: 'flex-grow: 1;' } });
    
            details.addEventListener('toggle', async () => {
                const newState = details.open;
                chevron.textContent = newState ? '▼' : '▶';
    
                // Only update and save if the state actually changed from the stored preference
                if (this.view.plugin.settings.dailySectionStates[key] !== newState) {
                    this.view.plugin.settings.dailySectionStates[key] = newState;
                    await this.view.plugin.saveSettings();
                }
            });
    
            const content = details.createEl('div', {
                attr: { style: 'padding: 0 12px 12px 12px; display: block; width: 100%;' }
            });
            return content;
        }
    
        async updateDailyThoughtTodos(container: HTMLElement) {
            container.empty();
            const thoughts = Array.from(this.view.plugin.thoughtIndex.values());
            let foundAny = false;
    
            const todoList = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
    
            for (const entry of thoughts) {
                const renderTodo = (text: string, sourceFilePath: string, isChild: boolean = false, anchor?: string) => {
                    if (this.view.searchQuery && !text.toLowerCase().includes(this.view.searchQuery)) return;
                    foundAny = true;
                    const row = todoList.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding: 2px 0; width: 100%; min-width: 0;' } });
    
                    const circle = row.createEl('span');
                    const applyStyle = (checked: boolean) => {
                        circle.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; border-radius:50%; border:2px solid var(--interactive-accent); cursor:pointer; flex-shrink:0; transition:background 0.15s; background:${checked ? 'var(--interactive-accent)' : 'transparent'}; font-size:9px; color:var(--background-primary); user-select:none;`;
                        circle.textContent = checked ? '✓' : '';
                    };
                    applyStyle(false);
    
                    circle.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        applyStyle(true);
                        row.style.opacity = '0.5';
                        row.style.textDecoration = 'line-through';
    
                        if (isChild && anchor) {
                            const file = this.view.app.vault.getAbstractFileByPath(sourceFilePath) as TFile;
                            if (file) {
                                const content = await this.view.app.vault.read(file);
                                const lines = content.split('\n');
                                const idx = lines.findIndex(l => l.includes(`^${anchor}`));
                                if (idx !== -1) {
                                    for (let i = idx + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
                                        if (lines[i].includes(`- [ ] ${text}`)) {
                                            lines[i] = lines[i].replace('- [ ] ', '- [x] ');
                                            break;
                                        }
                                    }
                                    await this.view.app.vault.modify(file, lines.join('\n'));
                                    await this.view.plugin.indexThoughtFile(file);
                                }
                            }
                        } else {
                            const newBody = entry.body.replace(`- [ ] ${text}`, `- [x] ${text}`);
                            await this.view.plugin.editThoughtBody(sourceFilePath, newBody, entry.context);
                        }
    
                        setTimeout(() => this.view.renderView(), 500);
                    });
    
                    const textEl = row.createEl('div', { attr: { style: 'font-size: 0.85em; line-height: 1.2; word-break: break-word; flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' } });
                    MarkdownRenderer.render(this.view.plugin.app, text, textEl, sourceFilePath, this.view);
    
                    const p = textEl.querySelector('p');
                    if (p) { p.style.margin = '0'; p.style.display = 'inline'; }
    
                    const link = row.createEl('span', {
                        text: '🔗',
                        attr: { style: 'font-size: 0.75em; cursor: pointer; opacity: 0.3; flex-shrink: 0;', title: 'Go to source' }
                    });
                    link.addEventListener('click', (e) => { e.stopPropagation(); this.view.app.workspace.openLinkText(sourceFilePath, '', 'window'); });
                };
    
                const bodyMatches = entry.body.matchAll(/- \[ \] (.*)/g);
                for (const m of bodyMatches) renderTodo(m[1], entry.filePath);
    
                for (const child of entry.children) {
                    const childMatches = child.text.matchAll(/- \[ \] (.*)/g);
                    for (const m of childMatches) renderTodo(m[1], entry.filePath, true, child.anchor);
                }
            }
    
            if (!foundAny) {
                container.createEl('p', { text: this.view.searchQuery ? 'No matching to-dos.' : 'No open to-dos.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
            }
        }
    
        async updateDailyTasks(container: HTMLElement) {
            container.empty();
            const today = moment().format('YYYY-MM-DD');
            let tasks = Array.from(this.view.plugin.taskIndex.values())
                .filter(t => t.status === 'open' && (t.due && t.due <= today));
    
            if (this.view.searchQuery) {
                tasks = tasks.filter(t => this.view.matchesSearch(this.view.searchQuery, [t.body, t.title]));
            }
    
            tasks.sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    
            if (tasks.length === 0) {
                container.createEl('p', { text: this.view.searchQuery ? 'No matching tasks.' : 'No pending tasks.', attr: { style: 'color: var(--text-muted); font-size: 0.8em; text-align: center; margin: 5px 0;' } });
                return;
            }
    
            const taskList = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
    
            for (const task of tasks) {
                const row = taskList.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--background-modifier-border-faint); width: 100%; min-width: 0;' } });
    
                const cb = row.createEl('input', { type: 'checkbox', attr: { style: 'width: 14px; height: 14px; flex-shrink: 0; margin: 0;' } });
                cb.addEventListener('change', async () => {
                    if (cb.checked) {
                        row.style.opacity = '0.5';
                        row.style.textDecoration = 'line-through';
                        await this.view.plugin.toggleTaskStatus(task.filePath, true);
                        setTimeout(() => this.view.renderView(), 500);
                    }
                });
    
                const textEl = row.createEl('div', { attr: { style: 'font-size: 0.85em; line-height: 1.2; word-break: break-word; flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' } });
                MarkdownRenderer.render(this.view.plugin.app, task.body || task.title, textEl, task.filePath, this.view);
    
                const p = textEl.querySelector('p');
                if (p) { p.style.margin = '0'; p.style.display = 'inline'; }
    
                const isOverdue = task.due && task.due < today;
                if (isOverdue) {
                    row.createSpan({
                        text: '⚠',
                        attr: { style: 'font-size: 0.75em; color: var(--text-error); flex-shrink: 0; margin-left: auto;', title: `Overdue: ${task.due}` }
                    });
                }
            }
        }
    
    
}
