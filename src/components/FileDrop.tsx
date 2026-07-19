import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileCheck2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  accept: string;
  label: string;
  hint?: string;
  fileName?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}

export default function FileDrop({ accept, label, hint, fileName, disabled, onFile }: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) handle(e.dataTransfer.files); }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
        over ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/60',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      {fileName ? (
        <>
          <FileCheck2 className="h-10 w-10 text-emerald-500" />
          <p className="font-medium">{fileName}</p>
          <p className="text-xs text-muted-foreground">Spauskite, kad pasirinktumėte kitą failą</p>
        </>
      ) : (
        <>
          <UploadCloud className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">{label}</p>
          {hint && <p className="text-xs text-muted-foreground max-w-md">{hint}</p>}
        </>
      )}
    </div>
  );
}
