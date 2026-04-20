import { App, TFile, Notice, moment } from 'obsidian';
import type { MinaSettings, ThoughtEntry, TaskEntry, ReplyEntry, ProjectEntry } from '../types';

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

    /** sec-015: Map errors to user-friendly messages; never surface raw e.message */
    private static toUserMessage(e: unknown): string {
        const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
        if (msg.includes('permission') || msg.includes('denied') || msg.includes('access')) return 'Permission denied — check your vault folder permissions.';
        if (msg.includes('not found') || msg.includes('does not exist')) return 'File not found — it may have been moved or deleted.';
        if (msg.includes('already exists')) return 'A file with that name already exists.';
        if (msg.includes('disk') || msg.includes('space') || msg.includes('enospc')) return 'Not enough disk space — free up storage and try again.';
        return 'Something went wrong. Open the developer console (Ctrl+Shift+I) for details.';
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

    private buildTaskFrontmatter(title: string, created: string, modified: string, dayStr: string, status: string, due: string, contexts: string[], project?: string, recurrence?: string, recurrenceParentId?: string): string {
        // sec-006: Sanitize title and contexts before YAML embedding to prevent injection
        const safeTitle = this.sanitizeYamlString(title);
        const safeContexts = contexts.map(c => this.sanitizeContext(c));
        const contextYaml = safeContexts.length > 0 ? safeContexts.map(c => `  - ${c}`).join('\n') : '  []';
        const dueYaml = due ? `"[[${due}]]"` : '""';
        const projectLine = project ? `project: "${this.sanitizeYamlString(project)}"\n` : '';
        const recurrenceLine = recurrence ? `recurrence: ${recurrence}\n` : '';
        const parentLine = recurrenceParentId ? `recurrenceParentId: "${recurrenceParentId}"\n` : '';
        return `---\ntitle: "${safeTitle}"\ncreated: ${created}\nmodified: ${modified}\nday: "[[${dayStr}]]"\narea: MINA_TASKS\nstatus: ${status}\ndue: ${dueYaml}\ncontext:\n${contextYaml}\ntags:\n${contextYaml}\n${projectLine}${recurrenceLine}${parentLine}---\n`;
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
            console.error('[MINA VaultService]', e);
            new Notice(VaultService.toUserMessage(e));
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

    async createTaskFile(text: string, contexts: string[], dueDate?: string, project?: string, opts?: { priority?: string; energy?: string; recurrence?: string; recurrenceParentId?: string }): Promise<TFile> {
        // arch-08: Normalize <br> → newline at service boundary
        text = text.replace(/<br>/g, '\n');
        const folder = this.settings.tasksFolder.trim() || '000 Bin/MINA V2 Tasks';
        const now = new Date();
        const created = this.formatDateTime(now);
        const dayStr = this.formatDate(now);
        const title = this.extractTitle(text);
        const due = dueDate || '';
        const fm = this.buildTaskFrontmatter(title, created, created, dayStr, 'open', due, contexts, project, opts?.recurrence, opts?.recurrenceParentId);
        const filename = this.generateFilename('task_');
        return await this.createFile(folder, filename, fm + text);
    }

    async editThought(filePath: string, newText: string, contexts: string[]): Promise<void> {
        // arch-08: Normalize <br> → newline at service boundary
        newText = newText.replace(/<br>/g, '\n');
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            const now = new Date();
            const nowStr = this.formatDateTime(now);
            const dayStr = this.formatDate(now);
            const title = this.extractTitle(newText);
            const safeContexts = contexts.map(c => this.sanitizeContext(c));

            // Step 1: update all FM fields safely via Obsidian API
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title'] = this.sanitizeYamlString(title);
                fm['modified'] = nowStr;
                fm['day'] = `[[${dayStr}]]`;
                fm['context'] = safeContexts;
                fm['tags'] = safeContexts;
                // preserve existing created, pinned, project
            });

            // Step 2: update body text, preserving comment/reply section
            const content = await this.app.vault.read(file);
            const fmEnd = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return;
            const afterFm = content.slice(fmEnd + 5);
            const replyIdx = afterFm.indexOf('\n## [[');
            const bodyToSave = replyIdx !== -1 ? newText + afterFm.slice(replyIdx) : newText;
            const newContent = content.slice(0, fmEnd + 5) + bodyToSave;
            await this.app.vault.modify(file, newContent);
        } catch (e) {
            console.error('[MINA VaultService]', e);
            new Notice(VaultService.toUserMessage(e));
        }
    }

    async editTask(filePath: string, newText: string, contexts: string[], dueDate?: string): Promise<void> {
        // arch-08: Normalize <br> → newline at service boundary
        newText = newText.replace(/<br>/g, '\n');
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            const now = new Date();
            const nowStr = this.formatDateTime(now);
            const dayStr = this.formatDate(now);
            const title = this.extractTitle(newText);
            const safeContexts = contexts.map(c => this.sanitizeContext(c));

            // Step 1: update FM fields safely via Obsidian API — preserves status, created, project
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title'] = this.sanitizeYamlString(title);
                fm['modified'] = nowStr;
                fm['day'] = `[[${dayStr}]]`;
                fm['context'] = safeContexts;
                fm['tags'] = safeContexts;
                if (dueDate !== undefined) fm['due'] = dueDate ? `[[${dueDate}]]` : '';
            });

            // Step 2: update body text
            const content = await this.app.vault.read(file);
            const fmEnd = content.indexOf('\n---\n', 3);
            if (fmEnd === -1) return;
            await this.app.vault.modify(file, content.slice(0, fmEnd + 5) + newText + '\n');
        } catch (e) {
            console.error('[MINA VaultService]', e);
            new Notice(VaultService.toUserMessage(e));
        }
    }

    async toggleTask(filePath: string, done: boolean): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['status'] = done ? 'done' : 'open';
                fm['modified'] = this.formatDateTime(new Date());
            });
        } catch (e) {
            console.error('[MINA VaultService]', e);
            new Notice(VaultService.toUserMessage(e));
        }
    }

    async setTaskDue(filePath: string, dueDate: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['due'] = dueDate ? `[[${dueDate}]]` : '';
                fm['modified'] = this.formatDateTime(new Date());
            });
        } catch (e) { console.error('[MINA VaultService]', e); new Notice(VaultService.toUserMessage(e)); }
    }

    async updateTaskTitle(filePath: string, newTitle: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm['title'] = this.sanitizeYamlString(newTitle);
                fm['modified'] = this.formatDateTime(new Date());
            });
        } catch (e) { console.error('[MINA VaultService]', e); new Notice(VaultService.toUserMessage(e)); }
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
            console.error('[MINA VaultService]', e);
            new Notice(VaultService.toUserMessage(e));
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
            console.error('[MINA VaultService]', e);
            new Notice(VaultService.toUserMessage(e));
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
        const folder = (this.settings.habitsFolder.trim() || '000 Bin/MINA V2 Habits').replace(/\\/g, '/');
        const path = `${folder}/${date}.md`;
        let file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
        if (!(file instanceof TFile)) {
            await this.ensureFolder(folder);
            file = await this.app.vault.create(path, `---\ndate: ${date}\ncompleted: []\n---\n\n# Habits — ${date}\n`);
        }
        // Use processFrontMatter to surgically update only the completed array,
        // preserving any notes or body content already written to this file.
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            const current: string[] = Array.isArray(fm['completed']) ? fm['completed'].map(String) : [];
            fm['completed'] = current.includes(habitId)
                ? current.filter(id => id !== habitId)
                : [...current, habitId];
        });
    }

    async markAsSynthesized(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['synthesized'] = true;
        });
    }

    async createVoiceSidecar(audioFilename: string, audioFolder: string, durationMs: number, transcript: string): Promise<void> {
        const baseName = audioFilename.replace(/\.[^.]+$/, '');
        const sidecarName = `${baseName}.md`;
        const sidecarPath = `${audioFolder}/${sidecarName}`;
        const now = this.formatDateTime(new Date());
        const safeTrans = transcript.replace(/"/g, "'").replace(/\n/g, ' ');
        const content = `---\nsource: "${audioFilename}"\nduration_ms: ${durationMs}\ntranscript: "${safeTrans}"\ncreated: ${now}\n---\n\n${transcript}\n`;
        try {
            await this.ensureFolder(audioFolder);
            const existing = this.app.vault.getAbstractFileByPath(sidecarPath);
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(sidecarPath, content);
            }
        } catch (e) {
            console.error('[MINA VaultService] createVoiceSidecar', e);
        }
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

    /** Save a weekly review to Reviews/Weekly/YYYY-Www.md */
    async saveWeeklyReview(weekId: string, dateRange: string, wins: string, lessons: string, focus: string[], habitHighlight: string): Promise<void> {
        const folder = 'Reviews/Weekly';
        const path = `${folder}/${weekId}.md`;
        const now = this.formatDateTime(new Date());
        const focusLines = focus.map((f, i) => `${i + 1}. ${f.trim()}`).join('\n');
        const content = `---\nweek: "${weekId}"\ndate_range: "${dateRange}"\nsaved: "${now}"\n---\n\n# 🏆 Wins\n${wins.trim()}\n\n# 📚 Lessons\n${lessons.trim()}\n\n# 🎯 Focus\n${focusLines}\n\n# 💡 Habit Highlight\n${habitHighlight}\n`;
        try {
            await this.ensureFolder(folder);
            const existing = this.app.vault.getAbstractFileByPath(path);
            if (existing instanceof TFile) {
                await this.app.vault.modify(existing, content);
            } else {
                await this.app.vault.create(path, content);
            }
        } catch (e) {
            console.error('[MINA VaultService] saveWeeklyReview', e);
            throw e;
        }
    }

    async createProject(entry: ProjectEntry): Promise<TFile> {
        const folder = (this.settings.projectsFolder || 'Projects').replace(/\\/g, '/');
        await this.ensureFolder(folder);
        const safeName = entry.id.replace(/[/\\?%*:|"<>]/g, '-');
        const path = `${folder}/${safeName}.md`;
        const lines = [
            '---',
            `id: "${entry.id}"`,
            `name: "${entry.name.replace(/"/g, '\\"')}"`,
            `status: ${entry.status}`,
            `goal: "${entry.goal.replace(/"/g, '\\"')}"`,
        ];
        if (entry.due) lines.push(`due: "${entry.due}"`);
        lines.push(`created: "${entry.created}"`);
        if (entry.color) lines.push(`color: "${entry.color}"`);
        lines.push('---', '', '## Notes', '');
        return await this.app.vault.create(path, lines.join('\n'));
    }

    async updateProject(file: TFile, updates: Partial<ProjectEntry>): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (updates.name !== undefined) fm['name'] = updates.name;
            if (updates.status !== undefined) fm['status'] = updates.status;
            if (updates.goal !== undefined) fm['goal'] = updates.goal;
            if (updates.due !== undefined) fm['due'] = updates.due;
            if (updates.color !== undefined) fm['color'] = updates.color;
        });
    }

    async archiveProject(file: TFile): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            fm['status'] = 'archived';
        });
    }

    async loadProjectNotes(file: TFile): Promise<string> {
        const content = await this.app.vault.read(file);
        const yamlEnd = content.indexOf('\n---', 3);
        if (yamlEnd === -1) return content;
        return content.slice(yamlEnd + 4).trim();
    }

    /** Load a weekly review file and parse wins/lessons/focus sections */
    async loadWeeklyReview(weekId: string): Promise<{ wins: string; lessons: string; focus: string[]; saved: string } | null> {
        const path = `Reviews/Weekly/${weekId}.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return null;
        try {
            const raw = await this.app.vault.read(file);
            const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
            const sections: Record<string, string> = {};
            const parts = body.split(/^# /m);
            for (const part of parts) {
                const firstNewline = part.indexOf('\n');
                if (firstNewline === -1) continue;
                const heading = part.substring(0, firstNewline).replace(/[🏆📚🎯💡\s]+/g, ' ').trim().toLowerCase();
                sections[heading] = part.substring(firstNewline + 1).trim();
            }
            const focusRaw = sections['focus'] || '';
            const focus = focusRaw.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
            const cache = this.app.metadataCache.getFileCache(file);
            const saved = cache?.frontmatter?.['saved'] || '';
            return {
                wins: sections['wins'] || '',
                lessons: sections['lessons'] || '',
                focus,
                saved
            };
        } catch (e) {
            console.error('[MINA VaultService] loadWeeklyReview', e);
            return null;
        }
    }
}

