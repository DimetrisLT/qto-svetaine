// 2D geometrijos pagalbinės funkcijos savikontrolei (persidengimų analizė)
import type { Pt } from '@/lib/pdf/measure';

/** Taškas poligono viduje (spindulio metodas) */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonBBox(poly: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Įvertina dviejų poligonų persidengimą tinklelio diskretizavimu.
 * Grąžina persidengimo ploto dalį mažesniojo poligono atžvilgiu (0..1).
 */
export function estimateOverlapRatio(a: Pt[], b: Pt[], areaA: number, areaB: number): number {
  if (a.length < 3 || b.length < 3 || areaA <= 0 || areaB <= 0) return 0;
  const ba = polygonBBox(a);
  const bb = polygonBBox(b);
  const minX = Math.max(ba.minX, bb.minX);
  const minY = Math.max(ba.minY, bb.minY);
  const maxX = Math.min(ba.maxX, bb.maxX);
  const maxY = Math.min(ba.maxY, bb.maxY);
  if (maxX <= minX || maxY <= minY) return 0;

  const N = 60;
  const dx = (maxX - minX) / N;
  const dy = (maxY - minY) / N;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p = { x: minX + (i + 0.5) * dx, y: minY + (j + 0.5) * dy };
      if (pointInPolygon(p, a) && pointInPolygon(p, b)) hits++;
    }
  }
  const intersection = hits * dx * dy;
  return intersection / Math.min(areaA, areaB);
}
