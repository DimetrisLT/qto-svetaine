// Savikontrolės patikrinimai: geometrija, logika, pilnumas
import { CATEGORY_INFO, type CheckResult, type QtoItem, type SourceMeta } from '@/types/qto';
import { fmt } from '@/lib/format';

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
          `Nesukalibruoti failai: ${uncal.map((f) => `„${f.name}“`).join(', ')}. Kiekvienam failui sukalibruokite mastelį dviejų žinomų taškų atstumu.`);
      } else if (files.length > 0) {
        add('completeness', 'PDF mastelio kalibravimas', 'ok', 'Visiems PDF failams mastelis sukalibruotas.');
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

  return checks;
}
