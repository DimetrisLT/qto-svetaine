import { Printer, X } from 'lucide-react';
import SummaryCards from '@/components/SummaryCards';
import ZiniarastisTable from '@/components/ZiniarastisTable';
import SelfCheckPanel from '@/components/SelfCheckPanel';
import CarbonCard from '@/components/CarbonCard';
import { runSelfChecks } from '@/lib/selfCheck';
import { fmt } from '@/lib/format';
import type { QtoItem, SourceMeta } from '@/types/qto';

interface Props {
  items: QtoItem[];
  metas: SourceMeta[];
  projectName?: string | null;
  onClose: () => void;
}

/** Spausdinimui optimizuota kiekių ataskaita – naršyklių „Save as PDF“ */
export default function PrintReport({ items, metas, projectName, onClose }: Props) {
  const checks = runSelfChecks(items, metas);
  const warns = checks.filter((c) => c.status === 'warn').length;
  const verified = items.filter((i) => i.verified).length;
  const now = new Date();

  return (
    <div className="print-report-root fixed inset-0 z-50 overflow-auto bg-background print:static print:overflow-visible">
      {/* Valdikliai – nespausdinami */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Spausdinti / įrašyti PDF
        </button>
        <p className="text-xs text-muted-foreground">
          Atsidariusiame lange pasirinkite „Save as PDF“ / „Įrašyti kaip PDF“.
        </p>
        <button onClick={onClose} className="ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <X className="h-4 w-4" /> Uždaryti
        </button>
      </div>

      {/* Ataskaitos turinys */}
      <div className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
        <header className="mb-6 border-b-2 border-foreground pb-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">QTO · Kiekių apskaičiavimo ataskaita</p>
          <h1 className="mt-1 text-2xl font-bold">{projectName || 'Statybinio projekto kiekiai'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suformuota {now.toLocaleString('lt-LT', { dateStyle: 'long', timeStyle: 'short' })} ·{' '}
            {items.length} pozicijos · patikrinta {verified}/{items.length} · {warns > 0 ? `${warns} įspėjimai savikontrolėje` : 'savikontrolė be įspėjimų'}
          </p>
        </header>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Suvestinė pagal kategorijas</h2>
          <SummaryCards items={items} />
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Anglies pėdsakas (orientacinis)</h2>
          <CarbonCard items={items} />
        </section>

        <section className="mb-6 print:break-inside-auto">
          <h2 className="mb-1 text-lg font-semibold">Darbų kiekių žiniaraštis</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Pozicijos sugrupuotos pagal darbų grupes – pagrindas detaliosioms sąmatoms.
          </p>
          <ZiniarastisTable items={items} />
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Savikontrolės rezultatai</h2>
          <SelfCheckPanel checks={checks} />
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Šaltiniai</h2>
          <ul className="space-y-1 text-sm">
            {metas.filter((m) => m.parsed).map((m, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-dashed pb-1">
                <span>{m.fileName} <span className="text-muted-foreground">({m.source})</span></span>
                <span className="text-muted-foreground">
                  {m.totalElements !== undefined ? `${m.totalElements} elementų` : ''}
                  {m.pdfFiles ? `${m.pdfFiles.length} failai` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-8 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            Kiekiai yra orientaciniai, apskaičiuoti pagal pateiktus projektinius duomenis (IFC modelius, PDF/DXF brėžinius).
            Prieš naudojimą sąmatose ir užsakymuose juos turi patikrinti sąmatininkas. Sugeneruota su QTO programa
            {projectName ? ` · ${fmt(items.length, 0)} pozicijos` : ''}.
          </p>
        </footer>
      </div>
    </div>
  );
}
