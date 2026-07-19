import { useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Boxes, FileStack, ScanText, Ruler, Magnet, ShieldCheck, Layers, FileSpreadsheet,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Boxes, span: 'md:col-span-2',
    title: 'IFC modelis → kiekiai + 3D',
    text: 'Pilnai automatinė analizė: ilgiai, plotai, tūriai iš geometrijos, medžiagos, spalvota 3D vizualizacija ir kryžminis deklaruotų bei geometrinių tūrių sutikrinimas (±20 %).',
    badge: 'pilnai automatinis',
  },
  {
    icon: FileStack, span: '',
    title: 'Multi-PDF projektas',
    text: 'A, SK, VK, E dalys — kaip viena visuma. Kiekvienam failui savas mastelis, visi matavimai sueina į bendrą žiniaraštį.',
    badge: 'A · SK · VK · E',
  },
  {
    icon: ScanText, span: '',
    title: 'OCR žiniaraščiai',
    text: 'Pažymite lentelę brėžinyje — pozicijos (pavadinimas, vnt., kiekis, m³/vnt., betono klasė) nuskaitomos ir pažymimos „projekto duomenys“.',
    badge: 'proj. žyma',
  },
  {
    icon: Ruler, span: '',
    title: 'Auto mastelis',
    text: 'Mastelio žymų ir lapo formatų (A3…) atpažinimas, kalibracijos nukrypimo >2 % įspėjimas.',
    badge: '±2 %',
  },
  {
    icon: Magnet, span: '',
    title: 'Vektorinis snapping',
    text: 'Prisirišimas prie linijų galų, vidurių ir kraštinių — tikslūs matavimai be priartinimo.',
    badge: 'galai · viduriai',
  },
  {
    icon: ShieldCheck, span: 'md:col-span-2',
    title: 'Savikontrolė prieš dvigubą skaičiavimą',
    text: 'Plotų persidengimai >10 %, sutampantys ilgiai tarp A ir SK dalių (±5 %), vnt. neatitiktys tarp plano ir OCR žiniaraščio, IFC tūrių kryžminis tikrinimas. Brangiausios klaidos pagaudžiamos automatiškai.',
    badge: '✅ / ⚠️',
  },
  {
    icon: Layers, span: '',
    title: 'DXF sluoksniai',
    text: 'Sluoksnių ilgiai, uždarų kontūrų plotai, blokų kiekis — priskirti kategorijoms.',
    badge: 'mm · cm · m',
  },
  {
    icon: FileSpreadsheet, span: '',
    title: 'Excel eksportas',
    text: 'Žiniaraštis, santrauka, detaliai su „Kilmė“ stulpeliu, savikontrolė — 4 lapai XLSX.',
    badge: 'sąmatai paruošta',
  },
];

export default function Features() {
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - r.top}px`);
  }, []);

  return (
    <section id="funkcijos" className="relative border-t border-border/60 bg-card/20 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-dim text-xs uppercase tracking-[0.25em] text-sky-400">/ 02 — funkcijos</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Viskas, ko reikia kiekių skaičiavimui. Nieko nereikalingo.
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: (i % 3) * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              onMouseMove={onMouseMove}
              className={`spotlight-card group rounded-2xl border border-border bg-card/80 p-6 backdrop-blur transition-all hover:-translate-y-1 hover:border-sky-400/40 ${f.span}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sky-300">
                  <f.icon className="h-5 w-5" />
                </div>
                <span className="font-dim rounded border border-border bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {f.badge}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
