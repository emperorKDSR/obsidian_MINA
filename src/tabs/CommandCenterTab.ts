import { moment, Platform, Notice, TFile, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { DAILY_ICON_ID, TASK_ICON_ID, PF_ICON_ID, PROJECT_ICON_ID, SYNTHESIS_ICON_ID, AI_CHAT_ICON_ID, REVIEW_ICON_ID, COMPASS_ICON_ID, SETTINGS_ICON_ID, VOICE_ICON_ID, TIMELINE_ICON_ID, JOURNAL_ICON_ID } from '../constants';

export class CommandCenterTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderCommandCenter(container);
    }

    async renderCommandCenter(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'padding: 24px 20px 200px 20px; display: flex; flex-direction: column; gap: 28px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 800px; margin: 0 auto;'
            }
        });

        // 1. GREETING & VISION
        const topRow = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
        
        topRow.createEl('h1', {
            text: `${greeting}, M.I.N.A.`,
            attr: { style: 'margin: 0; font-size: 1.8em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.04em;' }
        });

        const vision = this.view.plugin.settings.northStarGoals?.[0];
        if (vision) {
            topRow.createEl('p', {
                text: `Focus: ${vision}`,
                attr: { style: 'margin: 0; font-size: 0.9em; color: var(--text-muted); font-weight: 600; font-style: italic;' }
            });
        }

        // 2. GLOBAL CAPTURE
        const captureCard = wrap.createEl('div', {
            attr: { style: 'background: var(--background-secondary-alt); border-radius: 20px; padding: 16px; border: 1px solid var(--background-modifier-border-faint); cursor: text; transition: all 0.2s; box-shadow: 0 4px 20px rgba(0,0,0,0.05);' }
        });
        captureCard.createEl('span', { text: "What's on your mind? (Shift+Enter to add)", attr: { style: 'color: var(--text-faint); font-size: 1.1em; font-weight: 500;' } });
        captureCard.addEventListener('click', () => {
            new EditEntryModal(this.app, this.view.plugin, '', '', null, false, async (text, ctxs, _, project) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                const file = await this.view.plugin.createThoughtFile(text, contexts);
                if (project) await this.app.fileManager.processFrontMatter(file, (fm) => { fm['project'] = project; });
                this.renderCommandCenter(container);
            }, 'Global Capture').open();
        });

        // 3. PILLARS GRID
        const pillarCard = (parent: HTMLElement, label: string, iconId: string, tabId: string, color: string = 'var(--text-normal)') => {
            const card = parent.createEl('div', {
                attr: { style: 'background: var(--background-secondary); border-radius: 16px; padding: 16px; border: 1px solid var(--background-modifier-border-faint); cursor: pointer; display: flex; flex-direction: column; gap: 12px; transition: transform 0.1s, background 0.1s;' }
            });
            const iconWrap = card.createDiv({ attr: { style: `width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: ${color}; opacity: 0.8;` } });
            setIcon(iconWrap, iconId);
            card.createSpan({ text: label, attr: { style: 'font-size: 0.85em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);' } });
            
            card.addEventListener('mouseenter', () => { card.style.background = 'var(--background-secondary-alt)'; card.style.transform = 'translateY(-2px)'; });
            card.addEventListener('mouseleave', () => { card.style.background = 'var(--background-secondary)'; card.style.transform = 'none'; });
            card.addEventListener('click', () => { this.view.activeTab = tabId; this.view.renderView(); });
        };

        // Pillar Groups
        const renderPillarHeader = (text: string) => {
            wrap.createEl('h3', { text, attr: { style: 'margin: 0 -4px; font-size: 0.7em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: var(--text-faint);' } });
        };

        renderPillarHeader('Action');
        const actionGrid = wrap.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;' } });
        pillarCard(actionGrid, 'Focus', DAILY_ICON_ID, 'daily', 'var(--interactive-accent)');
        pillarCard(actionGrid, 'Tasks', TASK_ICON_ID, 'review-tasks');
        pillarCard(actionGrid, 'Finance', PF_ICON_ID, 'dues');

        renderPillarHeader('Organization');
        const orgGrid = wrap.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;' } });
        pillarCard(orgGrid, 'Projects', PROJECT_ICON_ID, 'projects');
        pillarCard(orgGrid, 'Synthesis', SYNTHESIS_ICON_ID, 'synthesis');
        pillarCard(orgGrid, 'Journal', JOURNAL_ICON_ID, 'journal');

        renderPillarHeader('Intelligence');
        const insightGrid = wrap.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;' } });
        pillarCard(insightGrid, 'AI Chat', AI_CHAT_ICON_ID, 'mina-ai');
        pillarCard(insightGrid, 'Review', REVIEW_ICON_ID, 'review');
        pillarCard(insightGrid, 'Compass', COMPASS_ICON_ID, 'compass');

        renderPillarHeader('Utility');
        const utilGrid = wrap.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;' } });
        pillarCard(utilGrid, 'Voice', VOICE_ICON_ID, 'voice-note');
        pillarCard(utilGrid, 'Timeline', TIMELINE_ICON_ID, 'timeline');
        pillarCard(utilGrid, 'Settings', SETTINGS_ICON_ID, 'settings');

        // 4. SNAPSHOTS
        renderPillarHeader('Snapshots');
        const snapshots = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px;' } });
        
        // Habits Snapshot
        const habitsCard = snapshots.createEl('div', {
            attr: { style: 'background: var(--background-secondary-alt); border-radius: 16px; padding: 16px; border: 1px solid var(--background-modifier-border-faint);' }
        });
        habitsCard.createEl('div', { text: 'TODAY\'S HABITS', attr: { style: 'font-size: 0.6em; font-weight: 900; letter-spacing: 0.1em; color: var(--text-faint); margin-bottom: 10px;' } });
        const dotsContainer = habitsCard.createDiv({ attr: { style: 'display: flex; gap: 8px;' } });
        
        const todayStr = moment().format('YYYY-MM-DD');
        const completedHabits = await this.view.plugin.getHabitStatus(todayStr);
        this.view.plugin.settings.habits.forEach(h => {
            const isDone = completedHabits.includes(h.id);
            dotsContainer.createDiv({
                attr: { 
                    title: h.name,
                    style: `width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; background: ${isDone ? 'var(--interactive-accent)' : 'transparent'}; opacity: ${isDone ? '1' : '0.4'};` 
                }
            });
        });

        // Cashflow Snapshot
        const income = this.view.plugin.settings.monthlyIncome || 0;
        if (income > 0) {
            const financeCard = snapshots.createEl('div', {
                attr: { style: 'background: var(--background-secondary-alt); border-radius: 16px; padding: 16px; border: 1px solid var(--background-modifier-border-faint);' }
            });
            financeCard.createEl('div', { text: 'MONTHLY BURN RATE', attr: { style: 'font-size: 0.6em; font-weight: 900; letter-spacing: 0.1em; color: var(--text-faint); margin-bottom: 10px;' } });
            
            // Calculate Total Dues (Reusing DuesTab logic at high level)
            const totalDues = await this.calculateTotalDues();
            const percent = Math.min(100, (totalDues / income) * 100);
            
            const barWrap = financeCard.createDiv({ attr: { style: 'width: 100%; height: 6px; background: var(--background-primary); border-radius: 3px; overflow: hidden;' } });
            barWrap.createDiv({ attr: { style: `width: ${percent}%; height: 100%; background: ${percent > 90 ? 'var(--text-error)' : 'var(--interactive-accent)'};` } });
            
            const stats = financeCard.createDiv({ attr: { style: 'display: flex; justify-content: space-between; margin-top: 8px;' } });
            stats.createSpan({ text: `${percent.toFixed(0)}% Utilized`, attr: { style: 'font-size: 0.7em; font-weight: 700; color: var(--text-muted);' } });
            stats.createSpan({ text: `Remaining: ${(income - totalDues).toLocaleString()}`, attr: { style: 'font-size: 0.7em; font-weight: 700; color: var(--text-muted);' } });
        }
    }

    private async calculateTotalDues(): Promise<number> {
        const { metadataCache, vault } = this.view.plugin.app;
        const pfFolder = (this.view.plugin.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
        let total = 0;
        for (const file of vault.getMarkdownFiles()) {
            if (file.path.startsWith(pfFolder + '/')) {
                const fm = metadataCache.getFileCache(file)?.frontmatter;
                const active = fm?.['active_status'];
                if (active === true || active === 'true' || active === 'True') {
                    const amount = parseFloat(file.basename.match(/[\d.]+/)?.[0] || '0');
                    if (!isNaN(amount)) total += amount;
                }
            }
        }
        return total;
    }
}
