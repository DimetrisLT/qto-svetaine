// Savikontrolės patikrinimai: geometrija, logika, pilnumas
import { categoryLabel, type CheckResult, type ElementCategory, type QtoItem, type SourceMeta } from '@/types/qto';
import { L } from '@/i18n/store';
import { fmt } from '@/lib/format';
import { polygonArea } from '@/lib/pdf/measure';
import { estimateOverlapRatio } from '@/lib/geometry2d';
import { computeBenchmarks } from '@/lib/benchmarks';

export function runSelfChecks(items: QtoItem[], metas: SourceMeta[]): CheckResult[] {
  const checks: CheckResult[] = [];
  let n = 0;
  const add = (group: CheckResult['group'], label: string, status: 'ok' | 'warn', details: string) => {
    n += 1;
    checks.push({ id: `chk_${n}`, group, label, status, details });
  };

  const parsed = metas.filter((m) => m.parsed);
  if (parsed.length === 0 || items.length === 0) {
    add('completeness', L({ lt: 'Duomenų įkėlimas', en: 'Data upload' }), 'warn', L({ lt: 'Neįkeltas nė vienas failas arba nerasta jokių elementų.', en: 'No file uploaded or no elements found.' }));
    return checks;
  }

  // --- PILNUMAS ---
  for (const m of parsed) {
    if (m.source === 'IFC') {
      add('completeness', L({ lt: `IFC failas „${m.fileName}“`, en: `IFC file "${m.fileName}"` }), 'ok',
        L({ lt: `Atpažinta elementų: ${m.totalElements ?? 0} (vienetai: ${m.unitLabel ?? 'm'}).`, en: `Elements recognized: ${m.totalElements ?? 0} (units: ${m.unitLabel ?? 'm'}).` }));
      if ((m.withoutQuantities ?? 0) > 0) {
        add('completeness', L({ lt: 'IFC elementai be Qto savybių', en: 'IFC elements without Qto properties' }), 'warn',
          L({ lt: `${m.withoutQuantities} elementų neturi deklaruotų kiekių (${(m.withoutQuantitiesClasses ?? []).join(', ') || 'įvairūs'}). Jiems kiekiai apskaičiuoti iš geometrijos arba pažymėti „tik vnt.“.`, en: `${m.withoutQuantities} elements have no declared quantities (${(m.withoutQuantitiesClasses ?? []).join(', ') || 'various'}). Their quantities were computed from geometry or marked "count only".` }));
      } else {
        add('completeness', L({ lt: 'IFC Qto savybės', en: 'IFC Qto properties' }), 'ok', L({ lt: 'Visi elementai turi deklaruotas kiekių (Qto) savybes.', en: 'All elements have declared quantity (Qto) properties.' }));
      }
    }
    if (m.source === 'PDF') {
      const files = m.pdfFiles ?? [];
      const uncal = files.filter((f) => !f.calibrated);
      if (files.length > 0) {
        add('completeness', L({ lt: 'PDF projekto failai', en: 'PDF project files' }), 'ok',
          L({ lt: `Projektas: ${files.length} failai (${files.map((f) => `${f.discipline}`).join(', ')}). Visi matavimai sueina į bendrą žiniaraštį.`, en: `Project: ${files.length} files (${files.map((f) => `${f.discipline}`).join(', ')}). All measurements flow into one schedule.` }));
      }
      if (uncal.length > 0) {
        add('completeness', L({ lt: 'PDF mastelio kalibravimas', en: 'PDF scale calibration' }), 'warn',
          L({ lt: `Nesukalibruoti failai: ${uncal.map((f) => `„${f.name}“`).join(', ')}. Kiekvienam failui sukalibruokite mastelį dviejų žinomų taškų atstumu arba taikykite automatiškai aptiktą mastelį.`, en: `Uncalibrated files: ${uncal.map((f) => `"${f.name}"`).join(', ')}. Calibrate each file with two known points or apply the automatically detected scale.` }));
      } else if (files.length > 0) {
        add('completeness', L({ lt: 'PDF mastelio kalibravimas', en: 'PDF scale calibration' }), 'ok', L({ lt: 'Visiems PDF failams mastelis sukalibruotas.', en: 'Scale calibrated for all PDF files.' }));
      }
      // Rankinės kalibracijos neatitiktis automatiškai aptiktam masteliui
      const deviating = files.filter((f) =>
        f.upm && f.detectedUpm && Math.abs(f.upm - f.detectedUpm) / f.detectedUpm > 0.02);
      if (deviating.length > 0) {
        add('completeness', L({ lt: 'PDF mastelio neatitiktis', en: 'PDF scale mismatch' }), 'warn',
          L({ lt: `Rankinė kalibracija nukrypsta >2 % nuo brėžinyje nurodyto mastelio: ${deviating.map((f) => `„${f.name}“ (${fmt(Math.abs(f.upm! - f.detectedUpm!) / f.detectedUpm! * 100, 1)} %)`).join(', ')}. Patikrinkite etaloną arba taikykite aptiktą mastelį.`, en: `Manual calibration deviates >2% from the scale noted on the drawing: ${deviating.map((f) => `"${f.name}" (${fmt(Math.abs(f.upm! - f.detectedUpm!) / f.detectedUpm! * 100, 1)}%)`).join(', ')}. Check the reference or apply the detected scale.` }));
      } else if (files.some((f) => f.upm && f.detectedUpm)) {
        add('completeness', L({ lt: 'PDF mastelio sutapimas', en: 'PDF scale match' }), 'ok',
          L({ lt: 'Kalibracija sutampa su brėžinyje nurodytu masteliu (±2 %).', en: 'Calibration matches the scale noted on the drawing (±2%).' }));
      }
    }
    if (m.source === 'DXF') {
      const un = m.unassignedLayers ?? [];
      if (un.length > 0) {
        add('completeness', L({ lt: 'DXF nepriskirti sluoksniai', en: 'DXF unassigned layers' }), 'warn',
          L({ lt: `Šie sluoksniai turi geometrijos, bet neįtraukti į kiekius: ${un.join(', ')}.`, en: `These layers contain geometry but are not included in quantities: ${un.join(', ')}.` }));
      } else {
        add('completeness', L({ lt: 'DXF sluoksnių priskyrimas', en: 'DXF layer assignment' }), 'ok', L({ lt: 'Visi sluoksniai su geometrija įtraukti į kiekius.', en: 'All layers with geometry are included in quantities.' }));
      }
    }
  }

  // --- LOGIKA ---
  const zeroDim = items.filter((i) =>
    [i.length_m, i.width_m, i.height_m, i.area_m2, i.volume_m3].some((d) => d !== undefined && d <= 0));
  if (zeroDim.length) {
    add('logic', L({ lt: 'Nuliniai / neigiami matmenys', en: 'Zero / negative dimensions' }), 'warn',
      L({ lt: `${zeroDim.length} elementų turi nulinius arba neigiamus matmenis: ${zeroDim.slice(0, 5).map((i) => i.name).join(', ')}${zeroDim.length > 5 ? '…' : ''}`, en: `${zeroDim.length} elements have zero or negative dimensions: ${zeroDim.slice(0, 5).map((i) => i.name).join(', ')}${zeroDim.length > 5 ? '…' : ''}` }));
  } else {
    add('logic', L({ lt: 'Matmenų logika', en: 'Dimension logic' }), 'ok', L({ lt: 'Fiziškai nelogiškų (nulinių ar neigiamų) matmenų nerasta.', en: 'No physically impossible (zero or negative) dimensions found.' }));
  }

  const noMeasure = items.filter((i) =>
    i.unit !== 'vnt.' && i.area_m2 === undefined && i.volume_m3 === undefined && i.length_m === undefined);
  if (noMeasure.length) {
    add('logic', L({ lt: 'Elementai be matų', en: 'Elements without dimensions' }), 'warn',
      L({ lt: `${noMeasure.length} elementų neturi nei ilgio, nei ploto, nei tūrio (pvz., ${noMeasure.slice(0, 3).map((i) => i.name).join(', ')}).`, en: `${noMeasure.length} elements have neither length, area, nor volume (e.g., ${noMeasure.slice(0, 3).map((i) => i.name).join(', ')}).` }));
  }

  const noMaterial = items.filter((i) => !i.material);
  if (noMaterial.length && noMaterial.length < items.length) {
    add('logic', L({ lt: 'Medžiagų nenurodyta', en: 'Materials missing' }), 'warn',
      L({ lt: `${noMaterial.length} iš ${items.length} elementų neturi medžiagos žymos (šaltinyje nenurodyta).`, en: `${noMaterial.length} of ${items.length} elements have no material tag (not specified in the source).` }));
  } else if (noMaterial.length === items.length && items.length > 0) {
    add('logic', L({ lt: 'Medžiagų nenurodyta', en: 'Materials missing' }), 'warn', L({ lt: 'Nė vienas elementas neturi medžiagos žymos.', en: 'No element has a material tag.' }));
  } else {
    add('logic', L({ lt: 'Medžiagų žymos', en: 'Material tags' }), 'ok', L({ lt: 'Visiems elementams nurodytos medžiagos.', en: 'All elements have materials specified.' }));
  }

  // --- GEOMETRIJA ---
  // 1) IFC: deklaruotas tūris vs tūris iš geometrijos
  const cross = items.filter((i) => i.source === 'IFC' && i.declaredVolume_m3 && i.meshVolume_m3 && i.declaredVolume_m3 > 0);
  const deviating = cross.filter((i) => Math.abs(i.meshVolume_m3! - i.declaredVolume_m3!) / i.declaredVolume_m3! > 0.2);
  if (cross.length > 0) {
    if (deviating.length === 0) {
      add('geometry', L({ lt: 'IFC tūrių kryžminis patikrinimas', en: 'IFC volume cross-check' }), 'ok',
        L({ lt: `${cross.length} elementų deklaruoti tūriais sutampa su geometriniais (±20 %).`, en: `Declared volumes of ${cross.length} elements match the geometric ones (±20%).` }));
    } else {
      add('geometry', L({ lt: 'IFC tūrių kryžminis patikrinimas', en: 'IFC volume cross-check' }), 'warn',
        L({ lt: `${deviating.length} iš ${cross.length} elementų geometrinis tūris skiriasi >20 % (gali būti dėl angų, sudėtingos geometrijos). Pvz.: ${deviating.slice(0, 3).map((i) => i.name).join(', ')}.`, en: `${deviating.length} of ${cross.length} elements' geometric volume differs >20% (may be due to openings or complex geometry). E.g.: ${deviating.slice(0, 3).map((i) => i.name).join(', ')}.` }));
    }
  }

  // 2) IFC: perdangų plotas vs patalpų plotas
  const meta = parsed.find((m) => m.source === 'IFC');
  if (meta?.spaceArea_m2) {
    const slabArea = items.filter((i) => i.source === 'IFC' && i.category === 'slab')
      .reduce((s, i) => s + (i.area_m2 ?? 0), 0);
    if (slabArea > 0) {
      const diff = Math.abs(slabArea - meta.spaceArea_m2) / meta.spaceArea_m2;
      if (diff <= 0.35) {
        add('geometry', L({ lt: 'Perdangų ir patalpų plotų sutapimas', en: 'Slab vs. space area match' }), 'ok',
          L({ lt: `Perdangų plotas ${fmt(slabArea)} m², patalpų plotas ${fmt(meta.spaceArea_m2)} m² (skirtumas ${fmt(diff * 100, 1)} %).`, en: `Slab area ${fmt(slabArea)} m², space area ${fmt(meta.spaceArea_m2)} m² (difference ${fmt(diff * 100, 1)}%).` }));
      } else {
        add('geometry', L({ lt: 'Perdangų ir patalpų plotų sutapimas', en: 'Slab vs. space area match' }), 'warn',
          L({ lt: `Perdangų plotas ${fmt(slabArea)} m² gerokai skiriasi nuo patalpų ploto ${fmt(meta.spaceArea_m2)} m² (${fmt(diff * 100, 1)} %). Patikrinkite, ar įtrauktos visos perdangos.`, en: `Slab area ${fmt(slabArea)} m² differs significantly from space area ${fmt(meta.spaceArea_m2)} m² (${fmt(diff * 100, 1)}%). Check that all slabs are included.` }));
      }
    }
  }

  // 3) Suvestinė pagal kategorijas ir kilmę
  const cats = new Set(items.map((i) => i.category));
  add('geometry', L({ lt: 'Kiekių suvestinė', en: 'Quantity summary' }), 'ok',
    L({ lt: `Iš viso eilučių: ${items.length}. Kategorijos: ${[...cats].map((c) => categoryLabel(c)).join(', ')}.`, en: `Total rows: ${items.length}. Categories: ${[...cats].map((c) => categoryLabel(c)).join(', ')}.` }));

  const proj = items.filter((i) => i.origin === 'project').length;
  const ai = items.length - proj;
  add('completeness', L({ lt: 'Kiekių kilmė', en: 'Quantity origin' }), 'ok',
    L({ lt: `Projekto duomenys: ${proj} poz.; skaičiuota AI: ${ai} poz. Žiniaraštyje jos pažymėtos atskirai.`, en: `Project data: ${proj} rows; AI calculated: ${ai} rows. They are tagged separately in the schedule.` }));

  // --- DVIGUBO SKAIČIAVIMO KONTROLĖ ---
  // 4) To paties failo/puslapio/kategorijos plotų persidengimai
  const areaItems = items.filter((i) => i.pdfPoints && i.pdfKind === 'area' && i.pdfPoints.length >= 3);
  const overlapPairs: Array<{ a: QtoItem; b: QtoItem; ratio: number }> = [];
  for (let x = 0; x < areaItems.length; x++) {
    for (let y = x + 1; y < areaItems.length; y++) {
      const A = areaItems[x], B = areaItems[y];
      if (A.category !== B.category || A.pdfFile !== B.pdfFile || A.pdfPage !== B.pdfPage) continue;
      const ratio = estimateOverlapRatio(A.pdfPoints!, B.pdfPoints!, polygonArea(A.pdfPoints!), polygonArea(B.pdfPoints!));
      if (ratio > 0.1) overlapPairs.push({ a: A, b: B, ratio });
    }
  }
  if (overlapPairs.length > 0) {
    add('geometry', L({ lt: 'Plotų persidengimas (dvigubas skaičiavimas?)', en: 'Area overlap (double counting?)' }), 'warn',
      L({ lt: `${overlapPairs.length} porų tos pačios kategorijos plotai persidengia >10 %: ${overlapPairs.slice(0, 3).map((p) => `„${p.a.name}“ ∩ „${p.b.name}“ (${fmt(p.ratio * 100, 0)} %)`).join('; ')}${overlapPairs.length > 3 ? '…' : ''}. Patikrinkite, ar neskačiuojate tos pačios vietos dukart.`, en: `${overlapPairs.length} pairs of same-category areas overlap >10%: ${overlapPairs.slice(0, 3).map((p) => `"${p.a.name}" ∩ "${p.b.name}" (${fmt(p.ratio * 100, 0)}%)`).join('; ')}${overlapPairs.length > 3 ? '…' : ''}. Check you are not counting the same spot twice.` }));
  } else if (areaItems.length >= 2) {
    add('geometry', L({ lt: 'Plotų persidengimas', en: 'Area overlap' }), 'ok', L({ lt: 'Tos pačios kategorijos išmatuoti plotai tarpusavyje reikšmingai nepersidengia.', en: 'Measured areas of the same category do not overlap significantly.' }));
  }

  // 5) Tos pačios kategorijos ilgiai skirtingose projekto dalyse (A ↔ SK)
  const byDiscCat = new Map<string, number>();
  for (const i of items) {
    if (!i.length_m || i.length_m <= 0 || !i.discipline) continue;
    const key = `${i.discipline}|${i.category}`;
    byDiscCat.set(key, (byDiscCat.get(key) ?? 0) + i.length_m);
  }
  const dupPairs: string[] = [];
  const keys = [...byDiscCat.keys()];
  for (let x = 0; x < keys.length; x++) {
    for (let y = x + 1; y < keys.length; y++) {
      const [dA, cA] = keys[x].split('|');
      const [dB, cB] = keys[y].split('|');
      if (dA === dB || cA !== cB) continue;
      const vA = byDiscCat.get(keys[x])!, vB = byDiscCat.get(keys[y])!;
      if (vA > 0 && vB > 0 && Math.abs(vA - vB) / Math.max(vA, vB) <= 0.05) {
        dupPairs.push(`${categoryLabel(cA as ElementCategory)}: ${dA} ${fmt(vA)} m ≈ ${dB} ${fmt(vB)} m`);
      }
    }
  }
  if (dupPairs.length > 0) {
    add('geometry', L({ lt: 'Kiekiai dubliuojasi tarp projekto dalių', en: 'Quantities duplicated across disciplines' }), 'warn',
      L({ lt: `Beveik vienodi ilgiai skirtingose dalyse (±5 %): ${dupPairs.slice(0, 3).join('; ')}. Jei tai ta pati konstrukcija A ir SK brėžiniuose – palikite tik vieną šaltinį.`, en: `Nearly identical lengths in different disciplines (±5%): ${dupPairs.slice(0, 3).join('; ')}. If this is the same structure in the A and S drawings – keep only one source.` }));
  }

  // 6) Skaičiavimo (vnt.) sutikrinimas su projekto žiniaraščiu (OCR)
  const projCounts = new Map<string, number>();
  const aiCounts = new Map<string, number>();
  for (const i of items) {
    if (i.unit !== 'vnt.') continue;
    const map = i.origin === 'project' ? projCounts : aiCounts;
    map.set(i.category, (map.get(i.category) ?? 0) + i.count);
  }
  const countMismatches: string[] = [];
  const countMatches: string[] = [];
  for (const [cat, pv] of projCounts) {
    const av = aiCounts.get(cat);
    if (av === undefined) continue;
    const cl = categoryLabel(cat as ElementCategory);
    if (pv === av) countMatches.push(`${cl}: ${pv} ${L({ lt: 'vnt.', en: 'pcs' })}`);
    else countMismatches.push(L({ lt: `${cl}: žiniaraštyje ${pv} vnt., išmatuota plane ${av} vnt.`, en: `${cl}: ${pv} pcs in schedule, ${av} pcs measured on plan` }));
  }
  if (countMismatches.length > 0) {
    add('geometry', L({ lt: 'Skaičiavimas nesutampa su projekto žiniaraščiu', en: 'Count does not match the project schedule' }), 'warn',
      L({ lt: `${countMismatches.join('; ')}. Patikrinkite, ar plane nepraleista pozicijų arba žiniaraštis neįtrauktas dukart.`, en: `${countMismatches.join('; ')}. Check whether rows were missed on the plan or the schedule was included twice.` }));
  } else if (countMatches.length > 0) {
    add('geometry', L({ lt: 'Skaičiavimo sutikrinimas su žiniaraščiu', en: 'Count cross-check with schedule' }), 'ok',
      L({ lt: `Vnt. kiekiai sutampa su projekto žiniaraščiu: ${countMatches.join('; ')}.`, en: `Piece counts match the project schedule: ${countMatches.join('; ')}.` }));
  }

  // --- ŠALTINIŲ TRIANGULIACIJA ---
  // 7) OCR žiniaraščio aritmetika: pozicijų suma vs „VISO“ eilutė
  const visoGroups = new Map<string, QtoItem[]>();
  for (const i of items) {
    if (!i.visoCandidates || i.visoCandidates.length === 0) continue;
    const key = `${i.pdfFile}|${i.pdfPage}`;
    const arr = visoGroups.get(key) ?? [];
    arr.push(i);
    visoGroups.set(key, arr);
  }
  for (const [key, gitems] of visoGroups) {
    const candidates = gitems[0].visoCandidates!;
    const sumVol = gitems.reduce((s, i) => s + (i.volume_m3 ?? 0), 0);
    const sumMass = gitems.reduce((s, i) => s + (i.mass_kg ?? 0), 0);
    const sumCount = gitems.reduce((s, i) => s + (i.unit === 'vnt.' ? i.count : 0), 0);
    const sums: Array<{ label: string; value: number }> = [];
    if (sumVol > 0) sums.push({ label: `${fmt(sumVol, 2)} m³`, value: sumVol });
    if (sumMass > 0) sums.push({ label: `${fmt(sumMass, 1)} kg`, value: sumMass });
    if (sumCount > 0 && sumVol === 0 && sumMass === 0) sums.push({ label: `${fmt(sumCount, 0)} vnt.`, value: sumCount });
    const hit = candidates.find((c) => sums.some((s) => s.value > 0 && Math.abs(s.value - c) / c <= 0.02));
    const page = key.split('|')[1];
    if (hit !== undefined) {
      const matchSum = sums.find((s) => Math.abs(s.value - hit) / hit <= 0.02)!;
      add('geometry', L({ lt: 'OCR žiniaraščio aritmetika', en: 'OCR schedule arithmetic' }), 'ok',
        L({ lt: `p.${page}: pozicijų suma ${matchSum.label} sutampa su žiniaraščio „VISO“ eilute (±2 %).`, en: `p.${page}: row sum ${matchSum.label} matches the schedule "TOTAL" row (±2%).` }));
    } else if (sums.length > 0) {
      add('geometry', L({ lt: 'OCR žiniaraščio aritmetika', en: 'OCR schedule arithmetic' }), 'warn',
        L({ lt: `p.${page}: pozicijų suma ${sums.map((s) => s.label).join(' + ')} NESUTAMPA su „VISO“ eilute (${candidates.map((c) => fmt(c, 2)).join(' / ')}). Galimai ne visos eilutės įtrauktos arba OCR suklaidino skaičių – patikrinkite.`, en: `p.${page}: row sum ${sums.map((s) => s.label).join(' + ')} does NOT match the "TOTAL" row (${candidates.map((c) => fmt(c, 2)).join(' / ')}). Some rows may be missing or OCR misread a number – please check.` }));
    }
  }

  // 8) Projekto duomenys ↔ AI matavimai toje pačioje kategorijoje (plotai, tūriai, ilgiai)
  type Kind = { get: (i: QtoItem) => number | undefined; unit: string; lt: string; en: string };
  const KINDS: Kind[] = [
    { get: (i) => i.area_m2, unit: 'm²', lt: 'plotas', en: 'area' },
    { get: (i) => i.volume_m3, unit: 'm³', lt: 'tūris', en: 'volume' },
    { get: (i) => i.length_m, unit: 'm', lt: 'ilgis', en: 'length' },
  ];
  const triOk: string[] = [];
  const triWarn: string[] = [];
  for (const cat of new Set(items.map((i) => i.category))) {
    const catItems = items.filter((i) => i.category === cat);
    for (const k of KINDS) {
      const projSum = catItems.filter((i) => i.origin === 'project').reduce((s, i) => s + (k.get(i) ?? 0), 0);
      const aiSum = catItems.filter((i) => i.origin === 'ai').reduce((s, i) => s + (k.get(i) ?? 0), 0);
      if (projSum <= 0 || aiSum <= 0) continue;
      const label = `${categoryLabel(cat)} (${L({ lt: k.lt, en: k.en })}): proj. ${fmt(projSum)} ${k.unit} vs AI ${fmt(aiSum)} ${k.unit}`;
      if (Math.abs(projSum - aiSum) / Math.max(projSum, aiSum) <= 0.1) triOk.push(label);
      else triWarn.push(label);
    }
  }
  if (triWarn.length > 0) {
    add('geometry', L({ lt: 'Trianguliacija proj. ↔ AI', en: 'Triangulation proj. ↔ AI' }), 'warn',
      L({ lt: `${triWarn.slice(0, 3).join('; ')}. Nesutapimas >10 % – patikrinkite apimtis (brutto/neto skirtumai yra įprasti, bet verta peržiūrėti).`, en: `${triWarn.slice(0, 3).join('; ')}. Mismatch >10% – check the scopes (gross/net differences are common but worth reviewing).` }));
  }
  if (triOk.length > 0) {
    add('geometry', L({ lt: 'Trianguliacija proj. ↔ AI', en: 'Triangulation proj. ↔ AI' }), 'ok',
      L({ lt: `Projekto duomenys ir AI matavimai sutampa (±10 %): ${triOk.slice(0, 3).join('; ')}.`, en: `Project data and AI measurements agree (±10%): ${triOk.slice(0, 3).join('; ')}.` }));
  }

  // 9) IFC ↔ PDF kryžminis sutikrinimas toje pačioje kategorijoje
  const ifcItems = items.filter((i) => i.source === 'IFC');
  const pdfItems = items.filter((i) => i.source === 'PDF');
  if (ifcItems.length > 0 && pdfItems.length > 0) {
    const crossOk: string[] = [];
    const crossWarn: string[] = [];
    for (const cat of new Set([...ifcItems.map((i) => i.category), ...pdfItems.map((i) => i.category)])) {
      for (const k of KINDS.slice(0, 2)) { // plotas, tūris
        const a = ifcItems.filter((i) => i.category === cat).reduce((s, i) => s + (k.get(i) ?? 0), 0);
        const b = pdfItems.filter((i) => i.category === cat).reduce((s, i) => s + (k.get(i) ?? 0), 0);
        if (a <= 0 || b <= 0) continue;
        const label = `${categoryLabel(cat)} (${L({ lt: k.lt, en: k.en })}): IFC ${fmt(a)} ${k.unit} vs PDF ${fmt(b)} ${k.unit}`;
        if (Math.abs(a - b) / Math.max(a, b) <= 0.1) crossOk.push(label);
        else crossWarn.push(label);
      }
    }
    if (crossWarn.length > 0) {
      add('geometry', L({ lt: 'Trianguliacija IFC ↔ PDF', en: 'Triangulation IFC ↔ PDF' }), 'warn',
        L({ lt: `${crossWarn.slice(0, 3).join('; ')}. Modelio ir brėžinio kiekiai skiriasi >10 % – patikrinkite, ar abu šaltiniai apima tą pačią apimtį.`, en: `${crossWarn.slice(0, 3).join('; ')}. Model and drawing quantities differ >10% – check that both sources cover the same scope.` }));
    } else if (crossOk.length > 0) {
      add('geometry', L({ lt: 'Trianguliacija IFC ↔ PDF', en: 'Triangulation IFC ↔ PDF' }), 'ok',
        L({ lt: `IFC modelio ir PDF matavimų kiekiai sutampa (±10 %): ${crossOk.slice(0, 3).join('; ')}.`, en: `IFC model and PDF measurement quantities agree (±10%): ${crossOk.slice(0, 3).join('; ')}.` }));
    }
  }

  // 10) Pasikartojančios projekto pozicijos (galimas dvigubas įtraukimas)
  const nameCount = new Map<string, number>();
  for (const i of items) {
    if (i.origin !== 'project') continue;
    const key = `${i.name.trim().toUpperCase().replace(/\s+/g, ' ')}|${i.unit}`;
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
  }
  const dupNames = [...nameCount.entries()].filter(([, n]) => n > 1);
  if (dupNames.length > 0) {
    add('geometry', L({ lt: 'Pasikartojančios projekto pozicijos', en: 'Duplicate project rows' }), 'warn',
      L({ lt: `${dupNames.length} pozicijos įtrauktos daugiau nei vieną kartą: ${dupNames.slice(0, 3).map(([n, c]) => `„${n.split('|')[0]}“ ×${c}`).join('; ')}. Jei tai skirtingi brėžinių lapai – ignoruokite, jei tas pats žiniaraštis – palikite vieną.`, en: `${dupNames.length} rows were added more than once: ${dupNames.slice(0, 3).map(([n, c]) => `"${n.split('|')[0]}" ×${c}`).join('; ')}. If these are different drawing sheets – ignore; if it is the same schedule – keep one.` }));
  }

  // 11) Rodiklių „sveiko proto“ patikra (benchmark): santykiai prieš tipines normas
  for (const b of computeBenchmarks(items)) {
    if (b.status === 'na') continue;
    add('logic', `${L({ lt: 'Rodiklis', en: 'Ratio' })}: ${b.label}`, b.status, b.details);
  }

  return checks;
}
