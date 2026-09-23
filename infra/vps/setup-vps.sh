#!/usr/bin/env bash
# VPS initial setup — run once as root on a fresh Ubuntu 24.04 + Docker VPS.
# Usage: ssh root@<VPS_HOST> 'bash -s' < infra/vps/setup-vps.sh
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run setup-vps.sh as root before starting the deploy workflow" >&2
  exit 1
fi

DEPLOY_USER="deploy"
APP_DIR="/opt/barber-platform"

echo "══════════════════════════════════════════════════"
echo "  Barber Platform — VPS Setup"
echo "══════════════════════════════════════════════════"

# ── 1. System update ─────────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ufw fail2ban unattended-upgrades

# ── 2. Create deploy user ────────────────────────────────────────
echo "[2/8] Creating deploy user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd --create-home --shell /bin/bash --groups docker "$DEPLOY_USER"
  echo "  → User '$DEPLOY_USER' created. Set up SSH keys manually:"
  echo "    mkdir -p /home/$DEPLOY_USER/.ssh"
  echo "    echo 'YOUR_PUBLIC_KEY' >> /home/$DEPLOY_USER/.ssh/authorized_keys"
  echo "    chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh"
  echo "    chmod 700 /home/$DEPLOY_USER/.ssh && chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys"
else
  echo "  → User '$DEPLOY_USER' already exists, skipping."
fi
usermod --shell /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx sudo; then
  deluser "$DEPLOY_USER" sudo
fi

echo "[3/8] Configuring deploy permissions..."
# Limit sudo to the four commands used to validate and activate the Caddyfile.
# Docker group membership is still privileged and must be restricted to deploy operators.
cat > /etc/sudoers.d/$DEPLOY_USER <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/caddy validate --config * --adapter caddyfile, /usr/bin/install -m 0644 * /etc/caddy/Caddyfile, /usr/bin/systemctl reload-or-restart caddy, /usr/bin/systemctl restart caddy
EOF
chmod 440 /etc/sudoers.d/$DEPLOY_USER
visudo -cf /etc/sudoers.d/$DEPLOY_USER



# ── 4. Firewall ──────────────────────────────────────────────────
echo "[4/8] Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# ── 5. Swap (important for 4GB RAM VPS) ──────────────────────────
echo "[5/8] Configuring swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  echo "  → 2GB swap created."
else
  echo "  → Swap already exists, skipping."
fi

# ── 6. Install Caddy ─────────────────────────────────────────────
echo "[6/8] Installing Caddy..."
if ! command -v caddy &>/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  echo "  → Caddy installed."
else
  echo "  → Caddy already installed, skipping."
fi

# ── 7. App directory ─────────────────────────────────────────────
echo "[7/8] Creating application directory..."
mkdir -p "$APP_DIR"
# A previous installation may have root-owned files. The deploy operator must
# be able to create versioned release directories and update the active link.
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
touch /var/log/barber-deploy.log
chown "$DEPLOY_USER:$DEPLOY_USER" /var/log/barber-deploy.log
chmod 0640 /var/log/barber-deploy.log

# ── 8. Docker log rotation ───────────────────────────────────────
echo "[8/8] Configuring Docker log rotation..."
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

echo ""
echo "══════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Add SSH key for '$DEPLOY_USER'"
echo "  2. Create $APP_DIR/.env.production with production values"
echo "  3. Verify Docker Compose, Caddy and deploy log permissions"
echo "  4. Deploy a successful Foundation CI release artifact"
echo "══════════════════════════════════════════════════"
