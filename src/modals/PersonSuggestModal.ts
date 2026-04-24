import { App, TFile, SuggestModal } from 'obsidian';

/**
 * PersonSuggestModal — opened by the `/` trigger in capture inputs.
 * Lists all vault notes whose frontmatter `type` equals `"people"`.
 */
export class PersonSuggestModal extends SuggestModal<TFile> {
    private onChoose: (file: TFile) => void;

    constructor(app: App, onChoose: (file: TFile) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder('Search people…');
    }

    getSuggestions(query: string): TFile[] {
        const q = query.toLowerCase().trim();
        return this.app.vault.getMarkdownFiles()
            .filter(f => {
                const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
                return fm?.type === 'people';
            })
            .filter(f => !q || f.basename.toLowerCase().includes(q))
            .sort((a, b) => a.basename.localeCompare(b.basename));
    }

    renderSuggestion(file: TFile, el: HTMLElement) {
        el.style.cssText = 'display:flex; align-items:center; gap:8px;';
        el.createSpan({ text: '👤', attr: { style: 'font-size:1em; flex-shrink:0;' } });
        const info = el.createEl('div', { attr: { style: 'display:flex; flex-direction:column;' } });
        info.createEl('span', { text: file.basename });
        if (file.parent && file.parent.path !== '/') {
            info.createEl('span', { text: file.parent.path, attr: { style: 'font-size:0.8em; color:var(--text-muted);' } });
        }
    }

    onChooseSuggestion(file: TFile) {
        this.onChoose(file);
    }
}
