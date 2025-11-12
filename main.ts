import { BasesView, Plugin } from 'obsidian';

export const INPUT_VIEW_TYPE = 'input-view';

export default class InputViewPlugin extends Plugin {
    async onload() {
        this.registerBasesView(INPUT_VIEW_TYPE, {
            name: 'Input view',
            icon: 'lucide-pencil',
            factory: (controller, containerEl) => {
                return new InputBasesView(controller, containerEl);
            },
        });
    }
}

class InputBasesView extends BasesView {
    readonly type = INPUT_VIEW_TYPE;
    private containerEl: HTMLElement;

    constructor(controller: any, parentEl: HTMLElement) {
        super(controller);
        this.containerEl = parentEl.createDiv('input-view-container');
    }

    public onDataUpdated(): void {
        const data = (this as any).data ?? (this as any).controller?.result;
        const config = (this as any).config ?? (this as any).controller?.config;
        const app = (this as any).app;

        this.containerEl.empty();

        if (!data || !config) {
            this.containerEl.createDiv({ text: 'No data available.' });
            return;
        }

        const files: any[] = data.entries?.map((e: any) => e.file) ?? [];
        const properties: any[] = config.getOrder ? config.getOrder() : [];

        const table = this.containerEl.createEl('table', { cls: 'input-view-table' });
        const thead = table.createEl('thead');
        const headRow = thead.createEl('tr');
        headRow.createEl('th', { text: 'Property' });
        for (const file of files) {
            headRow.createEl('th', { text: file?.name ?? file?.path ?? 'File' });
        }

        const tbody = table.createEl('tbody');

        const valueFor = (entry: any, propertyId: any) => {
            try {
                const v = entry.values?.get ? entry.values.get(propertyId) : entry.values?.[propertyId];
                if (v == null) return '';
                if (Array.isArray(v)) return v.join(', ');
                if (typeof v === 'object' && 'value' in v) return String(v.value);
                return String(v);
            } catch {
                return '';
            }
        };

        const toPropKey = (pid: string) => {
            // Convert a Bases property id to a frontmatter key when possible.
            // e.g. 'property:title' -> 'title'; skip file.* and formulas.
            if (!pid) return null;
            if (pid.startsWith('file.')) return null;
            const parts = pid.split(':');
            return parts.length > 1 ? parts[1] : pid;
        };

        for (const propertyId of properties) {
            const row = tbody.createEl('tr');
            const propName = config.getDisplayName ? config.getDisplayName(propertyId) : String(propertyId);
            row.createEl('th', { text: propName });

            for (let i = 0; i < data.entries.length; i++) {
                const entry = data.entries[i];
                const cell = row.createEl('td');
                const input = cell.createEl('input', { type: 'text', cls: 'input-view-cell-input' });
                input.value = valueFor(entry, propertyId);

                input.addEventListener('change', async () => {
                    const file = entry.file;
                    const propKey = toPropKey(propertyId);
                    if (!propKey) return; // non-editable (file.*, formula, etc.)

                    try {
                        // Resolve TFile from entry.file
                        const tfile = file && file.path ? app.vault.getAbstractFileByPath(file.path) : null;
                        if (tfile && 'extension' in tfile) {
                            await app.fileManager.processFrontMatter(tfile as any, (fm: Record<string, any>) => {
                                fm[propKey] = input.value;
                            });
                        }
                    } catch (err) {
                        console.error('Failed to update property', { err, file, propKey });
                    }
                });
            }
        }
    }
}
