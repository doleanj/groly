// Shared household health-event log (e.g. a cat's coughing episodes). Pure/DB-injected so it is unit tested.
import type { db as appDb } from '$lib/db';
import { healthEvents, users } from '$lib/db/schema';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

type AppDatabase = typeof appDb;

export const LIMITS = { subject: 60, text: 100, symptom: 60, symptoms: 10, note: 1000 } as const;

/** Offered on a fresh install; the suggestions then also learn from what was logged. */
export const SEED_SUGGESTIONS = { symptoms: ['cough'], activities: ['playing'], locations: ['living-room'] } as const;

export type HealthEventInput = {
	subject: string;
	occurredAt: number;
	symptoms: string[];
	location: string | null;
	activity: string | null;
	medicineGiven: boolean;
	note: string | null;
	clientLogId: string | null;
};

type Parsed = { ok: true; value: HealthEventInput } | { ok: false; error: string };

function cleanText(v: unknown, max: number): string | null {
	if (typeof v !== 'string') return null;
	const s = v.trim();
	return s ? s.slice(0, max) : null;
}

export function parseHealthEventInput(body: unknown, nowMs: number = Date.now()): Parsed {
	if (typeof body !== 'object' || body === null) return { ok: false, error: 'JSON object expected' };
	const b = body as Record<string, unknown>;

	const subject = cleanText(b.subject, LIMITS.subject);
	if (!subject) return { ok: false, error: 'subject required' };

	let occurredAt = nowMs;
	if (b.occurredAt !== undefined && b.occurredAt !== null) {
		if (typeof b.occurredAt !== 'number' || !Number.isFinite(b.occurredAt)) return { ok: false, error: 'occurredAt must be a number (ms)' };
		occurredAt = Math.round(b.occurredAt);
		if (occurredAt > nowMs + 24 * 3600 * 1000) return { ok: false, error: 'occurredAt is in the future' };
	}

	const rawSymptoms = b.symptoms === undefined ? [] : b.symptoms;
	if (!Array.isArray(rawSymptoms)) return { ok: false, error: 'symptoms must be an array' };
	const symptoms: string[] = [];
	for (const s of rawSymptoms) {
		const c = cleanText(s, LIMITS.symptom);
		if (c && !symptoms.some((x) => x.toLowerCase() === c.toLowerCase())) symptoms.push(c);
	}
	if (symptoms.length > LIMITS.symptoms) return { ok: false, error: `at most ${LIMITS.symptoms} symptoms` };

	if (b.medicineGiven !== undefined && typeof b.medicineGiven !== 'boolean') return { ok: false, error: 'medicineGiven must be a boolean' };

	return {
		ok: true,
		value: {
			subject,
			occurredAt,
			symptoms,
			location: cleanText(b.location, LIMITS.text),
			activity: cleanText(b.activity, LIMITS.text),
			medicineGiven: b.medicineGiven === true,
			note: cleanText(b.note, LIMITS.note),
			clientLogId: cleanText(b.clientLogId, 64)
		}
	};
}

export function parseSymptoms(json: string): string[] {
	try {
		const v = JSON.parse(json);
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

type Row = typeof healthEvents.$inferSelect & { createdByUsername: string | null };

export function toApiEvent(row: Row) {
	const { symptoms, ...rest } = row;
	return { ...rest, symptoms: parseSymptoms(symptoms) };
}

function rank(values: string[], seeds: readonly string[]): string[] {
	const counts = new Map<string, { label: string; n: number }>();
	for (const v of values) {
		const key = v.toLowerCase();
		const cur = counts.get(key);
		if (cur) cur.n++;
		else counts.set(key, { label: v, n: 1 });
	}
	for (const s of seeds) if (!counts.has(s.toLowerCase())) counts.set(s.toLowerCase(), { label: s, n: 0 });
	return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((c) => c.label);
}

/** Most-used first; seeded values stay available on a fresh install. */
export function buildSuggestions(rows: Array<{ subject: string; symptoms: string; location: string | null; activity: string | null }>) {
	return {
		subjects: rank(rows.map((r) => r.subject), []),
		symptoms: rank(rows.flatMap((r) => parseSymptoms(r.symptoms)), SEED_SUGGESTIONS.symptoms),
		locations: rank(rows.flatMap((r) => (r.location ? [r.location] : [])), SEED_SUGGESTIONS.locations),
		activities: rank(rows.flatMap((r) => (r.activity ? [r.activity] : [])), SEED_SUGGESTIONS.activities)
	};
}

export function insertHealthEvent(database: AppDatabase, input: HealthEventInput, userId: string, id: string, nowMs: number = Date.now()) {
	if (input.clientLogId) {
		const existing = database
			.select({ id: healthEvents.id })
			.from(healthEvents)
			.where(and(eq(healthEvents.createdBy, userId), eq(healthEvents.clientLogId, input.clientLogId)))
			.get();
		if (existing) return { id: existing.id, deduped: true };
	}
	database.insert(healthEvents).values({
		id,
		subject: input.subject,
		occurredAt: input.occurredAt,
		symptoms: JSON.stringify(input.symptoms),
		location: input.location,
		activity: input.activity,
		medicineGiven: input.medicineGiven,
		note: input.note,
		createdBy: userId,
		clientLogId: input.clientLogId,
		createdAt: nowMs,
		updatedAt: nowMs
	}).run();
	return { id, deduped: false };
}

export function updateHealthEvent(database: AppDatabase, id: string, input: HealthEventInput, nowMs: number = Date.now()): boolean {
	const res = database.update(healthEvents).set({
		subject: input.subject,
		occurredAt: input.occurredAt,
		symptoms: JSON.stringify(input.symptoms),
		location: input.location,
		activity: input.activity,
		medicineGiven: input.medicineGiven,
		note: input.note,
		updatedAt: nowMs
	}).where(eq(healthEvents.id, id)).run();
	return res.changes > 0;
}

export function deleteHealthEvent(database: AppDatabase, id: string): boolean {
	return database.delete(healthEvents).where(eq(healthEvents.id, id)).run().changes > 0;
}

export function listHealthEvents(
	database: AppDatabase,
	filter: { subject?: string | null; from?: number | null; to?: number | null; limit?: number } = {}
) {
	const conditions = [];
	if (filter.subject) conditions.push(eq(healthEvents.subject, filter.subject));
	if (filter.from != null) conditions.push(gte(healthEvents.occurredAt, filter.from));
	if (filter.to != null) conditions.push(lte(healthEvents.occurredAt, filter.to));
	const rows = database
		.select({
			id: healthEvents.id,
			subject: healthEvents.subject,
			occurredAt: healthEvents.occurredAt,
			symptoms: healthEvents.symptoms,
			location: healthEvents.location,
			activity: healthEvents.activity,
			medicineGiven: healthEvents.medicineGiven,
			note: healthEvents.note,
			createdBy: healthEvents.createdBy,
			clientLogId: healthEvents.clientLogId,
			createdAt: healthEvents.createdAt,
			updatedAt: healthEvents.updatedAt,
			createdByUsername: users.username
		})
		.from(healthEvents)
		.leftJoin(users, eq(healthEvents.createdBy, users.id))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(healthEvents.occurredAt))
		.limit(Math.min(filter.limit ?? 500, 2000))
		.all();
	return rows.map(toApiEvent);
}

export function allSuggestions(database: AppDatabase) {
	const rows = database
		.select({ subject: healthEvents.subject, symptoms: healthEvents.symptoms, location: healthEvents.location, activity: healthEvents.activity })
		.from(healthEvents)
		.orderBy(desc(healthEvents.occurredAt))
		.limit(1000)
		.all();
	return buildSuggestions(rows);
}

