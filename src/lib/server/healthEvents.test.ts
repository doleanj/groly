import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import * as schema from '$lib/db/schema';
import {
	allSuggestions,
	buildSuggestions,
	deleteHealthEvent,
	insertHealthEvent,
	listHealthEvents,
	parseHealthEventInput,
	updateHealthEvent
} from '$lib/server/healthEvents';

type AppDatabase = typeof import('$lib/db').db;
let sqlite: Database.Database | null = null;

function createDatabase(): AppDatabase {
	sqlite = new Database(':memory:');
	sqlite.exec(`
		CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL);
		CREATE TABLE health_events (
			id TEXT PRIMARY KEY NOT NULL,
			subject TEXT NOT NULL,
			occurred_at INTEGER NOT NULL,
			symptoms TEXT NOT NULL DEFAULT '[]',
			location TEXT,
			activity TEXT,
			medicine_given INTEGER NOT NULL DEFAULT 0,
			note TEXT,
			created_by TEXT,
			client_log_id TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE UNIQUE INDEX health_events_client_log_id_unique ON health_events (created_by, client_log_id);
		INSERT INTO users VALUES ('u1', 'julien'), ('u2', 'kimmy');
	`);
	return drizzle(sqlite, { schema }) as unknown as AppDatabase;
}

afterEach(() => { sqlite?.close(); sqlite = null; });

const NOW = 1_800_000_000_000;
const ok = (body: unknown) => {
	const r = parseHealthEventInput(body, NOW);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

describe('parseHealthEventInput', () => {
	it('accepts the full event and normalises it', () => {
		const v = ok({ subject: ' Mimi ', occurredAt: NOW - 1000, symptoms: ['Cough', 'cough', ' wheeze '], location: 'living-room', activity: 'playing', medicineGiven: true, note: ' after play ', clientLogId: 'c1' });
		expect(v).toEqual({ subject: 'Mimi', occurredAt: NOW - 1000, symptoms: ['Cough', 'wheeze'], location: 'living-room', activity: 'playing', medicineGiven: true, note: 'after play', clientLogId: 'c1' });
	});

	it('defaults time to now, medicine to false and empty strings to null', () => {
		const v = ok({ subject: 'Mimi', location: '  ', activity: '' });
		expect(v.occurredAt).toBe(NOW);
		expect(v.medicineGiven).toBe(false);
		expect(v.location).toBeNull();
		expect(v.activity).toBeNull();
		expect(v.symptoms).toEqual([]);
	});

	it('rejects bad input', () => {
		const bad = (b: unknown) => parseHealthEventInput(b, NOW).ok;
		expect(bad(null)).toBe(false);
		expect(bad({})).toBe(false);
		expect(bad({ subject: 'x', occurredAt: 'yesterday' })).toBe(false);
		expect(bad({ subject: 'x', occurredAt: NOW + 3 * 24 * 3600 * 1000 })).toBe(false);
		expect(bad({ subject: 'x', symptoms: 'cough' })).toBe(false);
		expect(bad({ subject: 'x', medicineGiven: 'yes' })).toBe(false);
		expect(bad({ subject: 'x', symptoms: Array.from({ length: 11 }, (_, i) => `s${i}`) })).toBe(false);
	});
});

describe('persistence (shared household log)', () => {
	it('stores an event and lists it newest first, with who logged it, across users', () => {
		const db = createDatabase();
		insertHealthEvent(db, ok({ subject: 'Mimi', occurredAt: NOW - 5000, symptoms: ['cough'] }), 'u1', 'e1', NOW);
		insertHealthEvent(db, ok({ subject: 'Mimi', occurredAt: NOW - 1000, symptoms: ['cough', 'wheeze'], medicineGiven: true }), 'u2', 'e2', NOW);
		const events = listHealthEvents(db);
		expect(events.map((e) => e.id)).toEqual(['e2', 'e1']);
		expect(events[0].createdByUsername).toBe('kimmy');
		expect(events[0].symptoms).toEqual(['cough', 'wheeze']);
		expect(events[0].medicineGiven).toBe(true);
		expect(events[1].medicineGiven).toBe(false);
	});

	it('dedupes a retried client log id per user only', () => {
		const db = createDatabase();
		const input = ok({ subject: 'Mimi', clientLogId: 'same' });
		expect(insertHealthEvent(db, input, 'u1', 'a', NOW)).toEqual({ id: 'a', deduped: false });
		expect(insertHealthEvent(db, input, 'u1', 'b', NOW)).toEqual({ id: 'a', deduped: true });
		expect(insertHealthEvent(db, input, 'u2', 'c', NOW)).toEqual({ id: 'c', deduped: false });
		expect(listHealthEvents(db)).toHaveLength(2);
	});

	it('filters by subject and time range', () => {
		const db = createDatabase();
		insertHealthEvent(db, ok({ subject: 'Mimi', occurredAt: NOW - 3000 }), 'u1', 'a', NOW);
		insertHealthEvent(db, ok({ subject: 'Mimi', occurredAt: NOW - 1000 }), 'u1', 'b', NOW);
		insertHealthEvent(db, ok({ subject: 'Felix', occurredAt: NOW - 1000 }), 'u1', 'c', NOW);
		expect(listHealthEvents(db, { subject: 'Mimi' }).map((e) => e.id)).toEqual(['b', 'a']);
		expect(listHealthEvents(db, { from: NOW - 2000, to: NOW }).map((e) => e.id).sort()).toEqual(['b', 'c']);
	});

	it('updates and deletes, and reports a missing id', () => {
		const db = createDatabase();
		insertHealthEvent(db, ok({ subject: 'Mimi', symptoms: ['cough'] }), 'u1', 'a', NOW);
		expect(updateHealthEvent(db, 'a', ok({ subject: 'Mimi', symptoms: ['sneeze'], medicineGiven: true }), NOW + 1)).toBe(true);
		const [e] = listHealthEvents(db);
		expect(e.symptoms).toEqual(['sneeze']);
		expect(e.medicineGiven).toBe(true);
		expect(e.updatedAt).toBe(NOW + 1);
		expect(updateHealthEvent(db, 'nope', ok({ subject: 'x' }))).toBe(false);
		expect(deleteHealthEvent(db, 'a')).toBe(true);
		expect(deleteHealthEvent(db, 'a')).toBe(false);
		expect(listHealthEvents(db)).toEqual([]);
	});
});

describe('suggestions', () => {
	it('offers the seeds on a fresh install', () => {
		const s = buildSuggestions([]);
		expect(s.symptoms).toEqual(['cough']);
		expect(s.activities).toEqual(['playing']);
		expect(s.locations).toEqual(['living-room']);
		expect(s.subjects).toEqual([]);
	});

	it('ranks logged values by use, case-insensitively, keeping the seeds', () => {
		const rows = [
			{ subject: 'Mimi', symptoms: '["wheeze","cough"]', location: 'kitchen', activity: 'eating' },
			{ subject: 'Mimi', symptoms: '["Wheeze"]', location: 'kitchen', activity: null },
			{ subject: 'Felix', symptoms: '[]', location: 'bedroom', activity: 'eating' }
		];
		const s = buildSuggestions(rows);
		expect(s.subjects).toEqual(['Mimi', 'Felix']);
		expect(s.symptoms).toEqual(['wheeze', 'cough']);
		expect(s.locations).toEqual(['kitchen', 'bedroom', 'living-room']);
		expect(s.activities).toEqual(['eating', 'playing']);
	});

	it('reads from the database', () => {
		const db = createDatabase();
		insertHealthEvent(db, ok({ subject: 'Mimi', symptoms: ['hacking'], location: 'hall' }), 'u1', 'a', NOW);
		expect(allSuggestions(db).symptoms[0]).toBe('hacking');
	});
});
