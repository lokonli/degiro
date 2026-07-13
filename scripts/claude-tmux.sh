#!/usr/bin/env bash
# Starts (or attaches to) a tmux session for this project, pre-configured for
# Claude Code (see tmux/claude.tmux.conf and docs/tmux-usage.md).
#
# Usage: scripts/claude-tmux.sh [session-name]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

SESSION="${1:-degiro}"
CONF="$(pwd)/tmux/claude.tmux.conf"

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -n claude "claude"
  tmux new-window -t "$SESSION" -n dev "npm run dev"
  tmux new-window -t "$SESSION" -n shell
  tmux select-window -t "$SESSION:claude"
fi

# Re-applied every run (not just -f on new-session) because -f only takes
# effect the moment the tmux *server* starts — if a server from an earlier,
# unconfigured session is already running, new-session -f would silently
# no-op. source-file always applies it.
tmux source-file "$CONF"

exec tmux attach -t "$SESSION"
