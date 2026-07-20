import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { motion, useReducedMotion } from 'framer-motion';

interface Pt { x: number; y: number }

// Geometrija „matavimo vienetais“ (1 vnt = 10 mm) – namas 10,5 × 6,6 m
const WALL = 26; // sienos „storis“ ekrane
const OUT: Pt[] = [
  { x: 80, y: 80 }, { x: 1130, y: 80 }, { x: 1130, y: 740 }, { x: 80, y: 740 },
];
const INNER_V: Pt[] = [{ x: 640, y: 80 }, { x: 640, y: 500 }];
const INNER_H: Pt[] = [{ x: 640, y: 500 }, { x: 1130, y: 500 }];

// Langai (išorinėse sienose) – gintaro spalvos žymos
const WINDOWS: Array<[Pt, Pt]> = [
  [{ x: 240, y: 80 }, { x: 480, y: 80 }],
  [{ x: 760, y: 80 }, { x: 1000, y: 80 }],
  [{ x: 300, y: 740 }, { x: 540, y: 740 }],
  [{ x: 1130, y: 200 }, { x: 1130, y: 420 }],
];

// Poliai perimetru (36 vnt. – kaip realiame projekte)
const PILES: Pt[] = (() => {
  const pts: Pt[] = [];
  const stepX = (1130 - 80) / 9;
  for (let i = 0; i <= 9; i++) {
    pts.push({ x: 80 + i * stepX, y: 80 });
    pts.push({ x: 80 + i * stepX, y: 740 });
  }
  const stepY = (740 - 80) / 7;
  for (let i = 1; i < 7; i++) {
    pts.push({ x: 80, y: 80 + i * stepY });
    pts.push({ x: 1130, y: 80 + i * stepY });
  }
  for (let i = 1; i < 4; i++) pts.push({ x: 640, y: 80 + i * ((500 - 80) / 4) });
  return pts.slice(0, 36);
})();

const SNAP_POINTS: Pt[] = [
  ...OUT,
  { x: 640, y: 80 }, { x: 640, y: 500 }, { x: 1130, y: 500 },
  ...WINDOWS.flat(),
];

const path = (pts: Pt[], close = false) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + (close ? ' Z' : '');

/** Interaktyvus brėžinys: nusipiešia pats, kursorius prisiriša prie kampų,
 *  o nejudinant pelės – kartojasi automatinė matavimo demonstracija */
export default function BlueprintPlan() {
  const { t } = useI18n();
  const ref = useRef<SVGSVGElement>(null);
  const [snap, setSnap] = useState<Pt | null>(null);
  const reduced = useReducedMotion();

  // Demonstracijos ciklas: 10 s animacija + 1,5 s pauzė
  const DEMO = 10;
  const T = {
    cursor: [0, 0.1, 0.18, 0.44, 0.86, 0.95],   // atsiranda → pas A → juda → pas B → laikosi → nyksta
    line: [0, 0.18, 0.44, 0.86, 0.95],          // brėžiama kartu su kursoriumi
    label: [0, 0.46, 0.54, 0.86, 0.95],         // matmuo po antro paspaudimo
    chip: [0, 0.54, 0.62, 0.86, 0.95],          // žiniaraščio eilutė
  };
  const loop = { duration: DEMO, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' as const };

  const snapR = 60;
  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 1210;
    const py = ((e.clientY - rect.top) / rect.height) * 820;
    let best: Pt | null = null;
    let bestD = snapR;
    for (const p of SNAP_POINTS) {
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestD) { bestD = d; best = p; }
    }
    setSnap(best);
  };

  const draw = {
    hidden: { pathLength: 0, opacity: 0 },
    show: (d: number) => ({
      pathLength: 1,
      opacity: 1,
      transition: { duration: 1.6, delay: d, ease: 'easeInOut' as const },
    }),
  };

  const dimText = useMemo(() => '10 500', []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1210 820"
      className="h-auto w-full cursor-crosshair select-none"
      onMouseMove={onMove}
      onMouseLeave={() => setSnap(null)}
    >
      {/* Ašys */}
      {[80, 640, 1130].map((x, i) => (
        <g key={`ax${i}`} opacity={0.35}>
          <line x1={x} y1={30} x2={x} y2={790} stroke="#38bdf8" strokeWidth={1} strokeDasharray="14 6 2 6" />
          <circle cx={x} cy={30} r={16} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
          <text x={x} y={35} textAnchor="middle" fontSize={14} fill="#38bdf8" className="font-dim">{i + 1}</text>
        </g>
      ))}
      {[80, 500, 740].map((y, i) => (
        <g key={`ay${i}`} opacity={0.35}>
          <line x1={30} y1={y} x2={1180} y2={y} stroke="#38bdf8" strokeWidth={1} strokeDasharray="14 6 2 6" />
          <circle cx={30} cy={y} r={16} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
          <text x={30} y={y + 5} textAnchor="middle" fontSize={14} fill="#38bdf8" className="font-dim">{String.fromCharCode(65 + i)}</text>
        </g>
      ))}

      {/* Išorinės sienos – nusipiešia */}
      <motion.path
        d={path(OUT, true)}
        fill="none" stroke="#7dd3fc" strokeWidth={WALL} strokeOpacity={0.9}
        variants={draw} initial="hidden" animate="show" custom={0.2}
      />
      {/* Vidaus sienos */}
      <motion.path d={path(INNER_V)} fill="none" stroke="#7dd3fc" strokeWidth={WALL - 8} strokeOpacity={0.85}
        variants={draw} initial="hidden" animate="show" custom={0.9} />
      <motion.path d={path(INNER_H)} fill="none" stroke="#7dd3fc" strokeWidth={WALL - 8} strokeOpacity={0.85}
        variants={draw} initial="hidden" animate="show" custom={1.2} />

      {/* Poliai ant sienų – atsiranda palaipsniui (36 vnt., kaip realiame projekte) */}
      {PILES.map((p, i) => (
        <motion.circle
          key={`pile${i}`}
          cx={p.x} cy={p.y} r={11}
          fill="#0a1628" stroke="#fbbf24" strokeWidth={3}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.8 + i * 0.045, type: 'spring', stiffness: 300, damping: 15 }}
          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
        />
      ))}

      {/* Langai */}
      {WINDOWS.map(([a, b], i) => (
        <motion.line key={`w${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#fbbf24" strokeWidth={6}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 + i * 0.15 }} />
      ))}

      {/* Durų lankas */}
      <motion.path
        d="M 640 500 A 90 90 0 0 1 730 500"
        fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4"
        initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={{ delay: 2.4 }}
      />

      {/* Patalpų žymos */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }}>
        <text x={360} y={400} textAnchor="middle" fontSize={26} fill="#e2e8f0" letterSpacing={2}>GYVENAMASIS</text>
        <text x={360} y={432} textAnchor="middle" fontSize={18} fill="#7dd3fc" className="font-dim">31,4 m²</text>
        <text x={885} y={330} textAnchor="middle" fontSize={22} fill="#e2e8f0" letterSpacing={2}>MIEMASIS</text>
        <text x={885} y={360} textAnchor="middle" fontSize={16} fill="#7dd3fc" className="font-dim">14,2 m²</text>
        <text x={885} y={640} textAnchor="middle" fontSize={20} fill="#e2e8f0" letterSpacing={2}>VONIA</text>
        <text x={885} y={668} textAnchor="middle" fontSize={15} fill="#7dd3fc" className="font-dim">6,1 m²</text>
      </motion.g>

      {/* Matmenų linija apačioje */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.9 }}>
        <line x1={80} y1={790} x2={1130} y2={790} stroke="#fbbf24" strokeWidth={1.5} className="animate-dash" />
        {[80, 640, 1130].map((x) => (
          <line key={`dt${x}`} x1={x} y1={780} x2={x} y2={800} stroke="#fbbf24" strokeWidth={2} />
        ))}
        <text x={605} y={812} textAnchor="middle" fontSize={17} fill="#fbbf24" className="font-dim">{dimText}</text>
      </motion.g>

      {/* Automatinė demonstracija (kai vartotojas nežaidžia su planu) */}
      {!snap && !reduced && (
        <g pointerEvents="none">
          {/* Matmenų linija žemiau sienos (kaip tikrame brėžinyje): 4,90 m */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 1, 0] }}
            transition={{ ...loop, times: T.line }}
          >
            <motion.line
              x1={640} y1={544} x2={1130} y2={544}
              stroke="#fbbf24" strokeWidth={2.5}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: [0, 0, 1, 1, 1] }}
              transition={{ ...loop, times: [0, 0.18, 0.44, 0.86, 1] }}
            />
            <line x1={640} y1={532} x2={640} y2={556} stroke="#fbbf24" strokeWidth={2.5} />
            <line x1={1130} y1={532} x2={1130} y2={556} stroke="#fbbf24" strokeWidth={2.5} />
          </motion.g>
          {/* Matmuo */}
          <motion.text
            x={885} y={528} textAnchor="middle" fontSize={19} fill="#fbbf24" className="font-dim" fontWeight={600}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1, 1, 0] }}
            transition={{ ...loop, times: T.label }}
          >
            {t.hero.demoDim}
          </motion.text>
          {/* Žiniaraščio eilutės čipsas */}
          <motion.g
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: [0, 0, 1, 1, 0], y: [-10, -10, 0, 0, -10] }}
            transition={{ ...loop, times: T.chip }}
          >
            <rect x={812} y={104} width={368} height={46} rx={10} fill="#0a1628" stroke="#34d399" strokeWidth={1.5} />
            <text x={830} y={133} fontSize={17} fill="#34d399" className="font-dim">{t.hero.demoChip}</text>
          </motion.g>
          {/* Paspaudimo pulsai ties abiem taškais */}
          <motion.circle cx={640} cy={500} fill="none" stroke="#22d3ee" strokeWidth={3}
            initial={{ r: 10, opacity: 0 }}
            animate={{ r: [10, 10, 30, 30], opacity: [0, 0.9, 0, 0] }}
            transition={{ ...loop, times: [0, 0.16, 0.24, 1] }}
          />
          <motion.circle cx={1130} cy={500} fill="none" stroke="#22d3ee" strokeWidth={3}
            initial={{ r: 10, opacity: 0 }}
            animate={{ r: [10, 10, 30, 30], opacity: [0, 0, 0.9, 0, 0] }}
            transition={{ ...loop, times: [0, 0.42, 0.46, 0.54, 1] }}
          />
          {/* „Šmėkliškas“ kursorius */}
          <motion.g
            initial={{ x: 0, opacity: 0 }}
            animate={{ x: [0, 0, 490, 490, 490], opacity: [0, 1, 1, 1, 0] }}
            transition={{ ...loop, times: T.cursor }}
          >
            <circle cx={640} cy={500} r={13} fill="none" stroke="#22d3ee" strokeWidth={2.5} />
            <line x1={640 - 24} y1={500} x2={640 + 24} y2={500} stroke="#22d3ee" strokeWidth={2} />
            <line x1={640} y1={500 - 24} x2={640} y2={500 + 24} stroke="#22d3ee" strokeWidth={2} />
          </motion.g>
        </g>
      )}

      {/* Snap kryželis */}
      {snap && (
        <g>
          <circle cx={snap.x} cy={snap.y} r={14} fill="none" stroke="#22d3ee" strokeWidth={2.5} />
          <circle cx={snap.x} cy={snap.y} r={14} fill="none" stroke="#22d3ee" strokeWidth={2} className="animate-ping-soft" style={{ transformOrigin: `${snap.x}px ${snap.y}px` }} />
          <line x1={snap.x - 26} y1={snap.y} x2={snap.x + 26} y2={snap.y} stroke="#22d3ee" strokeWidth={2} />
          <line x1={snap.x} y1={snap.y - 26} x2={snap.x} y2={snap.y + 26} stroke="#22d3ee" strokeWidth={2} />
          <text x={snap.x + 20} y={snap.y - 18} fontSize={15} fill="#22d3ee" className="font-dim">
            {((snap.x - 80) / 100).toFixed(2)} ; {((snap.y - 80) / 100).toFixed(2)} m
          </text>
        </g>
      )}
    </svg>
  );
}
