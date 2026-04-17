import { Platform, MarkdownRenderer, Notice, Menu, MenuItem, TFile, moment } from 'obsidian';
import type { MinaView } from '../view';
import type { ThoughtEntry, TaskEntry, ReplyEntry } from '../types';
import { NINJA_AVATAR_SVG } from '../constants';
import { FileSuggestModal } from '../modals/FileSuggestModal';
import { ContextSuggestModal } from '../modals/ContextSuggestModal';
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { ConvertToTaskModal } from '../modals/ConvertToTaskModal';
import { parseNaturalDate, isTablet } from '../utils';

export class BaseTab {
    view: MinaView;
    constructor(view: MinaView) { this.view = view; }

    // Use view's state
    get plugin() { return this.view.plugin; }
    get app() { return this.view.app; }
    get settings() { return this.view.plugin.settings; }

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
                    const overlay = document.body.createEl('div', { attr: { style: 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.88); display:flex; align-items:center; justify-content:center; overflow:hidden; touch-action:none' } });
                    const zoomed = overlay.createEl('img', { attr: { src: img.src, style: 'max-width:90vw; max-height:90vh; object-fit:contain; border-radius:6px; box-shadow:0 8px 40px rgba(0,0,0,0.6); user-select:none; will-change:transform; transform-origin:center center; cursor:grab; transition:none' } });
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
                    zoomed.addEventListener('mousedown', (ev) => { if (scale <= 1) return; ev.preventDefault(); dragStart = { x: ev.clientX, y: ev.clientY }; dragTx = tx; dragTy = ty; zoomed.style.cursor = 'grabbing'; });
                    document.addEventListener('mousemove', (ev) => { if (!dragStart) return; tx = dragTx + (ev.clientX - dragStart.x); ty = dragTy + (ev.clientY - dragStart.y); clampTranslate(); applyTransform(); });
                    document.addEventListener('mouseup', () => { dragStart = null; applyTransform(); });
                    let lastPinchDist = 0, lastPinchScale = 1; let touchStart: { x: number; y: number; tx: number; ty: number } | null = null;
                    overlay.addEventListener('touchstart', (ev: TouchEvent) => { if (ev.touches.length === 2) { const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; lastPinchDist = Math.hypot(dx, dy); lastPinchScale = scale; touchStart = null; } else if (ev.touches.length === 1 && scale > 1) { touchStart = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, tx, ty }; } }, { passive: true });
                    overlay.addEventListener('touchmove', (ev: TouchEvent) => { ev.preventDefault(); if (ev.touches.length === 2) { const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; const dist = Math.hypot(dx, dy); scale = Math.max(0.2, Math.min(8, lastPinchScale * (dist / lastPinchDist))); clampTranslate(); applyTransform(); } else if (ev.touches.length === 1 && touchStart) { tx = touchStart.tx + (ev.touches[0].clientX - touchStart.x); ty = touchStart.ty + (ev.touches[0].clientY - touchStart.y); clampTranslate(); applyTransform(); } }, { passive: false });
                    overlay.addEventListener('touchend', (ev: TouchEvent) => { if (ev.changedTouches.length === 1 && scale <= 1.05) { if (!(ev.target as HTMLElement).closest('img')) close(); } });
                    setTimeout(() => hint.style.opacity = '0', 2500);
                });
            });
        }
    
        hookCheckboxes(el: HTMLElement, entry: ThoughtEntry) {
            try {
                const checkboxEls = Array.from(el.querySelectorAll('input[type="checkbox"]'));
                checkboxEls.forEach((cb, idx) => {
                    try {
                        const checkbox = cb as HTMLInputElement; const isChecked = checkbox.checked;
                        const circle = document.createElement('span');
                        const applyCircleStyle = (checked: boolean) => {
                            circle.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; border-radius:50%; border:2px solid var(--interactive-accent); cursor:pointer; flex-shrink:0; transition:background 0.15s; background:${checked ? 'var(--interactive-accent)' : 'transparent'}; font-size:10px; color:var(--background-primary); user-select:none; vertical-align:middle; margin-right:4px`;
                            circle.textContent = checked ? '✓' : ''; circle.setAttribute('data-checked', checked ? '1' : '0'); circle.title = checked ? 'Mark incomplete' : 'Mark complete';
                        };
                        applyCircleStyle(isChecked);
                        const parent = checkbox.parentElement; if (parent) { parent.insertBefore(circle, checkbox); parent.removeChild(checkbox); }
                        circle.addEventListener('click', async (e) => {
                            e.preventDefault(); e.stopPropagation();
                            const currentlyChecked = circle.getAttribute('data-checked') === '1'; const newChecked = !currentlyChecked; applyCircleStyle(newChecked);
                            let count = 0; const newRaw = entry.body.replace(/- \[([ x])\] /g, (match: string, state: string) => { if (count++ === idx) return state === ' ' ? '- [x] ' : '- [ ] '; return match; });
                            if (newRaw !== entry.body) { entry.body = newRaw; await this.view.plugin.editThoughtBody(entry.filePath, newRaw, entry.context); }
                        });
                    } catch (itemErr) { console.warn('MINA: hookCheckboxes item error', itemErr); }
                });
            } catch (err) { console.warn('MINA: hookCheckboxes error', err); }
        }
    
        renderCaptureMode(container: HTMLElement, isThoughtsOnly: boolean = false, isTasksOnly: boolean = false) {
            if (this.view.replyToId) {
                const replyBanner = container.createEl('div', { attr: { style: 'background-color: var(--background-secondary-alt); padding: 8px 12px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid var(--interactive-accent); display: flex; justify-content: space-between; align-items: center; font-size: 0.85em;' } });
                const bannerText = replyBanner.createEl('div', { attr: { style: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1; margin-right: 10px;' } });
                bannerText.createSpan({ text: 'Replying to: ', attr: { style: 'font-weight: bold; color: var(--text-accent);' } });
                bannerText.createSpan({ text: this.view.replyToText || '' });
                const cancelReply = replyBanner.createEl('button', { text: '✕', attr: { style: 'padding: 2px 6px; font-size: 0.8em; background: transparent; border: none; cursor: pointer;' } });
                cancelReply.addEventListener('click', () => { this.view.replyToId = null; this.view.replyToText = null; this.view.renderView(); });
            }
            const inputSection = container.createEl('div', { attr: { style: 'flex-shrink: 0; margin-bottom: 10px; display: flex; gap: 10px; align-items: flex-end;' } });
            const textAreaWrapper = inputSection.createEl('div', { attr: { style: 'flex-grow: 1;' } });
            const textArea = textAreaWrapper.createEl('textarea', { attr: { placeholder: Platform.isMobile && !isTablet() ? 'Type thought… use @ for date, # for context, [[ for links, + for checklist' : 'Enter thought or task… Shift+Enter to save', rows: isTablet() ? '4' : '3', style: 'width: 100%; font-family: var(--font-text); resize: vertical; display: block;' } });
            textArea.value = this.view.content;
            if (Platform.isMobile) textArea.addEventListener('focus', () => { setTimeout(() => { textArea.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300); });
            let lastValue = this.view.content;
            textArea.addEventListener('input', (e) => {
                const target = e.target as HTMLTextAreaElement; const val = target.value;
                const pos = target.selectionStart;
                const textBeforeCursor = val.substring(0, pos);
    
                // Natural Language Date conversion: @date followed by space/newline
                const dateMatch = textBeforeCursor.match(/@([^@\n\s]+(?: [^@\n\s]+)*)([\s\n])$/);
                if (dateMatch) {
                    const rawDate = dateMatch[1];
                    const terminator = dateMatch[2];
                    const parsed = parseNaturalDate(rawDate);
                    if (parsed) {
                        const matchStart = dateMatch.index!;
                        const before = val.substring(0, matchStart);
                        const after = val.substring(pos);
                        const insertText = `[[${parsed}]]${terminator}`;
                        target.value = before + insertText + after;
                        this.view.content = target.value;
                        const newPos = matchStart + insertText.length;
                        target.setSelectionRange(newPos, newPos);
                        lastValue = target.value;
                        return;
                    }
                }
    
                if (val.length > lastValue.length) {
                    const cursorPosition = target.selectionStart;
                    if (cursorPosition >= 2 && val.substring(cursorPosition - 2, cursorPosition) === '[[') {
                        new FileSuggestModal(this.view.plugin.app, (file) => {
                            const before = val.substring(0, cursorPosition - 2); const after = val.substring(cursorPosition); const insertText = `[[${file.basename}]]`;
                            target.value = before + insertText + after; this.view.content = target.value;
                            setTimeout(() => { target.focus(); target.setSelectionRange(before.length + insertText.length, before.length + insertText.length); }, 50);
                        }, this.view.plugin.settings.newNoteFolder).open();
                    } else if (cursorPosition > 0 && val.charAt(cursorPosition - 1) === '#') {
                        new ContextSuggestModal(this.view.plugin.app, this.view.plugin.settings.contexts, async (ctx) => {
                            if (!this.view.plugin.settings.contexts.includes(ctx)) {
                                this.view.plugin.settings.contexts.push(ctx);
                                await this.view.plugin.saveSettings();
                            }
                            if (!this.view.selectedContexts.includes(ctx)) {
                                this.view.selectedContexts.push(ctx);
                                this.view.plugin.settings.selectedContexts = [...this.view.selectedContexts];
                                await this.view.plugin.saveSettings();
                            }
                            const before = val.substring(0, cursorPosition - 1);
                            const after = val.substring(cursorPosition);
                            target.value = before + after;
                            this.view.content = target.value;
    
                            setTimeout(() => { target.focus(); target.setSelectionRange(before.length, before.length); }, 50);
                        }).open();
                    }
                }
                const converted = val.replace(/^\+ /gm, '- [ ] '); if (converted !== val) { const cursor = target.selectionStart; const diff = converted.length - val.length; target.value = converted; target.setSelectionRange(cursor + diff, cursor + diff); }
                lastValue = target.value; this.view.content = target.value;
            });
            textArea.addEventListener('keydown', (ev) => { });
            textArea.addEventListener('paste', async (e: ClipboardEvent) => { e.stopPropagation(); if (e.clipboardData && e.clipboardData.files.length > 0) { let hasImage = false; for (let i = 0; i < e.clipboardData.items.length; i++) { if (e.clipboardData.items[i].type.indexOf('image') !== -1) { hasImage = true; break; } } if (hasImage) { e.preventDefault(); await this.view.handleFiles(e.clipboardData.files); } } });
            textArea.addEventListener('dragover', (e) => { e.stopPropagation(); e.preventDefault(); });
            textArea.addEventListener('drop', async (e: DragEvent) => { e.stopPropagation(); if (e.dataTransfer && e.dataTransfer.files.length > 0) { e.preventDefault(); await this.view.handleFiles(e.dataTransfer.files); } });
            textAreaWrapper.style.position = 'relative';
            const fileInput = textAreaWrapper.createEl('input', { attr: { type: 'file', multiple: '', style: 'display:none;', accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*' } }) as HTMLInputElement;
            fileInput.addEventListener('change', async () => { if (fileInput.files && fileInput.files.length > 0) { await this.view.handleFiles(fileInput.files); fileInput.value = ''; } });
            const attachBtn = textAreaWrapper.createEl('button', { attr: { title: 'Attach image or file', style: 'position:absolute; bottom:6px; right:34px; background:transparent; border:none; color:var(--text-muted); opacity:0.5; padding:2px 4px; cursor:pointer; font-size:1em; line-height:1; transition:opacity 0.15s; z-index:1' } });
            attachBtn.textContent = '📎'; attachBtn.addEventListener('mouseenter', () => attachBtn.style.opacity = '1'); attachBtn.addEventListener('mouseleave', () => attachBtn.style.opacity = '0.5'); attachBtn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
            const submitBtn = inputSection.createEl('button', { text: 'Sync', attr: { style: 'background-color: var(--interactive-accent); color: var(--text-on-accent); padding: 8px 16px; height: 100%; min-height: 40px;' } });
            const controlsDiv = container.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 15px;' } });
    
            if (!isThoughtsOnly && !isTasksOnly) {
                const taskToggleDiv = controlsDiv.createEl('div', { attr: { style: `display: flex; align-items: center; gap: 8px; ${Platform.isMobile && !isTablet() ? '' : 'margin-left: auto;'}` } });
                const taskCheckbox = taskToggleDiv.createEl('input', { type: 'checkbox', attr: { id: 'is-task-checkbox' } }); taskCheckbox.checked = this.view.isTask;
                taskToggleDiv.createEl('label', { attr: { for: 'is-task-checkbox', style: 'cursor: pointer;' }, text: 'As Task' });
                const dueDateContainer = taskToggleDiv.createEl('div', { attr: { style: `display: ${this.view.isTask ? 'flex' : 'none'}; align-items: center; gap: 5px; margin-left: 10px;` } });
                dueDateContainer.createSpan({ text: 'Due:', attr: { style: 'font-size: 0.85em; color: var(--text-muted);' } });
                const datePicker = dueDateContainer.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
                datePicker.value = this.view.dueDate; datePicker.addEventListener('change', (e) => { this.view.dueDate = (e.target as HTMLInputElement).value; });
                taskCheckbox.addEventListener('change', (e) => { this.view.isTask = (e.target as HTMLInputElement).checked; dueDateContainer.style.display = this.view.isTask ? 'flex' : 'none'; });
            } else if (isTasksOnly) {
                this.view.isTask = true;
                const taskControlsDiv = controlsDiv.createEl('div', { attr: { style: `display: flex; align-items: center; gap: 8px; ${Platform.isMobile && !isTablet() ? '' : 'margin-left: auto;'}` } });
                taskControlsDiv.createSpan({ text: 'Due:', attr: { style: 'font-size: 0.85em; color: var(--text-muted);' } });
                const datePicker = taskControlsDiv.createEl('input', { type: 'date', attr: { style: 'font-size: 0.85em; padding: 2px 5px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); cursor: pointer;' } });
                datePicker.value = this.view.dueDate; datePicker.addEventListener('change', (e) => { this.view.dueDate = (e.target as HTMLInputElement).value; });
            } else this.view.isTask = false;
            const submitAction = async () => {
                if (this.view.content.trim().length > 0) {
                    const contextsToSave = this.view.activeTab === 'journal' ? ['journal'] : (this.view.activeTab === 'grundfos' ? ['Grundfos'] : this.view.selectedContexts);
                    if (this.view.isTask) await this.view.plugin.createTaskFile(this.view.content.trim(), contextsToSave, this.view.dueDate || undefined);
                    else if (this.view.replyToId) { const replied = await this.view.plugin.appendReplyToFile(this.view.replyToId, this.view.content.trim()); if (replied) new Notice('Reply added!'); }
                    else await this.view.plugin.createThoughtFile(this.view.content.trim(), contextsToSave);
                    this.view.content = ''; textArea.value = ''; this.view.replyToId = null; this.view.replyToText = null;
                    if (Platform.isMobile && !isTablet()) { this.view.selectedContexts = []; this.view.plugin.settings.selectedContexts = []; await this.view.plugin.saveSettings(); }
                    this.view.renderView();
                } else new Notice('Please enter some text');
            };
            submitBtn.addEventListener('click', submitAction);
            textArea.addEventListener('keydown', async (e) => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); await submitAction(); } });
        }
    
        renderSearchInput(container: HTMLElement, updateFn: () => void) {
            const searchContainer = container.createEl('div', { attr: { style: `padding: 0 12px 10px 12px; flex-shrink: 0; display: ${this.view.showSearch ? 'block' : 'none'};` } });
            const input = searchContainer.createEl('input', {
                type: 'text',
                attr: {
                    placeholder: 'Search notes...',
                    style: 'width: 100%; font-size: 0.85em; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);'
                }
            });
            input.value = this.view.searchQuery;
            input.addEventListener('input', () => {
                this.view.searchQuery = input.value.toLowerCase();
                updateFn();
            });
        }
    
        refreshCurrentList() {
            if (this.view.activeTab === 'grundfos' || this.view.activeTab === 'journal' || this.view.plugin.settings.customModes.some(m => m.id === this.view.activeTab)) {
                this.view.updateContextList(this.view.activeTab);
            }
            else if (this.view.activeTab === 'focus') this.view.updateFocusList();
            else if (this.view.activeTab === 'review-thoughts') this.view.updateReviewThoughtsList();
            else if (this.view.activeTab === 'review-tasks') this.view.updateReviewTasksList();
            else this.view.renderView();
        }
    
        async renderTaskRow(entry: TaskEntry, container: HTMLElement, hideMetadata: boolean = false) {
            const isDone = entry.status === 'done';
            const row = container.createEl('div', { attr: { style: `display:flex; flex-direction:column; padding:8px; margin-bottom:4px; border-radius:6px; background:var(--background-secondary); opacity:${isDone ? '0.5' : '1'};` } });
            const topRow = row.createEl('div', { attr: { style: 'display:flex; gap:8px; align-items:flex-start;' } });
            const toggleContainer = topRow.createEl('label', { attr: { style: 'position:relative; display:inline-block; width:36px; height:20px; margin-right:4px; margin-top:2px; flex-shrink:0; cursor:pointer;' } });
            const cb = toggleContainer.createEl('input', { type: 'checkbox', attr: { style: 'opacity:0; width:0; height:0; position:absolute;' } }) as HTMLInputElement; cb.checked = isDone;
            const slider = toggleContainer.createEl('span', { attr: { style: `position:absolute; top:0; left:0; right:0; bottom:0; background-color:${isDone ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; transition:.3s; border-radius:20px;` } });
            const knob = toggleContainer.createEl('span', { attr: { style: `position:absolute; height:14px; width:14px; left:3px; bottom:3px; background-color:var(--text-on-accent,white); transition:.3s; border-radius:50%; transform:${isDone ? 'translateX(16px)' : 'translateX(0)'};` } });
            cb.addEventListener('change', async () => { const checked = cb.checked; slider.style.backgroundColor = checked ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'; knob.style.transform = checked ? 'translateX(16px)' : 'translateX(0)'; row.style.opacity = checked ? '0.5' : '1'; await this.view.plugin.toggleTaskStatus(entry.filePath, checked); this.refreshCurrentList(); });
            const content = topRow.createEl('div', { attr: { style: 'flex:1; min-width:0;' } });
            const lineCount = (entry.body || entry.title).split('\n').length;
            const isAutoCompact = !this.view.plugin.settings.isCompactView && lineCount > 10;
    
            const textClasses = [];
            if (this.view.plugin.settings.isCompactView) textClasses.push('mina-card-compact');
            else if (isAutoCompact) textClasses.push('mina-card-auto-compact');
    
            const textEl = content.createEl('div', { cls: textClasses.join(' '), attr: { style: `word-break:break-word; font-size:0.95em; line-height:1.4; ${isDone ? 'text-decoration:line-through; opacity:0.7;' : ''}` } });
            await MarkdownRenderer.render(this.view.plugin.app, entry.body || entry.title, textEl, entry.filePath, this.view);
            this.hookInternalLinks(textEl, entry.filePath); this.hookImageZoom(textEl);
            const firstP = textEl.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }
    
            if (this.view.plugin.settings.isCompactView || isAutoCompact) {
                const toggle = content.createEl('div', { text: 'Show more', cls: 'mina-expand-toggle' });
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isCurrentlyCompact = textEl.classList.contains('mina-card-compact') || textEl.classList.contains('mina-card-auto-compact');
                    if (isCurrentlyCompact) {
                        textEl.classList.remove('mina-card-compact');
                        textEl.classList.remove('mina-card-auto-compact');
                        textEl.classList.add('mina-card-expanded');
                        toggle.setText('Show less');
                    } else {
                        if (this.view.plugin.settings.isCompactView) textEl.classList.add('mina-card-compact');
                        else textEl.classList.add('mina-card-auto-compact');
                        textEl.classList.remove('mina-card-expanded');
                        toggle.setText('Show more');
                    }
                });
            }
    
            const isTaskMode = this.view.activeTab === 'review-tasks' && this.view.isDedicated;
            if (isTaskMode && entry.due) {
                const dueM = moment(entry.due, 'YYYY-MM-DD', true);
                const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(moment().startOf('day'), 'day');
                const inlineDue = textEl.createSpan({
                    text: `  📅 ${entry.due}`,
                    attr: { style: `font-size:0.8em; color:${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; ${isOverdue ? 'font-weight:600;' : ''}` }
                });
                if (isOverdue) inlineDue.createSpan({ text: ' ⚠', attr: { style: 'font-size:0.8em; color:var(--text-error);' } });
            }
    
            const actions = topRow.createEl('div', { attr: { style: 'display:flex; gap:4px; align-items:flex-start; flex-shrink:0;' } });
            const editBtn = actions.createEl('span', { text: '✏️', attr: { style: 'cursor:pointer; font-size:0.85em; opacity:0.7; transition:opacity 0.2s;', title: 'Edit' } });
            const delBtn = actions.createEl('span', { text: '🗑️', attr: { style: 'cursor:pointer; font-size:0.85em; opacity:0.7; transition:opacity 0.2s;', title: 'Delete' } });
            editBtn.addEventListener('click', () => {
                new EditEntryModal(this.view.plugin.app, this.view.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), entry.due || null, true, async (newText, newCtxStr, newDue) => {
                    const ctxArr = newCtxStr ? newCtxStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : [];
                    await this.view.plugin.editTaskBody(entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                    this.refreshCurrentList();
                }).open();
            });
            delBtn.addEventListener('click', () => { new ConfirmModal(this.view.plugin.app, 'Move this task to trash?', async () => { await this.view.plugin.deleteTaskFile(entry.filePath); this.refreshCurrentList(); }).open(); });
    
            if (!hideMetadata && !isTaskMode) {
                const metaRow = row.createEl('div', { attr: { style: 'display:flex; justify-content:space-between; align-items:center; margin-top:5px; flex-wrap:wrap; gap:4px;' } });
                const dueLeft = metaRow.createEl('div', { attr: { style: 'display:flex; align-items:center; gap:4px;' } });
                if (entry.due) {
                    const dueM = moment(entry.due, 'YYYY-MM-DD', true); const isOverdue = !isDone && dueM.isValid() && dueM.isBefore(moment().startOf('day'), 'day');
                    dueLeft.createEl('span', { text: `📅 ${entry.due}`, attr: { style: `font-size:0.8em; color:${isOverdue ? 'var(--text-error)' : 'var(--text-muted)'}; ${isOverdue ? 'font-weight:600;' : ''}` } });
                    if (isOverdue) dueLeft.createEl('span', { text: '⚠', attr: { style: 'font-size:0.8em; color:var(--text-error);' } });
                }
                const ctxRight = metaRow.createEl('div', { attr: { style: 'display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end;' } });
                for (const ctx of entry.context) ctxRight.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size:0.8em; color:var(--text-accent); background:var(--background-secondary-alt); padding:1px 6px; border-radius:4px;' } });
            }
        }
    
        async renderThoughtRow(entry: ThoughtEntry, container: HTMLElement, filePath: string, level: number = 0, hideAvatar: boolean = false, hideMetadata: boolean = false, blur?: boolean) {
            const isCollapsed = this.view.collapsedThreads.has(entry.filePath); const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24;
            const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 3px; padding-bottom: 3px; display: flex; align-items: flex-start; ${level > 0 ? `margin-left: ${level * indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 6px;` : ''}` } });
    
            // Icon Section
            const iconWidth = hideAvatar && level === 0 ? (entry.children.length > 0 ? 16 : 0) : 28;
            const iconSection = itemEl.createEl('div', { attr: { style: `width: ${iconWidth}px; margin-right: ${iconWidth > 0 ? 6 : 0}px; margin-top: 2px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2px;` } });
    
            if (level === 0 && entry.children.length > 0) {
                const collapseBtn = iconSection.createEl('div', { text: isCollapsed ? '▶' : '▼', attr: { style: 'cursor: pointer; font-size: 0.7em; opacity: 0.5; transition: 0.2s;' } });
                collapseBtn.addEventListener('click', () => { if (isCollapsed) this.view.collapsedThreads.delete(entry.filePath); else this.view.collapsedThreads.add(entry.filePath); this.refreshCurrentList(); });
            }
    
            if (level === 0 && !hideAvatar) {
                const iconContainer = iconSection.createEl('div', { attr: { style: 'width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0;' } });
                const img = iconContainer.createEl('img', { attr: { style: 'width: 100%; height: 100%; display: block;' } }); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NINJA_AVATAR_SVG)}`;
            }
    
            if (level === 0 && entry.children.length > 0 && !hideAvatar) iconSection.createEl('div', { text: `${entry.children.length}`, attr: { style: 'font-size: 0.65em; color: var(--text-accent); font-weight: bold; background: var(--background-secondary-alt); padding: 1px 4px; border-radius: 4px; margin-top: 2px;' } });
            const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });
            const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; margin-bottom: 0; position: relative;' } });
            const cardWrapper = mainContentRow.createEl('div', { attr: { style: 'position: relative; flex-grow: 1; min-width: 0;' } });
    
            const isBlurred = blur ?? this.view.plugin.settings.blurredNotes.includes(entry.filePath);
            const lineCount = entry.body.split('\n').length;
            const isAutoCompact = !this.view.plugin.settings.isCompactView && lineCount > 10;
    
            const cardClasses = ['mina-card'];
            if (isBlurred) cardClasses.push('mina-blurred');
            if (this.view.plugin.settings.isCompactView) cardClasses.push('mina-card-compact');
            else if (isAutoCompact) cardClasses.push('mina-card-auto-compact');
    
            const renderTarget = cardWrapper.createEl('div', {
                cls: cardClasses.join(' '),
                attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word;' }
            });
            renderTarget.createEl('span', { text: `${entry.day} ${entry.created.split(' ')[1] || ''}`, attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.7; margin-left: 8px;' } });
            await MarkdownRenderer.render(this.view.plugin.app, entry.body, renderTarget, filePath, this.view);
            this.hookInternalLinks(renderTarget, filePath); this.hookImageZoom(renderTarget); this.hookCheckboxes(renderTarget, entry);
            const firstP = renderTarget.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }
    
            if (this.view.plugin.settings.isCompactView || isAutoCompact) {
                const toggle = cardWrapper.createEl('div', { text: 'Show more', cls: 'mina-expand-toggle' });
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isCurrentlyCompact = renderTarget.classList.contains('mina-card-compact') || renderTarget.classList.contains('mina-card-auto-compact');
                    if (isCurrentlyCompact) {
                        renderTarget.classList.remove('mina-card-compact');
                        renderTarget.classList.remove('mina-card-auto-compact');
                        renderTarget.classList.add('mina-card-expanded');
                        toggle.setText('Show less');
                    } else {
                        if (this.view.plugin.settings.isCompactView) renderTarget.classList.add('mina-card-compact');
                        else renderTarget.classList.add('mina-card-auto-compact');
                        renderTarget.classList.remove('mina-card-expanded');
                        toggle.setText('Show more');
                    }
                });
            }
    
            const actionsDiv = cardWrapper.createEl('div', { attr: { style: 'position: absolute; top: 2px; right: 4px; display: flex; gap: 6px; align-items: center; opacity: 0; transition: opacity 0.15s; background: var(--background-secondary); border-radius: 4px; padding: 1px 4px;' } });
            cardWrapper.addEventListener('mouseenter', () => actionsDiv.style.opacity = '1'); cardWrapper.addEventListener('mouseleave', () => actionsDiv.style.opacity = '0');
    
            const pinBtn = actionsDiv.createSpan({
                text: entry.pinned ? '📌' : '📍',
                attr: { style: 'cursor: pointer; font-size: 0.8em;', title: entry.pinned ? 'Unpin' : 'Pin' }
            });
            pinBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.view.plugin.toggleThoughtPin(entry.filePath, !entry.pinned);
            });
    
            const blurBtn = actionsDiv.createSpan({
                text: isBlurred ? '👁️‍🗨️' : '👁️',
                attr: { style: 'cursor: pointer; font-size: 0.8em;', title: isBlurred ? 'Unblur' : 'Blur' }
            });
            blurBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (isBlurred) {
                    this.view.plugin.settings.blurredNotes = this.view.plugin.settings.blurredNotes.filter(p => p !== entry.filePath);
                } else {
                    this.view.plugin.settings.blurredNotes.push(entry.filePath);
                }
                await this.view.plugin.saveSettings();
                this.refreshCurrentList();
            });
    
            const openBtn = actionsDiv.createSpan({ text: '🔗', attr: { style: 'cursor: pointer; font-size: 0.8em;', title: 'Open file' } }); openBtn.addEventListener('click', () => { this.view.plugin.app.workspace.openLinkText(entry.filePath, '', 'window'); });
            const replyBtn = actionsDiv.createSpan({ text: '↩️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
            const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
            const convertBtn = actionsDiv.createSpan({ text: '📋', attr: { style: 'cursor: pointer; font-size: 0.8em;', title: 'Convert to task' } });
            const deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
            deleteBtn.addEventListener('click', async () => { new ConfirmModal(this.view.plugin.app, 'Move this thought to trash?', async () => { await this.view.plugin.deleteThoughtFile(entry.filePath); this.refreshCurrentList(); }).open(); });
            replyBtn.addEventListener('click', () => { this.view.replyToId = entry.filePath; this.view.replyToText = entry.body.length > 50 ? entry.body.substring(0, 50) + '...' : entry.body; this.view.showCaptureInThoughts = true; this.view.renderView(); setTimeout(() => { const ta = this.view.containerEl.querySelector('textarea'); if (ta) (ta as HTMLTextAreaElement).focus(); }, 100); });
            const startEdit = () => { new EditEntryModal(this.view.plugin.app, this.view.plugin, entry.body, entry.context.map(c => `#${c}`).join(' '), null, false, async (newText, newContextStr) => { const newContexts = newContextStr ? newContextStr.split('#').map(c => c.trim()).filter(c => c.length > 0) : []; await this.view.plugin.editThoughtBody(entry.filePath, newText.replace(/<br>/g, '\n'), newContexts); this.refreshCurrentList(); }).open(); };
            renderTarget.addEventListener('dblclick', startEdit); editBtn.addEventListener('click', startEdit);
            convertBtn.addEventListener('click', () => { new ConvertToTaskModal(this.view.plugin.app, entry.body, entry.context, async (dueDate) => { await this.view.plugin.createTaskFile(entry.body.replace(/<br>/g, '\n'), entry.context, dueDate || undefined); const updatedContexts = [...new Set([...entry.context, 'converted_to_tasks'])]; await this.view.plugin.editThoughtBody(entry.filePath, entry.body.replace(/<br>/g, '\n'), updatedContexts); new Notice('✅ Thought converted to task!'); this.refreshCurrentList(); }).open(); });
    
            if (!hideMetadata && entry.context.length > 0) {
                const ctxRow = renderTarget.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;' } }); for (const ctx of entry.context) ctxRow.createEl('span', { text: `#${ctx}`, attr: { style: 'font-size: 0.75em; color: var(--text-accent); font-weight: 500; background-color: var(--background-secondary-alt); padding: 2px 6px; border-radius: 4px;' } });
            }
    
            if (level === 0 && !isCollapsed && entry.children.length > 0) { for (const reply of entry.children) await this.renderReplyRow(reply, entry, container, isBlurred); }
        }
    
        async renderReplyRow(reply: ReplyEntry, parent: ThoughtEntry, container: HTMLElement, blur?: boolean) {
            const indentStep = (Platform.isMobile && !isTablet()) ? 12 : 24; const itemEl = container.createEl('div', { attr: { style: `margin-bottom: 3px; padding-bottom: 3px; display: flex; align-items: flex-start; margin-left: ${indentStep}px; border-left: 2px solid var(--background-modifier-border); padding-left: 6px;` } });
            const contentDiv = itemEl.createEl('div', { attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; min-width: 0;' } });
            const mainContentRow = contentDiv.createEl('div', { attr: { style: 'display: flex; margin-bottom: 0; position: relative;' } });
            const cardWrapper = mainContentRow.createEl('div', { attr: { style: 'position: relative; flex-grow: 1; min-width: 0;' } });
    
            const isBlurred = blur ?? this.view.plugin.settings.blurredNotes.includes(parent.filePath);
            const renderTarget = cardWrapper.createEl('div', { cls: 'mina-card' + (isBlurred ? ' mina-blurred' : ''), attr: { style: 'cursor: text; font-size: 0.95em; line-height: 1.4; color: var(--text-normal); word-break: break-word;' } });
            renderTarget.createEl('span', { text: `${reply.date} ${reply.time}`, attr: { style: 'float: right; font-size: 0.65em; color: var(--text-muted); opacity: 0.7; margin-left: 8px;' } });
            await MarkdownRenderer.render(this.view.plugin.app, reply.text, renderTarget, parent.filePath, this.view);
            this.hookInternalLinks(renderTarget, parent.filePath); this.hookImageZoom(renderTarget);
            const firstP = renderTarget.querySelector('p'); if (firstP) { firstP.style.marginTop = '0'; firstP.style.marginBottom = '0'; }
            const actionsDiv = cardWrapper.createEl('div', { attr: { style: 'position: absolute; top: 2px; right: 4px; display: flex; gap: 6px; align-items: center; opacity: 0; transition: opacity 0.15s; background: var(--background-secondary); border-radius: 4px; padding: 1px 4px;' } });
            cardWrapper.addEventListener('mouseenter', () => actionsDiv.style.opacity = '1'); cardWrapper.addEventListener('mouseleave', () => actionsDiv.style.opacity = '0');
            const editBtn = actionsDiv.createSpan({ text: '✏️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
            const deleteBtn = actionsDiv.createSpan({ text: '🗑️', attr: { style: 'cursor: pointer; font-size: 0.8em;' } });
            deleteBtn.addEventListener('click', async () => { new ConfirmModal(this.view.plugin.app, 'Delete this reply?', async () => { await this.view.plugin.deleteReply(parent.filePath, reply.anchor); this.refreshCurrentList(); }).open(); });
            const startReplyEdit = () => { new EditEntryModal(this.view.plugin.app, this.view.plugin, reply.text, '', null, false, async (newText) => { await this.view.plugin.editReply(parent.filePath, reply.anchor, newText.replace(/<br>/g, '\n')); this.refreshCurrentList(); }).open(); };
            renderTarget.addEventListener('dblclick', startReplyEdit); editBtn.addEventListener('click', startReplyEdit);
        }
    
    
}
