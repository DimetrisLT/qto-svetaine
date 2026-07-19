import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed">
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Į pradžią
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Privatumo politika</h1>
      <p className="mb-4 text-muted-foreground">Atnaujinta: 2026 m. liepos 19 d.</p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">1. Duomenų valdytojas</h2>
      <p>QTO įrankio valdytojas – projekto savininkas (toliau – „mes“). Kontaktai nurodomi svetainėje.</p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">2. Kokius duomenis renkame</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Paskyros duomenys</strong> – prisijungus per Kimi OAuth: vardas, el. pašto adresas, profilio identifikatorius (union ID). Slaptažodžių mes nesaugome ir nematome.</li>
        <li><strong>Projektų turinys</strong> – jūsų savanoriškai išsaugotų projektų duomenys (kiekių pozicijos, kalibracijos, failų pavadinimai). Jie saugomi mūsų duomenų bazėje tik tada, kai spaudžiate „Įrašyti į paskyrą“.</li>
        <li><strong>Techniniai duomenys</strong> – serverio žurnalai (IP adresas, užklausų laikas) saugumo ir trikčių šalinimo tikslais.</li>
      </ul>

      <h2 className="mb-2 mt-6 text-lg font-semibold">3. Jūsų failai</h2>
      <p>
        IFC, PDF ir DXF brėžinių failai <strong>visada apdorojami jūsų naršyklėje</strong> ir niekada nėra siunčiami į mūsų serverį.
        Į serverį patenka tik kiekių pozicijos (tekstiniai duomenys), kai jas sąmoningai išsaugote paskyroje.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">4. Teisiniai pagrindai ir tikslai</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Sutarties vykdymas – paskyros ir projektų saugojimo paslauga (BDAR 6 str. 1 d. b p.).</li>
        <li>Teisėtas interesas – sistemos saugumas, trikčių diagnostika (BDAR 6 str. 1 d. f p.).</li>
      </ul>

      <h2 className="mb-2 mt-6 text-lg font-semibold">5. Saugojimo terminai</h2>
      <p>
        Paskyros ir projektų duomenys saugomi, kol turite paskyrą. Ištrynus paskyrą (portale – „Ištrinti paskyrą“)
        visi duomenys ir projektai ištrinami nedelsiant ir neatkuriama, o iš atsarginių kopijų – per 14 dienų.
        Serverio žurnalai saugomi iki 30 dienų.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">6. Jūsų teisės</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Susipažinti su savo duomenimis (portalas rodo visus išsaugotus projektus).</li>
        <li>Eksportuoti duomenis (projekto JSON atsisiuntimas programoje).</li>
        <li>Ištrinti duomenis (projektų šalinimas arba visos paskyros ištrynimas portale).</li>
        <li>Pateikti skundą Valstybinei duomenų apsaugos inspekcijai.</li>
      </ul>

      <h2 className="mb-2 mt-6 text-lg font-semibold">7. Slapukai</h2>
      <p>
        Naudojame vieną techniškai būtiną slapuką (<code>kimi_sid</code>) – prisijungimo sesijai palaikyti (httpOnly, 1 metų galiojimas).
        Analitikos, reklamos ar trečiųjų šalių sekimo slapukų nenaudojame, todėl sutikimo juosta nereikalinga.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">8. Duomenų perdavimas</h2>
      <p>
        Duomenų neparduodame ir neperduodame tretiesiems asmenims, išskyrus techninius paslaugų teikėjus
        (prieglobos ir autentifikavimo paslaugos), veikiančius pagal duomenų apdorojimo sutartis.
      </p>
    </div>
  );
}
