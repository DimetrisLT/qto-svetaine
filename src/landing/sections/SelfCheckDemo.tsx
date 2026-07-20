import { useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';



export default function SelfCheckDemo() {
  const { t } = useI18n();
  const CHECKS = t.sc.checks;
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
          <p className="font-dim text-xs uppercase tracking-[0.25em] text-sky-400">{t.sc.kicker}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {t.sc.titleA}{' '}
            <span className="text-muted-foreground">{t.sc.titleB}</span>
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">{t.sc.text}</p>
          <div className="font-dim mt-6 inline-flex items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-sm">
            <span className="text-emerald-300">✅ {CHECKS.length - warns} {t.sc.ok}</span>
            <span className="text-border">|</span>
            <span className="text-amber-300">⚠️ {warns} {t.sc.warn}</span>
          </div>
        </motion.div>

        <div ref={ref} className="relative">
          <div className="absolute -inset-3 rounded-3xl bg-amber-400/5 blur-xl" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card/90 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
              <span className="text-sm font-semibold">{t.sc.panelTitle}</span>
              <span className="font-dim text-xs text-muted-foreground">
                {done < CHECKS.length ? t.sc.checking : `${CHECKS.length} ${t.sc.checksN}`}
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
