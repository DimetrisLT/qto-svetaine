// Savikontrolės ir mastelio aptikimo modulių vienetiniai testai (bundlinama su esbuild)
import { runSelfChecks } from '@/lib/selfCheck';
import { detectScaleFromText, paperFromPoints, unitsPerMeterFor, suggestForPage, deviationPct } from '@/lib/pdf/scaleDetect';
import { saveProject, loadProject, clearProject, parseProjectJson, totalItems } from '@/lib/projectStore';
import { ASSEMBLY_TEMPLATES, applyAssembly, canApply } from '@/lib/assemblies';
import { computeBenchmarks, computeTotals } from '@/lib/benchmarks';
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

// --- assemblies (#2) ---
console.log('assemblies:');
const wallTpl = ASSEMBLY_TEMPLATES.find((t) => t.id === 'wall_len')!;
const wallSrc: QtoItem = { ...base, id: 'w', category: 'wall', name: 'Siena S-1', unit: 'm', length_m: 10, origin: 'ai' };
t('canApply: ilgis tinka sienai', canApply(wallTpl, wallSrc));
t('canApply: be ilgio netinka', !canApply(wallTpl, { ...wallSrc, length_m: undefined }));
const wallLines = applyAssembly(wallTpl, wallSrc, { h: 3, d: 0.25, r: 150 });
t('siena → 4 eilutės', wallLines.length === 4);
const bet = wallLines.find((l) => l.name.startsWith('Betonas'))!;
t('betonas = L·h·d', Math.abs(bet.count - 7.5) < 1e-9 && bet.unit === 'm³' && bet.volume_m3 === bet.count);
const kof = wallLines.find((l) => l.name.startsWith('Kofanas'))!;
t('kofanas = 2·L·h', Math.abs(kof.count - 60) < 1e-9 && kof.unit === 'm²');
const arm = wallLines.find((l) => l.name.startsWith('Armatūra'))!;
t('armatūra = V·r', Math.abs(arm.count - 1125) < 1e-9 && arm.unit === 'kg' && arm.mass_kg === arm.count);
const tink = wallLines.find((l) => l.name.startsWith('Tinkas'))!;
t('tinkas → fin_wall', tink.category === 'fin_wall' && Math.abs(tink.count - 60) < 1e-9);
t('eilutė rodo formulę', bet.note !== undefined && bet.note.includes('×'));
const colTpl = ASSEMBLY_TEMPLATES.find((t) => t.id === 'column')!;
const colLines = applyAssembly(colTpl, { ...wallSrc, category: 'column', length_m: 3 }, { a: 0.4, b: 0.4, r: 250 });
t('kolona: betonas = a·b·h', Math.abs(colLines[0].count - 0.48) < 1e-9);
t('kolona: kofanas = perimetras × h', Math.abs(colLines[1].count - 4.8) < 1e-9);
const slabTpl = ASSEMBLY_TEMPLATES.find((t) => t.id === 'slab')!;
const slabLines = applyAssembly(slabTpl, { ...wallSrc, category: 'slab', unit: 'm²', area_m2: 50, length_m: undefined }, { d: 0.2, r: 100 });
t('perdanga: betonas = A·d', Math.abs(slabLines[0].count - 10) < 1e-9);

// --- benchmarks (#4) ---
console.log('benchmarks:');
const okSet: QtoItem[] = [
  { ...base, id: 'b1', category: 'slab', name: 'Betonas', unit: 'm³', count: 40, volume_m3: 40, material: 'Betonas' },
  { ...base, id: 'b2', category: 'slab', name: 'Perdangos plotas', unit: 'm²', count: 100, area_m2: 100 },
  { ...base, id: 'b3', category: 'slab', name: 'Armatūra', unit: 'kg', count: 4000, mass_kg: 4000, material: 'Armatūra' },
  { ...base, id: 'b4', category: 'wall', name: 'Kofanas', unit: 'm²', count: 400, area_m2: 400 },
];
const bm = computeBenchmarks(okSet);
t('betonas/m² ok', bm.find((b) => b.id === 'concrete_per_floor')?.status === 'ok');
t('armatūra kg/m³ ok', bm.find((b) => b.id === 'rebar_per_concrete')?.status === 'ok');
t('kofanas/m³ ok', bm.find((b) => b.id === 'formwork_per_concrete')?.status === 'ok');
const badSet: QtoItem[] = [
  { ...base, id: 'b1', category: 'slab', name: 'Betonas', unit: 'm³', count: 400, volume_m3: 400, material: 'Betonas' },
  { ...base, id: 'b2', category: 'slab', name: 'Perdangos plotas', unit: 'm²', count: 100, area_m2: 100 },
];
const bmBad = computeBenchmarks(badSet);
t('10× mastelio klaida → warn', bmBad.find((b) => b.id === 'concrete_per_floor')?.status === 'warn');
t('be duomenų → na', computeBenchmarks([base]).every((b) => b.status === 'na'));
const totals = computeTotals(okSet);
t('totals: betonas 40 m³', totals.concrete_m3 === 40 && totals.floorArea_m2 === 100);
checks = runSelfChecks(okSet, pdfMeta);
t('savikontrolėje rodomi rodikliai', checks.some((c) => c.label.startsWith('Rodiklis:') && c.status === 'ok'));
checks = runSelfChecks(badSet, pdfMeta);
t('savikontrolė įspėja dėl rodiklio', checks.some((c) => c.label === 'Rodiklis: Betonas / grindų plotas' && c.status === 'warn'));

console.log(`\nREZULTATAS: ${pass} ✓ / ${fail} ✗`);
if (fail > 0) throw new Error(`${fail} testų nepavyko`);
