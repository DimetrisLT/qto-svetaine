// Projekto tęstinumas: automatinis saugojimas naršyklėje + JSON eksportas/importas
import type { QtoItem, SourceMeta, SourceType } from '@/types/qto';

export interface SavedProject {
  version: 1;
  savedAt: string; // ISO laikas
  itemsBySource: Record<SourceType, QtoItem[]>;
  metas: Record<SourceType, SourceMeta>;
}

const KEY = 'qto-project-v1';

export function totalItems(p: SavedProject): number {
  return Object.values(p.itemsBySource).reduce((s, arr) => s + (arr?.length ?? 0), 0);
}

export function saveProject(itemsBySource: Record<SourceType, QtoItem[]>, metas: Record<SourceType, SourceMeta>): void {
  try {
    const data: SavedProject = { version: 1, savedAt: new Date().toISOString(), itemsBySource, metas };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // localStorage nepasiekiamas arba pilnas – tyliai praleidžiame
  }
}

export function loadProject(): SavedProject | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedProject;
    if (data.version !== 1 || !data.itemsBySource || !data.metas) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearProject(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* tyliai */ }
}

export function downloadProjectJson(itemsBySource: Record<SourceType, QtoItem[]>, metas: Record<SourceType, SourceMeta>): void {
  const data: SavedProject = { version: 1, savedAt: new Date().toISOString(), itemsBySource, metas };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qto-projektas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseProjectJson(text: string): SavedProject | null {
  try {
    const data = JSON.parse(text) as SavedProject;
    if (data.version !== 1 || !data.itemsBySource || !data.metas) return null;
    return data;
  } catch {
    return null;
  }
}

/** Suformatuoja saugojimo laiką lietuviškai */
export function formatSavedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
