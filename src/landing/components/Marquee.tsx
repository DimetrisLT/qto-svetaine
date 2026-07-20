import { useI18n } from '@/i18n/I18nContext';

export default function Marquee() {
  const { t } = useI18n();
  const row = [...t.marquee, ...t.marquee];
  return (
    <div className="marquee-mask overflow-hidden border-y border-border bg-card/40 py-3.5">
      <div className="animate-marquee flex w-max items-center gap-8">
        {row.map((item, i) => (
          <span key={i} className="font-dim flex items-center gap-8 whitespace-nowrap text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {item}
            <span className="text-sky-400">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
