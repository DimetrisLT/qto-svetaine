/**
 * Asmeninė įkainių biblioteka (localStorage) — kaip Kreo/CostX rate library:
 * kainą vartotojas įveda vieną kartą, programa siūlo automatiškai pagal
 * pavadinimo panašumą; biblioteka vežasi iš projekto į projektą.
 */
import * as XLSX from 'xlsx';

export interface PriceEntry {
  name: string;      // pozicijos pavadinimas (normalizuota paieškai)
  unit: string;      // mato vnt. (m, m², m³, vnt., kg)
  price: number;     // Eur už vnt.
  note?: string;
  updatedAt: number;
}

const KEY = 'qto-price-library';

export function loadLibrary(): PriceEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.name === 'string' && typeof e.price === 'number') : [];
  } catch {
    return [];
  }
}

export function saveLibrary(entries: PriceEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

/** Prideda arba atnaujina įrašą (raktas: pavadinimas+vnt., case-insensitive) */
export function upsertEntry(entry: Omit<PriceEntry, 'updatedAt'>): PriceEntry[] {
  const lib = loadLibrary();
  const key = entry.name.trim().toLowerCase() + '|' + entry.unit;
  const i = lib.findIndex((e) => e.name.trim().toLowerCase() + '|' + e.unit === key);
  const rec: PriceEntry = { ...entry, name: entry.name.trim(), updatedAt: Date.now() };
  if (i >= 0) lib[i] = rec;
  else lib.push(rec);
  saveLibrary(lib);
  return lib;
}

export function removeEntry(name: string, unit: string): PriceEntry[] {
  const key = name.trim().toLowerCase() + '|' + unit;
  const lib = loadLibrary().filter((e) => e.name.trim().toLowerCase() + '|' + e.unit !== key);
  saveLibrary(lib);
  return lib;
}

// ---- Panašumo paieška ----

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((t) => t.length >= 2));
}

/** Jaccard tokenų persidengimas + substring premija; 0..1 */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jac = inter / (ta.size + tb.size - inter);
  const na = normalize(a);
  const nb = normalize(b);
  const sub = na.includes(nb) || nb.includes(na) ? 0.25 : 0;
  return Math.min(1, jac + sub);
}

export interface PriceSuggestion {
  entry: PriceEntry;
  score: number;
}

/** Geriausi pasiūlymai pozicijai (vienetas turi sutapti, riba 0.45) */
export function suggestPrices(name: string, unit: string, limit = 3): PriceSuggestion[] {
  const lib = loadLibrary().filter((e) => e.unit === unit);
  return lib
    .map((entry) => ({ entry, score: similarity(name, entry.name) }))
    .filter((s) => s.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---- Importas iš Excel/CSV ----

/**
 * Nuskaito įkainių failą (.xlsx/.csv): stulpeliai „pavadinimas“, „vnt.“, „kaina“
 * (lankstus atpažinimas: name/pavadinimas/darbas; unit/vnt/mato; price/kaina/įkainis).
 */
export async function importPriceFile(file: File): Promise<{ added: number; total: number }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  let added = 0;
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sn], { defval: '' });
    for (const r of rows) {
      const keys = Object.keys(r);
      const kName = keys.find((k) => /pavadin|name|darbas|pozic/i.test(k)) ?? keys[0];
      const kUnit = keys.find((k) => /^(vnt|unit|mato)/i.test(k.trim()));
      const kPrice = keys.find((k) => /kaina|price|įkain|ikain|rate/i.test(k));
      const name = String(r[kName] ?? '').trim();
      const unit = kUnit ? String(r[kUnit] ?? '').trim() : '';
      const price = kPrice ? Number(String(r[kPrice]).replace(',', '.').replace(/[^\d.\-]/g, '')) : NaN;
      if (name.length >= 3 && unit && Number.isFinite(price) && price > 0) {
        upsertEntry({ name, unit, price });
        added++;
      }
    }
  }
  return { added, total: loadLibrary().length };
}
