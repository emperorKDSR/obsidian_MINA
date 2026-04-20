import { App, TFile, moment } from 'obsidian';
import { MinaSettings, ThoughtEntry, TaskEntry, DueEntry } from '../types';

export interface ChecklistItem {
    text: string;
    done: boolean;
    line: string;
}

export interface ThoughtChecklistItem {
    filePath: string;
    text: string;
    line: string;
    lineIndex: number;
}

export class IndexService {
    app: App;
    settings: MinaSettings;
    
    // Memory Indices
    thoughtIndex: Map<string, ThoughtEntry> = new Map();
    taskIndex: Map<string, TaskEntry> = new Map();
    // ob-perf-03: Full DueEntry index — DuesTab reads from here instead of scanning vault on every render
    dueIndex: Map<string, DueEntry> = new Map();
    checklistIndex: ChecklistItem[] = [];
    thoughtChecklistIndex: ThoughtChecklistItem[] = [];
    // - [x] items from MINA V2 files modified today
    thoughtDoneChecklistIndex: ThoughtChecklistItem[] = [];
    habitStatusIndex: string[] = [];
    
    // Performance Cache (Synchronous Access)
    radarQueue: TaskEntry[] = [];
    totalDues: number = 0;

    constructor(app: App, settings: MinaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: MinaSettings) {
        this.settings = settings;
    }

    async buildIndices() {
        await Promise.all([
            this.buildThoughtIndex(),
            this.buildTaskIndex(),
            this.buildDueIndex(),
            this.buildChecklistIndex(),
            this.refreshHabitIndex()
        ]);
        this.rebuildCalculatedState();
    }

    rebuildCalculatedState() {
        // 1. Radar Queue: Urgent Open + Completed Today
        const today = moment().startOf('day');
        this.radarQueue = Array.from(this.taskIndex.values()).filter(t => {
            const isUrgent = t.status === 'open' && t.due && moment(t.due).isSameOrBefore(today, 'day');
            const completedToday = t.status === 'done' && moment(t.modified).isSame(today, 'day');
            return isUrgent || completedToday;
        }).sort((a, b) => {
            if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
            return moment(a.due).valueOf() - moment(b.due).valueOf();
        }).slice(0, 10);

        // 2. Total Dues
        let sum = 0;
        this.dueIndex.forEach(entry => sum += entry.amount || 0);
        this.totalDues = sum;
    }

    async buildChecklistIndex(): Promise<void> {
        const folder = this.settings.captureFolder.trim() || '000 Bin/MINA V2';
        const filename = this.settings.captureFilePath.trim() || 'Daily Capture.md';
        const path = folder && folder !== '/' ? `${folder}/${filename}` : filename;
        const file = this.app.vault.getAbstractFileByPath(path);
        
        this.checklistIndex = [];
        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            content.split('\n').forEach(line => {
                if (line.includes('- [ ]') || line.includes('- [x]')) {
                    this.checklistIndex.push({
                        text: line.replace(/- \[[ x]\] /, '').trim(),
                        done: line.includes('- [x]'),
                        line: line
                    });
                }
            });
        }
    }

    async refreshHabitIndex(): Promise<void> {
        const todayStr = moment().format('YYYY-MM-DD');
        const habitsFolder = (this.settings.habitsFolder || '000 Bin/MINA V2 Habits').replace(/\\/g, '/');
        const path = `${habitsFolder}/${todayStr}.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        this.habitStatusIndex = [];
        if (file instanceof TFile) {
            // Primary: use metadataCache (fast, no file read)
            const cache = this.app.metadataCache.getFileCache(file);
            const completed = cache?.frontmatter?.['completed'];
            if (Array.isArray(completed)) {
                this.habitStatusIndex = completed.map(String);
            } else {
                // Fallback: parse the completed: [...] line directly (covers cache lag)
                const content = await this.app.vault.read(file);
                const match = content.match(/^completed:\s*\[([^\]]*)\]/m);
                if (match) {
                    this.habitStatusIndex = match[1]
                        .split(',')
                        .map(s => s.trim().replace(/['"]/g, ''))
                        .filter(Boolean);
                }
            }
        }
    }

    async buildDueIndex(): Promise<void> {
        const pfFolder = (this.settings.pfFolder || '000 Bin/MINA V2 PF').replace(/\\/g, '/');
        this.dueIndex.clear();
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(pfFolder + '/'));
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;
            const active = fm?.['active_status'];
            const isActive = active === true || active === 'true' || active === 'True';
            const dueDate = (fm?.['next_duedate'] ?? '').toString().trim();
            const lastPayment = (fm?.['last_payment'] ?? '').toString().trim();
            const dueMoment = dueDate ? moment(dueDate, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'], true) : null;
            // Read amount from frontmatter first; fall back to filename parse for legacy files
            const fmAmount = parseFloat((fm?.['amount'] ?? '').toString().replace(/[^\d.]/g, ''));
            const legacyAmount = parseFloat(file.basename.match(/[\d.]+/)?.[0] || '0');
            const amount = !isNaN(fmAmount) && fmAmount > 0 ? fmAmount : (isNaN(legacyAmount) ? 0 : legacyAmount);
            this.dueIndex.set(file.path, {
                title: file.basename,
                path: file.path,
                dueDate,
                lastPayment,
                dueMoment,
                hasRecurring: !!dueDate,
                isActive,
                amount: isNaN(amount) ? 0 : amount
            });
        }
    }

    async buildThoughtIndex(): Promise<void> {
        this.thoughtIndex.clear();
        this.thoughtChecklistIndex = [];
        this.thoughtDoneChecklistIndex = [];
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isThoughtFile(f.path));
        for (const f of files) await this.indexThoughtFile(f);
    }

    async buildTaskIndex(): Promise<void> {
        this.taskIndex.clear();
        const files = this.app.vault.getMarkdownFiles().filter(f => this.isTaskFile(f.path));
        // arch-02: Pass skipRebuild=true — rebuildCalculatedState() called once in buildIndices()
        for (const f of files) await this.indexTaskFile(f, true);
    }

    async indexThoughtFile(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.frontmatter) return;
        const fm = cache.frontmatter;
        // arch-01: Read actual file content for body — was incorrectly set to file.basename
        const content = await this.app.vault.read(file);
        const body = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
        this.thoughtIndex.set(file.path, {
            filePath: file.path,
            title: file.basename,
            body: body,
            day: String(fm.day || '').replace(/^\[\[|\]\]$/g, ''),
            created: fm.created || '',
            modified: fm.modified || '',
            context: fm.context || fm.contexts || [],
            synthesized: fm.synthesized || false,
            project: fm.project || null,
            allDates: fm.allDates || [],
            children: [],
            lastThreadUpdate: file.stat.mtime
        });

        // Collect open checklist items from this thought file (clear stale entries first)
        this.thoughtChecklistIndex = this.thoughtChecklistIndex.filter(item => item.filePath !== file.path);
        this.thoughtDoneChecklistIndex = this.thoughtDoneChecklistIndex.filter(item => item.filePath !== file.path);
        const lines = body.split('\n');
        const fileModifiedToday = moment(file.stat.mtime).isSame(moment(), 'day');
        lines.forEach((line, lineIndex) => {
            if (line.includes('- [ ]')) {
                this.thoughtChecklistIndex.push({
                    filePath: file.path,
                    text: line.replace(/^[\s>]*- \[ \] /, '').trim(),
                    line,
                    lineIndex
                });
            } else if (fileModifiedToday && line.includes('- [x]')) {
                this.thoughtDoneChecklistIndex.push({
                    filePath: file.path,
                    text: line.replace(/^[\s>]*- \[x\] /i, '').trim(),
                    line,
                    lineIndex
                });
            }
        });
    }

    // arch-02: skipRebuild param prevents O(n²) calls during bulk index build
    async indexTaskFile(file: TFile, skipRebuild = false) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.frontmatter) return;
        const fm = cache.frontmatter;
        const content = await this.app.vault.read(file);
        const body = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();

        this.taskIndex.set(file.path, {
            filePath: file.path,
            title: fm.title || file.basename,
            body: body,
            status: fm.status || 'open',
            // Normalize due: strip [[...]] wikilink wrapper, handle Date objects from YAML
            due: fm.due
                ? (typeof fm.due === 'object'
                    ? moment(fm.due).format('YYYY-MM-DD')
                    : String(fm.due).trim().replace(/^\[\[|\]\]$/g, ''))
                : '',
            created: fm.created || '',
            modified: fm.modified || '',
            lastUpdate: file.stat.mtime,
            day: String(fm.day || '').replace(/^\[\[|\]\]$/g, ''),
            context: fm.context || fm.contexts || [],
            children: [],
            project: fm.project || undefined,
            priority: fm.priority || undefined,
            energy: fm.energy || undefined,
        });
        if (!skipRebuild) this.rebuildCalculatedState();
    }

    isThoughtFile(path: string): boolean {
        const folder = (this.settings.thoughtsFolder || '000 Bin/MINA V2').trim();
        // Use folder + '/' to prevent prefix collision with sibling folders
        // e.g. '000 Bin/MINA V2' must NOT match '000 Bin/MINA V2 Tasks/...'
        return path.startsWith(folder + '/') && path.endsWith('.md') && !path.includes('/trash/');
    }

    isTaskFile(path: string): boolean {
        const folder = (this.settings.tasksFolder || '000 Bin/MINA V2 Tasks').trim();
        return path.startsWith(folder + '/') && path.endsWith('.md') && !path.includes('/trash/');
    }

    getProjects(): string[] {
        const p = new Set<string>();
        this.thoughtIndex.forEach(t => { if (t.project) p.add(t.project); });
        return Array.from(p);
    }

    async scanForContexts(): Promise<string[]> {
        const c = new Set<string>();
        this.thoughtIndex.forEach(t => t.context.forEach((x: string) => c.add(x)));
        this.taskIndex.forEach(t => t.context.forEach((x: string) => c.add(x)));
        return Array.from(c);
    }
}
