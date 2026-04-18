const fs = require('fs');

let viewContent = fs.readFileSync('src/view.ts', 'utf-8');
let aiTabContent = fs.readFileSync('src/tabs/AiTab.ts', 'utf-8');

// 1. Extract callGemini and parseChatSession from AiTab.ts
const aiMethodsRegex = /parseChatSession\(content: string\): \{ role: 'user' \| 'assistant'; text: string \}\[\] \{[\s\S]*?async callGemini\(userMessage: string, groundedFiles: TFile\[\] = \[\], webSearch: boolean = false\): Promise<string> \{[\s\S]*?\n    \}/;
const aiMethodsMatch = aiTabContent.match(aiMethodsRegex);

if (aiMethodsMatch) {
    const aiMethods = aiMethodsMatch[0];
    
    // 2. Remove from AiTab.ts and add a placeholder/update calls
    aiTabContent = aiTabContent.replace(aiMethodsRegex, '');
    aiTabContent = aiTabContent.replace(/this\.callGemini/g, 'this.view.callGemini');
    aiTabContent = aiTabContent.replace(/this\.parseChatSession/g, 'this.view.parseChatSession');
    
    // 3. Add to MinaView in src/view.ts
    // We'll insert it before the matchesSearch method
    viewContent = viewContent.replace(/matchesSearch\(query: string, fields: string\[\]\): boolean \{/, aiMethods + '\n\n    matchesSearch(query: string, fields: string[]): boolean {');

    fs.writeFileSync('src/view.ts', viewContent);
    fs.writeFileSync('src/tabs/AiTab.ts', aiTabContent);
    console.log('AI logic moved to MinaView.');
} else {
    console.log('Could not find AI methods in AiTab.ts');
}
