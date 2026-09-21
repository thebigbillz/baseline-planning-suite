#!/bin/sh
# Runs when the shell's container starts. This is the only place remote URLs
# exist: they come from the container's environment, never from a bundle.
set -e
[ "$ROLE" = "shell" ] || exit 0
cat > /usr/share/nginx/html/config.json <<JSON
{
  "remotes": {
    "people": "${PEOPLE_REMOTE_URL:-/remotes/people/remoteEntry.js}",
    "delivery": "${DELIVERY_REMOTE_URL:-/remotes/delivery/remoteEntry.js}"
  }
}
JSON
echo "shell: wrote /config.json"
cat /usr/share/nginx/html/config.json
