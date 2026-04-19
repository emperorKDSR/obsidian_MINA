import { moment, Platform, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";

export class TimelineTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderTimelineMode(container);
    }

    async renderTimelineMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: { style: 'height: 100%; display: flex; flex-direction: column; background: var(--background-primary);' }
        });

        // 1. Header with Modern Date Carousel
        const carouselContainer = wrap.createEl('div', {
            attr: { style: 'flex-shrink: 0; border-bottom: 1px solid var(--background-modifier-border-faint); padding: 12px 14px; background: var(--background-primary); display: flex; align-items: center; gap: 12px;' }
        });

        this.renderHomeIcon(carouselContainer);

        const carousel = carouselContainer.createEl('div', {
            attr: { style: 'flex-grow: 1; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;' }
        });

        const today = moment();
        for (let i = -10; i <= 10; i++) {
            const date = today.clone().add(i, 'days');
            const dateStr = date.format('YYYY-MM-DD');
            const isActive = dateStr === this.view.timelineSelectedDate;
            
            const item = carousel.createEl('div', {
                attr: { style: `min-width: 60px; padding: 10px 4px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; background: ${isActive ? 'var(--interactive-accent)' : 'var(--background-secondary-alt)'}; color: ${isActive ? 'var(--text-on-accent)' : 'var(--text-normal)'};` }
            });
            item.createSpan({ text: date.format('ddd'), attr: { style: 'font-size: 0.6em; font-weight: 800; text-transform: uppercase; opacity: 0.8;' } });
            item.createSpan({ text: date.format('D'), attr: { style: 'font-size: 1.1em; font-weight: 800;' } });
            
            item.addEventListener('click', () => {
                this.view.timelineSelectedDate = dateStr;
                this.renderTimelineMode(container);
            });
        }

        // 2. Feed Body
        const scrollBody = wrap.createEl('div', {
            attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; -webkit-overflow-scrolling: touch;' }
        });

        const selectedDate = this.view.timelineSelectedDate;
        const tasks = Array.from(this.index.taskIndex.values()).filter(t => t.day === selectedDate || t.due === selectedDate);
        const thoughts = Array.from(this.index.thoughtIndex.values()).filter(t => t.day === selectedDate || t.allDates.includes(selectedDate));

        const allEntries = [
            ...tasks.map(t => ({ type: 'task', entry: t, time: t.created.split(' ')[1] })),
            ...thoughts.map(t => ({ type: 'thought', entry: t, time: t.created.split(' ')[1] }))
        ].sort((a, b) => (b.time || '').localeCompare(a.time || ''));

        if (allEntries.length === 0) {
            scrollBody.createEl('p', { text: 'No activity for this day.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 40px; opacity: 0.5;' } });
        } else {
            for (const item of allEntries) {
                if (item.type === 'task') await this.renderTaskRow(item.entry as any, scrollBody);
                else await this.renderThoughtRow(item.entry as any, scrollBody, (item.entry as any).filePath, 0, true);
            }
        }
    }
}
