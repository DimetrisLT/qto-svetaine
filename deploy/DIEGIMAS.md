# QTO diegimas Hostinger VPS — žingsnis po žingsnio

**Kas reikalinga:** Hostinger VPS (Ubuntu 22.04/24.04, ≥2 GB RAM rekomenduojama) ir domenas.

## 1. Prisijunkite prie VPS

hPanel → VPS → **Browser terminal** (arba `ssh root@JUSU_VPS_IP` iš savo kompiuterio).

## 2. Įkelkite projektą

```bash
mkdir -p /opt/qto && cd /opt/qto
# Įkelkite qto-programa.zip (scp arba Failų tvarkyklė per hPanel failų valdiklį nėra VPS —
# paprasčiausia: iš savo kompiuterio)
#   scp qto-programa.zip root@JUSU_VPS_IP:/opt/qto/
apt update && apt install -y unzip
unzip qto-programa.zip
```

## 3. Paleiskite diegimą

```bash
cd /opt/qto
chmod +x deploy/deploy.sh deploy/backup.sh
./deploy/deploy.sh
```

Skriptas pats: įdiegia Docker, sugeneruoja DB slaptažodį (.env), prireikus sukuria swap, sukonstruoja ir paleidžia konteinerius, pritaiko DB migracijas.

Patikrinkite:

```bash
curl http://127.0.0.1:3000/api/trpc/ping
# {"result":{"data":{"json":{"ok":true,...}}}}
```

## 4. Domenas + HTTPS

1. **DNS**: hPanel → Domenai → DNS zonos: sukurkite **A įrašą** (pvz., `qto`) → jūsų VPS IP. Palaukite ~5-30 min.
2. **Caddy** (automatinis HTTPS):

```bash
apt install -y caddy
# redaguokite: nano deploy/Caddyfile  →  pakeiskite qto.domenas.lt savo domenu
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

Atidarykite `https://jusu-domenas` — programa veikia su sertifikatu.

## 5. Prisijungimo (OAuth) patikrinimas

Atidarykite `https://jusu-domenas/login` → „Sign in with Kimi“. Jei grąžina klaidą dėl callback –
praneškite: reikės patvirtinti `https://jusu-domenas/api/oauth/callback` aplikacijos nustatymuose.

## 6. Atsarginės kopijos (kasdien 03:00)

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/qto/deploy/backup.sh") | crontab -
```

Kopijos saugomos `/opt/qto-backups/` (14 paskutinių).

## Naudingos komandos

```bash
docker compose -f /opt/qto/docker-compose.yml logs -f app   # programos žurnalas
docker compose -f /opt/qto/docker-compose.yml restart app   # paleisti iš naujo
docker compose -f /opt/qto/docker-compose.yml up -d --build # atnaujinti (po kodo pakeitimų)
```
