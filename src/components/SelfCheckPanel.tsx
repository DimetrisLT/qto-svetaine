import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CheckResult } from '@/types/qto';
import { useI18n } from '@/i18n/I18nContext';

export default function SelfCheckPanel({ checks }: { checks: CheckResult[] }) {
  const { t } = useI18n();
  const GROUP_LABEL: Record<CheckResult['group'], string> = {
    geometry: t.report.scGeom,
    logic: t.report.scLogic,
    completeness: t.report.scFull,
  };
  const groups: CheckResult['group'][] = ['completeness', 'geometry', 'logic'];
  const warns = checks.filter((c) => c.status === 'warn').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{t.report.scTitle}</h3>
        <span className={
          warns === 0
            ? 'rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            : 'rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        }>
          {warns === 0 ? t.report.scOk : `${warns} ${t.report.warnN}`}
        </span>
      </div>
      {groups.map((g) => {
        const list = checks.filter((c) => c.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className="mb-1.5 text-sm font-medium text-muted-foreground">{GROUP_LABEL[g]}</p>
            <ul className="space-y-1.5">
              {list.map((c) => (
                <li key={c.id} className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                  {c.status === 'ok'
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                  <div>
                    <span className="font-medium">{c.label}</span>
                    <span className="text-muted-foreground"> — {c.details}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
