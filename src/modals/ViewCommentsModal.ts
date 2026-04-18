import { App, Modal, Platform, moment, MarkdownRenderer, TFile, Notice } from 'obsidian';
import MinaPlugin from '../main';
import type { TaskEntry, ReplyEntry } from '../types';
import { ICON_EDIT, ICON_TRASH, ICON_PLUS } from '../constants';
import { EditEntryModal } from './EditEntryModal';
import { ConfirmModal } from './ConfirmModal';
import { CommentModal } from './CommentModal';

export class ViewCommentsModal extends Modal {
    plugin: MinaPlugin;
    entry: TaskEntry;
    onRefresh: () => void;

    constructor(app: App, plugin: MinaPlugin, entry: TaskEntry, onRefresh: () => void) {
        super(app);
        this.plugin = plugin;
        this.entry = entry;
        this.onRefresh = onRefresh;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('mina-modern-modal');

        modalEl.style.padding = '0';
        modalEl.style.borderRadius = '16px';
        modalEl.style.overflow = 'hidden';
        modalEl.style.border = '1px solid var(--background-modifier-border)';
        modalEl.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
        modalEl.style.maxWidth = '600px';

        if (Platform.isMobile) {
            modalEl.style.width = '100vw';
            modalEl.style.height = '100vh';
            modalEl.style.borderRadius = '0';
        }

        // 1. Header
        const header = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between;' }
        });
        const titleWrap = header.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 2px;' } });
        titleWrap.createEl('h3', { text: 'Comments', attr: { style: 'margin: 0; font-size: 1.1em; font-weight: 700;' } });
        titleWrap.createEl('span', { text: this.entry.title, attr: { style: 'font-size: 0.75em; color: var(--text-muted); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;' } });
        
        const actionsHeader = header.createEl('div', { attr: { style: 'display: flex; gap: 10px; align-items: center;' } });

        const addBtn = actionsHeader.createEl('button', {
            text: '+ Add',
            attr: { style: 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.65em; padding: 2px 8px; color: var(--interactive-accent); cursor: pointer; font-weight: 700; text-transform: uppercase;' }
        });
        addBtn.addEventListener('click', () => {
            new CommentModal(this.app, this.plugin, this.entry.filePath, this.entry.body || this.entry.title, async (text) => {
                const success = await this.plugin.appendCommentToTaskFile(this.entry.filePath, text);
                if (success) {
                    new Notice('Comment added');
                    await this.refresh();
                }
            }).open();
        });

        const closeBtn = actionsHeader.createEl('button', { text: '×', attr: { style: 'background: transparent; border: none; font-size: 1.5em; cursor: pointer; color: var(--text-muted); line-height: 1;' } });
        closeBtn.addEventListener('click', () => this.close());

        // 2. Comments List
        const listBody = contentEl.createEl('div', { 
            attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 60vh;' } 
        });

        const comments = [...this.entry.children].reverse();

        if (comments.length === 0) {
            listBody.createEl('p', { text: 'No comments yet.', attr: { style: 'text-align: center; color: var(--text-muted); font-size: 0.9em; opacity: 0.6; margin-top: 20px;' } });
        } else {
            for (const comment of comments) {
                this.renderCommentRow(listBody, comment);
            }
        }

        // 3. Footer
        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: flex-end;' }
        });
        const doneBtn = footer.createEl('button', { 
            text: 'Done', 
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 24px; border-radius: 8px; font-weight: 700; cursor: pointer;' } 
        });
        doneBtn.addEventListener('click', () => this.close());
    }

    private async renderCommentRow(container: HTMLElement, reply: ReplyEntry) {
        const row = container.createEl('div', { 
            attr: { style: 'display: flex; flex-direction: column; gap: 6px; position: relative; padding: 12px; background: var(--background-primary-alt); border-radius: 12px; border: 1px solid var(--background-modifier-border-faint);' } 
        });

        const meta = row.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        meta.createSpan({ text: `${reply.date} ${reply.time}`, attr: { style: 'font-size: 0.7em; color: var(--text-muted); font-weight: 600;' } });

        const actions = meta.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
        
        const actionBtn = (parent: HTMLElement, iconSvg: string, onClick: () => void) => {
            const btn = parent.createEl('span', { attr: { style: 'cursor: pointer; opacity: 0.4; transition: opacity 0.1s;' } });
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>`;
            btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
            btn.addEventListener('mouseleave', () => btn.style.opacity = '0.4');
            btn.addEventListener('click', onClick);
        };

        actionBtn(actions, ICON_EDIT, () => {
            new EditEntryModal(this.app, this.plugin, reply.text, '', null, false, async (newText) => {
                await this.plugin.editReply(this.entry.filePath, reply.anchor, newText.replace(/<br>/g, '\n'));
                this.refresh();
            }, 'Edit Comment').open();
        });

        actionBtn(actions, ICON_TRASH, () => {
            new ConfirmModal(this.app, 'Delete this comment?', async () => {
                await this.plugin.deleteReply(this.entry.filePath, reply.anchor);
                this.refresh();
            }).open();
        });

        const textEl = row.createEl('div', { attr: { style: 'font-size: 0.95em; line-height: 1.5; color: var(--text-normal); word-break: break-word;' } });
        await MarkdownRenderer.render(this.app, reply.text, textEl, this.entry.filePath, this.plugin as any);
        
        // Basic hook for links
        textEl.querySelectorAll('a.internal-link').forEach((el: Element) => {
            const a = el as HTMLAnchorElement;
            a.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const href = a.getAttribute('data-href') || a.getAttribute('href') || '';
                if (href) this.app.workspace.openLinkText(href, this.entry.filePath, 'window');
            });
        });
    }

    private async refresh() {
        const file = this.app.vault.getAbstractFileByPath(this.entry.filePath);
        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            const updated = this.plugin.parseTaskFile(file.path, content);
            if (updated) {
                this.entry = updated;
                this.onOpen();
                this.onRefresh();
            }
        }
    }

    onClose() { this.contentEl.empty(); }
}
