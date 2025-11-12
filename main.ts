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
        // Initial render will happen in onDataUpdated
        this.containerEl.empty();
    }

    public onClose(): void {
        // Clean up DOM for view switch
        this.containerEl.empty();
    }

    public onDataUpdated(): void {
        const data = (this as any).data ?? (this as any).controller?.result;
        const config = (this as any).config ?? (this as any).controller?.config;
        const app = (this as any).app;

        // Clear and rebuild table
        this.containerEl.empty();

        if (!data || !config) {
            this.containerEl.createDiv({ text: 'No data available.' });
            return;
        }

        // Extract entries from data
        const entries: any[] = this.normalizeEntries(data);
        const files: any[] = entries.map((e: any) => e?.file ?? e?.note ?? e?.tfile ?? e).filter(Boolean);

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
            const display = config.getDisplayName ? config.getDisplayName(propertyId) : String(propertyId);
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
                    // Editable input
                    this.createInputCell(cell, entry, propertyId, raw, metadata, app, config);
                }
            }
        }
    }

    private normalizeEntries(data: any): any[] {
        try {
            const e = data?.entries;
            if (Array.isArray(e)) return e;
            
            // Handle Map-like entries
            if (e && typeof e.entries === 'function') {
                const pairs = Array.from(e.entries());
                return pairs.map(([key, val]: [any, any]) => {
                    const vObj: any = val;
                    const values = vObj && typeof vObj === 'object' && 'values' in vObj ? vObj.values : vObj;
                    return {
                        file: key?.file ?? key,
                        values
                    };
                });
            }
            
            // Handle keys/get pattern
            if (e && typeof e.keys === 'function' && typeof e.get === 'function') {
                const arr: any[] = [];
                for (const k of Array.from(e.keys())) {
                    const v: any = e.get(k);
                    const values = v && typeof v === 'object' && 'values' in v ? (v as any).values : v;
                    const kk: any = k;
                    const file = kk && typeof kk === 'object' && 'file' in kk ? (kk as any).file : kk;
                    arr.push({ file, values });
                }
                return arr;
            }
            
            // Handle forEach pattern
            if (e && typeof e.forEach === 'function') {
                const arr: any[] = [];
                e.forEach((v: any, k: any) => {
                    const values = v && typeof v === 'object' && 'values' in v ? (v as any).values : v;
                    arr.push({ file: k?.file ?? k, values });
                });
                return arr;
            }
            
            // Fallback patterns
            const rows = data?.rows;
            if (Array.isArray(rows)) return rows;
            
            const items = data?.items;
            if (Array.isArray(items)) return items;
            
            // Files + values pattern
            const filesArr = data?.files;
            if (Array.isArray(filesArr)) {
                const values = data?.values;
                return filesArr.map((f: any) => ({
                    file: f,
                    values: values?.get?.(f) ?? values?.[f?.path] ?? values?.[f?.name] ?? values?.[f?.basename]
                }));
            }
            
            return [];
        } catch {
            return [];
        }
    }

    private getProperties(entries: any[], config: any): string[] {
        try {
            // Try to get ordered properties from config
            const ordered = config.getOrder?.();
            if (Array.isArray(ordered) && ordered.length) {
                return ordered;
            }
            
            // Otherwise collect all unique property IDs from entries
            const ids = new Set<string>();
            for (const entry of entries) {
                const vals = entry?.values;
                if (!vals) continue;
                
                if (vals?.entries && typeof vals.entries === 'function') {
                    for (const [pid] of vals.entries()) {
                        ids.add(String(pid));
                    }
                } else if (typeof vals?.forEach === 'function') {
                    vals.forEach((_v: any, pid: any) => ids.add(String(pid)));
                } else if (typeof vals === 'object') {
                    for (const pid of Object.keys(vals)) {
                        ids.add(String(pid));
                    }
                }
            }
            
            const properties = Array.from(ids);
            
            // Sort alphabetically if no explicit order
            if (!ordered || !ordered.length) {
                properties.sort();
            }
            
            return properties;
        } catch {
            return [];
        }
    }

    private isComputedProperty(propertyId: string): boolean {
        return propertyId.startsWith('file.') || propertyId.startsWith('formula:');
    }

    private detectPropertyTypes(properties: string[], entries: any[]): Map<string, { type: 'checkbox' | 'number' | 'date' | 'text', isArray: boolean }> {
        const metadata = new Map();
        
        const isDateString = (s: string) => /^(\d{4}-\d{2}-\d{2})(T.*)?$/.test(s);
        const detectType = (v: any): 'checkbox' | 'number' | 'date' | 'text' => {
            if (typeof v === 'boolean') return 'checkbox';
            if (typeof v === 'number') return 'number';
            if (typeof v === 'string' && isDateString(v)) return 'date';
            return 'text';
        };
        
        for (const pid of properties) {
            let sample: any = undefined;
            let isArray = false;
            
            for (const entry of entries) {
                const vals = entry?.values;
                let v: any;
                
                if (vals?.get) {
                    v = vals.get(pid);
                } else if (vals && typeof vals === 'object') {
                    v = vals[pid];
                }
                
                if (Array.isArray(v)) {
                    isArray = true;
                    sample = v.length ? v[0] : '';
                    break;
                }
                
                if (v != null) {
                    sample = v;
                    break;
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
        const vals = entry?.values;
        if (!vals) return '';
        
        const formatValue = (v: any) => {
            if (v == null) return '';
            if (Array.isArray(v)) return v.join(', ');
            if (typeof v === 'object' && 'value' in v) return String(v.value);
            return String(v);
        };
        
        try {
            // Try Map-like access
            if (typeof vals.get === 'function') {
                let v = vals.get(propertyId);
                
                // Fallback: search by matching key
                if (v === undefined && typeof vals.entries === 'function') {
                    for (const [k, vv] of vals.entries()) {
                        if (this.matchPropertyKey(propertyId, k)) {
                            v = vv;
                            break;
                        }
                    }
                }
                
                return formatValue(v);
            }
            
            // Try object access
            if (propertyId in vals) {
                return formatValue(vals[propertyId]);
            }
            
            // Search object entries
            for (const [k, v] of Object.entries(vals)) {
                if (this.matchPropertyKey(propertyId, k)) {
                    return formatValue(v);
                }
            }
            
            // Fallback to frontmatter
            const file = entry?.file ?? entry?.note ?? entry?.tfile;
            const propKey = this.toPropKey(propertyId);
            if (file?.path && propKey) {
                const tfile = app.vault.getAbstractFileByPath(file.path);
                const cache = app.metadataCache?.getFileCache?.(tfile);
                const fm = cache?.frontmatter;
                if (fm && propKey in fm) {
                    return formatValue(fm[propKey]);
                }
            }
            
            return '';
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
        
        const parts = propertyId.split(':');
        return parts.length > 1 ? parts[1] : propertyId;
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
