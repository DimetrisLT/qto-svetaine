import { Upload, Ruler, FileSpreadsheet } from 'lucide-react';

const STEPS = [
  { icon: Upload, title: 'Įkelkite', text: 'IFC, PDF arba DXF – failai lieka jūsų naršyklėje' },
  { icon: Ruler, title: 'Matuokite', text: 'Mastelis aptinkamas automatiškai, kursorius prisiriša' },
  { icon: FileSpreadsheet, title: 'Atsisiųskite', text: 'Žiniaraštis Excel, PDF ataskaita, savikontrolė' },
];

/** Tuščios būsenos gid: 3 žingsniai iki rezultato */
export default function EmptyGuide() {
  return (
    <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
      {STEPS.map((s, i) => (
        <div key={s.title} className="flex items-start gap-3 rounded-xl border bg-card/60 p-3.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <s.icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              <span className="font-dim mr-1.5 text-xs text-muted-foreground">{i + 1}</span>
              {s.title}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
