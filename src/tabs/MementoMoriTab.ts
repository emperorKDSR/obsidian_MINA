import { moment } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';

const QUOTES = [
    '"You could leave life right now. Let that determine what you do and say and think." — Marcus Aurelius',
    '"It is not death that a man should fear, but he should fear never beginning to live." — Marcus Aurelius',
    '"Memento mori. Remember that you have to die." — Epictetus',
    '"The impediment to action advances action. What stands in the way becomes the way." — Marcus Aurelius',
];

export class MementoMoriTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'mina-memento-wrap' });

        // ── Header ────────────────────────────────────────────────────────
        const headerRow = wrap.createEl('div', { cls: 'mina-memento-header' });
        this.renderHomeIcon(headerRow);
        const titleStack = headerRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 2px;' } });
        titleStack.createEl('h2', { text: 'Memento Mori', cls: 'mina-memento-title' });

        if (!this.settings.birthDate) {
            titleStack.createEl('span', { text: 'Your life in weeks', cls: 'mina-memento-subtitle' });
            this.renderEmptyState(wrap, 'Set your birth date in Settings → Memento Mori to activate');
            return;
        }

        const birth = moment(this.settings.birthDate, 'YYYY-MM-DD', true);
        if (!birth.isValid()) {
            this.renderEmptyState(wrap, 'Invalid birth date. Please update in Settings.');
            return;
        }

        const now = moment();
        const ageYears = now.diff(birth, 'years');
        const livedWeeks = now.diff(birth, 'weeks');
        const totalWeeks = (this.settings.lifeExpectancy || 90) * 52;
        const currentWeek = livedWeeks;
        const weeksRemaining = Math.max(0, totalWeeks - livedWeeks);
        const yearsRemaining = Math.max(0, (this.settings.lifeExpectancy || 90) - ageYears);

        titleStack.createEl('span', { text: `${ageYears} years · Week ${livedWeeks} of ${totalWeeks}`, cls: 'mina-memento-subtitle' });

        // ── Stats row ─────────────────────────────────────────────────────
        const stats = wrap.createEl('div', { cls: 'mina-memento-stats' });
        this._stat(stats, ageYears.toString(), 'Age');
        this._stat(stats, livedWeeks.toLocaleString(), 'Weeks Lived');
        this._stat(stats, weeksRemaining.toLocaleString(), 'Weeks Left');
        this._stat(stats, yearsRemaining.toString(), 'Years Left');

        // ── Quote ─────────────────────────────────────────────────────────
        const dayOfYear = now.dayOfYear();
        const quote = QUOTES[dayOfYear % QUOTES.length];
        wrap.createEl('div', { text: quote, cls: 'mina-memento-quote' });

        // ── Grid ──────────────────────────────────────────────────────────
        const gridSection = wrap.createEl('div', { cls: 'mina-memento-grid-section' });
        const lifeExpectancy = this.settings.lifeExpectancy || 90;

        for (let year = 0; year < lifeExpectancy; year++) {
            const yearRow = gridSection.createEl('div', { cls: 'mina-memento-year-row' });
            yearRow.createEl('span', { text: String(year + 1), cls: 'mina-memento-year-label' });
            const weeksRow = yearRow.createEl('div', { cls: 'mina-memento-weeks' });

            for (let w = 0; w < 52; w++) {
                const weekNum = year * 52 + w;
                let cls = 'mina-memento-week';
                if (weekNum < currentWeek) cls += ' is-lived';
                else if (weekNum === currentWeek) cls += ' is-current';
                else cls += ' is-future';
                weeksRow.createEl('div', { cls });
            }
        }
    }

    private _stat(parent: HTMLElement, value: string, label: string) {
        const chip = parent.createEl('div', { cls: 'mina-memento-stat' });
        chip.createEl('div', { text: value, cls: 'mina-memento-stat-value' });
        chip.createEl('div', { text: label, cls: 'mina-memento-stat-label' });
    }
}
