import { moment, Platform, Notice, TFile } from 'obsidian';
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
            new NewDueModal(this.view.plugin.app, this.view.plugin.settings.pfFolder, () => this.renderDuesMode(container)).open(); 
        });

        // 2. Filter Row (Mini Pills)
        const filterRow = header.createEl('div', {
            attr: { style: 'display: flex; gap: 4px; padding: 2px; background: var(--background-secondary-alt); border-radius: 6px; width: fit-content; border: 1px solid var(--background-modifier-border-faint);' }
        });

        let recurringOnly = false; 
        let activeOnly = true;

        const renderFilterPill = (label: string, isActive: boolean, onClick: () => void) => {
            const pill = filterRow.createEl('button', {
                text: label,
                attr: { 
                    style: `padding: 2px 8px; border-radius: 4px; border: none; font-size: 0.65em; font-weight: 700; cursor: pointer; transition: all 0.1s; 
                    background: ${isActive ? 'var(--interactive-accent)' : 'transparent'}; 
                    color: ${isActive ? 'var(--text-on-accent)' : 'var(--text-muted)'};` 
                }
            });
            pill.addEventListener('click', onClick);
        };

        const updateFilters = () => {
            filterRow.empty();
            renderFilterPill('ACTIVE', activeOnly, () => { activeOnly = !activeOnly; updateFilters(); renderList(); });
            renderFilterPill('RECURRING', recurringOnly, () => { recurringOnly = !recurringOnly; updateFilters(); renderList(); });
        };
        updateFilters();

        // 3. Content List (Compact Table-like Cards)
        const listContainer = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 8px; width: 100%;' }
        });

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

        const renderList = () => {
            listContainer.empty();
            const entries = buildEntries().filter(e => (!recurringOnly || e.hasRecurring) && (!activeOnly || e.isActive));
            
            if (entries.length === 0) { 
                listContainer.createEl('p', { 
                    text: 'No matching entries.', 
                    attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 24px; font-size: 0.8em; opacity: 0.5;' } 
                }); 
                return; 
            }

            const today = moment().startOf('day');

            entries.forEach(entry => {
                const card = listContainer.createEl('div', {
                    attr: { style: 'display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: var(--background-secondary-alt); border-radius: 8px; border: 1px solid var(--background-modifier-border-faint);' }
                });

                const topRow = card.createEl('div', {
                    attr: { style: 'display: flex; align-items: center; justify-content: space-between;' }
                });

                const titleLink = topRow.createEl('a', {
                    text: entry.title,
                    attr: { style: 'font-size: 0.88em; font-weight: 700; color: var(--text-normal); text-decoration: none; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%;' }
                });
                titleLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.view.plugin.app.workspace.openLinkText(entry.title, entry.path, Platform.isMobile ? 'tab' : 'window');
                });

                if (entry.dueMoment?.isValid()) {
                    const isOverdue = entry.dueMoment.isBefore(today);
                    const isToday = entry.dueMoment.isSame(today, 'day');
                    const statusText = isOverdue ? 'OVERDUE' : isToday ? 'TODAY' : 'UPCOMING';
                    const statusColor = isOverdue ? 'var(--text-error)' : isToday ? 'var(--interactive-accent)' : 'var(--text-muted)';
                    
                    topRow.createSpan({
                        text: statusText,
                        attr: { style: `font-size: 0.55em; font-weight: 900; color: ${statusColor}; letter-spacing: 0.05em; background: ${isOverdue ? 'rgba(var(--error-rgb), 0.08)' : 'rgba(var(--background-modifier-border-rgb), 0.1)'}; padding: 1px 5px; border-radius: 3px;` }
                    });
                }

                // Metadata Row (Compact Inline)
                const metaRow = card.createEl('div', {
                    attr: { style: 'display: flex; gap: 12px; align-items: center;' }
                });

                const miniMeta = (label: string, val: string, isError = false) => {
                    const wrap = metaRow.createEl('div', { attr: { style: 'display: flex; align-items: baseline; gap: 4px;' } });
                    wrap.createSpan({ text: label + ':', attr: { style: 'font-size: 0.65em; font-weight: 600; color: var(--text-faint); text-transform: uppercase;' } });
                    wrap.createSpan({ text: val || '—', attr: { style: `font-size: 0.75em; font-weight: 600; color: ${isError ? 'var(--text-error)' : 'var(--text-muted)'};` } });
                };

                const isOverdue = entry.dueMoment?.isValid() && entry.dueMoment.isBefore(today);
                miniMeta('Due', entry.dueDate, !!isOverdue);
                miniMeta('Paid', entry.lastPayment);

                if (entry.hasRecurring) {
                    const actionRow = card.createEl('div', {
                        attr: { style: 'display: flex; align-items: center; gap: 8px; margin-top: 2px; padding-top: 6px; border-top: 1px solid var(--background-modifier-border-faint);' }
                    });

                    const dateInput = actionRow.createEl('input', {
                        type: 'date',
                        attr: { style: 'flex: 1; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 4px; font-size: 0.7em; padding: 2px 6px; color: var(--text-normal); height: 24px;' }
                    });
                    dateInput.value = moment().format('YYYY-MM-DD');

                    const payBtn = actionRow.createEl('button', {
                        text: 'Pay',
                        attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; font-size: 0.7em; font-weight: 700; padding: 0 10px; height: 24px; cursor: pointer;' }
                    });

                    payBtn.addEventListener('click', () => {
                        const fileObj = vault.getAbstractFileByPath(entry.path) as TFile;
                        if (!fileObj) { new Notice('Note file not found.'); return; }
                        new PaymentModal(this.view.plugin.app, fileObj, entry.dueDate, () => this.renderDuesMode(container), dateInput.value).open();
                    });
                }
            });
        };

        renderList();
    }
}
