import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";
import { ChatSessionPickerModal } from "../modals/ChatSessionPickerModal";
import { NotePickerModal } from "../modals/NotePickerModal";

export class MementoMoriTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderMementoMori(container);
    }
        renderMementoMori(container: HTMLElement) {
            const { birthDate, lifeExpectancy } = this.view.plugin.settings;
            const birth = moment(birthDate);
            const today = moment();
            const death = birth.clone().add(lifeExpectancy, 'years');
            const startYear = birth.year();
            const endYear = death.year();
            const numRows = endYear - startYear + 1;
    
            const totalWeeks = lifeExpectancy * 52;
            const weeksLived = today.diff(birth, 'weeks');
            const percentage = ((weeksLived / totalWeeks) * 100).toFixed(1);
    
            const wrap = container.createEl('div', {
                attr: { style: 'display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--background-primary);' }
            });
    
            // Header
            const header = wrap.createEl('div', {
                attr: { style: 'padding: 10px 15px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-primary-alt); flex-shrink: 0;' }
            });
    
            const stats = header.createEl('div', {
                attr: { style: 'display: flex; justify-content: space-between; font-size: 0.85em; color: var(--text-muted);' }
            });
            stats.createDiv({ text: `Age: ${today.diff(birth, 'years', true).toFixed(1)}` });
            stats.createDiv({ text: `Weeks Lived: ${weeksLived.toLocaleString()}` });
            stats.createDiv({ text: `${percentage}% Consumed` });
    
            // Grid
            const gridContainer = wrap.createEl('div', {
                cls: 'mina-memento-grid',
                attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; padding: 5px; min-height: 0; gap: 1px; overflow: hidden;' }
            });
    
            for (let y = 0; y < numRows; y++) {
                const currentYear = startYear + y;
                const yearRow = gridContainer.createEl('div', { cls: 'mina-memento-row' });
    
                for (let w = 0; w < 52; w++) {
                    const weekStart = moment().year(currentYear).dayOfYear(1).add(w, 'weeks');
    
                    let statusClass = 'memento-future';
                    if (weekStart.isBefore(today, 'week')) statusClass = 'memento-past';
                    if (weekStart.isSame(today, 'week')) statusClass = 'memento-current';
    
                    // Hide if outside life span
                    if (weekStart.isBefore(birth, 'week') || weekStart.isAfter(death, 'week')) {
                        statusClass = 'memento-none';
                    }
    
                    yearRow.createEl('div', {
                        cls: `mina-memento-box ${statusClass}`,
                        attr: { title: `${currentYear}, Week ${w + 1}` }
                    });
                }
            }
        }
    
    
}
