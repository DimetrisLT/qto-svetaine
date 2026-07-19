# QTO – Statybos kiekių surinkimas

Programa automatiškai suranda statybos kiekius iš **IFC**, **PDF** ir **DXF** failų
ir suformuoja bendrą **darbų kiekių žiniaraštį** – pagrindą detaliosioms sąmatoms.
Viskas skaičiuojama jūsų naršyklėje – failai niekur nesiunčiami į serverį.

## Funkcijos

| Formatas | Režimas | Ką gaunate |
|---|---|---|
| **IFC** | Pilnai automatinis | Kiekiai (ilgis, plotas, tūris), medžiagos, 3D vaizdas su spalvų koduote, kryžminis tūrių patikrinimas |
| **PDF (projektas)** | Pusiau automatinis | Keli susiję failai vienu metu (A, SK, VK, E, Š, V dalys): kiekvienam – savas mastelio kalibravimas, visi matavimai sueina į vieną žiniaraštį |
| **PDF žiniaraščiai (OCR)** | Automatinis su patvirtinimu | Pažymėkite žiniaraščio lentelę brėžinyje – programa nuskaito pozicijas (pavadinimas, vnt., kiekis, m³/vnt., betono klasė) ir įtraukia kaip **projekto duomenis** |
| **DXF** | Pusiau automatinis | Sluoksnių ilgiai, uždarų kontūrų plotai, blokų kiekis → priskyrimas kategorijoms |
| **Žiniaraštis** | Automatinis | Kiekiai sugrupuoti pagal darbų grupes (pamatams, sienoms, perdangoms, stogui, langams, durims, apdailai) su pozicijų numeriais – paruošta sąmatoms |
| **Kompozitiniai darbai** | Pusiau automatinis | Vienas matavimas → kelios eilutės: betonas, kofanas (kontaktinio paviršiaus taisyklės), armatūra (kg/m³ įvertis), apdaila. Kiekviena eilutė rodo formulę |
| **Rodiklių patikra** | Automatinis | Betonas m³/m², armatūra kg/m³, kofanas m²/m³, apdaila m²/m² lyginami su tipiniais diapazonais – sugando eilinio dydžio klaidas |
| **Tęstinumas** | Automatinis | Darbas išsaugomas naršyklėje; prisijungus – debesyje (portalas „Mano projektai“); JSON eksportas/importas |

> **DWG?** Palaikomas DXF formatas. DWG konvertuokite nemokamai: *ODA File Converter* arba *LibreCAD* (DWG → DXF).

---

## Architektūra (pilnas sprendimas)

Vienas projektas apjungia viską:

| Kelias | Kas | Prieiga |
|---|---|---|
| `/` | Titulinis puslapis (landing) | Vieša |
| `/app` | QTO programa (IFC/PDF/DXF → kiekiai) | Vieša (veikia ir be prisijungimo, localStorage) |
| `/login` | Prisijungimas (Kimi OAuth 2.0) | Vieša |
| `/portal` | „Mano projektai“ – debesyje išsaugoti darbai | Reikia prisijungti |

- **Frontend**: React 19 + Vite + Tailwind (SPA, `dist/public`)
- **Backend**: Hono + tRPC 11 (`api/`), JWT sesijos (httpOnly slapukas)
- **DB**: MySQL per Drizzle ORM (`db/schema.ts`: `users`, `projects`)
- **Diegimas**: Docker (`Dockerfile` – vienoje atspalvyje frontend + backend)

## Paleidimas

### Kūrimo režimas

```bash
npm install
npm run db:push    # sukuria DB lenteles
npm run dev        # http://localhost:3000
```

### Produkacija (Docker)

```bash
docker build -t qto .
docker run -p 3000:3000 qto
```

Arba be Docker: `npm run build && npm start` (reikia `.env` kintamųjų).

## Paleidimo į gyvenimą kontrolinis sąrašas

**Infrastruktūra**
- [ ] Domenas + HTTPS (Let's Encrypt / Cloudflare); OAuth callback turi būti `https://DOMENAS/api/oauth/callback` – užregistruoti Kimi portale
- [ ] `.env` – per secrets valdymą (NE į git); `APP_SECRET`, `DATABASE_URL`, `VITE_APP_ID`, `VITE_KIMI_AUTH_URL`
- [ ] MySQL produkcijoje: `npm run db:generate` → `db:migrate` (NE `db:push` prod'e), kasdieniai backup'ai
- [ ] Reverse proxy (nginx/Caddy) → `:3000`, gzip/brotli, statinių failų cache

**Saugumas**
- [ ] Sesijų slapukas: `Secure` + `SameSite` (prod režime automatiškai per `getSessionCookieOptions`)
- [ ] Rate limiting `/api/*` (pvz., nginx `limit_req`) – apsauga nuo bruteforce/API švaistymo
- [ ] Projektų dydžio limitas `projects.data` (JSON) – pvz., 5 MB, validuoti serveryje
- [ ] RBAC patikra: `adminQuery` tik administratoriui (jau yra `api/middleware.ts`)

**Teisinis (BDAR/GDPR)**
- [ ] Privatumo politika: kokius duomenis renkate (vardas, el. paštas iš OAuth; projektų turinys), saugojimo terminai
- [ ] Vartotojo teisė ištrinti paskyrą ir visus projektus (mygtukas portale)
- [ ] Slapukų informacija (sesijos slapukas – būtinas, sutikimo nereikia, bet reikia paminėti)
- [ ] Naudojimo sąlygos (atsakomybės apribojimas už kiekių tikslumą – įrankis padeda, bet sąmatininkas tikrina)

**Stebėsena ir kokybė**
- [ ] Sveikatos tikrinimas: `GET /api/trpc/ping` uptime monitoriumi (pvz., UptimeRobot)
- [ ] Klaidų sekimas (Sentry ar pan.) frontend + backend
- [ ] `npm run check` + E2E testai (`work/tests/`) prieš kiekvieną diegimą; rollback per versijų tvarkyklę

---

## Kaip naudotis

### PDF projektas (keli failai – viena visuma)

1. **PDF kortelėje** įkelkite pirmą failą (pvz., architektūros dalį „A“).
2. Spauskite **„Pridėti PDF“** – įkelkite kitas dalis (SK, VK, E…). Programa dalį atpažįsta iš failo pavadinimo, bet galite pakeisti išskleidžiamuoju meniu.
3. **Kiekvienam failui atskirai sukalibruokite mastelį**: atidarykite failą, spauskite „Mastelis“, pažymėkite du žinomus taškus (pvz., ašių 1→4 sankirtas) ir įveskite realų atstumą metrais.
4. Matuokite: **„Ilgis“** (sienoms), **„Plotas“** (perdangoms, patalpoms, apdailai), **„Skaičiuoti“** (poliams, kolonoms, langams, durims). Baigę žymėti spauskite **„Baigti“** ir užpildykite formą.
5. Perjunginėkite failus viršuje esančiomis kortelėmis – visi matavimai kaupiami kartu.
6. Dideliems failams naudokite **puslapio numerio lauką** įrankių juostoje (įveskite numerį ir Enter).

### Žiniaraščio nuskaitymas iš brėžinio (OCR)

Jei brėžinyje jau yra kiekių žiniaraštis (pamatų polių, langų, durų, eksplikacijos lentelė):

1. Atidarykite puslapį su lentele ir spauskite **„Žiniaraštis (OCR)“**.
2. Nuspauskite ir užtempkite rėmelį **tik ant lentelės** (kuo tiksliau – tuo geriau).
3. Programa nuskaito tekstą ir parodo pozicijas **peržiūrai** – patikrinkite, prireikus pataisykite pavadinimą, kategoriją, kiekį.
4. Spauskite **„Įtraukti pažymėtas“** – pozicijos patenka į bendrą žiniaraštį su žyma **„proj.“ (projekto duomenys)**.

> Pirmas OCR užkrovimas trunka ilgiau (keliasdešimt sekundžių – siunčiamas OCR variklis), vėlesni skaitymai spartesni. Reikalingas interneto ryšys.

### Kiekių kilmė

Kiekviena žiniaraščio eilutė pažymėta kilmės žyma:
- **„proj.“ (projekto duomenys)** – kiekiai, nuskaityti iš projektinių žiniaraščių (OCR) arba deklaruoti IFC modelyje;
- **„AI“ (skaičiuota AI)** – kiekiai, apskaičiuoti iš jūsų matavimų PDF/DXF arba iš IFC geometrijos.

Žymos matomos žiniaraštyje, detalioje suvestinėje ir Excel failo lapuose (stulpelis **„Kilmė“**).

### Mastelis: automatinis aptikimas ir tikrinimas

- Jei PDF turi teksto sluoksnį su mastelio žyma (pvz., „M1:100“ antraštės bloke), programa **pati pasiūlo mastelį** (žalias pranešimas) – pakanka spausti „Taikyti šį mastelį“.
- Jei teksto sluoksnio nėra (skenuoti brėžiniai), bet lapas atitinka standartinį formatą (A3…), rodomi **apytikslio mastelio mygtukai** (1:50 / 1:100 / 1:200). Dėmesio: brėžinys gali būti spausdintas „talpinant į lapą“ – tuomet apytikslis mastelis klysta keliais procentais, todėl būtinai patikrinkite vienu žinomu matmeniu.
- Jei rankinė kalibracija **nukrypsta >2 %** nuo brėžinyje nurodyto mastelio – programa įspėja (ir ataskaitos savikontrolėje, ir iškart).

### Tikslus žymėjimas (prisirišimas / snapping)

Vektoriniuose PDF (CAD eksportai) kursorius automatiškai **prisiriša prie linijų galų, vidurio taškų ir kraštinių** – matavimai tikslūs net nepriartinus. Skenuotuose (rastriniuose) PDF vektorių nėra, todėl žymėkite kuo tiksliau arba naudokite didesnį priartimą.

### Kiti šaltiniai

- **IFC kortelė** – įkelkite `.ifc` modelį; kiekiai suskaičiuojami automatiškai, matysite 3D modelį.
- **DXF kortelė** – pasirinkite vienetus (mm/cm/m), sluoksniams priskirkite kategorijas → „Įtraukti“.

### Žiniaraštis ir ataskaita

**Ataskaitos** kortelėje:
- **Darbų kiekių žiniaraštis** – visų šaltinių kiekiai, sugrupuoti pagal darbų grupes su pozicijų numeriais (02.1, 02.2…) ir šaltinių žymomis (PDF/A, PDF/SK, IFC, DXF).
- **Kiekių suvestinė (detaliai)** – visos eilutės su matmenimis ir medžiagomis.
- **Savikontrolė** – ✅/⚠️ patikrinimai: kalibravimai, tūrių kryžminis sutikrinimas (IFC), logika, pilnumas.
- **Excel (XLSX)** – 4 lapai: *Žiniaraštis*, *Santrauka*, *Detaliai*, *Savikontrolė*. Tiesiogiai tinka sąmatoms.

## Savikontrolė

Programa automatiškai tikrina:
- **Pilnumą** – ar visi PDF failai sukalibruoti (ir ar kalibracija sutampa su brėžinio masteliu ±2 %), ar visi DXF sluoksniai priskirti, ar IFC elementai turi kiekius;
- **Geometriją** – IFC deklaruoti tūriai lyginami su tūriais iš 3D geometrijos (±20 %), perdangų plotas su patalpų plotu;
- **Dvigubą skaičiavimą** – tos pačios kategorijos plotų persidengimai (>10 %), sutampantys ilgiai skirtingose projekto dalyse (A ↔ SK, ±5 %), vnt. kiekių neatitiktys tarp plano ir projekto žiniaraščio (OCR);
- **Trianguliaciją** – nepriklausomų šaltinių kryžminis sutikrinimas:
  - OCR žiniaraščio pozicijų sumos lyginamos su pačio žiniaraščio „VISO“ eilute (±2 %) – aritmetinė OCR patikra;
  - projekto duomenys (žiniaraščiai) lyginami su AI matavimais plane toje pačioje kategorijoje (±10 %);
  - IFC modelio kiekiai lyginami su PDF matavimais toje pačioje kategorijoje (±10 %);
  - aptinkamos dukart įtrauktos projekto pozicijos (tas pats pavadinimas ir vienetas);
- **Logiką** – nuliniai/neigiami matmenys, trūkstamos medžiagos.

## Darbo tęstinumas

- **Automatinis saugojimas** – kiekvienas pakeitimas (matavimai, kalibracijos, OCR pozicijos) automatiškai išsaugomas naršyklėje. Užvėrus ir vėl atidarius programą, siūloma **„Tęsti projektą“** – pozicijos ir kalibracijos atkuriamos; tereikia iš naujo įkelti tuos pačius PDF failus (sutapdinami pagal pavadinimą – mastelis ir pozicijų pririšimas atsistato automatiškai).
- **JSON eksportas / importas** – antraštėje mygtukai **„Projektas“** (atsisiųsti) ir **„Atidaryti“**: visą darbą galima perkelti į kitą kompiuterį ar perduoti kolegai kaip vieną `.json` failą.

## Technologijos

React 19 + TypeScript + Vite · web-ifc (IFC WASM) · three.js (3D) · pdf.js · dxf-parser · Tesseract.js (OCR) · SheetJS (Excel) · Tailwind
