#!/bin/bash
# QTO diegimo skriptas Hostinger VPS (Ubuntu/Debian)
# Naudojimas: ./deploy.sh
set -e

echo "=== QTO diegimas ==="

# 1. Docker, jei nėra
if ! command -v docker &>/dev/null; then
  echo "→ Diegiamas Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2. .env failas
if [[ ! -f .env ]]; then
  cp deploy/.env.example .env
  # Automatiškai sugeneruojame stiprų DB slaptažodį
  DBPASS=$(openssl rand -hex 16)
  sed -i "s/PAKEISKITE_STIPRU_SLAPTAZODZI/$DBPASS/" .env
  echo "→ Sukurtas .env su atsitiktiniu DB slaptažodžiu"
fi

# 3. Swap 2 GB, jei VPS turi mažai RAM (<2GB) – build'ui ir MySQL reikia atminties
if [[ ! -f /swapfile ]] && [[ $(free -m | awk '/Mem:/{print $2}') -lt 1900 ]]; then
  echo "→ Mažai RAM – kuriama 2 GB swap..."
  fallocate -l 2G /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 4. Build + start
echo "→ Konstruojami konteineriai (pirmą kartą ~10-15 min.)..."
docker compose up -d --build

echo ""
echo "=== BAIGTA ==="
echo "Programa veikia: http://127.0.0.1:3000"
echo "Sveikatos tikrinimas: curl http://127.0.0.1:3000/api/trpc/ping"
echo ""
echo "Kitas žingsnis: HTTPS su domenu – žr. deploy/Caddyfile ir DIEGIMAS.md"
