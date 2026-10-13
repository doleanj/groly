import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authGuard } from '$lib/auth/middleware';
import { db } from '$lib/db';
import { deleteHealthEvent, parseHealthEventInput, updateHealthEvent } from '$lib/server/healthEvents';

export const PUT: RequestHandler = async (event) => {
	const { error } = authGuard(event);
	if (error) return error;

	const parsed = parseHealthEventInput(await event.request.json().catch(() => null));
	if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });
	if (!updateHealthEvent(db, event.params.id, parsed.value)) return json({ error: 'Not found' }, { status: 404 });
	return json({ ok: true });
};

export const DELETE: RequestHandler = async (event) => {
	const { error } = authGuard(event);
	if (error) return error;

	if (!deleteHealthEvent(db, event.params.id)) return json({ error: 'Not found' }, { status: 404 });
	return json({ ok: true });
};
