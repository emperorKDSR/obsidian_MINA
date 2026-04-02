import { TFile, FuzzySuggestModal } from 'obsidian';

export class ChatSessionPickerModal extends FuzzySuggestModal<TFile> {
    files: TFile[];
    onChoose: (file: TFile) => void;

    constructor(app: any, files: TFile[], onChoose: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onChoose = onChoose;
        this.setPlaceholder('Select a saved chat session...');
    }

    getItems(): TFile[] {
        return this.files;
    }

    getItemText(item: TFile): string {
        return item.basename.replace(/^MINA Chat /, '');
    }

    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}
