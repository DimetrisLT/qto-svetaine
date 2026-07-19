// Savikontrolės patikrinimai: geometrija, logika, pilnumas
import { CATEGORY_INFO, type CheckResult, type QtoItem, type SourceMeta } from '@/types/qto';
import { fmt } from '@/lib/format';
import { polygonArea } from '@/lib/pdf/measure';
import { estimateOverlapRatio } from '@/lib/geometry2d';

export function runSelfChecks(items: QtoItem[], metas: SourceMeta[]): CheckResult[] {
  const checks: CheckResult[] = [];
  let n = 0;
  const add = (group: CheckResult['group'], label: string, status: 'ok' | 'warn', details: string) => {
    n += 1;
    checks.push({ id: `chk_${n}`, group, label, status, details });
  };

  const parsed = metas.filter((m) => m.parsed);
  if (parsed.length === 0 || items.length === 0) {
    add('completeness', 'Duomenų įkėlimas', 'warn', 'Neįkeltas nė vienas failas arba nerasta jokių elementų.');
    return checks;
  }

  // --- PILNUMAS ---
  for (const m of parsed) {
    if (m.source === 'IFC') {
      add('completeness', `IFC failas „${m.fileName}“`, 'ok',
        `Atpažinta elementų: ${m.totalElements ?? 0} (vienetai: ${m.unitLabel ?? 'm'}).`);
      if ((m.withoutQuantities ?? 0) > 0) {
        add('completeness', 'IFC elementai be Qto savybių', 'warn',
          `${m.withoutQuantities} elementų neturi deklaruotų kiekių (${(m.withoutQuantitiesClasses ?? []).join(', ') || 'įvairūs'}). Jiems kiekiai apskaičiuoti iš geometrijos arba pažymėti „tik vnt.“.`);
      } else {
        add('completeness', 'IFC Qto savybės', 'ok', 'Visi elementai turi deklaruotas kiekių (Qto) savybes.');
      }
    }
    if (m.source === 'PDF') {
      const files = m.pdfFiles ?? [];
      const uncal = files.filter((f) => !f.calibrated);
      if (files.length > 0) {
        add('completeness', 'PDF projekto failai', 'ok',
          `Projektas: ${files.length} failai (${files.map((f) => `${f.discipline}`).join(', ')}). Visi matavimai sueina į bendrą žiniaraštį.`);
      }
      if (uncal.length > 0) {
        add('completeness', 'PDF mastelio kalibravimas', 'warn',
          `Nesukalibruoti failai: ${uncal.map((f) => `„${f.name}“`).join(', ')}. Kiekvienam failui sukalibruokite mastelį dviejų žinomų taškų atstumu arba taikykite automatiškai aptiktą mastelį.`);
      } else if (files.length > 0) {
        add('completeness', 'PDF mastelio kalibravimas', 'ok', 'Visiems PDF failams mastelis sukalibruotas.');
      }
      // Rankinės kalibracijos neatitiktis automatiškai aptiktam masteliui
      const deviating = files.filter((f) =>
        f.upm && f.detectedUpm && Math.abs(f.upm - f.detectedUpm) / f.detectedUpm > 0.02);
      if (deviating.length > 0) {
        add('completeness', 'PDF mastelio neatitiktis', 'warn',
          `Rankinė kalibracija nukrypsta >2 % nuo brėžinyje nurodyto mastelio: ${deviating.map((f) => `„${f.name}“ (${fmt(Math.abs(f.upm! - f.detectedUpm!) / f.detectedUpm! * 100, 1)} %)`).join(', ')}. Patikrinkite etaloną arba taikykite aptiktą mastelį.`);
      } else if (files.some((f) => f.upm && f.detectedUpm)) {
        add('completeness', 'PDF mastelio sutapimas', 'ok',
          'Kalibracija sutampa su brėžinyje nurodytu masteliu (±2 %).');
      }
    }
    if (m.source === 'DXF') {
      const un = m.unassignedLayers ?? [];
      if (un.length > 0) {
        add('completeness', 'DXF nepriskirti sluoksniai', 'warn',
          `Šie sluoksniai turi geometrijos, bet neįtraukti į kiekius: ${un.join(', ')}.`);
      } else {
        add('completeness', 'DXF sluoksnių priskyrimas', 'ok', 'Visi sluoksniai su geometrija įtraukti į kiekius.');
      }
    }
  }

  // --- LOGIKA ---
  const zeroDim = items.filter((i) =>
    [i.length_m, i.width_m, i.height_m, i.area_m2, i.volume_m3].some((d) => d !== undefined && d <= 0));
  if (zeroDim.length) {
    add('logic', 'Nuliniai / neigiami matmenys', 'warn',
      `${zeroDim.length} elementų turi nulinius arba neigiamus matmenis: ${zeroDim.slice(0, 5).map((i) => i.name).join(', ')}${zeroDim.length > 5 ? '…' : ''}`);
  } else {
    add('logic', 'Matmenų logika', 'ok', 'Fiziškai nelogiškų (nulinių ar neigiamų) matmenų nerasta.');
  }

  const noMeasure = items.filter((i) =>
    i.unit !== 'vnt.' && i.area_m2 === undefined && i.volume_m3 === undefined && i.length_m === undefined);
  if (noMeasure.length) {
    add('logic', 'Elementai be matų', 'warn',
      `${noMeasure.length} elementų neturi nei ilgio, nei ploto, nei tūrio (pvz., ${noMeasure.slice(0, 3).map((i) => i.name).join(', ')}).`);
  }

  const noMaterial = items.filter((i) => !i.material);
  if (noMaterial.length && noMaterial.length < items.length) {
    add('logic', 'Medžiagų nenurodyta', 'warn',
      `${noMaterial.length} iš ${items.length} elementų neturi medžiagos žymos (šaltinyje nenurodyta).`);
  } else if (noMaterial.length === items.length && items.length > 0) {
    add('logic', 'Medžiagų nenurodyta', 'warn', 'Nė vienas elementas neturi medžiagos žymos.');
  } else {
    add('logic', 'Medžiagų žymos', 'ok', 'Visiems elementams nurodytos medžiagos.');
  }

  // --- GEOMETRIJA ---
  // 1) IFC: deklaruotas tūris vs tūris iš geometrijos
  const cross = items.filter((i) => i.source === 'IFC' && i.declaredVolume_m3 && i.meshVolume_m3 && i.declaredVolume_m3 > 0);
  const deviating = cross.filter((i) => Math.abs(i.meshVolume_m3! - i.declaredVolume_m3!) / i.declaredVolume_m3! > 0.2);
  if (cross.length > 0) {
    if (deviating.length === 0) {
      add('geometry', 'IFC tūrių kryžminis patikrinimas', 'ok',
        `${cross.length} elementų deklaruoti tūriais sutampa su geometriniais (±20 %).`);
    } else {
      add('geometry', 'IFC tūrių kryžminis patikrinimas', 'warn',
        `${deviating.length} iš ${cross.length} elementų geometrinis tūris skiriasi >20 % (gali būti dėl angų, sudėtingos geometrijos). Pvz.: ${deviating.slice(0, 3).map((i) => i.name).join(', ')}.`);
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
        add('geometry', 'Perdangų ir patalpų plotų sutapimas', 'ok',
          `Perdangų plotas ${fmt(slabArea)} m², patalpų plotas ${fmt(meta.spaceArea_m2)} m² (skirtumas ${fmt(diff * 100, 1)} %).`);
      } else {
        add('geometry', 'Perdangų ir patalpų plotų sutapimas', 'warn',
          `Perdangų plotas ${fmt(slabArea)} m² gerokai skiriasi nuo patalpų ploto ${fmt(meta.spaceArea_m2)} m² (${fmt(diff * 100, 1)} %). Patikrinkite, ar įtrauktos visos perdangos.`);
      }
    }
  }

  // 3) Suvestinė pagal kategorijas ir kilmę
  const cats = new Set(items.map((i) => i.category));
  add('geometry', 'Kiekių suvestinė', 'ok',
    `Iš viso eilučių: ${items.length}. Kategorijos: ${[...cats].map((c) => CATEGORY_INFO[c].lt).join(', ')}.`);

  const proj = items.filter((i) => i.origin === 'project').length;
  const ai = items.length - proj;
  add('completeness', 'Kiekių kilmė', 'ok',
    `Projekto duomenys: ${proj} poz.; skaičiuota AI: ${ai} poz. Žiniaraštyje jos pažymėtos atskirai.`);

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
    add('geometry', 'Plotų persidengimas (dvigubas skaičiavimas?)', 'warn',
      `${overlapPairs.length} porų tos pačios kategorijos plotai persidengia >10 %: ${overlapPairs.slice(0, 3).map((p) => `„${p.a.name}“ ∩ „${p.b.name}“ (${fmt(p.ratio * 100, 0)} %)`).join('; ')}${overlapPairs.length > 3 ? '…' : ''}. Patikrinkite, ar neskačiuojate tos pačios vietos dukart.`);
  } else if (areaItems.length >= 2) {
    add('geometry', 'Plotų persidengimas', 'ok', 'Tos pačios kategorijos išmatuoti plotai tarpusavyje reikšmingai nepersidengia.');
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
        dupPairs.push(`${CATEGORY_INFO[cA as QtoItem['category']].lt}: ${dA} ${fmt(vA)} m ≈ ${dB} ${fmt(vB)} m`);
      }
    }
  }
  if (dupPairs.length > 0) {
    add('geometry', 'Kiekiai dubliuojasi tarp projekto dalių', 'warn',
      `Beveik vienodi ilgiai skirtingose dalyse (±5 %): ${dupPairs.slice(0, 3).join('; ')}. Jei tai ta pati konstrukcija A ir SK brėžiniuose – palikite tik vieną šaltinį.`);
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
    const lt = CATEGORY_INFO[cat as QtoItem['category']].lt;
    if (pv === av) countMatches.push(`${lt}: ${pv} vnt.`);
    else countMismatches.push(`${lt}: žiniaraštyje ${pv} vnt., išmatuota plane ${av} vnt.`);
  }
  if (countMismatches.length > 0) {
    add('geometry', 'Skaičiavimas nesutampa su projekto žiniaraščiu', 'warn',
      `${countMismatches.join('; ')}. Patikrinkite, ar plane nepraleista pozicijų arba žiniaraštis neįtrauktas dukart.`);
  } else if (countMatches.length > 0) {
    add('geometry', 'Skaičiavimo sutikrinimas su žiniaraščiu', 'ok',
      `Vnt. kiekiai sutampa su projekto žiniaraščiu: ${countMatches.join('; ')}.`);
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
      add('geometry', 'OCR žiniaraščio aritmetika', 'ok',
        `p.${page}: pozicijų suma ${matchSum.label} sutampa su žiniaraščio „VISO“ eilute (±2 %).`);
    } else if (sums.length > 0) {
      add('geometry', 'OCR žiniaraščio aritmetika', 'warn',
        `p.${page}: pozicijų suma ${sums.map((s) => s.label).join(' + ')} NESUTAMPA su „VISO“ eilute (${candidates.map((c) => fmt(c, 2)).join(' / ')}). Galimai ne visos eilutės įtrauktos arba OCR suklaidino skaičių – patikrinkite.`);
    }
  }

  // 8) Projekto duomenys ↔ AI matavimai toje pačioje kategorijoje (plotai, tūriai, ilgiai)
  type Kind = { get: (i: QtoItem) => number | undefined; unit: string; lt: string };
  const KINDS: Kind[] = [
    { get: (i) => i.area_m2, unit: 'm²', lt: 'plotas' },
    { get: (i) => i.volume_m3, unit: 'm³', lt: 'tūris' },
    { get: (i) => i.length_m, unit: 'm', lt: 'ilgis' },
  ];
  const triOk: string[] = [];
  const triWarn: string[] = [];
  for (const cat of new Set(items.map((i) => i.category))) {
    const catItems = items.filter((i) => i.category === cat);
    for (const k of KINDS) {
      const projSum = catItems.filter((i) => i.origin === 'project').reduce((s, i) => s + (k.get(i) ?? 0), 0);
      const aiSum = catItems.filter((i) => i.origin === 'ai').reduce((s, i) => s + (k.get(i) ?? 0), 0);
      if (projSum <= 0 || aiSum <= 0) continue;
      const label = `${CATEGORY_INFO[cat].lt} (${k.lt}): proj. ${fmt(projSum)} ${k.unit} vs AI ${fmt(aiSum)} ${k.unit}`;
      if (Math.abs(projSum - aiSum) / Math.max(projSum, aiSum) <= 0.1) triOk.push(label);
      else triWarn.push(label);
    }
  }
  if (triWarn.length > 0) {
    add('geometry', 'Trianguliacija proj. ↔ AI', 'warn',
      `${triWarn.slice(0, 3).join('; ')}. Nesutapimas >10 % – patikrinkite apimtis (brutto/neto skirtumai yra įprasti, bet verta peržiūrėti).`);
  }
  if (triOk.length > 0) {
    add('geometry', 'Trianguliacija proj. ↔ AI', 'ok',
      `Projekto duomenys ir AI matavimai sutampa (±10 %): ${triOk.slice(0, 3).join('; ')}.`);
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
        const label = `${CATEGORY_INFO[cat].lt} (${k.lt}): IFC ${fmt(a)} ${k.unit} vs PDF ${fmt(b)} ${k.unit}`;
        if (Math.abs(a - b) / Math.max(a, b) <= 0.1) crossOk.push(label);
        else crossWarn.push(label);
      }
    }
    if (crossWarn.length > 0) {
      add('geometry', 'Trianguliacija IFC ↔ PDF', 'warn',
        `${crossWarn.slice(0, 3).join('; ')}. Modelio ir brėžinio kiekiai skiriasi >10 % – patikrinkite, ar abu šaltiniai apima tą pačią apimtį.`);
    } else if (crossOk.length > 0) {
      add('geometry', 'Trianguliacija IFC ↔ PDF', 'ok',
        `IFC modelio ir PDF matavimų kiekiai sutampa (±10 %): ${crossOk.slice(0, 3).join('; ')}.`);
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
    add('geometry', 'Pasikartojančios projekto pozicijos', 'warn',
      `${dupNames.length} pozicijos įtrauktos daugiau nei vieną kartą: ${dupNames.slice(0, 3).map(([n, c]) => `„${n.split('|')[0]}“ ×${c}`).join('; ')}. Jei tai skirtingi brėžinių lapai – ignoruokite, jei tas pats žiniaraštis – palikite vieną.`);
  }

  return checks;
}
