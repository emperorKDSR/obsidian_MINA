import { moment, Platform, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";

export class DuesTab extends BaseTab {
    showAll: boolean = false;

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderDuesMode(container);
    }

    async renderDuesMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 800px; margin: 0 auto;'
            }
        });

        // 1. Header (Strategic)
        const header = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 14px;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        const titleStack = titleRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column;' } });
        titleStack.createEl('h2', {
            text: 'Financial Ledger',
            attr: { style: 'margin: 0; font-size: 1.6em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.03em;' }
        });
        titleStack.createEl('span', { text: moment().format('MMMM YYYY'), attr: { style: 'font-size: 0.8em; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em;' } });

        const addBtn = titleRow.createEl('button', {
            text: '+ New Entry',
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 8px; font-size: 0.65em; padding: 6px 14px; cursor: pointer; font-weight: 800; text-transform: uppercase; box-shadow: 0 4px 10px rgba(var(--interactive-accent-rgb), 0.2);' }
        });
        addBtn.addEventListener('click', () => { 
            new NewDueModal(this.app, this.settings.pfFolder, () => this.renderDuesMode(container)).open(); 
        });

        // 2. Segmented Toggle Bar
        const filterBar = header.createEl('div', {
            attr: { style: 'display: flex; gap: 4px; padding: 4px; background: var(--background-secondary-alt); border-radius: 12px; border: 1px solid var(--background-modifier-border-faint); width: fit-content;' }
        });

        const renderTogglePill = (label: string, isActive: boolean, onClick: () => void) => {
            const pill = filterBar.createEl('button', {
                text: label,
                attr: { style: `padding: 4px 14px; border-radius: 8px; border: none; font-size: 0.65em; font-weight: 800; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; background: ${isActive ? 'var(--background-primary)' : 'transparent'}; color: ${isActive ? 'var(--interactive-accent)' : 'var(--text-muted)'}; box-shadow: ${isActive ? 'var(--mina-shadow)' : 'none'};` }
            });
            pill.addEventListener('click', onClick);
        };

        renderTogglePill('Active Obligations', !this.showAll, () => { this.showAll = false; this.renderDuesMode(container); });
        renderTogglePill('All History', this.showAll, () => { this.showAll = true; this.renderDuesMode(container); });

        // 3. Ledger Entries
        const listContainer = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
        
        const entries = this.buildEntries().filter(e => this.showAll || e.isActive);
        const today = moment().startOf('day');

        if (entries.length === 0) {
            listContainer.createEl('p', { text: 'No entries found.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 40px; opacity: 0.5; font-style: italic;' } });
        } else {
            entries.forEach(entry => {
                const isOverdue = entry.dueMoment?.isValid() && entry.dueMoment.isBefore(today);
                const isToday = entry.dueMoment?.isValid() && entry.dueMoment.isSame(today, 'day');
                
                const card = listContainer.createEl('div', { 
                    cls: 'mina-card', 
                    attr: { style: `display: flex; align-items: center; gap: 16px; padding: 16px; border-left: 4px solid ${isOverdue ? 'var(--text-error)' : isToday ? 'var(--interactive-accent)' : 'transparent'}; ${!entry.isActive ? 'opacity: 0.6;' : ''}` } 
                });

                // Status Dot
                const dot = card.createDiv({
                    attr: { style: `width: 8px; height: 8px; border-radius: 50%; background: ${isOverdue ? 'var(--text-error)' : isToday ? 'var(--interactive-accent)' : 'var(--text-faint)'}; opacity: ${entry.isActive ? '1' : '0.3'}; flex-shrink: 0;` }
                });
                if (entry.isActive && (isOverdue || isToday)) dot.style.boxShadow = `0 0 10px ${isOverdue ? 'var(--text-error)' : 'var(--interactive-accent)'}`;

                const info = card.createEl('div', { attr: { style: 'flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;' } });
                const titleLink = info.createEl('a', {
                    text: entry.title,
                    attr: { style: 'font-size: 1em; font-weight: 800; color: var(--text-normal); text-decoration: none; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' }
                });
                titleLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.plugin.app.workspace.openLinkText(entry.title, entry.path, Platform.isMobile ? 'tab' : 'window');
                });
                
                info.createEl('span', { 
                    text: entry.dueMoment?.isValid() ? `Due ${entry.dueMoment.fromNow()}` : 'No due date', 
                    attr: { style: 'font-size: 0.7em; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;' } 
                });

                // Monetary Amount (Monospace)
                const amountMatch = entry.title.match(/[\d,.]+/);
                if (amountMatch) {
                    const amount = card.createEl('div', {
                        text: amountMatch[0],
                        attr: { style: 'font-family: var(--font-monospace); font-size: 1.1em; font-weight: 700; color: var(--text-normal); padding: 0 10px;' }
                    });
                }

                if (entry.hasRecurring && entry.isActive) {
                    const payBtn = card.createEl('button', {
                        attr: { style: 'background: var(--background-primary-alt); border: 1px solid var(--background-modifier-border-faint); border-radius: 8px; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--interactive-accent); transition: all 0.2s;' }
                    });
                    setIcon(payBtn, 'lucide-credit-card');
                    payBtn.addEventListener('mouseenter', () => { payBtn.style.background = 'var(--interactive-accent)'; payBtn.style.color = 'var(--text-on-accent)'; payBtn.style.transform = 'scale(1.1)'; });
                    payBtn.addEventListener('mouseleave', () => { payBtn.style.background = 'var(--background-primary-alt)'; payBtn.style.color = 'var(--interactive-accent)'; payBtn.style.transform = 'none'; });
                    
                    payBtn.addEventListener('click', () => {
                        const file = this.app.vault.getAbstractFileByPath(entry.path);
                        if (file instanceof TFile) new PaymentModal(this.app, this.plugin, file, entry.dueDate, () => this.renderDuesMode(container)).open();
                    });
                }
            });
        }
    }

    private buildEntries(): DueEntry[] {
        // ob-perf-03: Read from pre-built index (O(1)) instead of scanning vault on every render
        return Array.from(this.index.dueIndex.values())
            .sort((a, b) => (a.dueMoment?.valueOf() || 0) - (b.dueMoment?.valueOf() || 0));
    }
}
