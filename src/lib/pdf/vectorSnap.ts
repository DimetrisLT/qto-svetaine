// Vektorinis „prisirišimas“ (snapping): PDF vektorinių segmentų išgavimas ir artimiausio taško paieška
import { OPS, type PDFPageProxy } from 'pdfjs-dist';
import type { Pt } from '@/lib/pdf/measure';

// Vidiniai pdf.js DrawOPS kodai (pdf.worker.mjs): path buferio instrukcijos
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** old × m (canvas transform semantika) */
function multiply(old: Mat, m: number[]): Mat {
  const [a, b, c, d, e, f] = old;
  return [
    a * m[0] + c * m[1],
    b * m[0] + d * m[1],
    a * m[2] + c * m[3],
    b * m[2] + d * m[3],
    a * m[4] + c * m[5] + e,
    b * m[4] + d * m[5] + f,
  ];
}

function applyMat(m: Mat | number[], x: number, y: number): Pt {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export interface Segments {
  /** Plokščias masyvas [x0,y0,x1,y1, ...] matavimo erdvėje (pdf pt, y žemyn) */
  data: Float32Array;
  count: number;
  /** Požymis segmentui: 1 = brūkšninė linija (ašys, konstrukcinės) – „wand“ įrankiai praleidžia */
  dashed?: Uint8Array;
}

const MAX_SEGMENTS = 300_000;

/** Išgamina visus puslapio vektorinius segmentus (linijos + suplotintos kreivės) */
export async function extractSegments(page: PDFPageProxy): Promise<Segments | null> {
  const opList = await page.getOperatorList();
  const viewport = page.getViewport({ scale: 1 });
  const vt = viewport.transform; // user space → mūsų matavimo erdvė (pt, y žemyn)

  const segs: number[] = [];
  const dashFlags: number[] = [];
  let ctm: Mat = [...IDENTITY];
  const stack: Mat[] = [];
  const dashStack: boolean[] = [];
  let dashed = false; // einamoji brūkšnio būsena (setDash)
  let anyDashed = false;
  let cx = 0, cy = 0; // einamasis taškas (user space)
  let sx = 0, sy = 0; // subpath pradžia

  const pushSeg = (x0: number, y0: number, x1: number, y1: number) => {
    if (segs.length / 4 >= MAX_SEGMENTS) return;
    const a = applyMat(ctm, x0, y0);
    const b = applyMat(ctm, x1, y1);
    const p = applyMat(vt, a.x, a.y);
    const q = applyMat(vt, b.x, b.y);
    // Praleidžiame nulinio ilgio ir milžiniškus segmentus (karkasai už lapo ribų)
    const dx = q.x - p.x, dy = q.y - p.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.04 || len2 > 4_000_000) return;
    segs.push(p.x, p.y, q.x, q.y);
    dashFlags.push(dashed ? 1 : 0);
    if (dashed) anyDashed = true;
  };

  const flattenCurve = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    // Kubinė Bezier → 6 tiesių
    const STEPS = 6;
    let px = x0, py = y0;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS, u = 1 - t;
      const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
      const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
      pushSeg(px, py, x, y);
      px = x; py = y;
    }
  };

  for (let k = 0; k < opList.fnArray.length; k++) {
    const fn = opList.fnArray[k];
    const args = opList.argsArray[k];
    if (fn === OPS.save) {
      stack.push([...ctm]);
      dashStack.push(dashed);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? [...IDENTITY];
      dashed = dashStack.pop() ?? false;
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, args as number[]);
    } else if (fn === OPS.setDash) {
      const arr = args?.[0] as number[] | undefined;
      dashed = Array.isArray(arr) && arr.length > 0;
    } else if (fn === OPS.constructPath) {
      const buf = args?.[1]?.[0] as Float32Array | null;
      if (!buf) continue;
      let i = 0;
      while (i < buf.length) {
        const op = buf[i];
        if (op === DRAW.moveTo) {
          cx = buf[i + 1]; cy = buf[i + 2]; sx = cx; sy = cy; i += 3;
        } else if (op === DRAW.lineTo) {
          const x = buf[i + 1], y = buf[i + 2];
          pushSeg(cx, cy, x, y);
          cx = x; cy = y; i += 3;
        } else if (op === DRAW.curveTo) {
          const x1 = buf[i + 1], y1 = buf[i + 2], x2 = buf[i + 3], y2 = buf[i + 4], x = buf[i + 5], y = buf[i + 6];
          flattenCurve(cx, cy, x1, y1, x2, y2, x, y);
          cx = x; cy = y; i += 7;
        } else if (op === DRAW.quadraticCurveTo) {
          // kvadratinė → kubinė
          const qx = buf[i + 1], qy = buf[i + 2], x = buf[i + 3], y = buf[i + 4];
          flattenCurve(cx, cy, cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
          cx = x; cy = y; i += 5;
        } else if (op === DRAW.closePath) {
          pushSeg(cx, cy, sx, sy);
          cx = sx; cy = sy; i += 1;
        } else {
          i += 1; // saugumas – nežinomas kodas
        }
      }
    }
  }

  if (segs.length === 0) return null;
  return {
    data: new Float32Array(segs),
    count: segs.length / 4,
    dashed: anyDashed ? Uint8Array.from(dashFlags) : undefined,
  };
}

interface SnapPoint { x: number; y: number; kind: 'end' | 'mid' }

/** Erdvinis indeksas: greitas artimiausio taško / kraštinės radimas */
export class SnapIndex {
  private cell: number;
  private grid = new Map<string, number[]>();
  private segGrid = new Map<string, number[]>();
  private points: SnapPoint[] = [];
  private segs: Segments;

  constructor(segs: Segments, cell = 24) {
    this.segs = segs;
    this.cell = cell;
    const d = segs.data;
    const seen = new Set<string>();
    for (let s = 0; s < segs.count; s++) {
      const x0 = d[s * 4], y0 = d[s * 4 + 1], x1 = d[s * 4 + 2], y1 = d[s * 4 + 3];
      this.addPoint(x0, y0, 'end', seen);
      this.addPoint(x1, y1, 'end', seen);
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len >= 5) this.addPoint((x0 + x1) / 2, (y0 + y1) / 2, 'mid', seen);
      // Segmentą registruojame visuose bbox langeliuose
      const c0x = Math.floor(Math.min(x0, x1) / cell), c1x = Math.floor(Math.max(x0, x1) / cell);
      const c0y = Math.floor(Math.min(y0, y1) / cell), c1y = Math.floor(Math.max(y0, y1) / cell);
      if ((c1x - c0x + 1) * (c1y - c0y + 1) <= 64) {
        for (let gx = c0x; gx <= c1x; gx++) {
          for (let gy = c0y; gy <= c1y; gy++) {
            const gk = `${gx},${gy}`;
            const arr = this.segGrid.get(gk);
            if (arr) arr.push(s);
            else this.segGrid.set(gk, [s]);
          }
        }
      }
    }
  }

  private addPoint(x: number, y: number, kind: SnapPoint['kind'], seen: Set<string>) {
    // Dedubliavimas ~0.25 pt tikslumu (kampai dalijami kelių segmentų)
    const key = `${Math.round(x * 4)},${Math.round(y * 4)},${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    const idx = this.points.length;
    this.points.push({ x, y, kind });
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    const gk = `${cx},${cy}`;
    const arr = this.grid.get(gk);
    if (arr) arr.push(idx);
    else this.grid.set(gk, [idx]);
  }

  /**
   * Randa prisirišimo tašką: pirmiausia galai/viduriai, tada projekcija ant kraštinės.
   * @param p kursoriaus taškas (pdf pt)
   * @param radiusPt spindulys pdf pt (pvz., 8 / zoom)
   */
  snap(p: Pt, radiusPt: number): { p: Pt; kind: SnapPoint['kind'] | 'edge' } | null {
    const c = this.cell;
    const r = Math.ceil(radiusPt / c);
    const ccx = Math.floor(p.x / c), ccy = Math.floor(p.y / c);
    let best: { d2: number; pt: SnapPoint } | null = null;
    for (let gx = ccx - r; gx <= ccx + r; gx++) {
      for (let gy = ccy - r; gy <= ccy + r; gy++) {
        const arr = this.grid.get(`${gx},${gy}`);
        if (!arr) continue;
        for (const idx of arr) {
          const pt = this.points[idx];
          const d2 = (pt.x - p.x) ** 2 + (pt.y - p.y) ** 2;
          if (d2 <= radiusPt * radiusPt && (!best || d2 < best.d2)) best = { d2, pt };
        }
      }
    }
    if (best) {
      const kindRank = best.pt.kind === 'end' ? 0 : 1;
      return { p: { x: best.pt.x, y: best.pt.y }, kind: kindRank === 0 ? 'end' : 'mid' };
    }

    // Projekcija ant artimiausios kraštinės (mažesniu spinduliu), tik aplinkiniuose langeliuose
    const edgeR = radiusPt * 0.7;
    const d = this.segs.data;
    let bestEdge: { d2: number; x: number; y: number } | null = null;
    const checked = new Set<number>();
    for (let gx = ccx - r; gx <= ccx + r; gx++) {
      for (let gy = ccy - r; gy <= ccy + r; gy++) {
        const arr = this.segGrid.get(`${gx},${gy}`);
        if (!arr) continue;
        for (const s of arr) {
          if (checked.has(s)) continue;
          checked.add(s);
          const x0 = d[s * 4], y0 = d[s * 4 + 1], x1 = d[s * 4 + 2], y1 = d[s * 4 + 3];
          const dx = x1 - x0, dy = y1 - y0;
          const len2 = dx * dx + dy * dy;
          if (len2 === 0) continue;
          let t = ((p.x - x0) * dx + (p.y - y0) * dy) / len2;
          if (t < 0 || t > 1) continue;
          t = Math.max(0.08, Math.min(0.92, t)); // nelypa į galus – tam yra end snap
          const qx = x0 + t * dx, qy = y0 + t * dy;
          const d2 = (qx - p.x) ** 2 + (qy - p.y) ** 2;
          if (d2 <= edgeR * edgeR && (!bestEdge || d2 < bestEdge.d2)) bestEdge = { d2, x: qx, y: qy };
        }
      }
    }
    if (bestEdge) return { p: { x: bestEdge.x, y: bestEdge.y }, kind: 'edge' };
    return null;
  }
}
