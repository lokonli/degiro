# Deployment

Runs self-hosted on `ubuntu` (the same machine this repo lives on), not on Vercel.
Reason: the Import feature (`/import`) writes updated data to `data/transactions.json`
and `data/instruments.json` on disk at runtime — Vercel's production functions have a
read-only filesystem, so imports would silently fail to persist there. A host with a
normal, persistent disk is a requirement, not a preference.

## Live URL

**https://redacted.example.com** — public, gated by Cloudflare Access (email OTP,
restricted to REDACTED_EMAIL, ~730h/30-day sessions before re-verifying).

Private fallback, tailnet-only, no login gate needed:
**https://ubuntu.REDACTED_TAILNET:8443** (only reachable from a device on the
`REDACTED_EMAIL` Tailscale tailnet).

## Processes (pm2)

Two pm2-managed processes, both saved (`pm2 save`) so they restart automatically on
reboot via the existing `pm2-redacted` systemd service:

| pm2 name        | Command                                                              | Purpose                                   |
|------------------|-----------------------------------------------------------------------|--------------------------------------------|
| `degiro`         | `npx next start -p 3311` (cwd: this repo)                            | The app itself, production build           |
| `degiro-tunnel`  | `cloudflared --no-autoupdate tunnel --config ~/.cloudflared/degiro.yml run degiro` | Cloudflare Tunnel, publishes port 3311 |

Useful commands:

```bash
pm2 list                        # status of both processes
pm2 logs degiro                 # app logs
pm2 logs degiro-tunnel          # tunnel connection logs
pm2 restart degiro              # after a new build (see "Updating" below)
pm2 restart degiro-tunnel       # rarely needed — only if the tunnel drops and doesn't self-heal
```

## Cloudflare Tunnel

- Tunnel name/ID: `degiro` / `REDACTED_TUNNEL_UUID`
- Config: `~/.cloudflared/degiro.yml` (ingress: `redacted.example.com` → `http://127.0.0.1:3311`)
- Credentials: `~/.cloudflared/REDACTED_TUNNEL_UUID.json` — do not commit or share this file; it's the tunnel's private key
- DNS: a CNAME for `redacted.example.com` was added via `cloudflared tunnel route dns <tunnel-uuid> redacted.example.com`. **Route by the tunnel's UUID, not its name** — routing by name once silently pointed the CNAME at a different, unrelated existing tunnel (`reqse`) instead.
- This is a separate tunnel from the other `*.lokies.nl` apps (`reqse`, `groei`, `termix`) rather than added to their shared tunnel, because those run under system-level systemd services this account doesn't have passwordless sudo to restart. See `infra_cloudflare_tunnels` in project memory for the fuller picture of the host's tunnel layout.

## Cloudflare Access

- Application name `degiro`, id `REDACTED_APP_ID`, in the `REDACTED_EMAIL's Account` account (`REDACTED_ACCOUNT_ID`), zone `lokies.nl` (`REDACTED_ZONE_ID`)
- One policy: allow `REDACTED_EMAIL`, identity provider is the account's existing email one-time-pin provider (same one `reqse` and `termix` use)
- Configured via the Cloudflare API using a token found in `/home/redacted/dev/reqse/.env` (`CF_API_TOKEN` / `CF_ACCOUNT_ID`) — that token belongs to the `reqse` project, not this one. No Cloudflare credentials are stored in this repo.
- To change who can access it or add a second person, edit the policy at [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → Access → Applications → `degiro`, or via the API (`PUT /accounts/{account_id}/access/apps/REDACTED_APP_ID/policies/{policy_id}`).
- `/weekvalue` is deliberately **not** gated — it's a separate, path-scoped Access application (`degiro weekvalue (public, no auth)`, id `REDACTED_APP_ID_WEEKVALUE`, domain `redacted.example.com/weekvalue`) with a single `bypass` policy. Cloudflare Access matches by longest path prefix, so this one wins over the domain-wide app for anything under `/weekvalue`. It exists so Home Assistant can poll the endpoint without an interactive login. Any new unauthenticated endpoint needs the same treatment: a new Access app scoped to its exact path with a bypass policy — don't add exceptions to the main `degiro` app's policy, that would open the whole domain.

## `/weekvalue` — public SVG endpoint for Home Assistant

Renders the portfolio value's change over the last N days as a standalone SVG
line chart, starting at €0, auto-colored green/red by direction. Meant to be
polled directly by a Home Assistant "Picture" / generic camera card.

Query params (all optional):

| Param         | Default       | Notes                                      |
|---------------|---------------|---------------------------------------------|
| `days`        | `7`           | window size, clamped to 1–3650              |
| `width`       | `600`         | px, clamped to 50–4000                       |
| `height`      | `200`         | px, clamped to 50–2000                       |
| `color`       | auto gain/green (`#1e7a4c`) or loss/red (`#b23a34`) | hex, e.g. `color=2563eb` |
| `bg`          | `transparent` | hex, or `transparent`                        |
| `strokeWidth` | `2.5`         | clamped to 0.5–20                            |
| `fill`        | `true`        | `false` to draw just the line, no gradient area |
| `padding`     | `12`          | px inset on all sides                        |

Example for a Home Assistant `picture` card: `https://redacted.example.com/weekvalue?days=7&bg=ffffff`

## Updating after a code change

```bash
cd /home/redacted/dev/degiro
git pull                # if changes came from elsewhere
npm run build
pm2 restart degiro
```

No need to touch the tunnel or Access config for a plain code change — only the app
process needs restarting.

## Data

`data/transactions.json` and `data/instruments.json` are the live database — edited
in place by `/api/import`, read at request time (not baked into the build). Back them
up before any destructive experiment; there's no separate database to fall back on.
