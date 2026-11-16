#!/usr/bin/env bash
# Runs ON the server (Ubuntu 22.04/24.04). Installs Docker, opens ports, writes
# .env on first run, then builds and starts the whole stack.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  echo ">> Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

# Oracle's Ubuntu images ship iptables rules that drop everything but SSH.
echo ">> Opening ports 80/443"
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 5 -p tcp --dport $p -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

# Swap keeps a full Next.js build from being OOM-killed on smaller VMs.
if ! swapon --show | grep -q .; then
  echo ">> Adding 4G swap"
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -f .env ]; then
  echo ">> Creating .env with fresh secrets"
  IP=$(curl -fsS https://api.ipify.org)
  DASHED=${IP//./-}
  BASE=${DOMAIN:-$DASHED.sslip.io}
  cat > .env <<EOF
APP_HOST=${APP_HOST:-$BASE}
RT_HOST=rt.$BASE
REC_HOST=rec.$BASE
POSTGRES_PASSWORD=$(openssl rand -hex 24)
NEXTAUTH_SECRET=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
RECORDER_WORKER_SECRET=$(openssl rand -hex 32)
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
APP_ENCRYPTION_KEY_VERSION=1
NODE_ENV=production
EOF
  chmod 600 .env
fi

echo ">> Building and starting (first build takes ~10-20 min)"
sudo docker compose up -d --build
sudo docker image prune -f >/dev/null

set -a; . ./.env; set +a
echo
echo "Done. Open: https://$APP_HOST"
