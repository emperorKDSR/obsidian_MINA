import { App, Modal, Setting, Notice } from 'obsidian';
import DiwaPlugin from '../main';
import { Habit } from '../types';

export class HabitConfigModal extends Modal {
    plugin: DiwaPlugin;

    constructor(app: App, plugin: DiwaPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('diwa-modern-modal');

        modalEl.style.padding = '0';
        modalEl.style.borderRadius = '16px';
        modalEl.style.overflow = 'hidden';
        modalEl.style.border = '1px solid var(--background-modifier-border)';
        modalEl.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
        modalEl.style.maxWidth = '500px';

        const header = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-bottom: 1px solid var(--background-modifier-border-faint); display: flex; align-items: center; justify-content: space-between;' }
        });
        header.createEl('h3', { text: 'Habit Lab Configuration', attr: { style: 'margin: 0; font-size: 1.1em; font-weight: 700;' } });
        
        const closeBtn = header.createEl('button', { text: '×', attr: { style: 'background: transparent; border: none; font-size: 1.5em; cursor: pointer; color: var(--text-muted); line-height: 1;' } });
        closeBtn.addEventListener('click', () => this.close());

        const body = contentEl.createEl('div', { attr: { style: 'padding: 20px; display: flex; flex-direction: column; gap: 12px; max-height: 60vh; overflow-y: auto;' } });

        const renderHabits = () => {
            body.empty();
            
            const activeHabits = this.plugin.settings.habits.filter(h => !h.archived);
            const archivedHabits = this.plugin.settings.habits.filter(h => h.archived);

            if (activeHabits.length === 0 && archivedHabits.length === 0) {
                body.createEl('p', { text: 'No habits defined yet.', attr: { style: 'color: var(--text-muted); font-size: 0.85em; text-align: center; font-style: italic;' } });
            }

            this.plugin.settings.habits.forEach((habit, index) => {
                if (habit.archived) return; // archived rendered below
                const row = body.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--background-modifier-border-faint);' } });
                
                const iconInp = row.createEl('input', { type: 'text', attr: { value: habit.icon, placeholder: 'Icon', style: 'width: 40px; text-align: center; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 4px;' } });
                iconInp.addEventListener('change', async () => { habit.icon = iconInp.value; await this.plugin.saveSettings(); });

                const nameInp = row.createEl('input', { type: 'text', attr: { value: habit.name, placeholder: 'Habit Name', style: 'flex: 1; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 4px 8px;' } });
                nameInp.addEventListener('change', async () => { habit.name = nameInp.value; await this.plugin.saveSettings(); });

                // Archive button (QW-06) — preserves historical data
                const archBtn = row.createEl('button', { attr: { title: 'Archive habit', style: 'background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8em; padding: 4px 6px; border-radius: 4px;' } });
                archBtn.innerHTML = '📦';
                archBtn.addEventListener('click', async () => {
                    habit.archived = true;
                    await this.plugin.saveSettings();
                    renderHabits();
                });
            });

            if (archivedHabits.length > 0) {
                body.createEl('p', { text: 'ARCHIVED', attr: { style: 'font-size: 0.7em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); margin: 12px 0 6px;' } });
                this.plugin.settings.habits.forEach((habit) => {
                    if (!habit.archived) return;
                    const row = body.createEl('div', { attr: { style: 'display: flex; align-items: center; gap: 8px; padding-bottom: 8px; opacity: 0.6;' } });
                    row.createEl('span', { text: `${habit.icon || '●'} ${habit.name}`, cls: 'diwa-habit-list-label' });
                    const restoreBtn = row.createEl('button', { attr: { title: 'Restore habit', style: 'background: transparent; border: none; color: var(--interactive-accent); cursor: pointer; font-size: 0.75em; font-weight: 700;' } });
                    restoreBtn.textContent = 'Restore';
                    restoreBtn.addEventListener('click', async () => {
                        habit.archived = false;
                        await this.plugin.saveSettings();
                        renderHabits();
                    });
                });
            }

            const addRow = body.createEl('div', { attr: { style: 'margin-top: 10px;' } });
            const addBtn = addRow.createEl('button', { 
                text: '+ Add New Habit', 
                attr: { style: 'width: 100%; padding: 8px; border-radius: 8px; border: 1px dashed var(--background-modifier-border); background: transparent; color: var(--text-muted); font-size: 0.8em; font-weight: 600; cursor: pointer;' } 
            });
            addBtn.addEventListener('click', async () => {
                this.plugin.settings.habits.push({ id: Date.now().toString(), name: 'New Habit', icon: '✨' });
                await this.plugin.saveSettings();
                renderHabits();
            });
        };

        renderHabits();

        const footer = contentEl.createEl('div', {
            attr: { style: 'padding: 16px 20px; background: var(--background-secondary-alt); border-top: 1px solid var(--background-modifier-border-faint); display: flex; justify-content: flex-end;' }
        });
        const doneBtn = footer.createEl('button', { text: 'Done', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); border: none; padding: 8px 24px; border-radius: 8px; font-weight: 700; cursor: pointer;' } });
        doneBtn.addEventListener('click', () => this.close());
    }
}


