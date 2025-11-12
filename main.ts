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
        
        // Optional: Add styles for the input view
        // You may want to add a styles.css file with:
        // .input-view-table { width: 100%; border-collapse: collapse; }
        // .input-view-table th, .input-view-table td { border: 1px solid var(--background-modifier-border); padding: 8px; }
        // .input-view-cell-input { width: 100%; box-sizing: border-box; }
    }
}

class InputBasesView extends BasesView {
    readonly type = INPUT_VIEW_TYPE;
    private containerEl: HTMLElement;
    private controllerRef: any;

    constructor(controller: any, parentEl: HTMLElement) {
        super(controller);
        this.controllerRef = controller;
        this.containerEl = parentEl.createDiv('input-view-container');
    }

    public onOpen(): void {
        // Render will happen in onDataUpdated when data is available
        this.containerEl.empty();
        this.containerEl.createDiv({ text: 'Loading...' });
    }

    public onClose(): void {
        // Clean up DOM
        this.containerEl.empty();
    }

    public onDataUpdated(): void {
        // Access data from the inherited property
        const data = this.data;
        const config = this.config;
        const app = this.app;
        const controller = this.controllerRef;

        // Clear and rebuild table
        this.containerEl.empty();

        if (!data || !config) {
            this.containerEl.createDiv({ text: 'No data available.' });
            return;
        }

        // Extract entries from data
        const entries: any[] = this.normalizeEntries(data);
        
        if (!entries || !entries.length) {
            this.containerEl.createDiv({ text: 'No files in this base.' });
            return;
        }
        
        const files: any[] = entries.map((entry: any) => entry?.file).filter(Boolean);

        if (!files.length) {
            this.containerEl.createDiv({ text: 'No files in this base.' });
            return;
        }

        // Get property list
        const properties: string[] = this.getProperties(entries, config);

        if (!properties.length) {
            const hint = this.containerEl.createDiv();
            hint.createEl('p', { text: 'No note properties found to display.' });
            hint.createEl('p', { text: 'Add frontmatter properties to your notes or configure the Base view to include properties.' });
            return;
        }

        // Detect property types
        const propertyMetadata = this.detectPropertyTypes(properties, entries);

        // Build table
        const table = this.containerEl.createEl('table', { cls: 'input-view-table' });
        const thead = table.createEl('thead');
        const headRow = thead.createEl('tr');
        headRow.createEl('th', { text: 'Property' });

        // Add column headers (file names)
        for (const file of files) {
            const name = file?.basename ?? file?.name ?? file?.title ?? file?.path ?? 'File';
            headRow.createEl('th', { text: String(name) });
        }

        const tbody = table.createEl('tbody');

        // Create rows for each property
        for (const propertyId of properties) {
            const row = tbody.createEl('tr');
            // Get display name from config, fallback to property ID
            const display = config?.getDisplayName ? config.getDisplayName(propertyId as `note.${string}` | `file.${string}` | `formula.${string}`) : propertyId;
            row.createEl('th', { text: display });

            const isComputed = this.isComputedProperty(propertyId);
            const metadata = propertyMetadata.get(propertyId);

            // Create cells for each file
            for (const entry of entries) {
                const cell = row.createEl('td');
                const raw = this.getValueFor(entry, propertyId, app);

                if (isComputed) {
                    // Read-only cell
                    cell.createEl('span', { text: raw ?? '' });
                } else {
                    // Use Bases controller to render the proper widget, which handles saving
                    try {
                        if (controller?.renderPropertyWidget) {
                            controller.renderPropertyWidget(cell, entry, propertyId);
                        } else if (controller?.renderProperty) {
                            controller.renderProperty(cell, entry, propertyId);
                        } else {
                            // Fallback to text if no renderer is available
                            cell.createEl('span', { text: raw ?? '' });
                        }
                    } catch (err) {
                        console.error('Failed to render property widget:', err);
                        cell.createEl('span', { text: raw ?? '' });
                    }
                }
            }
        }
    }

    private normalizeEntries(data: any): any[] {
        // data should have a .data property that contains the array of entries
        const entries = data?.data;
        
        if (!entries) {
            return [];
        }
        
        if (!Array.isArray(entries)) {
            return [];
        }
        
        return entries;
    }

    private getProperties(entries: any[], config: any): string[] {
        try {
            // Prefer explicit order from config if provided
            const ordered = typeof config?.getOrder === 'function' ? config.getOrder() : undefined;
            if (Array.isArray(ordered) && ordered.length) {
                return ordered as string[];
            }

            const ids = new Set<string>();
            const app = this.app as any;

            for (const entry of entries) {
                const file = entry?.file;
                const path = file?.path;
                if (!path) continue;
                try {
                    const tfile = app.vault.getAbstractFileByPath(path);
                    const cache = app.metadataCache?.getFileCache?.(tfile);
                    const fm = cache?.frontmatter;
                    if (fm && typeof fm === 'object') {
                        for (const key of Object.keys(fm)) {
                            if (key === 'position') continue;
                            ids.add(`note.${String(key)}`);
                        }
                    }
                } catch {}
            }

            const properties = Array.from(ids);
            properties.sort();
            return properties;
        } catch {
            return [];
        }
    }

    private isComputedProperty(propertyId: string): boolean {
        return propertyId.startsWith('file.') || propertyId.startsWith('formula.');
    }

    private detectPropertyTypes(properties: string[], entries: any[]): Map<string, { type: 'checkbox' | 'number' | 'date' | 'text', isArray: boolean }> {
        const metadata = new Map();
        
        const isDateString = (s: string) => /^(\d{4}-\d{2}-\d{2})(T.*)?$/.test(s);
        const detectType = (v: any): 'checkbox' | 'number' | 'date' | 'text' => {
            if (typeof v === 'boolean') return 'checkbox';
            if (typeof v === 'number') return 'number';
            if (typeof v === 'string' && isDateString(v)) return 'date';
            // Check for Date objects from Value wrappers
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
                        // Unwrap Value objects
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

    private getValueFor(entry: any, propertyId: string, app: any): string {
        // Use the getValue method from the entry object
        try {
            const value = entry.getValue(propertyId);
            
            if (value == null || value === undefined) {
                return '';
            }
            
            // Handle different value types
            if (Array.isArray(value)) {
                return value.join(', ');
            }
            
            // Handle Value objects (Bases wraps values in Value objects)
            if (typeof value === 'object' && value !== null) {
                // Check for date property
                if (value.date) {
                    return value.date.toISOString().substring(0, 10);
                }
                // Check for value property
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

    private matchPropertyKey(propertyId: string, key: any): boolean {
        if (key == null) return false;
        
        if (typeof key === 'string') {
            return key === propertyId || 
                   key.endsWith(`:${propertyId}`) || 
                   propertyId.endsWith(`:${key}`);
        }
        
        const keyId = key.id ?? key.name ?? key.key;
        if (keyId == null) return false;
        
        const ks = String(keyId);
        return ks === propertyId || 
               ks.endsWith(`:${propertyId}`) || 
               propertyId.endsWith(`:${ks}`);
    }

    private toPropKey(propertyId: string): string | null {
        if (!propertyId) return null;
        if (this.isComputedProperty(propertyId)) return null;
        // Convert Bases property id (e.g., note.title) to frontmatter key (e.g., title)
        if (propertyId.startsWith('note.')) return propertyId.substring('note.'.length);
        const parts = propertyId.split(':');
        return parts.length > 1 ? parts[parts.length - 1] : propertyId;
    }

    private createInputCell(
        cell: HTMLTableCellElement,
        entry: any,
        propertyId: string,
        rawValue: string,
        metadata: any,
        app: any,
        config: any
    ): void {
        // Prefer Bases controller property renderer for correct saving behavior
        const controller = this.controllerRef;
        try {
            if (controller?.renderPropertyWidget) {
                controller.renderPropertyWidget(cell, entry, propertyId);
                return;
            }
            if (controller?.renderProperty) {
                controller.renderProperty(cell, entry, propertyId);
                return;
            }
        } catch (error) {
            console.error('Failed to render property widget:', error);
        }
        const type = metadata?.type ?? 'text';
        const isArray = metadata?.isArray ?? false;
        let input: HTMLInputElement;
        
        if (type === 'checkbox') {
            input = cell.createEl('input', { 
                type: 'checkbox', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            input.checked = ['true', '1', 'yes', 'on'].includes(String(rawValue).toLowerCase());
        } else if (type === 'number') {
            input = cell.createEl('input', { 
                type: 'number', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            input.value = rawValue ?? '';
        } else if (type === 'date') {
            input = cell.createEl('input', { 
                type: 'date', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            input.value = (rawValue || '').substring(0, 10);
        } else {
            input = cell.createEl('input', { 
                type: 'text', 
                cls: 'input-view-cell-input' 
            }) as HTMLInputElement;
            input.value = rawValue ?? '';
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
}
