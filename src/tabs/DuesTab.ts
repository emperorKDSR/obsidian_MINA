import { moment, Platform, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";

export class DuesTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderDuesMode(container);
    }

    async renderDuesMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 14px 12px 200px 12px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary);'
            }
        });

        // 1. Header (Compact)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 8px; margin-bottom: 2px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: 'Finance',
            attr: { style: 'margin: 0; font-size: 1.25em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em;' }
        });

        const addBtn = titleRow.createEl('button', {
            text: '+ Add',
            attr: { style: 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.65em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 600;' }
        });
        addBtn.addEventListener('click', () => { 
            new NewDueModal(this.app, this.settings.pfFolder, () => this.renderDuesMode(container)).open(); 
        });

        // 2. Cashflow Dashboard
        const entries = this.buildEntries();
        const totalDues = entries.filter(e => e.isActive).reduce((acc, e) => {
            const amount = parseFloat(e.title.match(/[\d.]+/)?.[0] || '0');
            return isNaN(amount) ? acc : acc + amount;
        }, 0);
        const income = this.settings.monthlyIncome || 0;
        const remaining = income - totalDues;

        const cashflow = header.createEl('div', {
            attr: { style: 'background: var(--background-secondary-alt); border-radius: 12px; padding: 12px; border: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 8px;' }
        });

        const statsRow = cashflow.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: baseline;' } });
        const leftStats = statsRow.createEl('div', { attr: { style: 'display: flex; gap: 12px;' } });
        
        const miniStat = (parent: HTMLElement, label: string, val: string, color?: string) => {
            const statWrap = parent.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
            statWrap.createSpan({ text: label, attr: { style: 'font-size: 0.55em; font-weight: 800; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.05em;' } });
            statWrap.createSpan({ text: val, attr: { style: `font-size: 0.9em; font-weight: 700; color: ${color || 'var(--text-normal)'};` } });
        };

        miniStat(leftStats, 'Income', income.toLocaleString());
        miniStat(leftStats, 'Dues', totalDues.toLocaleString(), 'var(--text-error)');
        miniStat(statsRow, 'Remaining', remaining.toLocaleString(), remaining < 0 ? 'var(--text-error)' : 'var(--text-success)');

        const progressContainer = cashflow.createEl('div', {
            attr: { style: 'width: 100%; height: 6px; background: var(--background-primary); border-radius: 3px; overflow: hidden; border: 1px solid var(--background-modifier-border-faint);' }
        });
        const percent = income > 0 ? Math.min(100, (totalDues / income) * 100) : 0;
        progressContainer.createEl('div', {
            attr: { style: `width: ${percent}%; height: 100%; background: ${percent > 90 ? 'var(--text-error)' : 'var(--interactive-accent)'}; transition: width 0.3s;` }
        });

        // 3. List
        const listContainer = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 8px;' } });
        entries.forEach(entry => {
            const card = listContainer.createEl('div', { attr: { style: 'padding: 12px; border-radius: 8px; background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: space-between; align-items: center;' } });
            const info = card.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 2px;' } });
            info.createEl('div', { text: entry.title, attr: { style: 'font-size: 0.9em; font-weight: 700;' } });
            info.createEl('div', { text: `Due: ${entry.dueDate}`, attr: { style: 'font-size: 0.75em; color: var(--text-muted);' } });
            
            if (entry.hasRecurring) {
                const payBtn = card.createEl('button', { text: 'Pay', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 4px 12px; border-radius: 6px; font-size: 0.75em; cursor: pointer;' } });
                payBtn.addEventListener('click', () => {
                    const file = this.app.vault.getAbstractFileByPath(entry.path);
                    if (file instanceof TFile) new PaymentModal(this.app, file, entry.dueDate, () => this.renderDuesMode(container)).open();
                });
            }
        });
    }

    private buildEntries(): DueEntry[] {
        const { metadataCache, vault } = this.app;
        const pfFolder = (this.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
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
        return all.sort((a, b) => (a.dueMoment?.valueOf() || 0) - (b.dueMoment?.valueOf() || 0));
    }
}
