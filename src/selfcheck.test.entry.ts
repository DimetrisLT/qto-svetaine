// Savikontrolės ir mastelio aptikimo modulių vienetiniai testai (bundlinama su esbuild)
import { runSelfChecks } from '@/lib/selfCheck';
import { detectScaleFromText, paperFromPoints, unitsPerMeterFor, suggestForPage, deviationPct } from '@/lib/pdf/scaleDetect';
import { saveProject, loadProject, clearProject, parseProjectJson, totalItems } from '@/lib/projectStore';
import type { QtoItem, SourceMeta } from '@/types/qto';

// localStorage imitacija Node aplinkai
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };
}

let pass = 0, fail = 0;
function t(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

// --- scaleDetect ---
console.log('scaleDetect:');
t('M1:100 atpažinimas', detectScaleFromText('PAMATŲ PLANAS M1:100') === 100);
t('„Mastelis 1:50“ atpažinimas', detectScaleFromText('Mastelis 1:50 lapo') === 50);
t('be mastelio → null', detectScaleFromText('PASTABOS DĖL BETONO C25/30') === null);
t('dažniausias laimi', detectScaleFromText('M1:100 planas, mazgas 1:20, M 1:100') === 100);
t('A3 landscape', paperFromPoints(1190.55, 841.89)?.name === 'A3');
t('A4 portrait', paperFromPoints(595.3, 841.9)?.name === 'A4');
t('ne formatas → null', paperFromPoints(1000, 1000) === null);
const upm = unitsPerMeterFor(1190.55, 841.89, 100)!;
t('A3+1:100 upm ≈ 28.35', Math.abs(upm - 1190.55 / 42) < 0.01, `gauta ${upm}`);
t('suggestForPage pilnas', suggestForPage(1190.55, 841.89, 'PLANAS M1:100')?.scale === 100);
t('deviationPct', Math.abs(deviationPct(26.75, 28.35) - 5.64) < 0.1);

// --- selfCheck ---
console.log('selfCheck:');
const base: QtoItem = {
  id: 'x', source: 'PDF', category: 'slab', name: 'x', count: 1, unit: 'm²', origin: 'ai',
};

// (a) plotų persidengimas: du 100x100 kvadratai, 50% persidengimas
const sq = (dx: number) => [{ x: dx, y: 0 }, { x: dx + 100, y: 0 }, { x: dx + 100, y: 100 }, { x: 0 + dx, y: 100 }];
const itemsOverlap: QtoItem[] = [
  { ...base, id: 'a1', name: 'Kambarys 1', pdfPoints: sq(0), pdfKind: 'area', pdfPage: 1, pdfFile: 'f1', area_m2: 10 },
  { ...base, id: 'a2', name: 'Kambarys 2', pdfPoints: sq(50), pdfKind: 'area', pdfPage: 1, pdfFile: 'f1', area_m2: 10 },
];
let checks = runSelfChecks(itemsOverlap, [{ source: 'PDF', parsed: true, pdfFiles: [{ id: 'f1', name: 'f.pdf', discipline: 'A', calibrated: true }] }]);
t('persidengimas aptinkamas', checks.some((c) => c.label.includes('persidengimas') && c.status === 'warn'));

// (a2) nepersidengiantys → ok
const itemsNoOverlap: QtoItem[] = [
  { ...base, id: 'a1', name: 'K1', pdfPoints: sq(0), pdfKind: 'area', pdfPage: 1, pdfFile: 'f1', area_m2: 10 },
  { ...base, id: 'a2', name: 'K2', pdfPoints: sq(200), pdfKind: 'area', pdfPage: 1, pdfFile: 'f1', area_m2: 10 },
];
checks = runSelfChecks(itemsNoOverlap, [{ source: 'PDF', parsed: true, pdfFiles: [{ id: 'f1', name: 'f.pdf', discipline: 'A', calibrated: true }] }]);
t('be persidengimo → ok', checks.some((c) => c.label === 'Plotų persidengimas' && c.status === 'ok'));

// (b) A↔SK dubliavimas
const itemsDup: QtoItem[] = [
  { ...base, id: 'w1', category: 'wall', name: 'Sienos A', unit: 'm', length_m: 100, discipline: 'A' },
  { ...base, id: 'w2', category: 'wall', name: 'Sienos SK', unit: 'm', length_m: 101, discipline: 'SK' },
];
checks = runSelfChecks(itemsDup, [{ source: 'PDF', parsed: true, pdfFiles: [{ id: 'f1', name: 'f.pdf', discipline: 'A', calibrated: true }] }]);
t('A↔SK dubliavimas aptinkamas', checks.some((c) => c.label.includes('dubliuojasi') && c.status === 'warn'));

// (c) OCR žiniaraštis vs skaičiavimas
const itemsCnt: QtoItem[] = [
  { ...base, id: 'p1', category: 'footing', name: 'Poliai žiniaraštis', unit: 'vnt.', count: 30, origin: 'project' },
  { ...base, id: 'p2', category: 'footing', name: 'Poliai plane', unit: 'vnt.', count: 28, origin: 'ai' },
];
checks = runSelfChecks(itemsCnt, [{ source: 'PDF', parsed: true, pdfFiles: [{ id: 'f1', name: 'f.pdf', discipline: 'SK', calibrated: true }] }]);
t('vnt. neatitiktis su žiniaraščiu', checks.some((c) => c.label.includes('nesutampa') && c.status === 'warn'));

const itemsCntOk: QtoItem[] = [
  { ...base, id: 'p1', category: 'footing', name: 'Poliai žiniaraštis', unit: 'vnt.', count: 36, origin: 'project' },
  { ...base, id: 'p2', category: 'footing', name: 'Poliai plane', unit: 'vnt.', count: 36, origin: 'ai' },
];
checks = runSelfChecks(itemsCntOk, [{ source: 'PDF', parsed: true, pdfFiles: [{ id: 'f1', name: 'f.pdf', discipline: 'SK', calibrated: true }] }]);
t('vnt. sutapimas → ok', checks.some((c) => c.label.includes('sutikrinimas') && c.status === 'ok'));

// (d) mastelio neatitiktis
const metaDev: SourceMeta[] = [{
  source: 'PDF', parsed: true,
  pdfFiles: [{ id: 'f1', name: 'A.pdf', discipline: 'A', calibrated: true, upm: 26.75, detectedUpm: 28.35 }],
}];
checks = runSelfChecks([base], metaDev);
t('mastelio neatitiktis >2% → warn', checks.some((c) => c.label === 'PDF mastelio neatitiktis' && c.status === 'warn'));

const metaOk: SourceMeta[] = [{
  source: 'PDF', parsed: true,
  pdfFiles: [{ id: 'f1', name: 'A.pdf', discipline: 'A', calibrated: true, upm: 28.2, detectedUpm: 28.35 }],
}];
checks = runSelfChecks([base], metaOk);
t('mastelis sutampa → ok', checks.some((c) => c.label === 'PDF mastelio sutapimas' && c.status === 'ok'));

// --- Trianguliacija ---
console.log('trianguliacija:');
const pdfMeta: SourceMeta[] = [{ source: 'PDF', parsed: true, pdfFiles: [{ id: 'f1', name: 'SK.pdf', discipline: 'SK', calibrated: true }] }];

// 7) OCR VISO aritmetika
const visoOk: QtoItem[] = [
  { ...base, id: 'v1', name: 'Sija 1', unit: 'm³', volume_m3: 60, pdfFile: 'f1', pdfPage: 8, origin: 'project', visoCandidates: [100] },
  { ...base, id: 'v2', name: 'Sija 2', unit: 'm³', volume_m3: 40, pdfFile: 'f1', pdfPage: 8, origin: 'project', visoCandidates: [100] },
];
checks = runSelfChecks(visoOk, pdfMeta);
t('VISO suma sutampa → ok', checks.some((c) => c.label === 'OCR žiniaraščio aritmetika' && c.status === 'ok'));

const visoBad: QtoItem[] = [
  { ...base, id: 'v1', name: 'Sija 1', unit: 'm³', volume_m3: 60, pdfFile: 'f1', pdfPage: 8, origin: 'project', visoCandidates: [100] },
];
checks = runSelfChecks(visoBad, pdfMeta);
t('VISO suma nesutampa → warn', checks.some((c) => c.label === 'OCR žiniaraščio aritmetika' && c.status === 'warn'));

// 8) proj. ↔ AI toje pačioje kategorijoje
const triWarnItems: QtoItem[] = [
  { ...base, id: 't1', category: 'wall', name: 'Sienos žin.', unit: 'm²', area_m2: 100, origin: 'project' },
  { ...base, id: 't2', category: 'wall', name: 'Sienos planas', unit: 'm²', area_m2: 150, origin: 'ai' },
];
checks = runSelfChecks(triWarnItems, pdfMeta);
t('proj↔AI >10% → warn', checks.some((c) => c.label === 'Trianguliacija proj. ↔ AI' && c.status === 'warn'));

const triOkItems: QtoItem[] = [
  { ...base, id: 't1', category: 'wall', name: 'Sienos žin.', unit: 'm²', area_m2: 100, origin: 'project' },
  { ...base, id: 't2', category: 'wall', name: 'Sienos planas', unit: 'm²', area_m2: 105, origin: 'ai' },
];
checks = runSelfChecks(triOkItems, pdfMeta);
t('proj↔AI ≤10% → ok', checks.some((c) => c.label === 'Trianguliacija proj. ↔ AI' && c.status === 'ok'));

// 9) IFC ↔ PDF
const crossItems: QtoItem[] = [
  { ...base, id: 'c1', source: 'IFC', category: 'slab', name: 'Perdanga IFC', unit: 'm²', area_m2: 100, origin: 'ai' },
  { ...base, id: 'c2', source: 'PDF', category: 'slab', name: 'Perdanga PDF', unit: 'm²', area_m2: 200, origin: 'ai' },
];
checks = runSelfChecks(crossItems, [{ source: 'IFC', parsed: true }, ...pdfMeta]);
t('IFC↔PDF >10% → warn', checks.some((c) => c.label === 'Trianguliacija IFC ↔ PDF' && c.status === 'warn'));

const crossOkItems: QtoItem[] = [
  { ...base, id: 'c1', source: 'IFC', category: 'slab', name: 'Perdanga IFC', unit: 'm²', area_m2: 100, origin: 'ai' },
  { ...base, id: 'c2', source: 'PDF', category: 'slab', name: 'Perdanga PDF', unit: 'm²', area_m2: 104, origin: 'ai' },
];
checks = runSelfChecks(crossOkItems, [{ source: 'IFC', parsed: true }, ...pdfMeta]);
t('IFC↔PDF ≤10% → ok', checks.some((c) => c.label === 'Trianguliacija IFC ↔ PDF' && c.status === 'ok'));

// 10) pasikartojančios projekto pozicijos
const dupItems: QtoItem[] = [
  { ...base, id: 'd1', name: 'Betonas C25/30', unit: 'm³', origin: 'project' },
  { ...base, id: 'd2', name: '  betonas   c25/30 ', unit: 'm³', origin: 'project' },
];
checks = runSelfChecks(dupItems, pdfMeta);
t('dublikuotos pozicijos → warn', checks.some((c) => c.label === 'Pasikartojančios projekto pozicijos' && c.status === 'warn'));

const noDupItems: QtoItem[] = [
  { ...base, id: 'd1', name: 'Betonas C25/30', unit: 'm³', origin: 'project' },
  { ...base, id: 'd2', name: 'Betonas C30/37', unit: 'm³', origin: 'project' },
];
checks = runSelfChecks(noDupItems, pdfMeta);
t('be dublių → nėra įspėjimo', !checks.some((c) => c.label === 'Pasikartojančios projekto pozicijos'));

// --- projectStore ---
console.log('projectStore:');
clearProject();
t('tuščia → null', loadProject() === null);
const storeItems: Record<'IFC' | 'PDF' | 'DXF', QtoItem[]> = { IFC: [], PDF: [visoOk[0]], DXF: [] };
const emptyMetas: Record<'IFC' | 'PDF' | 'DXF', SourceMeta> = {
  IFC: { source: 'IFC', parsed: false },
  PDF: { source: 'PDF', parsed: false },
  DXF: { source: 'DXF', parsed: false },
};
const storeMetas = { ...emptyMetas, PDF: pdfMeta[0] };
saveProject(storeItems, storeMetas);
const loaded = loadProject();
t('save/load roundtrip', loaded !== null && totalItems(loaded) === 1 && loaded.itemsBySource.PDF[0].name === 'Sija 1');
t('metai išsaugoti', loaded?.metas.PDF.pdfFiles?.[0].name === 'SK.pdf');
const parsed = parseProjectJson(JSON.stringify(loaded));
t('parseProjectJson roundtrip', parsed !== null && totalItems(parsed) === 1);
t('parseProjectJson blogas JSON → null', parseProjectJson('{ne json') === null);
t('parseProjectJson bloga versija → null', parseProjectJson(JSON.stringify({ version: 2, itemsBySource: {}, metas: {} })) === null);
clearProject();
t('clearProject', loadProject() === null);

console.log(`\nREZULTATAS: ${pass} ✓ / ${fail} ✗`);
if (fail > 0) throw new Error(`${fail} testų nepavyko`);
