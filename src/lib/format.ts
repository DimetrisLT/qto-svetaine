// Skaičių formatavimas (lietuviškas dešimtainis skirtukas)

export function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('lt-LT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function fmtDim(n: number | undefined): string {
  return fmt(n, 3);
}

/** Suapvalina iki protingo skaitmens skaičiaus */
export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
