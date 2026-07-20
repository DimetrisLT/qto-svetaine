// Darbų kiekių žiniaraštis: kiekiai sugrupuojami pagal statybos darbų grupes (sąmatoms)
import { CATEGORY_ORDER, categoryLabel, type ElementCategory, type QtoItem } from '@/types/qto';
import { round } from '@/lib/format';
import { L } from '@/i18n/store';

export interface WorkGroup {
  code: string;
  title: string;
}

const WORK_GROUP_DEFS: Array<{ code: string; lt: string; en: string }> = [
  { code: '01', lt: 'Žemės darbai', en: 'Earthwork' },
  { code: '02', lt: 'Pamatai', en: 'Foundations' },
  { code: '03', lt: 'Sienų konstrukcijos', en: 'Wall assemblies' },
  { code: '04', lt: 'Gelžbetoninės konstrukcijos (perdangos, sijos, kolonos, laiptai)', en: 'Concrete structures (slabs, beams, columns, stairs)' },
  { code: '05', lt: 'Stogo konstrukcija ir danga', en: 'Roof structure and covering' },
  { code: '06', lt: 'Langai', en: 'Windows' },
  { code: '07', lt: 'Durys', en: 'Doors' },
  { code: '08', lt: 'Apdailos darbai', en: 'Finishes' },
  { code: '09', lt: 'Kiti darbai', en: 'Other works' },
];

/** Darbų grupių pavadinimai pagal aktyvią kalbą (kviečiama darbo metu, ne import'o) */
export function workGroups(): WorkGroup[] {
  return WORK_GROUP_DEFS.map((g) => ({ code: g.code, title: L({ lt: g.lt, en: g.en }) }));
}

/** @deprecated naudokite workGroups() – šis sąrašas užšaldytas import'o metu */
export const WORK_GROUPS: WorkGroup[] = workGroups();

const GROUP_BY_CATEGORY: Record<ElementCategory, string> = {
  footing: '02',
  wall: '03',
  slab: '04',
  beam: '04',
  column: '04',
  stair: '04',
  roof: '05',
  window: '06',
  door: '07',
  fin_wall: '08',
  fin_floor: '08',
  fin_ceiling: '08',
  room: '09',
  other: '09',
};

export interface ZiniarastisRow {
  groupCode: string;
  category: ElementCategory;
  name: string;
  unit: QtoItem['unit'];
  qty: number;
  origin: QtoItem['origin'];
  sources: string[];
  detailCount: number;
}

export interface ZiniarastisGroup {
  group: WorkGroup;
  rows: ZiniarastisRow[];
}

function primaryQty(item: QtoItem): number {
  switch (item.unit) {
    case 'm³': return item.volume_m3 ?? 0;
    case 'm²': return item.area_m2 ?? 0;
    case 'm': return item.length_m ?? 0;
    case 'kg': return item.mass_kg ?? 0;
    default: return item.count;
  }
}

/** Agreguoja kiekių eilutes į žiniaraščio pozicijas pagal darbų grupes */
export function buildZiniarastis(items: QtoItem[]): ZiniarastisGroup[] {
  const acc = new Map<string, ZiniarastisRow>();
  for (const item of items) {
    const groupCode = GROUP_BY_CATEGORY[item.category] ?? '09';
    // Projekto duomenys ir AI skaičiavimai – atskiros pozicijos
    const key = `${groupCode}|${item.category}|${item.material ?? ''}|${item.unit}|${item.origin}`;
    let row = acc.get(key);
    if (!row) {
      const mat = item.material ? `, ${item.material}` : '';
      row = {
        groupCode,
        category: item.category,
        name: `${categoryLabel(item.category)}${mat}`,
        unit: item.unit,
        qty: 0,
        origin: item.origin,
        sources: [],
        detailCount: 0,
      };
      acc.set(key, row);
    }
    row.qty += primaryQty(item);
    row.detailCount += 1;
    const src = item.discipline ? `${item.source}/${item.discipline}` : item.source;
    if (!row.sources.includes(src)) row.sources.push(src);
  }

  const rows = [...acc.values()].filter((r) => r.qty > 0 || r.detailCount > 0);
  const catIdx = (c: ElementCategory) => CATEGORY_ORDER.indexOf(c);
  const groups: ZiniarastisGroup[] = [];
  for (const g of workGroups()) {
    const grows = rows
      .filter((r) => r.groupCode === g.code)
      .sort((a, b) => catIdx(a.category) - catIdx(b.category) || a.name.localeCompare(b.name, L({ lt: 'lt', en: 'en' })));
    if (grows.length) groups.push({ group: g, rows: grows });
  }
  return groups;
}

/** Žiniaraščio eilučių numeravimas: grupė.eilė (pvz., 02.1, 02.2) */
export function numberedRows(groups: ZiniarastisGroup[]): Array<ZiniarastisRow & { nr: string }> {
  const out: Array<ZiniarastisRow & { nr: string }> = [];
  for (const g of groups) {
    g.rows.forEach((r, i) => out.push({ ...r, nr: `${g.group.code}.${i + 1}`, qty: round(r.qty, 2) }));
  }
  return out;
}
