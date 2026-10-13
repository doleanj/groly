import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authGuard } from '$lib/auth/middleware';
import { db } from '$lib/db';
import { randomUUID } from 'crypto';
import { allSuggestions, insertHealthEvent, listHealthEvents, parseHealthEventInput } from '$lib/server/healthEvents';

const numberParam = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// Shared household log: every authenticated user reads and writes the same events.
export const GET: RequestHandler = async (event) => {
	const { error } = authGuard(event);
	if (error) return error;

	const q = event.url.searchParams;
	const events = listHealthEvents(db, {
		subject: q.get('subject'),
		from: numberParam(q.get('from')),
		to: numberParam(q.get('to')),
		limit: numberParam(q.get('limit')) ?? undefined
	});
	return json({ events, suggestions: allSuggestions(db) });
};

export const POST: RequestHandler = async (event) => {
	const { error, user } = authGuard(event);
	if (error) return error;

	const parsed = parseHealthEventInput(await event.request.json().catch(() => null));
	if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });

	const { id, deduped } = insertHealthEvent(db, parsed.value, user!.id, randomUUID());
	return json({ id, deduped }, { status: deduped ? 200 : 201 });
};
