// Posts shopping events to the Synology Chat bridge (synology-chat-webhook): POST <url>/message/groly with Basic auth.
// Pure part (no $env import) so it can be unit tested; chatEvents.ts wires it to the environment.

export type ChatConfig = { url: string; client: string; secret: string; origin?: string };

export type ChatEvent =
	| {
			type: 'items_added';
			listId: string;
			listName: string;
			locationName: string | null;
			items: Array<{ name: string; username: string }>;
			link: string;
	  }
	| {
			type: 'list_complete';
			listId: string;
			listName: string;
			locationName: string | null;
			byUsername: string;
			itemCount: number;
			link: string;
	  };

export const CHAT_CONTROLLER = 'groly';
const TIMEOUT_MS = 5000;

export function buildChatRequest(cfg: ChatConfig, event: ChatEvent): { url: string; init: RequestInit } {
	const auth = Buffer.from(`${cfg.client}:${cfg.secret}`).toString('base64');
	// eventType selects the bridge template (template.groly.<eventType>.md); the link is made absolute so it is clickable in Chat.
	const link = cfg.origin ? `${cfg.origin.replace(/\/+$/, '')}${event.link}` : event.link;
	const payload = { ...event, eventType: event.type, link };
	return {
		url: `${cfg.url.replace(/\/+$/, '')}/message/${CHAT_CONTROLLER}`,
		init: {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
			body: JSON.stringify(payload)
		}
	};
}

/** Never throws: a Chat outage must not break adding or checking items. Returns true when the bridge accepted the event. */
export async function sendChatEvent(
	cfg: ChatConfig | null,
	event: ChatEvent,
	fetchImpl: typeof fetch = fetch
): Promise<boolean> {
	if (!cfg) return false;
	const { url, init } = buildChatRequest(cfg, event);
	try {
		const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) console.warn(`[groly:chat] bridge answered HTTP ${res.status} for ${event.type}`);
		return res.ok;
	} catch (err) {
		console.warn(`[groly:chat] could not reach the bridge for ${event.type}: ${err instanceof Error ? err.message : err}`);
		return false;
	}
}
