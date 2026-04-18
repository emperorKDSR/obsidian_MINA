import { App, TFile, moment, Notice } from 'obsidian';
import type { MinaSettings, ThoughtEntry } from '../types';

export interface SourceItem {
    id: number;
    title: string;
    path: string;
    type: 'thought' | 'file' | 'image';
    content?: string;
    file?: TFile;
}

export class AiService {
    app: App;
    settings: MinaSettings;

    constructor(app: App, settings: MinaSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: MinaSettings) {
        this.settings = settings;
    }

    async callGemini(
        userMessage: string, 
        groundedFiles: TFile[] = [], 
        webSearch: boolean = false, 
        customHistory?: any[],
        thoughtIndex?: Map<string, ThoughtEntry>
    ): Promise<string> {
        const s = this.settings;
        const allThoughts = thoughtIndex ? (Array.from(thoughtIndex.values()) as ThoughtEntry[])
            .filter(t => !t.context.includes('journal'))
            .sort((a, b) => b.lastThreadUpdate - a.lastThreadUpdate)
            .slice(0, 50) : [];

        const sources: SourceItem[] = [];
        let sourceCounter = 1;

        allThoughts.forEach(t => { 
            sources.push({ id: sourceCounter++, title: t.title, path: t.filePath, type: 'thought', content: t.body }); 
        });

        const imageParts: any[] = [];
        for (const file of groundedFiles) {
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(file.extension.toLowerCase());
            if (isImage) {
                const buffer = await this.app.vault.readBinary(file);
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                const mimeType = `image/${file.extension === 'jpg' ? 'jpeg' : (['png', 'webp', 'gif'].includes(file.extension) ? file.extension : 'png')}`;
                imageParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'image', file });
            } else {
                const content = await this.app.vault.read(file);
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'file', content, file });
            }
        }

        let systemPrompt = `You are MINA AI, a helpful personal assistant integrated into an Obsidian vault.
The current date and time is ${moment().format('dddd, MMMM D, YYYY HH:mm:ss')}.
When the user refers to "today", they mean ${moment().format('dddd, MMMM D, YYYY')}.

`;
        systemPrompt += "CRITICAL INSTRUCTION: When you use information from the provided sources, you MUST cite them using numeric tags like [1], [2], etc.\n";
        
        if (sources.length > 0) {
            systemPrompt += "### SOURCES AVAILABLE:\n";
            sources.forEach(src => {
                systemPrompt += `[${src.id}] Source: ${src.title} (${src.path})\n`;
                if (src.content) systemPrompt += `Content: ${src.content}\n`;
                systemPrompt += `---\n`;
            });
        }

        const contents = (customHistory || []).map((msg: any, idx: number) => {
            const isLastMessage = idx === (customHistory?.length || 0) - 1;
            const parts: any[] = [{ text: msg.text }];
            if (isLastMessage && msg.role === 'user' && imageParts.length > 0) parts.push(...imageParts);
            return { role: msg.role === 'user' ? 'user' : 'model', parts: parts };
        });
        
        const body: any = {
            contents: contents,
            system_instruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { 
                temperature: 0.7, 
                maxOutputTokens: s.maxOutputTokens ?? 65536,
                topP: 0.95,
                topK: 40
            }
        };

        if (webSearch) body.tools = [{ googleSearch: {} }];

        const rawModelId = s.geminiModel || 'gemini-1.5-pro';
        const modelId = (rawModelId.includes('2.5') || !rawModelId.startsWith('gemini-')) ? 'gemini-1.5-pro' : rawModelId;
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${s.geminiApiKey}`;

        try {
            const resp = await fetch(url, { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) 
            });
            
            if (resp.status === 429) throw new Error(`AI Rate limit reached (HTTP 429). Model: ${modelId}. Please check your quota in Google AI Studio.`);
            if (resp.status === 404) throw new Error(`Model not found (HTTP 404). The ID "${modelId}" is invalid. Please open Config and select a stable model like "1.5 Pro".`);
            if (!resp.ok) throw new Error(`AI Error (HTTP ${resp.status}). Model: ${modelId}.`);

            const data = await resp.json();
            const candidate = data?.candidates?.[0];
            let reply = (candidate?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim() || '(no response)';

            sources.forEach(src => {
                const citationTag = `[${src.id}]`;
                const link = `[[${src.path}|${citationTag}]]`;
                const regex = new RegExp(`\\\$${citationTag}(?![^\\[]*\\]\\])`, 'g');
                reply = reply.replace(regex, link);
            });

            return reply;
        } catch (e: any) {
            console.error("MINA AI Fetch Error:", e);
            throw e;
        }
    }

    async transcribeAudio(file: TFile): Promise<string> {
        const { geminiApiKey, geminiModel, transcriptionLanguage } = this.settings;
        const rawModelId = geminiModel || 'gemini-1.5-flash';
        const modelId = (rawModelId.includes('2.5') || !rawModelId.startsWith('gemini-')) ? 'gemini-1.5-flash' : rawModelId;

        const audioBuffer = await this.app.vault.readBinary(file);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
        const mimeType = (file.extension === 'm4a' || file.extension === 'mp4') ? 'audio/mp4' : `audio/${file.extension}`;
        const body = { 
            "contents": [{ 
                "parts": [{ 
                    "text": `Transcribe this audio recording and translate the output to ${transcriptionLanguage}. 
                    Temporal Context: The current date is ${moment().format('dddd, MMMM D, YYYY')}.` 
                }, { 
                    "inline_data": { "mime_type": mimeType, "data": base64 } 
                }] 
            }] 
        };
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiApiKey}`;
        const resp = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
        if (!resp.ok) throw new Error(`Transcription Failed (HTTP ${resp.status}). Model: ${modelId}`);
        const data = await resp.json(); 
        return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Transcription failed.";
    }
}
