# State — 2026-10-14

## Now
- Live on the NAS: step A (Chat events), step B (nearest-list geofence + radius setting), step D (shared pet log), release-notes CI, English translations, fork changelog selector, home counters fix, `groly-admin.cjs`, browser-translate opt-out. No open PRs.
- The user's six lists were moved from admin to Julien (backup `groly.db.bak-20261014082352` in `/volume1/docker/groly/data`, delete later).

## Next
- Feature freeze until after the Lisbon trip (4-9 Nov): verify, don't build.
- Small fix: "My changes" order in the changelog window (planned entry on top looks out of place).

## Waiting on the user
- Check `ADMIN_PASSWORD` is empty in the container (`grep -c '^ADMIN_PASSWORD=.'` = 0) and change the admin password in the app.
- Enable push in Settings, use the test button.

## Open decisions
- Admin API (scoped expiring tokens, /api/admin/*, dry-run transfer, backup endpoint, audit table, optional MCP wrapper): proposed, not started.
- Step C (price watch through Web-watcher): ON HOLD (2026-10-14). If it comes back, build one price-watch service shared with wine-cellar's wishlist alerts.
- Idea: WeTTY on the NAS (Toodledo 658963531, Someday).
