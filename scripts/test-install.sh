#!/bin/bash
# Tests for the bash installer (install) against a fake HOME with stub
# agents: where it finds the Claude desktop app's bundled runtime, and the
# hand-over to install.ps1 under Git Bash. install.ps1 has its own tests:
# scripts/test-install-ps1.ps1.
#
#   bash scripts/test-install.sh
set -uo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
FAILED=0
CASE=""

check() {  # check DESCRIPTION COMMAND...
  local what=$1
  shift
  if "$@"; then
    printf '  ok   %s\n' "$what"
  else
    printf '  FAIL %s\n' "$what"
    FAILED=$((FAILED + 1))
  fi
}
case_() { CASE=$1; printf '\n%s\n' "$1"; }

# A fake claude: logs each call (with the path it ran from) and keeps one
# MCP server and the plugin list in $STATE.
stub_claude() {  # stub_claude PATH
  mkdir -p "$(dirname "$1")"
  cat >"$1" <<'EOF'
#!/bin/sh
echo "$0 $*" >>"$STATE/calls.log"
case "$1 $2" in
  "mcp get") [ -f "$STATE/mcp" ] && { cat "$STATE/mcp"; exit 0; }; exit 1 ;;
  "mcp list") cat "$STATE/mcp" 2>/dev/null; exit 0 ;;
  "mcp add") for a; do url=$a; done; echo "spawnpoint: $url" >"$STATE/mcp"; exit 0 ;;
  "plugin list") cat "$STATE/plugins" 2>/dev/null; exit 0 ;;
  "plugin install") echo "$3" >>"$STATE/plugins"; exit 0 ;;
esac
exit 0
EOF
  chmod 755 "$1"
}

new_machine() {
  M="$ROOT/$RANDOM$RANDOM"
  export HOME="$M/home" STATE="$M/state"
  BIN="$M/bin"
  mkdir -p "$HOME" "$STATE" "$BIN"
}

run_install() {  # run_install [VAR=VALUE...]: output in $OUT, status in $CODE
  OUT=$(env PATH="$BIN:/usr/bin:/bin" NO_COLOR=1 SPAWNPOINT_URL=http://127.0.0.1:9 "$@" bash "$REPO/install" 2>&1)
  CODE=$?
}

APP="Library/Application Support/Claude/claude-code"
MCP="http://127.0.0.1:9/mcp"

case_ "the Claude app's runtime under a build id (Claude Code 2.1.321 and later)"
new_machine
stub_claude "$HOME/$APP/2.1.99/claude.app/Contents/MacOS/claude"
stub_claude "$HOME/$APP/2.1.321/aaaaaaaaaaaa/claude.app/Contents/MacOS/claude"
stub_claude "$HOME/$APP/2.1.321/bbbbbbbbbbbb/claude.app/Contents/MacOS/claude"
touch -t 202601010000 "$HOME/$APP/2.1.321/aaaaaaaaaaaa/claude.app/Contents/MacOS/claude"
run_install SPAWNPOINT_AGENT=claude
check "exits 0 (got $CODE)" [ "$CODE" -eq 0 ]
check "says it uses the app's runtime" grep -q "using the desktop app's bundled runtime" <<<"$OUT"
check "runs the newest build of the newest version" grep -q "2.1.321/bbbbbbbbbbbb/" "$STATE/calls.log"
check "never the older build or version" bash -c "! grep -q -e aaaaaaaaaaaa -e 2.1.99 '$STATE/calls.log'"
check "registers spawnpoint" grep -q "$MCP" "$STATE/mcp"
check "the app sign-in step" grep -q "Claude app:   restart it" <<<"$OUT"

case_ "the Claude app's runtime without a build id"
new_machine
stub_claude "$HOME/$APP/2.1.227/claude.app/Contents/MacOS/claude"
run_install SPAWNPOINT_AGENT=claude
check "exits 0 (got $CODE)" [ "$CODE" -eq 0 ]
check "registers spawnpoint through it" grep -q "$MCP" "$STATE/mcp"

case_ "Git Bash hands over to install.ps1"
new_machine
printf '#!/bin/sh\necho MINGW64_NT-10.0-26100\n' >"$BIN/uname"
cat >"$BIN/powershell.exe" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >"$STATE/ps.args"
printf '%s\n' "$SPAWNPOINT_AGENT $SPAWNPOINT_TEAM" >"$STATE/ps.env"
exit 7
EOF
chmod 755 "$BIN/uname" "$BIN/powershell.exe"
stub_claude "$BIN/claude"
run_install SPAWNPOINT_AGENT=codex SPAWNPOINT_TEAM=spi_x
check "exits with the PowerShell installer's status (got $CODE)" [ "$CODE" -eq 7 ]
check "runs install.ps1, exiting 1 if it cannot fetch it" grep -q "LASTEXITCODE = 1.*irm https://getspawnpoint.com/install.ps1 -ErrorAction Stop | iex" "$STATE/ps.args"
check "passes the SPAWNPOINT_* variables on" grep -q "^codex spi_x$" "$STATE/ps.env"
check "wires nothing itself" [ ! -f "$STATE/calls.log" ]

case_ "a Windows shell with no powershell.exe"
new_machine
printf '#!/bin/sh\necho MSYS_NT-10.0\n' >"$BIN/uname"
chmod 755 "$BIN/uname"
run_install
check "exits 1 (got $CODE)" [ "$CODE" -eq 1 ]
check "points at install.ps1" grep -q "run this in PowerShell instead: irm https://getspawnpoint.com/install.ps1 | iex" <<<"$OUT"

printf '\n'
if [ "$FAILED" -gt 0 ]; then
  printf '%d failed\n' "$FAILED"
  exit 1
fi
printf 'all passed\n'
