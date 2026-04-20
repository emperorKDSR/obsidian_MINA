import { App, Platform, moment, Notice } from 'obsidian';
import * as chrono from 'chrono-node';
import { FileSuggestModal } from './modals/FileSuggestModal';
import { ContextSuggestModal } from './modals/ContextSuggestModal';
import type { RecurrenceRule } from './types';

export function computeNextDue(currentDue: string, rule: RecurrenceRule): string {
    const m = moment(currentDue, 'YYYY-MM-DD', true);
    if (!m.isValid()) return moment().format('YYYY-MM-DD');
    switch (rule) {
        case 'daily':    return m.add(1, 'day').format('YYYY-MM-DD');
        case 'weekly':   return m.add(1, 'week').format('YYYY-MM-DD');
        case 'biweekly': return m.add(2, 'weeks').format('YYYY-MM-DD');
        case 'monthly':  return m.add(1, 'month').format('YYYY-MM-DD');
    }
}

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

/**
 * Attach clipboard-paste and drag-drop handlers to a textarea.
 * Saves image/file data to the vault and inserts an Obsidian ![[link]] at cursor.
 *
 * @param app             The Obsidian App instance
 * @param textarea        The target textarea element
 * @param getFolder       Callback returning the attachments folder path (e.g. '000 Bin/MINA V2 Attachments')
 */
export function attachMediaPasteHandler(
    app: App,
    textarea: HTMLTextAreaElement,
    getFolder: () => string
): void {
    const saveFile = async (file: File): Promise<string | null> => {
        try {
            const folder = (getFolder() || '000 Bin/MINA V2 Attachments').trim();
            if (!app.vault.getAbstractFileByPath(folder)) {
                await app.vault.createFolder(folder);
            }
            const mimeToExt: Record<string, string> = {
                'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                'image/webp': 'webp', 'image/svg+xml': 'svg',
                'application/pdf': 'pdf',
            };
            const ext = mimeToExt[file.type] || (file.name.includes('.') ? file.name.split('.').pop()! : 'bin');
            const ts = moment().format('YYYYMMDD_HHmmss');
            const rand = Math.random().toString(36).substring(2, 6);
            const filename = `attachment_${ts}_${rand}.${ext}`;
            const buffer = await file.arrayBuffer();
            await app.vault.createBinary(`${folder}/${filename}`, buffer);
            return filename;
        } catch (e) {
            console.error('[MINA] Attachment save failed:', e);
            return null;
        }
    };

    const insertAtCursor = (link: string) => {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        textarea.value = textarea.value.substring(0, start) + link + textarea.value.substring(end);
        textarea.setSelectionRange(start + link.length, start + link.length);
        textarea.dispatchEvent(new Event('input'));
    };

    textarea.addEventListener('paste', async (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        // Pre-scan for file items synchronously so we can preventDefault before any await
        const fileItems: DataTransferItem[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') fileItems.push(items[i]);
        }
        if (fileItems.length === 0) return; // no files — let text paste proceed normally

        e.preventDefault();
        for (const item of fileItems) {
            const file = item.getAsFile();
            if (!file) continue;
            const filename = await saveFile(file);
            if (filename) {
                insertAtCursor(`![[${filename}]]`);
                new Notice(`📎 Saved: ${filename}`);
            } else {
                new Notice('⚠ Failed to save attachment — check console');
            }
        }
    });

    textarea.addEventListener('dragover', (e: DragEvent) => {
        if (e.dataTransfer?.items && Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    textarea.addEventListener('drop', async (e: DragEvent) => {
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        e.preventDefault();
        for (let i = 0; i < files.length; i++) {
            const filename = await saveFile(files[i]);
            if (filename) {
                insertAtCursor(`![[${filename}]]`);
                new Notice(`📎 Saved: ${filename}`);
            }
        }
    });
}
