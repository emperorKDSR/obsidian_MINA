import { moment, Platform, TFile, Notice, MarkdownRenderer, setIcon } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from "./BaseTab";

export class AiTab extends BaseTab {
    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        this.renderAiMode(container);
    }

    async renderAiMode(container: HTMLElement) {
        container.empty();
        
        const wrap = container.createEl('div', {
            attr: {
                style: 'display: flex; flex-direction: column; height: 100%; background: var(--background-primary);'
            }
        });

        // 1. Header
        const header = wrap.createEl('div', {
            attr: { style: 'padding: 16px 14px 10px 14px; border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;' }
        });

        const navRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: -4px;' } });
        this.renderHomeIcon(navRow);

        const titleRow = header.createEl('div', { attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        titleRow.createEl('h2', { text: 'AI Chat', attr: { style: 'margin: 0; font-size: 1.4em; font-weight: 800; color: var(--text-normal); letter-spacing: -0.02em; line-height: 1.1;' } });

        // 2. Chat History
        const chatContainer = wrap.createEl('div', {
            attr: { style: 'flex-grow: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; -webkit-overflow-scrolling: touch;' }
        });
        this.view.chatContainer = chatContainer;

        const renderHistory = () => {
            chatContainer.empty();
            this.view.chatHistory.forEach(msg => {
                const isUser = msg.role === 'user';
                const row = chatContainer.createEl('div', { attr: { style: `display: flex; flex-direction: column; align-items: ${isUser ? 'flex-end' : 'flex-start'}; gap: 4px;` } });
                const bubble = row.createEl('div', {
                    cls: isUser ? 'mina-ai-user-bubble' : 'mina-ai-bot-bubble',
                    attr: { style: `max-width: 85%; padding: 10px 14px; border-radius: 14px; font-size: 0.95em; line-height: 1.5; ${isUser ? 'background: var(--interactive-accent); color: var(--text-on-accent);' : 'background: var(--background-secondary-alt); color: var(--text-normal); border: 1px solid var(--background-modifier-border-faint);'}` }
                });
                MarkdownRenderer.render(this.app, msg.text, bubble, '', this.view);
                this.hookInternalLinks(bubble, '');
            });
            chatContainer.scrollTop = chatContainer.scrollHeight;
        };
        renderHistory();

        // 3. Input Area
        const inputArea = wrap.createEl('div', {
            attr: { style: 'padding: 14px; border-top: 1px solid var(--background-modifier-border-faint); background: var(--background-primary); flex-shrink: 0; display: flex; gap: 8px; align-items: flex-end;' }
        });

        const textArea = inputArea.createEl('textarea', {
            attr: { placeholder: 'Ask M.I.N.A...', style: 'flex: 1; min-height: 44px; max-height: 200px; border-radius: 12px; border: 1px solid var(--background-modifier-border); background: var(--background-secondary-alt); color: var(--text-normal); padding: 10px 14px; font-size: 0.95em; resize: none; outline: none;' }
        });

        const sendBtn = inputArea.createEl('button', {
            text: 'Send',
            attr: { style: 'flex-shrink: 0; background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 20px; border-radius: 8px; font-weight: 700; cursor: pointer;' }
        });

        sendBtn.addEventListener('click', async () => {
            const text = textArea.value.trim();
            if (!text || this.view.isAiLoading) return;
            
            textArea.value = '';
            this.view.chatHistory.push({ role: 'user', text });
            renderHistory();
            
            this.view.isAiLoading = true;
            const thinking = chatContainer.createEl('div', { text: 'Thinking...', attr: { style: 'opacity: 0.5; font-size: 0.8em; margin-bottom: 10px;' } });
            
            try {
                const response = await this.ai.callGemini(text, this.view.groundedFiles, this.view.webSearchEnabled, this.view.chatHistory, this.index.thoughtIndex);
                thinking.remove();
                this.view.chatHistory.push({ role: 'model', text: response });
                renderHistory();
            } catch (e: any) {
                // ai-11: Remove thinking div on error — was left as permanent "Thinking..." bubble
                thinking.remove();
                const errDiv = chatContainer.createEl('div', {
                    text: `⚠ ${e.message}`,
                    attr: { style: 'color: var(--text-error); font-size: 0.85em; padding: 8px 12px; background: rgba(255,50,50,0.1); border-radius: 8px; border: 1px solid var(--text-error);' }
                });
                setTimeout(() => errDiv.remove(), 8000);
            } finally {
                this.view.isAiLoading = false;
            }
        });
    }
}
