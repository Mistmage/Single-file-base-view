// Shared utilities and helpers for Input view

export interface VirtualEntry {
  file: any;
  groupKey: string | null;
  originalEntry: any;
}

export function isComputedProperty(propertyId: string): boolean {
  return propertyId.startsWith('file.') || propertyId.startsWith('formula.');
}

export function toPropKey(propertyId: string): string | null {
  if (!propertyId) return null;
  if (isComputedProperty(propertyId)) return null;
  if (propertyId.startsWith('note.')) return propertyId.substring('note.'.length);
  const parts = propertyId.split(':');
  return parts.length > 1 ? parts[parts.length - 1] : propertyId;
}

export function getValueForDetection(app: any, vEntry: VirtualEntry, propertyId: string): any {
  try {
    if (vEntry.groupKey) {
      const file = vEntry.file;
      const tfile = app.vault.getAbstractFileByPath(file.path);
      if (!tfile || !('extension' in tfile)) return undefined;

      const cache = app.metadataCache.getFileCache(tfile as any);
      const fm = cache?.frontmatter;
      if (!fm || !fm[vEntry.groupKey]) return undefined;

      const groupObj = fm[vEntry.groupKey];
      const propKey = toPropKey(propertyId);
      if (!propKey) return undefined;
      return groupObj[propKey];
    } else {
      return vEntry.originalEntry.getValue(propertyId);
    }
  } catch {
    return undefined;
  }
}

export function getValueFor(app: any, vEntry: VirtualEntry, propertyId: string): string {
  try {
    if (vEntry.groupKey) {
      const file = vEntry.file;
      const tfile = app.vault.getAbstractFileByPath(file.path);
      if (!tfile || !('extension' in tfile)) return '';

      const cache = app.metadataCache.getFileCache(tfile as any);
      const fm = cache?.frontmatter;
      if (!fm || !fm[vEntry.groupKey]) return '';

      const groupObj = fm[vEntry.groupKey];
      const propKey = toPropKey(propertyId);
      if (!propKey) return '';
      const value = groupObj[propKey];

      if (value == null || value === undefined) return '';
      if (Array.isArray(value)) return value.join(', ');
      return String(value);
    } else {
      const value = vEntry.originalEntry.getValue(propertyId);

      if (value == null || value === undefined) return '';

      if (Array.isArray(value)) {
        return value.join(', ');
      }

      if (typeof value === 'object' && value !== null) {
        if ((value as any).date) {
          return (value as any).date.toISOString().substring(0, 10);
        }
        if ('value' in (value as any)) {
          const v = (value as any).value;
          if (Array.isArray(v)) {
            return v.join(', ');
          }
          return String(v);
        }
      }

      return String(value);
    }
  } catch {
    return '';
  }
}

export function detectPropertyTypes(
  app: any,
  properties: string[],
  virtualEntries: VirtualEntry[]
): Map<string, { type: 'checkbox' | 'number' | 'date' | 'text'; isArray: boolean }> {
  const metadata = new Map<string, { type: 'checkbox' | 'number' | 'date' | 'text'; isArray: boolean }>();

  const isDateString = (s: string) => /^(\d{4}-\d{2}-\d{2})(T.*)?$/.test(s);
  const detectType = (v: any): 'checkbox' | 'number' | 'date' | 'text' => {
    if (typeof v === 'boolean') return 'checkbox';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string' && isDateString(v)) return 'date';
    if (v && typeof v === 'object' && (v as any).date) return 'date';
    return 'text';
  };

  for (const pid of properties) {
    let sample: any = undefined;
    let isArray = false;

    for (const vEntry of virtualEntries) {
      try {
        const v = getValueForDetection(app, vEntry, pid);

        if (Array.isArray(v)) {
          isArray = true;
          sample = v.length ? v[0] : '';
          break;
        }

        if (v != null) {
          if (typeof v === 'object' && 'value' in (v as any)) {
            sample = (v as any).value;
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
      isArray,
    });
  }

  return metadata;
}

