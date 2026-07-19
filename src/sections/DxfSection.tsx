import { useState } from 'react';
import FileDrop from '@/components/FileDrop';
import DxfViewer from '@/components/DxfViewer';
import { parseDxfText, type DxfParseResult } from '@/lib/dxf/parseDxf';
import type { QtoItem, SourceMeta } from '@/types/qto';

interface Props {
  fileName?: string;
  items: QtoItem[];
  onData: (items: QtoItem[], meta: SourceMeta) => void;
}

export default function DxfSection({ fileName, items, onData }: Props) {
  const [result, setResult] = useState<DxfParseResult | null>(null);
  const [name, setName] = useState(fileName);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (f: File) => {
    setLoading(true);
    setError(null);
    setName(f.name);
    try {
      const text = await f.text();
      if (text.startsWith('AutoCAD Binary DXF') || /[\x00-\x08]/.test(text.slice(0, 200))) {
        throw new Error('binary');
      }
      const res = parseDxfText(text);
      setResult(res);
      onData([], {
        source: 'DXF', fileName: f.name, parsed: true,
        unassignedLayers: res.layers.filter((l) => l.lengthUnits > 0 || l.insertCount > 0).map((l) => l.name),
      });
    } catch (e) {
      console.error(e);
      setError(
        'Nepavyko perskaityti failo. Palaikomas tekstinis (ASCII) DXF. Jei turite DWG – konvertuokite nemokamu „ODA File Converter“ arba „LibreCAD“ (DWG → DXF).',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!result && !loading && (
        <>
          <FileDrop
            accept=".dxf"
            label="Įkelkite DXF brėžinį"
            hint="Programa perskaito sluoksnius, suskaičiuoja linijų ilgius, uždarų kontūrų plotus ir blokų kiekius. DWG failą konvertuokite į DXF (ODA File Converter / LibreCAD)."
            fileName={name}
            onFile={handleFile}
          />
          {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>}
        </>
      )}
      {loading && <p className="rounded-xl border p-6 text-sm">Analizuojamas DXF…</p>}
      {result && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{name}</span>
            <button
              onClick={() => { setResult(null); setName(undefined); onData([], { source: 'DXF', parsed: false }); }}
              className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted"
            >
              Kitas failas
            </button>
          </div>
          <DxfViewer
            data={result}
            items={items}
            onChange={(next, m) => onData(next, {
              source: 'DXF', fileName: name, parsed: true,
              unassignedLayers: m.unassignedLayers, dxfUnitFactor: m.dxfUnitFactor,
            })}
          />
        </>
      )}
    </div>
  );
}
