import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Cloud, Crosshair, ShieldCheck, Smartphone, ArrowLeft } from 'lucide-react';

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

const PERKS = [
  { icon: Cloud, text: 'Projektai saugomi debesyje – tęskite darbą iš bet kurio įrenginio' },
  { icon: Smartphone, text: 'Aukšttyje matuokite telefonu, sąmatas ruoškite kompiuteriu' },
  { icon: ShieldCheck, text: 'Brėžiniai lieka jūsų naršyklėje – į debesį keliauja tik kiekiai' },
];

export default function Login() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logotipas */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Crosshair className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Prisijunkite prie QTO</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Statybos kiekių surinkimas iš IFC, PDF ir DXF
          </p>
        </div>

        {/* Privalumai */}
        <div className="mb-6 space-y-3 rounded-2xl border bg-card p-5">
          {PERKS.map((p) => (
            <div key={p.text} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <p.icon className="h-4 w-4" />
              </div>
              <p className="pt-1 text-sm leading-snug">{p.text}</p>
            </div>
          ))}
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            window.location.href = getOAuthUrl();
          }}
        >
          Prisijungti su Kimi
        </Button>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link to="/" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> Į svetainę
          </Link>
          <Link to="/app" className="font-medium text-primary hover:underline">
            Tęsti be prisijungimo
          </Link>
        </div>
      </div>
    </div>
  );
}
