import { useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface Check {
  label: string;
  status: 'ok' | 'warn';
  details: string;
}

const CHECKS: Check[] = [
  { label: 'PDF mastelio sutapimas', status: 'ok', details: 'Kalibracija sutampa su brėžinyje nurodytu masteliu (±2 %).' },
  { label: 'Skaičiavimo sutikrinimas su žiniaraščiu', status: 'ok', details: 'Vnt. kiekiai sutampa: pamatų elementai 36 vnt.' },
  { label: 'IFC tūrių kryžminis patikrinimas', status: 'ok', details: 'Deklaruoti tūriai sutampa su geometriniais (±20 %).' },
  { label: 'Plotų persidengimas (dvigubas skaičiavimas?)', status: 'warn', details: '2 poros plotų persidengia >10 % — patikrinkite, ar neskačiuojate dukart.' },
  { label: 'Kiekiai dubliuojasi tarp projekto dalių', status: 'warn', details: 'Sienos: A 84,2 m ≈ SK 83,9 m — palikite tik vieną šaltinį.' },
  { label: 'Medžiagų žymos', status: 'ok', details: 'Betonas C25/30, XC2 nurodytas visoms pozicijoms.' },
];

export default function SelfCheckDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-120px' });
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setDone(i);
      if (i >= CHECKS.length) clearInterval(t);
    }, 550);
    return () => clearInterval(t);
  }, [inView]);

  const warns = CHECKS.filter((c) => c.status === 'warn').length;

  return (
    <section id="savikontrole" className="mx-auto max-w-7xl px-6 py-24">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-dim text-xs uppercase tracking-[0.25em] text-sky-400">/ 03 — savikontrolė</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Programa tikrina save.{' '}
            <span className="text-muted-foreground">Kol nepataisėte jūs.</span>
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
            Brangiausios sąmatų klaidos — praleistos arba dukart suskaičiuotos pozicijos.
            QTO automatiškai tikrina plotų persidengimus, kiekių dubliavimą tarp projekto dalių,
            vnt. sutapimą su projekto žiniaraščiu, mastelio nukrypimus ir IFC tūrių logiką.
          </p>
          <div className="font-dim mt-6 inline-flex items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-sm">
            <span className="text-emerald-300">✅ {CHECKS.length - warns} tvarkoj</span>
            <span className="text-border">|</span>
            <span className="text-amber-300">⚠️ {warns} dėmesio</span>
          </div>
        </motion.div>

        <div ref={ref} className="relative">
          <div className="absolute -inset-3 rounded-3xl bg-amber-400/5 blur-xl" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card/90 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <span className="text-sm font-semibold">Savikontrolės rezultatai</span>
              <span className="font-dim text-xs text-muted-foreground">
                {done < CHECKS.length ? 'tikrinama…' : `${CHECKS.length} patikrinimai`}
              </span>
            </div>
            <ul className="divide-y divide-border/50">
              {CHECKS.map((c, i) => (
                <motion.li
                  key={c.label}
                  initial={{ opacity: 0, x: -14 }}
                  animate={i < done ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4 }}
                  className="flex items-start gap-3 px-5 py-3.5"
                >
                  {i < done ? (
                    c.status === 'ok' ? (
                      <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-400" />
                    )
                  ) : (
                    <Loader2 className="mt-0.5 h-4.5 w-4.5 shrink-0 animate-spin text-muted-foreground/40" />
                  )}
                  <div className={i < done ? '' : 'opacity-35'}>
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{c.details}</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
