import { motion } from 'framer-motion';
import { FileSpreadsheet, Download } from 'lucide-react';

const ROWS = [
  { group: '02 PAMATAI', isGroup: true },
  { code: '02.1', name: 'Pamatų elementai, Betonas C25/30', unit: 'vnt.', qty: '36', origin: 'proj.', src: 'PDF/SK' },
  { code: '02.2', name: 'Pamatų elementai, Betonas C25/30', unit: 'm³', qty: '5,58', origin: 'proj.', src: 'PDF/SK' },
  { group: '03 SIENŲ KONSTRUKCIJOS', isGroup: true },
  { code: '03.1', name: 'Sienos, mūrinės, h = 3,0 m', unit: 'm²', qty: '84,20', origin: 'AI', src: 'PDF/A' },
  { code: '03.2', name: 'Sienos (g/w), t = 300 mm', unit: 'm³', qty: '17,40', origin: 'proj.', src: 'IFC' },
  { group: '05 STOGAS', isGroup: true },
  { code: '05.1', name: 'Stogo danga, profiliuota skarda', unit: 'm²', qty: '96,40', origin: 'AI', src: 'PDF/A' },
];

export default function Ziniarastis() {
  return (
    <section id="ziniarastis" className="relative border-t border-border/60 bg-card/20 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-dim text-xs uppercase tracking-[0.25em] text-sky-400">/ 04 — rezultatas</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Vienas žiniaraštis.{' '}
              <span className="text-muted-foreground">Aiški kiekvieno kiekio kilmė.</span>
            </h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">
              Kiekiai iš visų šaltinių sugrupuojami pagal darbų grupes su pozicijų numeriais.
              Kas aiškiai pažymėta: <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-xs font-semibold text-sky-300">proj.</span>{' '}
              — nuskaityta iš projektinių žiniaraščių ar IFC,{' '}
              <span className="rounded bg-slate-400/15 px-1.5 py-0.5 text-xs font-semibold text-slate-300">AI</span>{' '}
              — apskaičiuota iš matavimų ar geometrijos.
            </p>
            <div className="mt-7 flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_28px_-6px] shadow-emerald-500/50">
                <FileSpreadsheet className="h-4 w-4" /> Atsisiųsti Excel (XLSX)
              </div>
              <span className="font-dim text-xs text-muted-foreground">4 lapai: Žiniaraštis · Santrauka · Detaliai · Savikontrolė</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative"
          >
            <div className="absolute -inset-3 rounded-3xl bg-sky-500/8 blur-xl" />
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card/90 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <span className="text-sm font-semibold">Darbų kiekių žiniaraštis</span>
                <Download className="h-4 w-4 text-muted-foreground" />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-dim border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Eil. nr.</th>
                    <th className="py-2.5 font-medium">Darbo pobūdis / pozicija</th>
                    <th className="py-2.5 font-medium">Vnt.</th>
                    <th className="py-2.5 text-right font-medium">Kiekis</th>
                    <th className="px-5 py-2.5 text-right font-medium">Šaltiniai</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) =>
                    'isGroup' in r && r.isGroup ? (
                      <tr key={i} className="border-b border-border/40 bg-secondary/40">
                        <td colSpan={5} className="font-dim px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
                          {r.group}
                        </td>
                      </tr>
                    ) : (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + i * 0.08 }}
                        className="border-b border-border/30 transition-colors hover:bg-sky-400/5"
                      >
                        <td className="font-dim px-5 py-2.5 text-xs text-muted-foreground">{r.code}</td>
                        <td className="py-2.5 text-xs sm:text-sm">
                          {r.name}{' '}
                          <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            r.origin === 'proj.' ? 'bg-sky-400/15 text-sky-300' : 'bg-slate-400/15 text-slate-300'
                          }`}>
                            {r.origin}
                          </span>
                        </td>
                        <td className="font-dim py-2.5 text-xs text-muted-foreground">{r.unit}</td>
                        <td className="font-dim py-2.5 text-right font-semibold text-foreground">{r.qty}</td>
                        <td className="font-dim px-5 py-2.5 text-right text-[11px] text-muted-foreground">{r.src}</td>
                      </motion.tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
