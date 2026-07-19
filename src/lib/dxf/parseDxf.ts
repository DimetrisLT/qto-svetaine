// DXF failo analizė: sluoksniai, ilgiai, uždari kontūrai (plotai), blokų skaičius
import DxfParser from 'dxf-parser';

export interface DxfEntityShape {
  kind: 'line' | 'polyline' | 'circle' | 'arc';
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
  radius?: number;
  center?: { x: number; y: number };
  startAngle?: number;
  endAngle?: number;
  layer: string;
}

export interface LayerStats {
  name: string;
  color: string;
  lineCount: number;
  polylineCount: number;
  circleCount: number;
  arcCount: number;
  insertCount: number;
  otherCount: number;
  /** Visų linijinių objektų ilgis brėžinio vienetais */
  lengthUnits: number;
  /** Uždarų kontūrų plotas brėžinio vienetais² */
  closedAreaUnits2: number;
  /** Blokų pavadinimai -> kiekis */
  blocks: Record<string, number>;
  /** Ar sluoksnyje yra anotacijų (tekstas, matmenys) */
  hasAnnotations: boolean;
}

export interface DxfParseResult {
  layers: LayerStats[];
  shapes: DxfEntityShape[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  totalEntities: number;
  skippedEntities: number;
}

const ACI_COLORS = [
  '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff',
  '#808080', '#c0c0c0', '#ff8080', '#ffff80', '#80ff80', '#80ffff', '#8080ff', '#ff80ff',
];

function aciColor(index: number | undefined): string {
  if (index === undefined || index < 0 || index > 255) return '#475569';
  if (index < ACI_COLORS.length) {
    const c = ACI_COLORS[index];
    return c === '#ffffff' ? '#1e293b' : c; // balta nematoma baltame fone
  }
  return '#475569';
}

/** dxf-parser sluoksnio spalva: RGB sveikasis skaičius (pvz., 16711680 = #ff0000) arba ACI indeksas */
function layerColor(entry: { color?: number; colorIndex?: number } | undefined): string {
  if (entry && typeof entry.color === 'number') {
    const hex = `#${(entry.color & 0xffffff).toString(16).padStart(6, '0')}`;
    if (hex === '#ffffff') return '#1e293b';
    return hex;
  }
  return aciColor(entry?.colorIndex);
}

function shoelace(pts: Array<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(s) / 2;
}

function polyLen(pts: Array<{ x: number; y: number }>, closed: boolean): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 2) {
    s += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  }
  return s;
}

const ANNOTATION_TYPES = new Set(['TEXT', 'MTEXT', 'DIMENSION', 'LEADER', 'MULTILEADER', 'HATCH', 'ATTDEF', 'POINT', 'SOLID', '3DFACE']);

export function parseDxfText(text: string): DxfParseResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text) as any;
  if (!dxf || !Array.isArray(dxf.entities)) {
    throw new Error('Nepavyko perskaityti DXF failo – patikrinkite, ar tai tekstinis (ASCII) DXF.');
  }

  const layerColors: Record<string, string> = {};
  const tableLayers = dxf.tables?.layer?.layers ?? {};
  for (const key of Object.keys(tableLayers)) {
    layerColors[key] = layerColor(tableLayers[key]);
  }

  const layerMap = new Map<string, LayerStats>();
  const shapes: DxfEntityShape[] = [];
  let skipped = 0;

  const getLayer = (name: string): LayerStats => {
    let l = layerMap.get(name);
    if (!l) {
      l = {
        name, color: layerColors[name] ?? '#94a3b8',
        lineCount: 0, polylineCount: 0, circleCount: 0, arcCount: 0,
        insertCount: 0, otherCount: 0,
        lengthUnits: 0, closedAreaUnits2: 0, blocks: {}, hasAnnotations: false,
      };
      layerMap.set(name, l);
    }
    return l;
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const extend = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };

  for (const e of dxf.entities as any[]) {
    const layerName = String(e.layer ?? '0');
    const layer = getLayer(layerName);
    try {
      switch (e.type) {
        case 'LINE': {
          const pts: Array<{ x: number; y: number }> = (e.vertices ?? []).map((v: any) => ({ x: v.x, y: v.y }));
          if (pts.length >= 2) {
            layer.lineCount++;
            layer.lengthUnits += polyLen(pts, false);
            shapes.push({ kind: 'line', points: pts, layer: layerName });
            pts.forEach((p) => extend(p.x, p.y));
          }
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const pts: Array<{ x: number; y: number }> = (e.vertices ?? []).map((v: any) => ({ x: v.x, y: v.y }));
          const closed = Boolean(e.shape ?? e.closed);
          if (pts.length >= 2) {
            layer.polylineCount++;
            layer.lengthUnits += polyLen(pts, closed);
            if (closed && pts.length >= 3) layer.closedAreaUnits2 += shoelace(pts);
            shapes.push({ kind: 'polyline', points: pts, closed, layer: layerName });
            pts.forEach((p) => extend(p.x, p.y));
          }
          break;
        }
        case 'CIRCLE': {
          const c = { x: e.center?.x ?? 0, y: e.center?.y ?? 0 };
          const r = e.radius ?? 0;
          layer.circleCount++;
          layer.lengthUnits += 2 * Math.PI * r;
          layer.closedAreaUnits2 += Math.PI * r * r;
          shapes.push({ kind: 'circle', points: [], center: c, radius: r, layer: layerName });
          extend(c.x - r, c.y - r); extend(c.x + r, c.y + r);
          break;
        }
        case 'ARC': {
          const c = { x: e.center?.x ?? 0, y: e.center?.y ?? 0 };
          const r = e.radius ?? 0;
          const a0 = (e.startAngle ?? 0) * Math.PI / 180;
          let a1 = (e.endAngle ?? 0) * Math.PI / 180;
          if (a1 < a0) a1 += 2 * Math.PI;
          layer.arcCount++;
          layer.lengthUnits += r * (a1 - a0);
          shapes.push({ kind: 'arc', points: [], center: c, radius: r, startAngle: a0, endAngle: a1, layer: layerName });
          extend(c.x - r, c.y - r); extend(c.x + r, c.y + r);
          break;
        }
        case 'INSERT': {
          layer.insertCount++;
          const bname = String(e.name ?? 'blokas');
          layer.blocks[bname] = (layer.blocks[bname] ?? 0) + 1;
          const p = { x: e.position?.x ?? 0, y: e.position?.y ?? 0 };
          extend(p.x, p.y);
          break;
        }
        default: {
          if (ANNOTATION_TYPES.has(e.type)) {
            layer.hasAnnotations = true;
          } else {
            layer.otherCount++;
            skipped++;
          }
        }
      }
    } catch {
      skipped++;
    }
  }

  if (minX === Infinity) { minX = minY = 0; maxX = maxY = 1; }

  const layers = [...layerMap.values()].sort((a, b) => b.lengthUnits - a.lengthUnits);
  return {
    layers,
    shapes,
    bounds: { minX, minY, maxX, maxY },
    totalEntities: dxf.entities.length,
    skippedEntities: skipped,
  };
}
