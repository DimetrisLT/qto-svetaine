// Teksto sluoksnio elementai su pozicijomis (pdf pt erdvėje, y žemyn –
// ta pati erdvė kaip matavimų taškai ir vectorSnap segmentai)
import type { PDFPageProxy } from 'pdfjs-dist';

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

/** Ištraukia teksto elementus su pozicijomis; null jei teksto sluoksnio nėra (rastras) */
export async function extractTextItems(page: PDFPageProxy): Promise<TextItem[] | null> {
  try {
    const viewport = page.getViewport({ scale: 1 });
    const vt = viewport.transform; // user space → mūsų erdvė
    const tc = await page.getTextContent();
    const out: TextItem[] = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const t = (it as { transform: number[] }).transform;
      const x = vt[0] * t[4] + vt[2] * t[5] + vt[4];
      const y = vt[1] * t[4] + vt[3] * t[5] + vt[5];
      out.push({ str: it.str.trim(), x, y });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Erdvinis indeksas teksto elementams (tinklelis, kaip SnapIndex) */
export class TextIndex {
  private cell: number;
  private grid = new Map<string, TextItem[]>();

  constructor(items: TextItem[], cell = 48) {
    this.cell = cell;
    for (const it of items) {
      const k = this.key(it.x, it.y);
      const arr = this.grid.get(k) ?? [];
      arr.push(it);
      this.grid.set(k, arr);
    }
  }

  private key(x: number, y: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`;
  }

  /** Artimiausi elementai taške radius pt spinduliu (didėjimo tvarka) */
  nearest(x: number, y: number, radius: number): Array<TextItem & { dist: number }> {
    const out: Array<TextItem & { dist: number }> = [];
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const arr = this.grid.get(`${cx + dx},${cy + dy}`);
        if (!arr) continue;
        for (const it of arr) {
          const dist = Math.hypot(it.x - x, it.y - y);
          if (dist <= radius) out.push({ ...it, dist });
        }
      }
    }
    return out.sort((a, b) => a.dist - b.dist);
  }
}

// ── Pavadinimų pasiūlymai (idėja #5) ────────────────────────────────────────

// Matmenys, datos, lapų žymos – NETINKA kaip pozicijos pavadinimas
const SKIP = /^\d+([.,]\d+)?$|^\d{4}-\d{2}-\d{2}|^M\s?1|^(lapas|formatas|mastelis|data|projektas)/i;
// Tinkami šablonai: „107 Kabinetas“, „S-12“, „PJ-3“, „F-1a“, „K1“, „A-101“
const GOOD = /^([A-ZŠĖČĄĮŲŪŽ]{1,4}[-–]?\d+[a-zA-Z]?|\d{3}\s+.+|[A-ZŠĖČĄĮŲŪŽ]\d{1,3})$/;

/** Pasiūlo pozicijos pavadinimą pagal artimiausią tinkamą tekstą ties matavimo centroidu */
export function suggestName(index: TextIndex | null, pts: Array<{ x: number; y: number }>, radiusPt = 90): string | null {
  if (!index || pts.length === 0) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const near = index.nearest(cx, cy, radiusPt);
  // 1) šabloniniai (markės, patalpų nr.) – pirmas artimiausias
  const good = near.find((it) => it.str.length <= 30 && GOOD.test(it.str));
  if (good) return good.str;
  // 2) bet koks trumpas reikšmingas tekstas
  const fallback = near.find((it) => it.str.length >= 3 && it.str.length <= 40 && !SKIP.test(it.str));
  return fallback ? fallback.str : null;
}

// ── Matmenų grandinės (idėja #1) ────────────────────────────────────────────

export interface DimensionItem {
  mm: number;
  x: number;
  y: number;
}

/** Išskiria matmenų reikšmes (sveiki skaičiai 100–99999, tipiškai mm) */
export function extractDimensions(items: TextItem[]): DimensionItem[] {
  const out: DimensionItem[] = [];
  for (const it of items) {
    const s = it.str.replace(/\s/g, '');
    if (!/^\d{3,5}$/.test(s)) continue;
    const mm = Number(s);
    if (mm < 100 || mm > 99999) continue;
    out.push({ mm, x: it.x, y: it.y });
  }
  return out;
}

export interface DimensionScaleEstimate {
  unitsPerMeter: number;
  evidence: number;
  /** Pvz.: „6000 mm ↔ 170,1 pt“ */
  sample: string;
}

/**
 * Mastelio įvertis iš matmenų grandinių: skaičius šalia ilgo segmento.
 * upm = segLen_pt / (dim_mm / 1000). Imamas medianos klasteris (atsparu OCR iškrypimams).
 */
export function estimateScaleFromDimensions(
  dims: DimensionItem[],
  segData: Float32Array,
  segCount: number,
  radiusPt = 60,
): DimensionScaleEstimate | null {
  const estimates: Array<{ upm: number; sample: string }> = [];
  for (const d of dims) {
    let best: { upm: number; dist: number; len: number } | null = null;
    for (let i = 0; i < segCount; i++) {
      const x0 = segData[i * 4], y0 = segData[i * 4 + 1], x1 = segData[i * 4 + 2], y1 = segData[i * 4 + 3];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 30) continue;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const dist = Math.hypot(mx - d.x, my - d.y);
      if (dist > radiusPt) continue;
      const upm = len / (d.mm / 1000);
      if (upm < 5 || upm > 300) continue;
      if (!best || dist < best.dist) best = { upm, dist, len };
    }
    if (best) estimates.push({ upm: best.upm, sample: `${d.mm} mm ↔ ${best.len.toFixed(1)} pt` });
  }
  if (estimates.length === 0) return null;
  // Mediana (atspari pavienėms klaidoms)
  const sorted = estimates.map((e) => e.upm).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const cluster = estimates.filter((e) => Math.abs(e.upm - med) / med <= 0.03);
  return {
    unitsPerMeter: med,
    evidence: cluster.length,
    sample: cluster[0]?.sample ?? estimates[0].sample,
  };
}

/** Ilgio matavimo sutikrinimas: ar šalia esanti grandinė sutampa su išmatuotu ilgiu (±2 %) */
export function checkLengthAgainstDimensions(
  dims: DimensionItem[],
  pts: Array<{ x: number; y: number }>,
  measuredMm: number,
  radiusPt = 50,
): { dimMm: number; ok: boolean } | null {
  if (dims.length === 0 || pts.length === 0) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let best: { mm: number; dist: number } | null = null;
  for (const d of dims) {
    const dist = Math.hypot(d.x - cx, d.y - cy);
    if (dist <= radiusPt && (!best || dist < best.dist)) best = { mm: d.mm, dist };
  }
  if (!best) return null;
  return { dimMm: best.mm, ok: Math.abs(measuredMm - best.mm) / best.mm <= 0.02 };
}
