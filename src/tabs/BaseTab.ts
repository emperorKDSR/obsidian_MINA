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

    // Use view's state
    get plugin() { return this.view.plugin; }
    get app() { return this.view.app; }
    get settings() { return this.view.plugin.settings; }

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
                // Attach to view container instead of document.body for popout window support
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
                let touchStart: { x: number; y: number; dist: number } | null = null; let touchTx = 0, touchTy = 0, touchScale = 1;
                overlay.addEventListener('touchstart', (ev: TouchEvent) => { if (ev.touches.length === 1) { dragStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY }; dragTx = tx; dragTy = ty; } else if (ev.touches.length === 2) { const dist = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY); touchStart = { x: (ev.touches[0].clientX + ev.touches[1].clientX) / 2, y: (ev.touches[0].clientY + ev.touches[1].clientY) / 2, dist }; touchScale = scale; dragStart = null; } }, { passive: false });
                overlay.addEventListener('touchmove', (ev: TouchEvent) => { ev.preventDefault(); if (ev.touches.length === 1 && dragStart) { tx = dragTx + (ev.touches[0].clientX - dragStart.x); ty = dragTy + (ev.touches[0].clientY - dragStart.y); clampTranslate(); applyTransform(); } else if (ev.touches.length === 2 && touchStart) { const dist = Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY); scale = Math.max(0.2, Math.min(8, touchScale * (dist / touchStart.dist))); clampTranslate(); applyTransform(); } }, { passive: false });
                overlay.addEventListener('touchend', () => { dragStart = null; touchStart = null; });
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
                await this.view.plugin.editThoughtBody(entry.filePath, lines.join('\n'), entry.context);
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

    renderCaptureMode(container: HTMLElement, isThoughtsOnly = false, isTasksOnly = false) {
        container.empty();
        const wrap = container.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 10px;' } });
        const inputWrap = wrap.createEl('div', { attr: { style: 'position: relative;' } });
        const textArea = inputWrap.createEl('textarea', { attr: { placeholder: "What's on your mind?", style: 'width: 100%; min-height: 100px; border-radius: 8px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary-alt); color: var(--text-normal); padding: 12px; font-size: 0.95em; resize: vertical; display: block;' } });
        textArea.value = this.view.content;
        if (Platform.isMobile) textArea.addEventListener('focus', () => { setTimeout(() => { textArea.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); });
        textArea.addEventListener('input', () => { this.view.content = textArea.value; });
        const footer = wrap.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
        const btnGroup = footer.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
        if (!isTasksOnly) {
            const tBtn = btnGroup.createEl('button', { text: 'Thought', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 6px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;' } });
            tBtn.addEventListener('click', async () => { if (!textArea.value.trim()) return; await this.view.plugin.createThoughtFile(textArea.value, this.view.selectedContexts); textArea.value = ''; this.view.content = ''; this.refreshCurrentList(); });
        }
        if (!isThoughtsOnly) {
            const kBtn = btnGroup.createEl('button', { text: 'Task', attr: { style: 'background: var(--background-secondary); border: 1px solid var(--background-modifier-border); padding: 6px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;' } });
            kBtn.addEventListener('click', async () => { if (!textArea.value.trim()) return; await this.view.plugin.createTaskFile(textArea.value, this.view.selectedContexts); textArea.value = ''; this.view.content = ''; this.refreshCurrentList(); });
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
            await this.view.plugin.toggleTaskStatus(entry.filePath, cb.checked);
            new Notice(cb.checked ? 'Task marked as done' : 'Task reopened');
            this.refreshCurrentList();
        });

        const content = topRow.createEl('div', { attr: { style: 'flex:1; min-width:0;' } });
        const lineCount = (entry.body || entry.title).split('\n').length;
        const isAutoCompact = !this.view.plugin.settings.isCompactView && lineCount > 10;

        const textClasses = [];
        if (this.view.plugin.settings.isCompactView) textClasses.push('mina-card-compact');
        else if (isAutoCompact) textClasses.push('mina-card-auto-compact');

        const textEl = content.createEl('div', { cls: textClasses.join(' '), attr: { style: `word-break:break-word; font-size:0.95em; line-height:1.5; ${isDone ? 'text-decoration:line-through; opacity:0.7;' : ''}` } });
        await MarkdownRenderer.render(this.view.plugin.app, entry.body || entry.title, textEl, entry.filePath, this.view);
        this.hookInternalLinks(textEl, entry.filePath); this.hookImageZoom(textEl);
        const firstP = textEl.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }

        if (this.view.plugin.settings.isCompactView || isAutoCompact) {
            this.renderExpandToggle(content, textEl);
        }

        const actions = row.createEl('div', { 
            attr: { 
                style: 'position:absolute; top:8px; right:8px; display:flex; gap:2px; padding:2px; background:var(--background-primary); border-radius:6px; border:1px solid var(--background-modifier-border); opacity:0; transition:opacity 0.2s;' 
            } 
        });
        row.addEventListener('mouseenter', () => actions.style.opacity = '1');
        row.addEventListener('mouseleave', () => actions.style.opacity = '0');

        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.view.plugin.app, this.view.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), entry.due || null, true, async (newText, newCtxStr, newDue) => {
                const ctxArr = newCtxStr ? newCtxStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                await this.view.plugin.editTaskBody(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                this.refreshCurrentList();
            }).open();
        });

        this.renderActionButton(actions, ICON_REPLY, 'Comment', () => { 
            new CommentModal(this.app, this.view.plugin, entry.filePath, entry.body || entry.title, async (text) => {
                const success = await this.view.plugin.appendCommentToTaskFile(entry.filePath, text);
                if (success) {
                    new Notice('Comment added');
                    this.refreshCurrentList();
                }
            }).open();
        });

        if (entry.children && entry.children.length > 0) {
            this.renderActionButton(actions, ICON_MESSAGE_SQUARE, `View Comments (${entry.children.length})`, () => {
                new ViewCommentsModal(this.app, this.view.plugin, entry, () => this.refreshCurrentList()).open();
            });
        }

        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.view.plugin.app, 'Move this task to trash?', async () => { await this.view.plugin.deleteTaskFile(entry.filePath); this.refreshCurrentList(); }).open();
        });

        if (!hideMetadata) {
            const metaRow = row.createEl('div', { attr: { style: 'display:flex; justify-content:space-between; align-items:center; margin-top:8px; flex-wrap:wrap; gap:6px;' } });
            const dueLeft = metaRow.createEl('div', { attr: { style: 'display:flex; align-items:center; gap:4px;' } });
            if (entry.due) {
                const dueM = moment(entry.due, 'YYYY-MM-DD', true); const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(moment().startOf('day'), 'day');
                dueLeft.createEl('span', { text: `📅 ${entry.due}`, attr: { style: `font-size:0.8em; color:${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; font-weight:600;` } });
            }
            const ctxRight = metaRow.createEl('div', { attr: { style: 'display:flex; flex-wrap:wrap; gap:4px;' } });
            for (const ctx of entry.context) ctxRight.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size:0.75em; color:var(--text-accent); background:var(--background-secondary-alt); padding:1px 6px; border-radius:4px; font-weight:500;' } });
        }
    }

    async renderTaskCommentRow(reply: ReplyEntry, parent: TaskEntry, container: HTMLElement) {
        const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24;
        const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 4px; display: flex; align-items: flex-start; margin-left: ${indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 10px; opacity: 0.9;` } });
        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0; position: relative;' } });
        
        const renderTarget = contentDiv.createEl('div', { 
            cls: 'mina-card', 
            attr: { style: 'cursor: text; font-size: 0.9em; line-height: 1.4; color: var(--text-normal); word-break: break-word; background: var(--background-secondary-alt); border-radius: 8px; padding: 8px 10px; border: 1px solid var(--background-modifier-border-faint);' } 
        });
        
        renderTarget.createEl('span', { text: `${reply.date} ${reply.time}`, attr: { style: 'float: right; font-size: 0.6em; color: var(--text-muted); opacity: 0.6; margin-left: 10px;' } });
        await MarkdownRenderer.render(this.view.plugin.app, reply.text, renderTarget, parent.filePath, this.view);
        this.hookInternalLinks(renderTarget, parent.filePath); this.hookImageZoom(renderTarget);
        const firstP = renderTarget.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }
        
        const actions = contentDiv.createEl('div', { 
            attr: { 
                style: 'position:absolute; top:4px; right:4px; display:flex; gap:2px; padding:2px; background:var(--background-primary); border-radius:6px; border:1px solid var(--background-modifier-border); opacity:0; transition:opacity 0.2s; z-index:10;' 
            } 
        });
        contentDiv.addEventListener('mouseenter', () => actions.style.opacity = '1');
        contentDiv.addEventListener('mouseleave', () => actions.style.opacity = '0');

        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.view.plugin.app, this.view.plugin, reply.text, '', null, false, async (newText) => {
                await this.view.plugin.editReply(parent.filePath, reply.anchor, newText.replace(/<br>/g, '\n'));
                this.refreshCurrentList();
            }).open();
        });
        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.view.plugin.app, 'Delete this comment?', async () => { await this.view.plugin.deleteReply(parent.filePath, reply.anchor); this.refreshCurrentList(); }).open();
        });
    }

    async renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level: number = 0, hideAvatar: boolean = false, hideMetadata: boolean = false, blur?: boolean) {
        const isCollapsed = this.view.collapsedThreads.has(entry.filePath); const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24;
        const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 6px; display: flex; align-items: flex-start; ${level > 0 ? `margin-left: ${level * indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 10px;` : ''}` } });

        const iconWidth = hideAvatar && level === 0 ? (entry.children.length > 0 ? 16 : 0) : 32;
        const iconSection = itemEl.createEl('div', { attr: { style: `width: ${iconWidth}px; margin-right: ${iconWidth > 0 ? 10 : 0}px; margin-top: 4px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px;` } });

        if (level === 0 && entry.children.length > 0) {
            const collapseBtn = iconSection.createEl('div', { text: isCollapsed ? '▶' : '▼', attr: { style: 'cursor: pointer; font-size: 0.7em; opacity: 0.5; padding: 4px;' } });
            collapseBtn.addEventListener('click', () => { if (isCollapsed) this.view.collapsedThreads.delete(entry.filePath); else this.view.collapsedThreads.add(entry.filePath); this.refreshCurrentList(); });
        }

        if (level === 0 && !hideAvatar) {
            const iconContainer = iconSection.createEl('div', { attr: { style: 'width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 1.5px solid var(--background-modifier-border);' } });
            const img = iconContainer.createEl('img', { attr: { style: 'width: 100%; height: 100%; display: block;' } }); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}`;
        }

        if (level === 0 && entry.children.length > 0 && !hideAvatar) iconSection.createEl('div', { text: `${entry.children.length}`, attr: { style: 'font-size: 0.65em; color: var(--text-accent); font-weight: bold; background: var(--background-secondary-alt); padding: 1px 6px; border-radius: 6px;' } });
        
        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0; position: relative;' } });
        const isBlurred = blur ?? this.view.plugin.settings.blurredNotes.includes(entry.filePath);
        const lineCount = entry.body.split('\n').length;
        const isAutoCompact = !this.view.plugin.settings.isCompactView && lineCount > 10;

        const cardClasses = ['mina-card'];
        if (isBlurred) cardClasses.push('mina-blurred');
        if (this.view.plugin.settings.isCompactView) cardClasses.push('mina-card-compact');
        else if (isAutoCompact) cardClasses.push('mina-card-auto-compact');

        const renderTarget = contentDiv.createEl('div', {
            cls: cardClasses.join(' '),
            attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.5; color: var(--text-normal); word-break: break-word; background: var(--background-secondary); border-radius: 12px; padding: 12px; border: 1px solid var(--background-modifier-border-faint); transition: box-shadow 0.2s;' }
        });
        
        const timestamp = renderTarget.createEl('span', { text: `${entry.day} ${entry.created.split(' ')[1] || ''}`, attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.6; margin-left: 10px;' } });
        await MarkdownRenderer.render(this.view.plugin.app, entry.body, renderTarget, filePath, this.view);
        this.hookInternalLinks(renderTarget, filePath); this.hookImageZoom(renderTarget); this.hookCheckboxes(renderTarget, entry);
        const firstP = renderTarget.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }

        if (this.view.plugin.settings.isCompactView || isAutoCompact) {
            this.renderExpandToggle(contentDiv, renderTarget);
        }

        const actions = contentDiv.createEl('div', { 
            attr: { 
                style: 'position:absolute; top:4px; right:4px; display:flex; gap:2px; padding:2px; background:var(--background-primary); border-radius:6px; border:1px solid var(--background-modifier-border); opacity:0; transition:opacity 0.2s; z-index:10;' 
            } 
        });
        contentDiv.addEventListener('mouseenter', () => actions.style.opacity = '1');
        contentDiv.addEventListener('mouseleave', () => actions.style.opacity = '0');

        this.renderActionButton(actions, ICON_PIN, entry.pinned ? 'Unpin' : 'Pin', async () => {
            await this.view.plugin.toggleThoughtPin(entry.filePath, !entry.pinned);
        });

        this.renderActionButton(actions, isBlurred ? ICON_EYE_OFF : ICON_EYE, isBlurred ? 'Unblur' : 'Blur', async () => {
            if (isBlurred) this.view.plugin.settings.blurredNotes = this.view.plugin.settings.blurredNotes.filter(p => p !== entry.filePath);
            else this.view.plugin.settings.blurredNotes.push(entry.filePath);
            await this.view.plugin.saveSettings(); this.refreshCurrentList();
        });

        this.renderActionButton(actions, ICON_LINK, 'Open File', () => this.view.plugin.app.workspace.openLinkText(entry.filePath, '', 'window'));
        this.renderActionButton(actions, ICON_REPLY, 'Reply', () => { 
            new CommentModal(this.app, this.view.plugin, entry.filePath, entry.body, async (text) => {
                const success = await this.view.plugin.appendReplyToFile(entry.filePath, text);
                if (success) {
                    new Notice('Reply added');
                    this.refreshCurrentList();
                }
            }).open();
        });
        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.view.plugin.app, this.view.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), null, false, async (newText, newContextStr) => {
                const newContexts = newContextStr ? newContextStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                await this.view.plugin.editThoughtBody(entry.filePath, newText.replace(/<br>/g, '\n'), newContexts);
                this.refreshCurrentList();
            }).open();
        });
        this.renderActionButton(actions, ICON_CHECKLIST, 'Convert to Task', () => {
            new ConvertToTaskModal(this.view.plugin.app, entry.body, entry.context, async (dueDate) => {
                await this.view.plugin.createTaskFile(entry.body.replace(/<br>/g, '\n'), entry.context, dueDate || undefined);
                const updatedContexts = [...new Set([...entry.context, 'converted_to_tasks'])];
                await this.view.plugin.editThoughtBody(entry.filePath, entry.body.replace(/<br>/g, '\n'), updatedContexts);
                new Notice('✅ Thought converted to task!'); this.refreshCurrentList();
            }).open();
        });
        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.view.plugin.app, 'Move this thought to trash?', async () => { await this.view.plugin.deleteThoughtFile(entry.filePath); this.refreshCurrentList(); }).open();
        });

        if (!hideMetadata && entry.context.length > 0) {
            const ctxRow = renderTarget.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;' } });
            for (const ctx of entry.context) ctxRow.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size: 0.75em; color: var(--text-accent); font-weight: 500; background-color: var(--background-secondary-alt); padding: 1px 6px; border-radius: 4px;' } });
        }

        if (level === 0 && !isCollapsed && entry.children.length > 0) { for (const reply of entry.children) await this.renderReplyRow(reply, entry, container, isBlurred); }
    }

    async renderReplyRow(reply: ReplyEntry, parent: ThoughtEntry, container: HTMLElement, blur?: boolean) {
        const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24; const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 4px; display: flex; align-items: flex-start; margin-left: ${indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 10px;` } });
        const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0; position: relative;' } });
        const isBlurred = blur ?? this.view.plugin.settings.blurredNotes.includes(parent.filePath);
        
        const renderTarget = contentDiv.createEl('div', { 
            cls: 'mina-card' + (isBlurred ? ' mina-blurred' : ''), 
            attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.5; color: var(--text-normal); word-break: break-word; background: var(--background-secondary); border-radius: 10px; padding: 10px; border: 1px solid var(--background-modifier-border-faint);' } 
        });
        
        renderTarget.createEl('span', { text: `${reply.date} ${reply.time}`, attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.6; margin-left: 10px;' } });
        await MarkdownRenderer.render(this.view.plugin.app, reply.text, renderTarget, parent.filePath, this.view);
        this.hookInternalLinks(renderTarget, parent.filePath); this.hookImageZoom(renderTarget);
        const firstP = renderTarget.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }
        
        const actions = contentDiv.createEl('div', { 
            attr: { 
                style: 'position:absolute; top:4px; right:4px; display:flex; gap:2px; padding:2px; background:var(--background-primary); border-radius:6px; border:1px solid var(--background-modifier-border); opacity:0; transition:opacity 0.2s; z-index:10;' 
            } 
        });
        contentDiv.addEventListener('mouseenter', () => actions.style.opacity = '1');
        contentDiv.addEventListener('mouseleave', () => actions.style.opacity = '0');

        this.renderActionButton(actions, ICON_EDIT, 'Edit', () => {
            new EditEntryModal(this.view.plugin.app, this.view.plugin, reply.text, '', null, false, async (newText) => {
                await this.view.plugin.editReply(parent.filePath, reply.anchor, newText.replace(/<br>/g, '\n'));
                this.refreshCurrentList();
            }).open();
        });
        this.renderActionButton(actions, ICON_TRASH, 'Delete', () => {
            new ConfirmModal(this.view.plugin.app, 'Delete this reply?', async () => { await this.view.plugin.deleteReply(parent.filePath, reply.anchor); this.refreshCurrentList(); }).open();
        });
    }

    render(container: HTMLElement, ...args: any[]): void {
        // Base implementation (empty or default)
    }
}
