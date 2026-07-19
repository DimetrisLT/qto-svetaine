import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed">
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Į pradžią
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Naudojimo sąlygos</h1>
      <p className="mb-4 text-muted-foreground">Atnaujinta: 2026 m. liepos 19 d.</p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">1. Paslauga</h2>
      <p>
        QTO yra programinė įrangos paslauga, padedanti rinkti statybos kiekius iš IFC, PDF ir DXF failų,
        tikrinti juos ir formuoti darbų kiekių žiniaraščius. Paslauga teikiama „tokia, kokia yra“.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">2. Atsakomybė už kiekius – svarbiausia</h2>
      <p>
        Įrankis yra <strong>pagalbinė priemonė</strong>. Automatiškai aptikti masteliai, OCR nuskaityti žiniaraščiai,
        AI atlikti matavimai, kompozitinių darbų išvestiniai kiekiai ir rodiklių patikros <strong>gali būti netikslūs</strong>.
        Prieš naudodami kiekius sąmatoms, pasiūlymams ar sutartims, juos privalo patikrinti kvalifikuotas
        sąmatininkas / projektuotojas. Mes neatsakome už nuostolius, atsiradusius dėl netiklių kiekių.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">3. Jūsų turinys</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Jūs išlaikote visas teises į savo brėžinius ir projektų duomenis.</li>
        <li>Brėžinių failai apdorojami tik jūsų naršyklėje ir mums nesiunčiami.</li>
        <li>Įsipareigojate turėti teisę naudoti įkeliamus brėžinius.</li>
      </ul>

      <h2 className="mb-2 mt-6 text-lg font-semibold">4. Draudžiama veikla</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Bandyti pažeisti autentifikavimą, API ar kitų vartotojų duomenis.</li>
        <li>Automatizuotai apkrauti sistemą (scraping, DoS).</li>
        <li>Naudoti paslaugą teisės aktų draudžiamais tikslais.</li>
      </ul>

      <h2 className="mb-2 mt-6 text-lg font-semibold">5. Paslaugos prieinamumas</h2>
      <p>
        Siekiame nepertraukiamo veikimo, tačiau negarantuojame 100 % prieinamumo.
        Planuojamų ir neplanuojamų priežiūros darbų metu paslauga gali būti laikinai nepasiekiama.
        Rekomenduojame svarbius projektus periodiškai eksportuoti JSON formatu.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">6. Atsakomybės apribojimas</h2>
      <p>
        Įstatymų leidžiama apimtimi mūsų atsakomybė ribojama tiesiogine žala, neviršijančia sumos,
        kurią sumokėjote už paslaugą per paskutinius 12 mėnesių (jei paslauga nemokama – 0 EUR).
        Neatsakome už netiesioginę žalą, prarastą pelną ar sutartis.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">7. Paskyros nutraukimas</h2>
      <p>
        Paskyrą galite ištrinti bet kada portale. Mes galime nutraukti arba sustabdyti paskyrą,
        pažeidus šias sąlygas, iš anksto įspėję, jei tai įmanoma.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">8. Sąlygų keitimai</h2>
      <p>
        Apie esminius sąlygų pakeitimus informuosime svetainėje. Tęsdami naudojimąsi po pakeitimų,
        sutinkate su nauja redakcija.
      </p>
    </div>
  );
}
