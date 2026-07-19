# QTO – Statybos kiekių surinkimas

Programa automatiškai suranda statybos kiekius iš **IFC**, **PDF** ir **DXF** failų.
Viskas skaičiuojama jūsų naršyklėje – failai niekur nesiunčiami į serverį.

## Funkcijos

| Formatas | Režimas | Ką gaunate |
|---|---|---|
| **IFC** | Pilnai automatinis | Kiekiai (ilgis, plotas, tūris), medžiagos, 3D vaizdas su spalvų koduote, kryžminis tūrių patikrinimas |
| **PDF** | Pusiau automatinis | Mastelio kalibravimas 2 taškais → ilgių, plotų, tūrių ir vnt. skaičiavimas pažymėjus brėžinyje |
| **DXF** | Pusiau automatinis | Sluoksnių ilgiai, uždarų kontūrų plotai, blokų kiekis → priskyrimas kategorijoms (sienos, perdangos…) |
| **Ataskaita** | – | Suvestinė pagal kategorijas, savikontrolė (✅/⚠️), Excel (XLSX) eksportas, CSV kopijavimas |

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

1. **IFC kortelė** – įkelkite `.ifc` modelį; kiekiai suskaičiuojami automatiškai, apačioje pamatysite 3D modelį (galite slėpti/rodyti kategorijas).
2. **PDF kortelė** – įkelkite brėžinį, spauskite **„Mastelis“**, pažymėkite du žinomus taškus (pvz., ašių sankirtas) ir įveskite realų atstumą metrais. Tada rinkitės **„Ilgis“** (sienoms), **„Plotas“** (perdangoms/patalpoms) arba **„Skaičiuoti“** (kolonoms, durims, langams), žymėkite brėžinyje, spauskite **„Baigti“** ir užpildykite formą (aukštis, storis, medžiaga).
3. **DXF kortelė** – įkelkite `.dxf`, pasirinkite brėžinio vienetus (mm/cm/m), kiekvienam sluoksniui priskirkite kategoriją ir matmenis → **„Įtraukti“**.
4. **Ataskaita** – bendra suvestinė iš visų šaltinių, savikontrolės patikrinimai ir **Excel** eksportas.

## Savikontrolė

Programa automatiškai tikrina:
- **Pilnumą** – ar visi elementai/sluoksniai įtraukti, ar PDF mastelis sukalibruotas;
- **Geometriją** – IFC deklaruoti tūriai lyginami su tūriais iš 3D geometrijos (±20 %), perdangų plotas su patalpų plotu;
- **Logiką** – nuliniai/neigiami matmenys, trūkstamos medžiagos.

## Technologijos

React 19 + TypeScript + Vite · web-ifc (IFC WASM) · three.js (3D) · pdf.js · dxf-parser · SheetJS (Excel) · Tailwind
