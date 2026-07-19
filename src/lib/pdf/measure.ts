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
