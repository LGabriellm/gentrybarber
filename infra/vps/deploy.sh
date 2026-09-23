#!/usr/bin/env bash
# Deploy a CI-approved image bundle already transferred to a versioned release directory.
# Usage: bash /opt/barber-platform/releases/<release-id>/infra/vps/deploy.sh <sha> <release-id>
set -euo pipefail

APP_DIR="/opt/barber-platform"
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$RELEASE_DIR/compose.production.yaml"
LOG_FILE="/var/log/barber-deploy.log"
APPROVED_SHA="${1:?Pass the CI-approved commit SHA}"
RELEASE_ID="${2:?Pass the CI-approved release ID}"

if [[ ! "$APPROVED_SHA" =~ ^[a-f0-9]{40}$ ]] || [[ ! "$RELEASE_ID" =~ ^${APPROVED_SHA}-[0-9]+-[0-9]+$ ]]; then
  echo "Invalid approved SHA or release ID" >&2
  exit 1
fi
if [[ "$RELEASE_DIR" != "$APP_DIR/releases/$RELEASE_ID" ]]; then
  echo "Release must run from its versioned directory" >&2
  exit 1
fi
if [[ "$(cat "$RELEASE_DIR/REVISION")" != "$APPROVED_SHA" ]] || [[ "$(cat "$RELEASE_DIR/RELEASE_ID")" != "$RELEASE_ID" ]]; then
  echo "Release metadata does not match the approved CI run" >&2
  exit 1
fi
(cd "$RELEASE_DIR" && sha256sum --check --status SHA256SUMS)

if [[ ! -f "$APP_DIR/.env.production" ]]; then
  echo "Missing $APP_DIR/.env.production; provision the VPS before deployment" >&2
  exit 1
fi
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1 || ! command -v caddy >/dev/null; then
  echo "Docker Compose and Caddy must be installed before deployment" >&2
  exit 1
fi
if { [[ -e "$APP_DIR/current" ]] && [[ ! -L "$APP_DIR/current" ]]; } ||
   { [[ -e "$APP_DIR/.current-next" ]] && [[ ! -L "$APP_DIR/.current-next" ]]; }; then
  echo "The active-release paths must be symlinks or absent" >&2
  exit 1
fi

export RELEASE_ID
compose() {
  docker compose --project-directory "$APP_DIR" --env-file "$APP_DIR/.env.production" -f "$COMPOSE_FILE" "$@"
}

cd "$RELEASE_DIR"

echo "$(date -Iseconds) ── Deploy $RELEASE_ID ($APPROVED_SHA) started ──" | tee -a "$LOG_FILE"

# ── 1. Load the exact images packaged by the approved CI run ─────
echo "[1/7] Loading verified production images..."
gzip -dc "$RELEASE_DIR/images.tar.gz" | docker load 2>&1 | tee -a "$LOG_FILE"
for app in api worker web-public dashboard admin; do
  expected_id="$(sed -n "s/^${app}=//p" "$RELEASE_DIR/IMAGE_IDS")"
  if [[ ! "$expected_id" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "Missing or invalid image ID for $app" | tee -a "$LOG_FILE"
    exit 1
  fi
  actual_id="$(docker image inspect "barber-platform-$app:$RELEASE_ID" --format '{{.Id}}')"
  if [[ "$actual_id" != "$expected_id" ]]; then
    echo "Loaded image for $app differs from the approved artifact" | tee -a "$LOG_FILE"
    exit 1
  fi
done

ENV_FILE="$APP_DIR/.env.production"

# Strip any Windows carriage returns that might break regex matching
sed -i 's/\r$//' "$ENV_FILE"

read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

ensure_env_default() {
  local key="$1" default="$2"
  if ! grep -q "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$default" >> "$ENV_FILE"
  elif [[ -z "$(read_env "$key")" ]]; then
    sed -i "s|^${key}=.*$|${key}=${default}|" "$ENV_FILE"
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
if [[ ! "$PLATFORM_DOMAIN_VALUE" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]]; then
  echo "Invalid PLATFORM_DOMAIN in .env.production" | tee -a "$LOG_FILE"
  exit 1
fi
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

# ── 2. Validate configuration without rebuilding images ─────────
echo "[2/7] Validating production configuration..."
compose config --quiet 2>&1 | tee -a "$LOG_FILE"

# ── 3. Run migrations ────────────────────────────────────────────
echo "[3/7] Running database migrations..."
compose run --rm migrate 2>&1 | tee -a "$LOG_FILE"

# Host Caddy reaches loopback-published containers through the Docker gateway.
# Trust that single gateway, never every private network or every source.
TRUST_PROXY_CIDRS_VALUE="$(read_env TRUST_PROXY_CIDRS)"
if [[ -z "$TRUST_PROXY_CIDRS_VALUE" ]]; then
  POSTGRES_CONTAINER_ID="$(compose ps -q postgres)"
  DOCKER_GATEWAY="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{println .Gateway}}{{end}}' "$POSTGRES_CONTAINER_ID" | sed -n '/./{p;q;}')"
  if [[ -z "$DOCKER_GATEWAY" ]]; then
    echo "Could not discover the Docker gateway used by Caddy" | tee -a "$LOG_FILE"
    exit 1
  fi
  TRUST_PROXY_CIDRS_VALUE="$DOCKER_GATEWAY/32"
  if grep -q '^TRUST_PROXY_CIDRS=' "$ENV_FILE"; then
    sed -i "s|^TRUST_PROXY_CIDRS=.*$|TRUST_PROXY_CIDRS=$TRUST_PROXY_CIDRS_VALUE|" "$ENV_FILE"
  else
    printf 'TRUST_PROXY_CIDRS=%s\n' "$TRUST_PROXY_CIDRS_VALUE" >> "$ENV_FILE"
  fi
fi
if [[ ! "$TRUST_PROXY_CIDRS_VALUE" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/32$ ]]; then
  echo "TRUST_PROXY_CIDRS must identify only the exact ingress gateway" | tee -a "$LOG_FILE"
  exit 1
fi

# ── 4. Restart services ──────────────────────────────────────────
echo "[4/7] Restarting services..."
compose up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"

# ── 5. Configure ingress ─────────────────────────────────────────
echo "[5/7] Configuring public ingress..."
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
  echo "  docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs --tail 50"
  echo "$(date -Iseconds) ── Deploy FAILED ──" | tee -a "$LOG_FILE"
  exit 1
fi

# The cron backup reads the exact Compose file of the last healthy release.
ln -sfn "releases/$RELEASE_ID" "$APP_DIR/.current-next"
mv -Tf "$APP_DIR/.current-next" "$APP_DIR/current"

echo ""
echo "$(date -Iseconds) ── Deploy $RELEASE_ID completed successfully ──" | tee -a "$LOG_FILE"
echo "All services healthy. 🚀"
