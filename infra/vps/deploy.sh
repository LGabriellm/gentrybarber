#!/usr/bin/env bash
# Deploy script — executed on the VPS by GitHub Actions or manually.
# Usage: ssh deploy@VPS 'bash /opt/barber-platform/infra/vps/deploy.sh'
set -euo pipefail

APP_DIR="/opt/barber-platform"
COMPOSE_FILE="compose.production.yaml"
LOG_FILE="/var/log/barber-deploy.log"

cd "$APP_DIR"

echo "$(date -Iseconds) ── Deploy started ──" | tee -a "$LOG_FILE"

# ── 1. Pull latest code ──────────────────────────────────────────
echo "[1/7] Pulling latest code..."
git config --global --add safe.directory "$APP_DIR"
git fetch origin main 2>&1 | tee -a "$LOG_FILE"
git reset --hard origin/main 2>&1 | tee -a "$LOG_FILE"

if [ ! -f .env.production ]; then
  echo "==> Creating missing .env.production from template"
  cp .env.production.example .env.production
  DB_PASS=$(openssl rand -hex 16)
  AUTH_SECRET=$(openssl rand -hex 32)
  sed -i "s/CHANGE_ME_STRONG_PASSWORD_HERE/$DB_PASS/g" .env.production
  sed -i "s/CHANGE_ME_AT_LEAST_32_CHARS/$AUTH_SECRET/g" .env.production
fi

# Strip any Windows carriage returns that might break regex matching
sed -i 's/\r$//' .env.production

# Ensure empty required variables have fallback values so Docker Compose doesn't crash
sed -i "s/^SMTP_HOST=[[:space:]]*$/SMTP_HOST=localhost/g" .env.production
sed -i "s/^SMTP_USER=[[:space:]]*$/SMTP_USER=user/g" .env.production
sed -i "s/^SMTP_PASSWORD=[[:space:]]*$/SMTP_PASSWORD=pass/g" .env.production

# ── 2. Build images ──────────────────────────────────────────────
echo "[2/7] Building Docker images..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" build 2>&1 | tee -a "$LOG_FILE"

# ── 3. Run migrations ────────────────────────────────────────────
echo "[3/7] Running database migrations..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" run --rm migrate 2>&1 | tee -a "$LOG_FILE"

# ── 4. Restart services ──────────────────────────────────────────
echo "[4/7] Restarting services..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"

# ── 5. Configure ingress ─────────────────────────────────────────
echo "[5/7] Configuring public ingress..."
PLATFORM_DOMAIN_VALUE="$(sed -n 's/^PLATFORM_DOMAIN=//p' .env.production | tail -n 1 | tr -d '\r')"
if [[ ! "$PLATFORM_DOMAIN_VALUE" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]]; then
  echo "Invalid PLATFORM_DOMAIN in .env.production" | tee -a "$LOG_FILE"
  exit 1
fi
RENDERED_CADDY="$(mktemp)"
trap 'rm -f "$RENDERED_CADDY"' EXIT
sed "s/{{PLATFORM_DOMAIN}}/$PLATFORM_DOMAIN_VALUE/g" infra/vps/Caddyfile > "$RENDERED_CADDY"
sudo caddy validate --config "$RENDERED_CADDY" --adapter caddyfile 2>&1 | tee -a "$LOG_FILE"
sudo install -m 0644 "$RENDERED_CADDY" /etc/caddy/Caddyfile
sudo systemctl reload caddy

# ── 6. Wait for health ───────────────────────────────────────────
echo "[6/7] Waiting for services to become healthy..."
sleep 15

# ── 7. Health checks ─────────────────────────────────────────────
echo "[7/7] Running health checks..."
FAILED=0

check_health() {
  local name="$1" url="$2"
  if curl --fail --silent --max-time 10 "$url" > /dev/null 2>&1; then
    echo "  ✓ $name is healthy"
  else
    echo "  ✗ $name FAILED ($url)" | tee -a "$LOG_FILE"
    FAILED=1
  fi
}

check_health "API readiness"  "http://127.0.0.1:4000/ready"
check_health "Web Public"     "http://127.0.0.1:3000/api/health"
check_health "Dashboard"      "http://127.0.0.1:3001/api/health"
check_health "Admin"          "http://127.0.0.1:3002/api/health"
if curl --fail --silent --max-time 10 -H "Host: healthcheck.$PLATFORM_DOMAIN_VALUE" "http://127.0.0.1/api/health" > /dev/null 2>&1; then
  echo "  ✓ Public ingress preserves tenant hostnames"
else
  echo "  ✗ Public ingress FAILED" | tee -a "$LOG_FILE"
  FAILED=1
fi

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "⚠ Some health checks failed. Check logs:"
  echo "  docker compose --env-file .env.production -f $COMPOSE_FILE logs --tail 50"
  echo "$(date -Iseconds) ── Deploy FAILED ──" | tee -a "$LOG_FILE"
  exit 1
fi

# ── Cleanup old images ───────────────────────────────────────────
echo "Pruning unused Docker images..."
docker image prune -f 2>&1 | tee -a "$LOG_FILE"

echo ""
echo "$(date -Iseconds) ── Deploy completed successfully ──" | tee -a "$LOG_FILE"
echo "All services healthy. 🚀"
