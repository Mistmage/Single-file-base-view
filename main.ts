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

    public onOpen(): void {
        this.containerEl.empty();
        this.containerEl.createDiv({ text: 'Loading...' });
    }

    public onClose(): void {
        this.containerEl.empty();
    }

    public onDataUpdated(): void {
        const data = this.data;
        const config = this.config;
        const controller = (this as any).controller;

        this.containerEl.empty();

        if (!data || !config) {
            this.containerEl.createDiv({ text: 'No data available.' });
            return;
        }

        const entries: any[] = data?.data;
        
        if (!entries || !entries.length) {
            this.containerEl.createDiv({ text: 'No files in this base.' });
            return;
        }

        const files: any[] = entries.map((entry: any) => entry?.file).filter(Boolean);

        // Collect properties: prefer config order; fallback to frontmatter keys
        let properties: string[] = [];
        try {
            const order = config?.getOrder?.();
            if (Array.isArray(order) && order.length) {
                properties = order
                    .map((p: any) => (typeof p === 'string' ? p : String(p)))
                    .filter(Boolean);
            } else {
                const unique = new Set<string>();
                const metadataCache = (this.app as any)?.metadataCache;
                for (const entry of entries) {
                    const file = entry?.file;
                    const fm = metadataCache?.getFileCache?.(file)?.frontmatter;
                    if (fm && typeof fm === 'object') {
                        for (const key of Object.keys(fm)) {
                            // Skip positional metadata object
                            if (key === 'position') continue;
                            unique.add(`note.${key}`);
                        }
                    }
                }
                properties = Array.from(unique);
            }
        } catch {
            properties = [];
        }

        if (!properties.length) {
            const hint = this.containerEl.createDiv();
            hint.createEl('p', { text: 'No note properties found to display.' });
            hint.createEl('p', { text: 'Add frontmatter properties to your notes or configure the Base view to include properties.' });
            return;
        }

        // Build table
        const table = this.containerEl.createEl('table', { cls: 'input-view-table' });
        const tbody = table.createEl('tbody');

        // Create rows for each property
        for (const propertyId of properties) {
            const row = tbody.createEl('tr');
            
            // First column: property name label
            const display = config?.getDisplayName?.(propertyId as `note.${string}` | `formula.${string}` | `file.${string}`) ?? propertyId;
            const labelCell = row.createEl('td', { cls: 'input-view-property-label' });
            labelCell.createEl('strong', { text: display });

            const isComputed = propertyId.startsWith('file.') || propertyId.startsWith('formula.');

            // Subsequent columns: one cell per file
            for (const entry of entries) {
                const cell = row.createEl('td', { cls: 'input-view-cell' });
                
                if (isComputed) {
                    // Read-only cell for computed properties
                    const value = this.getValueFor(entry, propertyId);
                    cell.createEl('span', { text: value, cls: 'input-view-readonly' });
                } else {
                    // Editable cell using Obsidian's property widget
                    this.renderPropertyWidget(cell, entry, propertyId, controller);
                }
            }
        }
    }

    private renderPropertyWidget(cell: HTMLElement, entry: any, propertyId: string, controller: any): void {
        try {
            // Use the controller's property rendering method
            // This is how the default table view renders editable properties
            if (controller?.renderProperty) {
                controller.renderProperty(cell, entry, propertyId);
            } else if (controller?.renderPropertyWidget) {
                controller.renderPropertyWidget(cell, entry, propertyId);
            } else {
                // Fallback: render as plain text if no rendering method available
                const value = this.getValueFor(entry, propertyId);
                cell.createEl('span', { text: value });
            }
        } catch (error) {
            console.error('Failed to render property widget:', error);
            // Fallback to plain text display
            const value = this.getValueFor(entry, propertyId);
            cell.createEl('span', { text: value });
        }
    }

    private getValueFor(entry: any, propertyId: string): string {
        try {
            const value = entry.getValue(propertyId);
            
            if (value == null || value === undefined) {
                return '';
            }
            
            if (Array.isArray(value)) {
                return value.join(', ');
            }
            
            if (typeof value === 'object' && value !== null) {
                if (value.date) {
                    return value.date.toISOString().substring(0, 10);
                }
                if ('value' in value) {
                    const v = value.value;
                    if (Array.isArray(v)) {
                        return v.join(', ');
                    }
                    return String(v);
                }
            }
            
            return String(value);
        } catch {
            return '';
        }
    }
}
