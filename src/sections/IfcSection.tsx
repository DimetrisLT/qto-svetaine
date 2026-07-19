import { useState } from 'react';
import FileDrop from '@/components/FileDrop';
import IfcViewer from '@/components/IfcViewer';
import { parseIfcFile, type IfcParseResult } from '@/lib/ifc/parseIfc';
import type { QtoItem, SourceMeta } from '@/types/qto';

interface Props {
  fileName?: string;
  onData: (items: QtoItem[], meta: SourceMeta) => void;
}

export default function IfcSection({ fileName, onData }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState<IfcParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(fileName);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setProgress(0);
    setName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const res = await parseIfcFile(buf, (p, l) => { setProgress(p); setProgressLabel(l); });
      setResult(res);
      onData(res.items, {
        source: 'IFC',
        fileName: file.name,
        parsed: true,
        totalElements: res.stats.totalElements,
        withoutQuantities: res.stats.withoutQuantities,
        withoutQuantitiesClasses: res.stats.withoutQuantitiesClasses,
        unitFactor: res.stats.unitFactor,
        unitLabel: res.stats.unitLabel,
        spaceArea_m2: res.stats.spaceArea_m2,
      });
    } catch (e) {
      console.error(e);
      setError('Nepavyko perskaityti IFC failo. Patikrinkite, ar tai galiojantis IFC (STEP) failas, ir bandykite dar kartą.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!result && !loading && (
        <FileDrop
          accept=".ifc,.ifczip"
          label="Įkelkite IFC modelį"
          hint="Kiekiai (ilgis, plotas, tūris), medžiagos ir 3D geometrija išgaunami automatiškai iš IFC klasių (IfcWall, IfcSlab, IfcColumn, IfcBeam…)."
          fileName={name}
          onFile={handleFile}
        />
      )}

      {loading && (
        <div className="rounded-xl border p-6 space-y-3">
          <p className="text-sm font-medium">{progressLabel || 'Analizuojama…'}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Dideliems modeliams tai gali užtrukti iki kelių minučių.</p>
        </div>
      )}

      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Elementų modelyje" value={String(result.stats.totalElements)} />
            <Stat label="Su Qto savybėmis" value={`${result.stats.withQuantities}`} />
            <Stat label="Be Qto (iš geometrijos)" value={`${result.stats.withoutQuantities}`} warn={result.stats.withoutQuantities > 0} />
            <Stat label="Vienetai" value={result.stats.unitLabel} />
          </div>
          {result.geometries.length > 0
            ? <IfcViewer geometries={result.geometries} items={result.items} />
            : <p className="rounded-lg border p-4 text-sm text-muted-foreground">Modelyje nerasta 3D geometrijos šioms klasėms – rodomos tik lentelės.</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setResult(null); setName(undefined); onData([], { source: 'IFC', parsed: false }); }}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Įkelti kitą IFC
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? 'border-amber-400' : ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
