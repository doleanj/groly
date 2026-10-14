# Groly (fork) — working notes for Claude

Fork of peterthepeter/groly (SvelteKit, SQLite, PWA). `origin` = doleanj/groly, `upstream` = peterthepeter/groly.
Current state and next steps: `docs/STATE.md` (read first). House rules: `~/.claude/CLAUDE.md`.

## Commands
- Node **22** (native sqlite; other versions fail to build or test).
- `npm test` (vitest), `npm run check` (svelte-check), `npm run build`. All three must pass before proposing a merge.
- Throwaway local instance for end-to-end tests: `node scripts/seed-dev-data.mjs`, then `npm run dev`. Never test against the NAS database.

## Fork rules
- Own code goes in new files with small hooks into upstream files, so `upstream/main` merges stay easy. Leave `src/lib/changelog.ts` (upstream's) untouched.
- Changelog: every behaviour-changing PR adds a de + en entry to `src/lib/changelogFork.ts` ("My changes" in the changelog window).
- gh: always `-R doleanj/groly`.
- The shared pet log (`/tracker/pet`, table `health_events`) is visible to all users on purpose.

## Release and NAS
- Push to main → `.github/workflows/docker.yml` builds `ghcr.io/doleanj/groly:edge` + a `build-<date>-<sha>` pre-release → Watchtower (host port 8097) redeploys.
- NAS compose is `docker-compose.nas.yml` (copied to `/volume1/docker/groly/docker-compose.yml`); host port 3040, portal https://groly.nashome. Details: `docs/nas-deploy.md`.
- Data fixes on the NAS: `scripts/groly-admin.cjs` (CHECK mode first, backup before writing); the user runs it.
- Chat events go through the synology-chat-webhook bridge (controller `groly`, env `GROLY_CHAT_URL/CLIENT/SECRET`).
