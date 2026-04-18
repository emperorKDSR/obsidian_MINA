import { App, TFile, moment } from 'obsidian';
import type { MinaSettings, ThoughtEntry, TaskEntry, ReplyEntry } from '../types';

export class IndexService {
    app: App;
    settings: MinaSettings;
    thoughtIndex: Map<string, ThoughtEntry> = new Map();
    taskIndex: Map<string, TaskEntry> = new Map();

    constructor(app: App, settings: MinaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: MinaSettings) {
        this.settings = settings;
    }

    async buildIndices() {
        await Promise.all([this.buildThoughtIndex(), this.buildTaskIndex()]);
    }

    async buildThoughtIndex(): Promise<void> {
        const folder = this.settings.thoughtsFolder.trim() || '000 Bin/MINA V2';
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isThoughtFile(f.path));
        this.thoughtIndex.clear();
        for (const f of files) await this.indexThoughtFile(f);
    }

    async buildTaskIndex(): Promise<void> {
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isTaskFile(f.path));
        this.taskIndex.clear();
        for (const f of files) await this.indexTaskFile(f);
    }

    isThoughtFile(path: string): boolean {
        const folder = (this.settings.thoughtsFolder.trim() || '000 Bin/MINA V2').replace(/\\/g, '/');
        const trashFolder = folder + '/trash';
        return path.startsWith(folder + '/') && !path.startsWith(trashFolder + '/') && path.endsWith('.md');
    }

    isTaskFile(path: string): boolean {
        const folder = (this.settings.tasksFolder.trim() || '000 Bin/MINA V2 Tasks').replace(/\\/g, '/');
        const trashFolder = folder + '/trash';
        return path.startsWith(folder + '/') && !path.startsWith(trashFolder + '/') && path.endsWith('.md');
    }

    async indexThoughtFile(file: TFile): Promise<void> {
        try {
            const content = await this.app.vault.read(file);
            const entry = this.parseThoughtFile(file.path, content);
            if (entry) this.thoughtIndex.set(file.path, entry);
        } catch {}
    }

    async indexTaskFile(file: TFile): Promise<void> {
        try {
            const content = await this.app.vault.read(file);
            const entry = this.parseTaskFile(file.path, content);
            if (entry) this.taskIndex.set(file.path, entry);
            else this.taskIndex.delete(file.path);
        } catch {}
    }

    getProjects(): string[] {
        const projects = new Set<string>();
        this.thoughtIndex.forEach(t => { if (t.project) projects.add(t.project); });
        this.taskIndex.forEach(t => { if (t.project) projects.add(t.project); });
        return Array.from(projects).sort();
    }

    async scanForContexts(): Promise<string[]> {
        const { vault } = this.app;
        const folderPath = this.settings.captureFolder.trim();
        const filesToScan = [this.settings.captureFilePath.trim(), this.settings.tasksFilePath.trim()];
        const extractedContexts = new Set<string>();

        for (const fileName of filesToScan) {
            const fullPath = folderPath && folderPath !== '/' ? `${folderPath}/${fileName}` : fileName;
            const file = vault.getAbstractFileByPath(fullPath);
            if (file instanceof TFile) {
                try {
                    const content = await vault.read(file);
                    const matches = content.match(/#[^#\s|]+/g);
                    if (matches) matches.forEach(m => { const c = m.substring(1).trim(); if (c) extractedContexts.add(c); });
                } catch (error) { console.log(`Error scanning file ${fullPath}`, error); }
            }
        }
        return Array.from(extractedContexts);
    }

    private parseThoughtFile(filePath: string, content: string): ThoughtEntry | null {
        content = content.replace(/\r\n/g, '\n');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (!fmMatch) return null;
        const fm = fmMatch[1];
        const body = content.slice(fmMatch[0].length);

        const get = (key: string) => { const m = fm.match(new RegExp(`^${key}: (.+)$`, 'm')); return m ? m[1].trim() : ''; };
        const getList = (key: string): string[] => {
            const m = fm.match(new RegExp(`^${key}:\\n((?:\\s*- .+\\n?)+)`, 'm'));
            if (!m) return [];
            return m[1].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^\s*-\s*/, '').trim());
        };

        const area = get('area');
        if (area !== 'MINA') return null;

        const title   = get('title').replace(/^"|"$/g, '');
        const created = get('created');
        const modified = get('modified');
        const day     = get('day').replace(/^\"|\"$|^\[\[|\]\]$/g, '').replace(/['"]/g, '');
        const context = getList('context');
        const pinned  = get('pinned') === 'true';
        const project = get('project')?.replace(/^"|"$/g, '');
        const synthesized = get('synthesized') === 'true';

        const children = this.parseReplies(body);
        const bodyText = children.length > 0 ? body.slice(0, body.indexOf('## [[')).trim() : body.trim();

        const modMs = Date.parse(modified ? modified.replace(' ', 'T') : '') || 0;
        const lastChild = children.length > 0 ? Date.parse(children[children.length-1].date + 'T' + children[children.length-1].time) || 0 : 0;

        const allDates: string[] = [];
        const dateLinkRegex = /\[\[(\d{4}-\d{2}-\d{2})\]\]/g;
        let dMatch;
        while ((dMatch = dateLinkRegex.exec(content)) !== null) { if (!allDates.includes(dMatch[1])) allDates.push(dMatch[1]); }
        if (day && !allDates.includes(day)) allDates.push(day);

        return { filePath, title, created, modified, day, allDates, context, body: bodyText, children, lastThreadUpdate: Math.max(modMs, lastChild), pinned, project, synthesized };
    }

    private parseTaskFile(filePath: string, content: string): TaskEntry | null {
        content = content.replace(/\r\n/g, '\n');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (!fmMatch) return null;
        const fm = fmMatch[1];
        const body = content.slice(fmMatch[0].length).trim();

        const get = (key: string) => { const m = fm.match(new RegExp(`^${key}: (.+)$`, 'm')); return m ? m[1].trim() : ''; };
        const getList = (key: string): string[] => {
            const m = fm.match(new RegExp(`^${key}:\\n((?:\\s*- .+\\n?)+)`, 'm'));
            if (!m) return [];
            return m[1].split('\n').filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^\s*-\s*/, '').trim());
        };

        const area = get('area');
        if (area !== 'MINA_TASKS') return null;

        const title    = get('title').replace(/^"|"$/g, '');
        const created  = get('created');
        const modified = get('modified');
        const day      = get('day').replace(/['"[\]]/g, '');
        const status   = get('status') === 'done' ? 'done' : 'open';
        const dueRaw   = get('due').replace(/['"[\]]/g, '');
        const context  = getList('context');
        const project  = get('project')?.replace(/^"|"$/g, '');
        
        const children = this.parseReplies(body);
        const mainBody = children.length > 0 ? body.slice(0, body.indexOf('## [[')).trim() : body.trim();

        const modMs = Date.parse(modified ? modified.replace(' ', 'T') : '') || 0;
        const lastChild = children.length > 0 ? Date.parse(children[children.length-1].date + 'T' + children[children.length-1].time) || 0 : 0;

        return { filePath, title, created, modified, day, status, due: dueRaw, context, body: mainBody, children, lastUpdate: Math.max(modMs, lastChild), project };
    }

    private parseReplies(body: string): ReplyEntry[] {
        const replyRegex = /^## \[\[([\d-]+)\]\] ([\d:]+) \^(reply-\d+)/gm;
        const replies: ReplyEntry[] = [];
        let match;
        const sections: { start: number; anchor: string; date: string; time: string }[] = [];
        
        while ((match = replyRegex.exec(body)) !== null) {
            sections.push({ start: match.index, anchor: match[3], date: match[1], time: match[2] });
        }
        
        for (let i = 0; i < sections.length; i++) {
            const s = sections[i];
            const contentStart = body.indexOf('\n', s.start) + 1;
            const contentEnd = i + 1 < sections.length ? sections[i+1].start : body.length;
            replies.push({ anchor: s.anchor, date: s.date, time: s.time, text: body.slice(contentStart, contentEnd).trim() });
        }
        return replies;
    }
}
