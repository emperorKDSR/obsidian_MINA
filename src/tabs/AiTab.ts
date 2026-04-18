import { moment, Platform, Notice, MarkdownRenderer, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { isTablet } from '../utils';
import { AiSettingsModal } from '../modals/AiSettingsModal';

export class AiTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderMinaMode(container);
    }

    async renderMinaMode(container: HTMLElement) {
        container.empty();
        if (!this.view.plugin.settings.geminiApiKey) {
            container.createEl('div', { 
                text: '⚠️ No Gemini API key set.', 
                attr: { style: 'padding: 40px; color: var(--text-muted); text-align: center; font-style: italic;' } 
            });
            return;
        }

        const isMobilePhone = Platform.isMobile && !isTablet();
        
        // Main Wrapper with structured flex layout
        const wrap = container.createEl('div', {
            attr: {
                style: 'display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--background-primary);'
            }
        });

        // 1. Header (consistent with other modes)
        const header = wrap.createEl('div', {
            attr: { style: 'padding: 16px 14px 10px 14px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; border-bottom: 1px solid var(--background-modifier-border-faint);' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', {
            text: 'AI Chat',
            attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' }
        });

        const headerActions = titleRow.createEl('div', { attr: { style: 'display: flex; gap: 8px;' } });
        
        const smallBtnStyle = 'background: transparent; border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.65em; padding: 2px 8px; color: var(--text-muted); cursor: pointer; font-weight: 600; transition: all 0.2s;';
        
        const newChatBtn = headerActions.createEl('button', {
            text: 'New Chat',
            attr: { style: smallBtnStyle }
        });
        const recallBtn = headerActions.createEl('button', {
            text: 'History',
            attr: { style: smallBtnStyle }
        });
        const configBtn = headerActions.createEl('button', {
            text: 'Config',
            attr: { style: smallBtnStyle }
        });

        configBtn.addEventListener('click', () => {
            new AiSettingsModal(this.app, this.view.plugin).open();
        });

        // 2. Grounded Notes Bar (modern chips)
        const groundedBar = wrap.createEl('div', { 
            attr: { style: 'flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 8px 14px; overflow-x: auto; background: var(--background-secondary-alt); border-bottom: 1px solid var(--background-modifier-border-faint); min-height: 40px; scrollbar-width: none;' } 
        });
        this.view.groundedNotesBar = groundedBar;

        const refreshGroundedBar = () => {
            groundedBar.empty();
            if (this.view.groundedNotes.length === 0 && !this.view.webSearchEnabled) {
                groundedBar.createSpan({ text: 'No notes grounded.', attr: { style: 'font-size: 0.75em; color: var(--text-muted); opacity: 0.6;' } });
            }

            this.view.groundedNotes.forEach(file => {
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(file.extension.toLowerCase());
                const chip = groundedBar.createEl('span', {
                    attr: { style: 'display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 12px; font-size: 0.75em; background: var(--background-primary); border: 1px solid var(--background-modifier-border); color: var(--text-normal); cursor: pointer; white-space: nowrap;' }
                });
                chip.createSpan({ text: (isImage ? '🖼️ ' : '📄 ') + file.basename });
                chip.addEventListener('click', () => { this.view.app.workspace.openLinkText(file.path, '', 'window'); });
                
                const unpin = chip.createSpan({ 
                    text: '×', 
                    attr: { style: 'margin-left: 4px; opacity: 0.4; cursor: pointer; font-weight: bold; font-size: 1.2em; line-height: 1;' } 
                });
                unpin.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.view.groundedNotes = this.view.groundedNotes.filter(f => f.path !== file.path);
                    refreshGroundedBar();
                });
            });

            const webChip = groundedBar.createEl('span', {
                attr: { style: `margin-left: auto; display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 12px; font-size: 0.75em; cursor: pointer; font-weight: 600; border: 1px solid ${this.view.webSearchEnabled ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'}; background: ${this.view.webSearchEnabled ? 'var(--interactive-accent)' : 'transparent'}; color: ${this.view.webSearchEnabled ? 'var(--text-on-accent)' : 'var(--text-muted)'};` }
            });
            webChip.setText('🌐 Web Search');
            webChip.addEventListener('click', () => { this.view.webSearchEnabled = !this.view.webSearchEnabled; refreshGroundedBar(); });
        };
        refreshGroundedBar();

        // 3. Chat History (Scrollable)
        this.view.chatContainer = wrap.createEl('div', { 
            attr: { style: `flex-grow: 1; min-height: 0; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 16px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;` } 
        });
        await this.renderChatHistory();

        // 4. Modern Chat Input Area
        const inputAreaWrap = wrap.createEl('div', {
            attr: { style: 'flex-shrink: 0; padding: 12px 14px 24px 14px; background: var(--background-primary); border-top: 1px solid var(--background-modifier-border-faint);' }
        });

        const inputContainer = inputAreaWrap.createEl('div', {
            attr: { style: 'position: relative; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 20px; padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.2s; max-width: 800px; margin: 0 auto;' }
        });

        const textarea = inputContainer.createEl('textarea', {
            attr: { 
                placeholder: 'Ask MINA…', 
                style: 'width: 100%; min-height: 24px; max-height: 180px; font-size: 0.95em; line-height: 1.5; font-family: var(--font-text); border: none; background: transparent; color: var(--text-normal); resize: none; padding: 4px 0; outline: none; box-shadow: none; flex-grow: 1;' 
            }
        });

        const inputActions = inputContainer.createEl('div', {
            attr: { style: 'display: flex; align-items: center; justify-content: space-between; padding-top: 4px;' }
        });

        const leftActions = inputActions.createEl('div', { attr: { style: 'display: flex; gap: 12px; align-items: center;' } });
        const rightActions = inputActions.createEl('div', { attr: { style: 'display: flex; gap: 8px; align-items: center;' } });

        const iconBtnStyle = 'background: transparent; border: none; padding: 4px; color: var(--text-muted); cursor: pointer; transition: color 0.2s; display: flex; align-items: center; justify-content: center;';
        
        const attachBtn = leftActions.createEl('button', { 
            attr: { title: 'Attach Note or Image', style: iconBtnStyle } 
        });
        attachBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>';

        const saveSessionBtn = leftActions.createEl('button', {
            attr: { title: 'Save Session', style: iconBtnStyle }
        });
        saveSessionBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';

        const sendBtn = rightActions.createEl('button', {
            attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 6px 12px; border-radius: 12px; cursor: pointer; transition: transform 0.1s; display: flex; align-items: center; justify-content: center; opacity: 0.5;' }
        });
        sendBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

        // Event handlers
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
            sendBtn.style.opacity = textarea.value.trim() ? '1' : '0.5';
        });

        textarea.addEventListener('focus', () => {
            inputContainer.style.borderColor = 'var(--interactive-accent)';
        });
        textarea.addEventListener('blur', () => {
            inputContainer.style.borderColor = 'var(--background-modifier-border)';
        });

        const send = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            textarea.value = '';
            textarea.style.height = 'auto';
            textarea.disabled = true;
            sendBtn.style.opacity = '0.5';
            
            this.view.chatHistory.push({ role: 'user', text });
            await this.renderChatHistory();
            await this.saveChatSession();
            
            const thinkingRow = this.view.chatContainer.createEl('div', { attr: { style: 'display: flex; gap: 8px; align-items: center; padding: 4px 10px;' } });
            thinkingRow.createSpan({ text: '🤖', attr: { style: 'font-size: 1.2em;' } });
            thinkingRow.createSpan({ text: 'Thinking…', attr: { style: 'font-size: 0.85em; color: var(--text-muted); font-style: italic;' } });
            
            this.view.chatContainer.scrollTop = this.view.chatContainer.scrollHeight;

            try {
                const reply = await this.view.callGemini(text, [...this.view.groundedNotes], this.view.webSearchEnabled);
                thinkingRow.remove();
                this.view.chatHistory.push({ role: 'assistant', text: reply });
            } catch (e: any) {
                thinkingRow.remove();
                this.view.chatHistory.push({ role: 'assistant', text: `⚠️ Error: ${e.message}` });
            }
            
            await this.renderChatHistory();
            await this.saveChatSession();
            textarea.disabled = false;
            if (!isMobilePhone) textarea.focus();
        };

        sendBtn.addEventListener('click', send);
        textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

        // Attachment handlers
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';
        fileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*';
        
        const handleChatFiles = async (files: FileList) => {
            const attachmentFolder = '998 Attachments';
            const { vault } = this.view.plugin.app;
            if (!vault.getAbstractFileByPath(attachmentFolder)) await vault.createFolder(attachmentFolder);

            for (let i = 0; i < files.length; i++) {
                const file = files[i]; if (!file || file.size === 0) continue;
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const extension = file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png');
                    const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : `AI Attachment ${moment().format('YYYYMMDDHHmmss')}`;
                    const fileName = `${baseName}.${extension}`;
                    let finalPath = await this.view.plugin.app.fileManager.getAvailablePathForAttachment(fileName);
                    const newFile = await vault.createBinary(finalPath, arrayBuffer);
                    if (!this.view.groundedNotes.some(f => f.path === newFile.path)) {
                        this.view.groundedNotes.push(newFile);
                        refreshGroundedBar();
                    }
                    new Notice(`Grounded: ${newFile.name}`);
                } catch (err) { new Notice('Failed to ground file.'); }
            }
        };

        fileInput.addEventListener('change', async () => { if (fileInput.files) await handleChatFiles(fileInput.files); fileInput.value = ''; });
        attachBtn.addEventListener('click', () => fileInput.click());

        textarea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.files.length > 0) {
                e.preventDefault();
                await handleChatFiles(e.clipboardData.files);
            }
        });

        // Mention Note handler
        textarea.addEventListener('input', (e) => {
            const target = e.target as HTMLTextAreaElement;
            const pos = target.selectionStart;
            if (pos >= 2 && target.value.substring(pos - 2, pos) === '[[') {
                import('../modals/NotePickerModal').then(({ NotePickerModal }) => {
                    new NotePickerModal(this.view.plugin.app, (file) => {
                        if (!this.view.groundedNotes.some(f => f.path === file.path)) {
                            this.view.groundedNotes.push(file);
                            refreshGroundedBar();
                        }
                        const before = target.value.substring(0, pos - 2);
                        const after = target.value.substring(pos);
                        target.value = before + after;
                        target.focus();
                        target.setSelectionRange(before.length, before.length);
                    }).open();
                });
            }
        });

        // Header Action handlers
        newChatBtn.addEventListener('click', () => {
            this.view.chatHistory = [];
            this.view.currentChatFile = null;
            this.renderChatHistory();
        });

        recallBtn.addEventListener('click', () => {
            const folder = this.view.plugin.settings.aiChatFolder.trim() || '000 Bin/MINA V2 AI Chat';
            const files = this.view.plugin.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + '/'));
            if (files.length === 0) {
                new Notice('No saved chat sessions found');
                return;
            }
            import('../modals/ChatSessionPickerModal').then(({ ChatSessionPickerModal }) => {
                new ChatSessionPickerModal(this.view.plugin.app, files, async (file) => {
                    const content = await this.view.plugin.app.vault.read(file);
                    this.view.chatHistory = this.view.parseChatSession(content) as any;
                    this.view.currentChatFile = file.path;
                    await this.renderChatHistory();
                    new Notice(`Loaded: ${file.basename}`);
                }).open();
            });
        });

        saveSessionBtn.addEventListener('click', async () => {
            await this.saveChatSession();
            new Notice('Chat session saved');
        });

        if (!Platform.isMobile) setTimeout(() => textarea.focus(), 50);
    }

    async renderChatHistory() {
        if (!this.view.chatContainer) return;
        const container = this.view.chatContainer;
        container.empty();

        if (this.view.chatHistory.length === 0) {
            const welcome = container.createEl('div', { 
                attr: { style: 'flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; opacity: 0.5; padding-bottom: 40px;' } 
            });
            welcome.createSpan({ text: '🤖', attr: { style: 'font-size: 3em;' } });
            welcome.createEl('p', { text: 'Ask MINA anything.', attr: { style: 'margin: 0; font-size: 0.9em; font-weight: 600;' } });
            return;
        }

        for (const msg of this.view.chatHistory) {
            const isUser = msg.role === 'user';
            const row = container.createEl('div', { 
                attr: { style: `display: flex; flex-direction: column; align-items: ${isUser ? 'flex-end' : 'flex-start'}; margin-bottom: 4px; width: fit-content; align-self: ${isUser ? 'flex-end' : 'flex-start'};` } 
            });

            const bubble = row.createEl('div', { 
                attr: { 
                    style: `max-width: 85vw; padding: 10px 14px; border-radius: 18px; position: relative; font-size: 0.95em; line-height: 1.5; 
                    background: ${isUser ? 'var(--interactive-accent)' : 'var(--background-secondary-alt)'}; 
                    color: ${isUser ? 'var(--text-on-accent)' : 'var(--text-normal)'};
                    border: 1px solid ${isUser ? 'transparent' : 'var(--background-modifier-border-faint)'};
                    ${isUser ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'}` 
                } 
            });

            const textContent = bubble.createEl('div', { attr: { style: 'overflow-wrap: break-word;' } });
            if (isUser) {
                textContent.setText(msg.text);
            } else {
                await MarkdownRenderer.render(this.view.plugin.app, msg.text, textContent, '', this.view);
                this.hookInternalLinks(textContent, '');
                this.hookImageZoom(textContent);
            }

            // Small discrete actions on hover
            const actions = row.createEl('div', { 
                attr: { style: 'display: flex; gap: 8px; margin-top: 4px; opacity: 0; transition: opacity 0.2s; padding: 0 4px;' } 
            });
            row.addEventListener('mouseenter', () => actions.style.opacity = '1');
            row.addEventListener('mouseleave', () => actions.style.opacity = '0');

            const smallActionStyle = 'font-size: 0.7em; color: var(--text-muted); cursor: pointer; font-weight: 600; opacity: 0.6;';
            
            const copyBtn = actions.createEl('span', { text: 'Copy', attr: { style: smallActionStyle } });
            copyBtn.addEventListener('click', async () => {
                await navigator.clipboard.writeText(msg.text);
                new Notice('Copied');
            });

            if (!isUser) {
                const saveAsThoughtBtn = actions.createEl('span', { text: 'Save as Thought', attr: { style: smallActionStyle } });
                saveAsThoughtBtn.addEventListener('click', async () => {
                    await this.view.plugin.createThoughtFile(msg.text, ['ai-response']);
                    new Notice('Saved as thought');
                });
            }
        }
        container.scrollTop = container.scrollHeight;
    }

    async saveChatSession() {
        if (this.view.chatHistory.length === 0) return;
        const s = this.view.plugin.settings;
        const folder = s.aiChatFolder.trim() || '000 Bin/MINA V2 AI Chat';
        const { vault } = this.view.plugin.app;

        if (!vault.getAbstractFileByPath(folder)) {
            const parts = folder.split('/');
            let currentPath = '';
            for (const part of parts) {
                currentPath += (currentPath ? '/' : '') + part;
                if (!vault.getAbstractFileByPath(currentPath)) await vault.createFolder(currentPath);
            }
        }

        if (!this.view.currentChatFile) {
            this.view.currentChatFile = `${folder}/MINA Chat ${moment().format('YYYY-MM-DD HHmm')}.md`;
        }

        let content = `---\ntitle: "AI Chat ${moment().format('YYYY-MM-DD HH:mm')}"\ncreated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n---\n\n`;

        const allSources = new Set<string>();
        this.view.chatHistory.forEach(msg => msg.sources?.forEach(src => allSources.add(src)));

        if (allSources.size > 0) {
            content += `### Session Grounding Sources\n`;
            allSources.forEach(src => content += `- [[${src}]]\n`);
            content += `\n---\n\n`;
        }

        for (const msg of this.view.chatHistory) {
            const role = msg.role === 'user' ? 'You' : 'MINA';
            content += `**${role}:** ${msg.text}\n\n`;
            if (msg.sources && msg.sources.length > 0) {
                content += `*Sources: ${msg.sources.map(s => `[[${s}]]`).join(', ')}*\n\n`;
            }
            content += `---\n\n`;
        }

        const file = vault.getAbstractFileByPath(this.view.currentChatFile);
        if (file instanceof TFile) await vault.modify(file, content);
        else await vault.create(this.view.currentChatFile, content);
    }
}
