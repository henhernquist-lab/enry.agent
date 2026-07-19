#!/usr/bin/env bash
# One-click restore for the "enry" tmux workspace.
#
#   Layout (main-vertical):
#     +----------------+-------------------+
#     |                |  1: term-1        |
#     |  0: drive-dev  +-------------------+
#     |  (pnpm dev,    |  2: term-2        |
#     |   port 8082)   +-------------------+
#     |                |  3: term-3        |
#     +----------------+-------------------+
#
# The left pane is Drive's dev server — a first-class pane, not one of the
# interchangeable slots. The three right panes are blank shells; run gemini,
# freebuff, opencode, or anything else in them.
#
# If the session already exists (e.g. after a browser reload), we just attach
# to it — tmux keeps every pane's process and scrollback alive server-side, so
# the dev server and whatever you were running come right back.
set -euo pipefail

SESSION="enry"
WINDOW="workspace"
TARGET="$SESSION:$WINDOW"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Already running? Reattach and we're done.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach-session -t "$SESSION"
fi

# --- Fresh build --------------------------------------------------------
# Pane ids (%N) are captured instead of numeric indices so the script is
# immune to whatever pane-base-index the loaded config sets.
DRIVE_PANE="$(tmux new-session -d -s "$SESSION" -n "$WINDOW" -c "$REPO_ROOT" -P -F '#{pane_id}')"

# Right column, split into three stacked shells. Each split targets the
# pane just created, so this walks down the column top-to-bottom.
TERM1_PANE="$(tmux split-window -h -t "$DRIVE_PANE" -c "$REPO_ROOT" -P -F '#{pane_id}')"
TERM2_PANE="$(tmux split-window -v -t "$TERM1_PANE" -c "$REPO_ROOT" -P -F '#{pane_id}')"
TERM3_PANE="$(tmux split-window -v -t "$TERM2_PANE" -c "$REPO_ROOT" -P -F '#{pane_id}')"

# main-vertical: lowest-indexed pane (drive) becomes the tall left column,
# the rest stack on the right. Give the dev server a bit more than half.
tmux set-window-option -t "$TARGET" main-pane-width 55%
tmux select-layout -t "$TARGET" main-vertical

# Label the panes (shown in the top border via .tmux.conf).
tmux select-pane -t "$DRIVE_PANE" -T "drive-dev"
tmux select-pane -t "$TERM1_PANE" -T "term-1"
tmux select-pane -t "$TERM2_PANE" -T "term-2"
tmux select-pane -t "$TERM3_PANE" -T "term-3"

# Start Drive's dev server in the left pane only.
tmux send-keys -t "$DRIVE_PANE" "pnpm dev" C-m

# Land the cursor on the first free terminal, not on the dev server.
tmux select-pane -t "$TERM1_PANE"

exec tmux attach-session -t "$SESSION"
