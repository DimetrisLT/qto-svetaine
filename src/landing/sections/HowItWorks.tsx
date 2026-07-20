import { motion } from 'framer-motion';
import { Upload, Ruler, Crosshair, FileSpreadsheet } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

const ICONS = [Upload, Ruler, Crosshair, FileSpreadsheet];


export default function HowItWorks() {
  const { t } = useI18n();
  const STEPS = t.how.steps.map((s, i) => ({ ...s, icon: ICONS[i % ICONS.length] }));
  return (
    <section id="kaip-veikia" className="relative mx-auto max-w-7xl px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
      >
        <p className="font-dim text-xs uppercase tracking-[0.25em] text-sky-400">{t.how.kicker}</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t.how.title}</h2>
      </motion.div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.num}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="spotlight-card group relative rounded-2xl border border-border bg-card/70 p-6 backdrop-blur transition-colors hover:border-sky-400/40"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 text-sky-300 transition-transform duration-300 group-hover:scale-110">
                <s.icon className="h-5 w-5" />
              </div>
              <span className="font-dim text-4xl font-bold text-sky-400/15 transition-colors group-hover:text-sky-400/30">{s.num}</span>
            </div>
            <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            <span className="font-dim mt-4 inline-block rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
              {s.tag}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
