#!/usr/bin/env bash
# KI-Scale Business OS – Einrichtung auf dem Hetzner-Server (Ubuntu/Debian), als root ausführen:
#   curl -fsSL https://raw.githubusercontent.com/KI-Scale/ki-scale-os/main/deploy/install.sh | bash
# Kann gefahrlos mehrfach laufen. Ändert nichts an n8n oder anderen Diensten.
set -euo pipefail

REPO_URL="https://github.com/KI-Scale/ki-scale-os.git"
APP=/opt/ki-scale-os
DATA=/var/lib/ki-scale-os
PORT=3100
IP=$(curl -4 -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
DOMAIN="${DOMAIN:-os.$(echo "$IP" | tr . -).sslip.io}"
say(){ printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn(){ printf '\n\033[1;33m!!  %s\033[0m\n' "$*"; }

say "Server: $IP · Adresse: https://$DOMAIN"

say "Pakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq git curl ca-certificates gnupg >/dev/null
if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

say "Benutzer und Ordner"
id kios >/dev/null 2>&1 || useradd -r -m -d /home/kios -s /usr/sbin/nologin kios
mkdir -p "$DATA" && chown -R kios:kios "$DATA"

say "Code holen"
if [ -d "$APP/.git" ]; then git -C "$APP" fetch -q origin main && git -C "$APP" reset -q --hard origin/main
else rm -rf "$APP"; git clone -q --depth 1 "$REPO_URL" "$APP"; fi
chown -R kios:kios "$APP"
git config --global --add safe.directory "$APP" || true

say "Dienst einrichten"
cat > /etc/systemd/system/ki-scale-os.service <<EOF
[Unit]
Description=KI-Scale Business OS
After=network.target
[Service]
User=kios
WorkingDirectory=$APP
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA
Environment=NODE_NO_WARNINGS=1
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
# Auto-Update: jede Minute neuen Code von GitHub holen und bei Änderung neu starten
cat > /usr/local/bin/ki-scale-os-update <<EOF
#!/usr/bin/env bash
set -e
cd $APP
git fetch -q origin main
if [ "\$(git rev-parse HEAD)" != "\$(git rev-parse origin/main)" ]; then
  git reset -q --hard origin/main && chown -R kios:kios $APP && systemctl restart ki-scale-os
  echo "aktualisiert auf \$(git rev-parse --short HEAD)"
fi
EOF
chmod +x /usr/local/bin/ki-scale-os-update
cat > /etc/systemd/system/ki-scale-os-update.service <<EOF
[Unit]
Description=KI-Scale Business OS Update
[Service]
Type=oneshot
ExecStart=/usr/local/bin/ki-scale-os-update
EOF
cat > /etc/systemd/system/ki-scale-os-update.timer <<EOF
[Unit]
Description=KI-Scale Business OS Update jede Minute
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now ki-scale-os ki-scale-os-update.timer >/dev/null
systemctl restart ki-scale-os

say "Webserver (HTTPS)"
SITE="$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:$PORT {
    header_up X-Forwarded-Proto https
  }
}"
owner443=$(ss -ltnpH '( sport = :443 )' 2>/dev/null | head -1 || true)
if systemctl is-active --quiet caddy || [ -z "$owner443" ]; then
  if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y -qq && apt-get install -y -qq caddy >/dev/null
  fi
  mkdir -p /etc/caddy/sites
  echo "$SITE" > /etc/caddy/sites/ki-scale-os.caddy
  grep -q 'import sites/\*' /etc/caddy/Caddyfile 2>/dev/null || echo 'import sites/*' >> /etc/caddy/Caddyfile
  # Standard-Platzhalter von Caddy (":80 { … }") entfernen, falls vorhanden und sonst nichts drin steht
  if grep -q '^:80 {' /etc/caddy/Caddyfile && ! grep -qE '^[a-z0-9].*\.[a-z]{2,} *\{' /etc/caddy/Caddyfile; then
    awk 'BEGIN{skip=0} /^:80 \{/{skip=1} skip&&/^\}/{skip=0;next} !skip' /etc/caddy/Caddyfile > /tmp/Caddyfile && mv /tmp/Caddyfile /etc/caddy/Caddyfile
  fi
  caddy validate --config /etc/caddy/Caddyfile >/dev/null && systemctl reload caddy || systemctl restart caddy
  PROXY=caddy
elif systemctl is-active --quiet nginx; then
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  cat > /etc/nginx/sites-available/ki-scale-os <<EOF
server { listen 80; server_name $DOMAIN; location / { proxy_pass http://127.0.0.1:$PORT; proxy_set_header Host \$host; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For \$remote_addr; } }
EOF
  ln -sf /etc/nginx/sites-available/ki-scale-os /etc/nginx/sites-enabled/ki-scale-os
  nginx -t && systemctl reload nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m team@ki-scale.com --redirect >/dev/null
  PROXY=nginx
else
  PROXY="unbekannt: $owner443"
  warn "Port 443 gehört einem anderen Programm ($owner443)."
  command -v docker >/dev/null && docker ps --format '   {{.Names}}  {{.Image}}  {{.Ports}}' || true
  warn "Mach bitte ein Foto/Screenshot von diesem Fenster und schick es Claude. Das OS läuft schon intern, nur die Adresse fehlt noch."
fi

sleep 4
PW_FILE="$DATA/erstes-passwort.txt"
echo
echo "=================== FERTIG ==================="
echo " Adresse:   https://$DOMAIN"
if [ -f "$PW_FILE" ]; then echo " Passwort:  $(cat "$PW_FILE")"; else echo " Passwort:  (wurde schon früher vergeben)"; fi
echo " Webserver: $PROXY"
echo " Status:    $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/api/health)"
echo "=============================================="
echo " Passwort notieren und Claude schreiben: \"Server läuft\""
