// Testas: OCR (tesseract.js) + toks pats parseris kaip programoje
import { createWorker } from 'tesseract.js';
import fs from 'fs';

// --- Parserio kopija iš src/lib/ocr/scanSchedule.ts ---
const UNIT_RE = /\b(VNTS?\.?|VNT\.?|M3|M\?|M³|MI|M2|M²|KG|T\.?)\b/i;
const NUM_RE = /(\d+[.,]\d+|\d+)/g;

function cleanLine(line) {
  return line.replace(/[|~«»_\-–—]{2,}/g, ' ').replace(/[|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
function cleanName(name) {
  return name.replace(/@/g, 'Ø').replace(/\s{2,}/g, ' ').replace(/^[\s.,;:]+|[\s.,;:]+$/g, '').trim();
}
function isSkippable(line) {
  const u = line.toUpperCase();
  if (/(POZ\.|PAVADINIMAS|CHARAKTERISTIK|MATO\s|ARMAVIMAS|PASTAB|ŽINIARAŠT|ZINIARAST|EKSPLIKAC)/.test(u)) return true;
  if (/^VISO/.test(u)) return true;
  return false;
}
function parseScheduleText(text) {
  const rows = [];
  const lines = text.split('\n').map(cleanLine).filter((l) => l.length > 3);
  for (const line of lines) {
    if (isSkippable(line)) continue;
    const unitMatch = line.match(UNIT_RE);
    if (!unitMatch || unitMatch.index === undefined) continue;
    const namePart = cleanName(line.slice(0, unitMatch.index));
    const after = line.slice(unitMatch.index + unitMatch[0].length);
    if (namePart.length < 3) continue;
    const nums = [];
    let m; NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(after)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(v)) nums.push(v);
    }
    if (nums.length === 0) continue;
    rows.push({ unit: unitMatch[1], name: namePart, qty: nums[0], nums, raw: line });
  }
  return rows;
}

// --- OCR tos pačios srities (216 dpi, kaip programoje) ---
const worker = await createWorker('eng');
const { data } = await worker.recognize('/tmp/qto-test/sk8_zin_216.png');
await worker.terminate();
console.log('=== OCR TEKSTAS ===');
console.log(data.text);
console.log('=== EILUTĖS ===');
for (const r of parseScheduleText(data.text)) {
  console.log(JSON.stringify(r));
}
