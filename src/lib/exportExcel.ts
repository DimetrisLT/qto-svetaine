// Excel (XLSX) eksportas ir CSV kopijavimas
import * as XLSX from 'xlsx';
import { CATEGORY_INFO, CATEGORY_ORDER, type CheckResult, type QtoItem } from '@/types/qto';
import { round } from '@/lib/format';

function summaryRows(items: QtoItem[]) {
  const byCat = new Map<string, { n: number; m: number; m2: number; m3: number; vnt: number; sources: Set<string> }>();
  for (const i of items) {
    const key = i.category;
    if (!byCat.has(key)) byCat.set(key, { n: 0, m: 0, m2: 0, m3: 0, vnt: 0, sources: new Set() });
    const c = byCat.get(key)!;
    c.n += 1;
    c.m += i.length_m ?? 0;
    c.m2 += i.area_m2 ?? 0;
    c.m3 += i.volume_m3 ?? 0;
    c.vnt += i.count;
    c.sources.add(i.source);
  }
  const rows: Array<Array<string | number>> = [[
    'Kategorija', 'Šaltiniai', 'Eilučių sk.', 'Ilgis (m)', 'Plotas (m²)', 'Tūris (m³)', 'Kiekis (vnt.)',
  ]];
  for (const cat of CATEGORY_ORDER) {
    const c = byCat.get(cat);
    if (!c) continue;
    rows.push([
      CATEGORY_INFO[cat].lt, [...c.sources].join('+'), c.n,
      round(c.m, 2), round(c.m2, 2), round(c.m3, 2), c.vnt,
    ]);
  }
  const tot = [...byCat.values()].reduce((s, c) => ({
    n: s.n + c.n, m: s.m + c.m, m2: s.m2 + c.m2, m3: s.m3 + c.m3, vnt: s.vnt + c.vnt,
  }), { n: 0, m: 0, m2: 0, m3: 0, vnt: 0 });
  rows.push(['VISO', '', tot.n, round(tot.m, 2), round(tot.m2, 2), round(tot.m3, 2), tot.vnt]);
  return rows;
}

function detailRows(items: QtoItem[]) {
  const rows: Array<Array<string | number>> = [[
    'Šaltinis', 'Kategorija', 'Pavadinimas', 'Medžiaga',
    'Ilgis (m)', 'Plotis/storis (m)', 'Aukštis (m)',
    'Plotas (m²)', 'Tūris (m³)', 'Kiekis (vnt.)', 'Mato vnt.', 'Pastaba',
  ]];
  for (const i of items) {
    rows.push([
      i.source, CATEGORY_INFO[i.category].lt, i.name, i.material ?? '',
      i.length_m ?? '', i.width_m ?? i.thickness_m ?? '', i.height_m ?? '',
      i.area_m2 ?? '', i.volume_m3 ?? '', i.count, i.unit, i.note ?? '',
    ]);
  }
  return rows;
}

function checkRows(checks: CheckResult[]) {
  const rows: Array<Array<string | number>> = [['Grupė', 'Patikrinimas', 'Statusas', 'Detalės']];
  const groupLt: Record<CheckResult['group'], string> = {
    geometry: 'Geometrija', logic: 'Logika', completeness: 'Pilnumas',
  };
  for (const c of checks) {
    rows.push([groupLt[c.group], c.label, c.status === 'ok' ? 'TVARKOJ' : 'DĖMESIO', c.details]);
  }
  return rows;
}

export function exportToExcel(items: QtoItem[], checks: CheckResult[], fileBase = 'QTO_ataskaita') {
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet(summaryRows(items));
  s1['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, s1, 'Santrauka');
  const s2 = XLSX.utils.aoa_to_sheet(detailRows(items));
  s2['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 34 }, { wch: 22 }, { wch: 10 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, s2, 'Detaliai');
  const s3 = XLSX.utils.aoa_to_sheet(checkRows(checks));
  s3['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, s3, 'Savikontrolė');
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
}

export function buildCsv(items: QtoItem[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return detailRows(items).map((r) => r.map(esc).join(';')).join('\n');
}
