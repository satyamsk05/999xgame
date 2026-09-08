#!/usr/bin/env bash
set -Eeuo pipefail

# Run this script on a fresh Ubuntu EC2 instance from the repository root.
# It intentionally installs only the low-cost/free-tier-friendly pieces:
# Docker Engine + Compose. PostgreSQL and Redis run as local containers.

REPO_DIR="${REPO_DIR:-$HOME/999xgame}"
STACK_DIR="$REPO_DIR/infrastructure/aws-free"
ENV_FILE="$STACK_DIR/.env.aws"

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | $SUDO sh
fi

$SUDO systemctl enable --now docker
$SUDO usermod -aG docker "$USER" || true

if [[ ! -d "$REPO_DIR/.git" ]]; then
  git clone https://github.com/satyamsk05/999xgame.git "$REPO_DIR"
else
  git -C "$REPO_DIR" pull --ff-only origin main
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$STACK_DIR/.env.aws.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo
  echo "Created $ENV_FILE"
  echo "Edit it before starting the backend:"
  echo "  nano $ENV_FILE"
  echo
  echo "Set POSTGRES_PASSWORD, JWT_SECRET, ADMIN_JWT_SECRET and CORS_ORIGIN."
  exit 0
fi

cd "$STACK_DIR"

echo "Building and starting 999xgame..."
$SUDO docker compose --env-file "$ENV_FILE" -f docker-compose.aws.yml up -d --build

echo
$SUDO docker compose --env-file "$ENV_FILE" -f docker-compose.aws.yml ps

echo
if curl -fsS http://127.0.0.1:5050/ready >/dev/null 2>&1; then
  echo "Backend readiness: OK"
else
  echo "Backend readiness: not reachable on host port 5050 (expected if no host port is published)."
  echo "Use: docker compose --env-file $ENV_FILE -f $STACK_DIR/docker-compose.aws.yml logs backend"
fi

echo
 echo "Next: put Nginx in front of the backend and configure HTTPS for your domain."
