import { setIcon, Platform } from 'obsidian';
import type { MinaView } from '../view';
import { BaseTab } from './BaseTab';
import { isTablet } from '../utils';

interface HelpItem { label: string; desc: string; tip?: string; }
interface HelpSection { id: string; icon: string; title: string; subtitle: string; items: HelpItem[]; }

const SECTIONS: HelpSection[] = [
    {
        id: 'home', icon: 'lucide-home', title: 'Command Center', subtitle: 'Your daily launch pad',
        items: [
            { label: 'Greeting & Date', desc: 'Shows today\'s date, your greeting, and your North Star vision at the top.' },
            { label: 'Zen Mode 🎯', desc: 'Tap the target icon to collapse all navigation and enter deep focus. Tap again to exit.', tip: 'Best used when you only want to see your goals and capture bar.' },
            { label: 'Intelligence Card', desc: 'Live snapshot: open tasks, habits completed, unprocessed thoughts, and total dues. Hit "SYNTHESIZE BRIEFING" to get an AI strategy summary.', tip: 'Requires a Gemini API key configured in Settings → AI.' },
            { label: 'Weekly & Monthly Goals', desc: 'Your active goals shown at a glance. Tap "Edit" to update them in the Review tabs.' },
            { label: 'Tablet Experience', desc: 'On tablets (iPad, etc.), MINA automatically upgrades to a desktop-like layout: inline capture bar, horizontal habit bar, expanded goals and navigation, and hover effects.', tip: 'Tablet is detected when the device short-edge is ≥768px.' },
            { label: 'Global Search 🔍', desc: 'Tap the search icon in the header or press Mod+Shift+F to open Global Search. Instantly find anything across Thoughts, Tasks, Dues, Projects, and Habits.', tip: 'Also available via Obsidian command palette: "MINA: Global Search".' },
        ]
    },
    {
        id: 'search', icon: 'lucide-search', title: 'Global Search', subtitle: 'Find anything across MINA instantly',
        items: [
            { label: 'Opening Search', desc: 'Tap the 🔍 icon in the Command Center header, or press Mod+Shift+F. On phone, a search pill sits between the greeting and capture bar.', tip: 'Also available via Obsidian command palette: "MINA: Global Search".' },
            { label: 'Search Pill (Phone)', desc: 'On phone, a tappable search pill sits in the Command Center between the greeting and the capture bar. Tapping it opens the full-screen search overlay directly.', tip: 'The pill only appears on phone-sized screens — on tablet/desktop use the header icon.' },
            { label: 'Mobile Full-Screen Mode', desc: 'On phone, search opens as a full-screen iOS Spotlight-style takeover: 16px input (prevents iOS zoom), results scroll above the keyboard automatically, and safe-area insets are respected for notched phones.' },
            { label: 'Swipe to Dismiss', desc: 'On phone, swipe down on the search overlay or tap the ← back button to close.', tip: 'The back button appears in the top-left corner of the full-screen overlay.' },
            { label: 'Scope Filters', desc: 'Use the pill buttons (All / Thoughts / Tasks / Dues / Projects / Habits) to narrow results to a specific type. Counts update live as you type.' },
            { label: 'Keyboard Navigation', desc: '↑↓ arrow keys move through results. Enter opens the focused item. Escape closes the overlay.', tip: 'Typing always returns focus to the input — you never lose your place.' },
            { label: 'Quick Jump', desc: 'When search is empty, a Quick Jump grid lets you instantly navigate to any tab. Displays as 2 columns on phone, 3 columns on tablet/desktop.' },
            { label: 'Match Highlighting', desc: 'Your query is highlighted wherever it matches result titles, making it easy to confirm relevance at a glance.' },
        ]
    },
    {
        id: 'capture', icon: 'lucide-plus-circle', title: 'Quick Capture', subtitle: 'Capture thoughts and tasks instantly',
        items: [
            { label: 'Capture a Thought', desc: 'Click the capture bar and type your idea. It saves as a Markdown file in your thoughts folder.' },
            { label: 'Capture a Task', desc: 'Switch to Task mode in the capture bar. Optionally add a due date and contexts before saving.' },
            { label: 'Context Tags (#tags)', desc: 'Type #tag in the capture bar to attach a context. Tags appear as removable chips.' },
            { label: 'Smart Date Triggers', desc: 'Type @tomorrow, @monday, or @2025-08-01 in the text to auto-set a due date and switch to task mode.', tip: 'Examples: "Fix bug @tomorrow", "Call client @friday"' },
            { label: 'Task Metadata', desc: 'Set priority (High / Medium / Low), energy level, and custom status when capturing or editing any task.' },
            { label: 'Keyboard Shortcuts', desc: '⌘K or Ctrl+K opens capture. ⌘↵ or Ctrl+↵ saves. Esc cancels.' },
        ]
    },
    {
        id: 'tasks', icon: 'lucide-check-square-2', title: 'Tasks', subtitle: 'Your tactical task ledger',
        items: [
            { label: 'Status Filters', desc: 'Filter by Open, Done, Waiting, or Someday using the segment bar at the top.' },
            { label: 'Complete a Task', desc: 'Tap the checkbox to mark a task done. It moves to the Done filter.' },
            { label: 'Edit a Task', desc: 'Tap a task card to open the edit modal. Change title, due date, contexts, priority, or energy.' },
            { label: 'Priority & Energy', desc: 'High/Medium/Low priority and energy tags help you pick the right task for your current state.', tip: 'Ask yourself: "What\'s my energy right now?" and filter accordingly.' },
            { label: 'Recurring Tasks', desc: 'Tasks can repeat daily, weekly, biweekly, or monthly. Set recurrence in the edit modal.' },
            { label: 'Comments', desc: 'Tap the comment icon on a task to add notes or replies beneath it.' },
        ]
    },
    {
        id: 'thoughts', icon: 'lucide-brain', title: 'Thoughts & Timeline', subtitle: 'Browse and search your captured ideas',
        items: [
            { label: 'Timeline View', desc: 'All thoughts listed newest-first. Use the date carousel to jump to a specific day.' },
            { label: 'Search', desc: 'Type in the search bar to filter thoughts by content, title, or context tag.' },
            { label: 'Edit & Reply', desc: 'Tap a thought card to edit its content, add a reply thread, or delete it.' },
            { label: 'Pin a Thought', desc: 'Pin important thoughts to keep them anchored at the top of the timeline.' },
            { label: 'Project Link', desc: 'Thoughts can be linked to a project using the folder icon in the edit modal.' },
        ]
    },
    {
        id: 'habits', icon: 'lucide-flame', title: 'Habits', subtitle: 'Build your daily disciplines',
        items: [
            { label: 'Quick Bar (Home)', desc: 'Tap habit buttons on the Home screen to log today\'s completions without leaving the hub.' },
            { label: '7-Day Strip', desc: 'In the Habits tab, each habit shows a 7-day calendar. Tap any day to toggle it.' },
            { label: 'Configure Habits', desc: 'Tap the ⚙ gear icon on the Home screen to add, edit, or archive habits.' },
            { label: 'Weekly Highlight', desc: 'The Weekly Review automatically shows your best-performing habit for the week.' },
            { label: 'Progress Bar', desc: 'A visual progress bar shows how many habits you\'ve completed today.' },
        ]
    },
    {
        id: 'projects', icon: 'lucide-briefcase', title: 'Projects', subtitle: 'Manage multi-step initiatives',
        items: [
            { label: 'Create a Project', desc: 'Tap "New Project" and fill in the name, goal, status, due date, and colour.' },
            { label: 'Edit a Project', desc: 'Tap the ✏ pencil icon on any project card to update its details.' },
            { label: 'Status', desc: 'Projects can be: Active, On Hold, Completed, or Archived. Archived projects are hidden from active views.' },
            { label: 'Link to Capture', desc: 'Tap the folder icon in the capture modal to link a thought or task to a project.' },
            { label: 'Weekly Glance', desc: 'Projects modified this week appear in the "Active Projects" card in Weekly Review.' },
        ]
    },
    {
        id: 'finance', icon: 'lucide-credit-card', title: 'Finance (Dues)', subtitle: 'Track bills and financial obligations',
        items: [
            { label: 'Dues Ledger', desc: 'All your recurring bills and due dates in one place.' },
            { label: 'Filter Views', desc: 'Switch between All, Due Soon, Overdue, and Paid views using the segment bar.' },
            { label: 'Mark Paid', desc: 'Tap a due item to log a payment. The date is stamped and reflected in Weekly Review.' },
            { label: 'Burn Rate', desc: 'Total monthly obligation is shown at the top — your financial baseline.' },
        ]
    },
    {
        id: 'review', icon: 'lucide-calendar-check', title: 'Weekly Review', subtitle: 'Reflect and plan every week',
        items: [
            { label: 'Week at a Glance ⚡', desc: 'Auto-generated panel showing tasks completed, habit progress, active projects, and finance paid/overdue.', tip: 'Tap ↻ to refresh. Tap ⌄ to collapse.' },
            { label: 'Wins', desc: 'Write what went well this week — celebrate progress, big and small.' },
            { label: 'Lessons Learned', desc: 'Capture what you\'d do differently. Turns mistakes into growth.' },
            { label: 'Next Week\'s Focus', desc: 'Set 1–3 priorities for the coming week. These appear on your Home screen.' },
            { label: 'Habit Highlight', desc: 'Your best-performing habit is shown automatically.' },
            { label: 'Save', desc: 'Press "Save Review" or ⌘↵ to save. Stored as Markdown in your Reviews/Weekly/ folder.', tip: 'The folder is configurable in Folder Config → Reviews Folder.' },
        ]
    },
    {
        id: 'monthly-review', icon: 'lucide-calendar-range', title: 'Monthly Review', subtitle: 'Set and track monthly goals',
        items: [
            { label: 'Navigation', desc: 'Access from the SYSTEM cluster in Command Center, or from the monthly goals "Edit" button.' },
            { label: 'Monthly Stats', desc: 'Auto-calculated tasks done, thoughts captured, and open tasks for the current month.' },
            { label: 'Habit Adherence', desc: 'Shows completion rate per habit across the month with percentage color coding.' },
            { label: 'Project Progress', desc: 'Visual progress bars for each project showing done/total ratio.' },
            { label: 'Next Month\'s Focus', desc: 'Set up to 3 goals for the coming month. Saved to Reviews/Monthly/ folder.', tip: 'Persisted as Markdown so it survives plugin reinstalls.' },
        ]
    },
    {
        id: 'compass', icon: 'lucide-compass', title: 'Compass', subtitle: 'Your North Star and long-range direction',
        items: [
            { label: 'Access', desc: 'Open from the SYSTEM cluster in Command Center. Shows your Quarterly North Star Goals and Life Mission.' },
            { label: 'North Star Goals', desc: 'Set 3 quarterly goals that define your 90-day strategic priorities. Displayed daily on the Home screen.' },
            { label: 'Life Mission', desc: 'Write your personal "why" — the reason behind all your goals and actions.' },
            { label: 'Quarterly Audit', desc: 'Auto-generated stats showing tasks done, habits completed, and dues paid for the quarter.' },
            { label: 'Persistence', desc: 'Compass data saves to Reviews/Compass/YYYY-Qx.md — one file per quarter.', tip: 'Configurable via Folder Config → Reviews Folder.' },
        ]
    },
    {
        id: 'synthesis', icon: 'lucide-git-merge', title: 'Synthesis', subtitle: 'Process thoughts into permanent knowledge',
        items: [
            { label: 'Inbox Feed', desc: 'Unprocessed thoughts appear in the sidebar with count badge. Use the search filter to find specific thoughts.' },
            { label: 'Drag & Drop', desc: 'Drag a thought card onto the canvas to synthesize it into your Master Note. It\'s automatically marked as processed.' },
            { label: 'Quick Process', desc: 'Tap "✓ Process" on any card to mark it as processed without synthesizing.' },
            { label: 'Master Notes', desc: 'Create new insight notes with "+ New Insight". Merged thoughts are linked via wiki-links.' },
            { label: 'Zero-Inbox Goal', desc: 'Keep your inbox empty by regularly processing ideas.', tip: 'Weekly Review is the perfect time to clear your thought inbox.' },
        ]
    },
    {
        id: 'ai', icon: 'lucide-sparkles', title: 'AI Chat', subtitle: 'Gemini 2.5 Pro intelligence',
        items: [
            { label: 'Chat', desc: 'Ask MINA anything — strategy, writing help, idea development, or note analysis. Powered by Gemini 2.5 Pro.' },
            { label: 'Keyboard', desc: 'Press Enter to send, Shift+Enter for a new line.', tip: 'The send button also works on mobile.' },
            { label: 'Web Search', desc: 'Toggle the globe icon (🌐) in the header to let AI pull current information from the internet.' },
            { label: 'Ground on Notes', desc: 'Attach vault files via the paperclip icon. File chips appear above the input — tap × to remove.' },
            { label: 'New Chat', desc: 'Tap "+ New" to start a fresh conversation. Previous chats are auto-saved to vault.' },
            { label: 'Setup', desc: 'Add your Gemini API key via the gear icon in the AI header. Free tier at ai.google.dev.', tip: 'Default model: gemini-2.5-pro. The Intelligence briefing on Home also uses this key.' },
        ]
    },
    {
        id: 'voice', icon: 'lucide-mic', title: 'Voice Notes', subtitle: 'Capture and transcribe audio',
        items: [
            { label: 'Record', desc: 'Tap and hold the microphone button to record. Release to stop.' },
            { label: 'Transcribe', desc: 'After recording, tap "Transcribe" to convert speech to text using Gemini AI.' },
            { label: 'Review & Save', desc: 'Edit the transcription text before saving it as a thought or note.' },
        ]
    },
    {
        id: 'journal', icon: 'lucide-book-open', title: 'Journal', subtitle: 'Daily freeform writing',
        items: [
            { label: 'Daily Entry', desc: 'Each day gets its own journal entry file. Use the arrow buttons to navigate between days.' },
            { label: 'Auto-Save', desc: 'Journal entries save automatically as you type. No need to press save.' },
        ]
    },
    {
        id: 'workspace', icon: 'lucide-layout-dashboard', title: 'Daily Workspace', subtitle: 'Focused view for your day',
        items: [
            { label: 'Today\'s Tasks', desc: 'Shows tasks due today and open tasks prioritised for the day.' },
            { label: 'Daily Note', desc: 'Opens or creates today\'s daily note directly in the workspace.' },
        ]
    },
    {
        id: 'timeline', icon: 'lucide-clock', title: 'Timeline', subtitle: 'Chronological history of all activity',
        items: [
            { label: 'All Entries', desc: 'Thoughts, tasks, and notes shown in date order. Scroll to explore your history.' },
            { label: 'Date Jump', desc: 'Use the date carousel at the top to navigate to a specific day.' },
        ]
    },
    {
        id: 'settings', icon: 'lucide-settings', title: 'Settings', subtitle: 'Configure MINA to your workflow',
        items: [
            { label: 'Folders', desc: 'Set where thoughts, tasks, habits, voice memos, and reviews are stored in your vault. Use Folder Config for a quick modal.' },
            { label: 'Reviews Folder', desc: 'Root folder for Weekly, Monthly, and Compass review files. Sub-folders Weekly/, Monthly/, Compass/ are auto-created.', tip: 'Default: 000 Bin/MINA V2 Reviews. Configurable in Folder Config.' },
            { label: 'Contexts', desc: 'Manage your global context tags (#work, #personal, etc.).' },
            { label: 'AI Key', desc: 'Enter your Gemini API key to enable AI Chat and Intelligence features.' },
            { label: 'Habits', desc: 'Add, edit, and archive habits from the ⚙ icon on the Home screen.' },
        ]
    },
    {
        id: 'roadmap', icon: 'lucide-map', title: 'Roadmap', subtitle: 'What\'s coming to MINA V2',
        items: [
            { label: '🔥 Habit Streaks', desc: 'Continuous streak counter per habit — see how many days in a row you\'ve completed each habit. Includes longest streak record and streak restoration alerts.', tip: 'Currently you can see weekly completion %. Streaks will add a continuous day-count visible on the Home screen and Habits tab.' },
            { label: '📅 Calendar View', desc: 'A month/week calendar overlay showing tasks due, habits scheduled, and dues on a visual grid — making it easy to see load and balance your week at a glance.', tip: 'Will integrate with Tasks and Dues without duplicating data.' },
            { label: '🎯 Task Focus Mode', desc: 'A dedicated "Today\'s Mission" view showing only tasks you\'ve selected for today, with a distraction-free interface and time-block suggestions from AI.' },
            { label: '🏗️ Project Milestones', desc: 'Sub-tasks and milestone tracking within Projects — break down a project into steps, track completion %, and see milestones in the Weekly Glance.', tip: 'Will link to existing task files so no data is duplicated.' },
            { label: '⏰ Memento Mori Visual', desc: 'A Life Calendar visualization showing your weeks as a grid — weeks lived (filled), weeks remaining (empty). A powerful reminder to use your time well.', tip: 'Birth date and life expectancy are already configured in Settings → Memento Mori.' },
            { label: '🤖 AI Weekly Review Generator', desc: 'Let AI auto-generate your Weekly Review draft by analysing your captured thoughts, completed tasks, habits, and dues from the week.', tip: 'You\'ll still review and edit — AI handles the first draft.' },
            { label: '📊 Advanced Finance Analytics', desc: 'Trend charts showing monthly spending by category, year-over-year comparisons, and a Cashflow Forecast using your recurring dues and monthly income.' },
            { label: '🔔 Habit & Task Reminders', desc: 'Native Obsidian notifications (mobile and desktop) for incomplete habits at end of day and upcoming task due dates.', tip: 'Mobile requires Obsidian\'s notification permissions to be enabled.' },
            { label: '📤 Export & Backup', desc: 'Export thoughts, tasks, and dues to CSV or JSON. Manual backup utility to snapshot all MINA data files to a zip archive.' },
            { label: '🌐 Daily Note Integration', desc: 'Deep link between Daily Workspace and Obsidian Daily Notes — append today\'s captures directly to your daily note template, and pull existing daily note content into the Workspace view.' },
        ]
    },
];

export class ManualTab extends BaseTab {
    private activeSectionId: string = 'home';
    private searchQuery: string = '';

    constructor(view: MinaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'mina-manual-wrap' });

        if (Platform.isMobile && !isTablet()) {
            this._renderMobile(wrap);
        } else {
            this._renderDesktop(wrap);
        }
    }

    // ── Desktop / Tablet: sidebar + content pane ──────────────────────────
    private _renderDesktop(root: HTMLElement) {
        root.addClass('mina-help-root');

        const header = root.createEl('div', { cls: 'mina-help-header' });
        const navRow = header.createEl('div', { cls: 'mina-manual-nav-row' });
        this.renderHomeIcon(navRow);
        const titleWrap = header.createEl('div', { cls: 'mina-help-header-title' });
        const titleIcon = titleWrap.createEl('span', { cls: 'mina-help-header-icon' });
        setIcon(titleIcon, 'lucide-book-open');
        titleWrap.createEl('h2', { text: 'MINA Manual', cls: 'mina-help-title' });
        titleWrap.createEl('p', { text: 'Your Personal Operating System', cls: 'mina-help-subtitle' });

        const searchWrap = header.createEl('div', { cls: 'mina-help-search-wrap' });
        const searchIcon = searchWrap.createEl('span', { cls: 'mina-help-search-icon' });
        setIcon(searchIcon, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'mina-help-search',
            attr: { type: 'text', placeholder: 'Search the manual…' }
        }) as HTMLInputElement;

        const body = root.createEl('div', { cls: 'mina-help-body' });
        const sidebar = body.createEl('nav', { cls: 'mina-help-sidebar' });
        const content = body.createEl('div', { cls: 'mina-help-content' });

        const renderContent = () => {
            content.empty();
            const q = this.searchQuery.toLowerCase().trim();
            if (q) { this._renderSearchResults(content, q); return; }
            const section = SECTIONS.find(s => s.id === this.activeSectionId) || SECTIONS[0];
            this._renderSectionContent(content, section);
        };

        const renderSidebar = () => {
            sidebar.empty();
            SECTIONS.forEach(s => {
                const item = sidebar.createEl('div', { cls: `mina-help-nav-item${s.id === this.activeSectionId ? ' is-active' : ''}` });
                const iconEl = item.createEl('span', { cls: 'mina-help-nav-icon' });
                setIcon(iconEl, s.icon);
                item.createEl('span', { cls: 'mina-help-nav-label', text: s.title });
                // Highlight roadmap
                if (s.id === 'roadmap') item.addClass('mina-help-nav-item--roadmap');
                item.addEventListener('click', () => {
                    this.activeSectionId = s.id;
                    this.searchQuery = '';
                    searchInput.value = '';
                    renderSidebar();
                    renderContent();
                });
            });
        };

        searchInput.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            renderContent();
        });

        renderSidebar();
        renderContent();
    }

    // ── Mobile: accordion list ─────────────────────────────────────────────
    private _renderMobile(root: HTMLElement) {
        root.addClass('mina-help-root mina-help-root--mobile');

        const header = root.createEl('div', { cls: 'mina-help-header mina-help-header--mobile' });
        const navRow = header.createEl('div', { cls: 'mina-manual-nav-row' });
        this.renderHomeIcon(navRow);
        const titleWrap = header.createEl('div', { cls: 'mina-help-header-title' });
        const titleIcon = titleWrap.createEl('span', { cls: 'mina-help-header-icon' });
        setIcon(titleIcon, 'lucide-book-open');
        titleWrap.createEl('h2', { text: 'MINA Manual', cls: 'mina-help-title' });

        const searchWrap = header.createEl('div', { cls: 'mina-help-search-wrap' });
        const searchIcon = searchWrap.createEl('span', { cls: 'mina-help-search-icon' });
        setIcon(searchIcon, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'mina-help-search',
            attr: { type: 'text', placeholder: 'Search…' }
        }) as HTMLInputElement;

        const list = root.createEl('div', { cls: 'mina-help-accordion' });

        const renderAccordion = (query: string) => {
            list.empty();
            if (query) { this._renderSearchResults(list, query.toLowerCase().trim()); return; }
            SECTIONS.forEach(s => {
                const block = list.createEl('div', { cls: `mina-help-accordion-block${s.id === 'roadmap' ? ' mina-help-accordion-block--roadmap' : ''}` });
                const trigger = block.createEl('div', { cls: 'mina-help-accordion-trigger' });
                const trigLeft = trigger.createEl('div', { cls: 'mina-help-accordion-trigger-left' });
                const iconEl = trigLeft.createEl('span', { cls: 'mina-help-nav-icon' });
                setIcon(iconEl, s.icon);
                const textCol = trigLeft.createEl('div', { cls: 'mina-help-accordion-text' });
                textCol.createEl('span', { cls: 'mina-help-accordion-title', text: s.title });
                textCol.createEl('span', { cls: 'mina-help-accordion-subtitle', text: s.subtitle });
                const chevron = trigger.createEl('span', { cls: 'mina-help-accordion-chevron' });
                setIcon(chevron, 'chevron-right');

                const bodyEl = block.createEl('div', { cls: 'mina-help-accordion-body' });
                bodyEl.style.display = 'none';

                trigger.addEventListener('click', () => {
                    const open = bodyEl.style.display !== 'none';
                    list.querySelectorAll('.mina-help-accordion-body').forEach((b: any) => b.style.display = 'none');
                    list.querySelectorAll('.mina-help-accordion-chevron').forEach((c: any) => setIcon(c as HTMLElement, 'chevron-right'));
                    if (!open) {
                        bodyEl.style.display = 'block';
                        setIcon(chevron, 'chevron-down');
                        this._renderSectionContent(bodyEl, s);
                    } else {
                        bodyEl.empty();
                    }
                });
            });
        };

        searchInput.addEventListener('input', () => { renderAccordion(searchInput.value); });
        renderAccordion('');
    }

    private _renderSectionContent(container: HTMLElement, section: HelpSection) {
        container.empty();
        const secHeader = container.createEl('div', { cls: 'mina-help-sec-header' });
        const iconEl = secHeader.createEl('span', { cls: 'mina-help-sec-icon' });
        setIcon(iconEl, section.icon);
        const secText = secHeader.createEl('div');
        secText.createEl('h3', { cls: 'mina-help-sec-title', text: section.title });
        secText.createEl('p', { cls: 'mina-help-sec-subtitle', text: section.subtitle });

        section.items.forEach(item => {
            const card = container.createEl('div', { cls: 'mina-help-item-card' });
            card.createEl('div', { cls: 'mina-help-item-label', text: item.label });
            card.createEl('div', { cls: 'mina-help-item-desc', text: item.desc });
            if (item.tip) {
                const tipRow = card.createEl('div', { cls: 'mina-help-item-tip' });
                const tipIcon = tipRow.createEl('span', { cls: 'mina-help-tip-icon' });
                setIcon(tipIcon, 'lucide-lightbulb');
                tipRow.createEl('span', { text: item.tip });
            }
        });
    }

    private _renderSearchResults(container: HTMLElement, q: string) {
        container.empty();
        let hasResults = false;
        SECTIONS.forEach(section => {
            const matchedItems = section.items.filter(item =>
                item.label.toLowerCase().includes(q) ||
                item.desc.toLowerCase().includes(q) ||
                (item.tip || '').toLowerCase().includes(q) ||
                section.title.toLowerCase().includes(q)
            );
            if (matchedItems.length === 0) return;
            hasResults = true;
            const group = container.createEl('div', { cls: 'mina-help-search-group' });
            const grpHeader = group.createEl('div', { cls: 'mina-help-search-group-header' });
            const iconEl = grpHeader.createEl('span', { cls: 'mina-help-nav-icon' });
            setIcon(iconEl, section.icon);
            grpHeader.createEl('span', { cls: 'mina-help-search-group-title', text: section.title });
            matchedItems.forEach(item => {
                const card = group.createEl('div', { cls: 'mina-help-item-card' });
                card.createEl('div', { cls: 'mina-help-item-label', text: item.label });
                card.createEl('div', { cls: 'mina-help-item-desc', text: item.desc });
                if (item.tip) {
                    const tipRow = card.createEl('div', { cls: 'mina-help-item-tip' });
                    const tipIcon = tipRow.createEl('span', { cls: 'mina-help-tip-icon' });
                    setIcon(tipIcon, 'lucide-lightbulb');
                    tipRow.createEl('span', { text: item.tip });
                }
            });
        });
        if (!hasResults) container.createEl('div', { cls: 'mina-help-empty', text: 'No results found. Try a different search term.' });
    }
}
