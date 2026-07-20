import { Crosshair, Printer, X } from 'lucide-react';
import SummaryCards from '@/components/SummaryCards';
import ZiniarastisTable from '@/components/ZiniarastisTable';
import SelfCheckPanel from '@/components/SelfCheckPanel';
import CarbonCard from '@/components/CarbonCard';
import { runSelfChecks } from '@/lib/selfCheck';
import { summarizeCarbon } from '@/lib/carbon';
import { fmt } from '@/lib/format';
import type { QtoItem, SourceMeta } from '@/types/qto';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  items: QtoItem[];
  metas: SourceMeta[];
  projectName?: string | null;
  onClose: () => void;
}

/** Spausdinimui optimizuota kiekių ataskaita – naršyklių „Save as PDF“ */
export default function PrintReport({ items, metas, projectName, onClose }: Props) {
  const { t, locale } = useI18n();
  const checks = runSelfChecks(items, metas);
  const warns = checks.filter((c) => c.status === 'warn').length;
  const verified = items.filter((i) => i.verified).length;
  const carbon = summarizeCarbon(items);
  const now = new Date();

  return (
    <div className="print-report-root fixed inset-0 z-50 overflow-auto bg-background print:static print:overflow-visible">
      {/* Valdikliai – nespausdinami */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> {t.report.printBtn}
        </button>
        <p className="text-xs text-muted-foreground">
          {t.report.printHint}
        </p>
        <button onClick={onClose} className="ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <X className="h-4 w-4" /> {t.report.closeBtn}
        </button>
      </div>

      {/* Ataskaitos turinys */}
      <div className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
        <header className="mb-6 border-b-2 border-foreground pb-4">
          {/* Prekės ženklo juosta – spausdinama su spalvomis */}
          <div className="mb-3 flex items-center gap-2.5" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
              <Crosshair className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">QTO</p>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{t.report.printTitle}</p>
            </div>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{projectName || t.report.printSubtitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.report.printMetaA} {now.toLocaleString(locale === 'lt' ? 'lt-LT' : 'en-US', { dateStyle: 'long', timeStyle: 'short' })} ·{' '}
            {items.length} {t.report.printMetaB} {verified}/{items.length} · {warns > 0 ? `${warns} ${t.report.printWarnIn}` : t.report.scNoWarn}
          </p>
        </header>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">{t.report.catSummary}</h2>
          <SummaryCards items={items} />
        </section>

        {/* Anglies pėdsakas – tik kai bent vienai pozicijai pavyko priskirti koeficientą */}
        {carbon.ratedCount > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-lg font-semibold">{t.report.carbonTitle}</h2>
            <CarbonCard items={items} />
          </section>
        )}

        <section className="mb-6 print:break-inside-auto">
          <h2 className="mb-1 text-lg font-semibold">{t.report.zinTitle}</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            {t.report.zinNote}
          </p>
          <ZiniarastisTable items={items} />
        </section>

        {/* Antraštė – pačiame SelfCheckPanel komponente */}
        <section className="mb-6">
          <SelfCheckPanel checks={checks} />
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">{t.report.sources}</h2>
          <ul className="space-y-1 text-sm">
            {metas.filter((m) => m.parsed).map((m, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-dashed pb-1">
                <span>{m.fileName} <span className="text-muted-foreground">({m.source})</span></span>
                <span className="text-muted-foreground">
                  {m.totalElements !== undefined ? `${m.totalElements} ${t.report.elementsN}` : ''}
                  {m.pdfFiles ? `${m.pdfFiles.length} ${t.report.filesN}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-8 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            {t.report.disclaimer}
            {projectName ? ` · ${fmt(items.length, 0)} pozicijos` : ''}.
          </p>
        </footer>
      </div>
    </div>
  );
}
