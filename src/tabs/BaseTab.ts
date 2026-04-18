import { Platform, MarkdownRenderer, Notice, Menu, MenuItem, TFile, moment, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry, TaskEntry, ReplyEntry } from '../types';
import { NINJA_AVATAR_SVG, ICON_PIN, ICON_EDIT, ICON_TRASH, ICON_REPLY, ICON_LINK, ICON_EYE, ICON_EYE_OFF, ICON_CHECKLIST, ICON_MESSAGE_SQUARE } from '../constants';
import { FileSuggestModal } from '../modals/FileSuggestModal';
import { ContextSuggestModal } from '../modals/ContextSuggestModal';
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ConvertToTaskModal } from '../modals/ConvertToTaskModal';
import { CommentModal } from '../modals/CommentModal';
import { ViewCommentsModal } from '../modals/ViewCommentsModal';
import { parseNaturalDate, isTablet } from '../utils';

export class BaseTab {
    view: MinaView;
    constructor(view: MinaView) { this.view = view; }

    // Unified Access to Services
    get plugin() { return this.view.plugin; }
    get app() { return this.view.app; }
    get settings() { return this.view.plugin.settings; }
    
    // Services shortcuts
    get vault() { return this.plugin.vault; }
    get ai() { return this.plugin.ai; }
    get index() { return this.plugin.index; }

    renderHomeIcon(parent: HTMLElement) {
        const homeBtn = parent.createEl('button', {
            attr: { style: 'background: transparent; border: none; padding: 0; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; opacity: 0.6; transition: opacity 0.1s; width: 24px; height: 24px;' }
        });
        homeBtn.addEventListener('mouseenter', () => homeBtn.style.opacity = '1');
        homeBtn.addEventListener('mouseleave', () => homeBtn.style.opacity = '0.6');
        setIcon(homeBtn, 'mina-home-icon');
        homeBtn.addEventListener('click', () => { this.view.activeTab = 'home'; this.view.renderView(); });
    }

    hookInternalLinks(el: HTMLElement, sourcePath: string) {
        el.querySelectorAll('a.internal-link').forEach((a) => {
            a.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const href = a.getAttribute('data-href') || a.getAttribute('href') || '';
                if (href) this.view.plugin.app.workspace.openLinkText(href, sourcePath, Platform.isMobile ? 'tab' : 'window');
            });
        });
    }

    hookImageZoom(el: HTMLElement) {
        el.querySelectorAll('img').forEach((img) => {
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                const overlay = this.view.containerEl.createEl('div', { attr: { style: 'position:absolute; inset:0; z-index:99999; background:rgba(0,0,0,0.88); display:flex; align-items:center; justify-content:center; overflow:hidden; touch-action:none' } });
                const zoomed = overlay.createEl('img', { attr: { src: img.src, style: 'max-width:95%; max-height:95%; object-fit:contain; border-radius:6px; box-shadow:0 8px 40px rgba(0,0,0,0.6); user-select:none; will-change:transform; transform-origin:center center; cursor:grab; transition:none' } });
                const hint = overlay.createEl('div', { attr: { style: 'position:absolute; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.55); color:#fff; font-size:0.78em; padding:4px 14px; border-radius:20px; pointer-events:none; white-space:nowrap; opacity:0.8' }, text: Platform.isMobile ? 'Pinch to zoom · drag to pan · tap outside to close' : 'Scroll to zoom · drag to pan · click outside to close · Esc' });
                let scale = 1, tx = 0, ty = 0;
                const applyTransform = () => { zoomed.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; zoomed.style.cursor = scale > 1 ? 'grab' : 'zoom-in'; };
                const clampTranslate = () => { const r = zoomed.getBoundingClientRect(); const ow = overlay.clientWidth, oh = overlay.clientHeight; const excess = Math.max(0, (r.width - ow) / 2 + 20); const excessY = Math.max(0, (r.height - oh) / 2 + 20); tx = Math.max(-excess, Math.min(excess, tx)); ty = Math.max(-excessY, Math.min(excessY, ty)); };
                const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
                overlay.addEventListener('click', close); zoomed.addEventListener('click', (ev) => ev.stopPropagation());
                const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
                document.addEventListener('keydown', onKey);
                overlay.addEventListener('wheel', (ev: WheelEvent) => { ev.preventDefault(); const delta = ev.deltaY < 0 ? 0.15 : -0.15; scale = Math.max(0.2, Math.min(8, scale + delta)); clampTranslate(); applyTransform(); }, { passive: false });
                let dragStart: { x: number; y: number } | null = null; let dragTx = 0, dragTy = 0;
                zoomed.addEventListener('mousedown', (ev: MouseEvent) => { if (scale > 1) { dragStart = { x: ev.clientX, y: ev.clientY }; dragTx = tx; dragTy = ty; zoomed.style.cursor = 'grabbing'; ev.preventDefault(); } });
                window.addEventListener('mousemove', (ev: MouseEvent) => { if (dragStart) { tx = dragTx + (ev.clientX - dragStart.x); ty = dragTy + (ev.clientY - dragStart.y); clampTranslate(); applyTransform(); } });
                window.addEventListener('mouseup', () => { dragStart = null; if (scale > 1) zoomed.style.cursor = 'grab'; });
            });
        });
    }

    renderActionButton(parent: HTMLElement, iconPath: string, title: string, onClick: () => void, color: string = 'var(--text-muted)') {
        const btn = parent.createEl('button', { attr: { title, class: 'mina-action-btn', style: `color: ${color};` } });
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>`;
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    }

    renderSearchInput(parent: HTMLElement, onSearch: (val: string) => void) {
        const wrap = parent.createEl('div', { attr: { style: 'padding: 0 14px 10px 14px; flex-shrink: 0;' } });
        const inp = wrap.createEl('input', { type: 'text', attr: { placeholder: 'Search...', style: 'width: 100%; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary-alt); color: var(--text-normal); font-size: 0.85em;' } });
        inp.addEventListener('input', (e) => onSearch((e.target as HTMLInputElement).value));
    }

    renderExpandToggle(content: HTMLElement, textEl: HTMLElement) {
        const toggle = content.createEl('div', { cls: 'mina-expand-toggle' });
        toggle.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = textEl.classList.toggle('is-expanded');
            toggle.style.transform = isExpanded ? 'rotate(180deg)' : 'none';
        });
    }

    hookCheckboxes(el: HTMLElement, entry: ThoughtEntry) {
        const cbs = el.querySelectorAll('input[type="checkbox"]');
        cbs.forEach((cb, idx) => {
            cb.addEventListener('change', async () => {
                const isChecked = (cb as HTMLInputElement).checked;
                const lines = entry.body.split('\n');
                let count = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('- [ ]') || lines[i].includes('- [x]')) {
                        if (count === idx) {
                            lines[i] = lines[i].replace(isChecked ? '- [ ]' : '- [x]', isChecked ? '- [x]' : '- [ ]');
                            break;
                        }
                        count++;
                    }
                }
                await this.vault.editThought(entry.filePath, lines.join('\n'), entry.context);
                new Notice(isChecked ? 'Task completed' : 'Task reopened');
            });
        });
    }

    refreshCurrentList() {
        if (typeof (this as any).render === 'function') {
            const container = (this.view as any).containerEl.querySelector('.mina-view-content');
            if (container) (this as any).render(container);
            else this.view.renderView();
        } else {
            this.view.renderView();
        }
    }

    async renderTaskRow(entry: TaskEntry, container: HTMLElement, hideMetadata = false) {
        const isDone = entry.status === 'done';
        const row = container.createEl('div', { cls: 'mina-card-row', attr: { style: 'position:relative; margin-bottom:12px;' } });
        const card = row.createEl('div', { cls: 'mina-card', attr: { style: `background:var(--background-secondary); border-radius:12px; padding:12px; border:1px solid var(--background-modifier-border-faint); transition:all 0.2s; ${isDone ? 'opacity:0.6;' : ''}` } });
        const topRow = card.createEl('div', { attr: { style: 'display:flex; gap:10px; align-items:flex-start;' } });
        const cb = topRow.createEl('input', { type: 'checkbox', attr: { style: 'margin-top:4px; cursor:pointer;' } });
        cb.checked = isDone;
        cb.addEventListener('change', async () => {
            await this.vault.toggleTask(entry.filePath, cb.checked);
            new Notice(cb.checked ? 'Task marked as done' : 'Task reopened');
            this.refreshCurrentList();
        });

        const content = topRow.createEl('div', { attr: { style: 'flex:1; min-width:0;' } });
        const textEl = content.createEl('div', { cls: 'mina-card-text', attr: { style: `word-break:break-word; font-size:0.95em; line-height:1.5; ${isDone ? 'text-decoration:line-through; opacity:0.7;' : ''}` } });
        await MarkdownRenderer.render(this.view.plugin.app, entry.body || entry.title, textEl, entry.filePath, this.view);
        this.hookInternalLinks(textEl, entry.filePath); this.hookImageZoom(textEl);

        const actions = row.createEl('div', { attr: { style: 'position:absolute; top:8px; right:8px; display:flex; gap:2px; padding:2px; background:var(--background-primary); border-radius:6px; border:1px solid var(--background-modifier-border); opacity:0; transition:opacity 0.2s;' } });
        row.addEventListener('mouseenter', () => actions.style.opacity = '1');
        row.addEventListener('mouseleave', () => actions.style.opacity = '0');

        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.app, this.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), entry.due || null, true, async (newText, newCtxStr, newDue) => {
                const ctxArr = newCtxStr ? newCtxStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                await this.vault.editTask(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_REPLY, 'Comment', () => { 
            new CommentModal(this.app, this.plugin, entry.filePath, entry.body || entry.title, async (text) => {
                const success = await this.vault.appendComment(entry.filePath, text);
                if (success) { new Notice('Comment added'); this.refreshCurrentList(); }
            }).open();
        });

        if (entry.children && entry.children.length > 0) {
            this.renderActionButton(actions, ICON_MESSAGE_SQUARE, `View Comments (${entry.children.length})`, () => {
                new ViewCommentsModal(this.app, this.plugin, entry, () => this.refreshCurrentList()).open();
            });
        }

        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.app, 'Move this task to trash?', async () => { await this.vault.deleteFile(entry.filePath, 'tasks'); this.refreshCurrentList(); }).open();
        });

        if (!hideMetadata) {
            const metaRow = row.createEl('div', { attr: { style: 'display:flex; justify-content:space-between; align-items:center; margin-top:8px; flex-wrap:wrap; gap:6px;' } });
            if (entry.due) {
                const dueM = moment(entry.due, 'YYYY-MM-DD', true); const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(moment(), 'day');
                metaRow.createEl('span', { text: `📅 ${entry.due}`, attr: { style: `font-size:0.8em; color:${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; font-weight:600;` } });
            }
            const ctxRight = metaRow.createEl('div', { attr: { style: 'display:flex; flex-wrap:wrap; gap:4px;' } });
            for (const ctx of entry.context) ctxRight.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size:0.75em; color:var(--text-accent); background:var(--background-secondary-alt); padding:1px 6px; border-radius:4px;' } });
        }
    }

    async renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level: number = 0, hideAvatar: boolean = false, blur?: boolean) {
        const isCollapsed = this.view.collapsedThreads.has(entry.filePath); const indentStep = 24;
        const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 6px; display: flex; align-items: flex-start; ${level > 0 ? `margin-left: ${level * indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 10px;` : ''}` } });

        const iconSection = itemEl.createEl('div', { attr: { style: 'width: 32px; margin-right: 10px; margin-top: 4px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center;' } });
        if (level === 0 && !hideAvatar) {
            const iconContainer = iconSection.createEl('div', { attr: { style: 'width: 32px; height: 32px; border-radius: 50%; overflow: hidden; border: 1.5px solid var(--background-modifier-border);' } });
            const img = iconContainer.createEl('img', { attr: { style: 'width: 100%; height: 100%;' } }); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}`;
        }

        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; min-width: 0; position: relative;' } });
        const isBlurred = blur ?? this.settings.blurredNotes.includes(entry.filePath);
        
        const card = contentDiv.createEl('div', { cls: 'mina-card' + (isBlurred ? ' mina-blurred' : ''), attr: { style: 'background:var(--background-secondary); border-radius:12px; padding:12px; border:1px solid var(--background-modifier-border-faint);' } });
        await MarkdownRenderer.render(this.app, entry.body, card, filePath, this.view);
        this.hookInternalLinks(card, filePath); this.hookImageZoom(card); this.hookCheckboxes(card, entry);

        const actions = contentDiv.createEl('div', { attr: { style: 'position:absolute; top:4px; right:4px; display:flex; gap:2px; padding:2px; background:var(--background-primary); border-radius:6px; border:1px solid var(--background-modifier-border); opacity:0; transition:opacity 0.2s; z-index:10;' } });
        contentDiv.addEventListener('mouseenter', () => actions.style.opacity = '1');
        contentDiv.addEventListener('mouseleave', () => actions.style.opacity = '0');

        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.app, this.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), null, false, async (newText, newCtxStr) => {
                const ctxArr = newCtxStr ? newCtxStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                await this.vault.editThought(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr);
                this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_REPLY, 'Reply', () => { 
            new CommentModal(this.app, this.plugin, entry.filePath, entry.body, async (text) => {
                const success = await this.vault.appendComment(entry.filePath, text);
                if (success) this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.app, 'Move thought to trash?', async () => { await this.vault.deleteFile(entry.filePath, 'thoughts'); this.refreshCurrentList(); }).open();
        });

        if (entry.context.length > 0) {
            const ctxRow = card.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;' } });
            for (const ctx of entry.context) ctxRow.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size: 0.75em; color: var(--text-accent); background-color: var(--background-secondary-alt); padding: 1px 6px; border-radius: 4px;' } });
        }

        if (level === 0 && !isCollapsed && entry.children.length > 0) {
            for (const reply of entry.children) await this.renderReplyRow(reply, entry, container, isBlurred);
        }
    }

    async renderReplyRow(reply: ReplyEntry, parent: ThoughtEntry, container: HTMLElement, blur?: boolean) {
        const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 4px; display: flex; align-items: flex-start; margin-left: 24px; border-left: 2px solid var(--background-modifier-border); padding-left: 10px;` } });
        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; min-width: 0; position: relative;' } });
        const card = contentDiv.createEl('div', { cls: 'mina-card' + (blur ? ' mina-blurred' : ''), attr: { style: 'background:var(--background-secondary-alt); border-radius:10px; padding:10px; border:1px solid var(--background-modifier-border-faint);' } });
        await MarkdownRenderer.render(this.app, reply.text, card, parent.filePath, this.view);
        this.hookInternalLinks(card, parent.filePath); this.hookImageZoom(card);
    }

    render(container: HTMLElement, ...args: any[]): void {}
}
