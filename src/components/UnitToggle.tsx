import { Ruler } from 'lucide-react';
import { getUnitSystem, setUnitSystem, useUnitSystem } from '@/lib/units';
import { useI18n } from '@/i18n/I18nContext';

/** m / ft perjungiklis (metrinė ↔ imperinė) */
export default function UnitToggle() {
  const units = useUnitSystem();
  const { t } = useI18n();
  const next = units === 'metric' ? 'imperial' : 'metric';
  return (
    <button
      onClick={() => setUnitSystem(next)}
      title={`${t.app.unitsTitle}: ${units === 'metric' ? t.units.metric : t.units.imperial}`}
      className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <Ruler className="h-3.5 w-3.5" />
      {units === 'metric' ? 'm' : 'ft'}
    </button>
  );
}

export { getUnitSystem };
