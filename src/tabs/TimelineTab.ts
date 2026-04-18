import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";

export class TimelineTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderTimelineMode(container);
    }

    async renderTimelineMode(container: HTMLElement) {
        const wrap = container.createEl('div', {
            attr: {
                style: 'display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--background-primary);'
            }
        });

        // 1. Sleek Header with Modern Date Carousel
        const carouselContainer = wrap.createEl('div', {
            attr: {
                style: 'flex-shrink: 0; position: relative; border-bottom: 1px solid var(--background-modifier-border-faint); padding: 12px 0; background: var(--background-primary); display: flex; align-items: center;'
            }
        });

        this.view.timelineCarousel = carouselContainer.createEl('div', {
            attr: {
                class: 'mina-timeline-carousel',
                style: 'flex-grow: 1; display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding: 0 calc(50% - 40px); scrollbar-width: none;'
            }
        });
        (this.view.timelineCarousel.style as any).msOverflowStyle = 'none';

        this.view.timelineScrollBody = wrap.createEl('div', {
            attr: {
                class: 'mina-timeline-body',
                style: 'flex-grow: 1; overflow-y: auto; padding: 20px 20px 200px 30px; -webkit-overflow-scrolling: touch; scroll-behavior: smooth;'
            }
        });

        this.view.timelineDateElements.clear();
        this.view.timelineDaySections.clear();

        const today = moment();
        this.view.timelineStartDate = today.clone().subtract(10, 'days');
        this.view.timelineEndDate = today.clone().add(10, 'days');

        for (let m = this.view.timelineStartDate.clone(); m.isSameOrBefore(this.view.timelineEndDate); m.add(1, 'days')) {
            await this.addTimelineDay(m.format('YYYY-MM-DD'), 'append');
        }

        // Sync Vertical Scroll with Carousel
        let isScrollingBody = false;
        this.view.timelineScrollBody.addEventListener('scroll', () => {
            if (isScrollingBody) return;
            isScrollingBody = true;
            requestAnimationFrame(async () => {
                const rect = this.view.timelineScrollBody.getBoundingClientRect();
                const centerY = rect.top + 80;
                const elements = document.elementsFromPoint(rect.left + rect.width / 2, centerY);
                const section = elements.find(el => (el as HTMLElement).hasAttribute('data-date')) as HTMLElement;
                
                if (section) {
                    const dateStr = section.getAttribute('data-date')!;
                    if (this.view.timelineSelectedDate !== dateStr) {
                        this.view.timelineSelectedDate = dateStr;
                        this.updateCarouselSelection(dateStr, true);
                    }
                }

                if (this.view.timelineScrollBody.scrollTop < 200) {
                    await this.loadMoreTimelineDays('prepend');
                } else if (this.view.timelineScrollBody.scrollHeight - this.view.timelineScrollBody.scrollTop - this.view.timelineScrollBody.clientHeight < 200) {
                    await this.loadMoreTimelineDays('append');
                }
                isScrollingBody = false;
            });
        });

        const todayStr = today.format('YYYY-MM-DD');
        setTimeout(() => {
            this.view.timelineDaySections.get(todayStr)?.scrollIntoView({ block: 'start' });
            this.updateCarouselSelection(todayStr);
        }, 100);
    }

    async loadMoreTimelineDays(direction: 'append' | 'prepend') {
        if (direction === 'prepend') {
            const currentTopDay = this.view.timelineStartDate.clone();
            for (let i = 1; i <= 5; i++) {
                const dateStr = currentTopDay.subtract(1, 'days').format('YYYY-MM-DD');
                await this.addTimelineDay(dateStr, 'prepend');
                this.view.timelineStartDate = currentTopDay.clone();
            }
        } else {
            const currentBottomDay = this.view.timelineEndDate.clone();
            for (let i = 1; i <= 5; i++) {
                const dateStr = currentBottomDay.add(1, 'days').format('YYYY-MM-DD');
                await this.addTimelineDay(dateStr, 'append');
                this.view.timelineEndDate = currentBottomDay.clone();
            }
        }
    }

    async addTimelineDay(dateStr: string, position: 'append' | 'prepend') {
        const dateMoment = moment(dateStr);
        const isToday = dateStr === moment().format('YYYY-MM-DD');

        // Modern Date Item
        const dateItem = document.createElement('div');
        dateItem.style.cssText = 'flex-shrink: 0; min-width: 80px; text-align: center; cursor: pointer; scroll-snap-align: center; padding: 8px 0; transition: all 0.2s; display: flex; flex-direction: column; gap: 2px;';
        
        const dayLabel = dateItem.createSpan({ 
            text: dateMoment.format('ddd'), 
            attr: { style: 'font-size: 0.65em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;' } 
        });
        const dateLabel = dateItem.createSpan({ 
            text: dateMoment.format('D'), 
            attr: { style: 'font-size: 1.1em; font-weight: 800;' } 
        });

        if (position === 'prepend') this.view.timelineCarousel.prepend(dateItem);
        else this.view.timelineCarousel.append(dateItem);
        
        this.view.timelineDateElements.set(dateStr, dateItem);

        dateItem.addEventListener('click', () => {
            this.view.timelineSelectedDate = dateStr;
            this.view.timelineDaySections.get(dateStr)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            this.updateCarouselSelection(dateStr);
        });

        // 2. Day Section with vertical thread
        const section = document.createElement('div');
        section.setAttribute('data-date', dateStr);
        section.style.cssText = 'margin-bottom: 48px; position: relative; padding-left: 24px;';

        // Thread Line (Continuous)
        section.createEl('div', {
            attr: { style: 'position: absolute; left: 0; top: 12px; bottom: -48px; width: 2px; background: var(--background-modifier-border-faint); opacity: 0.6;' }
        });

        const dayHeader = section.createEl('div', {
            attr: { style: 'display: flex; align-items: center; gap: 14px; margin-bottom: 24px;' }
        });

        // Date Dot (Main Anchor)
        dayHeader.createEl('div', {
            attr: { style: `width: 12px; height: 12px; border-radius: 50%; background: ${isToday ? 'var(--interactive-accent)' : 'var(--text-muted)'}; margin-left: -30px; z-index: 2; box-shadow: 0 0 0 5px var(--background-primary); border: 2px solid ${isToday ? 'var(--interactive-accent)' : 'var(--background-primary)'};` }
        });

        dayHeader.createEl('span', {
            text: isToday ? 'Today' : dateMoment.format('dddd, MMMM D'),
            attr: { style: `font-size: 0.9em; font-weight: 800; color: ${isToday ? 'var(--text-normal)' : 'var(--text-muted)'}; text-transform: uppercase; letter-spacing: 0.08em;` }
        });

        const contentWrap = section.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 20px;' }
        });

        await this.renderTimelineDay(dateStr, contentWrap);

        if (position === 'prepend') {
            const oldHeight = this.view.timelineScrollBody.scrollHeight;
            const oldTop = this.view.timelineScrollBody.scrollTop;
            this.view.timelineScrollBody.prepend(section);
            this.view.timelineScrollBody.scrollTop = oldTop + (this.view.timelineScrollBody.scrollHeight - oldHeight);
        } else {
            this.view.timelineScrollBody.append(section);
        }
        this.view.timelineDaySections.set(dateStr, section);
    }

    updateCarouselSelection(selectedDate: string, smoothScroll: boolean = false) {
        this.view.timelineDateElements.forEach((el, date) => {
            const isSelected = date === selectedDate;
            el.style.opacity = isSelected ? '1' : '0.4';
            el.style.transform = isSelected ? 'scale(1.15)' : 'scale(1)';
            el.style.color = isSelected ? 'var(--interactive-accent)' : 'var(--text-normal)';
            
            if (isSelected) {
                if (smoothScroll) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                else el.scrollIntoView({ inline: 'center', block: 'nearest' });
            }
        });
    }

    async renderTimelineDay(dateStr: string, container: HTMLElement) {
        const tasks = Array.from(this.view.plugin.taskIndex.values()).filter(t => t.due === dateStr);
        const thoughts = Array.from(this.view.plugin.thoughtIndex.values()).filter(t => t.allDates.includes(dateStr) && !t.context.includes('journal'));

        if (tasks.length === 0 && thoughts.length === 0) {
            const row = container.createEl('div', { attr: { style: 'position: relative; display: flex; align-items: center;' } });
            // Small stitch dot for empty days
            row.createEl('div', { attr: { style: 'width: 6px; height: 6px; border-radius: 50%; background: var(--background-modifier-border); margin-left: -27px; z-index: 1; box-shadow: 0 0 0 3px var(--background-primary);' } });
            row.createEl('p', { 
                text: 'No activity.', 
                attr: { style: 'color: var(--text-muted); font-size: 0.8em; font-style: italic; opacity: 0.4; margin: 0;' } 
            });
            return;
        }

        // Render each entry with a "stitch" dot
        const renderWithStitch = async (entry: any, type: 'task' | 'thought') => {
            const rowWrapper = container.createEl('div', {
                attr: { style: 'position: relative; display: flex; flex-direction: column;' }
            });
            
            // The stitch dot
            rowWrapper.createEl('div', {
                attr: { style: 'position: absolute; width: 8px; height: 8px; border-radius: 50%; background: var(--background-modifier-border); margin-left: -28px; top: 18px; z-index: 1; box-shadow: 0 0 0 4px var(--background-primary);' }
            });

            if (type === 'task') await this.renderTaskRow(entry, rowWrapper, true);
            else await this.renderThoughtRow(entry, rowWrapper, entry.filePath, 0, true, true);
        };

        for (const task of tasks) await renderWithStitch(task, 'task');
        for (const thought of thoughts) await renderWithStitch(thought, 'thought');
    }
}
