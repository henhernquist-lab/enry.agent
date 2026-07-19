#!/usr/bin/env bash
# Runs once after the Codespace container is created (postCreateCommand).
# Keeps the persistent tmux workspace working across rebuilds without any
# manual setup. Intentionally does NOT start tmux — launching the session is
# a deliberate action via the "Open Enry Workspace" VS Code task.
set -euo pipefail

# tmux is not part of the default universal image; install it.
if ! command -v tmux >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmux
fi

# Use the repo-tracked config as the user's global tmux config so mouse
# support, keybindings, and the status bar are consistent everywhere. A
# symlink means edits to .tmux.conf in the repo take effect immediately.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ln -sf "$REPO_ROOT/.tmux.conf" "$HOME/.tmux.conf"

echo "postCreate: tmux $(tmux -V | awk '{print $2}') ready; ~/.tmux.conf -> $REPO_ROOT/.tmux.conf"
