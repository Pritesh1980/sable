#!/bin/bash
# SessionStart hook for Claude Code on the web. Makes a fresh cloud session
# match CI before any work starts: the Node major in .nvmrc (the web container
# ships an older one, which made shareTarget.test.js fail only there), and
# node_modules installed from the lockfile. Laptops manage their own Node and
# dependencies, so it does nothing outside a web session.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR"

want=$(tr -dc '0-9' < .nvmrc)
have=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)

# Download the wanted Node once into a cache (kept with the container state)
# and put it first on PATH for the session. Best effort: if nodejs.org is
# unreachable, warn and carry on with the system Node rather than block.
provision_node() {
  local dir="$HOME/.cache/sable-node/$want"
  if [ ! -x "$dir/bin/node" ]; then
    local arch version
    case "$(uname -m)" in
      x86_64) arch=x64 ;;
      aarch64 | arm64) arch=arm64 ;;
      *) echo "session-start: no Node build for $(uname -m)" >&2; return 1 ;;
    esac
    version=$(curl -fsS https://nodejs.org/dist/index.json | grep -o "\"version\":\"v$want\.[0-9.]*\"" | head -1 | cut -d'"' -f4)
    [ -n "$version" ] || { echo "session-start: no Node $want release found" >&2; return 1; }
    mkdir -p "$dir.tmp"
    curl -fsSL "https://nodejs.org/dist/$version/node-$version-linux-$arch.tar.xz" | tar -xJ -C "$dir.tmp" --strip-components=1
    rm -rf "$dir" && mv "$dir.tmp" "$dir"
  fi
  export PATH="$dir/bin:$PATH"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$dir/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
}

if [ "$have" -lt "$want" ]; then
  provision_node || echo "session-start: continuing with Node $(node -v 2>/dev/null || echo none)" >&2
fi

# npm ci, never npm install: it never rewrites package-lock.json (a different
# npm can, and an agent could commit the churn). Skipped when node_modules was
# already built from this exact lockfile and Node.
stamp=node_modules/.session-start-stamp
current="$(node -v) $(sha256sum package-lock.json | cut -d' ' -f1)"
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$current" ]; then
  npm ci --no-audit --no-fund
  echo "$current" > "$stamp"
fi
echo "session-start: Node $(node -v), dependencies ready" >&2
