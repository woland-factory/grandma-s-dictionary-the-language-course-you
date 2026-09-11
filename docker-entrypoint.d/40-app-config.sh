#!/bin/sh
# Runs at container start (nginx:alpine executes /docker-entrypoint.d/*.sh
# before nginx). Writes config.js from environment so one image serves any
# deployment without a rebuild. Missing vars become empty strings, which the
# app treats as "channel off".
set -eu

OUT="/usr/share/nginx/html/config.js"

# Escape backslashes and double quotes so values are valid JS string literals.
esc() {
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > "$OUT" <<EOF
window.__APP_CONFIG__ = {
  SEED_DEMO: "$(esc "${SEED_DEMO:-}")",
  UMAMI_URL: "$(esc "${UMAMI_URL:-}")",
  UMAMI_WEBSITE_ID: "$(esc "${UMAMI_WEBSITE_ID:-}")",
  SENTRY_DSN: "$(esc "${SENTRY_DSN:-}")"
};
EOF
