import { describe, expect, it, vi } from 'vitest';
import { buildChatRequest, sendChatEvent, type ChatEvent } from '$lib/server/chatNotify';

const cfg = { url: 'http://nashome:8283/', client: 'groly-app', secret: 's3cret' };
const added: ChatEvent = {
	type: 'items_added',
	listId: 'l1',
	listName: 'Carrefour',
	locationName: 'Centre Commercial',
	items: [{ name: 'Milk', username: 'julien' }],
	link: '/listen/l1'
};

describe('chat notify', () => {
	it('builds an authenticated POST to /message/groly without a double slash', () => {
		const { url, init } = buildChatRequest(cfg, added);
		expect(url).toBe('http://nashome:8283/message/groly');
		expect(init.method).toBe('POST');
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Basic ${Buffer.from('groly-app:s3cret').toString('base64')}`);
		expect(JSON.parse(init.body as string)).toEqual(added);
	});

	it('does nothing when not configured', async () => {
		const f = vi.fn();
		expect(await sendChatEvent(null, added, f as unknown as typeof fetch)).toBe(false);
		expect(f).not.toHaveBeenCalled();
	});

	it('returns true on 2xx and false on an HTTP error, without throwing', async () => {
		const ok = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		const bad = vi.fn().mockResolvedValue({ ok: false, status: 403 });
		expect(await sendChatEvent(cfg, added, ok as unknown as typeof fetch)).toBe(true);
		expect(await sendChatEvent(cfg, added, bad as unknown as typeof fetch)).toBe(false);
	});

	it('swallows network errors', async () => {
		const boom = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
		expect(await sendChatEvent(cfg, added, boom as unknown as typeof fetch)).toBe(false);
	});
});
