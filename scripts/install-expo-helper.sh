#!/usr/bin/env bash
# Installs an `expo-start` bash function into ~/.bashrc that wraps
# scripts/expo-start.sh from any directory. Idempotent: safe to re-run.
set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASHRC="$HOME/.bashrc"
MARKER="# >>> correlation-mobile expo-start helper >>>"
END_MARKER="# <<< correlation-mobile expo-start helper <<<"

if grep -qF "$MARKER" "$BASHRC" 2>/dev/null; then
  echo "expo-start helper already installed in $BASHRC"
else
  echo "Installing expo-start helper into $BASHRC..."
  cat << EOF >> "$BASHRC"

$MARKER
expo-start() {
  (cd "$REPO_DIR" && bash scripts/expo-start.sh "\$@")
}
$END_MARKER
EOF
fi

# Only affects this script's own subshell; the calling terminal must re-source.
source "$BASHRC"
echo ""
echo "Run 'source ~/.bashrc' in your current terminal (new terminals pick it up automatically)."
echo "Then use 'expo-start' or 'expo-start web' from anywhere."
