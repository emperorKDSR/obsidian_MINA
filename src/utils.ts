import { App, Platform, moment } from 'obsidian';
import * as chrono from 'chrono-node';
import { FileSuggestModal } from './modals/FileSuggestModal';
import { ContextSuggestModal } from './modals/ContextSuggestModal';

/** Convert any locale-specific digit characters to ASCII 0-9.
 *  Covers Arabic-Indic (٠-٩), Persian (۰-۹), Devanagari (०-९),
 *  Bengali (০-৯), and Thai (๐-๙) so stored timestamps are always plain numbers
 *  regardless of the device's locale setting. */
export function toAsciiDigits(s: string): string {
    return s
        .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, c => String(c.charCodeAt(0) - 0x06F0))
        .replace(/[\u0966-\u096F]/g, c => String(c.charCodeAt(0) - 0x0966))
        .replace(/[\u09E6-\u09EF]/g, c => String(c.charCodeAt(0) - 0x09E6))
        .replace(/[\u0E50-\u0E59]/g, c => String(c.charCodeAt(0) - 0x0E50));
}

/** True when running on an iPad (or large Android tablet).
 *  Obsidian's Platform.isMobile is true for both phones AND tablets.
 *  We distinguish tablets by their short-edge being ≥ 768 px. */
export function isTablet(): boolean {
    return Platform.isMobile && Math.min(screen.width, screen.height) >= 768;
}

/** Parse a context string like "#work #personal" into ["work", "personal"] */
export function parseContextString(ctxStr: string): string[] {
    return ctxStr.split('#').map(c => c.trim()).filter(c => c.length > 0);
}

export function parseNaturalDate(text: string): string | null {
    const results = chrono.parse(text);
    if (results && results.length > 0) {
        const date = results[0].start.date();
        return moment(date).format('YYYY-MM-DD');
    }
    return null;
}

/**
 * Attach inline smart triggers to a capture textarea:
 *   @word<space>  → NLP date parse → sets due date + inserts [[date]] wiki link
 *   [[            → opens FileSuggestModal → inserts [[Note]] link
 *   #             → opens ContextSuggestModal → adds context chip
 *   + at line start → converts to `- [ ] ` checklist item
 */
export function attachInlineTriggers(
    app: App,
    textArea: HTMLTextAreaElement,
    setDueDate: (d: string) => void,
    onContext?: (tag: string) => void,
    getContexts?: () => string[]
): void {
    textArea.addEventListener('input', () => {
        const val = textArea.value;
        const pos = textArea.selectionStart ?? val.length;
        const before = val.substring(0, pos);

        // @word<space> → NLP date
        const atMatch = before.match(/@(\S+)\s$/);
        if (atMatch) {
            const parsed = parseNaturalDate(atMatch[1]);
            if (parsed) {
                const removeFrom = pos - atMatch[0].length;
                const wikiDate = `[[${parsed}]] `;
                textArea.value = val.substring(0, removeFrom) + wikiDate + val.substring(pos);
                textArea.setSelectionRange(removeFrom + wikiDate.length, removeFrom + wikiDate.length);
                setDueDate(parsed);
                return;
            }
        }

        // # at start or after whitespace → open ContextSuggestModal
        if (onContext && /(^|\s)#$/.test(before)) {
            const insertAt = pos - 1;
            textArea.value = val.substring(0, insertAt) + val.substring(pos);
            textArea.setSelectionRange(insertAt, insertAt);
            new ContextSuggestModal(app, getContexts ? getContexts() : [], (tag) => {
                const cur = textArea.value;
                const curPos = textArea.selectionStart ?? insertAt;
                textArea.value = cur.substring(0, curPos) + cur.substring(curPos);
                onContext(tag);
                textArea.focus();
            }).open();
            return;
        }

        // [[ → wiki-link insertion via file picker
        if (before.endsWith('[[')) {
            textArea.value = val.substring(0, pos - 2) + val.substring(pos);
            const insertAt = pos - 2;
            textArea.setSelectionRange(insertAt, insertAt);
            new FileSuggestModal(app, (file) => {
                const link = `[[${file.basename}]]`;
                const cur = textArea.value;
                const curPos = textArea.selectionStart ?? insertAt;
                textArea.value = cur.substring(0, curPos) + link + cur.substring(curPos);
                textArea.setSelectionRange(curPos + link.length, curPos + link.length);
                textArea.focus();
            }).open();
            return;
        }

        // + at line start → checklist item
        if (before.endsWith('\n+') || before === '+') {
            const insertAt = pos - 1;
            textArea.value = val.substring(0, insertAt) + '- [ ] ' + val.substring(pos);
            textArea.setSelectionRange(insertAt + 6, insertAt + 6);
        }
    });
}
