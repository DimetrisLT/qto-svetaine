// Ašių (grid) atpažinimas vektoriniuose PDF:
// ilgos horizontalios/vertikalios linijos + raidžių/skaičių žymės ties jų galais („burbulai“).
// Naudojama: snap į ašių sankirtas ir ašų zono („A–B / 3–4“) žymėjimas pozicijose.
import type { TextItem } from '@/lib/pdf/textItems';

export interface AxisLine {
  /** x (vertikaliai) arba y (horizontaliai) pozicija, pt */
  pos: number;
  label: string | null;
  vertical: boolean;
  len: number;
  /** linijos apimtis išilgai [min, max] */
  lo: number;
  hi: number;
}

export interface AxisGrid {
  v: AxisLine[];
  h: AxisLine[];
  intersections: Array<{ x: number; y: number }>;
}

const LABEL_RE = /^([A-ZŠĖČĄĮŲŪŽ]{1,2}|\d{1,2})$/;
const END_RADIUS = 42;

interface Seg { x0: number; y0: number; x1: number; y1: number }

function toSegments(data: Float32Array, count: number): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x0: data[i * 4], y0: data[i * 4 + 1], x1: data[i * 4 + 2], y1: data[i * 4 + 3] });
  }
  return out;
}

function clusterLines(lines: AxisLine[], tol = 3): AxisLine[] {
  const sorted = [...lines].sort((a, b) => a.pos - b.pos);
  const out: AxisLine[] = [];
  for (const l of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.pos - l.pos) <= tol) {
      // Sujungiame: ilgiausia pozicija + bendra apimtis
      if (l.len > last.len) { last.pos = l.pos; last.len = l.len; }
      last.lo = Math.min(last.lo, l.lo);
      last.hi = Math.max(last.hi, l.hi);
    } else {
      out.push({ ...l });
    }
  }
  return out;
}

function findLabel(texts: TextItem[], x: number, y: number): string | null {
  let best: { s: string; d: number } | null = null;
  for (const t of texts) {
    if (!LABEL_RE.test(t.str)) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= END_RADIUS && (!best || d < best.d)) best = { s: t.str, d };
  }
  return best ? best.s : null;
}

/**
 * Aptinka ašių tinklą. Grąžina null, jei nerandama bent 2×2 pažymėtų linijų
 * (tada brėžinys laikomas „be ašių“ ir funkcija tyliai nusiima).
 */
export function detectAxes(
  segData: Float32Array,
  segCount: number,
  texts: TextItem[],
  pageW: number,
  pageH: number,
): AxisGrid | null {
  const minLen = Math.max(120, Math.min(pageW, pageH) * 0.35);
  const raw: AxisLine[] = [];

  for (const s of toSegments(segData, segCount)) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const len = Math.hypot(dx, dy);
    if (len < minLen) continue;
    const angle = Math.abs(Math.atan2(dy, dx));
    const isH = angle < 0.03 || Math.abs(angle - Math.PI) < 0.03;
    const isV = Math.abs(angle - Math.PI / 2) < 0.03;
    if (isH) {
      raw.push({ pos: (s.y0 + s.y1) / 2, label: null, vertical: false, len, lo: Math.min(s.x0, s.x1), hi: Math.max(s.x0, s.x1) });
    } else if (isV) {
      raw.push({ pos: (s.x0 + s.x1) / 2, label: null, vertical: true, len, lo: Math.min(s.y0, s.y1), hi: Math.max(s.y0, s.y1) });
    }
  }

  // Kluosterizuojame kryptis atskirai – kitaip vertikalė x=100 ir horizontali y=100 susilietų
  const v = clusterLines(raw.filter((l) => l.vertical));
  const h = clusterLines(raw.filter((l) => !l.vertical));
  if (v.length < 2 || h.length < 2) return null;

  // Žymės ties linijų galais: vertikaliai – (pos, lo)/(pos, hi), horizontaliai – (lo, pos)/(hi, pos)
  for (const l of [...v, ...h]) {
    if (l.vertical) {
      l.label = findLabel(texts, l.pos, l.lo) ?? findLabel(texts, l.pos, l.hi);
    } else {
      l.label = findLabel(texts, l.lo, l.pos) ?? findLabel(texts, l.hi, l.pos);
    }
  }

  const vLab = v.filter((l) => l.label !== null).sort((a, b) => a.pos - b.pos);
  const hLab = h.filter((l) => l.label !== null).sort((a, b) => a.pos - b.pos);
  if (vLab.length < 2 || hLab.length < 2) return null;

  const intersections: Array<{ x: number; y: number }> = [];
  for (const a of vLab) for (const b of hLab) intersections.push({ x: a.pos, y: b.pos });

  return { v: vLab, h: hLab, intersections };
}

/** Ašų sankirtų snap: artimiausia sankirta, jei ji radiusPt spindulyje */
export function snapToAxes(
  grid: AxisGrid | null,
  p: { x: number; y: number },
  radiusPt: number,
): { x: number; y: number } | null {
  if (!grid) return null;
  let best: { x: number; y: number; d: number } | null = null;
  for (const i of grid.intersections) {
    const d = Math.hypot(i.x - p.x, i.y - p.y);
    if (d <= radiusPt && (!best || d < best.d)) best = { ...i, d };
  }
  return best ? { x: best.x, y: best.y } : null;
}

function zoneBetween(lines: AxisLine[], pos: number): string | null {
  if (lines.length === 0) return null;
  if (pos < lines[0].pos) return `iki ${lines[0].label}`;
  if (pos > lines[lines.length - 1].pos) return `už ${lines[lines.length - 1].label}`;
  for (let i = 0; i < lines.length - 1; i++) {
    if (pos >= lines[i].pos && pos <= lines[i + 1].pos) return `${lines[i].label}–${lines[i + 1].label}`;
  }
  return null;
}

/** Ašų zona taškui, pvz. „A–B / 3–4“; null jei tinklo nėra arba taškas už ribų */
export function axisZone(grid: AxisGrid | null, p: { x: number; y: number }): string | null {
  if (!grid) return null;
  const zx = zoneBetween(grid.v, p.x);
  const zy = zoneBetween(grid.h, p.y);
  if (!zx || !zy) return null;
  return `${zx} / ${zy}`;
}
