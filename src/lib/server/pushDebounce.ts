import { sendPushToListMembers } from './pushNotifications';
import { postChatEvent } from './chatEvents';

type PendingPush = {
	timer: ReturnType<typeof setTimeout>;
	items: Array<{ name: string; username: string }>;
	adderUserIds: Set<string>;
	listName: string;
	locationName: string | null;
	url: string;
};

const pending = new Map<string, PendingPush>();

const DEBOUNCE_MS = 8000;

export function schedulePushForItemAdded(params: {
	listId: string;
	listName: string;
	locationName?: string | null;
	itemName: string;
	adderUserId: string;
	adderUsername: string;
	url: string;
}) {
	const { listId, listName, itemName, adderUserId, adderUsername, url } = params;
	const locationName = params.locationName ?? null;
	const existing = pending.get(listId);

	if (existing) {
		clearTimeout(existing.timer);
		existing.items.push({ name: itemName, username: adderUsername });
		existing.adderUserIds.add(adderUserId);
		existing.timer = setTimeout(() => void firePush(listId), DEBOUNCE_MS);
	} else {
		pending.set(listId, {
			timer: setTimeout(() => void firePush(listId), DEBOUNCE_MS),
			items: [{ name: itemName, username: adderUsername }],
			adderUserIds: new Set([adderUserId]),
			listName,
			locationName,
			url
		});
	}
}

async function firePush(listId: string) {
	const data = pending.get(listId);
	if (!data) return;
	pending.delete(listId);

	const { items, adderUserIds, listName, locationName, url } = data;

	postChatEvent({ type: 'items_added', listId, listName, locationName, items, link: url });
	const adders = [...adderUserIds];

	let title: string;
	let excludeUserId: string;

	if (items.length === 1) {
		title = `Groly – ${items[0].username}`;
		excludeUserId = adders[0];
	} else {
		const uniqueUsers = [...new Set(items.map((i) => i.username))];
		title = uniqueUsers.length === 1 ? `Groly – ${uniqueUsers[0]}` : 'Groly';
		excludeUserId = adders.length === 1 ? adders[0] : '';
	}

	await sendPushToListMembers(listId, excludeUserId, (lang) => {
		const body = items.length === 1
			? lang === 'en'
				? `${items[0].name} added to ${listName}`
				: `${items[0].name} zur Liste ${listName} hinzugefügt`
			: lang === 'en'
				? `${items.length} new items added to ${listName}`
				: `${items.length} neue Artikel zur Liste ${listName} hinzugefügt`;
		return { title, body, url };
	});
}
