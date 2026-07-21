import { parseScheduleText } from '../src/lib/ocr/scanSchedule.ts';

const cases = [
  // [input, expectName, expectUnit, expectQty]
  ["1.1. Esamų grindų dangos ardymas; m² 132,00", "grindų dangos ardymas", "m²", 132],
  ["2.1. Sienų mūrijimas m 45,00", "Sienų mūrijimas", "m", 45],
  ["3.1. Pertvaros 132,00 m²", "Pertvaros", "m²", 132],           // qty prieš vienetą
  ["1.2. Betono C25/30 pylimas m3 1 320,00", "Betono C25/30 pylimas", "m³", 1320],
  ["4. Armatura kg 2500", "Armatura", "kg", 2500],
  ["5. Langai 1600x1400 vnt. 8", "Langai 1600x1400", "vnt.", 8],
  ["6.1.1. Pamatai KOMPL 3", "Pamatai", "vnt.", 3],
  ["7. Grindų betonavimas; m²; 87,50", "Grindų betonavimas", "m²", 87.5],
  ["VISO: 9999", null],                                          // praleidžiama
  ["Pavadinimas Mato vnt Kiekis", null],                         // antraštė
  ["PIRMO AUKŠTO PLANAS 1", null],                               // lapo antraštė
  ["RŪSIO PLANAS m 1", null],                                    // lapo antraštė su vienetu
  ["Patalpos Nr. Patalpa Plotas m2 5", null],                    // eksplikacijos antraštė
  ["Remontuojamo pastato 0,000 = 140,5 m", null],                // aukščio žymuo
  ["ATLIKAMI DARBAI: 1. Remontuojamo pastato dalis m 140,5", null],
  ["PROJEKTUOJAMI FASADAI 1-13, 13-1 m 1", null],
  ["4,97 m 3", null],                                            // pavadinimas – grynasis skaičius
  ["Rūsio sienų mūrijimas m3 45,0", "Rūsio sienų mūrijimas", "m³", 45], // rūsio DARBAS – ne antraštė
];

let pass = 0, fail = 0;
for (const [line, name, unit, qty] of cases) {
  const rows = parseScheduleText(line);
  if (name === null) {
    if (rows.length === 0) { pass++; console.log(`OK  skip: ${line}`); }
    else { fail++; console.log(`FAIL should-skip: ${line} -> got ${JSON.stringify(rows[0].name)}`); }
    continue;
  }
  const r = rows[0];
  if (!r) { fail++; console.log(`FAIL no-row: ${line}`); continue; }
  const okName = r.name.toLowerCase().includes(name.toLowerCase());
  const okUnit = r.unit === unit;
  const okQty = Math.abs(r.qty - qty) < 0.001;
  if (okName && okUnit && okQty) { pass++; console.log(`OK  ${line} -> "${r.name}" | ${r.unit} | ${r.qty}`); }
  else { fail++; console.log(`FAIL ${line} -> "${r.name}"(${okName}) | ${r.unit}(${okUnit}) | ${r.qty}(${okQty})`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
