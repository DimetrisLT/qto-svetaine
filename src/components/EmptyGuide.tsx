import { Upload, Ruler, FileSpreadsheet } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

const ICONS = [Upload, Ruler, FileSpreadsheet];

/** Tuščios būsenos gid: 3 žingsniai iki rezultato */
export default function EmptyGuide() {
  const { t } = useI18n();
  return (
    <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
      {t.guide.steps.map((s, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <div key={s.title} className="flex items-start gap-3 rounded-xl border bg-card/60 p-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                <span className="font-dim mr-1.5 text-xs text-muted-foreground">{i + 1}</span>
                {s.title}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
