# Running Claude Code in tmux

Why bother: tmux keeps a Claude Code session alive independent of your
terminal window or SSH connection. Close your laptop, lose your connection,
switch machines — reattach and the conversation, scrollback, and any
long-running command Claude started are all still there.

This project ships a small, self-contained tmux setup for that:

| File                        | What it is                                              |
|------------------------------|----------------------------------------------------------|
| `tmux/claude.tmux.conf`      | tmux settings tuned for Claude Code's TUI                |
| `scripts/claude-tmux.sh`     | Launcher — creates/attaches to a ready-made session       |

Neither touches `~/.tmux.conf`. If you already have your own tmux config
and just want the settings, skip to [Using it without the
script](#using-it-without-the-script) below.

## Prerequisites

- tmux (tested with 3.6; anything 3.2+ should work — `extended-keys` needs 3.2+)
- The `claude` CLI installed and authenticated (`claude --version` should print something)

## Quick start

```bash
scripts/claude-tmux.sh
```

First run creates a session named `degiro` with three windows and attaches
to it:

| Window   | Runs                | Purpose                              |
|----------|---------------------|----------------------------------------|
| `claude` | `claude`             | The Claude Code CLI, ready to prompt   |
| `dev`    | `npm run dev`        | The Next.js dev server                 |
| `shell`  | (empty)              | Plain shell — git, ad-hoc commands     |

Run it again (from any terminal, any machine on this box, any SSH session)
and it just attaches to the same session instead of creating a new one — you
land back exactly where you left off.

To detach without stopping anything: `prefix` + `d` (prefix is tmux's
default, `Ctrl-b`, unless you've remapped it elsewhere).

To run more than one of these side by side (e.g. a second checkout, or a
second unrelated task), pass a different session name:

```bash
scripts/claude-tmux.sh degiro-bugfix
```

## What the config actually changes

`tmux/claude.tmux.conf` is deliberately narrow — it only touches things that
matter for running a TUI app like Claude Code well:

- **`escape-time 0`** — tmux normally waits ~500ms after Esc to see if it's
  the start of an escape sequence, before passing it through. Claude Code
  uses a bare Esc to interrupt/cancel; the default delay makes that feel
  laggy. Setting it to 0 makes Esc instant.
- **`default-terminal tmux-256color` + `terminal-overrides ",*:Tc"`** — true
  color support, so Claude Code's TUI renders with the colors it intends
  instead of a degraded 256-color approximation.
- **`extended-keys on` + `terminal-features 'xterm*:extkeys'`** — lets
  modified keys (e.g. Shift+Enter for a newline instead of submitting)
  reach Claude Code instead of being swallowed by tmux. This only works if
  your *terminal emulator* also sends those extended sequences — see
  [Troubleshooting](#troubleshooting) below.
- **`focus-events on`** — some TUI redraw logic depends on knowing when a
  pane gains/loses focus (e.g. when you click to a different pane).
- **`allow-passthrough on`** — required for terminal capability queries and
  OSC52 clipboard writes to pass through tmux instead of being blocked.
- **`mouse on`**, **`set-clipboard on`**, **`history-limit 100000`** — mouse
  to scroll/select/switch panes, selections sync to the system clipboard,
  and a much longer scrollback than tmux's 2000-line default since Claude
  Code transcripts get long.
- **`pane-border-status top`** — labels each pane so it's clear which one is
  which when a window has more than one.
- **prefix + `C`** (capital) — opens a new window running `claude`. Doesn't
  collide with the default prefix + `c` (new empty window).

## Using it without the script

Source the config into any existing tmux session:

```bash
tmux source-file tmux/claude.tmux.conf
```

**Caveat:** tmux only applies a config file passed via `-f` at the moment a
new *server* starts. If a tmux server is already running (check with `tmux
ls`), starting a "new" session on that same server won't pick up `-f`
settings — you have to `source-file` them in explicitly, which is why
`scripts/claude-tmux.sh` always does both. This tripped up testing this
exact setup: a session created with `tmux -f tmux/claude.tmux.conf
new-session ...` on a box that already had unrelated tmux sessions running
silently ignored the file until `source-file` was run.

To load it globally for every tmux session you start on this machine, add
to `~/.tmux.conf`:

```tmux
source-file /path/to/degiro/tmux/claude.tmux.conf
```

## Common workflows

**Reattach after a dropped SSH connection**
```bash
scripts/claude-tmux.sh
```
Nothing was lost — Claude Code and `npm run dev` kept running server-side
the whole time you were disconnected.

**Check on it from a second terminal while it works**
Open another terminal (or SSH session) and run the same command — tmux
supports multiple simultaneous attachments to one session, so you can watch
Claude work in real time from a second window without detaching the first.

**See the dev server logs while talking to Claude**
`prefix` + `w` opens tmux's window picker, or just `prefix` + `1`/`2`/`3` to
jump straight to a window by number. `prefix` + `n`/`p` for next/previous.

**Kill everything and start clean**
```bash
tmux kill-session -t degiro
```

## Troubleshooting

- **Shift+Enter doesn't insert a newline, it submits** — this is a terminal
  emulator limitation, not tmux. `extended-keys` only helps if the terminal
  sends the modified-key sequence in the first place. Confirm your terminal
  supports it (iTerm2, WezTerm, kitty, and recent GNOME Terminal/VTE do;
  some others don't) or use Claude Code's alternate newline binding
  (`\` + Enter works everywhere).
- **Colors look wrong / washed out** — check `echo $TERM` *inside* tmux; it
  should read `tmux-256color`. If your terminal emulator itself doesn't
  advertise truecolor, set `TERM=xterm-256color` before starting tmux, or
  check your terminal's color-support settings.
- **Mouse selection copies tmux's copy-mode buffer instead of doing normal
  OS text selection** — hold `Shift` while dragging to bypass tmux's mouse
  capture and select natively (most terminals honor this).
- **`scripts/claude-tmux.sh` attaches but the settings from the "What the
  config changes" section don't seem active** — you're likely joining a
  tmux server that was started before this config existed. Run `tmux
  source-file tmux/claude.tmux.conf` manually once; the script does this
  automatically on every run, so it's only a problem when bypassing the
  script.
