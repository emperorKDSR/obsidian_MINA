import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import type { ThoughtEntry } from '../types';

export class FocusTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderFocusMode(container);
    }

    renderFocusMode(container: HTMLElement) {
        container.empty();
        const header = container.createEl('div', { attr: { style: 'padding: 16px 14px 10px 14px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; border-bottom: 1px solid var(--background-modifier-border-faint);' } });
        this.renderHomeIcon(header);
        header.createEl('h2', { text: 'Focus', attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em;' } });

        this.renderSearchInput(container, () => this.updateFocusList());
        const innerContainer = container.createEl('div', { attr: { style: 'flex-grow: 1; min-height: 0; overflow-y: auto; padding: 15px 15px 200px 15px; -webkit-overflow-scrolling: touch;' } });
        this.view.focusRowContainer = innerContainer.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 12px; width: 100%;' } });
        
        this.updateFocusList();
    }

    async updateFocusList() {
        if (!this.view.focusRowContainer) return;
        this.view.focusRowContainer.empty();

        let pinned = Array.from(this.index.thoughtIndex.values()).filter(e => e.pinned);
        
        if (this.view.searchQuery) {
            pinned = pinned.filter(e => this.view.matchesSearch(this.view.searchQuery, [e.body, e.title]));
        }

        // Sorting by last thread update as default
        pinned.sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate);

        if (pinned.length === 0) {
            this.view.focusRowContainer.createEl('p', { text: 'No pinned thoughts.', attr: { style: 'color: var(--text-muted); text-align: center; margin-top: 20px;' } });
            return;
        }

        for (const entry of pinned) {
            await this.renderThoughtRow(entry, this.view.focusRowContainer, entry.filePath, 0, true);
        }
    }
}
