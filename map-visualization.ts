// SVG map visualization (inspired by Obsidian Maps)
// Renders notes as nodes with optional pathways/edges, based on FRONTMATTER ONLY.
// Distance-driven layout only (no absolute positions, no note content parsing).
// Minimal schema:
// - type: 'world' | 'continent' | 'region' | 'territory' | 'location' | 'pathway'
// - name: string (optional)
// - color: string (optional)
// - size: number | [w, h] (optional)
// - distances/pathways: list items that can be:
//   - strings like "target @ 0.4" or "target : 40"
//   - wiki-link strings like "[[Target Note#50]]" (fragment denotes desired length)
//   - objects with { target, distance }

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
  // Frontmatter mappings and toggles
  distancesKeys?: string[];
  sizeKey?: string;
  colorKey?: string;
  typeKey?: string;
  nameKey?: string;
  resolveLinks?: boolean;
  normalizeAbsoluteLengths?: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function toRel(n: any): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (v >= 0 && v <= 1) return v;
  if (v >= 0 && v <= 100) return v / 100;
  return null; // ignore absolute values
}

// No position parsing: nodes are placed purely by distance constraints.

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
  // content group to allow pan transforms
  const content = document.createElementNS(SVG_NS, 'g');
  content.setAttribute('class', 'map-content');
  svg.appendChild(content);
  enableDragPan(svg, content);
  return svg;
}

function drawEdge(container: SVGGElement, nodesById: Map<string, MapNode>, e: MapEdge) {
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
  container.appendChild(line);
}

function drawNode(container: SVGGElement, n: MapNode, options: MapOptions) {
  const { defaultSize = 10 } = options;
  const size = n.size ?? defaultSize;
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(n.x));
  circle.setAttribute('cy', String(n.y));
  circle.setAttribute('r', String(size));
  circle.setAttribute('fill', n.color ?? 'var(--interactive-accent)');
  circle.setAttribute('opacity', n.type === 'location' ? '1' : '0.5');
  container.appendChild(circle);

  if (n.name) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(n.x + size + 2));
    text.setAttribute('y', String(n.y - size - 2));
    text.setAttribute('fill', 'var(--text-normal)');
    text.setAttribute('font-size', '12');
    text.textContent = n.name;
    container.appendChild(text);
  }
}

export function buildMapDataFromEntries(app: any, entries: any[], opt?: MapOptions): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const idByPath = new Map<string, string>();
  const typeKey = opt?.typeKey ?? 'type';
  const nameKey = opt?.nameKey ?? 'name';
  const colorKey = opt?.colorKey ?? 'color';
  const sizeKey = opt?.sizeKey ?? 'size';
  const distancesKeys = (opt?.distancesKeys && opt.distancesKeys.length ? opt.distancesKeys : ['distances', 'pathways']);
  const resolveLinks = opt?.resolveLinks ?? true;

  for (const entry of entries) {
    const file = entry?.file;
    if (!file?.path) continue;
    const tfile = app.vault.getAbstractFileByPath(file.path);
    if (!tfile || !('extension' in tfile)) continue;
    const cache = app.metadataCache.getFileCache(tfile as any);
    const fm = cache?.frontmatter ?? {};

    const type: MapEntityType = ((fm as any)[typeKey] as MapEntityType) || 'location';
    const name: string | undefined = (fm as any)[nameKey] || file.basename;

    const node: MapNode = {
      id: file.path,
      type,
      name,
      x: Number.NaN, // initialize missing; layout will place
      y: Number.NaN,
      color: (fm as any)[colorKey],
      size: typeof (fm as any)[sizeKey] === 'number' ? (fm as any)[sizeKey] : undefined,
    };
    nodes.push(node);
    idByPath.set(file.path, file.path);

    // distances: list of links/paths with optional relative distance
    const combined: any[] = [];
    for (const key of distancesKeys) {
      const arr = Array.isArray((fm as any)[key]) ? (fm as any)[key] : [];
      for (const v of arr) combined.push(v);
    }
    for (const p of combined) {
      let target: string | undefined;
      let lengthRel: number | undefined;
      if (typeof p === 'string') {
        // support wiki-link pattern: [[Target#50]]
        const w = p.match(/^\s*\[\[(.+?)\]\]\s*$/);
        if (w) {
          const inside = w[1];
          const [linkPath, frag] = inside.split('#');
          if (linkPath) {
            target = linkPath.trim();
          }
          if (frag) {
            const rel = toRel(frag.trim());
            if (rel != null) lengthRel = rel;
          }
        } else {
          // support formats: "target", "target @ 0.4", "target (0.4)", "target : 40"
          const m = p.match(/^(.*?)\s*(?:@|\(|:|\|)\s*(\d+(?:\.\d+)?)\)?\s*$/);
          if (m) {
            target = m[1].trim();
            const rel = toRel(m[2]);
            if (rel != null) lengthRel = rel;
          } else {
            target = p.trim();
          }
        }
      } else if (p && typeof p === 'object') {
        target = (p as any).target || (p as any).path || (p as any).id;
        const rel = toRel((p as any).distance ?? (p as any).length);
        if (rel != null) lengthRel = rel;
      }
      if (typeof target === 'string') {
        // Resolve to actual file path if possible (configurable)
        const toId = resolveLinks
          ? app.metadataCache.getFirstLinkpathDest?.(target, file.path)?.path ?? target
          : target;
        edges.push({ fromId: file.path, toId, length: lengthRel });
      }
    }
  }

  return { nodes, edges };
}

export function renderMapSVGFromEntries(app: any, entries: any[], options: MapOptions = {}): SVGSVGElement {
  const { nodes, edges } = buildMapDataFromEntries(app, entries, options);
  if (nodes.length === 0) return createSvg(options);
  // compute layout using desired relative distances if available
  layoutNodesByDistances(nodes, edges, options);
  projectRelativePositions(nodes, options);
  const svg = createSvg(options);
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const container = svg.querySelector('g.map-content') as SVGGElement;
  for (const e of edges) drawEdge(container, nodesById, e);
  for (const n of nodes) drawNode(container, n, options);
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

  // Normalize absolute lengths (>1) to relative scale [0..1]
  const rawLens = edges.map((e) => e.length).filter((v): v is number => Number.isFinite(v as number));
  const maxLen = rawLens.length ? Math.max(...rawLens) : 0;
  if (options.normalizeAbsoluteLengths && maxLen > 1) {
    for (const e of edges) {
      if (typeof e.length === 'number') e.length = e.length / maxLen;
    }
  }

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

// Drag-to-pan interaction for the SVG map
function enableDragPan(svg: SVGSVGElement, content: SVGGElement) {
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let panX = 0;
  let panY = 0;

  const onPointerDown = (ev: PointerEvent) => {
    isPanning = true;
    startX = ev.clientX;
    startY = ev.clientY;
    svg.setPointerCapture?.(ev.pointerId);
    svg.classList.add('dragging');
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (!isPanning) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const tx = panX + dx;
    const ty = panY + dy;
    content.setAttribute('transform', `translate(${tx}, ${ty})`);
  };
  const onPointerUp = (ev: PointerEvent) => {
    if (!isPanning) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    panX += dx;
    panY += dy;
    isPanning = false;
    svg.releasePointerCapture?.(ev.pointerId);
    svg.classList.remove('dragging');
  };

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointerleave', onPointerUp);
}

export {};
