import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router';
import { ArrowRight, FileText, Boxes, ScanText, Crosshair, Menu, X } from 'lucide-react';
import BlueprintPlan from '@/landing/components/BlueprintPlan';

const STATS = [
  { value: '36', unit: 'vnt.', label: 'polių aptikta žiniaraštyje' },
  { value: '5,58', unit: 'm³', label: 'betono C25/30 sutikrinta' },
  { value: '<2', unit: '%', label: 'mastelio nukrypimo kontrolė' },
  { value: '3', unit: 'formatai', label: 'IFC · PDF · DXF' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (d: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.7, delay: d, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const NAV_LINKS = [
  { href: '#kaip-veikia', label: 'Kaip veikia' },
  { href: '#funkcijos', label: 'Funkcijos' },
  { href: '#savikontrole', label: 'Savikontrolė' },
  { href: '#ziniarastis', label: 'Žiniaraštis' },
];

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="blueprint-grid blueprint-fade relative">
      {/* Navigacija */}
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-400/50 bg-sky-400/10">
            <Crosshair className="h-5 w-5 text-sky-400" />
          </div>
          <span className="text-lg font-bold tracking-tight">QTO</span>
          <span className="font-dim hidden text-xs text-muted-foreground sm:inline">v2 · kiekių surinkimas</span>
        </div>
        <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-sky-300">{l.label}</a>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/portal"
            className="hidden whitespace-nowrap rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:border-sky-400/50 hover:text-sky-300 sm:block"
          >
            Portalas
          </Link>
          <Link
            to="/app"
            className="whitespace-nowrap rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_24px_-4px] shadow-sky-500/60 transition-all hover:bg-sky-400 hover:shadow-sky-400/60 sm:px-4 sm:text-sm"
          >
            Atidaryti programą
          </Link>
          {/* Mobilioji navigacija */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Meniu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-sky-400/50 hover:text-sky-300 md:hidden"
          >
            {menuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
        </div>
      </nav>
      {menuOpen && (
        <div className="relative z-20 mx-4 mb-2 rounded-xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur md:hidden">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sky-400/10 hover:text-sky-300"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/portal"
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sky-400/10 hover:text-sky-300 sm:hidden"
          >
            Portalas
          </Link>
        </div>
      )}

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-6 pb-16 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-16">
        {/* Kairė: tekstas */}
        <div>
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
            className="font-dim mb-5 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/5 px-3 py-1 text-xs text-sky-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
            </span>
            Veikia 100 % naršyklėje — failai niekur nesiunčiami
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="show" custom={0.1}
            className="text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
            Iš brėžinio —{' '}
            <span className="glow-cyan whitespace-nowrap bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
              į sąmatą
            </span>
            <br />
            per minutes.
          </motion.h1>

          <motion.p variants={fadeUp} initial="hidden" animate="show" custom={0.22}
            className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            QTO automatiškai surenka statybos kiekius iš <b className="text-foreground">IFC</b>,{' '}
            <b className="text-foreground">PDF</b> ir <b className="text-foreground">DXF</b> failų,
            nuskaito projektinius žiniaraščius (OCR), tikrina save ir suformuoja bendrą darbų kiekių
            žiniaraštį — paruoštą detaliosioms sąmatoms.
          </motion.p>

          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0.34}
            className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/app"
              className="group inline-flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-[0_0_36px_-6px] shadow-sky-500/70 transition-all hover:bg-sky-400 hover:shadow-sky-400/70">
              Pradėti skaičiuoti
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a href="#kaip-veikia"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/60 px-6 py-3.5 text-sm font-semibold backdrop-blur transition-colors hover:border-sky-400/50 hover:text-sky-300">
              Kaip tai veikia
            </a>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0.46}
            className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5 text-sky-400" /> IFC 3D analizė</span>
            <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-sky-400" /> Multi-PDF projektai</span>
            <span className="flex items-center gap-1.5"><ScanText className="h-3.5 w-3.5 text-sky-400" /> OCR žiniaraščiai</span>
          </motion.div>
        </div>

        {/* Dešinė: interaktyvus brėžinys */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="absolute -inset-4 rounded-3xl bg-sky-500/10 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-sky-400/25 bg-slate-950/70 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <span className="font-dim text-[11px] text-muted-foreground">A-101 · aukštų planas · M1:100</span>
              <span className="font-dim rounded border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300">✓ mastelis</span>
            </div>
            <BlueprintPlan />
            <div className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
              Demonstracija kartojasi pati — arba užveskite pelę: kursorius <span className="text-cyan-300">prisiriša prie kampų</span>, kaip programoje
            </div>
          </div>
        </motion.div>
      </div>

      {/* Statistika */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 pb-14">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border/60 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="bg-card/90 p-5 backdrop-blur"
            >
              <div className="font-dim text-3xl font-bold text-sky-300">
                {s.value} <span className="text-base font-medium text-amber-300">{s.unit}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </header>
  );
}
