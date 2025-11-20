// SVG map visualization (inspired by Obsidian Maps)
// Renders notes as nodes with optional pathways/edges, based on frontmatter.
// Coordinates are RELATIVE only (no absolute lat/long):
// - pos: [x, y] where x and y are in [0..1] or percentages [0..100]
// - x: number, y: number (each in [0..1] or [0..100] as percentage)
// - coords: "x, y" string (each in [0..1] or [0..100] as percentage)
// Minimal schema:
// - type: 'world' | 'continent' | 'region' | 'territory' | 'location' | 'pathway'
// - name: string (optional)
// - color: string (optional)
// - size: number | [w, h] (optional)
// - pathways: [note-link | id] (optional)
// - wiki-links in note content: [[City A#50]] or [[Locations/City A#50]]
//   where the fragment (e.g., 50) denotes desired relative edge length.

export type MapEntityType =
  | 'world'
  | 'continent'
  | 'region'
  | 'territory'
  | 'location'
  | 'pathway';

export interface MapNode {
  id: string; // use file path or unique key
  type: MapEntityType;
  name?: string;
  x: number;
  y: number;
  color?: string;
  size?: number;
}

export interface MapEdge {
  fromId: string;
  toId: string;
  label?: string;
  length?: number; // desired relative length [0..1]
}

export interface MapOptions {
  width?: number;
  height?: number;
  padding?: number;
  defaultSize?: number;
  defaultEdgeLengthRel?: number; // default relative length when not provided
  iterations?: number; // solver iterations
  stiffness?: number; // spring constant
  damping?: number; // damping factor per step
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function toRel(n: any): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (v >= 0 && v <= 1) return v;
  if (v >= 0 && v <= 100) return v / 100;
  return null; // ignore absolute values
}

function parseRelativeCoordsFromFrontmatter(fm: any): { rx: number; ry: number } | null {
  try {
    if (!fm) return null;
    if (Array.isArray(fm.pos) && fm.pos.length >= 2) {
      const rx = toRel(fm.pos[0]);
      const ry = toRel(fm.pos[1]);
      if (rx != null && ry != null) return { rx, ry };
    }
    if ('x' in fm && 'y' in fm) {
      const rx = toRel((fm as any).x);
      const ry = toRel((fm as any).y);
      if (rx != null && ry != null) return { rx, ry };
    }
    if (typeof (fm as any).coords === 'string') {
      const parts = String((fm as any).coords)
        .split(',')
        .map((s: string) => s.trim());
      if (parts.length >= 2) {
        const rx = toRel(parts[0]);
        const ry = toRel(parts[1]);
        if (rx != null && ry != null) return { rx, ry };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function projectRelativePositions(nodes: MapNode[], options: MapOptions) {
  const { width = 800, height = 600, padding = 24 } = options;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  for (const n of nodes) {
    // n.x and n.y currently store relative [0..1]
    n.x = padding + Math.min(1, Math.max(0, n.x)) * innerW;
    n.y = padding + Math.min(1, Math.max(0, n.y)) * innerH;
  }
}

function createSvg(options: MapOptions) {
  const { width = 800, height = 600 } = options;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.border = '1px solid var(--background-modifier-border)';
  svg.style.background = 'var(--background-primary)';
  return svg;
}

function drawEdge(svg: SVGSVGElement, nodesById: Map<string, MapNode>, e: MapEdge) {
  const a = nodesById.get(e.fromId);
  const b = nodesById.get(e.toId);
  if (!a || !b) return;
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', String(a.x));
  line.setAttribute('y1', String(a.y));
  line.setAttribute('x2', String(b.x));
  line.setAttribute('y2', String(b.y));
  line.setAttribute('stroke', 'var(--text-muted)');
  line.setAttribute('stroke-width', '1.5');
  svg.appendChild(line);
}

function drawNode(svg: SVGSVGElement, n: MapNode, options: MapOptions) {
  const { defaultSize = 10 } = options;
  const size = n.size ?? defaultSize;
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(n.x));
  circle.setAttribute('cy', String(n.y));
  circle.setAttribute('r', String(size));
  circle.setAttribute('fill', n.color ?? 'var(--interactive-accent)');
  circle.setAttribute('opacity', n.type === 'location' ? '1' : '0.5');
  svg.appendChild(circle);

  if (n.name) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(n.x + size + 2));
    text.setAttribute('y', String(n.y - size - 2));
    text.setAttribute('fill', 'var(--text-normal)');
    text.setAttribute('font-size', '12');
    text.textContent = n.name;
    svg.appendChild(text);
  }
}

export function buildMapDataFromEntries(app: any, entries: any[]): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const idByPath = new Map<string, string>();

  for (const entry of entries) {
    const file = entry?.file;
    if (!file?.path) continue;
    const tfile = app.vault.getAbstractFileByPath(file.path);
    if (!tfile || !('extension' in tfile)) continue;
    const cache = app.metadataCache.getFileCache(tfile as any);
    const fm = cache?.frontmatter ?? {};

    const type: MapEntityType = (fm.type as MapEntityType) || 'location';
    const name: string | undefined = (fm as any).name || file.basename;
    const rel = parseRelativeCoordsFromFrontmatter(fm);
    if (!rel) continue; // skip if we cannot place it

    const node: MapNode = {
      id: file.path,
      type,
      name,
      x: rel.rx, // store relative; projected later
      y: rel.ry,
      color: (fm as any).color,
      size: typeof (fm as any).size === 'number' ? (fm as any).size : undefined,
    };
    nodes.push(node);
    idByPath.set(file.path, file.path);

    // pathways: list of links/paths with optional relative distance
    const pathways: any[] = Array.isArray((fm as any).pathways) ? (fm as any).pathways : [];
    for (const p of pathways) {
      let target: string | undefined;
      let lengthRel: number | undefined;
      if (typeof p === 'string') {
        // support formats: "target", "target @ 0.4", "target (0.4)", "target : 40"
        const m = p.match(/^(.*?)\s*(?:@|\(|:|\|)\s*(\d+(?:\.\d+)?)\)?\s*$/);
        if (m) {
          target = m[1].trim();
          const rel = toRel(m[2]);
          if (rel != null) lengthRel = rel;
        } else {
          target = p.trim();
        }
      } else if (p && typeof p === 'object') {
        target = (p as any).target || (p as any).path || (p as any).id;
        const rel = toRel((p as any).distance ?? (p as any).length);
        if (rel != null) lengthRel = rel;
      }
      if (typeof target === 'string') {
        edges.push({ fromId: file.path, toId: target, length: lengthRel });
      }
    }

    // wiki-links in note content with #distance fragments
    const links: any[] = Array.isArray((cache as any)?.links) ? (cache as any).links : [];
    for (const l of links) {
      const raw = (l as any).link || '';
      const [linkPath, frag] = raw.split('#');
      if (!linkPath) continue;
      let lengthRel: number | undefined = undefined;
      if (frag) {
        const num = toRel(frag.trim());
        if (num != null) lengthRel = num;
      }
      // Resolve to actual file path if possible
      const dest = app.metadataCache.getFirstLinkpathDest?.(linkPath, file.path);
      const toId = dest?.path ?? linkPath;
      edges.push({ fromId: file.path, toId, length: lengthRel });
    }
  }

  return { nodes, edges };
}

export function renderMapSVGFromEntries(app: any, entries: any[], options: MapOptions = {}): SVGSVGElement {
  const { nodes, edges } = buildMapDataFromEntries(app, entries);
  if (nodes.length === 0) return createSvg(options);
  // compute layout using desired relative distances if available
  layoutNodesByDistances(nodes, edges, options);
  projectRelativePositions(nodes, options);
  const svg = createSvg(options);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) drawEdge(svg, nodesById, e);
  for (const n of nodes) drawNode(svg, n, options);
  return svg;
}

function layoutNodesByDistances(nodes: MapNode[], edges: MapEdge[], options: MapOptions) {
  const n = nodes.length;
  if (n === 0) return;
  const {
    defaultEdgeLengthRel = 0.25,
    iterations = 200,
    stiffness = 0.5,
    damping = 0.85,
  } = options;

  // Initialize: if any node lacks coordinates, place on circle
  const missing = nodes.some((nd) => !(Number.isFinite(nd.x) && Number.isFinite(nd.y)));
  if (missing) {
    const step = (2 * Math.PI) / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      if (!(Number.isFinite(nd.x) && Number.isFinite(nd.y))) {
        nd.x = 0.5 + 0.4 * Math.cos(i * step);
        nd.y = 0.5 + 0.4 * Math.sin(i * step);
      }
    }
  }

  // Simple spring relaxation towards desired lengths (relative space)
  // Positions remain in [0..1]; adjust and clamp each iteration.
  for (let iter = 0; iter < iterations; iter++) {
    for (const e of edges) {
      const a = nodes.find((nd) => nd.id === e.fromId);
      const b = nodes.find((nd) => nd.id === e.toId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const L = e.length ?? defaultEdgeLengthRel;
      // Hooke's law adjustment amount toward target length
      const error = d - L;
      const force = stiffness * error;
      const ux = dx / d;
      const uy = dy / d;
      // Move endpoints half each
      a.x = a.x + force * ux * damping * -0.5;
      a.y = a.y + force * uy * damping * -0.5;
      b.x = b.x + force * ux * damping * 0.5;
      b.y = b.y + force * uy * damping * 0.5;
      // Clamp to [0..1]
      a.x = Math.min(1, Math.max(0, a.x));
      a.y = Math.min(1, Math.max(0, a.y));
      b.x = Math.min(1, Math.max(0, b.x));
      b.y = Math.min(1, Math.max(0, b.y));
    }
  }
}

export {};
