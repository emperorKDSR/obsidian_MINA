import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";

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

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'padding: 20px 20px 10px 20px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; flex-shrink: 0;' }
        });

        header.createEl('span', {
            text: 'Life Remaining',
            attr: { style: 'font-size: 0.75em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; color: var(--text-normal); opacity: 0.9;' }
        });

        header.createEl('h1', {
            text: `${percentage}%`,
            attr: { style: 'margin: 0; font-size: 2.8em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.04em; line-height: 1;' }
        });

        const statsRow = header.createEl('div', {
            attr: { style: 'display: flex; gap: 16px; margin-top: 4px; font-size: 0.8em; font-weight: 500; color: var(--text-muted);' }
        });

        statsRow.createDiv({ text: `${today.diff(birth, 'years', true).toFixed(1)} y/o` });
        statsRow.createDiv({ text: `${weeksLived.toLocaleString()} weeks` });

        // 2. Inline Settings
        const settingsToggle = header.createEl('button', {
            text: 'Configure',
            attr: { style: 'margin-top: 10px; background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 4px; font-size: 0.7em; padding: 2px 8px; color: var(--text-muted); cursor: pointer;' }
        });

        const settingsContainer = header.createEl('div', {
            attr: { style: 'display: none; flex-direction: column; gap: 10px; margin-top: 15px; padding: 15px; background: var(--background-secondary); border-radius: 10px; width: 100%; max-width: 300px; border: 1px solid var(--background-modifier-border-faint);' }
        });

        settingsToggle.addEventListener('click', () => {
            const isHidden = settingsContainer.style.display === 'none';
            settingsContainer.style.display = isHidden ? 'flex' : 'none';
            settingsToggle.setText(isHidden ? 'Hide Settings' : 'Configure');
        });

        const dobRow = settingsContainer.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        dobRow.createSpan({ text: 'Birth Date', attr: { style: 'font-size: 0.8em; color: var(--text-muted);' } });
        const dobInput = dobRow.createEl('input', { type: 'date', value: birthDate, attr: { style: 'font-size: 0.8em; padding: 2px 5px;' } });
        
        const expRow = settingsContainer.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        expRow.createSpan({ text: 'Expectancy', attr: { style: 'font-size: 0.8em; color: var(--text-muted);' } });
        const expInput = expRow.createEl('input', { type: 'number', value: lifeExpectancy.toString(), attr: { style: 'font-size: 0.8em; padding: 2px 5px; width: 60px;' } });

        const refreshBtn = settingsContainer.createEl('button', {
            text: 'Refresh View',
            attr: { style: 'margin-top: 5px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 6px; font-size: 0.8em; padding: 6px 12px; font-weight: 700; cursor: pointer;' }
        });

        refreshBtn.addEventListener('click', async () => {
            this.view.plugin.settings.birthDate = dobInput.value;
            this.view.plugin.settings.lifeExpectancy = parseInt(expInput.value) || 90;
            await this.view.plugin.saveSettings();
            this.view.renderView(); // Refresh entire screen
            new Notice('Memento Mori refreshed');
        });

        // 3. Grid
        const gridWrapper = wrap.createEl('div', {
            attr: { style: 'flex-grow: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; padding: 5px 10px 20px 10px; overflow: hidden;' }
        });

        const gridContainer = gridWrapper.createEl('div', {
            cls: 'mina-memento-grid',
            attr: { style: 'display: flex; flex-direction: column; gap: 1.5px; height: 100%; width: 100%; max-width: 800px;' }
        });

        for (let y = 0; y < numRows; y++) {
            const currentYear = startYear + y;
            const yearRow = gridContainer.createEl('div', { 
                cls: 'mina-memento-row',
                attr: { style: 'display: flex; flex-direction: row; gap: 1.5px; flex: 1; min-height: 0;' }
            });

            for (let w = 0; w < 52; w++) {
                const weekStart = moment().year(currentYear).dayOfYear(1).add(w, 'weeks');
                let statusClass = 'memento-future'; 
                if (weekStart.isBefore(today, 'week')) statusClass = 'memento-past';
                if (weekStart.isSame(today, 'week')) statusClass = 'memento-current';

                if (weekStart.isBefore(birth, 'week') || weekStart.isAfter(death, 'week')) statusClass = 'memento-none';

                const box = yearRow.createEl('div', {
                    cls: `mina-memento-box ${statusClass}`,
                    attr: { title: `${currentYear}, Week ${w + 1}` }
                });
                
                if (statusClass === 'memento-past') box.style.opacity = '0.1'; // Very dimmed
                else if (statusClass === 'memento-future') box.style.opacity = '1'; // Light/High contrast
            }
        }
    }
}
