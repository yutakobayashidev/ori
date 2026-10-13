#!/bin/sh
set -eu

# The named volume is shared read-only with the web app. Never print the token.
if [ ! -f "$WORKSPACE_RUNTIME_TOKEN_FILE" ]; then
  umask 077
  openssl rand -hex 32 > "$WORKSPACE_RUNTIME_TOKEN_FILE"
fi

exec "$@"
