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
        const app = this.app;

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

        const properties: string[] = Array.isArray((data as any)?.properties) ? (data as any).properties : [];

        if (!properties.length) {
            const hint = this.containerEl.createDiv();
            hint.createEl('p', { text: 'No note properties found to display.' });
            hint.createEl('p', { text: 'Add frontmatter properties to your notes or configure the Base view to include properties.' });
            return;
        }

        // Detect property types for better input widgets
        const propertyMetadata = this.detectPropertyTypes(properties, entries);

        // Build table
        const table = this.containerEl.createEl('table', { cls: 'input-view-table' });
        const tbody = table.createEl('tbody');

        // Create rows for each property
        for (const propertyId of properties) {
            const row = tbody.createEl('tr');
            
            // First column: property name label
            const display = config?.getDisplayName?.(propertyId as `note.${string}` | `file.${string}` | `formula.${string}`) ?? propertyId;
            const labelCell = row.createEl('td', { cls: 'input-view-property-label' });
            labelCell.createEl('strong', { text: display });

            const isComputed = this.isComputedProperty(propertyId);
            const metadata = propertyMetadata.get(propertyId);

            // Subsequent columns: one cell per file
            for (const entry of entries) {
                const cell = row.createEl('td', { cls: 'input-view-cell' });
                const value = this.getValueFor(entry, propertyId);
                
                if (isComputed) {
                    // Read-only cell for computed properties
                    cell.createEl('span', { text: value, cls: 'input-view-readonly' });
                } else {
                    // Editable input cell
                    this.createEditableCell(cell, entry, propertyId, value, metadata, config);
                }
            }
        }
    }

    private createEditableCell(
        cell: HTMLElement,
        entry: any,
        propertyId: string,
        value: string,
        metadata: any,
        config: any
    ): void {
        // Try to use the native property rendering from config
        if (config && typeof config.renderProperty === 'function') {
            try {
                config.renderProperty(cell, entry, propertyId);
                return;
            } catch (err) {
                console.warn('config.renderProperty failed, falling back to manual input:', err);
            }
        }
        
        // Fallback to manual input creation
        const type = metadata?.type ?? 'text';
        const isArray = metadata?.isArray ?? false;
        const app = this.app;
        let input: HTMLInputElement;
        
        if (type === 'checkbox') {
            input = cell.createEl('input', { 
                type: 'checkbox', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            const boolValue = ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
            input.checked = boolValue;
        } else if (type === 'number') {
            input = cell.createEl('input', { 
                type: 'number', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            input.value = value ?? '';
        } else if (type === 'date') {
            input = cell.createEl('input', { 
                type: 'date', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            input.value = (value || '').substring(0, 10);
        } else {
            input = cell.createEl('input', { 
                type: 'text', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            input.value = value ?? '';
        }
        
        const commit = async () => {
            const file = entry.file;
            const propKey = this.toPropKey(propertyId);
            if (!propKey) return;
            
            try {
                const tfile = file?.path ? app.vault.getAbstractFileByPath(file.path) : null;
                if (tfile && 'extension' in tfile) {
                    await app.fileManager.processFrontMatter(tfile, (fm: Record<string, any>) => {
                        if (type === 'checkbox') {
                            fm[propKey] = input.checked;
                        } else if (type === 'number') {
                            const num = parseFloat(input.value);
                            fm[propKey] = Number.isFinite(num) ? num : input.value;
                        } else if (type === 'date') {
                            fm[propKey] = input.value;
                        } else {
                            const v = input.value;
                            fm[propKey] = isArray ? v.split(',').map(s => s.trim()).filter(Boolean) : v;
                        }
                    });
                }
            } catch (err) {
                console.error('Failed to update property', { err, file, propKey });
            }
        };
        
        input.addEventListener('change', commit);
        input.addEventListener('blur', commit);
    }

    private detectPropertyTypes(
        properties: string[], 
        entries: any[]
    ): Map<string, { type: 'checkbox' | 'number' | 'date' | 'text', isArray: boolean }> {
        const metadata = new Map();
        
        const isDateString = (s: string) => /^(\d{4}-\d{2}-\d{2})(T.*)?$/.test(s);
        const detectType = (v: any): 'checkbox' | 'number' | 'date' | 'text' => {
            if (typeof v === 'boolean') return 'checkbox';
            if (typeof v === 'number') return 'number';
            if (typeof v === 'string' && isDateString(v)) return 'date';
            if (v && typeof v === 'object' && v.date) return 'date';
            return 'text';
        };
        
        for (const pid of properties) {
            let sample: any = undefined;
            let isArray = false;
            
            for (const entry of entries) {
                try {
                    const v = entry.getValue(pid);
                    
                    if (Array.isArray(v)) {
                        isArray = true;
                        sample = v.length ? v[0] : '';
                        break;
                    }
                    
                    if (v != null) {
                        if (typeof v === 'object' && 'value' in v) {
                            sample = v.value;
                        } else {
                            sample = v;
                        }
                        break;
                    }
                } catch {
                    continue;
                }
            }
            
            metadata.set(pid, {
                type: detectType(sample),
                isArray
            });
        }
        
        return metadata;
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

    private isComputedProperty(propertyId: string): boolean {
        return propertyId.startsWith('file.') || propertyId.startsWith('formula.');
    }

    private toPropKey(propertyId: string): string | null {
        if (!propertyId) return null;
        if (this.isComputedProperty(propertyId)) return null;
        // Convert Bases property id (e.g., note.title) to frontmatter key (e.g., title)
        if (propertyId.startsWith('note.')) return propertyId.substring('note.'.length);
        const parts = propertyId.split(':');
        return parts.length > 1 ? parts[parts.length - 1] : propertyId;
    }
}
