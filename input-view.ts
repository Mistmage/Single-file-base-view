import { BasesView } from 'obsidian';
import {
  VirtualEntry,
  detectPropertyTypes,
  getValueFor,
  isComputedProperty,
} from './utils';

export const INPUT_VIEW_TYPE = 'input-view';

export class InputBasesView extends BasesView {
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

    const entries: any[] = (data as any)?.data;

    if (!entries || !entries.length) {
      this.containerEl.createDiv({ text: 'No files in this base.' });
      return;
    }

    const virtualEntries = this.expandNestedEntries(entries, app);

    if (!virtualEntries.length) {
      this.containerEl.createDiv({ text: 'No entries found.' });
      return;
    }

    const properties: string[] = Array.isArray((data as any)?.properties)
      ? (data as any).properties
      : [];

    if (!properties.length) {
      const hint = this.containerEl.createDiv();
      hint.createEl('p', { text: 'No note properties found to display.' });
      hint.createEl('p', {
        text:
          'Add frontmatter properties to your notes or configure the Base view to include properties.',
      });
      return;
    }

    const propertyMetadata = detectPropertyTypes(app, properties, virtualEntries);

    const table = this.containerEl.createEl('table', { cls: 'input-view-table' });
    const tbody = table.createEl('tbody');

    for (const propertyId of properties) {
      const row = tbody.createEl('tr');

      const display =
        config?.getDisplayName?.(
          propertyId as `note.${string}` | `file.${string}` | `formula.${string}`
        ) ?? propertyId;
      const labelCell = row.createEl('td', { cls: 'input-view-property-label' });
      labelCell.createEl('strong', { text: display });

      const isComputed = isComputedProperty(propertyId);
      const metadata = propertyMetadata.get(propertyId);

      for (const vEntry of virtualEntries) {
        const cell = row.createEl('td', { cls: 'input-view-cell' });
        const value = getValueFor(app, vEntry, propertyId);

        if (isComputed) {
          cell.createEl('span', { text: value, cls: 'input-view-readonly' });
        } else {
          this.createEditableCell(cell, vEntry, propertyId, value, metadata, config);
        }
      }
    }
  }

  private expandNestedEntries(entries: any[], app: any): VirtualEntry[] {
    const virtualEntries: VirtualEntry[] = [];

    for (const entry of entries) {
      const file = entry.file;
      if (!file || !file.path) continue;

      try {
        const tfile = app.vault.getAbstractFileByPath(file.path);
        if (!tfile) continue;

        const cache = app.metadataCache.getFileCache(tfile);
        const fm = cache?.frontmatter;

        if (!fm) {
          virtualEntries.push({ file, groupKey: null, originalEntry: entry });
          continue;
        }

        const groupKeys = Object.keys(fm).filter((key) => {
          const value = (fm as any)[key];
          return value && typeof value === 'object' && !Array.isArray(value);
        });

        if (groupKeys.length === 0) {
          virtualEntries.push({ file, groupKey: null, originalEntry: entry });
        } else {
          for (const groupKey of groupKeys) {
            virtualEntries.push({ file, groupKey, originalEntry: entry });
          }
        }
      } catch (err) {
        console.error('Error expanding entry:', err);
        virtualEntries.push({ file, groupKey: null, originalEntry: entry });
      }
    }

    return virtualEntries;
  }

  private createEditableCell(
    cell: HTMLElement,
    vEntry: VirtualEntry,
    propertyId: string,
    value: string,
    metadata: any,
    config: any
  ): void {
    if (config && typeof config.renderProperty === 'function') {
      try {
        if (!vEntry.groupKey) {
          config.renderProperty(cell, vEntry.originalEntry, propertyId);
          return;
        }
      } catch (err) {
        console.warn('config.renderProperty failed, falling back to manual input:', err);
      }
    }

    const type = metadata?.type ?? 'text';
    const isArray = metadata?.isArray ?? false;
    const app = this.app;
    let input: HTMLInputElement;

    if (type === 'checkbox') {
      input = cell.createEl('input', { type: 'checkbox', cls: 'input-view-cell-input' }) as HTMLInputElement;
      const boolValue = ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
      input.checked = boolValue;
    } else if (type === 'number') {
      input = cell.createEl('input', { type: 'number', cls: 'input-view-cell-input' }) as HTMLInputElement;
      input.value = value ?? '';
    } else if (type === 'date') {
      input = cell.createEl('input', { type: 'date', cls: 'input-view-cell-input' }) as HTMLInputElement;
      input.value = (value || '').substring(0, 10);
    } else {
      input = cell.createEl('input', { type: 'text', cls: 'input-view-cell-input' }) as HTMLInputElement;
      input.value = value ?? '';
    }

    const commit = async () => {
      const file = vEntry.file;
      const groupKey = vEntry.groupKey;
      const propKey = this.toPropKey(propertyId);
      if (!propKey) return;

      try {
        const tfile = file?.path ? app.vault.getAbstractFileByPath(file.path) : null;
        if (tfile && 'extension' in (tfile as any)) {
          await app.fileManager.processFrontMatter(tfile as any, (fm: Record<string, any>) => {
            let targetObj = fm;

            if (groupKey) {
              if (!fm[groupKey] || typeof fm[groupKey] !== 'object') {
                fm[groupKey] = {};
              }
              targetObj = fm[groupKey];
            }

            if (type === 'checkbox') {
              (targetObj as any)[propKey] = input.checked;
            } else if (type === 'number') {
              const num = parseFloat(input.value);
              (targetObj as any)[propKey] = Number.isFinite(num) ? num : input.value;
            } else if (type === 'date') {
              (targetObj as any)[propKey] = input.value;
            } else {
              const v = input.value;
              (targetObj as any)[propKey] = isArray ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;
            }
          });
        }
      } catch (err) {
        console.error('Failed to update property', { err, file, propKey, groupKey });
      }
    };

    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
  }

  private toPropKey(propertyId: string): string | null {
    if (!propertyId) return null;
    if (isComputedProperty(propertyId)) return null;
    if (propertyId.startsWith('note.')) return propertyId.substring('note.'.length);
    const parts = propertyId.split(':');
    return parts.length > 1 ? parts[parts.length - 1] : propertyId;
  }
}

