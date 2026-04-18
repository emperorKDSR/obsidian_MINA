const fs = require('fs');

let content = fs.readFileSync('src/view.ts', 'utf-8');

// 1. Fix 'this.view' -> 'this' in MinaView methods
// 2. Add proper typing for ThoughtEntry in the method
const oldMethod = /async callGemini\(userMessage: string, groundedFiles: TFile\[\] = \[\], webSearch: boolean = false\): Promise<string> \{[\s\S]*?\n    \}/;
const newMethod = `async callGemini(userMessage: string, groundedFiles: TFile[] = [], webSearch: boolean = false): Promise<string> {
        const s = this.plugin.settings;
        const allThoughts = (Array.from(this.thoughtIndex.values()) as ThoughtEntry[])
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
                const buffer = await this.app.vault.readBinary(file);
                let binary = ''; const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                const mimeType = \`image/\${file.extension === 'jpg' ? 'jpeg' : file.extension}\`;
                imageParts.push({ inline_data: { mime_type: mimeType, data: base64 } });
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'image', file });
            } else {
                const content = await this.app.vault.read(file);
                sources.push({ id: sourceCounter++, title: file.basename, path: file.path, type: 'file', content, file });
            }
        }

        let systemPrompt = "You are MINA AI, a helpful personal assistant integrated into an Obsidian vault.\\n\\n";
        systemPrompt += "CRITICAL INSTRUCTION: When you use information from the provided sources, you MUST cite them using numeric tags like [1], [2], etc.\\n";
        
        if (sources.length > 0) {
            systemPrompt += "### SOURCES AVAILABLE:\\n";
            sources.forEach(src => {
                systemPrompt += \`[\${src.id}] Source: \${src.title} (\${src.path})\\n\`;
                if (src.content) systemPrompt += \`Content: \${src.content}\\n\`;
                systemPrompt += \`---\\n\`;
            });
        }

        const contents = this.chatHistory.map((msg: any, idx: number) => {
            const isLastMessage = idx === this.chatHistory.length - 1;
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

        const resp = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/\${s.geminiModel}:generateContent?key=\${s.geminiApiKey}\`, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) 
        });
        
        if (!resp.ok) throw new Error(\`HTTP \${resp.status}\`);
        const data = await resp.json();
        const candidate = data?.candidates?.[0];
        let reply = (candidate?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim() || '(no response)';

        sources.forEach(src => {
            const citationTag = \`[\${src.id}]\`;
            const link = \`[[\${src.path}|\${citationTag}]]\`;
            const regex = new RegExp(\`\\\\\\\${\${citationTag}}(?![^\\\\[]*\\\\]\\\\])\`, 'g');
            reply = reply.replace(regex, link);
        });

        return reply;
    }`;

content = content.replace(oldMethod, newMethod);
fs.writeFileSync('src/view.ts', content);
console.log('AI methods in MinaView fixed.');
