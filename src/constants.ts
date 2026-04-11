import { MinaSettings } from './types';

export const VIEW_TYPE_MINA = "mina-v2-view";

// Custom icon — Alien head
export const KATANA_ICON_ID = "mina-katana";
export const MINA_ALIEN_PATH_HEAD = "M12 2C7.03 2 3 6.03 3 11c0 4.97 4.03 11 9 11s9-6.03 9-11c0-4.97-4.03-9-9-9z";
export const MINA_ALIEN_PATH_EYE_L = "M9 11a3 2 0 0 1-3 2 3 2 0 0 1 3-2z";
export const MINA_ALIEN_PATH_EYE_R = "M15 11a3 2 0 0 0 3 2 3 2 0 0 0-3-2z";

// addIcon content — transform maps 24x24 coords into Obsidian's 100×100 icon space
export const KATANA_ICON_SVG = `<g transform="translate(2,2) scale(4)">
    <path d="${MINA_ALIEN_PATH_HEAD}" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="${MINA_ALIEN_PATH_EYE_L}" fill="#39FF14" stroke="none"/>
    <path d="${MINA_ALIEN_PATH_EYE_R}" fill="#39FF14" stroke="none"/>
</g>`;

export const NINJA_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#39FF14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="${MINA_ALIEN_PATH_HEAD}"/>
    <path d="${MINA_ALIEN_PATH_EYE_L}" fill="#39FF14" stroke="none"/>
    <path d="${MINA_ALIEN_PATH_EYE_R}" fill="#39FF14" stroke="none"/>
</svg>`;

export const WOLF_SVG = NINJA_AVATAR_SVG;

export const JOURNAL_ICON_ID = "mina-journal-icon";
export const JOURNAL_ICON_SVG = `<g transform="translate(10,10) scale(3.5)">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

export const DEFAULT_SETTINGS: MinaSettings = {
    captureFolder: '000 Bin',
	captureFilePath: 'mina_v2.md',
    tasksFilePath: 'mina_2.md',
    thoughtsFolder: '000 Bin/MINA V2',
    tasksFolder: '000 Bin/MINA V2 Tasks',
    pfFolder: '000 Bin/MINA V2 PF',
	dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm',
    contexts: [], 
    selectedContexts: [],
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-pro',
    maxOutputTokens: 65536,
    newNoteFolder: '000 Bin',
    voiceMemoFolder: '000 Bin/MINA V2 Voice',
    aiChatFolder: '000 Bin/MINA V2 AI Chat',
    transcriptionLanguage: 'English',
    dailySectionStates: {},
    showDailySections: true,
    showDailyChecklist: true,
    showDailyTasks: true,
    showDailyDues: true,
    showDailyThoughts: true,
    showDailyPinned: true
}
