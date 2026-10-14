// Transfer ownership of every list owned by one Groly user to another. Groly has no UI for this.
//
// Run INSIDE the groly container, as the node user (so the SQLite files keep the right owner).
// Default is a dry run that only prints the plan. Nothing is changed without APPLY=1.
//
//   1. copy this file next to the database on the NAS:  /volume1/docker/groly/data/transfer-list-ownership.cjs
//      (that folder is mounted in the container as /app/data)
//   2. dry run:
//        sudo docker exec -w /app groly-groly-1 su-exec node env FROM=admin TO=julien node /app/data/transfer-list-ownership.cjs
//   3. apply (takes a consistent backup first: groly.db.bak-<timestamp> in the same folder):
//        sudo docker exec -w /app groly-groly-1 su-exec node env FROM=admin TO=julien APPLY=1 node /app/data/transfer-list-ownership.cjs
//
// Diagnose (read-only, no FROM/TO needed): prints every list with its owner and members and flags anomalies, notably an owner who
// is ALSO a member of the same list (the app then returns that list twice, once as owned and once as shared, and the shared copy
// hides the edit and share controls):
//        sudo docker exec -w /app groly-groly-1 su-exec node env CHECK=1 node /app/data/transfer-list-ownership.cjs
// Repair that case (backup first, only deletes member rows where the member IS the list owner):
//        sudo docker exec -w /app groly-groly-1 su-exec node env CHECK=1 FIX_OWNER_MEMBERSHIPS=1 APPLY=1 node /app/data/transfer-list-ownership.cjs
//
// Optional: KEEP_OLD_AS_MEMBER=1 adds the previous owner back as a member with write access on each list.
// Usernames are matched case-insensitively and must resolve to exactly one user each. Passwords are never read or printed.
// Only lists.owner_id changes (plus updated_at, in seconds like the app). Items, history, trackers and recipes stay as they are.

const Database = require(process.env.BETTER_SQLITE3 || '/app/node_modules/better-sqlite3');

const dbPath = process.env.DATABASE_URL || '/app/data/groly.db';
const fromName = (process.env.FROM || '').trim();
const toName = (process.env.TO || '').trim();
const apply = process.env.APPLY === '1';
const keepOldAsMember = process.env.KEEP_OLD_AS_MEMBER === '1';

function fail(msg) {
	console.error('ERROR: ' + msg);
	process.exit(1);
}

const check = process.env.CHECK === '1';
const fixOwnerMemberships = process.env.FIX_OWNER_MEMBERSHIPS === '1';

if (!check && (!fromName || !toName)) fail('set FROM=<current owner username> and TO=<new owner username> (or CHECK=1 to diagnose)');
if (!check && fromName.toLowerCase() === toName.toLowerCase()) fail('FROM and TO are the same user');

const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');

if (check) {
	const rows = db.prepare(`
		SELECT l.id, l.name, l.owner_id, o.username AS owner,
		       (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id) AS items
		FROM lists l LEFT JOIN users o ON o.id = l.owner_id ORDER BY o.username, l.name`).all();
	const members = db.prepare(`
		SELECT m.list_id, m.user_id, u.username, m.permission, m.status
		FROM list_members m LEFT JOIN users u ON u.id = m.user_id`).all();
	let anomalies = 0;
	console.log(`${rows.length} list(s), ${db.prepare('SELECT COUNT(*) AS n FROM users').get().n} user(s)`);
	for (const l of rows) {
		const ms = members.filter((m) => m.list_id === l.id);
		const dup = ms.filter((m) => m.user_id === l.owner_id);
		if (dup.length) anomalies++;
		console.log(`- ${l.name}  owner=${l.owner ?? '(missing user ' + l.owner_id + ')'}  items=${l.items}  members=` +
			(ms.length ? ms.map((m) => `${m.username}:${m.permission}/${m.status}`).join(', ') : 'none') +
			(dup.length ? '   <-- ANOMALY: the owner is also a member (list shows twice, shared copy hides edit/share)' : ''));
	}
	console.log(`\nAnomalies: ${anomalies}`);
	if (!fixOwnerMemberships) process.exit(0);
	if (!apply) {
		console.log('FIX_OWNER_MEMBERSHIPS=1 is a dry run without APPLY=1: nothing changed.');
		process.exit(0);
	}
	(async () => {
		const backup = `${dbPath}.bak-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
		await db.backup(backup);
		console.log(`Backup written: ${backup}`);
		const n = db.prepare('DELETE FROM list_members WHERE user_id = (SELECT owner_id FROM lists WHERE lists.id = list_members.list_id)').run().changes;
		console.log(`Removed ${n} owner membership row(s).`);
	})().catch((e) => fail(e.message));
	return;
}

function resolveUser(name) {
	const rows = db.prepare('SELECT id, username, role FROM users WHERE lower(username) = lower(?)').all(name);
	if (rows.length !== 1) fail(`username "${name}" matched ${rows.length} users; known users: ` + db.prepare('SELECT username, role FROM users ORDER BY username').all().map((u) => `${u.username} (${u.role})`).join(', '));
	return rows[0];
}

const from = resolveUser(fromName);
const to = resolveUser(toName);

const lists = db.prepare(`
	SELECT l.id, l.name,
	       (SELECT COUNT(*) FROM list_members m WHERE m.list_id = l.id) AS members,
	       (SELECT COUNT(*) FROM list_members m WHERE m.list_id = l.id AND m.user_id = ?) AS target_is_member
	FROM lists l WHERE l.owner_id = ? ORDER BY l.name`).all(to.id, from.id);

console.log(`From: ${from.username} (${from.role})   To: ${to.username} (${to.role})`);
console.log(`Lists owned by ${from.username}: ${lists.length}`);
for (const l of lists) {
	console.log(`  - ${l.name}  [${l.members} member(s)${l.target_is_member ? `; ${to.username} is already a member: that row is removed, they become the owner` : ''}]`);
}
if (!lists.length) {
	console.log('Nothing to transfer.');
	process.exit(0);
}
if (!apply) {
	console.log('\nDRY RUN: nothing was changed. Re-run with APPLY=1 to transfer (a backup is taken first).');
	process.exit(0);
}

(async () => {
	const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
	const backup = `${dbPath}.bak-${stamp}`;
	await db.backup(backup);
	console.log(`\nBackup written: ${backup}`);

	const ts = Math.floor(Date.now() / 1000);
	const dropTargetMember = db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?');
	const setOwner = db.prepare('UPDATE lists SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?');
	const addMember = db.prepare("INSERT INTO list_members (list_id, user_id, permission, status, notifications_enabled) VALUES (?, ?, 'write', 'accepted', 1)");

	const moved = db.transaction(() => {
		let n = 0;
		for (const l of lists) {
			dropTargetMember.run(l.id, to.id);
			n += setOwner.run(to.id, ts, l.id, from.id).changes;
			if (keepOldAsMember) {
				dropTargetMember.run(l.id, from.id);
				addMember.run(l.id, from.id);
			}
		}
		return n;
	})();

	const left = db.prepare('SELECT COUNT(*) AS n FROM lists WHERE owner_id = ?').get(from.id).n;
	const now = db.prepare('SELECT COUNT(*) AS n FROM lists WHERE owner_id = ?').get(to.id).n;
	console.log(`Transferred ${moved} list(s). ${from.username} now owns ${left}, ${to.username} owns ${now}.`);
	console.log('To undo: stop the container, copy the backup file back over groly.db, start it again.');
})().catch((e) => fail(e.message));
