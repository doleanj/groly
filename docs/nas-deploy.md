# NAS deployment (fork)

How this fork runs on the Synology NAS. No secrets in this file: values live in `.env` and `watchtower.env` on the NAS.

| Item | Value |
|---|---|
| Image | `ghcr.io/doleanj/groly:edge` (built by `.github/workflows/docker.yml` on every push to `main`) |
| Project folder | `/volume1/docker/groly` (compose project `groly`, container `groly-groly-1`) |
| Compose file | a copy of `docker-compose.nas.yml` saved as `docker-compose.yml` in that folder |
| Data | `/volume1/docker/groly/data` (SQLite `groly.db`, mounted as `/app/data`) |
| Host port | `3040` (container port 3000; host port 3000 belongs to Grafana). Keep the port literal: the Container Manager wizard cannot read `${VAR}` ports |
| Web portal | `https://groly.nashome`, certificate `nashome-lan`, proxy to `http://localhost:3040` |
| Watchtower | service `watchtower` in the same compose, API on host port `8097`, `env_file: [./watchtower.env, /volume1/docker/secrets/watchtower.env]` |

Watchtower, the shared secrets file, `projects.txt` and the bridge routing follow the NAS convention described in the Toodledo tasks "NAS: shared Watchtower token + secrets map" and "RESUME POINT"; do not copy tokens into project files.

## `.env` on the NAS

```
# first start only, remove afterwards (see below)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...

ORIGIN=https://groly.nashome

# Web Push (notifications). Generate once, see below
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=https://groly.nashome

# Synology Chat events through the bridge (optional, all three or none)
GROLY_CHAT_URL=http://nashome:8283
GROLY_CHAT_CLIENT=...   # a client defined in the bridge config.json, controllers include "groly"
GROLY_CHAT_SECRET=...
```

`watchtower.env` holds the project-specific Watchtower settings only (notification URL, hostname, API endpoints).

## Push keys (VAPID)

Without keys the Settings notification switch shows "Push is not configured". Generate a pair once (the private key never leaves the NAS and your Mac):

```
node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey+'\nVAPID_PRIVATE_KEY='+k.privateKey)"
```

Run it inside the project (`npm ci` first) or in the container: `sudo docker exec -w /app groly-groly-1 node -e "..."`. Put the values in `.env`, then recreate the container. Users re-enable notifications once in Settings. The compose file passes the public key to the browser as `PUBLIC_VAPID_PUBLIC_KEY`.

## `ADMIN_PASSWORD` is first-start only

The admin account is created from `ADMIN_USERNAME` / `ADMIN_PASSWORD` only while the database has no users. Afterwards the variable does nothing but sit in the container environment (and in DSM's container details page, in clear text). Remove it from `.env` and recreate the container. The account's password is the stored hash of that first value until it is changed in the app, so change it in Settings too.

Recovery if the admin password is lost: add `ADMIN_PASSWORD_RESET=<new password>` to `.env`, recreate, log in, then remove the variable again.

## Update the compose file on the NAS

The image updates itself through Watchtower, the compose file does not. After changing `docker-compose.nas.yml` in the repo:

```
scp docker-compose.nas.yml <user>@nashome:/volume1/docker/groly/docker-compose.yml
ssh <user>@nashome
cd /volume1/docker/groly && sudo docker compose up -d
```

Prefer `docker compose` over the DSM project Stop button (it failed once). Check: `sudo docker ps --filter name=groly --format '{{.Names}} {{.Status}}'` should show `groly-groly-1` as healthy.

## Admin tasks

Ownership and membership changes have no UI: use `scripts/groly-admin.cjs` (dry run by default, backup first, header lists the commands).
