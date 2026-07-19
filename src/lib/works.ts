// Darbų kiekių žiniaraštis: kiekiai sugrupuojami pagal statybos darbų grupes (sąmatoms)
import { CATEGORY_INFO, CATEGORY_ORDER, type ElementCategory, type QtoItem } from '@/types/qto';
import { round } from '@/lib/format';

export interface WorkGroup {
  code: string;
  title: string;
}

export const WORK_GROUPS: WorkGroup[] = [
  { code: '01', title: 'Žemės darbai' },
  { code: '02', title: 'Pamatai' },
  { code: '03', title: 'Sienų konstrukcijos' },
  { code: '04', title: 'Gelžbetoninės konstrukcijos (perdangos, sijos, kolonos, laiptai)' },
  { code: '05', title: 'Stogo konstrukcija ir danga' },
  { code: '06', title: 'Langai' },
  { code: '07', title: 'Durys' },
  { code: '08', title: 'Apdailos darbai' },
  { code: '09', title: 'Kiti darbai' },
];

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
        name: `${CATEGORY_INFO[item.category]?.lt ?? 'Kita'}${mat}`,
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
  for (const g of WORK_GROUPS) {
    const grows = rows
      .filter((r) => r.groupCode === g.code)
      .sort((a, b) => catIdx(a.category) - catIdx(b.category) || a.name.localeCompare(b.name, 'lt'));
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
