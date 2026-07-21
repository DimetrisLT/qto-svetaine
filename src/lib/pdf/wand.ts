// „Vandens burtas“ (One-Click Area) ir linijos sekimas iš PDF vektorių –
// adaptuota pagal Kreo / Groundplan „wand“ įrankius.
// Algoritmas: plokščiasis segmentų grafas + srities sekimas (left-face tracing) + kelio sekimas.
import type { Pt } from '@/lib/pdf/measure';
import type { Segments } from '@/lib/pdf/vectorSnap';

interface Graph {
  xs: Float64Array;
  ys: Float64Array;
  adj: number[][];
  edgeA: Int32Array;
  edgeB: Int32Array;
  deleted: Uint8Array;
}

const QT = 1.6; // galų sujungimo paklaida (pt) – užsiima mikro tarpus CAD brėžiniuose
const CELL = 8;

/** Išfiltruoja brūkšninius (konstrukcinių/ašių) segmentus – „wand“ jų nemato */
export function solidOnly(segs: Segments): Segments {
  if (!segs.dashed) return segs;
  const keep: number[] = [];
  for (let s = 0; s < segs.count; s++) if (!segs.dashed[s]) keep.push(s);
  if (keep.length === segs.count) return { data: segs.data, count: segs.count };
  const out = new Float32Array(keep.length * 4);
  keep.forEach((s, i) => {
    out[i * 4] = segs.data[s * 4]; out[i * 4 + 1] = segs.data[s * 4 + 1];
    out[i * 4 + 2] = segs.data[s * 4 + 2]; out[i * 4 + 3] = segs.data[s * 4 + 3];
  });
  return { data: out, count: keep.length };
}

/** Padalija segmentus T- ir X-sankirtų taškuose (CAD brėžiniams būtina) */
function splitSegments(segs: Segments): number[] {
  const d = segs.data;
  const n = segs.count;
  const splits: number[][] = Array.from({ length: n }, () => []);
  const grid = new Map<string, number[]>();
  const gk = (v: number) => Math.floor(v / 16);
  for (let s = 0; s < n; s++) {
    const x0 = d[s * 4], y0 = d[s * 4 + 1], x1 = d[s * 4 + 2], y1 = d[s * 4 + 3];
    for (let gx = gk(Math.min(x0, x1) - 2); gx <= gk(Math.max(x0, x1) + 2); gx++)
      for (let gy = gk(Math.min(y0, y1) - 2); gy <= gk(Math.max(y0, y1) + 2); gy++) {
        const k = `${gx},${gy}`;
        const arr = grid.get(k); if (arr) arr.push(s); else grid.set(k, [s]);
      }
  }
  const addSplit = (s: number, t: number) => { if (t > 0.004 && t < 0.996) splits[s].push(t); };
  const seen = new Set<string>();
  for (const [k, arr] of grid) {
    const parts = k.split(',').map(Number);
    const uniq = [...new Set(arr)];
    for (const s of uniq) {
      const x0 = d[s * 4], y0 = d[s * 4 + 1], x1 = d[s * 4 + 2], y1 = d[s * 4 + 3];
      const dx = x1 - x0, dy = y1 - y0;
      const len2 = dx * dx + dy * dy || 1;
      // T-sankirtos: kitų segmentų galai ant šio segmento
      for (const o of uniq) {
        if (o === s) continue;
        for (const end of [0, 2] as const) {
          const ex = d[o * 4 + end], ey = d[o * 4 + end + 1];
          const t = ((ex - x0) * dx + (ey - y0) * dy) / len2;
          if (t <= 0 || t >= 1) continue;
          const qx = x0 + t * dx, qy = y0 + t * dy;
          if ((qx - ex) ** 2 + (qy - ey) ** 2 <= QT * QT) addSplit(s, t);
        }
        // X-sankirtos
        const pairKey = s < o ? `${s}:${o}` : `${o}:${s}`;
        if (!seen.has(pairKey)) {
          seen.add(pairKey);
          const x2 = d[o * 4], y2 = d[o * 4 + 1], x3 = d[o * 4 + 2], y3 = d[o * 4 + 3];
          const rx = x3 - x2, ry = y3 - y2;
          const den = dx * ry - dy * rx;
          if (Math.abs(den) > 1e-9) {
            const t = ((x2 - x0) * ry - (y2 - y0) * rx) / den;
            const u = ((x2 - x0) * dy - (y2 - y0) * dx) / den;
            if (t > 0 && t < 1 && u > 0 && u < 1) { addSplit(s, t); addSplit(o, u); }
          }
        }
      }
    }
    void parts;
  }
  const out: number[] = [];
  for (let s = 0; s < n; s++) {
    const x0 = d[s * 4], y0 = d[s * 4 + 1], x1 = d[s * 4 + 2], y1 = d[s * 4 + 3];
    const ts = [0, ...[...new Set(splits[s])].sort((a, b) => a - b), 1];
    for (let i = 0; i < ts.length - 1; i++) {
      out.push(x0 + (x1 - x0) * ts[i], y0 + (y1 - y0) * ts[i], x0 + (x1 - x0) * ts[i + 1], y0 + (y1 - y0) * ts[i + 1]);
    }
  }
  return out;
}

/** Iš segmentų sukonstruoja plokščiąjį grafą; galai sujungiami, kai nutolę < QT.
 *  `peel` – ar nulupti atviras šakas (reikalinga srities sekimui, bet ne linijos sekimui). */
export function buildGraph(segs: Segments, peel = true): Graph {
  const flat = splitSegments(segs);
  segs = { data: new Float32Array(flat), count: flat.length / 4 };
  const xs: number[] = [];
  const ys: number[] = [];
  const adj: number[][] = [];
  const cells = new Map<string, number[]>();
  const cellKeys = (x: number, y: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    const out: string[] = [];
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) out.push(`${gx},${gy}`);
    return out;
  };
  const node = (x: number, y: number): number => {
    let best = -1; let bestD = QT * QT;
    for (const k of cellKeys(x, y)) {
      for (const i of cells.get(k) ?? []) {
        const d2 = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
        if (d2 < bestD) { bestD = d2; best = i; }
      }
    }
    if (best !== -1) return best;
    const i = xs.length;
    xs.push(x); ys.push(y); adj.push([]);
    const ck = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    const arr = cells.get(ck);
    if (arr) arr.push(i); else cells.set(ck, [i]);
    return i;
  };

  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const d = segs.data;
  for (let s = 0; s < segs.count; s++) {
    const a = node(d[s * 4], d[s * 4 + 1]);
    const b = node(d[s * 4 + 2], d[s * 4 + 3]);
    if (a === b) continue;
    // praleidžiame dublikatus (ta pati kraštinė tarp tų pačių mazgų)
    const e = edgeA.length;
    edgeA.push(a); edgeB.push(b);
    adj[a].push(e); adj[b].push(e);
  }
  const g: Graph = {
    xs: Float64Array.from(xs), ys: Float64Array.from(ys), adj,
    edgeA: Int32Array.from(edgeA), edgeB: Int32Array.from(edgeB),
    deleted: new Uint8Array(edgeA.length),
  };
  if (peel) peelSpurs(g);
  return g;
}

/**
 * „Aštrų“ (atvirų šakų) nulupimas: kartojamai šalinami laipsnio-1 mazgai.
 * Tokios grandinės (durų lankai, matmenų brūkšneliai, ašių uodegos) NIEKADA
 * neįeina į uždaros srities kontūrą, bet sugadintų srities sekimą (aklavietė).
 */
function peelSpurs(g: Graph): void {
  const deg = new Int32Array(g.adj.length);
  for (let n = 0; n < g.adj.length; n++) deg[n] = g.adj[n].length;
  const queue: number[] = [];
  for (let n = 0; n < deg.length; n++) if (deg[n] === 1) queue.push(n);
  while (queue.length) {
    const n = queue.pop()!;
    if (deg[n] !== 1) continue;
    const e = g.adj[n].find((x) => !g.deleted[x]);
    if (e === undefined) { deg[n] = 0; continue; }
    g.deleted[e] = 1;
    deg[n] = 0;
    const o = other(g, e, n);
    deg[o]--;
    if (deg[o] === 1) queue.push(o);
  }
}

function other(g: Graph, e: number, n: number): number {
  return g.edgeA[e] === n ? g.edgeB[e] : g.edgeA[e];
}

const norm2pi = (a: number) => { while (a < 0) a += 2 * Math.PI; while (a >= 2 * Math.PI) a -= 2 * Math.PI; return a; };
/** kampas y-up sistemoje (apverčiame y, kad gautume standartinę orientaciją) */
const angUp = (dx: number, dy: number) => Math.atan2(-dy, dx);

/** Srities sekimas: sritis visada kairėje kelio pusėje (y-up) – DCEL „next face“ taisyklė */
function traceFace(g: Graph, startNode: number, startEdge: number, p: Pt): Pt[] | null {
  const path: number[] = [startNode];
  const seen = new Set<number>([startNode]);
  let node = startNode;
  let edge = startEdge;
  const maxSteps = Math.min(6000, g.edgeA.length * 2 + 10);
  for (let step = 0; step < maxSteps; step++) {
    const next = other(g, edge, node);
    // Pasikartojęs mazgas (ne uždarymas) → kelias susikerta – kontūras negalioja
    if (seen.has(next) && next !== startNode) return null;
    path.push(next);
    seen.add(next);
    if (next === startNode && path.length > 2) break;
    const inAng = angUp(g.xs[next] - g.xs[node], g.ys[next] - g.ys[node]);
    const back = norm2pi(inAng + Math.PI);
    let bestE = -1; let bestDelta = Infinity;
    for (const cand of g.adj[next]) {
      if (cand === edge || g.deleted[cand]) continue;
      const o = other(g, cand, next);
      const outAng = angUp(g.xs[o] - g.xs[next], g.ys[o] - g.ys[next]);
      const delta = norm2pi(back - outAng); // artimiausia kraštinė pagal laikrodžio rodyklę nuo „atgal“
      if (delta < bestDelta) { bestDelta = delta; bestE = cand; }
    }
    if (bestE === -1) return null;
    node = next;
    edge = bestE;
  }
  if (path.length < 3 || path[path.length - 1] !== startNode) return null;
  const pts: Pt[] = path.slice(0, -1).map((n) => ({ x: g.xs[n], y: g.ys[n] }));
  return pointInPoly(p, pts) ? simplify(pts) : null;
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function simplify(pts: Pt[], tol = 0.4): Pt[] {
  if (pts.length <= 3) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = out.length ? out[out.length - 1] : pts[pts.length - 1];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    if (Math.abs(cross) / len > tol || out.length === 0) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}


/**
 * One-Click Area: spustelėjus patalpos viduje grąžina aptiktą kontūrą.
 * Sėkla: vertikalus spindulys žemyn nuo p iki artimiausios kraštinės; sritis (su p) – kairėje.
 */
export function wandArea(rawSegs: Segments, p: Pt): Pt[] | null {
  const segs = solidOnly(rawSegs);
  const d = segs.data;
  let bestE = -1; let bestY = Infinity;
  for (let s = 0; s < segs.count; s++) {
    const x0 = d[s * 4], y0 = d[s * 4 + 1], x1 = d[s * 4 + 2], y1 = d[s * 4 + 3];
    if (p.x < Math.min(x0, x1) - QT || p.x > Math.max(x0, x1) + QT) continue;
    const dx = x1 - x0, dy = y1 - y0;
    if (dx === 0) {
      if (Math.abs(p.x - x0) <= QT && y0 > p.y && y0 < bestY) { bestY = y0; bestE = s; }
      continue;
    }
    const t = (p.x - x0) / dx;
    if (t < 0 || t > 1) continue;
    const y = y0 + t * dy;
    if (y > p.y && y < bestY) { bestY = y; bestE = s; }
  }
  if (bestE === -1) return null;

  const g = buildGraph(segs);
  // Sėklinė grafo kraštinė – artimiausia pataikos taškui (p.x, bestY)
  let seedEdge = -1; let bestD = Infinity;
  for (let e = 0; e < g.edgeA.length; e++) {
    const a = g.edgeA[e], b = g.edgeB[e];
    const x0 = g.xs[a], y0 = g.ys[a], x1 = g.xs[b], y1 = g.ys[b];
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p.x - x0) * dx + (bestY - y0) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + t * dx, qy = y0 + t * dy;
    const d2 = (qx - p.x) ** 2 + (qy - bestY) ** 2;
    if (d2 < bestD) { bestD = d2; seedEdge = e; }
  }
  if (seedEdge === -1 || bestD > 25 || g.deleted[seedEdge]) return null;
  const na = g.edgeA[seedEdge], nb = g.edgeB[seedEdge];

  // Kryptis: einame iš na į nb; jei p NĖRA kairėje (y-up), startuojame iš nb.
  // Jei sekimas įstringa (pvz., durų angos kišenėje), bandome ir priešingą kryptį –
  // galutinį teisingumą vis tiek garantuoja pointInPoly patikra.
  const dirAng = angUp(g.xs[nb] - g.xs[na], g.ys[nb] - g.ys[na]);
  const relAng = angUp(p.x - g.xs[na], p.y - g.ys[na]) - dirAng;
  const onLeft = Math.sin(relAng) > 0;
  const seedNode = onLeft ? na : nb;
  const altNode = onLeft ? nb : na;
  return traceFace(g, seedNode, seedEdge, p) ?? traceFace(g, altNode, seedEdge, p);
}

/** One-Click Line: spustelėjus ant linijos grąžina ištęstą kelią abiem kryptimis */
export function traceLine(rawSegs: Segments, p: Pt): Pt[] | null {
  const segs = solidOnly(rawSegs);
  const g = buildGraph(segs, false); // linijoms šakų nulupti negalima – izoliuotos linijos dingtų
  let bestE = -1; let bestD = Infinity;
  for (let e = 0; e < g.edgeA.length; e++) {
    const a = g.edgeA[e], b = g.edgeB[e];
    const x0 = g.xs[a], y0 = g.ys[a], x1 = g.xs[b], y1 = g.ys[b];
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((p.x - x0) * dx + (p.y - y0) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = x0 + t * dx, qy = y0 + t * dy;
    const d2 = (qx - p.x) ** 2 + (qy - p.y) ** 2;
    if (d2 < bestD) { bestD = d2; bestE = e; }
  }
  if (bestE === -1 || bestD > 40 * 40) return null;

  // Einame iš sėklinės kraštinės abiem kryptimis, rinkdamiesi tiesiausią tęsinį;
  // sustojame ties aklaviete arba sankirtoje (nukrypimas > 1.65 rad).
  const walk = (startNode: number, startEdge: number): number[] => {
    const path = [startNode];
    let node = startNode, edge = startEdge;
    const used = new Set<number>([startEdge]);
    for (let step = 0; step < 4000; step++) {
      const next = other(g, edge, node);
      path.push(next);
      const inAng = angUp(g.xs[next] - g.xs[node], g.ys[next] - g.ys[node]);
      let bestNext = -1; let bestDev = Infinity;
      for (const cand of g.adj[next]) {
        if (cand === edge || g.deleted[cand] || used.has(cand)) continue;
        const o = other(g, cand, next);
        const outAng = angUp(g.xs[o] - g.xs[next], g.ys[o] - g.ys[next]);
        let dev = norm2pi(outAng - inAng);
        if (dev > Math.PI) dev = 2 * Math.PI - dev; // nukrypimas nuo tiesio kelio [0..π]
        if (dev < bestDev) { bestDev = dev; bestNext = cand; }
      }
      if (bestNext === -1 || bestDev > 1.65) break;
      used.add(bestNext);
      node = next; edge = bestNext;
    }
    return path;
  };

  const a = g.edgeA[bestE], b = g.edgeB[bestE];
  const fwd = walk(a, bestE); // [a, b, ...]
  const bwd = walk(b, bestE); // [b, a, ...]
  const chain = [...bwd.slice(1).reverse(), ...fwd.slice(1)];
  const pts: Pt[] = chain.map((n) => ({ x: g.xs[n], y: g.ys[n] }));
  if (pts.length < 2) return null;
  // Kolinearinių taškų supaprastinimas (atvira linija – galai visada išlieka)
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const pa = out[out.length - 1], pb = pts[i], pc = pts[i + 1];
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    const len = Math.hypot(pc.x - pa.x, pc.y - pa.y) || 1;
    if (Math.abs(cross) / len > 0.4) out.push(pb);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
