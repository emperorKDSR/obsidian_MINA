import { App, TFile, Notice, moment } from 'obsidian';
import type { MinaSettings, ThoughtEntry, TaskEntry, ReplyEntry } from '../types';

export class VaultService {
    app: App;
    settings: MinaSettings;

    constructor(app: App, settings: MinaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: MinaSettings) {
        this.settings = settings;
    }

    private extractTitle(text: string): string {
        const firstLine = text.split('\n').find(l => l.trim()) || text;
        return firstLine.replace(/[#*_`\[\]]/g, '').trim().substring(0, 60);
    }

    private formatDateTime(d: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    private formatDate(d: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }

    private formatTime(d: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    private buildFrontmatter(title: string, created: string, modified: string, dayStr: string, contexts: string[], pinned: boolean = false, project?: string): string {
        // sec-006: Sanitize title and contexts before YAML embedding to prevent injection
        const safeTitle = this.sanitizeYamlString(title);
        const safeContexts = contexts.map(c => this.sanitizeContext(c));
        const contextYaml = safeContexts.length > 0 ? safeContexts.map(c => `  - ${c}`).join('\n') : '  []';
        const projectLine = project ? `project: "${this.sanitizeYamlString(project)}"\n` : '';
        return `---\ntitle: "${safeTitle}"\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: MINA\ncontext:\n${contextYaml}\ntags:\n${contextYaml}\npinned: ${pinned}\n${projectLine}---\n`;
    }

    private buildTaskFrontmatter(title: string, created: string, modified: string, dayStr: string, status: string, due: string, contexts: string[], project?: string): string {
        // sec-006: Sanitize title and contexts before YAML embedding to prevent injection
        const safeTitle = this.sanitizeYamlString(title);
        const safeContexts = contexts.map(c => this.sanitizeContext(c));
        const contextYaml = safeContexts.length > 0 ? safeContexts.map(c => `  - ${c}`).join('\n') : '  []';
        const dueYaml = due ? `"[[${due}]]"` : '""';
        const projectLine = project ? `project: "${this.sanitizeYamlString(project)}"\n` : '';
        return `---\ntitle: "${safeTitle}"\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: MINA_TASKS\nstatus: ${status}\ndue: ${dueYaml}\ncontext:\n${contextYaml}\ntags:\n${contextYaml}\n${projectLine}---\n`;
    }

    // sec-006: Strip characters that break YAML string values
    private sanitizeYamlString(value: string): string {
        return value.replace(/[\n\r]/g, ' ').replace(/"/g, "'").trim();
    }

    // sec-006: Strip characters that break YAML list items
    private sanitizeContext(ctx: string): string {
        return ctx.replace(/[\n\r:#"]/g, '').trim();
    }

    private generateFilename(prefix: string = ''): string {
        const now = new Date();
        const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
        const date = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
        const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
        const rand = Math.random().toString(36).substring(2, 5);
        return `${prefix}${date}_${time}_${rand}.md`;
    }

    async ensureFolder(folder: string) {
        // sec-014: Reject paths with traversal sequences or absolute paths
        if (folder.includes('..') || folder.startsWith('/') || folder.startsWith('\\')) {
            throw new Error(`Invalid folder path: "${folder}"`);
        }
        const { vault } = this.app;
        if (!folder || folder === '/' || folder === '.') return;
        
        const parts = folder.split('/');
        let pathSoFar = '';
        for (const part of parts) {
            pathSoFar = pathSoFar ? pathSoFar + '/' + part : part;
            const exists = vault.getAbstractFileByPath(pathSoFar);
            if (!exists) {
                try { 
                    await vault.createFolder(pathSoFar); 
                } catch (e) {
                    // Ignore errors if folder was created simultaneously by another process
                    if (!e.message?.includes('already exists')) throw e;
                }
            }
        }
    }

    async createFile(folder: string, filename: string, content: string): Promise<TFile> {
        await this.ensureFolder(folder);
        const path = folder && folder !== '/' ? `${folder}/${filename}` : filename;
        
        // Handle potential duplicates
        let finalPath = path;
        if (this.app.vault.getAbstractFileByPath(finalPath)) {
            const extIdx = path.lastIndexOf('.');
            const base = extIdx !== -1 ? path.substring(0, extIdx) : path;
            const ext = extIdx !== -1 ? path.substring(extIdx) : '';
            finalPath = `${base} (${Date.now()})${ext}`;
        }

        try {
            const file = await this.app.vault.create(finalPath, content);
            return file;
        } catch (e) {
            new Notice(`Vault Error: ${e.message}`);
            throw e;
        }
    }

    async createThoughtFile(text: string, contexts: string[], project?: string): Promise<TFile> {
        // arch-08: Normalize <br> → newline at service boundary
        text = text.replace(/<br>/g, '\n');
        const folder = this.settings.thoughtsFolder.trim() || '000 Bin/MINA V2';
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const title = this.extractTitle(text);
        const fm = this.buildFrontmatter(title, created, created, dayStr, contexts, false, project);
        const filename = this.generateFilename();
        return await this.createFile(folder, filename, fm + text);
    }

    async createTaskFile(text: string, contexts: string[], dueDate?: string, project?: string): Promise<TFile> {
        // arch-08: Normalize <br> → newline at service boundary
        text = text.replace(/<br>/g, '\n');
        const folder = this.settings.tasksFolder.trim() || '000 Bin/MINA V2 Tasks';
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const title = this.extractTitle(text);
        const due = dueDate || '';
        const fm = this.buildTaskFrontmatter(title, created, created, dayStr, 'open', due, contexts, project);
        const filename = this.generateFilename('task_');
        return await this.createFile(folder, filename, fm + text);
    }

    async editThought(filePath: string, newText: string, contexts: string[]): Promise<void> {
        // arch-08: Normalize <br> → newline at service boundary
        newText = newText.replace(/<br>/g, '\n');
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        
        try {
            const content = await this.app.vault.read(file);
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
            if (!fmMatch) return;
            
            const oldFm = fmMatch[1];
            // sec-008: Escape key to prevent RegExp injection (defensive — keys are currently hardcoded)
            const escKey = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const get = (key: string) => { const m = oldFm.match(new RegExp(`^${escKey(key)}: (.+)$`, 'm')); return m ? m[1].trim() : ''; };
            
            const created = get('created') || this.formatDateTime(new Date());
            const pinned = get('pinned') === 'true';
            const project = get('project')?.replace(/^"|"$/g, '');
            
            const now = new Date();
            const title = this.extractTitle(newText);
            const newFm = this.buildFrontmatter(title, created, this.formatDateTime(now), this.formatDate(now), contexts, pinned, project);
            
            const bodyWithComments = content.slice(fmMatch[0].length);
            const replyIdx = bodyWithComments.indexOf('\n## [[');
            const bodyToSave = replyIdx !== -1 ? newText + bodyWithComments.slice(replyIdx) : newText;
            
            await this.app.vault.modify(file, newFm + bodyToSave);
        } catch (e) {
            new Notice('MINA Error: ' + e.message);
        }
    }

    async editTask(filePath: string, newText: string, contexts: string[], dueDate?: string): Promise<void> {
        // arch-08: Normalize <br> → newline at service boundary
        newText = newText.replace(/<br>/g, '\n');
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        
        try {
            const content = await this.app.vault.read(file);
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
            if (!fmMatch) return;
            
            const oldFm = fmMatch[1];
            // sec-008: Escape key to prevent RegExp injection (defensive — keys are currently hardcoded)
            const escKey = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const get = (key: string) => { const m = oldFm.match(new RegExp(`^${escKey(key)}: (.+)$`, 'm')); return m ? m[1].trim() : ''; };
            
            const created = get('created') || this.formatDateTime(new Date());
            const status = get('status') || 'open';
            const project = get('project')?.replace(/^"|"$/g, '');
            const due = dueDate ?? (oldFm.match(/^due: "?\[?\[?([\d-]*)\]?\]?"?$/m)?.[1] || '');
            
            const now = new Date();
            const title = this.extractTitle(newText);
            const newFm = this.buildTaskFrontmatter(title, created, this.formatDateTime(now), this.formatDate(now), status, due, contexts, project);
            
            await this.app.vault.modify(file, newFm + newText + '\n');
        } catch (e) {
            new Notice('MINA Error: ' + e.message);
        }
    }

    async toggleTask(filePath: string, done: boolean): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        
        try {
            const content = await this.app.vault.read(file);
            const newStatus = done ? 'done' : 'open';
            let updated = content.replace(/^status: (open|done)$/m, `status: ${newStatus}`);
            if (updated === content) updated = content.replace(/^(---\n[\s\S]*?)\n---/m, `$1\nstatus: ${newStatus}\n---`);
            
            const final = updated.replace(/^modified: .+$/m, `modified: ${this.formatDateTime(new Date())}`);
            await this.app.vault.modify(file, final);
        } catch (e) {
            new Notice('MINA Error: ' + e.message);
        }
    }

    async deleteFile(filePath: string, type: 'thoughts' | 'tasks'): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        
        const folder = type === 'thoughts' ? this.settings.thoughtsFolder : this.settings.tasksFolder;
        const trashFolder = (folder.trim() || '000 Bin/MINA V2') + '/trash';
        await this.ensureFolder(trashFolder);
        
        try {
            const trashPath = `${trashFolder}/${file.basename}_${Date.now()}.md`;
            await this.app.vault.rename(file, trashPath);
            new Notice('Moved to trash.');
        } catch (e) {
            new Notice('MINA Error: ' + e.message);
        }
    }

    async appendComment(filePath: string, text: string): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;
        
        try {
            // ob-perf-04: Combine body + modified-date update into single vault.modify call
            const now = new Date();
            const anchor = `reply-${Date.now()}`;
            const dateStr = this.formatDate(now);
            const timeStr = this.formatTime(now);
            const header = `## [[${dateStr}]] ${timeStr} ^${anchor}`;
            const existing = await this.app.vault.read(file);
            const withComment = existing.trimEnd() + `\n\n${header}\n${text}\n`;
            const final = withComment.replace(/^modified: .+$/m, `modified: ${this.formatDateTime(now)}`);
            await this.app.vault.modify(file, final);
            
            return true;
        } catch (e) {
            new Notice('MINA Error: ' + e.message);
            return false;
        }
    }

    async getHabitStatus(date: string): Promise<string[]> {
        const folder = this.settings.habitsFolder.trim() || '000 Bin/MINA V2 Habits';
        const path = `${folder}/${date}.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return [];
        try {
            const content = await this.app.vault.read(file);
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
            if (!fmMatch) return [];
            const fmLines = fmMatch[1].split('\n');
            const completedLine = fmLines.find(l => l.startsWith('completed:'));
            if (!completedLine) return [];
            const idsMatch = completedLine.match(/completed:\s*\[(.*)\]/);
            return idsMatch ? idsMatch[1].split(',').map(id => id.trim().replace(/^['"]|['"]$/g, '')).filter(id => id) : [];
        } catch { return []; }
    }

    async toggleHabit(date: string, habitId: string): Promise<void> {
        const folder = this.settings.habitsFolder.trim() || '000 Bin/MINA V2 Habits';
        const path = `${folder}/${date}.md`;
        let completedIds = await this.getHabitStatus(date);
        completedIds = completedIds.includes(habitId) ? completedIds.filter(id => id !== habitId) : [...completedIds, habitId];

        const idsYaml = completedIds.length > 0 ? `['${completedIds.join("', '")}']` : '[]';
        const content = `---\ndate: ${date}\ncompleted: ${idsYaml}\n---\n\n# Habits for ${date}\n`;

        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.vault.modify(file, content);
        else {
            await this.ensureFolder(folder);
            await this.app.vault.create(path, content);
        }
    }

    async markAsSynthesized(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['synthesized'] = true;
        });
    }

    // sec-010: savePayment — was previously a missing method called via unsafe (app as any) lookup
    async savePayment(file: TFile, paymentDate: string, nextDueDate: string, notes: string, attachedFiles: File[]): Promise<void> {
        // Update next due date in frontmatter
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['due'] = `[[${nextDueDate}]]`;
            fm['modified'] = this.formatDateTime(new Date());
        });
        // Append payment record as a log entry in the file body
        const current = await this.app.vault.read(file);
        const notesLine = notes.trim() ? `\n- **Notes:** ${notes.trim()}` : '';
        const record = `\n\n## Payment: ${paymentDate}\n- **Paid On:** ${paymentDate}\n- **Next Due:** ${nextDueDate}${notesLine}\n`;
        await this.app.vault.modify(file, current + record);
        new Notice(`Payment recorded for ${file.basename}. Next due: ${nextDueDate}`);
    }
}
