#!/usr/bin/env bash
#
# redeploy.sh — rebuild the projektXD add-on and redeploy it into the running
# Thunderbird dev container as a permanent (side-loaded) extension, then restart
# Thunderbird so the new build is picked up.
#
# Why: once the add-on is installed permanently (stable extension UUID), its
# storage.local (the configured URL / credentials) survives Thunderbird
# restarts — unlike a temporary add-on, whose storage is dropped on restart.
# The trade-off is that permanent installs have no "Reload" button, so a code
# change needs: rebuild -> replace the xpi in the profile -> restart. That is
# exactly what this script automates.
#
# Prereqs:
#   - docker compose stack is defined (service "thunderbird").
#   - The add-on was side-loaded once already (this script also (re)creates the
#     xpi, so a first run works too, as long as the profile exists).
#   - For the unsigned add-on to load, the profile's user.js sets
#     extensions.autoDisableScopes=0 (already done during setup).
#
# Usage:
#   ./redeploy.sh                 # build + redeploy + restart
#   TB_CONTAINER=name ./redeploy.sh   # override the container name
#
set -euo pipefail

cd "$(dirname "$0")"

CONTAINER="${TB_CONTAINER:-thunderbird_projektxd_addon}"
SERVICE="${TB_SERVICE:-thunderbird}"
ADDON_ID="projektxd@pegenau.de"

echo "==> Building (npx grunt) ..."
npx grunt

# Pick the freshest built xpi.
XPI="$(ls -t built/projektXD-*.xpi 2>/dev/null | head -n1 || true)"
if [ -z "${XPI:-}" ] || [ ! -f "$XPI" ]; then
  echo "!! No built xpi found under built/ — did the build fail?" >&2
  exit 1
fi
echo "==> Built: $XPI"

# Make sure the container is running.
if ! docker compose ps --status running 2>/dev/null | grep -q "$CONTAINER"; then
  echo "==> Container not running — starting it ..."
  docker compose up -d
  sleep 3
fi

# Detect the active Thunderbird profile: the install-specific default in
# profiles.ini (a "Default=<path>.default…" line); fall back to the newest
# *.default* directory.
PROFILE="$(docker compose exec -T "$SERVICE" sh -c \
  "grep -E '^Default=.*\\.default' /data/.thunderbird/profiles.ini 2>/dev/null | head -n1 | cut -d= -f2" \
  | tr -d '\r\n' || true)"
if [ -z "${PROFILE:-}" ]; then
  PROFILE="$(docker compose exec -T "$SERVICE" sh -c \
    'ls -1dt /data/.thunderbird/*.default* 2>/dev/null | head -n1 | xargs -r basename' \
    | tr -d '\r\n' || true)"
fi
if [ -z "${PROFILE:-}" ]; then
  echo "!! Could not detect a Thunderbird profile under /data/.thunderbird" >&2
  exit 1
fi
PROFDIR="/data/.thunderbird/$PROFILE"
echo "==> Target profile: $PROFDIR"

echo "==> Copying xpi into the profile ..."
docker compose exec -T "$SERVICE" sh -c "mkdir -p '$PROFDIR/extensions'"
docker cp "$XPI" "$CONTAINER:$PROFDIR/extensions/$ADDON_ID.xpi"
docker compose exec -T "$SERVICE" sh -c "chown app:app '$PROFDIR/extensions/$ADDON_ID.xpi'"

echo "==> Restarting Thunderbird (container) ..."
docker compose restart

echo
echo "==> Done. The add-on is redeployed permanently."
echo "    Reconnect noVNC at http://127.0.0.1:8080 (dismiss the debugger dialog),"
echo "    your projektXD settings are preserved across the restart."