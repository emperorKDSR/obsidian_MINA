import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";
import { ChatSessionPickerModal } from "../modals/ChatSessionPickerModal";
import { NotePickerModal } from "../modals/NotePickerModal";

export class DuesTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderDuesMode(container);
    }
        renderDuesMode(container: HTMLElement) {
            const wrap = container.createEl('div', { attr: { style: 'padding: 12px 12px 200px 12px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch;' } });
            const duesHeaderRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;' } });
            duesHeaderRow.createEl('span', { text: 'Personal Finance', attr: { style: 'font-size: 0.9em; font-weight: 600; color: var(--text-muted);' } });
            const addBtn = duesHeaderRow.createEl('button', { text: '+ Add', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
            addBtn.addEventListener('click', () => { new NewDueModal(this.view.plugin.app, this.view.plugin.settings.pfFolder, () => this.view.renderView()).open(); });
    
            const filterRow = wrap.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;' } });
            filterRow.createEl('span', { text: 'Filter:', attr: { style: 'font-size: 0.78em; color: var(--text-muted);' } });
            let recurringOnly = false; let activeOnly = true;
            const pillStyle = (active: boolean) => `padding: 3px 12px; border-radius: 20px; border: 1.5px solid var(--interactive-accent); font-size: 0.78em; font-weight: 600; cursor: pointer; transition: all 0.15s; background: ${active ? 'var(--interactive-accent)' : 'transparent'}; color: ${active ? 'var(--text-on-accent)' : 'var(--interactive-accent)'};`;
            const recurringPill = filterRow.createEl('button', { text: 'Recurring', attr: { style: pillStyle(false) } });
            const activePill = filterRow.createEl('button', { text: 'Active', attr: { style: pillStyle(true) } });
    
            const { metadataCache, vault } = this.view.plugin.app;
            const pfFolder = (this.view.plugin.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
    
            const buildEntries = (): DueEntry[] => {
                const all: DueEntry[] = [];
                for (const file of vault.getMarkdownFiles()) {
                    if (!file.path.startsWith(pfFolder + '/') && file.path !== pfFolder) continue;
                    const fm = metadataCache.getFileCache(file)?.frontmatter;
                    const dueDate = (fm?.['next_duedate'] ?? '').toString().trim();
                    const lastPayment = (fm?.['last_payment'] ?? '').toString().trim();
                    const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;
                    const hasRecurring = !!(dueDate);
                    const activeStatus = fm?.['active_status'];
                    const isActive = activeStatus === true || activeStatus === 'true' || activeStatus === 'True';
                    all.push({ title: file.basename, path: file.path, dueDate, lastPayment, dueMoment, hasRecurring, isActive });
                }
                all.sort((a, b) => {
                    if (!a.dueMoment?.isValid() && !b.dueMoment?.isValid()) return a.title.localeCompare(b.title);
                    if (!a.dueMoment?.isValid()) return 1;
                    if (!b.dueMoment?.isValid()) return -1;
                    return a.dueMoment.valueOf() - b.dueMoment.valueOf();
                });
                return all;
            };
    
            const tableWrap = wrap.createEl('div');
            const renderTable = () => {
                tableWrap.empty();
                const entries = buildEntries().filter(e => (!recurringOnly || e.hasRecurring) && (!activeOnly || e.isActive));
                if (entries.length === 0) { tableWrap.createEl('p', { text: 'No entries found.', attr: { style: 'color: var(--text-muted); font-size: 0.85em;' } }); return; }
                const table = tableWrap.createEl('table', { attr: { style: 'width: 100%; border-collapse: collapse; font-size: 0.88em;' } });
                const headerRow = table.createEl('thead').createEl('tr');
                ['Payable', 'Due Date', 'Last Payment', ''].forEach(h => { headerRow.createEl('th', { text: h, attr: { style: 'text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--background-modifier-border); color: var(--text-muted); font-weight: 600; white-space: nowrap;' } }); });
                const tbody = table.createEl('tbody'); const today = moment().startOf('day');
                entries.forEach(entry => {
                    const tr = tbody.createEl('tr', { attr: { style: 'border-bottom: 1px solid var(--background-modifier-border); transition: background 0.15s;' } });
                    tr.addEventListener('mouseenter', () => tr.style.background = 'var(--background-secondary)');
                    tr.addEventListener('mouseleave', () => tr.style.background = '');
                    const tdPayable = tr.createEl('td', { attr: { style: 'padding: 7px 10px;' } });
                    const link = tdPayable.createEl('a', { text: entry.title, attr: { style: 'color: var(--text-accent); cursor: pointer; text-decoration: none; font-weight: 500;' } });
                    link.addEventListener('click', (e) => { e.preventDefault(); this.view.plugin.app.workspace.openLinkText(entry.title, entry.path, Platform.isMobile ? 'tab' : 'window'); });
                    const tdDue = tr.createEl('td', { attr: { style: 'padding: 7px 10px; white-space: nowrap;' } });
                    if (entry.dueMoment?.isValid()) {
                        const isOverdue = entry.dueMoment.isBefore(today); const isToday = entry.dueMoment.isSame(today, 'day');
                        const color = isOverdue ? 'var(--text-error)' : isToday ? 'var(--interactive-accent)' : 'var(--text-normal)';
                        tdDue.createEl('span', { text: entry.dueDate, attr: { style: `color: ${color}; font-weight: ${isOverdue || isToday ? '600' : '400'};` } });
                        if (isOverdue) tdDue.createEl('span', { text: ' ⚠', attr: { style: 'color: var(--text-error); font-size: 0.85em;' } });
                    } else tdDue.createEl('span', { text: '—', attr: { style: 'color: var(--text-muted);' } });
                    tr.createEl('td', { text: entry.lastPayment || '—', attr: { style: 'padding: 7px 10px; color: var(--text-muted); white-space: nowrap;' } });
                    const tdPay = tr.createEl('td', { attr: { style: 'padding: 4px 8px; text-align: right;' } });
                    if (entry.hasRecurring) {
                        const payWrapInner = tdPay.createEl('div', { attr: { style: 'display: flex; gap: 6px; justify-content: flex-end; align-items: center;' } });
                        const quickDateInput = payWrapInner.createEl('input', { type: 'date', attr: { style: 'padding: 2px 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.85em;' } });
                        quickDateInput.value = moment().format('YYYY-MM-DD');
                        const payBtn = payWrapInner.createEl('button', { text: 'Pay', attr: { style: 'padding: 3px 12px; border-radius: 5px; border: none; background: var(--interactive-accent); color: var(--text-on-accent); font-size: 0.8em; font-weight: 600; cursor: pointer;' } });
                        payBtn.addEventListener('click', () => {
                            const fileObj = vault.getAbstractFileByPath(entry.path) as TFile;
                            if (!fileObj) { new Notice('Note file not found.'); return; }
                            new PaymentModal(this.view.plugin.app, fileObj, entry.dueDate, () => { this.view.renderView(); }, quickDateInput.value).open();
                        });
                    }
                });
            };
            recurringPill.addEventListener('click', () => { recurringOnly = !recurringOnly; recurringPill.setAttribute('style', pillStyle(recurringOnly)); renderTable(); });
            activePill.addEventListener('click', () => { activeOnly = !activeOnly; activePill.setAttribute('style', pillStyle(activeOnly)); renderTable(); });
            renderTable();
        }
    
    
}
