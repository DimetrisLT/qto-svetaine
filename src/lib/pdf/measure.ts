// PDF matavimo geometrija (viskas PDF erdvės taškais; metrai gaunami dalytų per kalibravimą)

export interface Pt {
  x: number;
  y: number;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Polilinijos ilgis (uždaryti – jei reikia, pridedame paskutinę atkarpą) */
export function polylineLength(pts: Pt[], closed = false): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 2) sum += dist(pts[pts.length - 1], pts[0]);
  return sum;
}

/** Poligono plotas (shoelace / Gauno formulė) */
export function polygonArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

import pc from 'polygon-clipping';

/**
 * Grynasis atėmimo plotas: angų SĄJUNGA –
 * anga angoje NESUMUOJAMA dvigubai, persidengiančios angos skaičiuojamos vieną kartą, o atėmimai už tėvinio ploto ribų neskaičiuojami.
 */
export function netDeductArea(parent: Pt[], cuts: Pt[][]): number {
  if (cuts.length === 0) return 0;
  const toRing = (pts: Pt[]): [number, number][] => {
    const r = pts.map((p) => [p.x, p.y] as [number, number]);
    if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]]);
    return r;
  };
  let acc: ReturnType<typeof pc.union> = [];
  for (const c of cuts) {
    if (c.length >= 3) acc = pc.union(acc, [[toRing(c)]]);
  }
  const inter = pc.intersection(acc, [[toRing(parent)]]) ?? [];
  let area = 0;
  for (const poly of inter) {
    for (let ri = 0; ri < poly.length; ri++) {
      const ring = poly[ri];
      let s = 0;
      for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      // Išorinis žiedas +, angos −
      area += (ri === 0 ? 1 : -1) * Math.abs(s) / 2;
    }
  }
  return Math.abs(area);
}
