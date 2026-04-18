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
                style: 'padding: var(--mina-spacing); display: flex; flex-direction: column; gap: 32px; overflow-y: auto; flex-grow: 1; min-height: 0; -webkit-overflow-scrolling: touch; background: var(--background-primary); max-width: 900px; margin: 0 auto;'
            }
        });

        // 1. GREETING & VISION
        const topRow = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
        
        topRow.createEl('h1', {
            text: `${greeting}, M.I.N.A.`,
            attr: { style: 'margin: 0; font-size: 2em; font-weight: 900; color: var(--text-normal); letter-spacing: -0.04em;' }
        });

        const vision = this.settings.northStarGoals?.[0];
        if (vision) {
            topRow.createEl('p', {
                text: `Current Mission: ${vision}`,
                attr: { style: 'margin: 0; font-size: 0.95em; color: var(--text-muted); font-weight: 600; font-style: italic; opacity: 0.8;' }
            });
        }

        // 2. GLOBAL CAPTURE
        const captureArea = wrap.createEl('div', {
            attr: { style: 'display: flex; flex-direction: column; gap: 12px;' }
        });
        
        const captureCard = captureArea.createEl('div', {
            attr: { style: 'background: var(--background-secondary-alt); border-radius: 20px; padding: 20px; border: 1px solid var(--background-modifier-border-faint); cursor: text; transition: all 0.2s; box-shadow: var(--mina-shadow); display: flex; align-items: center; gap: 12px;' }
        });
        
        const capIcon = captureCard.createDiv();
        setIcon(capIcon, 'lucide-plus-circle');
        capIcon.style.color = 'var(--interactive-accent)';
        
        captureCard.createEl('span', { text: "Capture a thought or task...", attr: { style: 'color: var(--text-faint); font-size: 1.1em; font-weight: 500;' } });
        
        captureCard.addEventListener('mouseenter', () => { captureCard.style.boxShadow = 'var(--mina-shadow-hover)'; captureCard.style.borderColor = 'var(--interactive-accent)'; });
        captureCard.addEventListener('mouseleave', () => { captureCard.style.boxShadow = 'var(--mina-shadow)'; captureCard.style.borderColor = 'var(--background-modifier-border-faint)'; });
        
        captureCard.addEventListener('click', () => {
            new EditEntryModal(this.app, this.plugin, '', '', null, false, async (text, ctxs, _, project) => {
                if (!text.trim()) return;
                const contexts = ctxs.split('#').map(c => c.trim()).filter(c => c.length > 0);
                const file = await this.vault.createThoughtFile(text, contexts, project || undefined);
                this.renderCommandCenter(container);
            }, 'Global Capture').open();
        });

        // 3. PILLARS GRID
        const pillarCard = (parent: HTMLElement, label: string, iconId: string, tabId: string, color: string = 'var(--text-muted)') => {
            const card = parent.createEl('div', { cls: 'mina-pillar-card' });
            const iconWrap = card.createDiv({ cls: 'mina-pillar-icon', attr: { style: `width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: ${color}; opacity: 0.9;` } });
            setIcon(iconWrap, iconId);
            card.createSpan({ text: label, attr: { style: 'font-size: 0.75em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);' } });
            card.addEventListener('click', () => { this.view.activeTab = tabId; this.view.renderView(); });
        };

        const renderPillarGroup = (title: string, items: {label: string, icon: string, tab: string, color?: string}[]) => {
            const group = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 14px;' } });
            group.createEl('h3', { text: title, attr: { style: 'margin: 0; font-size: 0.7em; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: var(--text-faint);' } });
            const grid = group.createEl('div', { cls: 'mina-pillar-grid' });
            items.forEach(i => pillarCard(grid, i.label, i.icon, i.tab, i.color));
        };

        renderPillarGroup('Action', [
            { label: 'Focus', icon: DAILY_ICON_ID, tab: 'daily', color: 'var(--interactive-accent)' },
            { label: 'Tasks', icon: TASK_ICON_ID, tab: 'review-tasks' },
            { label: 'Finance', icon: PF_ICON_ID, tab: 'dues' }
        ]);

        renderPillarGroup('Organization', [
            { label: 'Projects', icon: PROJECT_ICON_ID, tab: 'projects' },
            { label: 'Synthesis', icon: SYNTHESIS_ICON_ID, tab: 'synthesis' },
            { label: 'Journal', icon: JOURNAL_ICON_ID, tab: 'journal' }
        ]);

        renderPillarGroup('Intelligence', [
            { label: 'AI Chat', icon: AI_CHAT_ICON_ID, tab: 'mina-ai' },
            { label: 'Review', icon: REVIEW_ICON_ID, tab: 'review' },
            { label: 'Compass', icon: COMPASS_ICON_ID, tab: 'compass' }
        ]);

        renderPillarGroup('Utility', [
            { label: 'Voice', icon: VOICE_ICON_ID, tab: 'voice-note' },
            { label: 'Timeline', icon: TIMELINE_ICON_ID, tab: 'timeline' },
            { label: 'Settings', icon: SETTINGS_ICON_ID, tab: 'settings' }
        ]);

        // 4. SNAPSHOTS
        const snapshotSection = wrap.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 14px;' } });
        snapshotSection.createEl('h3', { text: 'Snapshots', attr: { style: 'margin: 0; font-size: 0.7em; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: var(--text-faint);' } });
        
        const snapshots = snapshotSection.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px;' } });
        if (Platform.isMobile) snapshots.style.gridTemplateColumns = '1fr';

        // Habits Snapshot
        const habitsCard = snapshots.createEl('div', { cls: 'mina-card', attr: { style: 'padding: 20px;' } });
        habitsCard.createEl('div', { text: 'HABIT LAB', attr: { style: 'font-size: 0.6em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint); margin-bottom: 14px;' } });
        const dotsContainer = habitsCard.createDiv({ attr: { style: 'display: flex; flex-wrap: wrap; gap: 10px;' } });
        
        const todayStr = moment().format('YYYY-MM-DD');
        const completedHabits = await this.vault.getHabitStatus(todayStr);
        this.settings.habits.forEach(h => {
            const isDone = completedHabits.includes(h.id);
            dotsContainer.createDiv({
                attr: { 
                    title: h.name,
                    style: `width: 14px; height: 14px; border-radius: 50%; border: 2px solid ${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border-faint)'}; background: ${isDone ? 'var(--interactive-accent)' : 'transparent'}; opacity: ${isDone ? '1' : '0.4'}; transition: all 0.3s;` 
                }
            });
        });

        // Cashflow Snapshot
        const income = this.settings.monthlyIncome || 0;
        if (income > 0) {
            const financeCard = snapshots.createEl('div', { cls: 'mina-card', attr: { style: 'padding: 20px;' } });
            financeCard.createEl('div', { text: 'BURN RATE', attr: { style: 'font-size: 0.6em; font-weight: 900; letter-spacing: 0.15em; color: var(--text-faint); margin-bottom: 14px;' } });
            
            const totalDues = await this.calculateTotalDues();
            const percent = Math.min(100, (totalDues / income) * 100);
            
            const barWrap = financeCard.createDiv({ attr: { style: 'width: 100%; height: 8px; background: var(--background-primary); border-radius: 4px; overflow: hidden; border: 1px solid var(--background-modifier-border-faint);' } });
            barWrap.createDiv({ attr: { style: `width: ${percent}%; height: 100%; background: ${percent > 90 ? 'var(--text-error)' : 'var(--interactive-accent)'}; transition: width 0.5s ease;` } });
            
            const stats = financeCard.createDiv({ attr: { style: 'display: flex; justify-content: space-between; margin-top: 10px;' } });
            stats.createSpan({ text: `${percent.toFixed(0)}%`, attr: { style: 'font-size: 1.1em; font-weight: 900; color: var(--text-normal);' } });
            stats.createSpan({ text: `Rem: ${(income - totalDues).toLocaleString()}`, attr: { style: 'font-size: 0.75em; font-weight: 700; color: var(--text-muted); opacity: 0.8;' } });
        }
    }

    private async calculateTotalDues(): Promise<number> {
        const pfFolder = (this.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
        let total = 0;
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (file.path.startsWith(pfFolder + '/')) {
                const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
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
