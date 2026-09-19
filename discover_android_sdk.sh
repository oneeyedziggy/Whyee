#!/usr/bin/env bash

set -e

echo "=== Auto-Discovering Android SDK in WSL ==="
echo ""

# Candidate paths for Linux/WSL and Windows hosts
CANDIDATE_PATHS=(
  "$HOME/Android/Sdk"
  "$HOME/.android/sdk"
  "/usr/local/android-sdk"
)

# Search for user directories on mounted Windows drives (/mnt/c, /mnt/d, etc.)
for drive in /mnt/[a-z]; do
  if [ -d "$drive/Users" ]; then
    for user_dir in "$drive/Users/"*; do
      username=$(basename "$user_dir")
      if [[ "$username" != "Public" && "$username" != "Default" && "$username" != "All Users" && "$username" != "desktop.ini" ]]; then
        CANDIDATE_PATHS+=("$user_dir/AppData/Local/Android/Sdk")
      fi
    done
  fi
done

FOUND_SDK=""

# Check candidate paths for existing Sdk directory with platform-tools
for path in "${CANDIDATE_PATHS[@]}"; do
  if [ -d "$path" ] && [ -d "$path/platform-tools" ]; then
    FOUND_SDK="$path"
    break
  fi
done

if [ -z "$FOUND_SDK" ]; then
  echo "Error: Could not automatically locate an Android SDK installation."
  echo "Checked locations included:"
  printf ' - %s\n' "${CANDIDATE_PATHS[@]}"
  exit 1
fi

echo "Found Android SDK at: $FOUND_SDK"
echo ""

# Check and update ~/.bashrc
BASHRC="$HOME/.bashrc"

if grep -q "ANDROID_HOME" "$BASHRC"; then
  echo "Updating existing ANDROID_HOME entries in $BASHRC..."
  sed -i '/ANDROID_HOME/d' "$BASHRC"
  sed -i '/platform-tools/d' "$BASHRC"
  sed -i '/cmdline-tools/d' "$BASHRC"
  sed -i '/emulator/d' "$BASHRC"
fi

echo "Writing environment variables to $BASHRC..."

cat << CONFIG >> "$BASHRC"

# Android SDK Settings
export ANDROID_HOME="$FOUND_SDK"
export PATH="\$PATH:\$ANDROID_HOME/platform-tools"
export PATH="\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin"
export PATH="\$PATH:\$ANDROID_HOME/emulator"
CONFIG

# Load paths into active process to verify adb
export ANDROID_HOME="$FOUND_SDK"
export PATH="$PATH:$ANDROID_HOME/platform-tools"

echo ""
echo "=== Verification ==="
echo "ANDROID_HOME=$ANDROID_HOME"

if command -v adb >/dev/null 2>&1; then
  echo -n "adb path: "
  which adb
  echo ""
  adb --version
  echo ""
  echo "SUCCESS: Auto-discovery complete and adb is working."
  echo "Run 'source ~/.bashrc' or open a new shell session to complete setup."
else
  echo "WARNING: SDK found, but 'adb' binary failed to execute from platform-tools."
fi

