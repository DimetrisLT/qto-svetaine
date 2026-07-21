// Rastrinis „vandens burtas“ (flood-fill) – atsarginis variantas, kai vektorinis
// grafo sekimas nepavyksta (durų lankai, sudėtinga CAD geometrija).
// Kaip Kreo/Groundplan CV: rašalas rastruojamas, sritis užliejama iš spustelėto taško,
// kontūras išsekamas Moore algoritmu ir supaprastinamas Douglas–Peucker.
import type { Pt } from '@/lib/pdf/measure';
import type { Segments } from '@/lib/pdf/vectorSnap';
import { solidOnly } from '@/lib/pdf/wand';

/**
 * @param segs puslapio vektoriniai segmentai (pt, y žemyn)
 * @param p spustelėtas taškas (pt)
 * @param pageW/pageH puslapio dydis (pt)
 */
export function rasterWand(rawSegs: Segments, p: Pt, pageW: number, pageH: number): Pt[] | null {
  const segs = solidOnly(rawSegs);
  // Skiriamoji: 4 px/pt (~288 DPI); ribojame ~25 mln. ląstelių.
  // PAD – paraštė, kad linijos, einančios pačiu lapo kraštu, būtų nupiešiamos.
  const PAD = 8;
  let S = 4;
  let W = Math.ceil(pageW * S) + 2 * PAD;
  let H = Math.ceil(pageH * S) + 2 * PAD;
  while (W * H > 25_000_000 && S > 1.5) { S /= 2; W = Math.ceil(pageW * S) + 2 * PAD; H = Math.ceil(pageH * S) + 2 * PAD; }
  if (W < 16 || H < 16) return null;

  const grid = new Uint8Array(W * H); // 0 tuščia · 1 rašalas · 2 sritis
  const plot = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    const i = y * W + x;
    grid[i] = 1; grid[i - 1] = 1; grid[i + 1] = 1; grid[i - W] = 1; grid[i + W] = 1;
  };
  const d = segs.data;
  for (let s = 0; s < segs.count; s++) {
    const x0 = d[s * 4] * S + PAD, y0 = d[s * 4 + 1] * S + PAD;
    const x1 = d[s * 4 + 2] * S + PAD, y1 = d[s * 4 + 3] * S + PAD;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len * 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      plot(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t));
    }
  }

  // Užliejimas (4-jungumas) nuo sėklinio taško
  let sx = Math.round(p.x * S) + PAD, sy = Math.round(p.y * S) + PAD;
  if (sx < 1 || sy < 1 || sx >= W - 1 || sy >= H - 1) return null;
  if (grid[sy * W + sx] === 1) {
    // pataikėme ant rašalo – ieškome artimiausios tuščios ląstelės
    let found = false;
    outer: for (let r = 1; r <= 6 && !found; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = sx + dx, ny = sy + dy;
        if (nx >= 1 && ny >= 1 && nx < W - 1 && ny < H - 1 && grid[ny * W + nx] === 0) {
          sx = nx; sy = ny; found = true; break outer;
        }
      }
    }
    if (!found) return null;
  }

  // Kiekviena ląstelė stumiama daugiausiai vieną kartą (pažymima stumiant) →
  // stekas niekada neviršija W×H.
  const stack = new Int32Array(W * H);
  let sp = 0;
  stack[sp++] = sy * W + sx;
  grid[sy * W + sx] = 2;
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % W, y = (i / W) | 0;
    if (x > 1 && grid[i - 1] === 0) { grid[i - 1] = 2; stack[sp++] = i - 1; }
    if (x < W - 2 && grid[i + 1] === 0) { grid[i + 1] = 2; stack[sp++] = i + 1; }
    if (y > 1 && grid[i - W] === 0) { grid[i - W] = 2; stack[sp++] = i - W; }
    if (y < H - 2 && grid[i + W] === 0) { grid[i + W] = 2; stack[sp++] = i + W; }
  }
  // Jei sritis pasiekė rėmelį (užliejimas žengia iki 1 px nuo krašto) – kontūras prateka lauk
  for (let x = 0; x < W; x++) if (grid[W + x] === 2 || grid[(H - 2) * W + x] === 2) return null;
  for (let y = 0; y < H; y++) if (grid[y * W + 1] === 2 || grid[y * W + W - 2] === 2) return null;

  // Moore kontūro sekimas: pradžia – viršutinė srities ląstelė sėklos stulpelyje
  let b0x = sx, b0y = sy;
  while (b0y > 0 && grid[(b0y - 1) * W + b0x] === 2) b0y--;
  // 8 kryptys pagal laikrodžio rodyklę (y žemyn): E,SE,S,SW,W,NW,N,NE
  const DX = [1, 1, 0, -1, -1, -1, 0, 1];
  const DY = [0, 1, 1, 1, 0, -1, -1, -1];
  const isRegion = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 2;

  const chain: number[] = [b0x, b0y];
  let cx = b0x, cy = b0y;
  let backDir = 6; // atėjome iš šiaurės (ląstelė virš b0 – ne sritis)
  const maxSteps = 4 * (W + H) + 8 * W * H / 4;
  let steps = 0;
  let done = false;
  while (steps++ < maxSteps) {
    let nextDir = -1;
    for (let k = 1; k <= 8; k++) {
      const dir = (backDir + k) % 8;
      const nx = cx + DX[dir], ny = cy + DY[dir];
      if (isRegion(nx, ny)) {
        nextDir = dir;
        backDir = (dir + 4) % 8; // iš kur atėjome į naują ląstelę
        cx = nx; cy = ny;
        break;
      }
    }
    if (nextDir === -1) break; // izoliuota viena ląstelė
    if (cx === b0x && cy === b0y) { done = true; break; }
    chain.push(cx, cy);
  }
  if (!done || chain.length < 6) return null;

  // Ląstelių centrai → pt (atėmus paraštę)
  const pts: Pt[] = [];
  for (let i = 0; i < chain.length; i += 2) pts.push({ x: (chain[i] + 0.5 - PAD) / S, y: (chain[i + 1] + 0.5 - PAD) / S });
  const simp = douglasPeucker(pts, 1.2 / S);
  return simp.length >= 3 ? simp : null;
}

/** Douglas–Peucker supaprastinimas (iteratyvus) */
function douglasPeucker(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = pts[a], pb = pts[b];
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs((pts[i].x - pa.x) * dy - (pts[i].y - pa.y) * dx) / len;
      if (dist > maxD) { maxD = dist; idx = i; }
    }
    if (maxD > tol && idx !== -1) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
