import { Platform, moment } from 'obsidian';
import * as chrono from 'chrono-node';

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
