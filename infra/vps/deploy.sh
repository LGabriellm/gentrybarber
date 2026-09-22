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

# Ensure production domain is configured (defaults to gentryhub.tech on VPS)
if grep -q '^PLATFORM_DOMAIN=localhost' .env.production || grep -q '^PLATFORM_DOMAIN=[[:space:]]*$' .env.production || ! grep -q '^PLATFORM_DOMAIN=' .env.production; then
  if grep -q '^PLATFORM_DOMAIN=' .env.production; then
    sed -i "s/^PLATFORM_DOMAIN=.*$/PLATFORM_DOMAIN=gentryhub.tech/g" .env.production
  else
    echo "PLATFORM_DOMAIN=gentryhub.tech" >> .env.production
  fi
fi

read_env() {
  sed -n "s/^$1=//p" .env.production | tail -n 1 | tr -d '\r'
}

ensure_env_default() {
  local key="$1" default="$2"
  if ! grep -q "^${key}=" .env.production; then
    printf '%s=%s\n' "$key" "$default" >> .env.production
  elif [[ -z "$(read_env "$key")" ]]; then
    sed -i "s|^${key}=.*$|${key}=${default}|" .env.production
  fi
}

ensure_env_default API_HOST_PORT 4000
ensure_env_default WEB_PUBLIC_HOST_PORT 3000
ensure_env_default DASHBOARD_HOST_PORT 3001
ensure_env_default ADMIN_HOST_PORT 3002

for key in API_HOST_PORT WEB_PUBLIC_HOST_PORT DASHBOARD_HOST_PORT ADMIN_HOST_PORT; do
  value="$(read_env "$key")"
  if [[ ! "$value" =~ ^[0-9]{1,5}$ ]] || (( value < 1 || value > 65535 )); then
    echo "Invalid ${key} in .env.production" | tee -a "$LOG_FILE"
    exit 1
  fi
done

PORT_SET="$(printf '%s\n' "$(read_env API_HOST_PORT)" "$(read_env WEB_PUBLIC_HOST_PORT)" "$(read_env DASHBOARD_HOST_PORT)" "$(read_env ADMIN_HOST_PORT)" | sort -u | wc -l)"
if [[ "$PORT_SET" -ne 4 ]]; then
  echo "Host-only application ports must be unique" | tee -a "$LOG_FILE"
  exit 1
fi

PLATFORM_DOMAIN_VALUE="$(read_env PLATFORM_DOMAIN)"
EXPECTED_AUTH_URL="https://api.$PLATFORM_DOMAIN_VALUE"
EXPECTED_ORIGINS="https://dashboard.$PLATFORM_DOMAIN_VALUE,https://admin.$PLATFORM_DOMAIN_VALUE"
if [[ "$(read_env BETTER_AUTH_URL)" != "$EXPECTED_AUTH_URL" ]]; then
  echo "BETTER_AUTH_URL must be $EXPECTED_AUTH_URL" | tee -a "$LOG_FILE"
  exit 1
fi
if [[ "$(read_env TRUSTED_ORIGINS)" != "$EXPECTED_ORIGINS" ]]; then
  echo "TRUSTED_ORIGINS must be $EXPECTED_ORIGINS" | tee -a "$LOG_FILE"
  exit 1
fi

# ── 2. Build images ──────────────────────────────────────────────
echo "[2/7] Building Docker images..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" build 2>&1 | tee -a "$LOG_FILE"

# ── 3. Run migrations ────────────────────────────────────────────
echo "[3/7] Running database migrations..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" run --rm migrate 2>&1 | tee -a "$LOG_FILE"

# Host Caddy reaches loopback-published containers through the Docker gateway.
# Trust that single gateway, never every private network or every source.
TRUST_PROXY_CIDRS_VALUE="$(read_env TRUST_PROXY_CIDRS)"
if [[ -z "$TRUST_PROXY_CIDRS_VALUE" ]]; then
  POSTGRES_CONTAINER_ID="$(docker compose --env-file .env.production -f "$COMPOSE_FILE" ps -q postgres)"
  DOCKER_GATEWAY="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{println .Gateway}}{{end}}' "$POSTGRES_CONTAINER_ID" | sed -n '/./{p;q;}')"
  if [[ -z "$DOCKER_GATEWAY" ]]; then
    echo "Could not discover the Docker gateway used by Caddy" | tee -a "$LOG_FILE"
    exit 1
  fi
  TRUST_PROXY_CIDRS_VALUE="$DOCKER_GATEWAY/32"
  sed -i "s|^TRUST_PROXY_CIDRS=.*$|TRUST_PROXY_CIDRS=$TRUST_PROXY_CIDRS_VALUE|" .env.production
fi
if [[ ! "$TRUST_PROXY_CIDRS_VALUE" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/32$ ]]; then
  echo "TRUST_PROXY_CIDRS must identify only the exact ingress gateway" | tee -a "$LOG_FILE"
  exit 1
fi

# ── 4. Restart services ──────────────────────────────────────────
echo "[4/7] Restarting services..."
docker compose --env-file .env.production -f "$COMPOSE_FILE" up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"

# ── 5. Configure ingress ─────────────────────────────────────────
echo "[5/7] Configuring public ingress..."
if [[ ! "$PLATFORM_DOMAIN_VALUE" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]]; then
  echo "Invalid PLATFORM_DOMAIN in .env.production" | tee -a "$LOG_FILE"
  exit 1
fi
RENDERED_CADDY="$(mktemp)"
trap 'rm -f "$RENDERED_CADDY"' EXIT
sed \
  -e "s/{{PLATFORM_DOMAIN}}/$PLATFORM_DOMAIN_VALUE/g" \
  -e "s/{{API_HOST_PORT}}/$(read_env API_HOST_PORT)/g" \
  -e "s/{{WEB_PUBLIC_HOST_PORT}}/$(read_env WEB_PUBLIC_HOST_PORT)/g" \
  -e "s/{{DASHBOARD_HOST_PORT}}/$(read_env DASHBOARD_HOST_PORT)/g" \
  -e "s/{{ADMIN_HOST_PORT}}/$(read_env ADMIN_HOST_PORT)/g" \
  infra/vps/Caddyfile > "$RENDERED_CADDY"
sudo caddy validate --config "$RENDERED_CADDY" --adapter caddyfile 2>&1 | tee -a "$LOG_FILE"
sudo install -m 0644 "$RENDERED_CADDY" /etc/caddy/Caddyfile
sudo systemctl reload-or-restart caddy || sudo systemctl restart caddy

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

check_health "API readiness"  "http://127.0.0.1:$(read_env API_HOST_PORT)/ready"
check_health "Web Public"     "http://127.0.0.1:$(read_env WEB_PUBLIC_HOST_PORT)/api/health"
check_health "Dashboard"      "http://127.0.0.1:$(read_env DASHBOARD_HOST_PORT)/api/health"
check_health "Admin"          "http://127.0.0.1:$(read_env ADMIN_HOST_PORT)/api/health"
if curl --fail --silent --max-time 10 -H "Host: healthcheck.$PLATFORM_DOMAIN_VALUE" "http://127.0.0.1/api/health" > /dev/null 2>&1; then
  echo "  ✓ Public ingress preserves tenant hostnames"
else
  echo "  ✗ Public ingress FAILED" | tee -a "$LOG_FILE"
  FAILED=1
fi
for service in api dashboard admin; do
  if [[ "$service" == "api" ]]; then
    health_path="/health"
  else
    health_path="/api/health"
  fi
  if curl --fail --silent --max-time 20 "https://$service.$PLATFORM_DOMAIN_VALUE$health_path" > /dev/null 2>&1; then
    echo "  ✓ HTTPS $service is reachable"
  else
    echo "  ✗ HTTPS $service FAILED; verify DNS A/AAAA records and certificate issuance" | tee -a "$LOG_FILE"
    FAILED=1
  fi
done

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
