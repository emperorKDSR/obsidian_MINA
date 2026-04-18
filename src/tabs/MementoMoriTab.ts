import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { MementoMoriSettingsModal } from "../modals/MementoMoriSettingsModal";

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

        const totalWeeks = lifeExpectancy * 52;
        const weeksLived = today.diff(birth, 'weeks');
        const percentageLived = Math.min(100, Math.max(0, (weeksLived / totalWeeks) * 100));
        const percentageLeft = (100 - percentageLived).toFixed(1);

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
            text: `${percentageLeft}%`,
            attr: { style: 'margin: 0; font-size: 2.8em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.04em; line-height: 1;' }
        });

        const statsRow = header.createEl('div', {
            attr: { style: 'display: flex; gap: 16px; margin-top: 4px; font-size: 0.8em; font-weight: 500; color: var(--text-muted);' }
        });

        statsRow.createDiv({ text: `${today.diff(birth, 'years', true).toFixed(1)} y/o` });
        statsRow.createDiv({ text: `${(totalWeeks - weeksLived).toLocaleString()} weeks left` });

        // 2. Configure Button (Opens Modal)
        const settingsToggle = header.createEl('button', {
            text: 'Configure',
            attr: { style: 'margin-top: 10px; background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 4px; font-size: 0.7em; padding: 2px 8px; color: var(--text-muted); cursor: pointer;' }
        });

        settingsToggle.addEventListener('click', () => {
            new MementoMoriSettingsModal(this.view.app, this.view.plugin, () => this.view.renderView()).open();
        });

        // 3. Mobile Spacer (Reduced)
        if (Platform.isMobile) {
            wrap.createEl('div', { attr: { style: 'height: 10px; flex-shrink: 0;' } });
        }

        // 4. Precision Hourglass Visualization
        const visualArea = wrap.createEl('div', {
            attr: { style: `flex-grow: 1; display: flex; align-items: center; justify-content: center; padding: 20px; overflow: hidden; ${Platform.isMobile ? 'margin-top: -150px;' : ''}` }
        });

        const hourglassSize = Math.min(visualArea.clientWidth * 0.9, visualArea.clientHeight * 0.85, 260);
        
        const futureColor = Platform.isDesktop ? 'var(--text-normal)' : '#f0f0f0';
        const pastColor = 'var(--text-muted)';
        const pastOpacity = '0.12';

        const svg = visualArea.createSvg('svg', {
            attr: {
                viewBox: '0 0 100 160',
                preserveAspectRatio: 'xMidYMid meet',
                style: `width: ${hourglassSize}px; height: auto; display: block;`
            }
        });

        // Unique mask IDs for precise filling
        const topMaskId = `mask-top-${Math.random().toString(36).substr(2, 9)}`;
        const bottomMaskId = `mask-bottom-${Math.random().toString(36).substr(2, 9)}`;

        const defs = svg.createSvg('defs');
        const topMask = defs.createSvg('mask', { attr: { id: topMaskId } });
        topMask.createSvg('rect', { attr: { x: '0', y: '0', width: '100', height: '160', fill: 'black' } });
        const topFillHeight = 63 * (1 - (percentageLived / 100));
        topMask.createSvg('rect', { attr: { x: '0', y: (78 - topFillHeight).toString(), width: '100', height: topFillHeight.toString(), fill: 'white' } });

        const bottomMask = defs.createSvg('mask', { attr: { id: bottomMaskId } });
        bottomMask.createSvg('rect', { attr: { x: '0', y: '0', width: '100', height: '160', fill: 'black' } });
        const bottomFillHeight = 63 * (percentageLived / 100);
        bottomMask.createSvg('rect', { attr: { x: '0', y: (145 - bottomFillHeight).toString(), width: '100', height: bottomFillHeight.toString(), fill: 'white' } });

        // Symmetrical Curved Frame
        const framePath = 'M20 10 L80 10 M20 10 L20 15 C20 45, 45 60, 45 80 C45 100, 20 115, 20 145 L20 150 M80 10 L80 15 C80 45, 55 60, 55 80 C55 100, 80 115, 80 145 L80 150 M20 150 L80 150';
        svg.createSvg('path', {
            attr: {
                d: framePath,
                fill: 'none',
                stroke: 'var(--background-modifier-border)',
                'stroke-width': '2',
                'stroke-linecap': 'round'
            }
        });

        // Top Bulb Glass & Fill
        const topBulbPath = 'M22 15 L78 15 C78 45, 52 58, 52 78 L48 78 C48 58, 22 45, 22 15 Z';
        svg.createSvg('path', {
            attr: {
                d: topBulbPath,
                fill: futureColor,
                mask: `url(#${topMaskId})`,
                style: 'transition: all 1s ease-in-out;'
            }
        });

        // Bottom Bulb Glass & Fill
        const bottomBulbPath = 'M48 82 L52 82 C52 102, 78 115, 78 145 C78 145, 50 148, 22 145 C22 115, 48 102, 48 82 Z';
        svg.createSvg('path', {
            attr: {
                d: bottomBulbPath,
                fill: pastColor,
                opacity: pastOpacity,
                mask: `url(#${bottomMaskId})`,
                style: 'transition: all 1s ease-in-out;'
            }
        });

        // Flow Line
        if (percentageLived < 100) {
            svg.createSvg('line', {
                attr: {
                    x1: '50', y1: '78', x2: '50', y2: '82',
                    stroke: futureColor,
                    'stroke-width': '1.5',
                    'stroke-dasharray': '2,3',
                    opacity: '0.4'
                }
            });
        }
    }
}
