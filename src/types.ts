import { TFile } from 'obsidian';

export interface MinaSettings {
    captureFolder: string;
	captureFilePath: string;
    tasksFilePath: string;
    thoughtsFolder: string;
    tasksFolder: string;
    pfFolder: string;
	dateFormat: string;
    timeFormat: string;
    contexts: string[];
    selectedContexts: string[];
    geminiApiKey: string;
    geminiModel: string;
    maxOutputTokens: number;
    newNoteFolder: string;
    voiceMemoFolder: string;
    aiChatFolder: string;
    transcriptionLanguage: string;
    dailySectionStates: Record<string, boolean>;
    showDailySections: boolean;
    showDailyChecklist: boolean;
    showDailyTasks: boolean;
    showDailyDues: boolean;
    showDailyThoughts: boolean;
    showDailyPinned: boolean;
}

export interface ReplyEntry {
    anchor: string;   // e.g. "reply-1774590963512"
    date: string;     // YYYY-MM-DD
    time: string;     // HH:mm:ss
    text: string;     // reply body text
}

export interface ThoughtEntry {
    filePath: string;          // vault path to the file
    title: string;             // from frontmatter
    created: string;           // YYYY-MM-DD HH:mm:ss
    modified: string;          // YYYY-MM-DD HH:mm:ss
    day: string;               // e.g. "2026-03-28"
    allDates: string[];        // all [[YYYY-MM-DD]] links found in full content
    context: string[];         // from frontmatter context list
    body: string;              // text before first ## reply header
    children: ReplyEntry[];    // parsed from ## sections in body
    lastThreadUpdate: number;  // ms timestamp for sorting
    pinned?: boolean;          // true if the thought is pinned
}

export interface TaskEntry {
    filePath: string;
    title: string;
    created: string;       // "YYYY-MM-DD HH:mm:ss"
    modified: string;
    day: string;           // "YYYY-MM-DD"
    status: 'open' | 'done';
    due: string;           // "YYYY-MM-DD" or ""
    context: string[];
    body: string;
    lastUpdate: number;    // ms timestamp of modified for sorting
}

export interface DueEntry { 
    title: string; 
    path: string; 
    dueDate: string; 
    lastPayment: string; 
    dueMoment: any; 
    hasRecurring: boolean; 
    isActive: boolean; 
}

export type FileOrCreate = TFile | string;
