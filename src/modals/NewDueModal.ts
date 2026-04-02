import { App, Modal, Notice, moment } from 'obsidian';

export class NewDueModal extends Modal {
    pfFolder: string;
    onSubmit: () => void;

    constructor(app: App, pfFolder: string, onSubmit: () => void) {
        super(app);
        this.pfFolder = pfFolder;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Add Recurring Due', attr: { style: 'margin-top: 0; color: var(--text-accent);' } });

        const main = contentEl.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 15px;' } });

        // Payable Name
        const nameCol = main.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        nameCol.createEl('label', { text: 'Payable Name (e.g. Electricity)', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const nameInput = nameCol.createEl('input', { type: 'text', placeholder: 'Enter name...', attr: { style: 'padding: 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });

        // Folder
        const folderCol = main.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        folderCol.createEl('label', { text: 'Save in Folder', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const folderInput = folderCol.createEl('input', { type: 'text', value: this.pfFolder, attr: { style: 'padding: 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });

        // Grid for Dates/Amount
        const grid = main.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 15px;' } });

        const dCol = grid.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        dCol.createEl('label', { text: 'Next Due Date', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const dInput = dCol.createEl('input', { type: 'date', value: moment().format('YYYY-MM-DD'), attr: { style: 'padding: 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });

        const lCol = grid.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        lCol.createEl('label', { text: 'Last Payment Date', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const lInput = lCol.createEl('input', { type: 'date', attr: { style: 'padding: 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });

        const aCol = grid.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        aCol.createEl('label', { text: 'Amount', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const aInput = aCol.createEl('input', { type: 'text', placeholder: '0.00', attr: { style: 'padding: 8px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });

        // Notes
        const notesCol = main.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        notesCol.createEl('label', { text: 'Initial Notes', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const notesArea = notesCol.createEl('textarea', { attr: { style: 'width: 100%; height: 80px; resize: none; padding: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });

        // Footer Actions
        const footer = main.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;' } });
        const cancelBtn = footer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 8px 20px;' } });
        const saveBtn = footer.createEl('button', { text: 'Create Payable', attr: { style: 'padding: 8px 25px; background-color: var(--interactive-accent); color: var(--text-on-accent); font-weight: 600;' } });

        cancelBtn.onclick = () => this.close();
        saveBtn.onclick = async () => {
            const name = nameInput.value.trim();
            if (!name) { new Notice('Name is required'); return; }
            
            try {
                const folder = folderInput.value.trim().replace(/\/$/, '');
                const fileP = folder ? `${folder}/${name}.md` : `${name}.md`;

                if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
                    await this.app.vault.createFolder(folder);
                }

                if (this.app.vault.getAbstractFileByPath(fileP)) {
                    new Notice('A file with this name already exists');
                    return;
                }

                const content = `---
category: recurring payment
active_status: true
next_duedate: ${dInput.value}
last_payment: ${lInput.value || ''}
amount: ${aInput.value || '0.00'}
---

${notesArea.value}
`;
                await this.app.vault.create(fileP, content);
                new Notice(`Created ${name}`);
                this.onSubmit();
                this.close();
            } catch (e: any) {
                new Notice(`Error creating payable: ${e.message}`);
            }
        };

        setTimeout(() => nameInput.focus(), 10);
    }

    onClose() {
        this.contentEl.empty();
    }
}
