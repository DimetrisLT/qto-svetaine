// Excel (XLSX) eksportas ir CSV kopijavimas
import * as XLSX from 'xlsx';
import { CATEGORY_ORDER, ORIGIN_INFO, categoryLabel, originLabel, type CheckResult, type QtoItem } from '@/types/qto';
import { buildZiniarastis } from '@/lib/works';
import { round } from '@/lib/format';
import { L } from '@/i18n/store';
import { convertUnitLabel, convertValue, getUnitSystem, type UnitSystem } from '@/lib/units';

/** Reikšmė → aktyvūs vienetai (eksportui); '' paliekamas tuščias */
function conv(v: number | '', unit: string, sys: UnitSystem): number | '' {
  return v === '' ? '' : round(convertValue(v, unit, sys), 2);
}

function summaryRows(items: QtoItem[], sys: UnitSystem) {
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
  const M = convertUnitLabel('m', sys), M2 = convertUnitLabel('m²', sys), M3 = convertUnitLabel('m³', sys);
  const rows: Array<Array<string | number>> = [[
    L({ lt: 'Kategorija', en: 'Category' }), L({ lt: 'Šaltiniai', en: 'Sources' }), L({ lt: 'Eilučių sk.', en: 'Rows' }),
    `${L({ lt: 'Ilgis', en: 'Length' })} (${M})`, `${L({ lt: 'Plotas', en: 'Area' })} (${M2})`,
    `${L({ lt: 'Tūris', en: 'Volume' })} (${M3})`, `${L({ lt: 'Kiekis', en: 'Qty' })} (${convertUnitLabel('vnt.', sys)})`,
  ]];
  for (const cat of CATEGORY_ORDER) {
    const c = byCat.get(cat);
    if (!c) continue;
    rows.push([
      categoryLabel(cat), [...c.sources].join('+'), c.n,
      round(convertValue(c.m, 'm', sys), 2), round(convertValue(c.m2, 'm²', sys), 2), round(convertValue(c.m3, 'm³', sys), 2), c.vnt,
    ]);
  }
  const tot = [...byCat.values()].reduce((s, c) => ({
    n: s.n + c.n, m: s.m + c.m, m2: s.m2 + c.m2, m3: s.m3 + c.m3, vnt: s.vnt + c.vnt,
  }), { n: 0, m: 0, m2: 0, m3: 0, vnt: 0 });
  rows.push([L({ lt: 'VISO', en: 'TOTAL' }), '', tot.n,
    round(convertValue(tot.m, 'm', sys), 2), round(convertValue(tot.m2, 'm²', sys), 2), round(convertValue(tot.m3, 'm³', sys), 2), tot.vnt]);
  return rows;
}

function detailRows(items: QtoItem[], sys: UnitSystem) {
  const M = convertUnitLabel('m', sys), M2 = convertUnitLabel('m²', sys), M3 = convertUnitLabel('m³', sys), KG = convertUnitLabel('kg', sys);
  const rows: Array<Array<string | number>> = [[
    L({ lt: 'Šaltinis', en: 'Source' }), L({ lt: 'Dalis', en: 'Discipline' }), L({ lt: 'Kilmė', en: 'Origin' }),
    L({ lt: 'Kategorija', en: 'Category' }), L({ lt: 'Pavadinimas', en: 'Name' }), L({ lt: 'Medžiaga', en: 'Material' }),
    `${L({ lt: 'Ilgis', en: 'Length' })} (${M})`, `${L({ lt: 'Plotis/storis', en: 'Width/thickness' })} (${M})`, `${L({ lt: 'Aukštis', en: 'Height' })} (${M})`,
    `${L({ lt: 'Plotas', en: 'Area' })} (${M2})`, `${L({ lt: 'Tūris', en: 'Volume' })} (${M3})`,
    `${L({ lt: 'Kiekis', en: 'Qty' })} (${convertUnitLabel('vnt.', sys)})`, `${L({ lt: 'Masa', en: 'Mass' })} (${KG})`,
    L({ lt: 'Mato vnt.', en: 'Unit' }), L({ lt: 'Pastaba', en: 'Note' }),
  ]];
  for (const i of items) {
    rows.push([
      i.source, i.discipline ?? '', originLabel(i.origin), categoryLabel(i.category), i.name, i.material ?? '',
      conv(i.length_m ?? '', 'm', sys), conv((i.width_m ?? i.thickness_m) ?? '', 'm', sys), conv(i.height_m ?? '', 'm', sys),
      conv(i.area_m2 ?? '', 'm²', sys), conv(i.volume_m3 ?? '', 'm³', sys), i.count, conv(i.mass_kg ?? '', 'kg', sys),
      convertUnitLabel(i.unit, sys), i.note ?? '',
    ]);
  }
  return rows;
}

function ziniarastisRows(items: QtoItem[], sys: UnitSystem) {
  const groups = buildZiniarastis(items);
  const rows: Array<Array<string | number>> = [[
    L({ lt: 'Eil. nr.', en: 'No.' }), L({ lt: 'Darbo pobūdis / pozicija', en: 'Work type / item' }),
    L({ lt: 'Mato vnt.', en: 'Unit' }), L({ lt: 'Kiekis', en: 'Qty' }), L({ lt: 'Kilmė', en: 'Origin' }), L({ lt: 'Šaltiniai', en: 'Sources' }),
  ]];
  for (const { group, rows: grows } of groups) {
    rows.push([group.code, group.title.toUpperCase(), '', '', '', '']);
    grows.forEach((r, i) => {
      rows.push([`${group.code}.${i + 1}`, r.name, convertUnitLabel(r.unit, sys), round(convertValue(r.qty, r.unit, sys), 2), ORIGIN_INFO[r.origin] ? originLabel(r.origin) : '', r.sources.join(', ')]);
    });
  }
  return rows;
}

function checkRows(checks: CheckResult[]) {
  const rows: Array<Array<string | number>> = [[
    L({ lt: 'Grupė', en: 'Group' }), L({ lt: 'Patikrinimas', en: 'Check' }), L({ lt: 'Statusas', en: 'Status' }), L({ lt: 'Detalės', en: 'Details' }),
  ]];
  const groupLabel: Record<CheckResult['group'], string> = {
    geometry: L({ lt: 'Geometrija', en: 'Geometry' }),
    logic: L({ lt: 'Logika', en: 'Logic' }),
    completeness: L({ lt: 'Pilnumas', en: 'Completeness' }),
  };
  for (const c of checks) {
    rows.push([groupLabel[c.group], c.label, c.status === 'ok' ? L({ lt: 'TVARKOJ', en: 'OK' }) : L({ lt: 'DĖMESIO', en: 'ATTENTION' }), c.details]);
  }
  return rows;
}

export function exportToExcel(items: QtoItem[], checks: CheckResult[], fileBase?: string) {
  const sys = getUnitSystem();
  const base = fileBase ?? L({ lt: 'QTO_ziniarastis', en: 'QTO_schedule' });
  const wb = XLSX.utils.book_new();
  const s0 = XLSX.utils.aoa_to_sheet(ziniarastisRows(items, sys));
  s0['!cols'] = [{ wch: 9 }, { wch: 52 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, s0, L({ lt: 'Žiniaraštis', en: 'Schedule' }));
  const s1 = XLSX.utils.aoa_to_sheet(summaryRows(items, sys));
  s1['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, s1, L({ lt: 'Santrauka', en: 'Summary' }));
  const s2 = XLSX.utils.aoa_to_sheet(detailRows(items, sys));
  s2['!cols'] = [{ wch: 8 }, { wch: 7 }, { wch: 17 }, { wch: 16 }, { wch: 34 }, { wch: 22 }, { wch: 10 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, s2, L({ lt: 'Detaliai', en: 'Details' }));
  const s3 = XLSX.utils.aoa_to_sheet(checkRows(checks));
  s3['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, s3, L({ lt: 'Savikontrolė', en: 'Self-check' }));
  XLSX.writeFile(wb, `${base}.xlsx`);
}

export function buildCsv(items: QtoItem[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return detailRows(items, getUnitSystem()).map((r) => r.map(esc).join(';')).join('\n');
}
