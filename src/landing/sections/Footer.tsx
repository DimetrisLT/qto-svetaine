import { motion } from 'framer-motion';
import { ArrowRight, Lock, Crosshair } from 'lucide-react';
import { Link } from 'react-router';

const TECH = ['React 19', 'TypeScript', 'web-ifc', 'three.js', 'pdf.js', 'Tesseract.js', 'SheetJS', 'Tailwind'];

export default function Footer() {
  return (
    <footer className="relative">
      {/* Privatumas */}
      <section className="blueprint-grid relative border-t border-border/60 py-24">
        <div className="blueprint-fade absolute inset-0" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-400/10"
          >
            <Lock className="h-6 w-6 text-emerald-300" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Jūsų brėžiniai <span className="text-emerald-300">niekur neiškeliauja.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-4 max-w-xl text-muted-foreground"
          >
            IFC analizė, PDF matavimai, OCR, skaičiavimai — viskas atliekama jūsų naršyklėje.
            Jokio serverio, jokios registracijos, jokių failų siuntimų.
          </motion.p>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="relative overflow-hidden border-t border-border/60 py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-500/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-4xl font-extrabold tracking-tight sm:text-5xl"
          >
            Pradėkite skaičiuoti <span className="glow-cyan text-sky-300">šiandien.</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mx-auto mt-4 max-w-lg text-muted-foreground"
          >
            Statinė programa — įkelkite į Hostinger per 3 min. arba naudokite iškart.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to="/app"
              className="group inline-flex items-center gap-2 rounded-xl bg-sky-500 px-8 py-4 text-base font-bold text-slate-950 shadow-[0_0_44px_-8px] shadow-sky-500/80 transition-all hover:bg-sky-400"
            >
              Atidaryti QTO programą
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Apatinė juosta */}
      <div className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-sky-400" />
            <span className="text-sm font-semibold">QTO — Statybos kiekių surinkimas</span>
          </div>
          <div className="font-dim flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {TECH.map((t) => <span key={t}>{t}</span>)}
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <Link to="/privatumas" className="transition-colors hover:text-sky-300">Privatumo politika</Link>
            <Link to="/salygos" className="transition-colors hover:text-sky-300">Naudojimo sąlygos</Link>
            <Link to="/portal" className="transition-colors hover:text-sky-300">Portalas</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
