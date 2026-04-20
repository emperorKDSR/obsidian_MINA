import { TFile } from 'obsidian';

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export interface ProjectEntry {
    id: string;
    name: string;
    status: 'active' | 'on-hold' | 'completed' | 'archived';
    goal: string;
    due?: string;
    created: string;
    color?: string;
    filePath: string;
}

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
    showDailySummary: boolean;
    focusModeOrder: string[];
    grundfosModeOrder: string[];
    journalModeOrder: string[];
    pfModeOrder: string[];
    grundfosKeywords: string[];
    journalKeywords: string[];
    blurredNotes: string[];
    isCompactView: boolean;
    birthDate: string;
    lifeExpectancy: number;
    customModes: CustomMode[];
    customModeOrders: Record<string, string[]>;
    habitsFolder: string;
    habits: Habit[];
    weeklyGoals: string[];
    monthlyGoals: string[];
    monthlyIncome: number;
    northStarGoals: string[];
    enableAutoClassification: boolean;
    lifeMission: string;
    attachmentsFolder: string;
    projectsFolder: string;
}

export interface Habit {
    id: string;
    name: string;
    icon: string; // e.g. "💧", "🧘"
    archived?: boolean;
}

export interface CustomMode {
    id: string;
    name: string;
    context: string;
    keywords: string[];
    icon: string;
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
    project?: string;          // associated project name
    synthesized?: boolean;     // true if the thought has been synthesized into a master note
}

export interface TaskEntry {
    filePath: string;
    title: string;
    created: string;       // "YYYY-MM-DD HH:mm:ss"
    modified: string;
    day: string;           // "YYYY-MM-DD"
    status: 'open' | 'done' | 'waiting' | 'someday';
    due: string;           // "YYYY-MM-DD" or ""
    context: string[];
    body: string;
    lastUpdate: number;    // ms timestamp of modified for sorting
    children: ReplyEntry[]; // Support comments/replies on tasks
    project?: string;       // associated project name
    priority?: 'high' | 'medium' | 'low';
    energy?: 'high' | 'medium' | 'low';
    recurrence?: RecurrenceRule;
    recurrenceParentId?: string;
}

export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface DueEntry { 
    title: string; 
    path: string; 
    dueDate: string; 
    lastPayment: string; 
    dueMoment: any; 
    hasRecurring: boolean; 
    isActive: boolean;
    amount?: number;
}

export type FileOrCreate = TFile | string;

export type VoiceState = 'idle' | 'recording' | 'processing' | 'reviewing' | 'confirmed';

export interface ReviewData {
    transcript: string;
    clipFile: TFile | null;
    durationMs: number;
    clipFileName: string;
}
