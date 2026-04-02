import { App, Modal, TFile, Notice, moment } from 'obsidian';
import { DueEntry } from '../types';

export class PaymentModal extends Modal {
    entry: DueEntry;
    onSave: (paymentDate: string, nextDue: string, notes: string, files: File[]) => void;
    quickDate: string;

    constructor(app: App, entry: DueEntry, quickDate: string, onSave: (p: string, n: string, notes: string, files: File[]) => void) {
        super(app);
        this.entry = entry;
        this.quickDate = quickDate;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: `Pay: ${this.entry.title}`, attr: { style: 'margin-top: 0; color: var(--text-accent);' } });

        const main = contentEl.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 20px;' } });

        // Dates Row
        const datesRow = main.createEl('div', { attr: { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 15px;' } });
        
        const pCol = datesRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        pCol.createEl('label', { text: 'Payment Date', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const pInput = pCol.createEl('input', { type: 'date', value: this.quickDate || moment().format('YYYY-MM-DD'), attr: { style: 'padding: 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border);' } });

        const nCol = datesRow.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        nCol.createEl('label', { text: 'Next Due Date', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const nInput = nCol.createEl('input', { type: 'date', value: moment(pInput.value).add(1, 'month').format('YYYY-MM-DD'), attr: { style: 'padding: 6px; border-radius: 4px; border: 1px solid var(--background-modifier-border);' } });

        pInput.addEventListener('change', () => {
            nInput.value = moment(pInput.value).add(1, 'month').format('YYYY-MM-DD');
        });

        // Notes & Snippet Reference
        const notesCol = main.createEl('div', { attr: { style: 'display: flex; flex-direction: column; gap: 5px;' } });
        notesCol.createEl('label', { text: 'Notes / Snippet / Reference', attr: { style: 'font-size: 0.85em; font-weight: 600;' } });
        const textArea = notesCol.createEl('textarea', { 
            placeholder: 'Paste screenshots or type confirmation numbers...',
            attr: { style: 'width: 100%; height: 120px; resize: none; padding: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);' } 
        });

        // Paste Handling for Images
        const previewContainer = notesCol.createEl('div', { attr: { style: 'display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;' } });
        const attachedFiles: File[] = [];

        const addFilePreview = (file: File) => {
            const wrap = previewContainer.createEl('div', { attr: { style: 'position: relative; width: 60px; height: 60px; border: 1px solid var(--background-modifier-border); border-radius: 4px; overflow: hidden; background-color: var(--background-secondary);' } });
            if (file.type.startsWith('image/')) {
                const img = wrap.createEl('img', { attr: { style: 'width: 100%; height: 100%; object-fit: cover;' } });
                const reader = new FileReader();
                reader.onload = (e) => img.src = e.target?.result as string;
                reader.readAsDataURL(file);
            } else {
                wrap.createEl('div', { text: '📎', attr: { style: 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.5em;' } });
            }
            const remove = wrap.createEl('div', { text: '✕', attr: { style: 'position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.5); color: white; width: 16px; height: 16px; font-size: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer;' } });
            remove.onclick = () => {
                const idx = attachedFiles.indexOf(file);
                if (idx > -1) attachedFiles.splice(idx, 1);
                wrap.remove();
            };
            attachedFiles.push(file);
        };

        textArea.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) addFilePreview(file);
                }
            }
        });

        // File Attachment Button
        const fileRow = main.createEl('div', { attr: { style: 'display: flex; justify-content: space-between; align-items: center;' } });
        const fileInput = fileRow.createEl('input', { type: 'file', attr: { style: 'display: none;', multiple: 'multiple' } });
        const attachBtn = fileRow.createEl('button', { text: '📎 Attach Files', attr: { style: 'font-size: 0.85em; padding: 4px 10px;' } });
        attachBtn.onclick = () => fileInput.click();
        fileInput.onchange = () => {
            if (fileInput.files) {
                for (let i = 0; i < fileInput.files.length; i++) {
                    addFilePreview(fileInput.files[i]);
                }
            }
        };

        // Footer Actions
        const footer = main.createEl('div', { attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;' } });
        const cancelBtn = footer.createEl('button', { text: 'Cancel', attr: { style: 'padding: 8px 20px;' } });
        const saveBtn = footer.createEl('button', { text: 'Save Payment', attr: { style: 'padding: 8px 25px; background-color: var(--interactive-accent); color: var(--text-on-accent); font-weight: 600;' } });

        cancelBtn.onclick = () => this.close();
        saveBtn.onclick = () => {
            this.onSave(pInput.value, nInput.value, textArea.value, attachedFiles);
            this.close();
        };

        // Focus text area initially
        setTimeout(() => textArea.focus(), 10);
    }

    onClose() {
        this.contentEl.empty();
    }
}
