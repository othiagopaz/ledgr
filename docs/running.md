# Running Ledgr

There are two ways to run Ledgr locally. Both serve the backend on a
**dedicated port `:8420`** (not the common `:8080`, so it never clashes with
other projects you develop in parallel) and the frontend on `:5173`.

## 1. Persistent background service (recommended)

One front + back running in the background of your Mac, started at login,
relaunched on crash, and — importantly — **reused by the MCP** so Claude never
spawns a stray shadow backend.

```bash
scripts/ledgr install   # first time: installs the LaunchAgent and starts it
scripts/ledgr status    # show launchd state + backend/frontend health
scripts/ledgr open      # open http://localhost:5173 in your browser
scripts/ledgr logs      # tail the service log (Ctrl+C to quit)
scripts/ledgr restart   # restart both processes
scripts/ledgr stop      # stop the service (won't relaunch until start/install)
scripts/ledgr start     # start it again
scripts/ledgr link      # add a `ledgr` shortcut to your shell (see below)
scripts/ledgr unlink    # remove the shell shortcut
scripts/ledgr uninstall # remove the LaunchAgent entirely
```

### Run `ledgr` from anywhere (shell shortcut)

By default you run the tool as `scripts/ledgr <cmd>` **from the repo root**.
`install` offers to add a `ledgr` alias to your `~/.zshrc` so you can run it
from any directory as just `ledgr <cmd>`:

```
Add a 'ledgr' shortcut to ~/.zshrc so you can run it from anywhere? [Y/n]
```

You can add or remove it any time:

```bash
scripts/ledgr link      # add the alias (idempotent — safe to re-run)
source ~/.zshrc         # apply it in the current terminal (new ones get it automatically)
ledgr status            # now works from anywhere

scripts/ledgr unlink    # remove it
```

`link` writes a clearly-marked block to `~/.zshrc`; `unlink` (and `uninstall`)
removes exactly that block. To skip the prompt during install, set
`LEDGR_NO_LINK=1`.

Under the hood:

- `scripts/ledgr` manages a **LaunchAgent** (`so.brick.ledgr`) rendered from
  `scripts/so.brick.ledgr.plist` into `~/Library/LaunchAgents/`.
- The agent runs `scripts/service.sh`, which starts `uvicorn` (backend) and
  `vite` (frontend) together and tears both down if either dies, so launchd
  restarts a clean pair.
- Logs go to `~/Library/Logs/ledgr.log`.

### Configuration — `.ledgr.env`

Your ledger file path is **personal**, so it must not live in version control.
It goes in `.ledgr.env` at the repo root — a git-ignored file the service reads:

```bash
cp .ledgr.env.example .ledgr.env
# then edit .ledgr.env and set BEANCOUNT_FILE to your ledger's absolute path
```

Resolution order for the ledger file (first match wins):

1. `BEANCOUNT_FILE` set in the environment
2. `BEANCOUNT_FILE` in `.ledgr.env`
3. the bundled `data/example.beancount` (so it runs out of the box)

`.ledgr.env` can also set `LEDGR_PORT` and `LEDGR_FRONTEND_PORT`. Re-run
`scripts/ledgr restart` after changing it.

### Why this exists

Previously the only launcher was `Ledgr.command` (a Terminal window you had to
keep open), and the MCP server would **spawn its own headless backend** if none
was running. On every Claude client restart that spawn could be orphaned — the
`atexit` cleanup doesn't fire on an abrupt kill — so multiple Ledgr `uvicorn`
processes ended up running "in the dark." The persistent service fixes this:
it's always up, and the MCP simply reuses it (`LEDGR_AUTOSTART=0` by default).

## 2. Foreground dev session

For active development with backend `--reload`:

```bash
./scripts/dev.sh path/to/your-ledger.beancount
```

Or double-click `Ledgr.command`. This runs in the foreground and stops when you
close it. Don't run it at the same time as the persistent service — they'd both
try to bind `:8420`. Use `scripts/ledgr stop` first.

## Developing against the background service

The installed service runs your working-tree source directly (the LaunchAgent
points at the repo — nothing is copied). What that means when you edit code:

| You edit | Picked up by the running service |
|----------|----------------------------------|
| Frontend (`.tsx`, CSS) | Instantly — Vite HMR |
| Backend Python (`.py`) | After `ledgr restart` (or set `LEDGR_RELOAD=1`) |
| The ledger `.beancount` file | Instantly — mtime hot-reload |
| The `.plist` template | After re-running `ledgr install` |

For active **backend** development against the background service, enable
uvicorn auto-reload by setting `LEDGR_RELOAD=1` in `.ledgr.env`, then
`ledgr restart`. Backend Python edits then reload without a manual restart —
the same behaviour as `dev.sh`, but keeping the always-on service. Leave it off
for normal use so the service stays stable.

## Ledger hot-reload — no restart needed

The backend reloads the ledger automatically when the `.beancount` file changes
on disk (`backend/ledger.py::get_ledger` compares the file's mtime before each
read). So creating or editing an account — whether from the app, the MCP, or a
manual edit of the file — shows up immediately in both the app and the MCP,
**without restarting the server**.

## Settings at a glance

Set these in `.ledgr.env` (or the environment):

| Setting | Default | Purpose |
|---------|---------|---------|
| `BEANCOUNT_FILE` | `data/example.beancount` | Ledger file to load |
| `LEDGR_PORT` | `8420` | Backend port |
| `LEDGR_FRONTEND_PORT` | `5173` | Frontend port |
| `LEDGR_RELOAD` | off | `1` = backend auto-reload on Python edits (dev) |

The Vite dev-server proxy forwards `/api` to the backend port via
`VITE_API_PORT` (set automatically by `service.sh` and `dev.sh`).
