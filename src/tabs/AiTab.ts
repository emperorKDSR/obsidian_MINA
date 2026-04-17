import { isTablet } from '../utils';
import { MarkdownRenderer } from 'obsidian';
import { moment, Platform, Notice, TFile } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";
import { DueEntry } from "../types";
import { PaymentModal } from "../modals/PaymentModal";
import { NewDueModal } from "../modals/NewDueModal";
import { ChatSessionPickerModal } from "../modals/ChatSessionPickerModal";
import { NotePickerModal } from "../modals/NotePickerModal";

export class AiTab extends BaseTab {
    constructor(view: MinaView) { super(view); }
    render(container: HTMLElement) {
        this.renderMinaMode(container);
    }
        async renderMinaMode(container: HTMLElement) {
            if (!this.view.plugin.settings.geminiApiKey) {
                container.createEl('div', { text: '⚠️ No Gemini API key set.', attr: { style: 'padding:20px;color:var(--text-muted);' } });
                return;
            }
    
            const isMobilePhone = Platform.isMobile && !isTablet();
            const wrapper = container.createEl('div', { attr: { style: 'flex-grow:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;' } });
    
            if (this.view.isDedicated) {
                const header = wrapper.createEl('div', {
                    attr: {
                        style: 'display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-primary-alt);'
                    }
                });
                const leftHeader = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
                leftHeader.createEl('h3', {
                    text: this.view.getModeTitle(),
                    attr: { style: 'margin: 0; font-size: 1.1em; color: var(--text-accent);' }
                });
            }
    
            const groundedBar = wrapper.createEl('div', { attr: { style: 'flex-shrink:0;display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;padding:5px 10px;border-bottom:1px solid var(--background-modifier-border);background:var(--background-secondary);' } });
            this.view.groundedNotesBar = groundedBar;
    
            const refreshGroundedBar = () => {
                groundedBar.empty();
                this.view.groundedNotes.forEach(file => {
                    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(file.extension.toLowerCase());
                    const chip = groundedBar.createEl('span', {
                        attr: { style: 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:0.78em;background:var(--background-primary-alt);border:1px solid var(--background-modifier-border);color:var(--text-muted);cursor:pointer;' }
                    });
                    chip.createSpan({ text: (isImage ? '🖼️ ' : '📄 ') + file.basename });
                    chip.addEventListener('click', () => {
                        this.view.app.workspace.openLinkText(file.path, '', 'window');
                    });
                    const unpin = chip.createSpan({ text: '×', attr: { style: 'margin-left:4px;opacity:0.5;cursor:pointer;font-weight:bold;' } });
                    unpin.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.view.groundedNotes = this.view.groundedNotes.filter(f => f.path !== file.path);
                        refreshGroundedBar();
                    });
                });
    
                const webChip = groundedBar.createEl('span', {
                    attr: { style: `margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:12px;font-size:0.78em;cursor:pointer;border:1px solid ${this.view.webSearchEnabled ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};background:${this.view.webSearchEnabled ? 'var(--interactive-accent)' : 'transparent'};color:${this.view.webSearchEnabled ? 'var(--text-on-accent)' : 'var(--text-muted)'};` }
                });
                webChip.setText('🌐 Web');
                webChip.addEventListener('click', () => { this.view.webSearchEnabled = !this.view.webSearchEnabled; refreshGroundedBar(); });
            };
            refreshGroundedBar();
    
            const textarea = document.createElement('textarea');
            textarea.placeholder = 'Ask MINA…';
            textarea.rows = 3;
            textarea.style.cssText = 'width:100%;resize:none;padding:8px 140px 8px 10px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary);color:var(--text-normal);';
    
            const handleChatFiles = async (files: FileList) => {
                const attachmentFolder = '998 Attachments';
                const { vault } = this.view.plugin.app;
                if (!vault.getAbstractFileByPath(attachmentFolder)) {
                    await vault.createFolder(attachmentFolder);
                }
    
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    if (!file || file.size === 0) continue;
                    try {
                        const isImage = file.type.startsWith('image/');
                        const arrayBuffer = await file.arrayBuffer();
                        const extension = file.name.includes('.') ? file.name.split('.').pop() : (file.type.split('/')[1] || 'png');
                        const baseName = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : `AI Attachment ${moment().format('YYYYMMDDHHmmss')}`;
                        const fileName = `${baseName}.${extension}`;
    
                        let finalPath = '';
                        if (isImage) {
                            finalPath = `${attachmentFolder}/${fileName}`;
                            let counter = 1;
                            while (vault.getAbstractFileByPath(finalPath)) {
                                finalPath = `${attachmentFolder}/${baseName} (${counter}).${extension}`;
                                counter++;
                            }
                        } else {
                            finalPath = await this.view.plugin.app.fileManager.getAvailablePathForAttachment(fileName);
                        }
    
                        const newFile = await vault.createBinary(finalPath, arrayBuffer);
                        if (!this.view.groundedNotes.some(f => f.path === newFile.path)) {
                            this.view.groundedNotes.push(newFile);
                            refreshGroundedBar();
                        }
                        new Notice(`Grounded: ${newFile.name}`);
                    } catch (err) {
                        new Notice('Failed to ground file.');
                    }
                }
            };
    
            const fileInput = document.createElement('input');
            fileInput.type = 'file'; fileInput.multiple = true; fileInput.style.display = 'none';
            fileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*';
            fileInput.addEventListener('change', async () => { if (fileInput.files) await handleChatFiles(fileInput.files); fileInput.value = ''; });
    
            const overlayBtns = document.createElement('div');
            overlayBtns.style.cssText = 'position:absolute;bottom:16px;right:16px;display:flex;gap:4px;';
            const attachBtn = overlayBtns.createEl('button', { text: '📎', attr: { title: 'Attach for Grounding', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
            const saveBtn = overlayBtns.createEl('button', { text: '📥', attr: { title: 'Save Session', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
            const recallBtn = overlayBtns.createEl('button', { text: '📂', attr: { title: 'Recall Session', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
            const sendBtn = overlayBtns.createEl('button', { text: '↑',  attr: { style: 'padding:3px 10px;border-radius:5px;background:var(--interactive-accent);color:var(--text-on-accent);border:none;cursor:pointer;' } });
            const newChatBtn = overlayBtns.createEl('button', { text: '🗒️', attr: { title: 'New Chat', style: 'padding:3px 6px;border-radius:5px;background:var(--background-modifier-border);color:var(--text-muted);border:none;cursor:pointer;' } });
    
            const send = async () => {
                const text = textarea.value.trim();
                if (!text) return;
                textarea.value = ''; textarea.disabled = true;
                this.view.chatHistory.push({ role: 'user', text });
                await this.renderChatHistory();
                await this.saveChatSession();
                const thinking = this.view.chatContainer.createEl('div', { text: 'MINA is thinking…', attr: { style: 'font-size:0.85em;color:var(--text-muted);font-style:italic;' } });
                try {
                    const reply = await this.callGemini(text, [...this.view.groundedNotes], this.view.webSearchEnabled);
                    thinking.remove();
                    this.view.chatHistory.push({ role: 'assistant', text: reply });
                } catch (e: any) {
                    thinking.remove();
                    this.view.chatHistory.push({ role: 'assistant', text: `⚠️ Error: ${e.message}` });
                }
                await this.renderChatHistory();
                await this.saveChatSession();
                textarea.disabled = false; if (!isMobilePhone) textarea.focus();
            };
    
            sendBtn.addEventListener('click', send);
            attachBtn.addEventListener('click', () => fileInput.click());
            textarea.addEventListener('paste', async (e: ClipboardEvent) => {
                if (e.clipboardData && e.clipboardData.files.length > 0) {
                    e.preventDefault();
                    await handleChatFiles(e.clipboardData.files);
                }
            });
            textarea.addEventListener('drop', async (e: DragEvent) => {
                if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                    e.preventDefault();
                    await handleChatFiles(e.dataTransfer.files);
                }
            });
            textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
            textarea.addEventListener('input', (e) => {
                const target = e.target as HTMLTextAreaElement;
                const pos = target.selectionStart;
                if (pos >= 2 && target.value.substring(pos - 2, pos) === '[[') {
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
                }
            });
            saveBtn.addEventListener('click', async () => {
                await this.saveChatSession();
                new Notice('Chat session saved');
            });
            recallBtn.addEventListener('click', () => {
                const folder = this.view.plugin.settings.aiChatFolder.trim() || '000 Bin/MINA V2 AI Chat';
                const files = this.view.plugin.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder + '/'));
                if (files.length === 0) {
                    new Notice('No saved chat sessions found');
                    return;
                }
                new ChatSessionPickerModal(this.view.plugin.app, files, async (file) => {
                    const content = await this.view.plugin.app.vault.read(file);
                    this.view.chatHistory = this.parseChatSession(content) as any;
                    this.view.currentChatFile = file.path;
                    await this.renderChatHistory();
                    new Notice(`Loaded: ${file.basename}`);
                }).open();
            });
            newChatBtn.addEventListener('click', () => {
                this.view.chatHistory = [];
                this.view.currentChatFile = null;
                this.renderChatHistory();
            });
    
            const inputRow = document.createElement('div');
            inputRow.style.cssText = `flex-shrink:0;position:relative;padding:8px;background:var(--background-secondary);z-index:10;${Platform.isMobile ? 'border-bottom:1px solid var(--background-modifier-border);' : 'border-top:1px solid var(--background-modifier-border);'}`;
            inputRow.appendChild(textarea); inputRow.appendChild(overlayBtns);
    
            if (Platform.isMobile) {
                wrapper.appendChild(inputRow);
            }
    
            this.view.chatContainer = wrapper.createEl('div', { attr: { style: `flex-grow:1;min-height:0;overflow-y:auto;padding:8px;padding-bottom:${Platform.isMobile ? '120px' : '8px'};` } });
            await this.renderChatHistory();
    
            if (!Platform.isMobile) {
                wrapper.appendChild(inputRow);
                setTimeout(() => textarea.focus(), 50);
            }
        }
    
        async renderChatHistory() {
            if (!this.view.chatContainer) return;
            this.view.chatContainer.empty();
            if (this.view.chatHistory.length === 0) {
                this.view.chatContainer.createEl('div', { text: 'Ask me anything.', attr: { style: 'text-align:center;margin-top:20px;color:var(--text-muted);' } });
                return;
            }
            for (const msg of this.view.chatHistory) {
                const isUser = msg.role === 'user';
                const row = this.view.chatContainer.createEl('div', { attr: { style: `display: flex; justify-content: ${isUser ? 'flex-end' : 'flex-start'}; margin-bottom: 12px;` } });
                const bubble = row.createEl('div', { attr: { style: `max-width: 85%; padding: 10px 14px; border-radius: 12px; background: ${isUser ? 'var(--interactive-accent)' : 'var(--background-secondary)'}; color: ${isUser ? 'var(--text-on-accent)' : 'var(--text-normal)'}; position: relative; min-width: 60px;` } });
    
                const textContent = bubble.createEl('div', { attr: { style: 'margin-bottom: 4px;' } });
                if (isUser) {
                    textContent.setText(msg.text);
                } else {
                    await MarkdownRenderer.render(this.view.plugin.app, msg.text, textContent, '', this.view);
                    this.hookInternalLinks(textContent, '');
                    this.hookImageZoom(textContent);
                }
    
                const actions = bubble.createEl('div', { attr: { style: 'position: absolute; bottom: 4px; right: 8px; display: flex; gap: 6px; opacity: 0; transition: opacity 0.2s; background: inherit; padding-left: 10px; border-bottom-right-radius: 12px;' } });
                bubble.addEventListener('mouseenter', () => actions.style.opacity = '1');
                bubble.addEventListener('mouseleave', () => actions.style.opacity = '0');
    
                const copyBtn = actions.createEl('span', { text: '📋', attr: { style: 'cursor: pointer; font-size: 0.75em; filter: grayscale(1) brightness(1.5);', title: 'Copy' } });
                copyBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await navigator.clipboard.writeText(msg.text);
                    new Notice('Copied to clipboard');
                });
    
                if (!isUser) {
                    const saveBtn = actions.createEl('span', { text: '💾', attr: { style: 'cursor: pointer; font-size: 0.75em; filter: grayscale(1) brightness(1.5);', title: 'Save as Thought' } });
                    saveBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this.view.plugin.createThoughtFile(msg.text, ['#ai-response']);
                        new Notice('Saved as thought');
                    });
                }
            }
            this.view.chatContainer.scrollTop = this.view.chatContainer.scrollHeight;
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
                    if (!vault.getAbstractFileByPath(currentPath)) {
                        await vault.createFolder(currentPath);
                    }
                }
            }
    
            if (!this.view.currentChatFile) {
                this.view.currentChatFile = `${folder}/MINA Chat ${moment().format('YYYY-MM-DD HHmm')}.md`;
            }
    
            let content = `---\ntitle: "AI Chat ${moment().format('YYYY-MM-DD HH:mm')}"\ncreated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n---\n\n`;
    
            // Explicitly list session-wide grounding sources if any
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
            if (file instanceof TFile) {
                await vault.modify(file, content);
            } else {
                await vault.create(this.view.currentChatFile, content);
            }
        }
    
    parseChatSession(content: string): { role: 'user' | 'assistant'; text: string }[] {
        const history: { role: 'user' | 'assistant'; text: string }[] = [];
        let currentRole: 'user' | 'assistant' | null = null; let currentLines: string[] = [];
        for (const line of content.split('\n')) {
            if (line.startsWith('**You:** ')) {
                if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
                currentRole = 'user'; currentLines = [line.substring(9)];
            } else if (line.startsWith('**MINA:** ')) {
                if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
                currentRole = 'assistant'; currentLines = [line.substring(10)];
            } else if (currentRole && !line.startsWith('#')) currentLines.push(line);
        }
        if (currentRole && currentLines.length) history.push({ role: currentRole, text: currentLines.join('\n').trim() });
        return history;
    }

    async callGemini(userMessage: string, groundedFiles: TFile[] = [], webSearch: boolean = false): Promise<string> {
        const s = this.view.plugin.settings;
        const allThoughts = Array.from(this.view.plugin.thoughtIndex.values())
            .filter(t => !t.context.includes('journal'))
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate)
            .slice(0, 50);

        interface SourceItem { id: number; title: string; path: string; type: 'thought' | 'file' | 'image'; content?: string; file?: TFile; }
        const sources: SourceItem[] = [];
        let sourceCounter = 1;

        allThoughts.forEach(t => { sources.push({ id: sourceCounter++, title: t.title, path: t.filePath, type: 'thought', content: t.body }); });

        const imageParts: any[] = [];
        for (const file of groundedFiles) {
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(file.extension.toLowerCase());
            if (isImage) {
                const buffer = await this.view.app.vault.readBinary(file);
                let binary = ''; const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                const mimeType = `image/${file.extension === 'jpg' ? 'jpeg' : file.extension}`;
                imageParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'image', file });
            } else {
                const content = await this.view.app.vault.read(file);
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'file', content, file });
            }
        }

        let systemPrompt = "You are MINA AI, a helpful personal assistant integrated into an Obsidian vault.\n\n";
        systemPrompt += "CRITICAL INSTRUCTION: When you use information from the provided sources, you MUST cite them using numeric tags like [1], [2], etc.\n";
        
        if (sources.length > 0) {
            systemPrompt += "### SOURCES AVAILABLE:\n";
            sources.forEach(src => {
                systemPrompt += `[${src.id}] Source: ${src.title} (${src.path})\n`;
                if (src.content) systemPrompt += `Content: ${src.content}\n`;
                systemPrompt += `---\n`;
            });
        }

        const contents = this.view.chatHistory.map((msg: any, idx: number) => {
            const isLastMessage = idx === this.view.chatHistory.length - 1;
            const parts: any[] = [{ text: msg.text }];
            if (isLastMessage && msg.role === 'user' && imageParts.length > 0) parts.push(...imageParts);
            return { role: msg.role === 'user' ? 'user' : 'model', parts: parts };
        });
        
        const body: any = {
            contents: contents,
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: s.maxOutputTokens ?? 65536 }
        };

        if (webSearch) body.tools = [{ googleSearch: {} }];

        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiApiKey}`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) 
        });
        
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const candidate = data?.candidates?.[0];
        let reply = (candidate?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim() || '(no response)';

        sources.forEach(src => {
            const citationTag = `[${src.id}]`;
            const link = `[[${src.path}|${citationTag}]]`;
            const regex = new RegExp(`\\${citationTag}(?![^\\[]*\\]\\])`, 'g');
            reply = reply.replace(regex, link);
        });

        return reply;
    }
}
