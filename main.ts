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
    private tableEl?: HTMLTableElement;

    constructor(controller: any, parentEl: HTMLElement) {
        super(controller);
        this.containerEl = parentEl.createDiv('input-view-container');
    }

    public onOpen(): void {
        // Prepare initial structure; actual rows render on data updates.
        this.containerEl.empty();
        this.tableEl = this.containerEl.createEl('table', { cls: 'input-view-table' }) as HTMLTableElement;
        const thead = this.tableEl.createEl('thead');
        const headRow = thead.createEl('tr');
        headRow.createEl('th', { text: 'Property' });
    }

    public onClose(): void {
        // Clean up DOM for view switch.
        this.containerEl.empty();
        this.tableEl = undefined;
    }

    public onDataUpdated(): void {
        const data = (this as any).data ?? (this as any).controller?.result;
        const config = (this as any).config ?? (this as any).controller?.config;
        const app = (this as any).app;

        // Reset table for re-render.
        this.containerEl.empty();
        const table = this.containerEl.createEl('table', { cls: 'input-view-table' });
        const thead = table.createEl('thead');
        const headRow = thead.createEl('tr');
        headRow.createEl('th', { text: 'Property' });

        if (!data || !config) {
            this.containerEl.createDiv({ text: 'No data available.' });
            return;
        }

        const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
        const files: any[] = entries.map((e: any) => e.file);

        // Derive property list: prefer view-config order, else union of entry value keys.
        let properties: string[] = [];
        try {
            const ordered = config.getOrder ? config.getOrder() : [];
            if (Array.isArray(ordered) && ordered.length) {
                properties = ordered;
            } else {
                const ids = new Set<string>();
                for (const entry of entries) {
                    const vals = (entry as any)?.values;
                    if (!vals) continue;
                    if (vals?.entries) {
                        for (const [pid] of vals.entries()) ids.add(String(pid));
                    } else if (typeof vals?.forEach === 'function') {
                        (vals as any).forEach((_v: any, pid: any) => ids.add(String(pid)));
                    } else {
                        for (const pid of Object.keys(vals)) ids.add(String(pid));
                    }
                }
                properties = Array.from(ids);
            }
        } catch {
            properties = [];
        }

        // Filter out non-editable/computed properties and sort for stability if no config order.
        const isComputed = (pid: string) => pid.startsWith('file.') || pid.startsWith('formula:');
        const hasOrder = config.getOrder && Array.isArray(config.getOrder()) && config.getOrder().length > 0;
        properties = properties.filter((pid) => !isComputed(pid));
        if (!hasOrder) properties.sort();

        for (const file of files) {
            headRow.createEl('th', { text: file?.name ?? file?.path ?? 'File' });
        }

        const tbody = table.createEl('tbody');

        const valueFor = (entry: any, propertyId: any) => {
            try {
                const vals = entry.values;
                let v: any;
                if (vals?.get) v = vals.get(propertyId);
                else v = vals?.[propertyId];
                if (v == null) return '';
                if (Array.isArray(v)) return v.join(', ');
                if (typeof v === 'object' && v && 'value' in v) return String((v as any).value);
                return String(v);
            } catch {
                return '';
            }
        };

        const toPropKey = (pid: string) => {
            if (!pid) return null;
            if (pid.startsWith('file.') || pid.startsWith('formula:')) return null;
            const parts = pid.split(':');
            return parts.length > 1 ? parts[1] : pid;
        };

        // If no properties found, show a helpful message.
        if (!properties.length) {
            const hint = this.containerEl.createDiv();
            hint.createEl('p', { text: 'No note properties found to display.' });
            hint.createEl('p', { text: 'Add frontmatter properties to your notes or configure the Base view to include properties.' });
            return;
        }

        // Detect property types and array-ness to provide better input widgets.
        const isDateString = (s: string) => /^(\d{4}-\d{2}-\d{2})(T.*)?$/.test(s);
        const detectType = (v: any): 'checkbox' | 'number' | 'date' | 'text' => {
            if (typeof v === 'boolean') return 'checkbox';
            if (typeof v === 'number') return 'number';
            if (typeof v === 'string' && isDateString(v)) return 'date';
            return 'text';
        };
        const propertyType = new Map<string, 'checkbox' | 'number' | 'date' | 'text'>();
        const propertyIsArray = new Map<string, boolean>();
        for (const pid of properties) {
            let sample: any = undefined;
            let isArray = false;
            for (const e of entries) {
                const vals = e.values;
                let v: any;
                if (vals?.get) v = vals.get(pid);
                else v = vals?.[pid];
                if (Array.isArray(v)) { isArray = true; sample = (v.length ? v[0] : ''); break; }
                if (v != null) { sample = v; break; }
            }
            propertyType.set(pid, detectType(sample));
            propertyIsArray.set(pid, isArray);
        }

        for (const propertyId of properties) {
            const row = tbody.createEl('tr');
            const display = config.getDisplayName ? config.getDisplayName(propertyId) : String(propertyId);
            row.createEl('th', { text: display });

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const cell = row.createEl('td');
                const type = propertyType.get(propertyId) ?? 'text';
                let input: HTMLInputElement;
                if (type === 'checkbox') {
                    input = cell.createEl('input', { type: 'checkbox', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    const raw = valueFor(entry, propertyId);
                    input.checked = raw === 'true' || raw === '1' || raw === 'yes';
                } else if (type === 'number') {
                    input = cell.createEl('input', { type: 'number', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    input.value = valueFor(entry, propertyId);
                } else if (type === 'date') {
                    input = cell.createEl('input', { type: 'date', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    const raw = valueFor(entry, propertyId);
                    input.value = (raw || '').substring(0, 10);
                } else {
                    input = cell.createEl('input', { type: 'text', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    input.value = valueFor(entry, propertyId);
                }

                const commit = async () => {
                    const file = entry.file;
                    const propKey = toPropKey(propertyId);
                    if (!propKey) return; // non-editable (file.*, formula, etc.)
                    try {
                        const tfile = file && file.path ? app.vault.getAbstractFileByPath(file.path) : null;
                        if (tfile && 'extension' in tfile) {
                            await app.fileManager.processFrontMatter(tfile as any, (fm: Record<string, any>) => {
                                if (type === 'checkbox') {
                                    fm[propKey] = !!(input as any).checked;
                                } else if (type === 'number') {
                                    const num = parseFloat(input.value);
                                    fm[propKey] = Number.isFinite(num) ? num : input.value;
                                } else if (type === 'date') {
                                    fm[propKey] = input.value; // store as YYYY-MM-DD
                                } else {
                                    const isArr = propertyIsArray.get(propertyId) === true;
                                    fm[propKey] = isArr ? input.value.split(',').map(s => s.trim()).filter(Boolean) : input.value;
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
    }
}
