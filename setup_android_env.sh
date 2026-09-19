#!/usr/bin/env bash

set -e

echo "=== Android SDK & ADB Setup for WSL ==="
echo ""

# 1. Prompt for SDK source location
echo "Where is your Android SDK installed?"
echo "1) Windows host (Recommended for WSL2)"
echo "2) Linux / WSL environment (/home/$USER/Android/Sdk)"
echo "3) Custom path"
read -rp "Enter choice [1-3]: " choice

case $choice in
  1)
    # Detect Windows usernames
    users=(/mnt/c/Users/*)
    echo ""
    echo "Available Windows Users:"
    i=1
    valid_users=()
    for user_path in "${users[@]}"; do
      user=$(basename "$user_path")
      if [[ "$user" != "Public" && "$user" != "Default" && "$user" != "All Users" && "$user" != "desktop.ini" ]]; then
        echo "  $i) $user"
        valid_users+=("$user")
        ((i++))
      fi
    done

    read -rp "Select your Windows username number: " user_num
    selected_user="${valid_users[$((user_num-1))]}"
    
    SDK_PATH="/mnt/c/Users/$selected_user/AppData/Local/Android/Sdk"
    ;;
  2)
    SDK_PATH="/home/$USER/Android/Sdk"
    ;;
  3)
    read -rp "Enter full path to Android SDK: " SDK_PATH
    ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

echo ""
echo "Target SDK Path: $SDK_PATH"

# 2. Verify SDK directory existence
if [ ! -d "$SDK_PATH" ]; then
  echo "Error: Directory '$SDK_PATH' does not exist."
  echo "Please verify your Android SDK installation path and try again."
  exit 1
fi

echo "SDK path verified."
echo ""

# 3. Check and update ~/.bashrc
BASHRC="$HOME/.bashrc"

if grep -q "ANDROID_HOME" "$BASHRC"; then
  echo "Notice: ANDROID_HOME is already present in $BASHRC."
  read -rp "Do you want to overwrite existing Android SDK settings? (y/N): " overwrite
  if [[ "$overwrite" =~ ^[Yy]$ ]]; then
    # Strip existing lines containing ANDROID_HOME or platform-tools
    sed -i '/ANDROID_HOME/d' "$BASHRC"
    sed -i '/platform-tools/d' "$BASHRC"
    sed -i '/cmdline-tools/d' "$BASHRC"
  else
    echo "Aborting changes to $BASHRC."
    exit 0
  fi
fi

echo "Adding environment variables to $BASHRC..."

cat << CONFIG >> "$BASHRC"

# Android SDK Settings
export ANDROID_HOME="$SDK_PATH"
export PATH="\$PATH:\$ANDROID_HOME/platform-tools"
export PATH="\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin"
export PATH="\$PATH:\$ANDROID_HOME/emulator"
CONFIG

echo "Updated $BASHRC successfully."
echo ""

# 4. Verify in current subshell
export ANDROID_HOME="$SDK_PATH"
export PATH="$PATH:$ANDROID_HOME/platform-tools"

echo "=== Verification ==="
echo "ANDROID_HOME set to: $ANDROID_HOME"

if command -v adb >/dev/null 2>&1; then
  echo -n "adb command found at: "
  which adb
  echo ""
  adb --version
  echo ""
  echo "SUCCESS: ADB is working. Run 'source ~/.bashrc' or restart your terminal to complete setup."
else
  echo "WARNING: Could not execute 'adb'. Check if 'platform-tools' exists inside: $SDK_PATH"
fi

