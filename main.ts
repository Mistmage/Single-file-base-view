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

        // Normalize entries from various possible result shapes (array, Map, Set, rows/items).
        const normalizeEntries = (d: any): any[] => {
            try {
                const e = d?.entries;
                if (Array.isArray(e)) return e;
                // Prefer Map-like entries so we can include the file key.
                if (e && typeof e.entries === 'function') {
                    const pairs = Array.from(e.entries());
                    return pairs.map(([key, val]: [any, any]) => ({
                        file: key?.file ?? key, // key is often TFile
                        values: val?.values ?? val,
                    }));
                }
                if (e && typeof e.forEach === 'function') {
                    const arr: any[] = [];
                    e.forEach((v: any, k: any) => arr.push({ file: k?.file ?? k, values: v?.values ?? v }));
                    return arr;
                }
                // Rows/items fallback: expect objects with { file, values }
                const rows = d?.rows; if (Array.isArray(rows)) return rows;
                const items = d?.items; if (Array.isArray(items)) return items;
                const res = (this as any).controller?.result?.entries; if (Array.isArray(res)) return res;
                return [];
            } catch { return []; }
        };
        const entries: any[] = normalizeEntries(data);
        const files: any[] = entries.map((e: any) => e?.file ?? e?.note ?? e?.tfile ?? e).filter(Boolean);

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

        // Keep computed properties visible (read-only). Sort when no explicit order.
        const isComputed = (pid: string) => pid.startsWith('file.') || pid.startsWith('formula:');
        const hasOrder = config.getOrder && Array.isArray(config.getOrder()) && config.getOrder().length > 0;
        if (!hasOrder) properties.sort();

        for (const file of files) {
            const name = (file?.basename ?? file?.name ?? file?.title ?? file?.path ?? 'File');
            headRow.createEl('th', { text: String(name) });
        }

        const tbody = table.createEl('tbody');

        const valueFor = (entry: any, propertyId: any) => {
            const vals = entry?.values;
            const matchKey = (pid: string, key: any) => {
                if (key == null) return false;
                if (typeof key === 'string') {
                    return key === pid || key.endsWith(`:${pid}`) || pid.endsWith(`:${key}`);
                }
                const kid = (key as any).id ?? (key as any).name ?? (key as any).key;
                if (kid == null) return false;
                const ks = String(kid);
                return ks === pid || ks.endsWith(`:${pid}`) || pid.endsWith(`:${ks}`);
            };
            try {
                if (!vals) return '';
                if (typeof (vals as any).get === 'function') {
                    let v = (vals as any).get(propertyId);
                    if (v === undefined && typeof (vals as any).entries === 'function') {
                        for (const [k, vv] of (vals as any).entries()) {
                            if (matchKey(propertyId, k)) { v = vv; break; }
                        }
                    }
                    if (v == null) return '';
                    if (Array.isArray(v)) return v.join(', ');
                    if (typeof v === 'object' && v && 'value' in v) return String((v as any).value);
                    return String(v);
                } else {
                    // object-like fallback
                    if (propertyId in (vals as any)) {
                        const v = (vals as any)[propertyId];
                        if (v == null) return '';
                        if (Array.isArray(v)) return v.join(', ');
                        if (typeof v === 'object' && v && 'value' in v) return String((v as any).value);
                        return String(v);
                    }
                    for (const [k, v] of Object.entries(vals as any)) {
                        if (matchKey(propertyId, k)) {
                            if (v == null) return '';
                            if (Array.isArray(v)) return (v as any[]).join(', ');
                            if (typeof v === 'object' && v && 'value' in (v as any)) return String((v as any).value);
                            return String(v);
                        }
                    }
                    // Final fallback: derive from frontmatter when available.
                    try {
                        const file = entry?.file ?? entry?.note ?? entry?.tfile;
                        const propKey = toPropKey(propertyId);
                        if (file?.path && propKey) {
                            const tfile = (app.vault.getAbstractFileByPath(file.path) as any);
                            const cache = (app.metadataCache as any)?.getFileCache?.(tfile);
                            const fm = cache?.frontmatter;
                            if (fm && propKey in fm) {
                                const v = fm[propKey];
                                if (Array.isArray(v)) return v.join(', ');
                                return String(v);
                            }
                        }
                    } catch {}
                    return '';
                }
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
                const editable = !isComputed(propertyId);
                const type = propertyType.get(propertyId) ?? 'text';
                const raw = valueFor(entry, propertyId);
                let input: HTMLInputElement | null = null;
                if (!editable) {
                    cell.createEl('span', { text: raw ?? '' });
                } else if (type === 'checkbox') {
                    input = cell.createEl('input', { type: 'checkbox', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    input.checked = ['true','1','yes','on'].includes(String(raw).toLowerCase());
                } else if (type === 'number') {
                    input = cell.createEl('input', { type: 'number', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    input.value = raw ?? '';
                } else if (type === 'date') {
                    input = cell.createEl('input', { type: 'date', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    input.value = (raw || '').substring(0, 10);
                } else {
                    input = cell.createEl('input', { type: 'text', cls: 'input-view-cell-input' }) as HTMLInputElement;
                    input.value = raw ?? '';
                }

                if (!input) {
                    continue;
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
                                    fm[propKey] = !!(input as HTMLInputElement).checked;
                                } else if (type === 'number') {
                                    const num = parseFloat((input as HTMLInputElement).value);
                                    fm[propKey] = Number.isFinite(num) ? num : (input as HTMLInputElement).value;
                                } else if (type === 'date') {
                                    fm[propKey] = (input as HTMLInputElement).value; // store as YYYY-MM-DD
                                } else {
                                    const isArr = propertyIsArray.get(propertyId) === true;
                                    const v = (input as HTMLInputElement).value;
                                    fm[propKey] = isArr ? v.split(',').map(s => s.trim()).filter(Boolean) : v;
                                }
                            });
                        }
                    } catch (err) {
                        console.error('Failed to update property', { err, file, propKey });
                    }
                };

                if (input) {
                    input.addEventListener('change', commit);
                    input.addEventListener('blur', commit);
                }
            }
        }
    }
}
