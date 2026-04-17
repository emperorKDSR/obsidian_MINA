import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";
import { ChatSessionPickerModal } from "../modals/ChatSessionPickerModal";
import { NotePickerModal } from "../modals/NotePickerModal";

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
    
            this.renderSearchInput(wrap, () => {
                this.view.timelineScrollBody.empty();
                this.view.timelineCarousel.empty();
                this.view.timelineDateElements.clear();
                this.view.timelineDaySections.clear();
                const today = moment();
                this.view.timelineStartDate = today.clone().subtract(10, 'days');
                this.view.timelineEndDate = today.clone().add(10, 'days');
                for (let m = this.view.timelineStartDate.clone(); m.isSameOrBefore(this.view.timelineEndDate); m.add(1, 'days')) {
                    this.addTimelineDay(m.format('YYYY-MM-DD'), 'append');
                }
                setTimeout(() => {
                    const todayStr = today.format('YYYY-MM-DD');
                    this.view.timelineDaySections.get(todayStr)?.scrollIntoView({ block: 'start' });
                    this.updateCarouselSelection(todayStr);
                }, 100);
            });
    
            // Header with Date Carousel
            const carouselContainer = wrap.createEl('div', {
                attr: {
                    style: 'flex-shrink: 0; position: relative; border-bottom: 1px solid var(--background-modifier-border); padding: 10px 0; background: var(--background-primary-alt); display: flex; align-items: center;'
                }
            });
    
            this.view.timelineCarousel = carouselContainer.createEl('div', {
                attr: {
                    class: 'mina-timeline-carousel',
                    style: 'flex-grow: 1; display: flex; gap: 5px; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding: 0 calc(50% - 35px); scrollbar-width: none;'
                }
            });
            (this.view.timelineCarousel.style as any).msOverflowStyle = 'none';
            (this.view.timelineCarousel.style as any).scrollbarWidth = 'none';
    
            this.view.timelineScrollBody = wrap.createEl('div', {
                attr: {
                    class: 'mina-timeline-body',
                    style: 'flex-grow: 1; overflow-y: auto; padding: 15px; -webkit-overflow-scrolling: touch;'
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
                    const centerY = rect.top + 50;
                    const elements = document.elementsFromPoint(rect.left + rect.width / 2, centerY);
                    const section = elements.find(el => (el as HTMLElement).hasAttribute('data-date')) as HTMLElement;
                    if (section) {
                        const dateStr = section.getAttribute('data-date')!;
                        if (this.view.timelineSelectedDate !== dateStr) {
                            this.view.timelineSelectedDate = dateStr;
                            this.updateCarouselSelection(dateStr, true);
                        }
                    }
    
                    // Check for infinite scroll
                    if (this.view.timelineScrollBody.scrollTop < 200) {
                        await this.loadMoreTimelineDays('prepend');
                    } else if (this.view.timelineScrollBody.scrollHeight - this.view.timelineScrollBody.scrollTop - this.view.timelineScrollBody.clientHeight < 200) {
                        await this.loadMoreTimelineDays('append');
                    }
    
                    isScrollingBody = false;
                });
            });
    
            // Initial scroll to today
            const todayStr = today.format('YYYY-MM-DD');
            setTimeout(() => {
                this.view.timelineDaySections.get(todayStr)?.scrollIntoView({ block: 'start' });
                this.updateCarouselSelection(todayStr);
            }, 100);
        }
    
        async loadMoreTimelineDays(direction: 'append' | 'prepend') {
            if (direction === 'prepend') {
                const currentTopDay = this.view.timelineStartDate.clone();
                for (let i = 1; i <= 10; i++) {
                    const dateStr = currentTopDay.subtract(1, 'days').format('YYYY-MM-DD');
                    await this.addTimelineDay(dateStr, 'prepend');
                    this.view.timelineStartDate = currentTopDay.clone();
                }
            } else {
                const currentBottomDay = this.view.timelineEndDate.clone();
                for (let i = 1; i <= 10; i++) {
                    const dateStr = currentBottomDay.add(1, 'days').format('YYYY-MM-DD');
                    await this.addTimelineDay(dateStr, 'append');
                    this.view.timelineEndDate = currentBottomDay.clone();
                }
            }
        }
    
        async addTimelineDay(dateStr: string, position: 'append' | 'prepend') {
            const dateMoment = moment(dateStr);
    
            // Date Carousel Item
            const dateItem = document.createElement('div');
            dateItem.style.cssText = 'flex-shrink: 0; min-width: 70px; text-align: center; cursor: pointer; scroll-snap-align: center; padding: 10px 0; font-size: 0.85em; transition: all 0.2s;';
            dateItem.textContent = dateMoment.format('MMM D');
    
            if (position === 'prepend') {
                this.view.timelineCarousel.prepend(dateItem);
            } else {
                this.view.timelineCarousel.append(dateItem);
            }
            this.view.timelineDateElements.set(dateStr, dateItem);
    
            dateItem.addEventListener('click', () => {
                this.view.timelineSelectedDate = dateStr;
                this.view.timelineDaySections.get(dateStr)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                this.updateCarouselSelection(dateStr);
            });
    
            // Day Section in Scroll Body
            const section = document.createElement('div');
            section.setAttribute('data-date', dateStr);
            section.style.cssText = 'margin-bottom: 40px; min-height: 100px;';
    
            const dividerContainer = section.createEl('div', {
                attr: { style: 'display: flex; align-items: center; justify-content: center; margin-bottom: 20px; position: relative; height: 20px;' }
            });
    
            dividerContainer.createEl('div', {
                attr: { style: 'position: absolute; width: 100%; height: 1px; background-color: var(--background-modifier-border); top: 50%; left: 0;' }
            });
    
            dividerContainer.createEl('span', {
                text: dateMoment.format('dddd, MMMM D, YYYY'),
                attr: { style: 'position: relative; background-color: var(--background-primary); padding: 0 10px; font-size: 0.75em; color: var(--text-muted); font-weight: 400;' }
            });
    
            await this.renderTimelineDay(dateStr, section);
    
            if (position === 'prepend') {
                const oldScrollHeight = this.view.timelineScrollBody.scrollHeight;
                const oldScrollTop = this.view.timelineScrollBody.scrollTop;
                this.view.timelineScrollBody.prepend(section);
                // Adjust scroll to prevent jumping when prepending
                this.view.timelineScrollBody.scrollTop = oldScrollTop + (this.view.timelineScrollBody.scrollHeight - oldScrollHeight);
            } else {
                this.view.timelineScrollBody.append(section);
            }
            this.view.timelineDaySections.set(dateStr, section);
        }
    
        updateCarouselSelection(selectedDate: string, smoothScroll: boolean = false) {
            this.view.timelineDateElements.forEach((el, date) => {
                if (date === selectedDate) {
                    el.style.color = 'var(--interactive-accent)';
                    el.style.opacity = '1';
                    el.style.fontWeight = '700';
                    if (smoothScroll) {
                        el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    } else {
                        el.scrollIntoView({ inline: 'center', block: 'nearest' });
                    }
                } else {
                    el.style.color = 'var(--text-muted)';
                    el.style.opacity = '0.6';
                    el.style.fontWeight = '400';
                }
            });
        }
    
        async renderTimelineDay(dateStr: string, container: HTMLElement) {
            const tasks = Array.from(this.view.plugin.taskIndex.values()).filter(t => t.due === dateStr);
            const thoughts = Array.from(this.view.plugin.thoughtIndex.values()).filter(t => t.allDates.includes(dateStr) && !t.context.includes('journal'));
    
            if (tasks.length === 0 && thoughts.length === 0) {
                container.createEl('p', { text: 'No tasks or thoughts for this day.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; font-style: italic; text-align: center;' } });
                return;
            }
    
            for (const task of tasks) {
                await this.renderTaskRow(task, container, true);
            }
    
            for (const thought of thoughts) {
                await this.renderThoughtRow(thought, container, thought.filePath, 0, true, true);
            }
        }
    
    
}
