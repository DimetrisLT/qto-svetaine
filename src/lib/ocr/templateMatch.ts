// Simbolių paieška brėžinyje šablono (template matching) principu.
// Nulinio vidurkio normalizuota koreliacija (ZNCC) su integraliniais vaizdais (SAT)
// pagreitintoms vidurkių/dispersijų sumoms; kryžminis narys skaičiuojamas tiesiogiai.
// Tinka ir vektoriniams (perpieštiems į rastrą), ir skenuotiems PDF.

export interface Match {
  /** Centro taškas paieškos drobės koordinatėse */
  x: number;
  y: number;
  score: number;
}

/** Pilko tono matrica iš canvas (0..255) */
export function grayscaleFromCanvas(canvas: HTMLCanvasElement): { g: Float32Array; w: number; h: number } {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], gg = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    // Skaidrumas → balta (PDF fonas)
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
    g[i] = a < 128 ? 255 : lum;
  }
  return { g, w, h };
}

function buildSAT(g: Float32Array, w: number, h: number) {
  const W = w + 1;
  const sat = new Float64Array(W * (h + 1));
  const sat2 = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0, rowSum2 = 0;
    for (let x = 1; x <= w; x++) {
      const v = g[(y - 1) * w + (x - 1)];
      rowSum += v; rowSum2 += v * v;
      sat[y * W + x] = sat[(y - 1) * W + x] + rowSum;
      sat2[y * W + x] = sat2[(y - 1) * W + x] + rowSum2;
    }
  }
  return { sat, sat2, W };
}

const rectSum = (T: Float64Array, W: number, x: number, y: number, tw: number, th: number) =>
  T[(y + th) * W + x + tw] - T[y * W + x + tw] - T[(y + th) * W + x] + T[y * W + x];

export interface MatchOptions {
  threshold?: number;   // ZNCC slenkstis (0..1)
  maxMatches?: number;
  /** Vykdymo pažangos callback (0..1) – UI neužstringa */
  onProgress?: (p: number) => void;
  /** Stačiakampis, kurį praleisti (pats šablonas), paieškos drobės koordinatėmis */
  excludeRect?: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Ieško šablono atitikmenų. tpl ir img turi būti TO PATIES mastelio.
 * Grąžina NMS išgrynintus taškus (score ↓).
 */
export async function matchTemplate(
  img: Float32Array, iw: number, ih: number,
  tpl: Float32Array, tw: number, th: number,
  opts: MatchOptions = {},
): Promise<Match[]> {
  const threshold = opts.threshold ?? 0.72;
  const maxMatches = opts.maxMatches ?? 300;
  if (tw < 6 || th < 6 || tw > iw || th > ih) return [];

  // Šablono statistika
  const n = tw * th;
  let tSum = 0, tSum2 = 0;
  for (let i = 0; i < n; i++) { tSum += tpl[i]; tSum2 += tpl[i] * tpl[i]; }
  const tMean = tSum / n;
  const tVar = tSum2 - n * tMean * tMean;
  if (tVar < 25) return []; // beveik vienspalvis šablonas – nieko prasmingo nerastume

  const { sat, sat2, W } = buildSAT(img, iw, ih);
  const candidates: Match[] = [];
  const ex = opts.excludeRect;

  const rowsY = ih - th;
  for (let y0 = 0; y0 <= rowsY; y0++) {
    for (let x0 = 0; x0 <= iw - tw; x0++) {
      if (ex && x0 + tw > ex.x0 && x0 < ex.x1 && y0 + th > ex.y0 && y0 < ex.y1) continue;
      const iSum = rectSum(sat, W, x0, y0, tw, th);
      const iSum2 = rectSum(sat2, W, x0, y0, tw, th);
      const iMean = iSum / n;
      const iVar = iSum2 - n * iMean * iMean;
      if (iVar < 25) continue; // tuščia balta vieta
      // Kryžminis narys Σ(T−tMean)(I−iMean) = ΣTI − tMean·ΣI − iMean·ΣT + n·tMean·iMean
      let cross = -tMean * iSum - iMean * tSum + n * tMean * iMean;
      for (let ty = 0; ty < th; ty++) {
        const tRow = ty * tw;
        const iRow = (y0 + ty) * iw + x0;
        for (let tx = 0; tx < tw; tx++) {
          cross += tpl[tRow + tx] * img[iRow + tx];
        }
      }
      const zncc = cross / Math.sqrt(tVar * iVar);
      if (zncc >= threshold) candidates.push({ x: x0 + tw / 2, y: y0 + th / 2, score: zncc });
    }
    if (opts.onProgress && y0 % 25 === 0) {
      opts.onProgress(y0 / rowsY);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Nemaksimumų slopinimas: rūšiuojame ir slopiname artimus (0,6 šablono įstrižainės)
  candidates.sort((a, b) => b.score - a.score);
  const suppressR = Math.hypot(tw, th) * 0.6;
  const kept: Match[] = [];
  for (const c of candidates) {
    if (kept.length >= maxMatches) break;
    if (kept.every((k) => Math.hypot(k.x - c.x, k.y - c.y) > suppressR)) kept.push(c);
  }
  return kept;
}

/**
 * Binarizacija + 3×3 tamsių pikselių išplėtimas (dilatacija).
 * Panaikina anti-aliasing ir subpikselių skirtumus tarp identiškų vektorinių simbolių –
 * plonos linijos tampa „kietomis“ ~3 px, todėl 1 px poslinkis nebelaužo koreliacijos.
 */
export function binarizeDilate(g: Float32Array, w: number, h: number, thresh = 200): Float32Array {
  const bin = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = g[i] < thresh ? 0 : 255;
  const out = new Float32Array(w * h).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x] === 0) {
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            out[yy * w + xx] = 0;
          }
        }
      }
    }
  }
  return out;
}

/** Šablono iškirpimas iš pilko tono matricos */
export function cropGray(g: Float32Array, w: number, x: number, y: number, cw: number, ch: number): Float32Array {
  const out = new Float32Array(cw * ch);
  for (let r = 0; r < ch; r++) {
    out.set(g.subarray((y + r) * w + x, (y + r) * w + x + cw), r * cw);
  }
  return out;
}
