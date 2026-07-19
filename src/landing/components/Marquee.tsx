const ITEMS = [
  'IFC 3D analizė', 'PDF brėžiniai', 'DXF sluoksniai', 'OCR žiniaraščiai',
  'Auto mastelis', 'Vektorinis snapping', 'Dvigubo skaičiavimo kontrolė',
  'Kiekių kilmės žymos', 'Excel eksportas', 'Savikontrolė', '100 % naršyklėje',
];

export default function Marquee() {
  const row = [...ITEMS, ...ITEMS];
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
