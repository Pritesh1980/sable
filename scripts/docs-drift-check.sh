#!/usr/bin/env bash
# Reminds you to refresh the documentation when UI code changed but the docs didn't.
#
# Fires as a Stop hook (see .claude/settings.json) and can be run by hand:
#   bash scripts/docs-drift-check.sh
#
# Logic: if there are uncommitted changes under src/pages/ or src/components/
# (excluding Help.jsx itself) but NONE under docs/ or public/guide/, nudge.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}" || exit 0

changed=$(git status --porcelain 2>/dev/null | cut -c4-)
[ -z "$changed" ] && exit 0

ui=$(printf '%s\n' "$changed" | grep -E '^src/(pages|components)/' | grep -v '^src/pages/Help\.jsx' || true)
docs=$(printf '%s\n' "$changed" | grep -E '^(docs/|public/guide/|src/pages/Help\.jsx)' || true)

if [ -n "$ui" ] && [ -z "$docs" ]; then
  list=$(printf '%s' "$ui" | paste -sd ', ' -)
  msg="📝 Docs may be stale — UI changed but docs/ and public/guide/ did not. Update the relevant docs/NN-*.md + the SECTIONS entry in src/pages/Help.jsx and re-capture screenshots (see docs/MAINTAINING.md). Changed: ${list}"
  if [ -t 1 ]; then
    printf '%s\n' "$msg"          # manual run — plain text
  else
    printf '{"systemMessage":"%s"}\n' "$msg"   # hook — surfaced to the user
  fi
fi
exit 0
