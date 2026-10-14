// Groly admin tool for the SQLite database: list ownership, item ownership and list membership. Groly has no UI for these.
// Every command is a dry run unless APPLY=1 is given; APPLY=1 takes a consistent backup first and runs in one transaction.
// Passwords are never read or printed. Each command is a small function over the database, so an HTTP admin API can reuse them later.
//
// Run INSIDE the groly container as the node user (so the SQLite files keep the right owner). Copy this file to
// /volume1/docker/groly/data/ on the NAS (mounted as /app/data), then:
//
//   RUN="sudo docker exec -w /app groly-groly-1 su-exec node node /app/data/groly-admin.cjs"
//
//   $RUN check                                              read-only: every list with owner, members, items per creator, anomalies
//   $RUN transfer FROM=admin TO=Julien [KEEP_OLD_AS_MEMBER=1] [APPLY=1]
//                                                           move every list owned by FROM to TO
//   $RUN reassign-items FROM=admin TO=Julien [ITEM_HISTORY=1] [ALL_LISTS=1] [APPLY=1]
//                                                           items created by FROM in lists owned by TO become TO's;
//                                                           ITEM_HISTORY=1 also merges FROM's suggestion history into TO's
//   $RUN add-member OWNER=Julien MEMBER=kimmy [PERMISSION=write|read] [MEMBER_STATUS=accepted|pending] [LISTS="Lidl,Leclerc"] [APPLY=1]
//                                                           add (or update) MEMBER on every list owned by OWNER;
//                                                           pending = an invitation she must accept in the app
//   $RUN fix-owner-memberships [APPLY=1]                    delete member rows where the member IS the list owner
//
// KEY=VALUE arguments go after the command. Usernames are matched case-insensitively and must resolve to exactly one user.

const Database = require(process.env.BETTER_SQLITE3 || '/app/node_modules/better-sqlite3');

const dbPath = process.env.DATABASE_URL || '/app/data/groly.db';

function fail(msg) {
	console.error('ERROR: ' + msg);
	process.exit(1);
}

const [, , command, ...rest] = process.argv;
const args = {};
for (const a of rest) {
	const m = /^([A-Z_]+)=(.*)$/.exec(a);
	if (!m) fail(`unexpected argument "${a}" (use KEY=VALUE after the command)`);
	args[m[1]] = m[2].trim();
}
const apply = args.APPLY === '1';
const flag = (k) => args[k] === '1';

const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');

function resolveUser(name, label) {
	if (!name) fail(`${label}=<username> is required`);
	const rows = db.prepare('SELECT id, username, role FROM users WHERE lower(username) = lower(?)').all(name);
	if (rows.length !== 1) {
		fail(`${label} "${name}" matched ${rows.length} users; known users: ` +
			db.prepare('SELECT username, role FROM users ORDER BY username').all().map((u) => `${u.username} (${u.role})`).join(', '));
	}
	return rows[0];
}

const ownedLists = (ownerId) => db.prepare(`
	SELECT l.id, l.name,
	       (SELECT COUNT(*) FROM list_members m WHERE m.list_id = l.id) AS members
	FROM lists l WHERE l.owner_id = ? ORDER BY l.name`).all(ownerId);

// Each command returns { lines, changes, run }: lines describe the plan, run() performs it (inside a transaction) and returns a summary.
const commands = {
	check() {
		const rows = db.prepare(`
			SELECT l.id, l.name, l.owner_id, o.username AS owner FROM lists l
			LEFT JOIN users o ON o.id = l.owner_id ORDER BY o.username, l.name`).all();
		const members = db.prepare(`
			SELECT m.list_id, m.user_id, u.username, m.permission, m.status
			FROM list_members m LEFT JOIN users u ON u.id = m.user_id`).all();
		const itemsBy = db.prepare(`
			SELECT i.list_id, COALESCE(u.username, '(none)') AS creator, COUNT(*) AS n
			FROM items i LEFT JOIN users u ON u.id = i.created_by GROUP BY i.list_id, i.created_by`).all();
		let anomalies = 0;
		const lines = [`${rows.length} list(s), ${db.prepare('SELECT COUNT(*) AS n FROM users').get().n} user(s)`];
		for (const l of rows) {
			const ms = members.filter((m) => m.list_id === l.id);
			const dup = ms.some((m) => m.user_id === l.owner_id);
			const its = itemsBy.filter((i) => i.list_id === l.id);
			if (dup) anomalies++;
			lines.push(`- ${l.name}  owner=${l.owner ?? '(missing user ' + l.owner_id + ')'}` +
				`  items=${its.length ? its.map((i) => `${i.creator}:${i.n}`).join(',') : 'none'}` +
				`  members=${ms.length ? ms.map((m) => `${m.username}:${m.permission}/${m.status}`).join(', ') : 'none'}` +
				(dup ? '   <-- ANOMALY: the owner is also a member (list shows twice, the shared copy hides edit/share)' : ''));
		}
		lines.push(`Anomalies: ${anomalies}`);
		return { lines, changes: 0, run: () => '' };
	},

	transfer() {
		const from = resolveUser(args.FROM, 'FROM');
		const to = resolveUser(args.TO, 'TO');
		if (from.id === to.id) fail('FROM and TO are the same user');
		const keep = flag('KEEP_OLD_AS_MEMBER');
		const lists = ownedLists(from.id);
		const lines = [`From: ${from.username} (${from.role})   To: ${to.username} (${to.role})`, `Lists owned by ${from.username}: ${lists.length}`];
		const isMember = db.prepare('SELECT COUNT(*) AS n FROM list_members WHERE list_id = ? AND user_id = ?');
		for (const l of lists) {
			lines.push(`  - ${l.name}  [${l.members} member(s)${isMember.get(l.id, to.id).n ? `; ${to.username} is already a member: that row is removed, they become the owner` : ''}]`);
		}
		return {
			lines, changes: lists.length,
			run() {
				const ts = Math.floor(Date.now() / 1000);
				const drop = db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?');
				const setOwner = db.prepare('UPDATE lists SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?');
				const add = db.prepare("INSERT INTO list_members (list_id, user_id, permission, status, notifications_enabled) VALUES (?, ?, 'write', 'accepted', 1)");
				let n = 0;
				for (const l of lists) {
					drop.run(l.id, to.id);
					n += setOwner.run(to.id, ts, l.id, from.id).changes;
					if (keep) { drop.run(l.id, from.id); add.run(l.id, from.id); }
				}
				return `Transferred ${n} list(s) from ${from.username} to ${to.username}.`;
			}
		};
	},

	'reassign-items'() {
		const from = resolveUser(args.FROM, 'FROM');
		const to = resolveUser(args.TO, 'TO');
		if (from.id === to.id) fail('FROM and TO are the same user');
		const all = flag('ALL_LISTS');
		const scope = all ? '' : 'AND list_id IN (SELECT id FROM lists WHERE owner_id = @to)';
		const count = db.prepare(`SELECT COUNT(*) AS n FROM items WHERE created_by = @from ${scope}`).get({ from: from.id, to: to.id }).n;
		const hist = db.prepare('SELECT COUNT(*) AS n FROM item_history WHERE user_id = ?').get(from.id).n;
		const lines = [
			`Items created by ${from.username} ${all ? 'in any list' : `in lists owned by ${to.username}`}: ${count} -> created by ${to.username}`,
			flag('ITEM_HISTORY') ? `Suggestion history: ${hist} entr(ies) of ${from.username} merged into ${to.username} (counts added) and removed from ${from.username}` : 'Suggestion history: unchanged (add ITEM_HISTORY=1 to merge it)'
		];
		return {
			lines, changes: count + (flag('ITEM_HISTORY') ? hist : 0),
			run() {
				const n = db.prepare(`UPDATE items SET created_by = @to WHERE created_by = @from ${scope}`).run({ from: from.id, to: to.id }).changes;
				let msg = `Reassigned ${n} item(s) to ${to.username}.`;
				if (flag('ITEM_HISTORY')) {
					db.prepare(`
						INSERT INTO item_history (user_id, name, use_count, last_used_at)
						SELECT @to, name, use_count, last_used_at FROM item_history WHERE user_id = @from
						ON CONFLICT (user_id, name) DO UPDATE SET
							use_count = item_history.use_count + excluded.use_count,
							last_used_at = MAX(item_history.last_used_at, excluded.last_used_at)`).run({ from: from.id, to: to.id });
					const d = db.prepare('DELETE FROM item_history WHERE user_id = ?').run(from.id).changes;
					msg += ` Merged ${d} suggestion entr(ies).`;
				}
				return msg;
			}
		};
	},

	'add-member'() {
		const owner = resolveUser(args.OWNER, 'OWNER');
		const member = resolveUser(args.MEMBER, 'MEMBER');
		if (owner.id === member.id) fail('OWNER and MEMBER are the same user');
		const permission = args.PERMISSION || 'write';
		const status = args.MEMBER_STATUS || 'accepted';
		if (!['read', 'write'].includes(permission)) fail('PERMISSION must be read or write');
		if (!['accepted', 'pending'].includes(status)) fail('MEMBER_STATUS must be accepted or pending');
		let lists = ownedLists(owner.id);
		if (args.LISTS) {
			const wanted = args.LISTS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
			const unknown = wanted.filter((w) => !lists.some((l) => l.name.toLowerCase() === w));
			if (unknown.length) fail(`no list named ${unknown.join(', ')} owned by ${owner.username}; owned: ${lists.map((l) => l.name).join(', ')}`);
			lists = lists.filter((l) => wanted.includes(l.name.toLowerCase()));
		}
		const existing = db.prepare('SELECT permission, status FROM list_members WHERE list_id = ? AND user_id = ?');
		const lines = [`${member.username} as ${permission}/${status} on ${lists.length} list(s) owned by ${owner.username}:`];
		for (const l of lists) {
			const e = existing.get(l.id, member.id);
			lines.push(`  - ${l.name}  ${e ? `already ${e.permission}/${e.status} -> updated` : 'added'}`);
		}
		return {
			lines, changes: lists.length,
			run() {
				const drop = db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?');
				const add = db.prepare('INSERT INTO list_members (list_id, user_id, permission, status, notifications_enabled) VALUES (?, ?, ?, ?, 1)');
				for (const l of lists) { drop.run(l.id, member.id); add.run(l.id, member.id, permission, status); }
				return `${member.username} is now ${permission}/${status} on ${lists.length} list(s) of ${owner.username}.`;
			}
		};
	},

	'fix-owner-memberships'() {
		const n = db.prepare('SELECT COUNT(*) AS n FROM list_members WHERE user_id = (SELECT owner_id FROM lists WHERE lists.id = list_members.list_id)').get().n;
		return {
			lines: [`Member rows where the member is the list owner: ${n}`], changes: n,
			run: () => `Removed ${db.prepare('DELETE FROM list_members WHERE user_id = (SELECT owner_id FROM lists WHERE lists.id = list_members.list_id)').run().changes} owner membership row(s).`
		};
	}
};

if (!command || !commands[command]) {
	fail(`usage: groly-admin.cjs <${Object.keys(commands).join('|')}> [KEY=VALUE ...] (see the header of this file)`);
}

const plan = commands[command]();
console.log(plan.lines.join('\n'));

if (command === 'check') process.exit(0);
if (!plan.changes) {
	console.log('\nNothing to change.');
	process.exit(0);
}
if (!apply) {
	console.log('\nDRY RUN: nothing was changed. Re-run with APPLY=1 to apply (a backup is taken first).');
	process.exit(0);
}

(async () => {
	const backup = `${dbPath}.bak-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;
	await db.backup(backup);
	console.log(`\nBackup written: ${backup}`);
	console.log(db.transaction(() => plan.run())());
	console.log('To undo: stop the container, copy the backup file back over groly.db, start it again.');
})().catch((e) => fail(e.message));
