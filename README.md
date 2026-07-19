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

> **DWG?** Palaikomas DXF formatas. DWG konvertuokite nemokamai: *ODA File Converter* arba *LibreCAD* (DWG → DXF).

---

## 1 variantas: įkėlimas į Hostinger (paprasčiausia)

Programa yra statinė – jokio serverio programavimo nereikia.

1. Šiame projekte atsidarykite aplanką **`dist/`**.
2. Hostinger valdymo pulte atidarykite **Failų tvarkyklė** → `public_html`.
3. Įkelkite **visą `dist/` aplanko turinį** (index.html, assets/, wasm/, favicon.svg).
4. Atidarykite savo domeną – programa veikia.

Veikia ir pakelgyje (pvz., `domenas.lt/qto/`) – keliai relatyvūs.

## 2 variantas: GitHub + Codespaces

```bash
git init
git add .
git commit -m "QTO programa"
git remote add origin https://github.com/JUSU_VARDAS/qto.git
git push -u origin main
```

Codespaces arba lokaliai (VS Code):

```bash
npm install
npm run dev      # kūrimo režimas  → http://localhost:3000
npm run build    # sugeneruoja dist/ (ją kelkite į Hostinger)
```

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
