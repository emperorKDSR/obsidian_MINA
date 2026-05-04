import { App, TFile, FuzzySuggestModal, moment } from 'obsidian';

export class ChatSessionPickerModal extends FuzzySuggestModal<TFile> {
    files: TFile[];
    onChoose: (file: TFile) => void;

    constructor(app: App, files: TFile[], onChoose: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onChoose = onChoose;
        this.setPlaceholder('Select a saved chat session…');
    }

    getItems(): TFile[] { return this.files; }

    getItemText(file: TFile): string {
        return `${file.basename} (${moment(file.stat.mtime).locale('en').format('YYYY-MM-DD HH:mm')})`;
    }

    onChooseItem(file: TFile): void { this.onChoose(file); }
}
