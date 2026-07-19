import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, FolderOpen, LogOut, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { LOGIN_PATH } from '@/const';

/** Vartotojo portalas: debesyje išsaugoti projektai */
export default function Portal() {
  const { user, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: LOGIN_PATH });
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery(undefined, { enabled: !!user });
  const remove = trpc.projects.remove.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const [confirmId, setConfirmId] = useState<number | null>(null);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Kraunama…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">Mano projektai</h1>
            <p className="text-xs text-muted-foreground">{user.name ?? user.email ?? 'Vartotojas'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/app"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Naujas projektas
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" /> Atsijungti
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {projects.isLoading && <p className="text-sm text-muted-foreground">Kraunami projektai…</p>}
        {projects.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Nepavyko užkrauti projektų: {projects.error.message}
          </p>
        )}
        {projects.data && projects.data.length === 0 && (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="mb-2 text-sm font-medium">Dar neturite išsaugotų projektų</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Atidarykite programą, atlikite matavimus ir spauskite „Įrašyti į paskyrą“ – projektas atsiras čia.
            </p>
            <Link to="/app" className="text-sm font-semibold text-primary hover:underline">
              Atidaryti QTO programą →
            </Link>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.data?.map((p) => (
            <div key={p.id} className="rounded-xl border p-4 transition-shadow hover:shadow-sm">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-tight">{p.name}</h2>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {p.itemCount} poz.
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Atnaujinta {new Date(p.updatedAt).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/app?project=${p.id}`)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Atidaryti
                </button>
                {confirmId === p.id ? (
                  <>
                    <button
                      onClick={() => { remove.mutate({ id: p.id }); setConfirmId(null); }}
                      className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
                    >
                      Patvirtinti šalinimą
                    </button>
                    <button onClick={() => setConfirmId(null)} className="rounded-lg border px-3 py-1.5 text-xs">
                      Atšaukti
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(p.id)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Šalinti
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
