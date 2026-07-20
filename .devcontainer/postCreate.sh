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

# ─── Terminal CLIs for Drive's PTY panes ────────────────────────────────
# These are what the real-shell terminal panes (Drive UI) and the tmux free
# terminals are meant to run. They live in the ephemeral overlay FS (nvm's
# global bin), NOT under /workspaces — so they survive a Codespace stop/start
# but are WIPED on a container rebuild/recreate. Installing them here makes
# them permanent: every rebuild restores them (including the rebuild that
# first applies this devcontainer). All three ship a binary via an npm global
# (opencode's npm package is `opencode-ai`), so no curl|bash installer needed.
# A single flaky install must not abort postCreate, so each is non-fatal.
install_cli() {
  local pkg="$1" bin="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    echo "postCreate: $bin already present ($(command -v "$bin"))"
    return 0
  fi
  echo "postCreate: installing $pkg (provides '$bin')…"
  npm install -g "$pkg" >/dev/null 2>&1 \
    && echo "postCreate: $bin ready ($(command -v "$bin" 2>/dev/null || echo 'installed'))" \
    || echo "postCreate: WARN could not install $pkg — install it manually with 'npm i -g $pkg'"
}
install_cli "@google/gemini-cli" "gemini"
install_cli "freebuff"           "freebuff"
install_cli "opencode-ai"        "opencode"
